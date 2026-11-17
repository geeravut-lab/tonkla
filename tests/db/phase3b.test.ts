import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { A, seedOrg, U } from "./seed";

let h: Db;
const rows = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.as(user, async (q) => (await q<T>(sql, params)).rows);
const call = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.asCommit(user, async (q) => (await q<T>(sql, params)).rows);
async function idea(user = U.alice, company = A) {
  const id = crypto.randomUUID();
  await call(user, "select public.submit_idea($1,$2,'process_improvement','ปรับกระบวนการเบิก','เบิกช้า','','','',null)", [id, company]);
  return id;
}
const move = async (id: string, by: string, ...stages: string[]) => { for (const s of stages) await call(by, "select public.idea_transition($1,$2,'บันทึกเหตุผล')", [id, s]); };

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
});

describe("communities by function", () => {
  let fin = "";
  let post = "";
  it("only the central team creates one; anyone with a company can join, across companies", async () => {
    expect(await h.denied(U.carol, "select public.community_create('finance','การเงิน','Finance','')")).toMatch(/err_forbidden|permission/);
    fin = (await call<{ community_create: string }>(U.erin, "select public.community_create('finance','การเงิน','Finance','คนการเงินจากทุกบริษัท')"))[0]!.community_create;
    expect((await rows(U.alice, "select id from public.communities_list()")).length).toBe(1);
    expect(await h.denied(U.pam, "select public.community_join($1)", [fin])).toMatch(/err_forbidden|permission/);
    await call(U.alice, "select public.community_join($1)", [fin]);
    await call(U.bob, "select public.community_join($1)", [fin]);
  });
  it("non-members cannot read posts or the roster; members can, across companies, seeing names and companies only", async () => {
    post = (await call<{ community_post: string }>(U.alice, "select public.community_post($1,'ใครใช้โปรแกรมบัญชีตัวไหนบ้าง')", [fin]))[0]!.community_post;
    expect((await rows(U.dave, "select id from public.community_posts")).length).toBe(0);
    expect(await h.denied(U.dave, "select * from public.community_roster($1)", [fin])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.dave, "select public.community_post($1,'ขอเข้า')", [fin])).toMatch(/err_forbidden|permission/);
    expect((await rows(U.bob, "select id from public.community_posts")).length).toBe(1);
    const roster = await rows<{ display_name: string; company_name: string }>(U.bob, "select display_name, company_name from public.community_roster($1)", [fin]);
    expect(roster.map((r) => r.company_name).sort()).toEqual(["บริษัท A", "บริษัท B"]);
  });
  it("replies attach to a top-level post; moderators (and central) hide posts, members then no longer see them", async () => {
    await call(U.bob, "select public.community_post($1,'ใช้ระบบ X ครับ',$2)", [fin, post]);
    expect(await h.denied(U.bob, "select public.community_post($1,'ตอบซ้อน',$2)", [fin, (await rows<{ id: string }>(U.bob, "select id from public.community_posts where parent_id is not null"))[0]!.id])).toMatch(/err_invalid_input/);
    expect(await h.denied(U.bob, "select public.community_hide($1,true)", [post])).toMatch(/err_forbidden|permission/);
    await call(U.erin, "select public.community_set_moderator($1,$2,true)", [fin, U.bob]);
    expect(await h.denied(U.carol, "select public.community_set_moderator($1,$2,true)", [fin, U.alice])).toMatch(/err_forbidden|permission/);
    await call(U.bob, "select public.community_hide($1,true)", [post]);
    expect((await rows(U.alice, "select id from public.community_posts where id = $1", [post])).length).toBe(0);
    expect((await rows(U.bob, "select id from public.community_posts where id = $1", [post])).length).toBe(1); // moderators still see it
  });
  it("leaving removes access", async () => {
    await call(U.alice, "select public.community_leave($1)", [fin]);
    expect((await rows(U.alice, "select id from public.community_posts")).length).toBe(0);
  });
});

describe("annual group awards", () => {
  it("only the central team grants; the kind decides which ideas qualify", async () => {
    const a = await idea();
    expect(await h.denied(U.carol, "select public.annual_award_grant($1,'idea_of_year','ดีเยี่ยม')", [a])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.erin, "select public.annual_award_grant($1,'idea_of_year','ดีเยี่ยม')", [a])).toMatch(/err_invalid_input/); // not in use yet
    await move(a, U.carol, "screening", "evaluating", "piloting");
    expect(await h.denied(U.erin, "select public.annual_award_grant($1,'impact_of_year','ผลลัพธ์ดี')", [a])).toMatch(/err_invalid_input/); // no confirmed result
    expect(await h.denied(U.erin, "select public.annual_award_grant($1,'collaboration_of_year','ทำงานร่วมกัน')", [a])).toMatch(/err_invalid_input/); // no team, no adoption
    expect(await h.denied(U.erin, "select public.annual_award_grant($1,'bogus','x')", [a])).toMatch(/err_invalid_input/);
    const before = Number((await h.admin((q) => q<{ s: string }>("select coalesce(sum(points),0)::text s from public.recognition_points where user_id = $1", [U.alice]))).rows[0]!.s);
    await call(U.erin, "select public.annual_award_grant($1,'idea_of_year','ไอเดียแห่งปี')", [a]);
    expect(Number((await h.admin((q) => q<{ s: string }>("select coalesce(sum(points),0)::text s from public.recognition_points where user_id = $1", [U.alice]))).rows[0]!.s)).toBe(before + 100);
    expect(await h.denied(U.erin, "select public.annual_award_grant($1,'idea_of_year','อีกครั้ง')", [a])).toMatch(/unique|duplicate/);
    expect((await h.admin((q) => q<{ user_id: string }>("select user_id from public.notifications where kind = 'annual_award'"))).rows[0]!.user_id).toBe(U.alice);
  });
  it("impact needs a result a second person confirmed; collaboration needs a team or an adoption; everyone in the group can read the list", async () => {
    const a = await idea();
    await move(a, U.carol, "screening", "evaluating", "piloting");
    const out = (await call<{ idea_add_outcome: string }>(U.carol, "select public.idea_add_outcome($1,'money_saved_thb',9000,'2026-11-01','2026-11-30','')", [a]))[0]!.idea_add_outcome;
    await call(U.gina, "select public.idea_verify_outcome($1)", [out]);
    await call(U.erin, "select public.annual_award_grant($1,'impact_of_year','ประหยัด 9,000 บาท')", [a]);
    await call(U.carol, "select public.team_create($1,'ทีมร่วม','')", [a]);
    await call(U.erin, "select public.annual_award_grant($1,'collaboration_of_year','ทีมข้ามแผนก')", [a]);
    expect((await rows(U.bob, "select id from public.annual_awards")).length).toBe(3);
    expect((await rows(U.pam, "select id from public.annual_awards")).length).toBe(0);
  });
});
