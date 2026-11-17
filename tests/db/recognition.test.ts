import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

let h: Db;
const soon = () => new Date(Date.now() + 86_400_000).toISOString();
const rows = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.as(user, async (q) => (await q<T>(sql, params)).rows);
const call = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.asCommit(user, async (q) => (await q<T>(sql, params)).rows);
async function submit(user: string, company = A) {
  const id = crypto.randomUUID();
  await call(user, "select public.submit_idea($1,$2,'process_improvement','ใช้ QR แทนใบเบิก','เบิกช้า','','ลดเวลา','',null)", [id, company]);
  return id;
}
const move = async (id: string, ...stages: string[]) => {
  for (const s of stages) await call(U.carol, "select public.idea_transition($1,$2,'เหตุผลที่บันทึก')", [id, s]);
};
const points = async (user: string) => (await rows<{ points: number }>(user, "select points from public.recognition_points")).reduce((a, r) => a + r.points, 0);

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
});

describe("challenges", () => {
  let ch = "";
  it("executives and coordinators set them for their company, the central team for the group; staff cannot", async () => {
    expect(await h.denied(U.alice, "select public.challenge_create(null,'ลดของเสีย','','ลด 10%',$1)", [soon()])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.gina, "select public.challenge_create(null,'ลดของเสีย','','',$1)", [soon()])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.gina, "select public.challenge_create($1,'ลดของเสีย','','',$2)", [B, soon()])).toMatch(/err_forbidden|permission/);
    ch = (await call<{ challenge_create: string }>(U.erin, "select public.challenge_create(null,'ลดของเสียทั้งกลุ่ม','ทุกโรงงาน','ลด 10% ภายในปี',$1)", [soon()]))[0]!.challenge_create;
    await call(U.gina, "select public.challenge_create($1,'ลดค่าไฟบริษัท A','','',$2)", [A, soon()]);
  });
  it("people see group challenges and their own company's only", async () => {
    expect((await rows(U.alice, "select id from public.challenges_list()")).length).toBe(2);
    expect((await rows(U.bob, "select id from public.challenges_list()")).length).toBe(1);
    expect((await rows(U.pam, "select id from public.challenges_list()")).length).toBe(0);
  });
  it("only the submitter links an idea, to an open challenge that fits their company", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.dave, "select public.idea_link_challenge($1,$2)", [id, ch])).toMatch(/err_forbidden|permission/);
    await call(U.alice, "select public.idea_link_challenge($1,$2)", [id, ch]);
    expect((await rows<{ ideas: number }>(U.bob, "select ideas from public.challenges_list() where id = $1", [ch]))[0]!.ideas).toBe(1);
    const own = (await call<{ challenge_create: string }>(U.carol, "select public.challenge_create($1,'เฉพาะ A','','',$2)", [A, soon()]))[0]!.challenge_create;
    const bobIdea = await submit(U.bob, B);
    expect(await h.denied(U.bob, "select public.idea_link_challenge($1,$2)", [bobIdea, own])).toMatch(/err_not_found/); // not visible to company B
    await call(U.erin, "select public.challenge_close($1)", [ch]);
    expect(await h.denied(U.bob, "select public.idea_link_challenge($1,$2)", [bobIdea, ch])).toMatch(/err_closed/);
    expect(await h.denied(U.alice, "select public.challenge_close($1)", [ch])).toMatch(/err_forbidden|permission/);
  });
});

describe("points follow adoption, not volume", () => {
  it("sending many ideas earns nothing", async () => {
    for (let i = 0; i < 4; i++) await submit(U.alice);
    expect(await points(U.alice)).toBe(0);
  });
  it("a pilot and then scaling pay once each; a step back and forth does not pay twice", async () => {
    const id = await submit(U.alice);
    await move(id, "screening", "evaluating", "piloting");
    expect(await points(U.alice)).toBe(10);
    await move(id, "evaluating", "piloting");
    expect(await points(U.alice)).toBe(10);
    await move(id, "scaled");
    expect(await points(U.alice)).toBe(40);
  });
  it("a verified result pays once and only when a second person confirms", async () => {
    const id = await submit(U.alice);
    await move(id, "screening", "evaluating", "piloting");
    const out = (await call<{ idea_add_outcome: string }>(U.carol, "select public.idea_add_outcome($1,'money_saved_thb',5000,'2026-11-01','2026-11-30','')", [id]))[0]!.idea_add_outcome;
    const before = await points(U.alice);
    expect(await h.denied(U.carol, "select public.idea_verify_outcome($1)", [out])).toMatch(/err_forbidden|permission/);
    await call(U.gina, "select public.idea_verify_outcome($1)", [out]);
    expect(await points(U.alice)).toBe(before + 20);
  });
  it("points are private to their owner; the rules are readable by everyone and editable by platform admins only", async () => {
    expect((await rows(U.bob, "select * from public.recognition_points")).length).toBe(0);
    expect((await rows(U.bob, "select * from public.recognition_rules")).length).toBe(5);
    expect(await h.denied(U.carol, "select public.admin_set_points('scaled', 99)")).toMatch(/err_forbidden|permission/);
    await call(U.frank, "select public.admin_set_points('scaled', 40)");
    const id = await submit(U.dave);
    await move(id, "screening", "evaluating", "piloting", "scaled");
    expect(await points(U.dave)).toBe(50);
    await call(U.frank, "select public.admin_set_points('scaled', 30)");
  });
  it("a rule set to 0 pays nothing; browsers cannot write points", async () => {
    await call(U.frank, "select public.admin_set_points('piloted', 0)");
    const id = await submit(U.gina);
    await move(id, "screening", "evaluating", "piloting");
    expect(await points(U.gina)).toBe(0);
    await call(U.frank, "select public.admin_set_points('piloted', 10)");
    expect(await h.denied(U.alice, "insert into public.recognition_points (user_id, company_id, idea_id, reason, points) values ($1,$2,$3,'scaled',1000)", [U.alice, A, id])).toMatch(/permission denied/);
  });
});

describe("awards", () => {
  it("a monthly highlight is for an idea in use, granted by the company's coordinator or executive, once per month", async () => {
    const early = await submit(U.alice);
    expect(await h.denied(U.carol, "select public.award_grant($1,'monthly_highlight','เยี่ยม')", [early])).toMatch(/err_invalid_input/);
    await move(early, "screening", "evaluating", "piloting");
    expect(await h.denied(U.alice, "select public.award_grant($1,'monthly_highlight','เยี่ยม')", [early])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.dave, "select public.award_grant($1,'monthly_highlight','เยี่ยม')", [early])).toMatch(/err_forbidden|permission/);
    const before = await points(U.alice);
    await call(U.gina, "select public.award_grant($1,'monthly_highlight','ลดเวลาเบิกได้จริง')", [early]);
    expect(await points(U.alice)).toBe(before + 15);
    expect(await h.denied(U.carol, "select public.award_grant($1,'monthly_highlight','อีกครั้ง')", [early])).toMatch(/unique|duplicate/);
    expect((await h.admin((q) => q<{ user_id: string }>("select user_id from public.notifications where kind = 'award_granted'"))).rows.map((r) => r.user_id)).toContain(U.alice);
  });
  it("'dare to try' needs an idea that was piloted and then ended; refusing before any pilot does not count", async () => {
    const never = await submit(U.alice);
    await move(never, "declined");
    expect(await h.denied(U.carol, "select public.award_grant($1,'dare_to_try','ลองแล้ว')", [never])).toMatch(/err_invalid_input/);
    const tried = await submit(U.alice);
    await move(tried, "screening", "evaluating", "piloting", "declined");
    const before = await points(U.alice);
    await call(U.carol, "select public.award_grant($1,'dare_to_try','ไม่สำเร็จแต่ได้บทเรียนเรื่องซัพพลายเออร์')", [tried]);
    expect(await points(U.alice)).toBe(before + 15);
    expect(await h.denied(U.carol, "select public.award_grant($1,'dare_to_try','x')", [tried])).toMatch(/check|unique|duplicate/);
  });
  it("awards are visible to the company, not to other companies; coordinators of other companies cannot grant", async () => {
    expect((await rows(U.dave, "select id from public.awards")).length).toBeGreaterThan(0);
    expect((await rows(U.bob, "select id from public.awards")).length).toBe(0);
    const id = await submit(U.bob, B);
    expect(await h.denied(U.carol, "select public.award_grant($1,'monthly_highlight','ไม่ใช่บริษัทเรา')", [id])).toMatch(/err_forbidden|permission|err_invalid/);
  });
});
