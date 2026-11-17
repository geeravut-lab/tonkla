import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

let h: Db;
const CRIT = UUID(501);
const rows = async (user: string, sql: string, params: unknown[] = []) => h.as(user, async (q) => (await q<{ id: string }>(sql, params)).rows.map((r) => r.id).sort());
async function submit(user: string, company = A, id = crypto.randomUUID()) {
  await h.asCommit(user, async (q) => q("select public.submit_idea($1,$2,'process_improvement','ใช้ QR แทนใบเบิก','เบิกช้า','พนักงานคลัง','ลดเวลา 30%','ไม่มี',null)", [id, company]));
  return id;
}

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.admin(async (q) => {
    await q("insert into public.idea_criteria (id, company_id, name_th, weight) values ($1,$2,'ผลกระทบ',3)", [CRIT, A]);
  });
});

describe("ideas: submission, owner, deadline and visibility", () => {
  it("every idea gets an owner and a response deadline", async () => {
    const id = await submit(U.alice);
    const r = (await h.db.query<{ owner_id: string; respond_by: string; created_at: string }>("select owner_id, respond_by, created_at from public.ideas where id = $1", [id])).rows[0]!;
    expect(r.owner_id).toBe(U.carol);
    expect(Math.round((new Date(r.respond_by).getTime() - new Date(r.created_at).getTime()) / 3600_000)).toBe(48);
  });
  it("colleagues in the same company see it (for comments and votes); other companies do not; nothing can be inserted directly", async () => {
    const id = await submit(U.alice);
    expect(await rows(U.dave, "select id from public.ideas where id = $1", [id])).toEqual([id]);
    expect(await rows(U.bob, "select id from public.ideas where id = $1", [id])).toEqual([]);
    expect(await rows(U.pam, "select id from public.ideas where id = $1", [id])).toEqual([]);
    expect(await h.denied(U.alice, "insert into public.ideas (company_id, submitter_id, type_key, title, owner_id, respond_by) values ($1,$2,'new_revenue','abc',$2,now())", [A, U.alice])).toMatch(/permission denied/);
    expect(await h.denied(U.bob, "select public.submit_idea(gen_random_uuid(),$1,'new_revenue','ชื่อไอเดีย','','','','',null)", [A])).toMatch(/err_forbidden/);
    expect(await h.denied(U.alice, "select public.submit_idea(gen_random_uuid(),$1,'bogus','ชื่อไอเดีย','','','','',null)", [A])).toMatch(/err_invalid_input/);
  });
  it("opening an idea to the group is a coordinator decision; the base table stays private", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.alice, "select public.idea_set_visibility($1,'group')", [id])).toMatch(/err_forbidden/);
    await h.asCommit(U.carol, async (q) => q("select public.idea_set_visibility($1,'group')", [id]));
    expect(await rows(U.bob, "select id from public.group_ideas where id = $1", [id])).toEqual([id]);
    expect(await rows(U.bob, "select id from public.ideas where id = $1", [id])).toEqual([]);
  });
});

describe("ideas: five-stage pipeline", () => {
  it("moves submitted -> screening -> evaluating -> piloting -> scaled, only by owner/coordinator/executive, never skipping", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.alice, "select public.idea_transition($1,'screening','')", [id])).toMatch(/err_forbidden/);
    expect(await h.denied(U.dave, "select public.idea_transition($1,'screening','')", [id])).toMatch(/err_forbidden/);
    expect(await h.denied(U.carol, "select public.idea_transition($1,'piloting','')", [id])).toMatch(/err_invalid_input/);
    for (const to of ["screening", "evaluating", "piloting"]) await h.asCommit(U.carol, async (q) => q("select public.idea_transition($1,$2,'')", [id, to]));
    await h.asCommit(U.gina, async (q) => q("select public.idea_transition($1,'scaled','ขยายผลทั้งบริษัท')", [id])); // company executive may decide too
    const events = await h.as(U.alice, async (q) => (await q<{ to_stage: string }>("select to_stage from public.idea_stage_events where idea_id = $1 order by id", [id])).rows.map((e) => e.to_stage));
    expect(events).toEqual(["submitted", "screening", "evaluating", "piloting", "scaled"]);
    expect(await h.denied(U.carol, "select public.idea_transition($1,'evaluating','')", [id])).toMatch(/err_invalid_input/); // final
  });
  it("a refusal needs a reason and the submitter is told", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.carol, "select public.idea_transition($1,'declined','')", [id])).toMatch(/err_note_required/);
    await h.asCommit(U.carol, async (q) => q("select public.idea_transition($1,'declined','เกินงบปีนี้ ลองใหม่ปีหน้า')", [id]));
    expect((await h.as(U.alice, async (q) => (await q("select * from public.notifications where dedupe_key = $1", [`idea_st:${id}:declined`])).rows.length))).toBe(1);
    const r = (await h.db.query<{ first_response_at: string | null }>("select first_response_at from public.ideas where id = $1", [id])).rows[0]!;
    expect(r.first_response_at).not.toBeNull();
  });
  it("stage and owner cannot be edited by hand", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.carol, "update public.ideas set stage = 'scaled' where id = $1", [id])).toMatch(/permission denied/);
    expect(await h.denied(U.carol, "insert into public.idea_stage_events (idea_id, type) values ($1,'stage')", [id])).toMatch(/permission denied/);
  });
});

describe("ideas: published criteria, scores, votes and comments", () => {
  it("everyone in the company reads the criteria and the scores; only managers score; scores are 1-5", async () => {
    const id = await submit(U.alice);
    expect(await rows(U.alice, "select id from public.idea_criteria")).toEqual([CRIT]);
    expect(await rows(U.bob, "select id from public.idea_criteria")).toEqual([]);
    expect(await h.denied(U.dave, "select public.idea_score($1,$2,4,'')", [id, CRIT])).toMatch(/err_forbidden/);
    expect(await h.denied(U.carol, "select public.idea_score($1,$2,9,'')", [id, CRIT])).toMatch(/check/);
    await h.asCommit(U.carol, async (q) => q("select public.idea_score($1,$2,4,'ดี')", [id, CRIT]));
    await h.asCommit(U.carol, async (q) => q("select public.idea_score($1,$2,5,'ดีมาก')", [id, CRIT])); // re-scoring replaces
    const s = await h.as(U.alice, async (q) => (await q<{ score: number }>("select score from public.idea_scores where idea_id = $1", [id])).rows);
    expect(s).toEqual([{ score: 5 }]);
  });
  it("a colleague can vote once (toggle); nobody votes for their own idea or across companies", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.alice, "select public.idea_toggle_vote($1)", [id])).toMatch(/err_own_idea/);
    expect(await h.denied(U.bob, "select public.idea_toggle_vote($1)", [id])).toMatch(/err_forbidden/);
    expect(await h.asCommit(U.dave, async (q) => (await q<{ idea_toggle_vote: boolean }>("select public.idea_toggle_vote($1)", [id])).rows[0]!.idea_toggle_vote)).toBe(true);
    expect((await h.db.query<{ vote_count: number }>("select vote_count from public.ideas where id = $1", [id])).rows[0]!.vote_count).toBe(1);
    expect(await h.denied(U.dave, "insert into public.idea_votes (idea_id, user_id) values ($1,$2)", [id, U.dave])).toMatch(/permission denied/); // only through the function
    expect(await h.asCommit(U.dave, async (q) => (await q<{ idea_toggle_vote: boolean }>("select public.idea_toggle_vote($1)", [id])).rows[0]!.idea_toggle_vote)).toBe(false);
    expect((await h.db.query<{ vote_count: number }>("select vote_count from public.ideas where id = $1", [id])).rows[0]!.vote_count).toBe(0);
  });
  it("colleagues comment; outsiders cannot", async () => {
    const id = await submit(U.alice);
    await h.asCommit(U.dave, async (q) => q("insert into public.idea_comments (idea_id, author_id, body) values ($1,$2,'เห็นด้วย')", [id, U.dave]));
    expect(await h.denied(U.bob, "insert into public.idea_comments (idea_id, author_id, body) values ($1,$2,'x')", [id, U.bob])).toMatch(/row-level security/);
    expect(await h.denied(U.dave, "insert into public.idea_comments (idea_id, author_id, body) values ($1,$2,'x')", [id, U.alice])).toMatch(/row-level security/);
  });
});

describe("ideas: outcomes", () => {
  it("results are recorded only once piloting, and a second person verifies the number", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.carol, "select public.idea_add_outcome($1,'money_saved_thb',1000,'2026-11-01','2026-11-30','')", [id])).toMatch(/err_invalid_input/);
    for (const to of ["screening", "evaluating", "piloting"]) await h.asCommit(U.carol, async (q) => q("select public.idea_transition($1,$2,'')", [id, to]));
    expect(await h.denied(U.alice, "select public.idea_add_outcome($1,'money_saved_thb',1000,'2026-11-01','2026-11-30','')", [id])).toMatch(/err_forbidden/);
    expect(await h.denied(U.carol, "select public.idea_add_outcome($1,'bogus',1000,'2026-11-01','2026-11-30','')", [id])).toMatch(/check/);
    expect(await h.denied(U.carol, "select public.idea_add_outcome($1,'money_saved_thb',1000,'2026-12-01','2026-11-30','')", [id])).toMatch(/check/);
    const oid = await h.asCommit(U.carol, async (q) => (await q<{ idea_add_outcome: string }>("select public.idea_add_outcome($1,'money_saved_thb',25000,'2026-11-01','2026-11-30','ประหยัดกระดาษ')", [id])).rows[0]!.idea_add_outcome);
    expect(await h.denied(U.carol, "select public.idea_verify_outcome($1)", [oid])).toMatch(/err_forbidden/); // not the same person
    expect(await h.denied(U.dave, "select public.idea_verify_outcome($1)", [oid])).toMatch(/err_forbidden/);
    await h.asCommit(U.gina, async (q) => q("select public.idea_verify_outcome($1)", [oid]));
    expect((await h.db.query<{ verified_by: string | null }>("select verified_by from public.idea_outcomes where id = $1", [oid])).rows[0]!.verified_by).toBe(U.gina);
    expect((await h.as(U.alice, async (q) => (await q("select * from public.notifications where kind = 'idea_outcome'")).rows.length)) > 0).toBe(true);
  });
});

describe("ideas: deadline tick and live", () => {
  it("an unanswered idea is escalated once", async () => {
    const id = await submit(U.alice);
    await h.db.query("update public.ideas set respond_by = now() - interval '1 hour' where id = $1", [id]);
    await h.db.query("select public.run_tick()");
    await h.db.query("select public.run_tick()");
    expect((await h.db.query("select * from public.notifications where dedupe_key like $1", [`idea_o1:${id}%`])).rows.length).toBeGreaterThan(0);
    const n = (await h.db.query("select * from public.notifications where dedupe_key = $1", [`idea_o1:${id}:${U.carol}`])).rows.length;
    expect(n).toBe(1);
  });
  it("idea threads are live only for people who can see the idea", async () => {
    const id = await submit(U.alice);
    const may = (user: string) => h.as(user, async (q) => (await q<{ ok: boolean }>("select app.live_may_hear($1) as ok", [`i:${id}`])).rows[0]!.ok);
    expect(await may(U.dave)).toBe(true);
    expect(await may(U.bob)).toBe(false);
  });
  it("a company created from the template receives categories and criteria", async () => {
    const tpl = (await h.db.query<{ id: string }>("select id from public.company_templates limit 1")).rows[0]!.id;
    const cid = await h.asCommit(U.frank, async (q) => (await q<{ admin_create_company: string }>("select public.admin_create_company('tpl-co','บริษัทแม่แบบ','',null,$1)", [tpl])).rows[0]!.admin_create_company);
    expect((await h.db.query("select * from public.report_categories where company_id = $1", [cid])).rows.length).toBeGreaterThanOrEqual(5);
    expect((await h.db.query("select * from public.idea_criteria where company_id = $1", [cid])).rows.length).toBeGreaterThanOrEqual(3);
    expect(B).toBeTruthy();
  });
});
