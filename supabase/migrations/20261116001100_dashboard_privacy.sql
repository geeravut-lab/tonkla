-- M1.7: company dashboard (aggregates only) and PDPA tools (export, deletion request, anonymisation), data retention.

create function public.company_dashboard(p_company uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := least(greatest(p_days, 1), 365); since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 365)); members int; out jsonb;
begin
  -- executives and coordinators of the company (and central) see numbers; nobody gets individual reports from here
  if not (app.is_exec(p_company) or app.is_coordinator(p_company)) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  select count(*) into members from public.memberships where company_id = p_company and status = 'active';
  out := jsonb_build_object(
    'members', members,
    'days', d,
    'reports', jsonb_build_object(
      'open', (select count(*) from public.reports where company_id = p_company and status in ('submitted','acknowledged','in_progress','resolved')),
      'new', (select count(*) from public.reports where company_id = p_company and created_at >= since),
      'overdue', (select count(*) from public.reports where company_id = p_company and first_response_at is null and status = 'submitted' and respond_by < now()),
      'answered', (select count(*) from public.reports where company_id = p_company and created_at >= since and first_response_at is not null),
      'answered_in_time', (select count(*) from public.reports where company_id = p_company and created_at >= since and first_response_at is not null and first_response_at <= respond_by),
      'avg_first_response_hours', (select round(avg(extract(epoch from (first_response_at - created_at)) / 3600)::numeric, 1) from public.reports where company_id = p_company and created_at >= since and first_response_at is not null),
      'closed', (select count(*) from public.reports where company_id = p_company and closed_at >= since and status in ('closed','resolved')),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.reports where company_id = p_company and created_at >= since group by status) s),
      'by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(c.name_th, ''), 'n', x.n) order by x.n desc), '[]'::jsonb)
                      from (select category_id, count(*) n from public.reports where company_id = p_company and created_at >= since group by category_id order by 2 desc limit 6) x left join public.report_categories c on c.id = x.category_id)
    ),
    'ideas', jsonb_build_object(
      'new', (select count(*) from public.ideas where company_id = p_company and created_at >= since),
      'by_stage', (select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (select stage, count(*) n from public.ideas where company_id = p_company group by stage) s),
      'adopted', (select count(*) from public.ideas where company_id = p_company and stage in ('piloting','scaled')),
      'overdue', (select count(*) from public.ideas where company_id = p_company and first_response_at is null and stage = 'submitted' and respond_by < now()),
      'value', (select coalesce(jsonb_object_agg(metric, v), '{}'::jsonb) from (select o.metric, sum(o.value) v from public.idea_outcomes o join public.ideas i on i.id = o.idea_id where i.company_id = p_company and o.verified_by is not null group by o.metric) s)
    ),
    'announcements', jsonb_build_object(
      'published', (select count(*) from public.announcements where company_id = p_company and status = 'published' and publish_at >= since),
      'ack_required', (select count(*) from public.announcement_receipts r join public.announcements a on a.id = r.announcement_id where a.company_id = p_company and a.requires_ack and a.status = 'published'),
      'acked', (select count(*) from public.announcement_receipts r join public.announcements a on a.id = r.announcement_id where a.company_id = p_company and a.requires_ack and a.status = 'published' and r.acked_at is not null),
      'receipts', (select count(*) from public.announcement_receipts r join public.announcements a on a.id = r.announcement_id where a.company_id = p_company and a.status = 'published' and a.publish_at >= since),
      'read', (select count(*) from public.announcement_receipts r join public.announcements a on a.id = r.announcement_id where a.company_id = p_company and a.status = 'published' and a.publish_at >= since and r.read_at is not null)
    ),
    'active_users', (select count(distinct e.user_id) from public.product_events e join public.memberships m on m.user_id = e.user_id and m.company_id = p_company and m.status = 'active' where e.name = 'active' and e.day > (now() at time zone 'Asia/Bangkok')::date - d)
  );
  return out;
end;
$$;
revoke all on function public.company_dashboard(uuid, int) from public;
grant execute on function public.company_dashboard(uuid, int) to authenticated;

-- ============================================================ PDPA
create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('delete','correct')),
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending','done','rejected')),
  decided_by uuid, decided_at timestamptz, created_at timestamptz not null default now()
);
alter table public.privacy_requests enable row level security;
grant select on public.privacy_requests to authenticated;
create policy privacy_read on public.privacy_requests for select to authenticated using (user_id = auth.uid() or app.is_platform_admin());

create function public.request_privacy(p_kind text, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; a uuid;
begin
  if auth.uid() is null then raise exception 'err_unauthorized' using errcode = '42501'; end if;
  if p_kind not in ('delete','correct') then raise exception 'err_invalid_input'; end if;
  if exists (select 1 from public.privacy_requests where user_id = auth.uid() and kind = p_kind and status = 'pending') then raise exception 'err_already_requested'; end if;
  insert into public.privacy_requests (user_id, kind, note) values (auth.uid(), p_kind, left(coalesce(p_note, ''), 1000)) returning id into v;
  for a in select user_id from public.platform_admins loop
    perform app.notify(a, 'privacy_request', coalesce((select display_name from public.profiles where id = auth.uid()), '?'), '', '/admin/privacy', 'priv:' || v::text || ':' || a::text, jsonb_build_object('kind', p_kind));
  end loop;
  return v;
end;
$$;

/** Everything the system holds about the caller, as one document (the right of access). */
create function public.my_data_export() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'must_change_password' from public.profiles p where p.id = auth.uid()),
    'email', (select email from auth.users where id = auth.uid()),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('company_id', m.company_id, 'department_id', m.department_id, 'position_id', m.position_id, 'employee_code', m.employee_code, 'work_email', m.work_email, 'status', m.status, 'started_at', m.started_at, 'ended_at', m.ended_at)) from public.memberships m where m.user_id = auth.uid()), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'scope_type', r.scope_type, 'scope_id', r.scope_id)) from public.role_assignments r where r.user_id = auth.uid()), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'description', r.description, 'impact', r.impact, 'proposed_fix', r.proposed_fix, 'status', r.status, 'created_at', r.created_at)) from public.reports r where r.submitter_id = auth.uid()), '[]'::jsonb),
    'ideas', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'problem', i.problem_or_opportunity, 'benefit', i.expected_benefit, 'stage', i.stage, 'created_at', i.created_at)) from public.ideas i where i.submitter_id = auth.uid()), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('on', 'announcement', 'body', c.body, 'at', c.created_at)) from public.announcement_comments c where c.author_id = auth.uid()), '[]'::jsonb)
       || coalesce((select jsonb_agg(jsonb_build_object('on', 'report', 'body', c.body, 'at', c.created_at)) from public.report_comments c where c.author_id = auth.uid()), '[]'::jsonb)
       || coalesce((select jsonb_agg(jsonb_build_object('on', 'idea', 'body', c.body, 'at', c.created_at)) from public.idea_comments c where c.author_id = auth.uid()), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('kind', k.kind, 'version', k.version, 'accepted_at', k.accepted_at)) from public.consents k where k.user_id = auth.uid()), '[]'::jsonb),
    'notification_channels', coalesce((select jsonb_agg(jsonb_build_object('channel', c.channel, 'status', c.status, 'verified_at', c.verified_at)) from public.notification_channels c where c.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

/**
 * Deletion = anonymisation: reports and ideas are business records and stay, but no longer point to a person.
 * Personal identifiers, links and notices are removed and the account is closed.
 */
create function public.anonymize_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() or p_user = app.owner_user_id() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.profiles set display_name = 'อดีตพนักงาน', avatar_path = null, status = 'suspended' where id = p_user;
  update public.memberships set status = 'ended', ended_at = coalesce(ended_at, now()), work_email = null, employee_code = null where user_id = p_user;
  delete from public.role_assignments where user_id = p_user;
  delete from public.platform_admins where user_id = p_user;
  delete from public.notification_channels where user_id = p_user;
  delete from public.notification_prefs where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.aivora_links where user_id = p_user;
  delete from public.join_requests where user_id = p_user;
  delete from public.roster_entries where claimed_by = p_user;
  delete from public.product_events where user_id = p_user;
  update public.invitations set used_by = null where used_by = p_user;
  update public.privacy_requests set status = 'done', decided_by = auth.uid(), decided_at = now() where user_id = p_user and kind = 'delete' and status = 'pending';
  insert into public.audit_log (source, actor_id, action, entity, entity_id) values ('app', auth.uid(), 'privacy.anonymize', 'profiles', p_user::text);
end;
$$;

create function public.decide_privacy(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_status not in ('done','rejected') then raise exception 'err_invalid_input'; end if;
  update public.privacy_requests set status = p_status, decided_by = auth.uid(), decided_at = now() where id = p_id and status = 'pending';
  if not found then raise exception 'err_no_rows'; end if;
end;
$$;
revoke all on function public.request_privacy(text, text), public.my_data_export(), public.anonymize_user(uuid), public.decide_privacy(uuid, text) from public;
grant execute on function public.request_privacy(text, text), public.my_data_export(), public.anonymize_user(uuid), public.decide_privacy(uuid, text) to authenticated;

-- ============================================================ retention
create function public.prune_old_data() returns jsonb language plpgsql security definer set search_path = '' as $$
declare a int; b int; c int; d int;
begin
  delete from public.message_log where at < now() - interval '90 days'; get diagnostics a = row_count;
  delete from public.line_link_attempts where at < now() - interval '1 day'; get diagnostics b = row_count;
  delete from public.notification_queue where status <> 'pending' and created_at < now() - interval '30 days'; get diagnostics c = row_count;
  delete from public.company_queue where status <> 'pending' and created_at < now() - interval '30 days'; get diagnostics d = row_count;
  delete from public.cron_ticks where at < now() - interval '30 days';
  return jsonb_build_object('message_log', a, 'attempts', b, 'queue', c, 'company_queue', d);
end;
$$;
revoke all on function public.prune_old_data() from public, anon, authenticated;
grant execute on function public.prune_old_data() to service_role;
do $$
begin
  if to_regnamespace('cron') is not null then
    begin
      perform cron.unschedule('tonkla-prune');
    exception when others then null;
    end;
    perform cron.schedule('tonkla-prune', '30 20 * * *', 'select public.prune_old_data()'); -- 03:30 Bangkok
  end if;
end $$;
