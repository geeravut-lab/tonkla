-- Platform-admin operations on the group structure. Checked inside the function; row changes are recorded by the audit triggers.
create function public.admin_create_bu(p_name_th text, p_name_en text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name_th, ''))) < 1 then raise exception 'err_invalid_input'; end if;
  insert into public.business_units (name_th, name_en) values (left(trim(p_name_th), 120), left(trim(coalesce(p_name_en, '')), 120)) returning id into v;
  return v;
end;
$$;

create function public.admin_create_company(p_code text, p_name_th text, p_name_en text, p_bu uuid, p_template uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; sla int := 48; cfg jsonb;
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
  return v;
end;
$$;

create function public.admin_update_company(p_id uuid, p_status text, p_sla int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_status not in ('setup','active','paused') or p_sla not between 1 and 720 then raise exception 'err_invalid_input'; end if;
  update public.companies set status = p_status, response_sla_hours = p_sla where id = p_id;
  if not found then raise exception 'err_not_found'; end if;
end;
$$;

-- first coordinator of a company: must already be an active member (people are never created from an e-mail)
create function public.admin_set_coordinator(p_company uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid; v uuid;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  select a.id into u from auth.users a where lower(a.email) = lower(trim(p_email)) and a.email_confirmed_at is not null;
  if u is null then raise exception 'err_no_such_account'; end if;
  if not exists (select 1 from public.memberships m where m.user_id = u and m.company_id = p_company and m.status = 'active') then
    -- the platform admin may seat the first coordinator directly
    perform app.activate_membership(u, p_company, null, null, null, null);
  end if;
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by) values (u, 'coordinator', 'company', p_company, auth.uid())
  on conflict do nothing returning id into v;
  return v;
end;
$$;
revoke all on function public.admin_create_bu(text, text), public.admin_create_company(text, text, text, uuid, uuid),
  public.admin_update_company(uuid, text, int), public.admin_set_coordinator(uuid, text) from public;
grant execute on function public.admin_create_bu(text, text), public.admin_create_company(text, text, text, uuid, uuid),
  public.admin_update_company(uuid, text, int), public.admin_set_coordinator(uuid, text) to authenticated;
