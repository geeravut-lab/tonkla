import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

let h: Db;
const CAT = UUID(401);
const CAT_B = UUID(402);
const rows = async (user: string, sql: string, params: unknown[] = []) => h.as(user, async (q) => (await q<{ id: string }>(sql, params)).rows.map((r) => r.id).sort());

async function submit(user: string, company = A, severity = "medium", id = crypto.randomUUID()) {
  await h.asCommit(user, async (q) => q("select public.submit_report($1,$2,$3,$4,'แอร์ไม่เย็น','รายละเอียด','กระทบงาน','เปลี่ยนคอมเพรสเซอร์','[]'::jsonb)", [id, company, company === A ? CAT : CAT_B, severity]));
  return id;
}

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.admin(async (q) => {
    await q("insert into public.report_categories (id, company_id, key, name_th) values ($1,$2,'equipment','อุปกรณ์'), ($3,$4,'equipment','อุปกรณ์')", [CAT, A, CAT_B, B]);
  });
});

describe("submitting a report", () => {
  it("every report gets an owner and a response deadline, from the company's SLA", async () => {
    const id = await submit(U.alice);
    const r = (await h.db.query<{ owner_id: string; respond_by: string; created_at: string; status: string }>("select * from public.reports where id = $1", [id])).rows[0]!;
    expect(r.owner_id).toBe(U.carol); // no routing rule: the company coordinator
    expect(r.status).toBe("submitted");
    const hours = (new Date(r.respond_by).getTime() - new Date(r.created_at).getTime()) / 3600_000;
    expect(Math.round(hours)).toBe(48);
  });
  it("a routing rule picks the owner and may shorten the deadline", async () => {
    await h.asCommit(U.carol, async (q) => q("select public.set_routing($1,$2,$3,24)", [A, CAT, U.dave]));
    const id = await submit(U.alice);
    const r = (await h.db.query<{ owner_id: string; respond_by: string; created_at: string }>("select owner_id, respond_by, created_at from public.reports where id = $1", [id])).rows[0]!;
    expect(r.owner_id).toBe(U.dave);
    expect(Math.round((new Date(r.respond_by).getTime() - new Date(r.created_at).getTime()) / 3600_000)).toBe(24);
    await h.asCommit(U.carol, async (q) => q("select public.set_routing($1,$2,null)", [A, CAT]));
  });
  it("the owner and the coordinator are notified, and the owner sees it live", async () => {
    await h.db.query("delete from realtime.sent");
    const id = await submit(U.alice);
    expect((await h.as(U.carol, async (q) => (await q("select * from public.notifications where dedupe_key like $1", [`rep_new:${id}%`])).rows.length))).toBe(1);
    const topics = (await h.db.query<{ topic: string }>("select topic from realtime.sent")).rows.map((r) => r.topic);
    expect(topics).toContain(`u:${U.carol}`);
    expect(topics).toContain(`r:${id}`);
  });
  it("cannot file for a company you do not belong to, nor insert directly", async () => {
    expect(await h.denied(U.alice, "select public.submit_report(gen_random_uuid(),$1,$2,'medium','ชื่อเรื่อง','','','','[]'::jsonb)", [B, CAT_B])).toMatch(/err_forbidden/);
    expect(await h.denied(U.alice, "insert into public.reports (company_id, submitter_id, title, owner_id, respond_by) values ($1,$2,'abc',$2,now())", [A, U.alice])).toMatch(/permission denied/);
    expect(await h.denied(U.pam, "select public.submit_report(gen_random_uuid(),$1,$2,'medium','ชื่อเรื่อง','','','','[]'::jsonb)", [A, CAT])).toMatch(/err_forbidden/);
  });
  it("without any coordinator or central user a report is refused rather than left ownerless", async () => {
    const lonely = UUID(410);
    const cat = UUID(411);
    await h.admin(async (q) => {
      await q("insert into public.companies (id, code, name_th, status) values ($1,'lonely','เหงา','active')", [lonely]);
      await q("insert into public.report_categories (id, company_id, key, name_th) values ($1,$2,'x_y','x')", [cat, lonely]);
      await q("delete from public.role_assignments where role in ('central_team','group_owner')");
      await q("insert into public.memberships (user_id, company_id) values ($1,$2)", [U.bob, lonely]);
    });
    expect(await h.denied(U.bob, "select public.submit_report(gen_random_uuid(),$1,$2,'low','ชื่อเรื่อง','','','','[]'::jsonb)", [lonely, cat])).toMatch(/err_no_owner/);
    await h.admin((q) => q("insert into public.role_assignments (user_id, role, scope_type) values ($1,'central_team','group')", [U.erin]));
  });
});

describe("who can see a report", () => {
  it("submitter, owner, supervisor and coordinator see it; a colleague and another company do not", async () => {
    const id = await submit(U.alice);
    expect(await rows(U.alice, "select id from public.reports where id = $1", [id])).toEqual([id]);
    expect(await rows(U.carol, "select id from public.reports where id = $1", [id])).toEqual([id]);
    expect(await rows(U.dave, "select id from public.reports where id = $1", [id])).toEqual([id]); // alice's supervisor
    expect(await rows(U.erin, "select id from public.reports where id = $1", [id])).toEqual([id]);
    expect(await rows(U.gina, "select id from public.reports where id = $1", [id])).toEqual([]); // executives see aggregates only
    expect(await rows(U.bob, "select id from public.reports where id = $1", [id])).toEqual([]);
    expect(await rows(U.bob, "select report_id as id from public.report_events where report_id = $1", [id])).toEqual([]);
  });
  it("a colleague finds similar reports by title only and can say 'me too' instead of filing again", async () => {
    const id = await submit(U.alice);
    const eve = UUID(21);
    await h.addUser(eve);
    await h.admin(async (q) => { await q("update public.profiles set status='active' where id=$1", [eve]); await q("insert into public.memberships (user_id, company_id) values ($1,$2)", [eve, A]); });
    const found = await h.as(eve, async (q) => (await q<{ id: string; title: string }>("select * from public.similar_reports($1, array['แอร์'])", [A])).rows);
    expect(found.some((f) => f.id === id)).toBe(true);
    expect(Object.keys(found[0]!)).not.toContain("submitter_id");
    expect(await rows(eve, "select id from public.reports where id = $1", [id])).toEqual([]); // can not read it...
    await h.asCommit(eve, async (q) => q("select public.report_metoo($1)", [id]));
    expect(await rows(eve, "select id from public.reports where id = $1", [id])).toEqual([id]); // ...until saying me too
    expect((await h.db.query<{ metoo_count: number }>("select metoo_count from public.reports where id = $1", [id])).rows[0]!.metoo_count).toBe(1);
    expect(await h.denied(U.alice, "select public.report_metoo($1)", [id])).toMatch(/err_forbidden/); // not on your own report
    expect(await h.denied(U.bob, "select public.report_metoo($1)", [id])).toMatch(/err_forbidden/); // not across companies
    expect((await h.as(U.bob, async (q) => (await q("select * from public.similar_reports($1, array['แอร์'])", [A])).rows.length))).toBe(0);
  });
});

describe("status changes", () => {
  it("only the owner or a coordinator move a report, along allowed steps", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.alice, "select public.report_transition($1,'closed','x')", [id])).toMatch(/err_forbidden/);
    expect(await h.denied(U.bob, "select public.report_transition($1,'acknowledged','')", [id])).toMatch(/err_forbidden/);
    expect(await h.denied(U.carol, "select public.report_transition($1,'closed','เสร็จ')", [id])).toMatch(/err_invalid_input/); // cannot skip steps
    await h.asCommit(U.carol, async (q) => q("select public.report_transition($1,'acknowledged','')", [id]));
    const r = (await h.db.query<{ first_response_at: string | null; status: string }>("select status, first_response_at from public.reports where id = $1", [id])).rows[0]!;
    expect(r.status).toBe("acknowledged");
    expect(r.first_response_at).not.toBeNull();
    expect((await h.as(U.alice, async (q) => (await q("select * from public.notifications where dedupe_key = $1", [`rep_st:${id}:acknowledged:${U.alice}`])).rows.length))).toBe(1); // the submitter is told
  });
  it("every report is answered: a refusal needs a reason, and the submitter sees the timeline", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.carol, "select public.report_transition($1,'declined','')", [id])).toMatch(/err_note_required/);
    await h.asCommit(U.carol, async (q) => q("select public.report_transition($1,'declined','ต้นทุนสูงเกินไปในปีนี้')", [id]));
    const events = await h.as(U.alice, async (q) => (await q<{ type: string; note: string }>("select type, note from public.report_events where report_id = $1 order by id", [id])).rows);
    expect(events.map((e) => e.type)).toEqual(["submitted", "status"]);
    expect(events[1]!.note).toContain("ต้นทุน");
    expect(await h.denied(U.carol, "select public.report_transition($1,'in_progress','')", [id])).toMatch(/err_invalid_input/); // declined is final
  });
  it("events, status and owner cannot be edited by hand", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.carol, "update public.reports set status = 'closed' where id = $1", [id])).toMatch(/permission denied/);
    expect(await h.denied(U.carol, "insert into public.report_events (report_id, type) values ($1,'status')", [id])).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "update public.report_events set note = 'x'")).toMatch(/permission denied/);
  });
  it("quick fix: the submitter's own supervisor closes small matters; not big ones, not others' reports", async () => {
    const small = await submit(U.alice, A, "low");
    const big = await submit(U.alice, A, "high");
    expect(await h.denied(U.dave, "select public.report_quick_fix($1,'แก้แล้ว')", [big])).toMatch(/err_invalid_input/);
    expect(await h.denied(U.gina, "select public.report_quick_fix($1,'แก้แล้ว')", [small])).toMatch(/err_forbidden/);
    await h.asCommit(U.dave, async (q) => q("select public.report_quick_fix($1,'ซ่อมเรียบร้อย')", [small]));
    const r = (await h.db.query<{ status: string; quick_fix: boolean; first_response_at: string | null }>("select status, quick_fix, first_response_at from public.reports where id = $1", [small])).rows[0]!;
    expect(r).toMatchObject({ status: "closed", quick_fix: true });
    expect(r.first_response_at).not.toBeNull();
  });
});

describe("coordinator tools", () => {
  it("assign only to members of the same company; merge duplicates inside one company only", async () => {
    const a1 = await submit(U.alice);
    const a2 = await submit(U.dave);
    expect(await h.denied(U.carol, "select public.report_assign($1,$2)", [a1, U.bob])).toMatch(/err_not_member/);
    expect(await h.denied(U.alice, "select public.report_assign($1,$2)", [a1, U.dave])).toMatch(/err_forbidden/);
    await h.asCommit(U.carol, async (q) => q("select public.report_assign($1,$2)", [a1, U.dave]));
    await h.asCommit(U.carol, async (q) => q("select public.report_merge($1,$2)", [a2, a1]));
    expect((await h.db.query<{ status: string }>("select status from public.reports where id = $1", [a2])).rows[0]!.status).toBe("merged");
    expect((await h.db.query("select * from public.report_metoo where report_id = $1 and user_id = $2", [a1, U.dave])).rows.length).toBe(1); // the duplicate's author counts as "me too"
    const other = await submit(U.bob, B);
    expect(await h.denied(U.carol, "select public.report_merge($1,$2)", [other, a1])).toMatch(/err_forbidden/);
  });
  it("opening a report to the group is a coordinator decision and hides who filed it", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.alice, "select public.report_set_visibility($1,'group')", [id])).toMatch(/err_forbidden/);
    expect(await rows(U.bob, "select id from public.group_reports where id = $1", [id])).toEqual([]);
    await h.asCommit(U.carol, async (q) => q("select public.report_set_visibility($1,'group')", [id]));
    expect(await rows(U.bob, "select id from public.group_reports where id = $1", [id])).toEqual([id]);
    const cols = (await h.db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'group_reports'")).rows.map((c) => c.column_name);
    expect(cols).not.toContain("submitter_id");
    expect(cols).not.toContain("owner_id");
    expect(await rows(U.bob, "select id from public.reports where id = $1", [id])).toEqual([]); // the base table stays private
  });
  it("routing and categories are managed by the company's own coordinator only", async () => {
    expect(await h.denied(U.alice, "select public.set_routing($1,$2,$3)", [A, CAT, U.dave])).toMatch(/err_forbidden/);
    expect(await h.denied(U.carol, "select public.set_routing($1,$2,$3)", [B, CAT_B, U.bob])).toMatch(/err_forbidden/);
    expect(await h.denied(U.carol, "select public.set_category_active($1,false)", [CAT_B])).toMatch(/err_forbidden/);
  });
});

describe("comments", () => {
  it("only people who can see a report can comment, and the other side is told", async () => {
    const id = await submit(U.alice);
    expect(await h.denied(U.bob, "insert into public.report_comments (report_id, author_id, body) values ($1,$2,'hi')", [id, U.bob])).toMatch(/row-level security/);
    await h.asCommit(U.carol, async (q) => q("insert into public.report_comments (report_id, author_id, body) values ($1,$2,'กำลังตรวจสอบ')", [id, U.carol]));
    expect((await h.as(U.alice, async (q) => (await q("select * from public.notifications where kind = 'report_comment'")).rows.length)) > 0).toBe(true);
  });
});

describe("the tick (automation rules)", () => {
  it("escalates overdue reports once, in two steps, and never duplicates a notice", async () => {
    const id = await submit(U.alice);
    await h.db.query("update public.reports set respond_by = now() - interval '1 hour' where id = $1", [id]);
    const first = (await h.db.query<{ run_tick: { overdue: number } }>("select public.run_tick()")).rows[0]!.run_tick;
    expect(first.overdue).toBeGreaterThanOrEqual(1);
    expect((await h.db.query<{ escalation_level: number }>("select escalation_level from public.reports where id = $1", [id])).rows[0]!.escalation_level).toBe(1);
    const before = (await h.db.query("select * from public.notifications where dedupe_key like $1", [`rep_o1:${id}%`])).rows.length;
    await h.db.query("select public.run_tick()");
    expect((await h.db.query("select * from public.notifications where dedupe_key like $1", [`rep_o1:${id}%`])).rows.length).toBe(before); // idempotent
    await h.db.query("update public.reports set respond_by = now() - interval '30 hours' where id = $1", [id]);
    await h.db.query("select public.run_tick()");
    expect((await h.db.query<{ escalation_level: number }>("select escalation_level from public.reports where id = $1", [id])).rows[0]!.escalation_level).toBe(2);
    expect((await h.as(U.erin, async (q) => (await q("select * from public.notifications where dedupe_key = $1", [`rep_o2:${id}:${U.erin}`])).rows.length))).toBe(1); // the central team is told
  });
  it("answered reports are never escalated", async () => {
    const id = await submit(U.alice);
    await h.asCommit(U.carol, async (q) => q("select public.report_transition($1,'acknowledged','')", [id]));
    await h.db.query("update public.reports set respond_by = now() - interval '5 hours' where id = $1", [id]);
    await h.db.query("select public.run_tick()");
    expect((await h.db.query<{ escalation_level: number }>("select escalation_level from public.reports where id = $1", [id])).rows[0]!.escalation_level).toBe(0);
  });
  it("only the server (service role) can run the tick; an admin can change numbers, not conditions", async () => {
    expect(await h.denied(U.alice, "select public.run_tick()")).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "select public.admin_set_rule('report_due_soon', true, 6)")).toMatch(/err_forbidden/);
    expect(await h.denied(U.frank, "select public.admin_set_rule('report_due_soon', true, 99999)")).toMatch(/err_invalid_input/);
    expect(await h.denied(U.frank, "select public.admin_set_rule('invented_rule', true, 1)")).toMatch(/err_not_found/);
    await h.asCommit(U.frank, async (q) => q("select public.admin_set_rule('report_due_soon', true, 6)"));
    expect(await h.as(U.alice, async (q) => (await q("select * from public.automation_rules")).rows.length)).toBe(0); // not readable by employees
  });
  it("a switched-off rule does nothing", async () => {
    await h.asCommit(U.frank, async (q) => q("select public.admin_set_rule('report_escalate_coordinator', false, 0)"));
    const id = await submit(U.alice);
    await h.db.query("update public.reports set respond_by = now() - interval '2 hours' where id = $1", [id]);
    await h.db.query("select public.run_tick()");
    expect((await h.db.query<{ escalation_level: number }>("select escalation_level from public.reports where id = $1", [id])).rows[0]!.escalation_level).toBe(0);
    await h.asCommit(U.frank, async (q) => q("select public.admin_set_rule('report_escalate_coordinator', true, 0)"));
  });
});

describe("file storage", () => {
  it("members upload only under their own company folder; files are readable by the uploader and by people who can see the report", async () => {
    const id = await submit(U.alice);
    await h.asCommit(U.alice, async (q) => q("insert into storage.objects (bucket_id, name) values ('report-files', $1)", [`${A}/${id}/photo.jpg`]));
    expect(await h.denied(U.alice, "insert into storage.objects (bucket_id, name) values ('report-files', $1)", [`${B}/${id}/x.jpg`])).toMatch(/row-level security/);
    expect(await h.denied(U.bob, "insert into storage.objects (bucket_id, name) values ('report-files', $1)", [`${A}/${id}/x.jpg`])).toMatch(/row-level security/);
    const read = (u: string) => h.as(u, async (q) => (await q("select * from storage.objects where bucket_id = 'report-files'")).rows.length);
    expect(await read(U.alice)).toBe(1);
    expect(await read(U.carol)).toBe(1); // coordinator
    expect(await read(U.bob)).toBe(0); // other company
  });
});
