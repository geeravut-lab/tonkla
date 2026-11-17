-- M2.1: rollout in waves (one business unit at a time) with a readiness checklist before a company goes live.

create table public.rollout_waves (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  business_unit_id uuid references public.business_units(id) on delete set null,
  planned_on date,
  status text not null default 'planned' check (status in ('planned','active','done')),
  features text[] not null default '{}' check (features <@ array['anonymous_channel','emergency','qa','events','polls','challenges','idea_library','recognition','knowledge_base','group_dashboard']),
  created_at timestamptz not null default now()
);
alter table public.companies add column wave_id uuid references public.rollout_waves(id) on delete set null;
create table public.company_checklist (
  company_id uuid not null references public.companies(id) on delete cascade,
  item text not null check (item in ('training','channels')), -- the two items a person confirms; the rest is computed
  done_at timestamptz not null default now(), done_by uuid,
  primary key (company_id, item)
);
alter table public.rollout_waves enable row level security;
alter table public.company_checklist enable row level security;
grant select on public.rollout_waves, public.company_checklist to authenticated;
create policy waves_read on public.rollout_waves for select to authenticated using (app.is_platform_admin() or app.is_central());
create policy checklist_read on public.company_checklist for select to authenticated using (app.is_platform_admin() or app.is_coordinator(company_id));

/** What is ready: computed from real data, so it can not be ticked by hand. */
create function public.company_readiness(p_company uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.is_platform_admin() or app.is_coordinator(p_company)) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'coordinator', exists (select 1 from public.role_assignments r where r.role = 'coordinator' and r.scope_type = 'company' and r.scope_id = p_company),
    'people', (select count(*) from public.roster_entries where company_id = p_company) + (select count(*) from public.memberships where company_id = p_company and status = 'active') > 0,
    'categories', exists (select 1 from public.report_categories where company_id = p_company and active),
    'criteria', exists (select 1 from public.idea_criteria where company_id = p_company and active),
    'training', exists (select 1 from public.company_checklist where company_id = p_company and item = 'training'),
    'channels', exists (select 1 from public.company_checklist where company_id = p_company and item = 'channels')
  );
end;
$$;

create function public.admin_create_wave(p_name text, p_bu uuid, p_planned date, p_features text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  insert into public.rollout_waves (name, business_unit_id, planned_on, features) values (trim(p_name), p_bu, p_planned, coalesce(p_features, '{}')) returning id into v;
  return v;
end;
$$;
create function public.admin_assign_wave(p_company uuid, p_wave uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.companies set wave_id = p_wave where id = p_company;
  if not found then raise exception 'err_not_found'; end if;
end;
$$;
create function public.admin_set_checklist(p_company uuid, p_item text, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_platform_admin() or app.is_coordinator(p_company)) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_done then insert into public.company_checklist (company_id, item, done_by) values (p_company, p_item, auth.uid()) on conflict do nothing;
  else delete from public.company_checklist where company_id = p_company and item = p_item; end if;
end;
$$;

/** Goes live only when the computed items are ready AND training was confirmed. Enables the wave's phase-2 features for the company. */
create function app.activate_company(p_company uuid) returns void language plpgsql security definer set search_path = '' as $$
declare r jsonb; w public.rollout_waves; f text; c uuid;
begin
  r := public.company_readiness(p_company);
  if not ((r ->> 'coordinator')::boolean and (r ->> 'people')::boolean and (r ->> 'categories')::boolean and (r ->> 'criteria')::boolean and (r ->> 'training')::boolean) then raise exception 'err_not_ready'; end if;
  update public.companies set status = 'active' where id = p_company;
  select w2.* into w from public.rollout_waves w2 join public.companies c2 on c2.wave_id = w2.id where c2.id = p_company;
  if w.id is not null then
    foreach f in array w.features loop
      insert into public.company_features (company_id, key, enabled) values (p_company, f, true) on conflict (company_id, key) do update set enabled = true;
    end loop;
  end if;
  for c in select app.company_coordinator_ids(p_company) loop
    perform app.notify(c, 'company_activated', (select name_th from public.companies where id = p_company), '', '/desk', 'act:' || p_company::text || ':' || c::text, '{}'::jsonb);
  end loop;
end;
$$;
create function public.admin_activate_company(p_company uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  perform app.activate_company(p_company);
end;
$$;
/** Activates every company of the wave that is ready; returns how many went live and how many were skipped. */
create function public.admin_activate_wave(p_wave uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c uuid; ok int := 0; skipped int := 0;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  for c in select id from public.companies where wave_id = p_wave and status <> 'active' loop
    begin
      perform app.activate_company(c);
      ok := ok + 1;
    exception when others then
      skipped := skipped + 1;
    end;
  end loop;
  update public.rollout_waves set status = 'active' where id = p_wave and status = 'planned';
  return jsonb_build_object('activated', ok, 'skipped', skipped);
end;
$$;
revoke all on function public.company_readiness(uuid), public.admin_create_wave(text, uuid, date, text[]), public.admin_assign_wave(uuid, uuid),
  public.admin_set_checklist(uuid, text, boolean), public.admin_activate_company(uuid), public.admin_activate_wave(uuid), app.activate_company(uuid) from public;
grant execute on function public.company_readiness(uuid), public.admin_create_wave(text, uuid, date, text[]), public.admin_assign_wave(uuid, uuid),
  public.admin_set_checklist(uuid, text, boolean), public.admin_activate_company(uuid), public.admin_activate_wave(uuid) to authenticated;
