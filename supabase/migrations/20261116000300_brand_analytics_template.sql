-- Brand storage bucket (private; served through /brand/* by the app), analytics dashboard function, default company template.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('brand', 'brand', false) on conflict (id) do nothing;
  end if;
end $$;

create function public.admin_analytics(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Bangkok')::date; days int := least(greatest(p_days, 1), 365);
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'dau', (select count(distinct user_id) from public.product_events where name = 'active' and day = today),
    'wau', (select count(distinct user_id) from public.product_events where name = 'active' and day > today - 7),
    'mau', (select count(distinct user_id) from public.product_events where name = 'active' and day > today - 30),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day), '[]'::jsonb)
              from (select day, count(distinct user_id) as n from public.product_events where name = 'active' and day > today - days group by day) d),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'n', n) order by n desc), '[]'::jsonb)
               from (select name, count(*) as n from public.product_events where day > today - days group by name) e)
  );
end;
$$;
revoke all on function public.admin_analytics(int) from public;
grant execute on function public.admin_analytics(int) to authenticated;

insert into public.company_templates (name, config) values (
  'แม่แบบมาตรฐาน',
  jsonb_build_object(
    'response_sla_hours', 48,
    'report_categories', jsonb_build_array(
      jsonb_build_object('key','safety','th','ความปลอดภัย','en','Safety','severity','high'),
      jsonb_build_object('key','equipment','th','อุปกรณ์/เครื่องมือ','en','Equipment','severity','medium'),
      jsonb_build_object('key','process','th','กระบวนการทำงาน','en','Work process','severity','medium'),
      jsonb_build_object('key','facility','th','อาคารสถานที่','en','Facilities','severity','low'),
      jsonb_build_object('key','it','th','ระบบ/ไอที','en','IT systems','severity','medium'),
      jsonb_build_object('key','other','th','อื่น ๆ','en','Other','severity','low')),
    'idea_criteria', jsonb_build_array(
      jsonb_build_object('th','ผลกระทบต่อธุรกิจ','en','Business impact','weight',3),
      jsonb_build_object('th','ความเป็นไปได้','en','Feasibility','weight',2),
      jsonb_build_object('th','ทรัพยากรที่ต้องใช้ (ยิ่งน้อยยิ่งดี)','en','Resources needed (lower is better)','weight',1),
      jsonb_build_object('th','ความใหม่/ความแตกต่าง','en','Novelty','weight',1))
  ));
