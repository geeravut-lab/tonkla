// Live smoke test against the real Supabase project: runs the main permission and workflow checks with the REAL roles
// (authenticated/anon, storage policies, realtime) inside ONE statement that always rolls back, so nothing is left behind.
//   node scripts/live-smoke.mjs        (agent environment: token injected by the proxy; elsewhere SUPABASE_ACCESS_TOKEN)
const REF = process.env.SUPABASE_PROJECT_REF || "yfowqsfyfvzgwqdbkykx";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const SQL = String.raw`
do $smoke$
declare
  bu uuid := gen_random_uuid(); ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  alice uuid := gen_random_uuid(); bob uuid := gen_random_uuid(); carol uuid := gen_random_uuid(); dave uuid := gen_random_uuid();
  erin uuid := gen_random_uuid(); frank uuid := gen_random_uuid(); pam uuid := gen_random_uuid();
  tpl uuid; cat uuid := gen_random_uuid(); rep uuid := gen_random_uuid(); idea uuid := gen_random_uuid(); ann uuid; n int; ok boolean; v uuid; steps text := '';
begin
  -- ---- world (as the database owner)
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (alice, 'smoke-alice@example.test', now(), 'authenticated', 'authenticated'), (bob, 'smoke-bob@example.test', now(), 'authenticated', 'authenticated'),
    (carol, 'smoke-carol@example.test', now(), 'authenticated', 'authenticated'), (dave, 'smoke-dave@example.test', now(), 'authenticated', 'authenticated'),
    (erin, 'smoke-erin@example.test', now(), 'authenticated', 'authenticated'), (frank, 'smoke-frank@example.test', now(), 'authenticated', 'authenticated'),
    (pam, 'smoke-pam@example.test', now(), 'authenticated', 'authenticated');
  if (select count(*) from public.profiles where id in (alice, bob, carol, dave, erin, frank, pam)) <> 7 then raise exception 'FAIL profile trigger'; end if;
  update public.profiles set status = 'active' where id <> pam;
  insert into public.business_units (id, name_th) values (bu, 'smoke');
  insert into public.companies (id, business_unit_id, code, name_th, status, is_demo) values (ca, bu, 'smoke-a', 'smoke A', 'active', true), (cb, bu, 'smoke-b', 'smoke B', 'active', true);
  insert into public.report_categories (id, company_id, key, name_th) values (cat, ca, 'equipment', 'อุปกรณ์');
  insert into public.memberships (user_id, company_id) values (alice, ca), (carol, ca), (dave, ca), (bob, cb);
  update public.memberships set supervisor_membership_id = (select id from public.memberships where user_id = dave and company_id = ca) where user_id = alice;
  insert into public.role_assignments (user_id, role, scope_type, scope_id) values (carol, 'coordinator', 'company', ca), (dave, 'supervisor', 'company', ca);
  insert into public.role_assignments (user_id, role, scope_type) values (erin, 'central_team', 'group');
  insert into public.platform_admins (user_id) values (frank);
  select id into tpl from public.company_templates limit 1;
  steps := steps || 'world,';

  -- ---- isolation as alice (company A employee)
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.companies) <> 1 then raise exception 'FAIL alice sees % companies', (select count(*) from public.companies); end if;
  if (select count(*) from public.directory where company_id = cb) <> 0 then raise exception 'FAIL directory leak'; end if;
  begin perform 1 from public.platform_settings limit 1; raise exception 'FAIL platform_settings readable'; exception when insufficient_privilege then null; end;
  begin update public.profiles set status = 'active', display_name = 'x' where id = pam; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL updated someone else'; end if; exception when insufficient_privilege then null; end;
  begin insert into public.role_assignments (user_id, role, scope_type) values (alice, 'central_team', 'group'); raise exception 'FAIL self grant'; exception when insufficient_privilege then null; end;
  steps := steps || 'isolation,';

  -- ---- report workflow
  perform public.submit_report(rep, ca, cat, 'medium', 'smoke: แอร์ไม่เย็น', 'd', 'i', 'f', '[]'::jsonb);
  if (select owner_id from public.reports where id = rep) <> carol then raise exception 'FAIL owner routing'; end if;
  if (select respond_by - created_at from public.reports where id = rep) <> interval '48 hours' then raise exception 'FAIL deadline'; end if;
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  if (select count(*) from public.reports where id = rep) <> 0 then raise exception 'FAIL report visible to other company'; end if;
  begin perform public.report_transition(rep, 'acknowledged', ''); raise exception 'FAIL foreign transition'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  begin perform public.report_transition(rep, 'declined', ''); raise exception 'FAIL decline without reason'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.report_transition(rep, 'acknowledged', '');
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  if (select count(*) from public.notifications where dedupe_key like 'rep_st:' || rep::text || '%') <> 1 then raise exception 'FAIL submitter not told'; end if;
  steps := steps || 'report,';

  -- ---- escalation tick (as owner)
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  v := gen_random_uuid();
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.submit_report(v, ca, cat, 'high', 'smoke: เกินกำหนด', '', '', '', '[]'::jsonb);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.reports set respond_by = now() - interval '2 hours' where id = v;
  perform public.run_tick();
  if (select escalation_level from public.reports where id = v) <> 1 then raise exception 'FAIL tick did not escalate'; end if;
  perform public.run_tick();
  if (select count(*) from public.notifications where dedupe_key = 'rep_o1:' || v::text || ':' || carol::text) <> 1 then raise exception 'FAIL escalation notice duplicated or missing'; end if;
  steps := steps || 'tick,';

  -- ---- announcement + must-read acknowledgement
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into public.announcements (author_id, company_id, title, requires_ack) values (carol, ca, 'smoke: ประกาศ', true) returning id into ann;
  perform public.publish_announcement(ann);
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  if (select count(*) from public.announcements where id = ann) <> 1 then raise exception 'FAIL recipient cannot read announcement'; end if;
  perform public.ack_announcement(ann);
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  if (select count(*) from public.announcements where id = ann) <> 0 then raise exception 'FAIL announcement leaked to other company'; end if;
  steps := steps || 'announcement,';

  -- ---- ideas
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.submit_idea(idea, ca, 'cost_reduction', 'smoke: ลดกระดาษ', '', '', '', '', null);
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  perform public.idea_transition(idea, 'screening', ''); perform public.idea_transition(idea, 'evaluating', ''); perform public.idea_transition(idea, 'piloting', '');
  begin perform public.idea_transition(idea, 'submitted', ''); raise exception 'FAIL went backwards'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  steps := steps || 'idea,';

  -- ---- LINE queue
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  insert into public.notification_channels (user_id, channel, status, address) values (alice, 'line', 'active', 'Usmoke' || replace(alice::text, '-', ''));
  perform app.notify(alice, 'announcement', 'smoke', '', '/news', 'smoke-line-1');
  if (select count(*) from public.notification_queue q join public.notifications x on x.id = q.notification_id where x.dedupe_key = 'smoke-line-1') <> 1 then raise exception 'FAIL line queue'; end if;
  steps := steps || 'line,';

  -- ---- storage policies (real storage schema)
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name, owner_id) values ('report-files', ca::text || '/' || rep::text || '/ok.jpg', alice::text);
  begin insert into storage.objects (bucket_id, name, owner_id) values ('report-files', cb::text || '/' || rep::text || '/no.jpg', alice::text); raise exception 'FAIL storage wrong company'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  if (select count(*) from storage.objects where bucket_id = 'report-files') <> 0 then raise exception 'FAIL storage read across companies'; end if;
  steps := steps || 'storage,';

  -- ---- pending user, anon, admin-only areas, audit immutability, live topics
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', pam, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  if (select count(*) from public.companies) + (select count(*) from public.reports) + (select count(*) from public.announcements) + (select count(*) from public.ideas) <> 0 then raise exception 'FAIL pending user sees data'; end if;
  execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  begin perform public.admin_purge_audit(now() - interval '5 years'); raise exception 'FAIL purge by employee'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  if (select count(*) from public.audit_log) <> 0 then raise exception 'FAIL audit readable by employee'; end if;
  if app.live_may_hear('u:' || bob::text) or app.live_may_hear('central') or app.live_may_hear('co:' || ca::text) then raise exception 'FAIL live topic rules'; end if;
  if not app.live_may_hear('u:' || alice::text) then raise exception 'FAIL own live topic'; end if;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); execute 'set local role anon';
  begin perform 1 from public.reports limit 1; raise exception 'FAIL anon reads reports'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  begin update public.audit_log set entity = 'x'; raise exception 'FAIL audit mutable'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  steps := steps || 'admin-only,audit,live,anon,';

  -- ---- company template creates categories + criteria (platform admin)
  perform set_config('request.jwt.claims', json_build_object('sub', frank, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  v := public.admin_create_company('smoke-tpl', 'smoke tpl', '', null, tpl);
  execute 'reset role';
  if (select count(*) from public.report_categories where company_id = v) < 5 or (select count(*) from public.idea_criteria where company_id = v) < 3 then raise exception 'FAIL template'; end if;
  steps := steps || 'template,';

  raise exception 'SMOKE_OK %', steps;
end
$smoke$;
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
  body: JSON.stringify({ query: SQL }),
});
const text = await res.text();
const m = text.match(/SMOKE_OK ([a-z,-]+)/);
if (m) {
  console.log("LIVE SMOKE PASSED (rolled back, nothing stored):", m[1].replace(/,$/, "").split(",").join(" · "));
} else {
  console.error("LIVE SMOKE FAILED:", text.slice(0, 700));
  process.exit(1);
}
