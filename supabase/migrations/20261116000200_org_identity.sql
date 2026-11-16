-- M1.2: group structure, identity, roles, provisioning, platform admins, audit, analytics.
-- Secure defaults: new tables grant nothing to browser roles; every table lists its grants explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
grant usage on schema app to authenticated;

-- ============================================================ structure
create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  name_th text not null, name_en text not null default '', sort int not null default 0
);
create table public.company_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, config jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units(id),
  code text not null unique check (code ~ '^[a-z0-9-]{2,32}$'),
  name_th text not null, name_en text not null default '',
  status text not null default 'setup' check (status in ('setup','active','paused')),
  response_sla_hours int not null default 48 check (response_sla_hours between 1 and 720),
  template_id uuid references public.company_templates(id),
  is_demo boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger companies_touch before update on public.companies for each row execute function app.set_updated_at();
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid references public.departments(id) on delete set null,
  name_th text not null, name_en text not null default ''
);
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name_th text not null, name_en text not null default ''
);

-- ============================================================ people
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  locale text not null default 'th' check (locale in ('th','en')),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function app.set_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  supervisor_membership_id uuid references public.memberships(id) on delete set null,
  employee_code text, work_email text,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active','ended')),
  started_at timestamptz not null default now(), ended_at timestamptz,
  unique (user_id, company_id)
);
create index memberships_company_idx on public.memberships (company_id) where status = 'active';

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('supervisor','coordinator','company_exec','central_team','group_owner')),
  scope_type text not null check (scope_type in ('group','business_unit','company','department')),
  scope_id uuid,
  granted_by uuid, granted_at timestamptz not null default now(),
  check ((scope_type = 'group') = (scope_id is null))
);
create unique index role_assignments_uq on public.role_assignments (user_id, role, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid, granted_at timestamptz not null default now()
);

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_email text not null check (work_email = lower(work_email)),
  employee_code text, display_name text,
  department_id uuid references public.departments(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  claimed_by uuid references public.profiles(id) on delete set null,
  imported_by uuid, batch_id uuid, created_at timestamptz not null default now(),
  unique (company_id, work_email)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code_hash text not null unique,
  preset jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_by uuid, used_by uuid references public.profiles(id) on delete set null, used_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  note text check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid, decided_at timestamptz, created_at timestamptz not null default now()
);
create unique index join_requests_one_pending on public.join_requests (user_id, company_id) where status = 'pending';

create table public.aivora_links (
  aivora_user_id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.consents (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, version text not null, accepted_at timestamptz not null default now(),
  primary key (user_id, kind, version)
);
create table public.company_features (
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null, enabled boolean not null,
  primary key (company_id, key)
);

-- ============================================================ audit + analytics
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null default 'app' check (source in ('app','db')),
  actor_id uuid, actor_role text,
  action text not null check (length(action) between 3 and 120),
  entity text not null, entity_id text, company_id uuid,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096)
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, at);
create index audit_log_action_idx on public.audit_log (action text_pattern_ops, at);
create table public.audit_purges (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(), actor_id uuid, rows_deleted bigint not null, before_ts timestamptz not null
);
create table public.product_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  day date not null default ((now() at time zone 'Asia/Bangkok')::date),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_.]{1,59}$'),
  tag text check (tag is null or tag ~ '^[a-z0-9_]{1,40}$')
);
create unique index product_events_active_daily on public.product_events (user_id, day) where name = 'active';
create index product_events_day_idx on public.product_events (day, name);

alter table public.business_units enable row level security;
alter table public.company_templates enable row level security;
alter table public.companies enable row level security;
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.role_assignments enable row level security;
alter table public.platform_admins enable row level security;
alter table public.roster_entries enable row level security;
alter table public.invitations enable row level security;
alter table public.join_requests enable row level security;
alter table public.aivora_links enable row level security;
alter table public.consents enable row level security;
alter table public.company_features enable row level security;
alter table public.audit_log enable row level security;
alter table public.audit_purges enable row level security;
alter table public.product_events enable row level security;

-- ============================================================ helper functions (used by policies)
create function app.is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;
create function app.my_company_ids() returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.company_id), '{}') from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active' and app.is_active();
$$;
create function app.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) and app.is_active();
$$;
create function app.is_central() returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.role_assignments r
    where r.user_id = auth.uid() and r.scope_type = 'group' and r.role in ('central_team','group_owner'));
$$;
create function app.is_coordinator(p_company uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_central() or (app.is_active() and exists (
    select 1 from public.role_assignments r
    where r.user_id = auth.uid() and r.role = 'coordinator'
      and ((r.scope_type = 'company' and r.scope_id = p_company)
        or (r.scope_type = 'business_unit' and r.scope_id = (select c.business_unit_id from public.companies c where c.id = p_company)))));
$$;
create function app.is_exec(p_company uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_central() or (app.is_active() and exists (
    select 1 from public.role_assignments r
    where r.user_id = auth.uid() and r.role = 'company_exec' and r.scope_type = 'company' and r.scope_id = p_company));
$$;
create function app.is_supervisor_of(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (
    select 1 from public.memberships sub
      join public.memberships boss on boss.id = sub.supervisor_membership_id
    where sub.user_id = p_user and sub.status = 'active' and boss.user_id = auth.uid() and boss.status = 'active');
$$;
create function app.shares_company(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
    where m.user_id = p_user and m.status = 'active' and m.company_id = any (app.my_company_ids()));
$$;
create function app.coordinates_user(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_central() or exists (select 1 from public.memberships m where m.user_id = p_user and app.is_coordinator(m.company_id))
    or exists (select 1 from public.join_requests j where j.user_id = p_user and j.status = 'pending' and app.is_coordinator(j.company_id));
$$;
revoke all on function app.is_active(), app.my_company_ids(), app.is_platform_admin(), app.is_central(), app.is_coordinator(uuid),
  app.is_exec(uuid), app.is_supervisor_of(uuid), app.shares_company(uuid), app.coordinates_user(uuid) from public;
grant execute on function app.is_active(), app.my_company_ids(), app.is_platform_admin(), app.is_central(), app.is_coordinator(uuid),
  app.is_exec(uuid), app.is_supervisor_of(uuid), app.shares_company(uuid), app.coordinates_user(uuid) to authenticated, service_role;

-- ============================================================ policies + grants
-- business units: names are shown in company pickers
grant select on public.business_units to authenticated;
create policy business_units_read on public.business_units for select to authenticated using (app.is_active());

-- companies: members see their own; coordinators/central see what they coordinate. Pending users use join_company_options().
grant select on public.companies to authenticated;
create policy companies_read on public.companies for select to authenticated
  using (id = any (app.my_company_ids()) or app.is_coordinator(id));
grant select on public.departments, public.positions to authenticated;
create policy departments_read on public.departments for select to authenticated
  using (company_id = any (app.my_company_ids()) or app.is_coordinator(company_id));
create policy positions_read on public.positions for select to authenticated
  using (company_id = any (app.my_company_ids()) or app.is_coordinator(company_id));
grant select on public.company_templates to authenticated;
create policy templates_read on public.company_templates for select to authenticated using (app.is_central());

-- profiles: self, colleagues, people a coordinator looks after. Users edit only display fields of their own row.
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, locale) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or app.shares_company(id) or app.coordinates_user(id) or app.is_platform_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships hold work email / employee code: own row + coordinators + supervisors. Colleagues use the directory view.
grant select on public.memberships to authenticated;
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or app.is_coordinator(company_id) or app.is_supervisor_of(user_id));

grant select on public.role_assignments to authenticated;
create policy roles_read on public.role_assignments for select to authenticated
  using (user_id = auth.uid() or app.is_central()
    or (scope_type = 'company' and app.is_coordinator(scope_id)));

-- platform admins: list visible to admins only; writes only through grant_admin/revoke_admin
grant select on public.platform_admins to authenticated;
create policy admins_read on public.platform_admins for select to authenticated using (app.is_platform_admin());

grant select on public.roster_entries to authenticated;
create policy roster_read on public.roster_entries for select to authenticated using (app.is_coordinator(company_id));
grant select on public.invitations to authenticated;
create policy invitations_read on public.invitations for select to authenticated using (app.is_coordinator(company_id));
grant select on public.join_requests to authenticated;
create policy join_read on public.join_requests for select to authenticated
  using (user_id = auth.uid() or app.is_coordinator(company_id));

-- consents: own rows only
grant select, insert on public.consents to authenticated;
create policy consents_read on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_insert on public.consents for insert to authenticated with check (user_id = auth.uid());

-- audit: admins read; nobody writes from the browser
grant select on public.audit_log, public.audit_purges to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (app.is_platform_admin());
create policy audit_purges_read on public.audit_purges for select to authenticated using (app.is_platform_admin());

-- analytics: a user may record only their own content-free events
grant insert on public.product_events to authenticated;
create policy events_insert on public.product_events for insert to authenticated with check (user_id = auth.uid());
-- aivora_links, company_features: server (service role) only

-- ============================================================ directory (no emails, no codes)
create view public.directory with (security_barrier = true) as
  select m.id as membership_id, m.user_id, m.company_id, p.display_name, p.avatar_path,
         d.name_th as department_th, d.name_en as department_en, ps.name_th as position_th, ps.name_en as position_en
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.status = 'active'
  left join public.departments d on d.id = m.department_id
  left join public.positions ps on ps.id = m.position_id
  where m.status = 'active' and m.company_id = any (app.my_company_ids());
grant select on public.directory to authenticated;

-- ============================================================ new auth users get a pending profile
create function app.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''),
                           nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- ============================================================ audit gate, append-only, row-change trigger
create function app.audit_log_gate() returns trigger language plpgsql security definer set search_path = '' as $$
declare s jsonb; o text;
begin
  select value into s from public.platform_settings where key = 'audit';
  if s is not null and new.action not like 'audit.%' then
    if coalesce((s ->> 'enabled')::boolean, true) = false then return null; end if;
    for o in select jsonb_array_elements_text(coalesce(s -> 'off', '[]'::jsonb)) loop
      if new.action = o or new.action like o || '.%' then return null; end if;
    end loop;
  end if;
  return new;
end;
$$;
create trigger audit_log_gate before insert on public.audit_log for each row execute function app.audit_log_gate();

create function app.audit_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('app.purging', true) = '1' then return old; end if;
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;
create trigger audit_log_no_update before update on public.audit_log for each row execute function app.audit_immutable();
create trigger audit_log_no_delete before delete on public.audit_log for each row execute function app.audit_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function app.audit_immutable();
create trigger audit_purges_no_update before update on public.audit_purges for each row execute function app.audit_immutable();
create trigger audit_purges_no_delete before delete on public.audit_purges for each row execute function app.audit_immutable();

-- tg_argv[0] = comma list of columns whose old/new values may be copied (no personal data); tg_argv[1] = id column
create function app.audit_row_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cols text[] := string_to_array(coalesce(tg_argv[0], ''), ',');
  idcol text := coalesce(tg_argv[1], 'id');
  o jsonb; n jsonb; changed text[]; k text; d jsonb := '{}'::jsonb;
begin
  if tg_op in ('UPDATE','DELETE') then o := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then n := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    select array_agg(key) into changed from jsonb_each(n) where n -> key is distinct from o -> key and key <> 'updated_at';
    if changed is null then return null; end if;
  end if;
  foreach k in array cols loop
    continue when k = '';
    if tg_op <> 'UPDATE' or k = any (changed) then
      d := d || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
    end if;
  end loop;
  insert into public.audit_log (source, actor_id, action, entity, entity_id, company_id, detail)
  values ('db', auth.uid(), 'db.' || tg_table_name || '.' || lower(tg_op), tg_table_name,
          coalesce(n ->> idcol, o ->> idcol), nullif(coalesce(n ->> 'company_id', o ->> 'company_id'), '')::uuid,
          jsonb_build_object('columns', to_jsonb(coalesce(changed, cols))) || jsonb_build_object('values', d));
  return null;
end;
$$;
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function app.audit_row_change('status,company_id,department_id,position_id', 'id');
create trigger audit_role_assignments after insert or update or delete on public.role_assignments
  for each row execute function app.audit_row_change('user_id,role,scope_type,scope_id', 'id');
create trigger audit_platform_admins after insert or delete on public.platform_admins
  for each row execute function app.audit_row_change('user_id', 'user_id');
create trigger audit_profiles_status after update on public.profiles
  for each row when (old.status is distinct from new.status) execute function app.audit_row_change('status', 'id');
create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function app.audit_row_change('status,response_sla_hours,business_unit_id', 'id');
-- settings may hold secrets: record only which keys changed, never values
create trigger audit_platform_settings after insert or update or delete on public.platform_settings
  for each row execute function app.audit_row_change('', 'key');

-- ============================================================ RPCs (client-callable, checked inside)
create function public.join_company_options() returns table (id uuid, name_th text, name_en text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name_th, c.name_en from public.companies c
  where auth.uid() is not null and c.status <> 'paused' and not c.is_demo order by c.name_th;
$$;

create function public.request_join(p_company uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'err_unauthorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.companies c where c.id = p_company and c.status <> 'paused') then raise exception 'err_not_found'; end if;
  if exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.company_id = p_company and m.status = 'active') then raise exception 'err_already_member'; end if;
  insert into public.join_requests (user_id, company_id, note) values (auth.uid(), p_company, left(p_note, 500))
  on conflict (user_id, company_id) where status = 'pending' do update set note = excluded.note
  returning id into v;
  return v;
end;
$$;

-- shared by decide_join / redeem_invitation / claim_roster / import: create or reactivate a membership and activate the profile
create function app.activate_membership(p_user uuid, p_company uuid, p_department uuid, p_position uuid, p_code text, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  insert into public.memberships (user_id, company_id, department_id, position_id, employee_code, work_email, is_primary)
  values (p_user, p_company, p_department, p_position, p_code, p_email,
          not exists (select 1 from public.memberships x where x.user_id = p_user and x.status = 'active'))
  on conflict (user_id, company_id) do update
    set status = 'active', ended_at = null,
        department_id = coalesce(excluded.department_id, public.memberships.department_id),
        position_id = coalesce(excluded.position_id, public.memberships.position_id)
  returning id into v;
  update public.profiles set status = 'active' where id = p_user and status = 'pending';
  return v;
end;
$$;

create function public.decide_join(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.join_requests;
begin
  select * into r from public.join_requests where id = p_request and status = 'pending' for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.is_coordinator(r.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.join_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now() where id = p_request;
  if p_approve then perform app.activate_membership(r.user_id, r.company_id, null, null, null, null); end if;
end;
$$;

create function public.import_roster(p_company uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; x jsonb; batch uuid := gen_random_uuid(); mail text;
begin
  if not app.is_coordinator(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then raise exception 'err_invalid_input'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    mail := lower(trim(x ->> 'email'));
    continue when mail is null or mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    insert into public.roster_entries (company_id, work_email, employee_code, display_name, imported_by, batch_id)
    values (p_company, mail, left(x ->> 'code', 40), left(x ->> 'name', 120), auth.uid(), batch)
    on conflict (company_id, work_email) do update set employee_code = excluded.employee_code, display_name = excluded.display_name
      where public.roster_entries.claimed_by is null;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- first login: a verified e-mail that matches the roster activates the person without any approval
create function public.claim_roster() returns int
language plpgsql security definer set search_path = '' as $$
declare u auth.users; n int := 0; r public.roster_entries;
begin
  select * into u from auth.users where id = auth.uid();
  if not found or u.email is null or u.email_confirmed_at is null then return 0; end if;
  for r in select * from public.roster_entries where work_email = lower(u.email) and claimed_by is null for update loop
    perform app.activate_membership(u.id, r.company_id, r.department_id, r.position_id, r.employee_code, r.work_email);
    update public.roster_entries set claimed_by = u.id where id = r.id;
    if coalesce(r.display_name, '') <> '' then update public.profiles set display_name = r.display_name where id = u.id and display_name = split_part(u.email, '@', 1); end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create function public.create_invitation(p_company uuid, p_ttl_hours int default 72) returns text
language plpgsql security definer set search_path = '' as $$
declare code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if not app.is_coordinator(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  insert into public.invitations (company_id, code_hash, expires_at, created_by)
  values (p_company, encode(sha256(convert_to(code, 'UTF8')), 'hex'), now() + make_interval(hours => least(greatest(p_ttl_hours, 1), 720)), auth.uid());
  return code;
end;
$$;

create function public.redeem_invitation(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.invitations;
begin
  if auth.uid() is null then raise exception 'err_unauthorized' using errcode = '42501'; end if;
  select * into i from public.invitations
    where code_hash = encode(sha256(convert_to(upper(trim(p_code)), 'UTF8')), 'hex') and used_by is null and expires_at > now() for update;
  if not found then raise exception 'err_invite_invalid'; end if; -- same answer for wrong, used and expired
  update public.invitations set used_by = auth.uid(), used_at = now() where id = i.id;
  return app.activate_membership(auth.uid(), i.company_id, null, null, null, null);
end;
$$;

create function public.grant_role(p_user uuid, p_role text, p_scope_type text, p_scope_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; ok boolean := false;
begin
  if p_scope_type = 'group' then
    ok := app.is_platform_admin() and p_role in ('central_team','group_owner');
  elsif p_scope_type = 'company' and p_scope_id is not null then
    if p_role in ('coordinator','company_exec') then ok := app.is_central();
    elsif p_role = 'supervisor' then ok := app.is_coordinator(p_scope_id); end if;
    if ok and not exists (select 1 from public.memberships m where m.user_id = p_user and m.company_id = p_scope_id and m.status = 'active') then
      raise exception 'err_not_member';
    end if;
  elsif p_scope_type = 'business_unit' and p_role = 'coordinator' then ok := app.is_central();
  end if;
  if not ok then raise exception 'err_forbidden' using errcode = '42501'; end if;
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by) values (p_user, p_role, p_scope_type, p_scope_id, auth.uid())
  on conflict do nothing returning id into v;
  return v;
end;
$$;

create function public.revoke_role(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.role_assignments; ok boolean;
begin
  select * into r from public.role_assignments where id = p_id;
  if not found then raise exception 'err_not_found'; end if;
  ok := case when r.scope_type = 'group' then app.is_platform_admin()
             when r.role = 'supervisor' then app.is_coordinator(r.scope_id)
             else app.is_central() end;
  if not ok then raise exception 'err_forbidden' using errcode = '42501'; end if;
  delete from public.role_assignments where id = p_id;
end;
$$;

create function public.end_membership(p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  select * into m from public.memberships where id = p_membership;
  if not found then raise exception 'err_not_found'; end if;
  if not app.is_coordinator(m.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.memberships set status = 'ended', ended_at = now() where id = p_membership;
  delete from public.role_assignments where user_id = m.user_id and scope_type = 'company' and scope_id = m.company_id;
end;
$$;

create function public.set_supervisor(p_membership uuid, p_supervisor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; s public.memberships;
begin
  select * into m from public.memberships where id = p_membership;
  if not found or not app.is_coordinator(m.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_supervisor is not null then
    select * into s from public.memberships where id = p_supervisor and company_id = m.company_id and status = 'active';
    if not found or p_supervisor = p_membership then raise exception 'err_invalid_input'; end if;
  end if;
  update public.memberships set supervisor_membership_id = p_supervisor where id = p_membership;
end;
$$;

-- platform admins (ADMINS-KNOWLEDGE): only these two functions write the table
create function public.grant_admin(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if u is null then raise exception 'err_no_such_account'; end if; -- never creates accounts
  insert into public.platform_admins (user_id, granted_by) values (u, auth.uid()) on conflict do nothing;
end;
$$;

create function app.owner_user_id() returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.platform_settings s join auth.users u on lower(u.email) = lower(s.value ->> 'email') where s.key = 'owner';
$$;

create function public.revoke_admin(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'err_cannot_revoke_self'; end if;
  if p_user = app.owner_user_id() then raise exception 'err_cannot_revoke_owner'; end if;
  delete from public.platform_admins where user_id = p_user;
  if (select count(*) from public.platform_admins) = 0 then raise exception 'err_last_admin'; end if;
end;
$$;

create function public.admin_purge_audit(p_before timestamptz) returns bigint
language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_before > now() - interval '4 years' then raise exception 'err_too_recent'; end if;
  perform set_config('app.purging', '1', true);
  delete from public.audit_log where at < p_before;
  get diagnostics n = row_count;
  perform set_config('app.purging', '0', true);
  insert into public.audit_purges (actor_id, rows_deleted, before_ts) values (auth.uid(), n, p_before);
  insert into public.audit_log (source, actor_id, action, entity, detail) values ('app', auth.uid(), 'audit.purge', 'audit_log', jsonb_build_object('rows', n));
  return n;
end;
$$;

revoke all on function public.join_company_options(), public.request_join(uuid, text), public.decide_join(uuid, boolean),
  public.import_roster(uuid, jsonb), public.claim_roster(), public.create_invitation(uuid, int), public.redeem_invitation(text),
  public.grant_role(uuid, text, text, uuid), public.revoke_role(uuid), public.end_membership(uuid), public.set_supervisor(uuid, uuid),
  public.grant_admin(text), public.revoke_admin(uuid), public.admin_purge_audit(timestamptz) from public;
grant execute on function public.join_company_options(), public.request_join(uuid, text), public.decide_join(uuid, boolean),
  public.import_roster(uuid, jsonb), public.claim_roster(), public.create_invitation(uuid, int), public.redeem_invitation(text),
  public.grant_role(uuid, text, text, uuid), public.revoke_role(uuid), public.end_membership(uuid), public.set_supervisor(uuid, uuid),
  public.grant_admin(text), public.revoke_admin(uuid), public.admin_purge_audit(timestamptz) to authenticated;
revoke all on function app.activate_membership(uuid, uuid, uuid, uuid, text, text), app.owner_user_id(), app.handle_new_user(),
  app.audit_log_gate(), app.audit_row_change() from public;
