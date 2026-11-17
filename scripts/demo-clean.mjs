// Removes EVERYTHING scripts/demo-seed.mjs created, before go-live:
//   users @demo.tonkla.example (and, by cascade, their profiles, memberships, roles, notifications, reports, ideas and the rest),
//   companies with code 'demo-*', business units named '[DEMO] ...', demo communities, demo audit rows, demo uploaded files.
//   node scripts/demo-clean.mjs            (shows what would be removed)   node scripts/demo-clean.mjs --yes   (removes)
// Real people and companies are never touched: everything is matched on the demo markers only.
const REF = process.env.SUPABASE_PROJECT_REF || "yfowqsfyfvzgwqdbkykx";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DOMAIN = "demo.tonkla.example";
const yes = process.argv.includes("--yes");
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}
const count = async (label, query) => console.log(`${label.padEnd(34)} ${(await sql(query))[0].n}`);

console.log(yes ? "REMOVING demo data" : "dry run (add --yes to remove)");
await count("demo users", `select count(*)::int n from auth.users where email like '%@${DOMAIN}'`);
await count("demo companies", `select count(*)::int n from public.companies where code like 'demo-%'`);
await count("demo business units", `select count(*)::int n from public.business_units where name_th like '[DEMO]%'`);
await count("demo communities", `select count(*)::int n from public.communities where key like 'demo\\_%'`);
await count("reports in demo companies", `select count(*)::int n from public.reports r join public.companies c on c.id = r.company_id where c.code like 'demo-%'`);
await count("ideas in demo companies", `select count(*)::int n from public.ideas i join public.companies c on c.id = i.company_id where c.code like 'demo-%'`);
if (!yes) process.exit(0);

const users = `(select id from auth.users where email like '%@${DOMAIN}')`;
const cos = `(select id from public.companies where code like 'demo-%')`;
const steps = [
  // content that belongs to no single company or that has no cascade from a company
  `delete from public.anonymous_reports where title in ('ขอร้องเรียนเรื่องการจัดกะที่ไม่เป็นธรรม','สงสัยการเบิกค่าเดินทางซ้ำซ้อน')`,
  `delete from public.anonymous_handlers where user_id in ${users}`,
  `delete from public.communities where key like 'demo\\_%'`,
  `delete from public.announcements where author_id in ${users}`,
  `delete from public.qa_sessions where created_by in ${users}`,
  `delete from public.events where created_by in ${users}`,
  `delete from public.polls where created_by in ${users}`,
  `delete from public.challenges where created_by in ${users}`,
  `delete from public.kb_documents where created_by in ${users}`,
  `delete from public.teams where lead_id in ${users}`,
  `delete from public.notifications where user_id in ${users}`,
  `delete from public.notification_queue where user_id in ${users}`,
  `delete from public.message_log where user_id in ${users}`,
  // the audit trail is append-only by design; removing the demo rows is a deliberate one-time exception done with triggers suspended
  `do $$ begin set local session_replication_role = replica; delete from public.audit_log where actor_id in ${users} or company_id in ${cos}; end $$`,
  `delete from storage.objects where bucket_id = 'report-files' and (storage.foldername(name))[1] in (select id::text from public.companies where code like 'demo-%')`,
  `delete from public.company_features where company_id in ${cos}`,
  // reports and ideas keep a plain foreign key to the person: remove them first, then the people, then the companies
  `delete from public.reports where company_id in ${cos}`,
  `delete from public.ideas where company_id in ${cos}`,
  `delete from public.emergency_incidents where company_id in ${cos}`,
  `delete from public.platform_admins where user_id in ${users}`,
  `delete from auth.users where email like '%@${DOMAIN}'`,
  `delete from public.companies where code like 'demo-%'`,
  `delete from public.business_units where name_th like '[DEMO]%'`,
];
for (const s of steps) {
  try {
    await sql(s);
    console.log("ok   ", s.slice(0, 90));
  } catch (e) {
    console.log("FAIL ", s.slice(0, 90), "->", e.message.slice(0, 200));
  }
}
await count("demo users left", `select count(*)::int n from auth.users where email like '%@${DOMAIN}'`);
await count("demo companies left", `select count(*)::int n from public.companies where code like 'demo-%'`);
