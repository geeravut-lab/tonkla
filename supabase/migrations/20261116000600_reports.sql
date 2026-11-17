-- M1.4: problem reports with owner, visible status, response deadline; automation rules and the tick.

-- ============================================================ structured notifications (rendered in the reader's language)
alter table public.notifications add column params jsonb not null default '{}'::jsonb;
drop function app.notify(uuid, text, text, text, text, text);
create function app.notify(p_user uuid, p_kind text, p_title text, p_body text, p_href text, p_dedupe text, p_params jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, title, body, href, dedupe_key, params)
  values (p_user, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_href, p_dedupe, coalesce(p_params, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
exception when others then
  raise warning 'notify failed: %', sqlerrm;
end;
$$;
revoke all on function app.notify(uuid, text, text, text, text, text, jsonb) from public;

-- ============================================================ automation rules (switches + numbers; conditions live in code)
create table public.automation_rules (
  key text primary key check (key ~ '^[a-z_]{3,50}$'),
  enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  last_run_at timestamptz, last_count int
);
create table public.cron_ticks (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(), summary jsonb not null default '{}'::jsonb, duration_ms int
);
alter table public.automation_rules enable row level security;
alter table public.cron_ticks enable row level security;
grant select on public.automation_rules, public.cron_ticks to authenticated;
create policy rules_read on public.automation_rules for select to authenticated using (app.is_platform_admin());
create policy ticks_read on public.cron_ticks for select to authenticated using (app.is_platform_admin());
-- seed with defaults; a deploy never overwrites what an admin tuned
insert into public.automation_rules (key, params) values
  ('report_due_soon', '{"hours": 12}'), ('report_escalate_coordinator', '{"hours": 0}'),
  ('report_escalate_central', '{"hours": 24}'), ('ack_reminder', '{"hours": 24}')
on conflict (key) do nothing;
create function app.rule_enabled(p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select r.enabled from public.automation_rules r where r.key = p_key), true);
$$;
create function app.rule_hours(p_key text, p_default numeric) returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select (r.params ->> 'hours')::numeric from public.automation_rules r where r.key = p_key), p_default);
$$;
create function public.admin_set_rule(p_key text, p_enabled boolean, p_hours numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_hours is null or p_hours < 0 or p_hours > 10000 then raise exception 'err_invalid_input'; end if;
  update public.automation_rules set enabled = p_enabled, params = jsonb_build_object('hours', p_hours) where key = p_key; -- only existing rules, only the known parameter
  if not found then raise exception 'err_not_found'; end if;
end;
$$;
revoke all on function public.admin_set_rule(text, boolean, numeric) from public;
grant execute on function public.admin_set_rule(text, boolean, numeric) to authenticated;
revoke all on function app.rule_enabled(text), app.rule_hours(text, numeric) from public;

-- ============================================================ categories + routing
create table public.report_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name_th text not null, name_en text not null default '',
  default_severity text not null default 'medium' check (default_severity in ('low','medium','high','critical')),
  active boolean not null default true,
  unique (company_id, key)
);
create table public.routing_rules (
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid not null references public.report_categories(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id),
  sla_hours int check (sla_hours between 1 and 720),
  primary key (company_id, category_id)
);
alter table public.report_categories enable row level security;
alter table public.routing_rules enable row level security;
grant select on public.report_categories to authenticated;
create policy categories_read on public.report_categories for select to authenticated
  using (company_id = any (app.my_company_ids()) or app.is_coordinator(company_id));
grant select on public.routing_rules to authenticated;
create policy routing_read on public.routing_rules for select to authenticated using (app.is_coordinator(company_id));

create function public.set_routing(p_company uuid, p_category uuid, p_owner uuid, p_sla int default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_coordinator(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.report_categories c where c.id = p_category and c.company_id = p_company) then raise exception 'err_not_found'; end if;
  if p_owner is not null and not exists (select 1 from public.memberships m where m.user_id = p_owner and m.company_id = p_company and m.status = 'active') then raise exception 'err_not_member'; end if;
  if p_owner is null then delete from public.routing_rules where company_id = p_company and category_id = p_category;
  else insert into public.routing_rules (company_id, category_id, owner_user_id, sla_hours) values (p_company, p_category, p_owner, p_sla)
    on conflict (company_id, category_id) do update set owner_user_id = excluded.owner_user_id, sla_hours = excluded.sla_hours; end if;
end;
$$;
create function public.set_category_active(p_category uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c uuid;
begin
  select company_id into c from public.report_categories where id = p_category;
  if c is null or not app.is_coordinator(c) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.report_categories set active = p_active where id = p_category;
end;
$$;
revoke all on function public.set_routing(uuid, uuid, uuid, int), public.set_category_active(uuid, boolean) from public;
grant execute on function public.set_routing(uuid, uuid, uuid, int), public.set_category_active(uuid, boolean) to authenticated;

-- a company created from a template receives the template's categories (replaces the M1.2 version)
create or replace function public.admin_create_company(p_code text, p_name_th text, p_name_en text, p_bu uuid, p_template uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; sla int := 48; cfg jsonb; cat jsonb;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_code !~ '^[a-z0-9-]{2,32}$' or length(trim(coalesce(p_name_th, ''))) < 1 then raise exception 'err_invalid_input'; end if;
  if p_template is not null then
    select config into cfg from public.company_templates where id = p_template;
    if cfg is null then raise exception 'err_not_found'; end if;
    sla := coalesce((cfg ->> 'response_sla_hours')::int, 48);
  end if;
  insert into public.companies (code, name_th, name_en, business_unit_id, template_id, response_sla_hours)
  values (p_code, left(trim(p_name_th), 160), left(trim(coalesce(p_name_en, '')), 160), p_bu, p_template, sla) returning id into v;
  if cfg is not null then
    for cat in select * from jsonb_array_elements(coalesce(cfg -> 'report_categories', '[]'::jsonb)) loop
      insert into public.report_categories (company_id, key, name_th, name_en, default_severity)
      values (v, cat ->> 'key', cat ->> 'th', coalesce(cat ->> 'en', ''), coalesce(cat ->> 'severity', 'medium'));
    end loop;
  end if;
  return v;
end;
$$;

-- ============================================================ reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  department_id uuid references public.departments(id) on delete set null,
  submitter_id uuid not null references public.profiles(id),
  category_id uuid references public.report_categories(id),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  title text not null check (length(title) between 3 and 200),
  description text not null default '' check (length(description) <= 5000),
  impact text not null default '' check (length(impact) <= 2000),
  proposed_fix text not null default '' check (length(proposed_fix) <= 3000),
  status text not null default 'submitted' check (status in ('submitted','acknowledged','in_progress','resolved','closed','declined','merged')),
  owner_id uuid not null references public.profiles(id),
  respond_by timestamptz not null,
  first_response_at timestamptz,
  quick_fix boolean not null default false, quick_fix_approved_by uuid,
  visibility text not null default 'company' check (visibility in ('company','group')),
  shared_by uuid, shared_at timestamptz,
  merged_into_id uuid references public.reports(id),
  escalation_level int not null default 0 check (escalation_level between 0 and 2),
  resolution_note text not null default '' check (length(resolution_note) <= 3000),
  closed_at timestamptz,
  metoo_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger reports_touch before update on public.reports for each row execute function app.set_updated_at();
create index reports_company_idx on public.reports (company_id, status, respond_by);
create index reports_submitter_idx on public.reports (submitter_id, created_at desc);
create index reports_owner_idx on public.reports (owner_id, status);

create table public.report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  actor_id uuid, type text not null check (type ~ '^[a-z_]{3,30}$'),
  from_status text, to_status text, note text not null default '' check (length(note) <= 3000),
  created_at timestamptz not null default now()
);
create index report_events_idx on public.report_events (report_id, id);
create table public.report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  storage_path text not null, mime text not null, bytes int not null check (bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create table public.report_metoo (
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create table public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index report_comments_idx on public.report_comments (report_id, created_at);
alter table public.reports enable row level security;
alter table public.report_events enable row level security;
alter table public.report_attachments enable row level security;
alter table public.report_metoo enable row level security;
alter table public.report_comments enable row level security;

-- who may see a report: the submitter, the owner, the submitter's supervisor, the company coordinator, central, people who said "me too"
create function app.can_see_report(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (
    select 1 from public.reports r where r.id = p_id and (
      r.submitter_id = auth.uid() or r.owner_id = auth.uid() or app.is_coordinator(r.company_id) or app.is_supervisor_of(r.submitter_id)
      or exists (select 1 from public.report_metoo m where m.report_id = r.id and m.user_id = auth.uid())));
$$;
revoke all on function app.can_see_report(uuid) from public;
grant execute on function app.can_see_report(uuid) to authenticated;

grant select on public.reports to authenticated;
create policy reports_read on public.reports for select to authenticated
  using (submitter_id = auth.uid() or owner_id = auth.uid() or app.can_see_report(id)); -- columns checked directly: INSERT..RETURNING and speed
grant select on public.report_events, public.report_attachments, public.report_metoo, public.report_comments to authenticated;
create policy events_read on public.report_events for select to authenticated using (app.can_see_report(report_id));
create policy attachments_read on public.report_attachments for select to authenticated using (app.can_see_report(report_id));
create policy metoo_read on public.report_metoo for select to authenticated using (user_id = auth.uid() or app.can_see_report(report_id));
grant insert on public.report_comments to authenticated;
create policy report_comments_read on public.report_comments for select to authenticated using (app.can_see_report(report_id));
create policy report_comments_insert on public.report_comments for insert to authenticated
  with check (author_id = auth.uid() and app.can_see_report(report_id));

-- group-wide view of reports a coordinator has opened up: no submitter, no owner
create view public.group_reports with (security_barrier = true) as
  select r.id, r.company_id, c.name_th as company_name, r.category_id, r.severity, r.title, r.description, r.impact, r.proposed_fix, r.status, r.metoo_count, r.shared_at
  from public.reports r join public.companies c on c.id = r.company_id
  where r.visibility = 'group' and r.status <> 'merged' and app.is_active();
grant select on public.group_reports to authenticated;

-- ============================================================ triggers
create function app.report_ping() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.live_ping('u:' || new.submitter_id::text);
  perform app.live_ping('u:' || new.owner_id::text);
  perform app.live_ping('co:' || new.company_id::text);
  perform app.live_ping('r:' || new.id::text);
  return null;
end;
$$;
create trigger reports_live after insert or update on public.reports for each row execute function app.report_ping();
create function app.report_child_ping() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.live_ping('r:' || new.report_id::text);
  return null;
end;
$$;
create trigger report_events_live after insert on public.report_events for each row execute function app.report_child_ping();
create trigger report_comments_live after insert on public.report_comments for each row execute function app.report_child_ping();
create function app.metoo_count() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.reports set metoo_count = (select count(*) from public.report_metoo where report_id = coalesce(new.report_id, old.report_id)) where id = coalesce(new.report_id, old.report_id);
  return null;
end;
$$;
create trigger report_metoo_count after insert or delete on public.report_metoo for each row execute function app.metoo_count();
create trigger audit_reports after update on public.reports
  for each row when (old.status is distinct from new.status or old.owner_id is distinct from new.owner_id or old.visibility is distinct from new.visibility)
  execute function app.audit_row_change('status,owner_id,visibility,severity', 'id');

-- extend the live listening rules with report threads
create or replace function app.live_may_hear(p_topic text) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_topic = 'u:' || coalesce(auth.uid()::text, '') then return true; end if;
  if p_topic = 'central' then return app.is_central(); end if;
  if p_topic = 'adm' then return app.is_platform_admin(); end if;
  if p_topic like 'co:%' then return app.is_coordinator(substr(p_topic, 4)::uuid); end if;
  if p_topic like 'a:%' then return app.can_see_announcement(substr(p_topic, 3)::uuid); end if;
  if p_topic like 'r:%' then return app.can_see_report(substr(p_topic, 3)::uuid); end if;
  return false;
exception when others then
  return false;
end;
$$;

-- ============================================================ helpers for RPCs
/** Owner for a new report: routing rule, else a coordinator of the company, else central team. Never null: a report always has an owner. */
create function app.pick_owner(p_company uuid, p_category uuid) returns uuid language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  select rr.owner_user_id into u from public.routing_rules rr join public.memberships m on m.user_id = rr.owner_user_id and m.company_id = p_company and m.status = 'active'
    where rr.company_id = p_company and rr.category_id = p_category;
  if u is null then select x into u from app.company_coordinator_ids(p_company) x order by x limit 1; end if;
  if u is null then
    select r.user_id into u from public.role_assignments r join public.profiles p on p.id = r.user_id and p.status = 'active'
      where r.role in ('central_team','group_owner') and r.scope_type = 'group' order by r.granted_at limit 1;
  end if;
  if u is null then raise exception 'err_no_owner'; end if;
  return u;
end;
$$;
revoke all on function app.pick_owner(uuid, uuid) from public;

create function app.add_report_event(p_report uuid, p_type text, p_from text, p_to text, p_note text) returns void
language sql security definer set search_path = '' as $$
  insert into public.report_events (report_id, actor_id, type, from_status, to_status, note) values (p_report, auth.uid(), p_type, p_from, p_to, coalesce(p_note, ''));
$$;
revoke all on function app.add_report_event(uuid, text, text, text, text) from public;

-- ============================================================ RPCs
create function public.submit_report(p_id uuid, p_company uuid, p_category uuid, p_severity text, p_title text, p_description text, p_impact text, p_fix text, p_attachments jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner uuid; sla int; dept uuid; sev text := p_severity; a jsonb; mem public.memberships; coord uuid;
begin
  if not app.is_active() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  select * into mem from public.memberships m where m.user_id = auth.uid() and m.company_id = p_company and m.status = 'active';
  if not found then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_category is not null and not exists (select 1 from public.report_categories c where c.id = p_category and c.company_id = p_company and c.active) then raise exception 'err_invalid_input'; end if;
  if sev not in ('low','medium','high','critical') then raise exception 'err_invalid_input'; end if;
  owner := app.pick_owner(p_company, p_category);
  select coalesce((select rr.sla_hours from public.routing_rules rr where rr.company_id = p_company and rr.category_id = p_category), (select c.response_sla_hours from public.companies c where c.id = p_company)) into sla;
  insert into public.reports (id, company_id, department_id, submitter_id, category_id, severity, title, description, impact, proposed_fix, owner_id, respond_by)
  values (coalesce(p_id, gen_random_uuid()), p_company, mem.department_id, auth.uid(), p_category, sev, trim(p_title), trim(coalesce(p_description, '')), trim(coalesce(p_impact, '')), trim(coalesce(p_fix, '')), owner, now() + make_interval(hours => sla))
  returning id into p_id;
  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    if (a ->> 'path') like p_company::text || '/' || p_id::text || '/%' then
      insert into public.report_attachments (report_id, storage_path, mime, bytes) values (p_id, a ->> 'path', coalesce(a ->> 'mime', 'application/octet-stream'), greatest(1, least((a ->> 'bytes')::int, 10485760)));
    end if;
  end loop;
  perform app.add_report_event(p_id, 'submitted', null, 'submitted', '');
  perform app.notify(owner, 'report_assigned', trim(p_title), '', '/reports/' || p_id::text, 'rep_new:' || p_id::text || ':' || owner::text, jsonb_build_object('severity', sev));
  for coord in select app.company_coordinator_ids(p_company) loop
    if coord <> owner then perform app.notify(coord, 'report_new', trim(p_title), '', '/reports/' || p_id::text, 'rep_new:' || p_id::text || ':' || coord::text, jsonb_build_object('severity', sev)); end if;
  end loop;
  return p_id;
end;
$$;

create function public.report_transition(p_id uuid, p_to text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports; ok boolean; allowed boolean; u uuid;
begin
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  ok := app.is_active() and (r.owner_id = auth.uid() or app.is_coordinator(r.company_id));
  if not ok then raise exception 'err_forbidden' using errcode = '42501'; end if;
  allowed := case r.status
    when 'submitted' then p_to in ('acknowledged','in_progress','resolved','declined')
    when 'acknowledged' then p_to in ('in_progress','resolved','declined')
    when 'in_progress' then p_to in ('resolved','declined')
    when 'resolved' then p_to in ('closed','in_progress')
    else false end;
  if not allowed then raise exception 'err_invalid_input'; end if;
  if p_to in ('declined','resolved','closed') and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'err_note_required'; end if; -- every report is answered, a "no" needs a reason
  update public.reports set status = p_to, first_response_at = coalesce(first_response_at, now()),
    resolution_note = case when p_to in ('declined','resolved','closed') then left(trim(p_note), 3000) else resolution_note end,
    closed_at = case when p_to in ('closed','declined') then now() else null end
  where id = p_id;
  perform app.add_report_event(p_id, 'status', r.status, p_to, p_note);
  for u in select r.submitter_id union select user_id from public.report_metoo where report_id = p_id loop
    if u <> auth.uid() then perform app.notify(u, 'report_status', r.title, '', '/reports/' || p_id::text, 'rep_st:' || p_id::text || ':' || p_to || ':' || u::text, jsonb_build_object('status', p_to)); end if;
  end loop;
end;
$$;

-- small matters end at the supervisor: a low/medium report can be answered and closed by the submitter's own supervisor
create function public.report_quick_fix(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not (app.is_active() and app.is_supervisor_of(r.submitter_id)) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if r.severity not in ('low','medium') or r.status not in ('submitted','acknowledged','in_progress') then raise exception 'err_invalid_input'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'err_note_required'; end if;
  update public.reports set status = 'closed', quick_fix = true, quick_fix_approved_by = auth.uid(), first_response_at = coalesce(first_response_at, now()), resolution_note = left(trim(p_note), 3000), closed_at = now() where id = p_id;
  perform app.add_report_event(p_id, 'quick_fix', r.status, 'closed', p_note);
  if r.submitter_id <> auth.uid() then perform app.notify(r.submitter_id, 'report_status', r.title, '', '/reports/' || p_id::text, 'rep_st:' || p_id::text || ':closed:' || r.submitter_id::text, jsonb_build_object('status', 'closed')); end if;
end;
$$;

create function public.report_assign(p_id uuid, p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.is_coordinator(r.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships m where m.user_id = p_owner and m.company_id = r.company_id and m.status = 'active') then raise exception 'err_not_member'; end if;
  update public.reports set owner_id = p_owner where id = p_id;
  perform app.add_report_event(p_id, 'assigned', null, null, '');
  if p_owner <> auth.uid() then perform app.notify(p_owner, 'report_assigned', r.title, '', '/reports/' || p_id::text, 'rep_as:' || p_id::text || ':' || p_owner::text, jsonb_build_object('severity', r.severity)); end if;
end;
$$;

create function public.report_set_visibility(p_id uuid, p_visibility text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.is_coordinator(r.company_id) or p_visibility not in ('company','group') then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.reports set visibility = p_visibility, shared_by = case when p_visibility = 'group' then auth.uid() end, shared_at = case when p_visibility = 'group' then now() end where id = p_id;
  perform app.add_report_event(p_id, 'visibility', r.visibility, p_visibility, '');
end;
$$;

create function public.report_merge(p_dup uuid, p_into uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.reports; t public.reports;
begin
  select * into d from public.reports where id = p_dup for update;
  select * into t from public.reports where id = p_into for update;
  if d.id is null or t.id is null or p_dup = p_into then raise exception 'err_not_found'; end if;
  if d.company_id <> t.company_id or not app.is_coordinator(d.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if d.status in ('merged','closed','declined') or t.status in ('merged') then raise exception 'err_invalid_input'; end if;
  update public.reports set status = 'merged', merged_into_id = p_into, first_response_at = coalesce(first_response_at, now()), closed_at = now(), resolution_note = 'merged' where id = p_dup;
  insert into public.report_metoo (report_id, user_id) select p_into, d.submitter_id where d.submitter_id <> t.submitter_id on conflict do nothing;
  insert into public.report_metoo (report_id, user_id) select p_into, m.user_id from public.report_metoo m where m.report_id = p_dup and m.user_id <> t.submitter_id on conflict do nothing;
  perform app.add_report_event(p_dup, 'merged', d.status, 'merged', '');
  perform app.add_report_event(p_into, 'merged_in', null, null, '');
  perform app.notify(d.submitter_id, 'report_status', d.title, '', '/reports/' || p_into::text, 'rep_st:' || p_dup::text || ':merged:' || d.submitter_id::text, jsonb_build_object('status', 'merged'));
end;
$$;

create function public.report_metoo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_id;
  if not found or not app.is_active() or r.submitter_id = auth.uid() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if not (r.company_id = any (app.my_company_ids())) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if r.status in ('closed','declined','merged') then raise exception 'err_invalid_input'; end if;
  insert into public.report_metoo (report_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end;
$$;

-- title + status of similar open reports in the caller's own company (no names): lets people press "me too" instead of filing a duplicate
create function public.similar_reports(p_company uuid, p_terms text[]) returns table (id uuid, title text, status text, metoo_count int, hits int)
language sql stable security definer set search_path = '' as $$
  select r.id, r.title, r.status, r.metoo_count,
         (select count(*)::int from unnest(p_terms) t where length(t) >= 2 and lower(r.title) like '%' || lower(t) || '%') as hits
  from public.reports r
  where r.company_id = p_company and p_company = any (app.my_company_ids()) and r.status not in ('closed','declined','merged')
    and r.submitter_id <> auth.uid()
  order by hits desc, r.created_at desc limit 5;
$$;

create function public.report_comment_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.reports; u uuid;
begin
  select * into r from public.reports where id = new.report_id;
  for u in select r.submitter_id union select r.owner_id loop
    if u <> new.author_id then perform app.notify(u, 'report_comment', r.title, '', '/reports/' || r.id::text, 'rep_cm:' || new.id::text || ':' || u::text, '{}'::jsonb); end if;
  end loop;
  return null;
end;
$$;
create trigger report_comments_notify after insert on public.report_comments for each row execute function public.report_comment_notify();

revoke all on function public.submit_report(uuid, uuid, uuid, text, text, text, text, text, jsonb), public.report_transition(uuid, text, text),
  public.report_quick_fix(uuid, text), public.report_assign(uuid, uuid), public.report_set_visibility(uuid, text), public.report_merge(uuid, uuid),
  public.report_metoo(uuid), public.similar_reports(uuid, text[]), public.report_comment_notify() from public;
grant execute on function public.submit_report(uuid, uuid, uuid, text, text, text, text, text, jsonb), public.report_transition(uuid, text, text),
  public.report_quick_fix(uuid, text), public.report_assign(uuid, uuid), public.report_set_visibility(uuid, text), public.report_merge(uuid, uuid),
  public.report_metoo(uuid), public.similar_reports(uuid, text[]) to authenticated;

-- ============================================================ the tick (idempotent: every notice has a dedupe key)
create function public.run_tick() returns jsonb language plpgsql security definer set search_path = '' as $$
declare t0 timestamptz := clock_timestamp(); r record; u uuid; n_due int := 0; n_o1 int := 0; n_o2 int := 0; n_ack int := 0; hrs numeric;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') and not (select rolbypassrls from pg_roles where rolname = current_user) then
    raise exception 'err_forbidden' using errcode = '42501';
  end if;
  -- 1) deadline close
  if app.rule_enabled('report_due_soon') then
    hrs := app.rule_hours('report_due_soon', 12);
    for r in select id, owner_id, title, respond_by from public.reports where first_response_at is null and status = 'submitted' and respond_by > now() and respond_by <= now() + make_interval(secs => hrs * 3600) loop
      perform app.notify(r.owner_id, 'report_due', r.title, '', '/reports/' || r.id::text, 'rep_due:' || r.id::text, jsonb_build_object('hours', greatest(1, ceil(extract(epoch from (r.respond_by - now())) / 3600))::int));
      n_due := n_due + 1;
    end loop;
  end if;
  -- 2) overdue: coordinators and owner are told, once
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
  -- 3) still unanswered: the central team follows up
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
  -- 4) must-read announcements nearing their acknowledgement deadline
  if app.rule_enabled('ack_reminder') then
    hrs := app.rule_hours('ack_reminder', 24);
    for r in select a.id as aid, a.title, x.user_id from public.announcements a join public.announcement_receipts x on x.announcement_id = a.id
      where a.status = 'published' and a.requires_ack and x.acked_at is null and a.ack_due_at is not null and a.ack_due_at <= now() + make_interval(secs => hrs * 3600) loop
      perform app.notify(r.user_id, 'ack_reminder', r.title, '', '/news/' || r.aid::text, 'ackrem:' || r.aid::text || ':' || r.user_id::text, '{}'::jsonb);
      n_ack := n_ack + 1;
    end loop;
  end if;
  update public.automation_rules set last_run_at = now(), last_count = case key when 'report_due_soon' then n_due when 'report_escalate_coordinator' then n_o1 when 'report_escalate_central' then n_o2 when 'ack_reminder' then n_ack end;
  insert into public.cron_ticks (summary, duration_ms) values (jsonb_build_object('due', n_due, 'overdue', n_o1, 'central', n_o2, 'ack', n_ack), (extract(epoch from clock_timestamp() - t0) * 1000)::int);
  return jsonb_build_object('due', n_due, 'overdue', n_o1, 'central', n_o2, 'ack', n_ack);
end;
$$;
revoke all on function public.run_tick() from public, anon, authenticated;
grant execute on function public.run_tick() to service_role;

-- ============================================================ storage for photos/files (private; first folder = company, second = report)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('report-files', 'report-files', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
    on conflict (id) do nothing;
  end if;
  if to_regclass('storage.objects') is not null then
    execute $p$ create policy report_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'report-files' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and ((storage.foldername(name))[1])::uuid = any (app.my_company_ids())) $p$;
    execute $p$ create policy report_files_read on storage.objects for select to authenticated
      using (bucket_id = 'report-files' and (owner_id = auth.uid()::text or ((storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$' and app.can_see_report(((storage.foldername(name))[2])::uuid)))) $p$;
  end if;
end $$;

-- ============================================================ scheduling: the rules run every 10 minutes inside the database
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: %', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    begin
      perform cron.unschedule('tonkla-tick');
    exception when others then null;
    end;
    perform cron.schedule('tonkla-tick', '*/10 * * * *', 'select public.run_tick()');
  end if;
end $$;

-- earlier notices carried Thai text in `body`; they now carry only a kind + params and are rendered in the reader's language
create or replace function public.publish_announcement(p_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare a public.announcements; n int; r record;
begin
  select * into a from public.announcements where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.can_manage_announcement(p_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if a.status <> 'draft' then raise exception 'err_invalid_input'; end if;
  if a.company_id is null and not app.is_central() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.announcements set status = 'published', publish_at = coalesce(publish_at, now()) where id = p_id;
  insert into public.announcement_receipts (announcement_id, user_id)
  select p_id, x.user_id from app.announcement_recipients(p_id) x on conflict do nothing;
  get diagnostics n = row_count;
  for r in select user_id from public.announcement_receipts where announcement_id = p_id and user_id <> a.author_id loop
    perform app.notify(r.user_id, case when a.requires_ack then 'must_read' else 'announcement' end, a.title, '', '/news/' || p_id::text, 'ann:' || p_id::text);
  end loop;
  return n;
end;
$$;
create or replace function app.join_request_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid; who text;
begin
  select coalesce(nullif(display_name, ''), '?') into who from public.profiles where id = new.user_id;
  if new.status = 'pending' then
    for cid in select app.company_coordinator_ids(new.company_id) loop
      perform app.notify(cid, 'join_request', who, '', '/desk?company=' || new.company_id::text, 'join:' || new.id::text);
    end loop;
  end if;
  perform app.live_ping('co:' || new.company_id::text);
  perform app.live_ping('u:' || new.user_id::text);
  return null;
end;
$$;
