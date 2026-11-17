import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

let h: Db;
const CAT_A = UUID(701);
const CAT_B = UUID(702);
const CAT_ONLY = UUID(703);
type Dash = { days: number; companies: Record<string, number | string>[]; units: Record<string, number | string>[]; recurring: { key: string; companies: number; reports: number; open: number }[] };
const dash = async (user: string, days = 30) => h.as(user, async (q) => (await q<{ d: Dash }>("select public.group_dashboard($1) as d", [days])).rows[0]!.d);
const call = async (user: string, sql: string, params: unknown[] = []) => h.asCommit(user, async (q) => q(sql, params));

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.admin(async (q) => {
    await q("insert into public.report_categories (id, company_id, key, name_th) values ($1,$2,'equipment','อุปกรณ์'), ($3,$4,'equipment','อุปกรณ์'), ($5,$2,'safety','ความปลอดภัย')", [CAT_A, A, CAT_B, B, CAT_ONLY]);
  });
  // company A: two equipment reports and one safety; company B: one equipment report
  for (const [u, c, cat] of [[U.alice, A, CAT_A], [U.dave, A, CAT_A], [U.alice, A, CAT_ONLY], [U.bob, B, CAT_B]] as const)
    await call(u, "select public.submit_report($1,$2,$3,'medium','เรื่องทดสอบ','','','')", [crypto.randomUUID(), c, cat]);
});

describe("who may open the group dashboard", () => {
  it("only the central team: not staff, coordinators, executives or platform admins", async () => {
    for (const u of [U.alice, U.carol, U.dave, U.gina, U.frank, U.pam]) expect(await h.denied(u, "select public.group_dashboard(30)"), u).toMatch(/err_forbidden|permission/);
    expect((await dash(U.erin)).companies.length).toBe(2);
  });
});

describe("what it shows", () => {
  it("counts per company and per business unit; the unit adds up its companies", async () => {
    const d = await dash(U.erin);
    const a = d.companies.find((c) => c.company_id === A)!;
    const b = d.companies.find((c) => c.company_id === B)!;
    expect([a.reports_new, b.reports_new]).toEqual([3, 1]);
    expect(a.members).toBe(4); // alice, carol, dave and gina belong to company A in the seed
    expect(d.units).toHaveLength(1);
    expect(d.units[0]).toMatchObject({ companies: 2, reports_new: 4 });
  });
  it("participants are distinct people", async () => {
    const a = (await dash(U.erin)).companies.find((c) => c.company_id === A)!;
    expect(a.participants).toBe(2); // alice sent two reports, dave one
  });
  it("an issue category shows as recurring only when two or more companies have it", async () => {
    const r = (await dash(U.erin)).recurring;
    expect(r.map((x) => x.key)).toEqual(["equipment"]);
    expect(r[0]).toMatchObject({ companies: 2, reports: 3, open: 3 });
  });
  it("value counts only results a second person confirmed, inside the period", async () => {
    const idea = crypto.randomUUID();
    await call(U.alice, "select public.submit_idea($1,$2,'cost_reduction','ลดค่าไฟ','','','','',null)", [idea, A]);
    for (const to of ["screening", "evaluating", "piloting"]) await call(U.carol, "select public.idea_transition($1,$2,'')", [idea, to]);
    const out = (await call(U.carol, "select public.idea_add_outcome($1,'money_saved_thb',12000,'2026-11-01','2026-11-30','')", [idea])).rows[0] as { idea_add_outcome: string };
    expect(Number((await dash(U.erin)).companies.find((c) => c.company_id === A)!.value_money)).toBe(0); // not confirmed yet
    await call(U.gina, "select public.idea_verify_outcome($1)", [out.idea_add_outcome]);
    expect(Number((await dash(U.erin)).companies.find((c) => c.company_id === A)!.value_money)).toBe(12000);
    expect((await dash(U.erin)).companies.find((c) => c.company_id === A)!.ideas_adopted).toBe(1);
  });
  it("demo and inactive companies are left out", async () => {
    await h.admin((q) => q("update public.companies set is_demo = true where id = $1", [B]));
    expect((await dash(U.erin)).companies.map((c) => c.company_id)).toEqual([A]);
    await h.admin((q) => q("update public.companies set is_demo = false, status = 'paused' where id = $1", [B]));
    expect((await dash(U.erin)).companies.map((c) => c.company_id)).toEqual([A]);
    await h.admin((q) => q("update public.companies set status = 'active' where id = $1", [B]));
    expect((await dash(U.erin)).companies).toHaveLength(2);
  });
  it("returns no report text, idea title or person", async () => {
    const text = JSON.stringify(await dash(U.erin));
    expect(text).not.toMatch(/เรื่องทดสอบ|ลดค่าไฟ|alice|bob/);
  });
});
