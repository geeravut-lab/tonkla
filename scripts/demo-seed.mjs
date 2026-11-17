// Demo data for showing Tonkla to the group owner. EVERYTHING it creates is marked and removed by scripts/demo-clean.mjs:
//   companies with code 'demo-*', business units named '[DEMO] ...', users with e-mails @demo.tonkla.example (password below).
// It does what real people do: signs in as each demo user and calls the same database functions the app calls, so row-level security,
// notifications, points and the audit trail behave exactly as in real use.
//   node scripts/demo-seed.mjs [images-folder]       (agent environment: Supabase/Vercel tokens are injected by the proxy)
// No secret is written anywhere: keys are fetched at run time and kept in memory.
import { readFileSync, existsSync } from "node:fs";
import { createHash, createHmac, randomBytes } from "node:crypto";

const REF = process.env.SUPABASE_PROJECT_REF || "yfowqsfyfvzgwqdbkykx";
const URL_ = `https://${REF}.supabase.co`;
const PASSWORD = "Test!234";
const DOMAIN = "demo.tonkla.example";
const IMG = process.argv[2] || "/tmp/tonkla-demo-images";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const mgmt = (path, init = {}) => fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...init.headers } });
async function sql(query) {
  const r = await mgmt("/database/query", { method: "POST", body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}
const q1 = (s) => String(s).replaceAll("'", "''");

const keys = await (await mgmt("/api-keys?reveal=true")).json();
const ANON = keys.find((k) => k.name === "anon")?.api_key;
const SERVICE = keys.find((k) => k.name === "service_role")?.api_key;
if (!ANON || !SERVICE) throw new Error("could not read the project keys");

// ------------------------------------------------------------------ the demo organisation
const BUS = [
  { key: "mfg", name: "[DEMO] กลุ่มอุตสาหกรรมอาหารและบรรจุภัณฑ์" },
  { key: "svc", name: "[DEMO] กลุ่มค้าปลีกและโลจิสติกส์" },
  { key: "tech", name: "[DEMO] กลุ่มเทคโนโลยีและสุขภาพ" },
  { key: "hq", name: "[DEMO] สำนักงานกลาง" },
];
const COMPANIES = [
  { slug: "food", code: "demo-food", th: "[DEMO] ต้นกล้า ฟู้ดส์", en: "Tonkla Foods", bu: "mfg", exec: true },
  { slug: "pack", code: "demo-pack", th: "[DEMO] ต้นกล้า แพคเกจจิ้ง", en: "Tonkla Packaging", bu: "mfg" },
  { slug: "retail", code: "demo-retail", th: "[DEMO] ต้นกล้า รีเทล", en: "Tonkla Retail", bu: "svc", exec: true },
  { slug: "logi", code: "demo-logi", th: "[DEMO] ต้นกล้า โลจิสติกส์", en: "Tonkla Logistics", bu: "svc" },
  { slug: "tech", code: "demo-tech", th: "[DEMO] ต้นกล้า เทค", en: "Tonkla Tech", bu: "tech", exec: true },
  { slug: "health", code: "demo-health", th: "[DEMO] ต้นกล้า เฮลท์แคร์", en: "Tonkla Healthcare", bu: "tech" },
  { slug: "hq", code: "demo-hq", th: "[DEMO] ต้นกล้า โฮลดิ้ง (สำนักงานกลาง)", en: "Tonkla Holding", bu: "hq" },
];
const DEPTS = ["ฝ่ายปฏิบัติการ", "ฝ่ายบุคคลและธุรการ", "ฝ่ายขายและการตลาด"];
const POSITIONS = ["ผู้จัดการ", "หัวหน้างาน", "เจ้าหน้าที่"];
const NAMES = { food: "ฟู้ดส์", pack: "แพคเกจจิ้ง", retail: "รีเทล", logi: "โลจิสติกส์", tech: "เทค", health: "เฮลท์แคร์", hq: "ส่วนกลาง" };
const USERS = [
  { id: "owner.group", name: "เจ้าของกลุ่ม (ตัวอย่าง)", co: "hq", role: "group_owner" },
  { id: "central.team1", name: "ทีมกลาง 1 (ตัวอย่าง)", co: "hq", role: "central_team" },
  { id: "central.team2", name: "ทีมกลาง 2 (ตัวอย่าง)", co: "hq", role: "central_team" },
  { id: "admin.system", name: "ผู้ดูแลระบบ (ตัวอย่าง)", co: "hq", admin: true },
];
for (const c of COMPANIES.filter((x) => x.slug !== "hq")) {
  USERS.push({ id: `coordinator.${c.slug}`, name: `ผู้ประสานงาน ${NAMES[c.slug]}`, co: c.slug, role: "coordinator", dept: 0, pos: 0 });
  if (c.exec) USERS.push({ id: `exec.${c.slug}`, name: `ผู้บริหาร ${NAMES[c.slug]}`, co: c.slug, role: "company_exec", dept: 0, pos: 0 });
  USERS.push({ id: `supervisor.${c.slug}`, name: `หัวหน้างาน ${NAMES[c.slug]}`, co: c.slug, role: "supervisor", dept: 0, pos: 1 });
  USERS.push({ id: `employee1.${c.slug}`, name: `พนักงาน 1 ${NAMES[c.slug]}`, co: c.slug, dept: 0, pos: 2, sup: `supervisor.${c.slug}` });
  USERS.push({ id: `employee2.${c.slug}`, name: `พนักงาน 2 ${NAMES[c.slug]}`, co: c.slug, dept: 1, pos: 2, sup: `supervisor.${c.slug}` });
}
const email = (id) => `${id}@${DOMAIN}`;

// ------------------------------------------------------------------ step 1: structure (companies, people, rights, switches)
async function setup() {
  console.log("== setup");
  const admin = (await sql("select u.id from auth.users u join public.platform_admins a on a.user_id = u.id where u.email = 'geeravut@gmail.com'"))[0]?.id;
  if (!admin) throw new Error("the owner's admin account was not found");
  const tpl = (await sql("select id from public.company_templates limit 1"))[0]?.id;
  // business units + companies, created the way an administrator does (template categories and criteria included)
  const buIds = {};
  for (const b of BUS) {
    const r = await sql(`insert into public.business_units (name_th) select '${q1(b.name)}' where not exists (select 1 from public.business_units where name_th = '${q1(b.name)}'); select id from public.business_units where name_th = '${q1(b.name)}'`);
    buIds[b.key] = r[0].id;
  }
  for (const c of COMPANIES) {
    const have = await sql(`select id from public.companies where code = '${c.code}'`);
    if (have.length) continue;
    await sql(`do $$ begin perform set_config('request.jwt.claims', json_build_object('sub','${admin}','role','authenticated')::text, true); set local role authenticated;
      perform public.admin_create_company('${c.code}', '${q1(c.th)}', '${q1(c.en)}', '${buIds[c.bu]}', '${tpl}'); end $$`);
  }
  const co = Object.fromEntries((await sql("select id, code from public.companies where code like 'demo-%'")).map((r) => [r.code.slice(5), r.id]));
  for (const slug of Object.keys(co)) {
    await sql(`update public.companies set status = 'active', pilot_cap_thb = 30000 where id = '${co[slug]}'`);
    for (const d of DEPTS) await sql(`insert into public.departments (company_id, name_th) select '${co[slug]}', '${d}' where not exists (select 1 from public.departments where company_id = '${co[slug]}' and name_th = '${d}')`);
    for (const p of POSITIONS) await sql(`insert into public.positions (company_id, name_th) select '${co[slug]}', '${p}' where not exists (select 1 from public.positions where company_id = '${co[slug]}' and name_th = '${p}')`);
    // every Phase 2 and 3 feature, and the AI assistant, on for the demo companies
    await sql(`insert into public.company_features (company_id, key, enabled) select '${co[slug]}', k, true from unnest(array['anonymous_channel','emergency','qa','events','polls','challenges','idea_library','recognition','knowledge_base','group_dashboard','teams','idea_adoption','pilot_budget','communities','annual_awards','ai_assistant']) k on conflict (company_id, key) do update set enabled = true`);
  }
  // people
  const ids = {};
  for (const u of USERS) {
    const found = await sql(`select id from auth.users where email = '${email(u.id)}'`);
    if (found.length) {
      ids[u.id] = found[0].id;
      await fetch(`${URL_}/auth/v1/admin/users/${found[0].id}`, { method: "PUT", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ password: PASSWORD }) });
      continue;
    }
    const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: email(u.id), password: PASSWORD, email_confirm: true, user_metadata: { display_name: u.name } }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`create ${u.id}: ${JSON.stringify(j).slice(0, 200)}`);
    ids[u.id] = j.id;
  }
  // a person waiting to be admitted (shows the join flow)
  const pend = await sql(`select id from auth.users where email = 'pending.newcomer@${DOMAIN}'`);
  if (!pend.length) {
    const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: `pending.newcomer@${DOMAIN}`, password: PASSWORD, email_confirm: true, user_metadata: { display_name: "ผู้สมัครใหม่ รอการอนุมัติ (ตัวอย่าง)" } }) });
    if (!r.ok) throw new Error("create pending user");
  }
  const dept = Object.fromEntries((await sql("select d.id, d.name_th, c.code from public.departments d join public.companies c on c.id = d.company_id where c.code like 'demo-%'")).map((r) => [`${r.code.slice(5)}|${r.name_th}`, r.id]));
  const pos = Object.fromEntries((await sql("select p.id, p.name_th, c.code from public.positions p join public.companies c on c.id = p.company_id where c.code like 'demo-%'")).map((r) => [`${r.code.slice(5)}|${r.name_th}`, r.id]));
  for (const u of USERS) {
    const id = ids[u.id];
    await sql(`update public.profiles set display_name = '${q1(u.name)}', status = 'active', locale = 'th', must_change_password = false where id = '${id}'`);
    await sql(`insert into public.memberships (user_id, company_id, department_id, position_id, is_primary, employee_code, work_email) values ('${id}', '${co[u.co]}', ${u.dept != null ? `'${dept[`${u.co}|${DEPTS[u.dept]}`]}'` : "null"}, ${u.pos != null ? `'${pos[`${u.co}|${POSITIONS[u.pos]}`]}'` : "null"}, true, 'D-${u.id.slice(0, 12)}', '${email(u.id)}') on conflict (user_id, company_id) do nothing`);
    if (u.role) {
      const group = u.role === "central_team" || u.role === "group_owner";
      await sql(`insert into public.role_assignments (user_id, role, scope_type, scope_id) values ('${id}', '${u.role}', '${group ? "group" : "company"}', ${group ? "null" : `'${co[u.co]}'`}) on conflict do nothing`);
    }
    if (u.admin) await sql(`insert into public.platform_admins (user_id) values ('${id}') on conflict do nothing`);
  }
  for (const u of USERS.filter((x) => x.sup)) {
    await sql(`update public.memberships set supervisor_membership_id = (select id from public.memberships where user_id = '${ids[u.sup]}' and company_id = '${co[u.co]}') where user_id = '${ids[u.id]}' and company_id = '${co[u.co]}'`);
  }
  // the central handler of anonymous complaints
  await sql(`do $$ begin perform set_config('request.jwt.claims', json_build_object('sub','${admin}','role','authenticated')::text, true); set local role authenticated; perform public.admin_set_anon_handler('${ids["central.team1"]}', true); end $$`);
  console.log(`companies ${Object.keys(co).length}, users ${USERS.length + 1}`);
  return { co, ids, admin };
}

// ------------------------------------------------------------------ step 2: people use the system
const tokens = {};
async function login(id) {
  if (tokens[id]) return tokens[id];
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: email(id), password: PASSWORD }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`sign-in ${id}: ${JSON.stringify(j).slice(0, 150)}`);
  return (tokens[id] = j.access_token);
}
const hdr = async (id, extra = {}) => ({ apikey: ANON, Authorization: `Bearer ${await login(id)}`, "Content-Type": "application/json", ...extra });
async function rpc(id, fn, args = {}) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: await hdr(id), body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function insert(id, table, row) {
  const r = await fetch(`${URL_}/rest/v1/${table}`, { method: "POST", headers: await hdr(id, { Prefer: "return=representation" }), body: JSON.stringify(row) });
  const t = await r.text();
  if (!r.ok) throw new Error(`insert ${table}: ${t.slice(0, 200)}`);
  return JSON.parse(t)[0];
}
async function upload(id, path, file) {
  const bytes = readFileSync(file);
  const r = await fetch(`${URL_}/storage/v1/object/report-files/${path}`, { method: "POST", headers: await hdr(id, { "Content-Type": "image/png", "x-upsert": "false" }), body: bytes });
  if (!r.ok) throw new Error(`upload: ${(await r.text()).slice(0, 150)}`);
  return { path, mime: "image/png", bytes: bytes.length };
}
const audit = (actor, action, entity, entityId, company) => fetch(`${URL_}/rest/v1/audit_log`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ source: "app", actor_id: actor, action, entity, entity_id: entityId ?? null, company_id: company ?? null, detail: { demo: true } }) });

const log = [];
let ctx;
async function tx(who, label, fn, audited) {
  try {
    const out = await fn();
    log.push({ who, label, ok: true });
    if (audited) await audit(ctx.ids[who], audited.action, audited.entity, audited.id ?? (typeof out === "string" ? out : null), audited.company ? ctx.co[audited.company] : null);
    console.log(`  ✓ ${who.padEnd(20)} ${label}`);
    return out;
  } catch (e) {
    log.push({ who, label, ok: false, error: e.message });
    console.log(`  ✗ ${who.padEnd(20)} ${label}  -> ${e.message.slice(0, 160)}`);
    return null;
  }
}
const uuid = () => crypto.randomUUID();
const idea = (who, co, type, title, problem, benefit) => tx(who, `ส่งไอเดีย: ${title}`, () => rpc(who, "submit_idea", { p_id: uuid(), p_company: ctx.co[co], p_type: type, p_title: title, p_problem: problem, p_customers: "", p_benefit: benefit, p_resources: "", p_report: null }), { action: "idea.submit", entity: "ideas", company: co });
const step = (who, id, to, note = "") => tx(who, `ย้ายไอเดียไประยะ ${to}`, () => rpc(who, "idea_transition", { p_id: id, p_to: to, p_note: note }), { action: "idea.transition", entity: "ideas", id });
const soon = (h = 72) => new Date(Date.now() + h * 3600_000).toISOString();

async function simulate(base) {
  ctx = base;
  const { co, ids } = ctx;
  console.log("== simulate");
  const cats = await sql("select c.id, c.key, co.code from public.report_categories c join public.companies co on co.id = c.company_id where co.code like 'demo-%'");
  const cat = (slug, key) => (cats.find((c) => c.code === `demo-${slug}` && c.key === key) ?? cats.find((c) => c.code === `demo-${slug}`)).id;
  const crit = await sql("select ic.id, co.code from public.idea_criteria ic join public.companies co on co.id = ic.company_id where co.code like 'demo-%'");
  const critOf = (slug) => crit.filter((c) => c.code === `demo-${slug}`).map((c) => c.id);

  // ---- communication
  const a1 = await tx("central.team1", "ประกาศถึงทั้งกลุ่ม: สารจากประธาน (ต้องรับทราบ)", async () => {
    const a = await insert("central.team1", "announcements", { author_id: ids["central.team1"], company_id: null, kind: "must_read", title: "สารจากประธานกลุ่ม: ปีนี้เรามุ่งลดของเสียลง 10%", body: "ทุกบริษัทในกลุ่มต้นกล้าร่วมกันลดของเสียในกระบวนการให้ได้ 10% ภายในสิ้นปี\n\nเสนอปัญหาที่พบและวิธีแก้ผ่านระบบต้นกล้า ผู้ที่ไอเดียถูกนำไปใช้จริงจะได้รับการยกย่องในระดับกลุ่ม\n\nขอบคุณทุกคนที่ร่วมกันครับ", requires_ack: true, ack_due_at: soon(24 * 14) });
    await insert("central.team1", "announcement_audiences", { announcement_id: a.id, audience_type: "group", target_id: null });
    await rpc("central.team1", "publish_announcement", { p_id: a.id });
    return a.id;
  }, { action: "announcement.publish", entity: "announcements" });
  const a2 = await tx("coordinator.food", "ประกาศข่าวบริษัท: ปรับเวลากะผลิตสัปดาห์หน้า", async () => {
    const a = await insert("coordinator.food", "announcements", { author_id: ids["coordinator.food"], company_id: co.food, kind: "news", title: "ปรับเวลากะผลิตสัปดาห์หน้า เพื่อซ่อมบำรุงไลน์ 2", body: "ไลน์ผลิต 2 จะหยุดซ่อมบำรุงวันพุธ 08:00–12:00 กะเช้าให้ไปช่วยไลน์ 1\nหัวหน้างานจะแจ้งรายชื่อภายในวันจันทร์", requires_ack: false });
    await rpc("coordinator.food", "publish_announcement", { p_id: a.id });
    return a.id;
  }, { action: "announcement.publish", entity: "announcements", company: "food" });
  if (a1) {
    await tx("employee1.food", "อ่านและรับทราบประกาศกลุ่ม", async () => { await rpc("employee1.food", "mark_announcement_read", { p_id: a1 }); await rpc("employee1.food", "ack_announcement", { p_id: a1 }); }, { action: "announcement.ack", entity: "announcements", id: a1, company: "food" });
    await tx("employee2.retail", "รับทราบประกาศกลุ่ม", async () => { await rpc("employee2.retail", "ack_announcement", { p_id: a1 }); }, { action: "announcement.ack", entity: "announcements", id: a1, company: "retail" });
    await tx("supervisor.pack", "อ่านประกาศกลุ่ม", async () => { await rpc("supervisor.pack", "mark_announcement_read", { p_id: a1 }); });
  }
  if (a2) {
    await tx("employee1.food", "กดถูกใจประกาศบริษัท", () => insert("employee1.food", "reactions", { entity_type: "announcement", entity_id: a2, user_id: ids["employee1.food"] }));
    await tx("employee2.food", "แสดงความเห็นในประกาศบริษัท", () => insert("employee2.food", "announcement_comments", { announcement_id: a2, author_id: ids["employee2.food"], body: "ขอรายชื่อกะที่ย้ายด้วยครับ จะได้วางแผนรถรับส่ง" }));
  }

  // ---- reports with pictures
  const R = [
    { who: "employee1.food", co: "food", cat: "equipment", sev: "high", title: "สายพานลำเลียงไลน์ 2 สะดุดบ่อย ทำให้กล่องติดที่รอยต่อ", desc: "ช่วงสายถึงบ่ายสายพานหยุดทุก 20-30 นาที ต้องมีคนไปเขี่ยกล่องออก", impact: "ผลิตได้น้อยลงวันละประมาณ 8% และเสี่ยงมือติดสายพาน", fix: "เปลี่ยนลูกกลิ้งที่รอยต่อและตั้งรอบตรวจทุกสัปดาห์", img: "belt" },
    { who: "employee2.food", co: "food", cat: "safety", sev: "medium", title: "พื้นโรงอาหารลื่นเมื่อฝนตก มีน้ำขังหน้าประตู", desc: "น้ำฝนไหลเข้าหน้าประตูทางเข้า พนักงานเกือบลื่นล้มหลายครั้ง", impact: "เสี่ยงลื่นล้ม", fix: "วางพรมกันลื่นและเพิ่มร่องระบายน้ำ", img: "wetfloor" },
    { who: "employee1.pack", co: "pack", cat: "equipment", sev: "high", title: "เครื่องซีลฝาแพ็คเกจรั่ว มีของเหลวหยดที่แท่นซีล", desc: "พบหยดที่แท่นซีลสายการผลิต A ตั้งแต่เมื่อวาน ชิ้นงานซีลไม่สนิท", impact: "ของเสียเพิ่มและเสี่ยงไฟรั่ว", fix: "เปลี่ยนซีลยางและตรวจท่อ", img: "seal" },
    { who: "employee1.retail", co: "retail", cat: "safety", sev: "medium", title: "ชั้นวางสินค้าโซนเครื่องดื่มเอียง เสี่ยงสินค้าหล่น", desc: "ชั้นที่ 3 เอียงจากน้ำหนักขวดน้ำ ลูกค้าเคยเกือบโดนสินค้าหล่น", impact: "เสี่ยงลูกค้าบาดเจ็บ", fix: "เสริมขายึดชั้นและจำกัดน้ำหนัก", img: "shelf" },
    { who: "employee1.logi", co: "logi", cat: "safety", sev: "critical", title: "รถโฟล์คลิฟท์คันที่ 3 ไฟเบรกไม่ติด", desc: "ไฟเบรกท้ายรถดับทั้งสองข้าง ใช้งานรอบกลางคืนทัศนวิสัยต่ำ", impact: "เสี่ยงชนคนเดินในคลัง", fix: "หยุดใช้งานจนกว่าจะซ่อม", img: "forklift" },
    { who: "employee2.tech", co: "tech", cat: "facility", sev: "high", title: "ห้องเซิร์ฟเวอร์อุณหภูมิสูงช่วงบ่าย แอร์ตัวที่ 2 ไม่เย็น", desc: "อุณหภูมิ 31 องศา เกินเกณฑ์ที่ผู้ผลิตกำหนด", impact: "เสี่ยงระบบล่มและข้อมูลเสียหาย", fix: "ซ่อมแอร์และติดตั้งเซนเซอร์แจ้งเตือน", img: "server" },
    { who: "employee1.health", co: "health", cat: "equipment", sev: "medium", title: "ตู้แช่ยาเสียงดังผิดปกติ คอมเพรสเซอร์ส่งเสียงดัง", desc: "ตู้แช่ยาห้องยาสาขา 1 เสียงดังตั้งแต่เช้า อุณหภูมิยังปกติ", impact: "ถ้าเสียยาอาจเสียหาย", fix: "ให้ช่างตรวจและย้ายยาไปตู้สำรองชั่วคราว", img: "freezer" },
  ];
  const rid = {};
  for (const r of R) {
    rid[r.img] = await tx(r.who, `แจ้งปัญหาพร้อมรูป: ${r.title.slice(0, 40)}…`, async () => {
      const id = uuid();
      const file = `${IMG}/${r.img}.png`;
      const att = existsSync(file) ? [await upload(r.who, `${co[r.co]}/${id}/${r.img}.png`, file)] : [];
      return rpc(r.who, "submit_report", { p_id: id, p_company: co[r.co], p_category: cat(r.co, r.cat), p_severity: r.sev, p_title: r.title, p_description: r.desc, p_impact: r.impact, p_fix: r.fix, p_attachments: att });
    }, { action: "report.submit", entity: "reports", company: r.co });
  }
  if (rid.belt) await tx("employee2.food", "กด 'ฉันก็เจอ' ในเรื่องสายพาน", () => rpc("employee2.food", "report_metoo", { p_id: rid.belt }), { action: "report.metoo", entity: "reports", id: rid.belt, company: "food" });
  if (rid.wetfloor) await tx("supervisor.food", "หัวหน้างานปิดเรื่องเล็กทันที (quick fix)", () => rpc("supervisor.food", "report_quick_fix", { p_id: rid.wetfloor, p_note: "วางพรมกันลื่นหน้าประตูแล้ว และให้แม่บ้านเช็ดพื้นทุกชั่วโมงช่วงฝนตก" }), { action: "report.quick_fix", entity: "reports", id: rid.wetfloor, company: "food" });
  if (rid.belt) {
    await tx("coordinator.food", "ผู้ประสานงานรับเรื่องสายพาน", () => rpc("coordinator.food", "report_transition", { p_id: rid.belt, p_to: "acknowledged", p_note: "รับเรื่องแล้ว ส่งช่างตรวจพรุ่งนี้" }), { action: "report.transition", entity: "reports", id: rid.belt, company: "food" });
    await tx("coordinator.food", "แก้ไขเรื่องสายพานแล้ว (ได้แนวปฏิบัติอัตโนมัติ)", () => rpc("coordinator.food", "report_transition", { p_id: rid.belt, p_to: "resolved", p_note: "เปลี่ยนลูกกลิ้งที่รอยต่อและตั้งรอบตรวจทุกวันศุกร์ ของเสียที่ไลน์ 2 ลดลงเห็นผลภายในสัปดาห์" }), { action: "report.transition", entity: "reports", id: rid.belt, company: "food" });
  }
  if (rid.seal) await tx("coordinator.pack", "รับเรื่องเครื่องซีลรั่ว", () => rpc("coordinator.pack", "report_transition", { p_id: rid.seal, p_to: "acknowledged", p_note: "รับเรื่อง ช่างจะเปลี่ยนซีลยางวันนี้" }), { action: "report.transition", entity: "reports", id: rid.seal, company: "pack" });
  if (rid.forklift) {
    await tx("coordinator.logi", "รับเรื่องโฟล์คลิฟท์ (วิกฤต)", () => rpc("coordinator.logi", "report_transition", { p_id: rid.forklift, p_to: "acknowledged", p_note: "สั่งหยุดใช้รถคันนี้ทันที" }), { action: "report.transition", entity: "reports", id: rid.forklift, company: "logi" });
    await tx("coordinator.logi", "เริ่มดำเนินการซ่อมโฟล์คลิฟท์", () => rpc("coordinator.logi", "report_transition", { p_id: rid.forklift, p_to: "in_progress", p_note: "" }), { action: "report.transition", entity: "reports", id: rid.forklift, company: "logi" });
  }
  if (rid.server) await tx("central.team2", "ทีมกลางแก้เรื่องเซิร์ฟเวอร์และบันทึกวิธีแก้", async () => { await rpc("central.team2", "report_transition", { p_id: rid.server, p_to: "acknowledged", p_note: "รับเรื่อง" }); await rpc("central.team2", "report_transition", { p_id: rid.server, p_to: "resolved", p_note: "ซ่อมคอมเพรสเซอร์แอร์ตัวที่ 2 และติดเซนเซอร์อุณหภูมิแจ้งเตือนเมื่อเกิน 28 องศา" }); }, { action: "report.transition", entity: "reports", id: rid.server, company: "tech" });

  // ---- ideas, votes, pipeline, outcomes, adoption
  const i1 = await idea("employee1.food", "food", "process_improvement", "ใช้ QR Code แทนใบเบิกวัสดุในคลัง", "ใบเบิกกระดาษช้าและกรอกผิดบ่อย ต้องรอหัวหน้าเซ็น", "ลดเวลาเบิกจาก 15 เป็น 3 นาที และลดความผิดพลาด");
  const i2 = await idea("employee2.pack", "pack", "cost_reduction", "ปรับตารางเปิดเครื่องอัดขึ้นรูปเพื่อลดค่าไฟช่วงพีค", "เปิดเครื่องพร้อมกันตอนเช้า ทำให้ค่าไฟช่วง on-peak สูง", "ลดค่าไฟประมาณ 12% ต่อเดือน");
  const i3 = await idea("employee1.retail", "retail", "new_revenue", "บริการจัดส่งสินค้าภายใน 2 ชั่วโมงในกรุงเทพ", "ลูกค้าถามหาบริการส่งด่วนบ่อย เรายังไม่มี", "เพิ่มรายได้จากลูกค้าออนไลน์");
  const i4 = await idea("employee1.tech", "tech", "new_product_service", "แอปจองห้องประชุมกลางสำหรับทุกบริษัทในกลุ่ม", "แต่ละบริษัทจองห้องคนละระบบ ทำให้ห้องว่างแต่จองไม่ได้", "ใช้ห้องร่วมกันได้และลดเวลาประสานงาน");
  const i5 = await idea("employee2.logi", "logi", "process_improvement", "จัดเส้นทางรถส่งของด้วยโปรแกรมแทนการจัดด้วยมือ", "จัดเส้นทางด้วยมือใช้เวลานานและระยะทางไม่เหมาะสม", "ลดระยะทางรวมและน้ำมัน");
  const i6 = await idea("employee2.health", "health", "cost_reduction", "ใช้ขวดยาแบบเติมซ้ำสำหรับยาน้ำที่ใช้บ่อย", "ซื้อขวดใหม่ทุกครั้งสิ้นเปลือง", "ลดต้นทุนบรรจุภัณฑ์");
  const i7 = await idea("employee2.food", "food", "process_improvement", "ติดตั้งตู้กดน้ำร้อนสำหรับพนักงานทุกชั้น", "พนักงานต้องเดินไปไกลเพื่อเติมน้ำร้อน", "ลดเวลาเดินและเพิ่มความพึงพอใจ");
  if (i1) {
    await tx("employee2.food", "โหวตไอเดีย QR Code", () => rpc("employee2.food", "idea_toggle_vote", { p_id: i1 }), { action: "idea.vote", entity: "ideas", id: i1, company: "food" });
    await tx("supervisor.food", "โหวตไอเดีย QR Code", () => rpc("supervisor.food", "idea_toggle_vote", { p_id: i1 }), { action: "idea.vote", entity: "ideas", id: i1, company: "food" });
    await tx("supervisor.food", "ให้ความเห็นไอเดีย QR Code", () => insert("supervisor.food", "idea_comments", { idea_id: i1, author_id: ids["supervisor.food"], body: "ทีมคลังพร้อมทดลองที่โซน A ก่อนครับ" }));
    await step("coordinator.food", i1, "screening");
    await step("coordinator.food", i1, "evaluating");
    await tx("coordinator.food", "ให้คะแนนตามเกณฑ์ที่เปิดเผย", async () => { for (const c of critOf("food").slice(0, 3)) await rpc("coordinator.food", "idea_score", { p_idea: i1, p_criterion: c, p_score: 4, p_comment: "" }); });
    await step("coordinator.food", i1, "piloting");
    const out = await tx("coordinator.food", "บันทึกผลลัพธ์: ลดเวลาเบิก", () => rpc("coordinator.food", "idea_add_outcome", { p_idea: i1, p_metric: "time_saved_hours", p_value: 120, p_start: "2026-10-01", p_end: "2026-10-31", p_note: "เทียบเวลาเบิกก่อนและหลังใช้ QR" }));
    if (out) await tx("exec.food", "ผู้บริหารยืนยันผลลัพธ์ (คนที่สอง)", () => rpc("exec.food", "idea_verify_outcome", { p_outcome: out }), { action: "idea.outcome_verify", entity: "idea_outcomes", id: out, company: "food" });
    const out2 = await tx("coordinator.food", "บันทึกผลลัพธ์: ประหยัดเงิน", () => rpc("coordinator.food", "idea_add_outcome", { p_idea: i1, p_metric: "money_saved_thb", p_value: 48000, p_start: "2026-10-01", p_end: "2026-10-31", p_note: "ลดกระดาษและของเสียจากการเบิกผิด" }));
    if (out2) await tx("exec.food", "ผู้บริหารยืนยันผลลัพธ์เงินที่ประหยัด", () => rpc("exec.food", "idea_verify_outcome", { p_outcome: out2 }));
    await step("coordinator.food", i1, "scaled", "ขยายผลทุกคลังของบริษัท");
    await tx("coordinator.food", "เปิดไอเดียให้ทั้งกลุ่มเห็น", () => rpc("coordinator.food", "idea_set_visibility", { p_id: i1, p_visibility: "group" }), { action: "idea.share", entity: "ideas", id: i1, company: "food" });
    await tx("coordinator.retail", "นำไอเดีย QR Code ไปใช้ที่บริษัทรีเทล", () => rpc("coordinator.retail", "idea_adopt", { p_source: i1, p_company: co.retail }), { action: "idea.adopt", entity: "ideas", id: i1, company: "retail" });
    await tx("coordinator.food", "มอบรางวัลผลงานเด่นประจำเดือน", () => rpc("coordinator.food", "award_grant", { p_idea: i1, p_kind: "monthly_highlight", p_note: "ลดเวลาเบิกวัสดุได้จริงและขยายผลทั้งคลัง" }), { action: "recognition.award", entity: "awards", company: "food" });
    await tx("central.team1", "มอบรางวัลประจำปีระดับกลุ่ม: ผลลัพธ์ยอดเยี่ยม", () => rpc("central.team1", "annual_award_grant", { p_idea: i1, p_category: "impact_of_year", p_note: "ประหยัดเวลา 120 ชั่วโมงและเงิน 48,000 บาท ยืนยันโดยผู้บริหาร" }), { action: "annual.award", entity: "annual_awards" });
  }
  if (i2) {
    await step("coordinator.pack", i2, "screening");
    await step("coordinator.pack", i2, "evaluating");
    const b = await tx("coordinator.pack", "ขอเงินทดลอง 15,000 บาท", () => rpc("coordinator.pack", "budget_request", { p_idea: i2, p_amount: 15000, p_purpose: "ซื้อมิเตอร์วัดพลังงานรายเครื่องเพื่อทดลองตารางเปิดเครื่องใหม่" }), { action: "budget.request", entity: "pilot_budgets", company: "pack" });
    if (b) {
      await tx("central.team1", "ทีมกลางอนุมัติงบทดลอง (คนที่สอง)", () => rpc("central.team1", "budget_decide", { p_id: b, p_approve: true, p_note: "อนุมัติ ทดลอง 1 เดือน" }), { action: "budget.decide", entity: "pilot_budgets", id: b, company: "pack" });
      await step("coordinator.pack", i2, "piloting");
      await tx("coordinator.pack", "บันทึกการใช้จ่ายงบทดลอง", () => rpc("coordinator.pack", "budget_spend", { p_id: b, p_amount: 9800, p_note: "มิเตอร์ 4 ตัว" }), { action: "budget.spend", entity: "pilot_budgets", id: b, company: "pack" });
    }
  }
  if (i3) { await step("coordinator.retail", i3, "screening"); await step("coordinator.retail", i3, "evaluating"); }
  if (i4) {
    await step("coordinator.tech", i4, "screening");
    await step("coordinator.tech", i4, "evaluating");
    await step("coordinator.tech", i4, "piloting");
    const team = await tx("coordinator.tech", "ตั้งทีมข้ามบริษัทสำหรับแอปจองห้อง", () => rpc("coordinator.tech", "team_create", { p_idea: i4, p_name: "ทีมระบบจองห้องกลาง", p_purpose: "ทดลองระบบจองห้องร่วมกัน 3 บริษัท" }), { action: "team.create", entity: "teams", company: "tech" });
    if (team) {
      await tx("coordinator.tech", "เชิญผู้ประสานงานรีเทลและเฮลท์แคร์เข้าทีม", async () => { await rpc("coordinator.tech", "team_invite", { p_team: team, p_user: ids["coordinator.retail"] }); await rpc("coordinator.tech", "team_invite", { p_team: team, p_user: ids["employee1.health"] }); }, { action: "team.invite", entity: "teams", id: team, company: "tech" });
      await tx("coordinator.retail", "ตอบรับเข้าทีมข้ามบริษัท", () => rpc("coordinator.retail", "team_respond", { p_team: team, p_accept: true }));
      await tx("coordinator.tech", "โพสต์ถึงทีม: นัดประชุมเริ่มงาน", () => rpc("coordinator.tech", "team_post", { p_team: team, p_body: "นัดประชุมเริ่มทดลองวันพฤหัสบดีนี้ 10:00 ที่ห้องประชุมกลาง ขอรายการห้องของแต่ละบริษัทด้วยครับ" }));
    }
  }
  if (i5) await tx("employee2.logi", "ผูกไอเดียกับโจทย์ท้าทายของกลุ่ม", async () => {
    const ch = await tx("central.team1", "ตั้งโจทย์ท้าทายของกลุ่ม: ลดต้นทุนขนส่ง 8%", () => rpc("central.team1", "challenge_create", { p_company: null, p_title: "ลดต้นทุนการขนส่งทั้งกลุ่ม 8% ภายในสิ้นปี", p_description: "ไอเดียที่ลดระยะทาง น้ำมัน หรือเที่ยวเปล่าได้จริง", p_goal: "ต้นทุนโลจิสติกส์ลด 8%", p_closes: soon(24 * 60) }), { action: "challenge.create", entity: "challenges" });
    if (ch) await rpc("employee2.logi", "idea_link_challenge", { p_idea: i5, p_challenge: ch });
  });
  if (i6) { await step("coordinator.health", i6, "screening"); }
  if (i7) {
    await step("coordinator.food", i7, "screening");
    await step("coordinator.food", i7, "evaluating");
    await step("coordinator.food", i7, "piloting");
    await step("coordinator.food", i7, "declined", "ทดลองตู้กดน้ำ 1 เดือน พบว่าตู้ใช้ไฟมากเกินคาดและคนใช้น้อย เหมาะกับจุดรวมมากกว่าทุกชั้น");
    await tx("coordinator.food", "มอบรางวัล 'กล้าลอง' (ทดลองแล้วไม่สำเร็จแต่ได้บทเรียน)", () => rpc("coordinator.food", "award_grant", { p_idea: i7, p_kind: "dare_to_try", p_note: "ทดลองจริงและบันทึกบทเรียนเรื่องจุดวางตู้" }), { action: "recognition.award", entity: "awards", company: "food" });
  }

  // ---- events, polls, Q&A
  const ev = await tx("central.team1", "สร้างกิจกรรมของกลุ่ม: วันต้นกล้าร่วมใจ", () => rpc("central.team1", "event_create", { p_company: null, p_title: "วันต้นกล้าร่วมใจ: แบ่งปันไอเดียทั้งกลุ่ม", p_description: "เวทีนำเสนอไอเดียที่ถูกนำไปใช้จริงและรับรางวัลประจำปี", p_starts: soon(24 * 21), p_ends: soon(24 * 21 + 5), p_location: "ศูนย์ประชุม สำนักงานกลาง", p_link: "https://example.com/tonkla-day", p_capacity: 200 }), { action: "event.create", entity: "events" });
  await tx("coordinator.retail", "สร้างกิจกรรมบริษัท: อบรมความปลอดภัยในร้าน", () => rpc("coordinator.retail", "event_create", { p_company: co.retail, p_title: "อบรมความปลอดภัยในร้าน (ชั้นวางและการยกของ)", p_description: "สำหรับพนักงานหน้าร้านทุกสาขา", p_starts: soon(24 * 10), p_ends: soon(24 * 10 + 3), p_location: "ห้องอบรมชั้น 3", p_link: "", p_capacity: 40 }), { action: "event.create", entity: "events", company: "retail" });
  if (ev) for (const [who, r] of [["employee1.food", "going"], ["employee2.retail", "going"], ["employee1.tech", "maybe"], ["employee1.pack", "going"]])
    await tx(who, `ตอบรับกิจกรรมกลุ่ม: ${r}`, () => rpc(who, "event_rsvp", { p_id: ev, p_response: r }));
  const poll = await tx("central.team1", "สร้างโพล: วันหยุดพิเศษประจำปี", () => rpc("central.team1", "poll_create", { p_company: null, p_question: "อยากให้บริษัทเพิ่มวันหยุดพิเศษประจำปีวันไหน", p_options: ["วันศุกร์หลังวันปีใหม่", "วันจันทร์หลังสงกรานต์", "วันเกิดพนักงาน (ลาได้ 1 วัน)"], p_multi: false, p_mode: "after_vote", p_closes: soon(24 * 14) }), { action: "poll.create", entity: "polls" });
  if (poll) {
    const opts = await sql(`select id from public.poll_options where poll_id = '${poll}' order by pos`);
    for (const [who, n] of [["employee1.food", 2], ["employee2.pack", 2], ["employee1.retail", 0], ["employee2.tech", 2], ["supervisor.logi", 1]])
      await tx(who, "ลงคะแนนโพล", () => rpc(who, "poll_vote", { p_id: poll, p_options: [opts[n].id] }));
  }
  const qa = await tx("central.team1", "เปิดรอบถามตอบผู้บริหาร", () => rpc("central.team1", "qa_create_session", { p_company: null, p_title: "ถามตอบกับประธานกลุ่ม ไตรมาสสุดท้าย", p_description: "ถามได้ทุกเรื่องเกี่ยวกับทิศทางของกลุ่ม", p_closes: soon(24 * 20) }), { action: "qa.session", entity: "qa_sessions" });
  if (qa) {
    const q1 = await tx("employee1.pack", "ตั้งคำถามถึงผู้บริหาร", () => rpc("employee1.pack", "qa_ask", { p_session: qa, p_body: "แผนลงทุนเครื่องจักรใหม่ปีหน้าจะครอบคลุมโรงงานบรรจุภัณฑ์ไหมครับ", p_hide: false }));
    const q2 = await tx("employee2.logi", "ตั้งคำถามแบบไม่แสดงชื่อ", () => rpc("employee2.logi", "qa_ask", { p_session: qa, p_body: "จะมีโครงการพัฒนาทักษะให้พนักงานคลังสินค้าไหม", p_hide: true }));
    await tx("employee1.health", "ตั้งคำถามถึงผู้บริหาร", () => rpc("employee1.health", "qa_ask", { p_session: qa, p_body: "สวัสดิการตรวจสุขภาพประจำปีจะเพิ่มเติมอะไรบ้าง", p_hide: false }));
    if (q1) await tx("employee1.food", "โหวตคำถามที่อยากให้ตอบ", () => rpc("employee1.food", "qa_vote", { p_question: q1 }));
    if (q2) await tx("employee2.tech", "โหวตคำถามที่อยากให้ตอบ", () => rpc("employee2.tech", "qa_vote", { p_question: q2 }));
    if (q1) await tx("central.team1", "ตอบคำถามในรอบถามตอบ", () => rpc("central.team1", "qa_answer", { p_question: q1, p_answer: "ปีหน้ามีงบเครื่องจักรสำหรับโรงงานบรรจุภัณฑ์ 2 สายการผลิต ผู้ประสานงานจะแจ้งรายละเอียดภายในไตรมาสแรก" }), { action: "qa.answer", entity: "qa_questions" });
  }

  // ---- emergency
  const em = await tx("employee1.logi", "แจ้งเหตุฉุกเฉิน: พนักงานมือถูกบาด", () => rpc("employee1.logi", "report_emergency", { p_company: co.logi, p_category: "safety", p_place: "คลังสินค้า โซน B", p_body: "พนักงานถูกขอบลังไม้บาดมือ เลือดออกพอสมควร ต้องการปฐมพยาบาล", p_phone: "081-234-5678" }), { action: "emergency.report", entity: "emergency_incidents", company: "logi" });
  if (em) {
    await tx("coordinator.logi", "รับเรื่องฉุกเฉินและส่งปฐมพยาบาล", () => rpc("coordinator.logi", "emergency_set_status", { p_id: em, p_status: "acknowledged", p_note: "ส่งเจ้าหน้าที่ปฐมพยาบาลไปแล้ว" }), { action: "emergency.status", entity: "emergency_incidents", id: em, company: "logi" });
    await tx("coordinator.logi", "ปิดเหตุฉุกเฉินเมื่อเรียบร้อย", () => rpc("coordinator.logi", "emergency_set_status", { p_id: em, p_status: "resolved", p_note: "ทำแผลเรียบร้อย ส่งตรวจที่คลินิกบริษัท" }), { action: "emergency.status", entity: "emergency_incidents", id: em, company: "logi" });
  }

  // ---- anonymous complaints (the server's job: signed token + code + secret; the people involved see no identity)
  const hash = (s) => createHmac("sha256", `anon-v1:${SERVICE}`).update(`secret:${s.trim().toUpperCase()}`).digest("hex");
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rnd = (n) => Array.from(randomBytes(n), (b) => ALPHA[b % ALPHA.length]).join("");
  const anon = [];
  for (const [cat, title, body] of [["complaint", "ขอร้องเรียนเรื่องการจัดกะที่ไม่เป็นธรรม", "หัวหน้าจัดกะดึกให้คนกลุ่มเดิมต่อเนื่องหลายเดือน ขอให้ตรวจสอบการหมุนเวียนกะ"], ["fraud", "สงสัยการเบิกค่าเดินทางซ้ำซ้อน", "พบเอกสารเบิกค่าเดินทางเที่ยวเดียวกันถูกเบิกสองครั้งในแผนกขาย ขอให้ตรวจสอบ"]]) {
    const code = `AN-${rnd(8)}`, secret = rnd(12);
    await tx("(ระบบ)", `รับเรื่องร้องเรียนไม่ระบุตัวตน (${cat})`, async () => {
      const r = await fetch(`${URL_}/rest/v1/rpc/anon_submit`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_nonce_hash: createHash("sha256").update(randomBytes(16)).digest("hex"), p_code: code, p_secret_hash: hash(secret), p_category: cat, p_title: title, p_body: body }) });
      if (!r.ok) throw new Error(await r.text());
      anon.push({ code, secret });
    });
  }
  const cases = await sql("select id from public.anonymous_reports where title like 'ขอร้องเรียน%' or title like 'สงสัยการเบิก%' order by day, case_code limit 2");
  if (cases[0]) await tx("central.team1", "ผู้จัดการเรื่องร้องเรียนตอบและเปลี่ยนสถานะ", async () => { await rpc("central.team1", "anon_set_status", { p_id: cases[0].id, p_status: "reviewing", p_note: "ได้รับเรื่องแล้ว กำลังตรวจสอบข้อมูลการจัดกะย้อนหลัง 3 เดือน" }); }, { action: "anon.status", entity: "anonymous_reports", id: cases[0].id });

  // ---- knowledge base and communities
  await tx("central.team1", "เพิ่มเอกสารกลาง: จรรยาบรรณของกลุ่ม", () => rpc("central.team1", "kb_save", { p_id: null, p_company: null, p_kind: "policy", p_title: "จรรยาบรรณของกลุ่มต้นกล้า", p_description: "หลักปฏิบัติของพนักงานทุกบริษัท", p_url: "https://example.com/tonkla-code-of-conduct", p_body: "1. ซื่อสัตย์และโปร่งใส\n2. เคารพซึ่งกันและกัน\n3. ปลอดภัยไว้ก่อน\n4. แจ้งปัญหาเมื่อพบเห็น ระบบไม่ลงโทษผู้แจ้งโดยสุจริต" }), { action: "knowledge.save", entity: "kb_documents" });
  await tx("coordinator.food", "เพิ่มเอกสารบริษัท: คู่มือขอลาและสวัสดิการ", () => rpc("coordinator.food", "kb_save", { p_id: null, p_company: co.food, p_kind: "manual", p_title: "คู่มือการลาและสวัสดิการพนักงาน ต้นกล้า ฟู้ดส์", p_description: "ลาป่วย ลากิจ ลาพักร้อน และสวัสดิการ", p_url: "", p_body: "ลาป่วย: แจ้งหัวหน้างานก่อน 08:30 ของวันที่ลา ถ้าลาเกิน 3 วันแนบใบรับรองแพทย์\nลากิจ: แจ้งล่วงหน้าอย่างน้อย 3 วัน\nลาพักร้อน: ยื่นผ่านหัวหน้างานล่วงหน้า 7 วัน" }), { action: "knowledge.save", entity: "kb_documents", company: "food" });
  await tx("coordinator.food", "เปิดแนวปฏิบัติที่ดีให้ทั้งกลุ่มเห็น", async () => { const p = (await sql(`select id from public.best_practices where company_id = '${co.food}' limit 1`))[0]; if (p) await rpc("coordinator.food", "practice_share", { p_id: p.id, p_on: true }); else throw new Error("no practice yet"); }, { action: "knowledge.practice_share", entity: "best_practices", company: "food" });
  const cf = await tx("central.team1", "สร้างชุมชนสายงานการเงิน", () => rpc("central.team1", "community_create", { p_key: "demo_finance", p_name_th: "ชุมชนการเงินและบัญชี", p_name_en: "Finance & Accounting", p_description: "คนการเงินและบัญชีจากทุกบริษัท แลกเปลี่ยนวิธีทำงานและระบบ" }), { action: "community.create", entity: "communities" });
  const ci = await tx("central.team1", "สร้างชุมชนสายงานไอที", () => rpc("central.team1", "community_create", { p_key: "demo_it", p_name_th: "ชุมชนไอที", p_name_en: "IT", p_description: "ทีมไอทีจากทุกบริษัท แชร์ความรู้ระบบและความปลอดภัย" }), { action: "community.create", entity: "communities" });
  if (cf) {
    for (const who of ["employee1.food", "employee2.retail", "supervisor.tech"]) await tx(who, "เข้าร่วมชุมชนการเงิน", () => rpc(who, "community_join", { p_id: cf }));
    const pst = await tx("employee1.food", "โพสต์ในชุมชนการเงิน: ถามเรื่องโปรแกรมบัญชี", () => rpc("employee1.food", "community_post", { p_id: cf, p_body: "ทุกบริษัทใช้โปรแกรมบัญชีตัวไหนกันครับ กำลังเปรียบเทียบเพื่อเปลี่ยนระบบ", p_parent: null }));
    if (pst) await tx("employee2.retail", "ตอบกระทู้ในชุมชนการเงิน", () => rpc("employee2.retail", "community_post", { p_id: cf, p_body: "รีเทลใช้ระบบ cloud ตัวหนึ่งมา 2 ปี ปิดงบเร็วขึ้นมาก ไว้ส่งรายละเอียดให้ครับ", p_parent: pst }));
    await tx("central.team1", "ตั้งผู้ดูแลชุมชนการเงิน", () => rpc("central.team1", "community_set_moderator", { p_id: cf, p_user: ids["employee1.food"], p_on: true }), { action: "community.moderator", entity: "communities", id: cf });
  }
  if (ci) {
    for (const who of ["employee1.tech", "employee2.health"]) await tx(who, "เข้าร่วมชุมชนไอที", () => rpc(who, "community_join", { p_id: ci }));
    await tx("employee1.tech", "โพสต์ในชุมชนไอที: เตือนเรื่องอีเมลหลอก", () => rpc("employee1.tech", "community_post", { p_id: ci, p_body: "ช่วงนี้มีอีเมลหลอกแอบอ้างฝ่ายบุคคลเยอะ ขอให้ทุกบริษัทเตือนพนักงานอย่ากดลิงก์", p_parent: null }));
  }
  return { anon };
}

// ------------------------------------------------------------------ run
const phase = process.argv[3] || "all";
const base = await setup();
if (phase !== "setup") {
  const res = await simulate(base);
  const ok = log.filter((l) => l.ok).length;
  console.log(`\n== done: ${ok} transactions succeeded, ${log.length - ok} failed`);
  for (const l of log.filter((x) => !x.ok)) console.log(`  FAILED ${l.who}: ${l.label} -> ${l.error}`);
  console.log("anonymous case codes (shown once, for the demo only):", res.anon.map((a) => `${a.code} / ${a.secret}`).join(" ; "));
}
