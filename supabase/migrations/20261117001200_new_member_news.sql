-- A person who joins AFTER an announcement was published must still see the announcements addressed to them
-- (e.g. a group message from the chairman). Visibility goes through announcement_receipts, which publish_announcement writes
-- only for the people in the audience at that moment, so late joiners saw an empty news page.

create function app.backfill_announcements(p_user uuid) returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.announcement_receipts (announcement_id, user_id)
  select a.id, p_user
  from public.announcements a
  where a.status = 'published'
    and (a.publish_at is null or a.publish_at <= now())
    and (a.expires_at is null or a.expires_at > now())
    and exists (select 1 from app.announcement_recipients(a.id) x where x.user_id = p_user)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function app.backfill_announcements(uuid) from public;

-- every way into a company (approved request, invitation code, roster match, import) goes through this function
create or replace function app.activate_membership(p_user uuid, p_company uuid, p_department uuid, p_position uuid, p_code text, p_email text)
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
  perform app.backfill_announcements(p_user);
  return v;
end;
$$;

-- people who already joined and are missing announcements addressed to them
select app.backfill_announcements(m.user_id) from (select distinct user_id from public.memberships where status = 'active') m;
