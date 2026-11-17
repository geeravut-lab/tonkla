import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

let h: Db;
const CAT = UUID(701);
type Dash = { members: number; reports: { open: number; new: number; overdue: number; answered: number; answered_in_time: number }; ideas: { new: number; adopted: number; value: Record<string, number> }; announcements: { published: number } };
const dash = (user: string, company: string) => h.as(user, async (q) => (await q<{ company_dashboard: Dash }>("select public.company_dashboard($1, 30)", [company])).rows[0]!.company_dashboard);

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.admin((q) => q("insert into public.report_categories (id, company_id, key, name_th) values ($1,$2,'equipment','อุปกรณ์')", [CAT, A]));
  const rid = crypto.randomUUID();
  await h.asCommit(U.alice, async (q) => q("select public.submit_report($1,$2,$3,'medium','เรื่องแรก','','','','[]'::jsonb)", [rid, A, CAT]));
  await h.asCommit(U.carol, async (q) => q("select public.report_transition($1,'acknowledged','')", [rid]));
  await h.asCommit(U.alice, async (q) => q("select public.submit_report(gen_random_uuid(),$1,$2,'low','เรื่องสอง','','','','[]'::jsonb)", [A, CAT]));
});

describe("company dashboard", () => {
  it("shows aggregates to the company's executive and coordinator, never to employees or other companies", async () => {
    const d = await dash(U.gina, A);
    expect(d.reports.new).toBe(2);
    expect(d.reports.answered).toBe(1);
    expect(d.reports.answered_in_time).toBe(1);
    expect(d.members).toBe(4);
    expect((await dash(U.carol, A)).reports.open).toBe(2);
    expect((await dash(U.erin, A)).reports.open).toBe(2); // central team
    for (const [u, c] of [[U.alice, A], [U.dave, A], [U.bob, A], [U.gina, B], [U.carol, B]] as const)
      expect(await h.denied(u, "select public.company_dashboard($1, 30)", [c])).toMatch(/err_forbidden/);
  });
  it("the executive still cannot read individual reports", async () => {
    expect((await h.as(U.gina, async (q) => (await q("select * from public.reports")).rows.length))).toBe(0);
  });
  it("counts only verified idea results as value", async () => {
    const id = crypto.randomUUID();
    await h.asCommit(U.alice, async (q) => q("select public.submit_idea($1,$2,'cost_reduction','ลดกระดาษ','','','','',null)", [id, A]));
    for (const to of ["screening", "evaluating", "piloting"]) await h.asCommit(U.carol, async (q) => q("select public.idea_transition($1,$2,'')", [id, to]));
    const oid = (await h.asCommit(U.carol, async (q) => q<{ idea_add_outcome: string }>("select public.idea_add_outcome($1,'money_saved_thb',5000,'2026-11-01','2026-11-30','')", [id]))).rows[0]!.idea_add_outcome;
    expect(Object.keys((await dash(U.gina, A)).ideas.value)).toEqual([]);
    await h.asCommit(U.gina, async (q) => q("select public.idea_verify_outcome($1)", [oid]));
    expect(Number((await dash(U.gina, A)).ideas.value.money_saved_thb)).toBe(5000);
    expect((await dash(U.gina, A)).ideas.adopted).toBe(1);
  });
});

describe("PDPA", () => {
  it("export returns only the caller's own data", async () => {
    const mine = await h.as(U.alice, async (q) => (await q<{ my_data_export: { reports: unknown[]; profile: { id: string } } }>("select public.my_data_export()")).rows[0]!.my_data_export);
    expect(mine.profile.id).toBe(U.alice);
    expect(mine.reports.length).toBe(2);
    const bobs = await h.as(U.bob, async (q) => (await q<{ my_data_export: { reports: unknown[] } }>("select public.my_data_export()")).rows[0]!.my_data_export);
    expect(bobs.reports.length).toBe(0);
  });
  it("a deletion request is recorded once and shown to the person and to admins only", async () => {
    await h.asCommit(U.alice, async (q) => q("select public.request_privacy('delete','ขอลบข้อมูล')"));
    expect(await h.denied(U.alice, "select public.request_privacy('delete')")).toMatch(/err_already_requested/);
    expect((await h.as(U.alice, async (q) => (await q("select * from public.privacy_requests")).rows.length))).toBe(1);
    expect((await h.as(U.bob, async (q) => (await q("select * from public.privacy_requests")).rows.length))).toBe(0);
    expect((await h.as(U.frank, async (q) => (await q("select * from public.privacy_requests")).rows.length))).toBe(1);
    expect((await h.as(U.frank, async (q) => (await q("select * from public.notifications where kind = 'privacy_request'")).rows.length)) > 0).toBe(true);
  });
  it("only a platform admin can anonymise; reports stay but lose the person; the owner and oneself are protected", async () => {
    expect(await h.denied(U.carol, "select public.anonymize_user($1)", [U.alice])).toMatch(/err_forbidden/);
    expect(await h.denied(U.frank, "select public.anonymize_user($1)", [U.frank])).toMatch(/err_forbidden/);
    expect(await h.denied(U.frank, "select public.anonymize_user($1)", [U.owner])).toMatch(/err_forbidden/);
    await h.admin((q) => q("insert into public.notification_channels (user_id, channel, status, address) values ($1,'line','active','Ualice')", [U.alice]));
    await h.asCommit(U.frank, async (q) => q("select public.anonymize_user($1)", [U.alice]));
    const p = (await h.db.query<{ display_name: string; status: string }>("select display_name, status from public.profiles where id = $1", [U.alice])).rows[0]!;
    expect(p).toEqual({ display_name: "อดีตพนักงาน", status: "suspended" });
    expect((await h.db.query("select * from public.notification_channels where user_id = $1", [U.alice])).rows.length).toBe(0);
    expect((await h.db.query("select * from public.memberships where user_id = $1 and (work_email is not null or status = 'active')", [U.alice])).rows.length).toBe(0);
    expect((await h.db.query("select * from public.reports where submitter_id = $1", [U.alice])).rows.length).toBe(2); // business records remain
    expect(await h.as(U.alice, async (q) => (await q("select * from public.companies")).rows.length)).toBe(0); // account closed
    expect((await h.db.query("select * from public.privacy_requests where user_id = $1 and status = 'done'", [U.alice])).rows.length).toBe(1);
    expect((await h.db.query("select * from public.audit_log where action = 'privacy.anonymize'")).rows.length).toBe(1);
  });
  it("retention pruning removes only old rows", async () => {
    await h.db.query("insert into public.message_log (at, channel, status) values (now() - interval '100 days', 'line', 'sent'), (now(), 'line', 'sent')");
    await h.db.query("select public.prune_old_data()");
    expect((await h.db.query("select * from public.message_log")).rows.length).toBe(1);
  });
});
