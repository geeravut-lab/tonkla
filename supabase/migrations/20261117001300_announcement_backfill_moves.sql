-- Late joiners and people who move department/position now also get older announcements addressed to them
-- (see app.backfill_announcements). Important ones (must-read, executive message, needs-acknowledgement, pinned) are kept even after
-- they expire so a new colleague can still read them; they stay readable in the news list but no longer ask for acknowledgement
-- (home card) or send reminders once expired.

create or replace function app.backfill_announcements(p_user uuid) returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.announcement_receipts (announcement_id, user_id)
  select a.id, p_user
  from public.announcements a
  where a.status = 'published'
    and (a.publish_at is null or a.publish_at <= now())
    and (a.expires_at is null or a.expires_at > now() or a.kind in ('must_read', 'exec_message') or a.requires_ack or a.pinned)
    and exists (select 1 from app.announcement_recipients(a.id) x where x.user_id = p_user)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- moving to another department or position (or being re-activated) gives the person the announcements addressed to the new place
create function app.membership_announcements() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' then perform app.backfill_announcements(new.user_id); end if;
  return new;
end;
$$;
revoke all on function app.membership_announcements() from public;
-- replaces the first version of this trigger (memberships_backfill / app.backfill_receipts), which also ignored department and position moves
drop trigger memberships_backfill on public.memberships;
drop function app.backfill_receipts();
create trigger memberships_announcements after insert or update of department_id, position_id, status on public.memberships
  for each row execute function app.membership_announcements();

-- The real cause of "new member sees no news": the membership row was inserted while the profile was still 'pending', and announcement_recipients
-- only counts active profiles, so the old trigger found nobody. Also backfill the moment the profile becomes active, whatever the order.
create function app.profile_announcements() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then perform app.backfill_announcements(new.id); end if;
  return new;
end;
$$;
revoke all on function app.profile_announcements() from public;
create trigger profiles_announcements after update of status on public.profiles
  for each row execute function app.profile_announcements();

create or replace function public.run_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t0 timestamptz := clock_timestamp(); r record; u uuid; n_due int := 0; n_o1 int := 0; n_o2 int := 0; n_ack int := 0; n_idea int := 0; hrs numeric;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') and not (select rolbypassrls from pg_roles where rolname = current_user) then
    raise exception 'err_forbidden' using errcode = '42501';
  end if;
  if app.rule_enabled('report_due_soon') then
    hrs := app.rule_hours('report_due_soon', 12);
    for r in select id, owner_id, title, respond_by from public.reports where first_response_at is null and status = 'submitted' and respond_by > now() and respond_by <= now() + make_interval(secs => hrs * 3600) loop
      perform app.notify(r.owner_id, 'report_due', r.title, '', '/reports/' || r.id::text, 'rep_due:' || r.id::text, jsonb_build_object('hours', greatest(1, ceil(extract(epoch from (r.respond_by - now())) / 3600))::int));
      n_due := n_due + 1;
    end loop;
  end if;
  if app.rule_enabled('report_escalate_coordinator') then
    hrs := app.rule_hours('report_escalate_coordinator', 0);
    for r in select id, owner_id, company_id, title from public.reports where first_response_at is null and status = 'submitted' and escalation_level = 0 and respond_by + make_interval(secs => hrs * 3600) < now() for update loop
      update public.reports set escalation_level = 1 where id = r.id;
      insert into public.report_events (report_id, actor_id, type, note) values (r.id, null, 'escalated_coordinator', '');
      for u in select r.owner_id union select app.company_coordinator_ids(r.company_id) loop
        perform app.notify(u, 'report_overdue', r.title, '', '/reports/' || r.id::text, 'rep_o1:' || r.id::text || ':' || u::text, '{}'::jsonb);
      end loop;
      n_o1 := n_o1 + 1;
    end loop;
  end if;
  if app.rule_enabled('report_escalate_central') then
    hrs := app.rule_hours('report_escalate_central', 24);
    for r in select id, title, company_id from public.reports where first_response_at is null and status = 'submitted' and escalation_level = 1 and respond_by + make_interval(secs => hrs * 3600) < now() for update loop
      update public.reports set escalation_level = 2 where id = r.id;
      insert into public.report_events (report_id, actor_id, type, note) values (r.id, null, 'escalated_central', '');
      for u in select ra.user_id from public.role_assignments ra join public.profiles p on p.id = ra.user_id and p.status = 'active' where ra.scope_type = 'group' and ra.role in ('central_team','group_owner') loop
        perform app.notify(u, 'report_escalated', r.title, '', '/reports/' || r.id::text, 'rep_o2:' || r.id::text || ':' || u::text, '{}'::jsonb);
      end loop;
      n_o2 := n_o2 + 1;
    end loop;
  end if;
  if app.rule_enabled('idea_escalate_coordinator') then
    hrs := app.rule_hours('idea_escalate_coordinator', 0);
    for r in select id, owner_id, company_id, title from public.ideas where first_response_at is null and stage = 'submitted' and escalation_level = 0 and respond_by + make_interval(secs => hrs * 3600) < now() for update loop
      update public.ideas set escalation_level = 1 where id = r.id;
      insert into public.idea_stage_events (idea_id, actor_id, type) values (r.id, null, 'escalated');
      for u in select r.owner_id union select app.company_coordinator_ids(r.company_id) loop
        perform app.notify(u, 'idea_overdue', r.title, '', '/ideas/' || r.id::text, 'idea_o1:' || r.id::text || ':' || u::text, '{}'::jsonb);
      end loop;
      n_idea := n_idea + 1;
    end loop;
  end if;
  if app.rule_enabled('ack_reminder') then
    hrs := app.rule_hours('ack_reminder', 24);
    for r in select a.id as aid, a.title, x.user_id from public.announcements a join public.announcement_receipts x on x.announcement_id = a.id
      where a.status = 'published' and (a.expires_at is null or a.expires_at > now()) and a.requires_ack and x.acked_at is null and a.ack_due_at is not null and a.ack_due_at <= now() + make_interval(secs => hrs * 3600) loop
      perform app.notify(r.user_id, 'ack_reminder', r.title, '', '/news/' || r.aid::text, 'ackrem:' || r.aid::text || ':' || r.user_id::text, '{}'::jsonb);
      n_ack := n_ack + 1;
    end loop;
  end if;
  update public.automation_rules set last_run_at = now(), last_count = case key when 'report_due_soon' then n_due when 'report_escalate_coordinator' then n_o1 when 'report_escalate_central' then n_o2 when 'ack_reminder' then n_ack when 'idea_escalate_coordinator' then n_idea end where true;
  insert into public.cron_ticks (summary, duration_ms) values (jsonb_build_object('due', n_due, 'overdue', n_o1, 'central', n_o2, 'ack', n_ack, 'ideas', n_idea), (extract(epoch from clock_timestamp() - t0) * 1000)::int);
  return jsonb_build_object('due', n_due, 'overdue', n_o1, 'central', n_o2, 'ack', n_ack, 'ideas', n_idea);
end;
$function$;

revoke all on function public.run_tick() from public, anon, authenticated;
grant execute on function public.run_tick() to service_role;

-- run again for everyone: the rule for what counts as "still worth showing" is wider than the first version
select app.backfill_announcements(m.user_id) from (select distinct user_id from public.memberships where status = 'active') m;
