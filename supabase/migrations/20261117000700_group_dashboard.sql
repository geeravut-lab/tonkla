-- M2.6: group dashboard for the central team: numbers per company and per business unit, issues that recur across companies, value created.
-- Aggregates only: no report, idea or person is returned. Demo and inactive companies are left out.

create function public.group_dashboard(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365)); out jsonb;
begin
  if not app.is_central() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  with co as (
    select c.id, c.name_th as name, c.business_unit_id as bu, coalesce(b.name_th, '') as bu_name
    from public.companies c left join public.business_units b on b.id = c.business_unit_id
    where c.status = 'active' and not c.is_demo
  ),
  rows_ as (
    select co.id as company_id, co.name, co.bu, co.bu_name,
      coalesce((select count(*) from public.memberships m where m.company_id = co.id and m.status = 'active'), 0)::int as members,
      coalesce((select count(*) from public.reports r where r.company_id = co.id and r.created_at >= since), 0)::int as reports_new,
      coalesce((select count(*) from public.reports r where r.company_id = co.id and r.created_at >= since and r.first_response_at is not null), 0)::int as reports_answered,
      coalesce((select count(*) from public.reports r where r.company_id = co.id and r.created_at >= since and r.first_response_at is not null and r.first_response_at <= r.respond_by), 0)::int as reports_in_time,
      coalesce((select count(*) from public.reports r where r.company_id = co.id and r.first_response_at is null and r.status = 'submitted' and r.respond_by < now()), 0)::int as reports_overdue,
      coalesce((select count(*) from public.reports r where r.company_id = co.id and r.status in ('resolved','closed') and r.updated_at >= since), 0)::int as reports_resolved,
      coalesce((select count(*) from public.ideas i where i.company_id = co.id and i.created_at >= since), 0)::int as ideas_new,
      coalesce((select count(*) from public.ideas i where i.company_id = co.id and i.stage in ('piloting','scaled')), 0)::int as ideas_adopted,
      coalesce((select sum(o.value) from public.idea_outcomes o join public.ideas i on i.id = o.idea_id where i.company_id = co.id and o.metric = 'money_saved_thb' and o.verified_at >= since), 0) as value_money,
      coalesce((select sum(o.value) from public.idea_outcomes o join public.ideas i on i.id = o.idea_id where i.company_id = co.id and o.metric = 'time_saved_hours' and o.verified_at >= since), 0) as value_hours,
      coalesce((select sum(o.value) from public.idea_outcomes o join public.ideas i on i.id = o.idea_id where i.company_id = co.id and o.metric = 'revenue_added_thb' and o.verified_at >= since), 0) as value_revenue,
      -- people who did something in the period: sent a report or idea, voted, or commented (each counted once)
      (select count(distinct u) from (
         select r.submitter_id as u from public.reports r where r.company_id = co.id and r.created_at >= since
         union all select i.submitter_id from public.ideas i where i.company_id = co.id and i.created_at >= since
         union all select v.user_id from public.idea_votes v join public.ideas i on i.id = v.idea_id where i.company_id = co.id and v.created_at >= since
         union all select c.author_id from public.idea_comments c join public.ideas i on i.id = c.idea_id where i.company_id = co.id and c.created_at >= since
       ) x)::int as participants
    from co
  ),
  units as (
    select bu, bu_name, count(*)::int as companies, sum(members)::int as members, sum(reports_new)::int as reports_new, sum(reports_in_time)::int as reports_in_time, sum(reports_answered)::int as reports_answered,
      sum(reports_overdue)::int as reports_overdue, sum(reports_resolved)::int as reports_resolved, sum(ideas_new)::int as ideas_new, sum(ideas_adopted)::int as ideas_adopted,
      sum(value_money) as value_money, sum(value_hours) as value_hours, sum(value_revenue) as value_revenue, sum(participants)::int as participants
    from rows_ group by bu, bu_name
  ),
  recurring as (
    select cat.key, min(cat.name_th) as name, count(distinct r.company_id)::int as companies, count(*)::int as reports,
      count(*) filter (where r.status in ('submitted','acknowledged','in_progress'))::int as open
    from public.reports r join public.report_categories cat on cat.id = r.category_id join co on co.id = r.company_id
    where r.created_at >= since group by cat.key having count(distinct r.company_id) >= 2 order by 4 desc limit 10
  )
  select jsonb_build_object(
    'days', d,
    'companies', coalesce((select jsonb_agg(to_jsonb(x) order by x.bu_name, x.name) from rows_ x), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(to_jsonb(u) order by u.bu_name) from units u), '[]'::jsonb),
    'recurring', coalesce((select jsonb_agg(to_jsonb(r) order by r.reports desc) from recurring r), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;
revoke all on function public.group_dashboard(int) from public;
grant execute on function public.group_dashboard(int) to authenticated;
