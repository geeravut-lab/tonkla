import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

let h: Db;
const rows = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.as(user, async (q) => (await q<T>(sql, params)).rows);
const call = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.asCommit(user, async (q) => (await q<T>(sql, params)).rows);
async function idea(user = U.alice, company = A) {
  const id = crypto.randomUUID();
  await call(user, "select public.submit_idea($1,$2,'process_improvement','ใช้ QR แทนใบเบิก','เบิกช้า','','ลดเวลา 30%','',null)", [id, company]);
  return id;
}
const move = async (id: string, by: string, ...stages: string[]) => { for (const s of stages) await call(by, "select public.idea_transition($1,$2,'บันทึกเหตุผล')", [id, s]); };

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
});

describe("e-mail channel queue", () => {
  it("urgent notices are queued for e-mail for everyone; other kinds only when the person opted in", async () => {
    await h.admin((q) => q("select app.notify($1,'emergency_new','x','','/','e1','{}')", [U.alice]));
    await h.admin((q) => q("select app.notify($1,'report_status','x','','/','e2','{}')", [U.alice]));
    const ch = async () => (await h.admin((q) => q<{ channel: string; kind: string }>("select q.channel, n.kind from public.notification_queue q join public.notifications n on n.id = q.notification_id where q.user_id = $1 and q.channel = 'email' order by n.kind", [U.alice]))).rows.map((r) => r.kind);
    expect(await ch()).toEqual(["emergency_new"]);
    await call(U.alice, "insert into public.notification_prefs (user_id, grp, email) values ($1,'work',true) on conflict (user_id, grp) do update set email = true", [U.alice]);
    await h.admin((q) => q("select app.notify($1,'report_status','y','','/','e3','{}')", [U.alice]));
    expect(await ch()).toEqual(["emergency_new", "report_status"]);
  });
  it("people can change only their own e-mail preference", async () => {
    expect(await h.denied(U.bob, "update public.notification_prefs set email = true where user_id = $1", [U.alice]).catch(() => "blocked")).toBeTruthy();
    expect((await rows(U.bob, "select * from public.notification_prefs where user_id = $1", [U.alice])).length).toBe(0);
  });
});

describe("teams across departments and companies", () => {
  let id = "";
  let team = "";
  it("the idea's owner, coordinators, executives and the central team can start a team; staff cannot", async () => {
    id = await idea();
    expect(await h.denied(U.alice, "select public.team_create($1,'ทีมคลังสินค้า','')", [id])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.bob, "select public.team_create($1,'ทีมคลังสินค้า','')", [id])).toMatch(/err_forbidden|permission/);
    team = (await call<{ team_create: string }>(U.carol, "select public.team_create($1,'ทีมคลังสินค้า','ปรับกระบวนการเบิกของ')", [id]))[0]!.team_create;
  });
  it("only the lead invites; the invited person from another company then sees the team but not its posts until they accept", async () => {
    expect(await h.denied(U.dave, "select public.team_invite($1,$2)", [team, U.bob])).toMatch(/err_forbidden|permission/);
    await call(U.carol, "select public.team_invite($1,$2)", [team, U.bob]);
    expect((await rows(U.bob, "select id from public.teams")).length).toBe(1);
    expect((await rows(U.bob, "select id from public.ideas where id = $1", [id])).length).toBe(0); // not yet: the idea opens up only once they joined
    await call(U.carol, "select public.team_post($1,'เริ่มประชุมวันจันทร์')", [team]);
    expect((await rows(U.bob, "select id from public.team_posts")).length).toBe(0);
    await call(U.bob, "select public.team_respond($1,true)", [team]);
    expect((await rows(U.bob, "select id from public.team_posts")).length).toBe(1);
    expect((await rows(U.bob, "select id from public.ideas where id = $1", [id])).length).toBe(1); // a member from another company reads the idea
  });
  it("outsiders see nothing; members can post and the others are told; a closed team takes no posts", async () => {
    expect((await rows(U.dave, "select id from public.teams")).length).toBe(0);
    expect(await h.denied(U.dave, "select public.team_post($1,'ขอเข้าร่วม')", [team])).toMatch(/err_forbidden|permission/);
    await call(U.bob, "select public.team_post($1,'ได้รับแล้ว')", [team]);
    expect((await h.admin((q) => q<{ user_id: string }>("select user_id from public.notifications where kind = 'team_post'"))).rows.map((r) => r.user_id)).toContain(U.carol);
    expect(await h.denied(U.bob, "select public.team_close($1)", [team])).toMatch(/err_forbidden|permission/);
    await call(U.carol, "select public.team_close($1)", [team]);
    expect(await h.denied(U.bob, "select public.team_post($1,'ช้าไป')", [team])).toMatch(/err_closed/);
  });
  it("finding people across companies is for coordinators, executives and central only", async () => {
    expect((await rows(U.carol, "select * from public.team_candidates('bob')")).length).toBe(1); // coordinators can look across companies by name
    expect((await rows(U.carol, "select * from public.team_candidates('b')")).length).toBe(0); // at least two letters
    expect(await h.denied(U.alice, "select * from public.team_candidates('bo')")).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.dave, "select * from public.team_candidates('bo')")).toMatch(/err_forbidden|permission/);
  });
});

describe("adopt at my company", () => {
  let src = "";
  it("only ideas opened to the group and already in use can be adopted, by a coordinator or executive of another company", async () => {
    src = await idea();
    expect(await h.denied(U.carol, "select public.idea_adopt($1,$2)", [src, B])).toMatch(/err_forbidden|permission/); // carol does not coordinate B
    await move(src, U.carol, "screening", "evaluating", "piloting");
    await call(U.carol, "select public.idea_set_visibility($1,'group')", [src]);
    expect(await h.denied(U.alice, "select public.idea_adopt($1,$2)", [src, B])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.erin, "select public.idea_adopt($1,$2)", [src, A])).toMatch(/err_invalid_input/); // not for the company it came from
    const hidden = await idea();
    expect(await h.denied(U.erin, "select public.idea_adopt($1,$2)", [hidden, B])).toMatch(/err_invalid_input/);
  });
  it("a new idea appears in the adopting company, linked to the original; the author is told and earns points; once per company", async () => {
    const before = (await h.admin((q) => q<{ s: string }>("select coalesce(sum(points),0)::text s from public.recognition_points where user_id = $1", [U.alice]))).rows[0]!.s;
    const nid = (await call<{ idea_adopt: string }>(U.erin, "select public.idea_adopt($1,$2)", [src, B]))[0]!.idea_adopt;
    expect((await h.admin((q) => q<{ company_id: string; stage: string }>("select company_id, stage from public.ideas where id = $1", [nid]))).rows[0]).toEqual({ company_id: B, stage: "submitted" });
    expect(Number((await h.admin((q) => q<{ s: string }>("select coalesce(sum(points),0)::text s from public.recognition_points where user_id = $1", [U.alice]))).rows[0]!.s)).toBe(Number(before) + 25);
    expect((await h.admin((q) => q<{ user_id: string }>("select user_id from public.notifications where kind = 'idea_adopted'"))).rows.map((r) => r.user_id)).toContain(U.alice);
    expect(await h.denied(U.erin, "select public.idea_adopt($1,$2)", [src, B])).toMatch(/err_already_done/);
    expect((await rows<{ idea_adoption_count: number }>(U.bob, "select public.idea_adoption_count($1)", [src]))[0]!.idea_adoption_count).toBe(1);
  });
});

describe("pilot budgets with fast approval", () => {
  let id = "";
  let bud = "";
  it("requested for an idea that is being evaluated or piloted, within the company's cap", async () => {
    id = await idea();
    expect(await h.denied(U.carol, "select public.budget_request($1,5000,'ซื้อเครื่องสแกน')", [id])).toMatch(/err_invalid_input/); // still 'submitted'
    await move(id, U.carol, "screening", "evaluating");
    expect(await h.denied(U.alice, "select public.budget_request($1,5000,'ซื้อเครื่องสแกน')", [id])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.carol, "select public.budget_request($1,50000,'เกินวงเงิน')", [id])).toMatch(/err_over_cap/);
    bud = (await call<{ budget_request: string }>(U.carol, "select public.budget_request($1,5000,'ซื้อเครื่องสแกน')", [id]))[0]!.budget_request;
    expect(await h.denied(U.carol, "select public.budget_request($1,1000,'ซ้ำ')", [id])).toMatch(/err_already_done/);
    expect((await h.admin((q) => q<{ user_id: string }>("select user_id from public.notifications where kind = 'budget_requested'"))).rows.map((r) => r.user_id)).toContain(U.gina);
  });
  it("a second person decides: not the requester, not staff, not another company", async () => {
    expect(await h.denied(U.carol, "select public.budget_decide($1,true,'')", [bud])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.alice, "select public.budget_decide($1,true,'')", [bud])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.bob, "select public.budget_decide($1,true,'')", [bud])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.gina, "select public.budget_decide($1,false,'')", [bud])).toMatch(/err_note_required/);
    await call(U.gina, "select public.budget_decide($1,true,'อนุมัติ')", [bud]);
    expect(await h.denied(U.gina, "select public.budget_decide($1,true,'')", [bud])).toMatch(/err_already_done/);
  });
  it("spending never goes beyond the approved amount", async () => {
    await call(U.carol, "select public.budget_spend($1,3000,'ซื้อเครื่องสแกน 1 ตัว')", [bud]);
    expect(await h.denied(U.carol, "select public.budget_spend($1,2500,'เกิน')", [bud])).toMatch(/err_over_budget/);
    expect(await h.denied(U.alice, "select public.budget_spend($1,100,'')", [bud])).toMatch(/err_forbidden|permission/);
    expect((await rows<{ spent_thb: string }>(U.carol, "select spent_thb from public.pilot_budgets where id = $1", [bud]))[0]!.spent_thb).toBe("3000");
    expect((await rows(U.bob, "select id from public.pilot_budgets")).length).toBe(0);
  });
  it("a request nobody answers in 48 hours reaches the central team once; the cap is set by admin or central", async () => {
    const two = await idea();
    await move(two, U.carol, "screening", "evaluating");
    const b2 = (await call<{ budget_request: string }>(U.carol, "select public.budget_request($1,1000,'ทดลอง')", [two]))[0]!.budget_request;
    expect((await h.admin((q) => q<{ n: number }>("select public.run_budget_escalation() n"))).rows[0]!.n).toBe(0);
    await h.admin((q) => q("update public.pilot_budgets set decide_by = now() - interval '1 hour' where id = $1", [b2]));
    expect((await h.admin((q) => q<{ n: number }>("select public.run_budget_escalation() n"))).rows[0]!.n).toBe(1);
    expect((await h.admin((q) => q<{ n: number }>("select public.run_budget_escalation() n"))).rows[0]!.n).toBe(0);
    expect(await h.denied(U.carol, "select public.admin_set_pilot_cap($1, 100000)", [A])).toMatch(/err_forbidden|permission/);
    await call(U.frank, "select public.admin_set_pilot_cap($1, 100000)", [A]);
    expect((await call(U.carol, "select public.budget_request($1,50000,'ใหญ่ขึ้น')", [await (async () => { const x = await idea(); await move(x, U.carol, "screening", "evaluating"); return x; })()])).length).toBe(1);
  });
});
