-- the HTTP route calls run_tick through PostgREST, which refuses an UPDATE without WHERE (pg_cron was never affected).
-- Only change: the automation_rules update now says 'where true'.
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
      where a.status = 'published' and a.requires_ack and x.acked_at is null and a.ack_due_at is not null and a.ack_due_at <= now() + make_interval(secs => hrs * 3600) loop
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
