import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, seedOrg, U } from "./seed";

let h: Db;
const CAT = UUID(601);
const n = async (sql: string, params: unknown[] = []) => Number((await h.db.query<{ n: string }>(`select count(*)::int as n from (${sql}) x`, params)).rows[0]!.n);

async function newAnnouncement(title: string) {
  const r = await h.asCommit(U.carol, async (q) => q<{ id: string }>("insert into public.announcements (author_id, company_id, title) values ($1,$2,$3) returning id", [U.carol, A, title]));
  return r.rows[0]!.id;
}

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.admin((q) => q("insert into public.report_categories (id, company_id, key, name_th) values ($1,$2,'equipment','อุปกรณ์')", [CAT, A]));
});

describe("LINE queue", () => {
  it("nothing is queued until the person has an ACTIVE LINE channel", async () => {
    await h.admin((q) => q("select app.notify($1,'announcement','a','','/news','q1')", [U.alice]));
    expect(await n("select 1 from public.notification_queue")).toBe(0);
    await h.admin((q) => q("insert into public.notification_channels (user_id, channel, status, address) values ($1,'line','pending',null)", [U.alice]));
    await h.admin((q) => q("select app.notify($1,'announcement','a','','/news','q2')", [U.alice]));
    expect(await n("select 1 from public.notification_queue")).toBe(0); // pending is not active
    await h.admin((q) => q("update public.notification_channels set status='active', address='Uaaaa' where user_id = $1", [U.alice]));
    await h.admin((q) => q("select app.notify($1,'announcement','a','','/news','q3')", [U.alice]));
    expect(await n("select 1 from public.notification_queue where user_id = $1", [U.alice])).toBe(1);
  });
  it("a repeated notice is queued once (dedupe)", async () => {
    await h.admin((q) => q("select app.notify($1,'announcement','a','','/news','q3')", [U.alice]));
    expect(await n("select 1 from public.notification_queue where user_id = $1", [U.alice])).toBe(1);
  });
  it("a group the user switched off is not queued, others still are", async () => {
    await h.asCommit(U.alice, async (q) => q("insert into public.notification_prefs (user_id, grp, line) values ($1,'reminders',false)", [U.alice]));
    await h.admin((q) => q("select app.notify($1,'report_due','t','','/reports/x','q4')", [U.alice]));
    await h.admin((q) => q("select app.notify($1,'report_assigned','t','','/reports/x','q5')", [U.alice]));
    expect(await n("select 1 from public.notification_queue q join public.notifications x on x.id = q.notification_id where x.dedupe_key = 'q4'")).toBe(0);
    expect(await n("select 1 from public.notification_queue q join public.notifications x on x.id = q.notification_id where x.dedupe_key = 'q5'")).toBe(1);
  });
  it("a failure to queue never loses the in-app notice", async () => {
    await h.admin((q) => q("alter table public.notification_queue rename to notification_queue_x"));
    await h.admin((q) => q("select app.notify($1,'announcement','b','','/news','q6')", [U.alice]));
    expect(await n("select 1 from public.notifications where dedupe_key = 'q6'")).toBe(1);
    await h.admin((q) => q("alter table public.notification_queue_x rename to notification_queue"));
  });
});

describe("channel privacy and uniqueness", () => {
  it("browsers cannot read channels, the queue, the log or webhooks; they see only their own state", async () => {
    for (const t of ["notification_channels", "notification_queue", "company_channels", "company_queue", "line_link_attempts"])
      expect(await h.denied(U.alice, `select * from public.${t}`)).toMatch(/permission denied/);
    expect(await h.as(U.alice, async (q) => (await q("select * from public.message_log")).rows.length)).toBe(0);
    const mine = await h.as(U.alice, async (q) => (await q<Record<string, unknown>>("select * from public.my_channels()")).rows);
    expect(mine.length).toBe(1);
    expect(Object.keys(mine[0]!)).not.toContain("address");
    expect(Object.keys(mine[0]!)).not.toContain("code_hash");
    expect((await h.as(U.bob, async (q) => (await q("select * from public.my_channels()")).rows.length))).toBe(0);
  });
  it("one LINE account cannot be linked to two people", async () => {
    await expect(h.db.query("insert into public.notification_channels (user_id, channel, status, address) values ($1,'line','active','Uaaaa')", [U.bob])).rejects.toThrow(/unique|duplicate/);
  });
  it("preferences are private and only the on/off value can be changed", async () => {
    expect(await h.denied(U.bob, "insert into public.notification_prefs (user_id, grp, line) values ($1,'news',false)", [U.alice])).toMatch(/row-level security/);
    expect(await h.as(U.bob, async (q) => (await q("select * from public.notification_prefs")).rows.length)).toBe(0);
    expect(await h.denied(U.alice, "update public.notification_prefs set grp = 'work' where grp = 'reminders'")).toMatch(/permission denied/);
  });
  it("unlinking removes the channel and later notices are no longer queued", async () => {
    await h.asCommit(U.alice, async (q) => q("select public.unlink_channel('line')"));
    const before = await n("select 1 from public.notification_queue");
    await h.admin((q) => q("select app.notify($1,'announcement','c','','/news','q7')", [U.alice]));
    expect(await n("select 1 from public.notification_queue")).toBe(before);
  });
});

describe("company webhook events", () => {
  it("a published company announcement and an escalated report are queued for the company's channels only", async () => {
    const ch = (await h.db.query<{ id: string }>("insert into public.company_channels (company_id, kind, webhook_url) values ($1,'teams_webhook','https://example.test/hook') returning id", [A])).rows[0]!.id;
    const other = (await h.db.query<{ id: string }>("insert into public.companies (code, name_th, status) values ('other-co','อื่น','active') returning id")).rows[0]!.id;
    await h.db.query("insert into public.company_channels (company_id, kind, webhook_url) values ($1,'gchat_webhook','https://example.test/other')", [other]);
    const id = await newAnnouncement("ประกาศบริษัท");
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [id]));
    expect(await n("select 1 from public.company_queue where channel_id = $1 and event = 'announcement'", [ch])).toBe(1);
    expect(await n("select 1 from public.company_queue")).toBe(1); // nothing for the other company
    const rid = crypto.randomUUID();
    await h.asCommit(U.alice, async (q) => q("select public.submit_report($1,$2,$3,'medium','เรื่องเร่งด่วน','','','','[]'::jsonb)", [rid, A, CAT]));
    await h.db.query("update public.reports set respond_by = now() - interval '2 hours' where id = $1", [rid]);
    await h.db.query("select public.run_tick()");
    expect(await n("select 1 from public.company_queue where event = 'report_overdue'")).toBe(1);
  });
  it("a switched-off channel or an unlisted event is not queued", async () => {
    await h.db.query("update public.company_channels set enabled = false where company_id = $1", [A]);
    const id = await newAnnouncement("อีกประกาศ");
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [id]));
    expect(await n("select 1 from public.company_queue where title = 'อีกประกาศ'")).toBe(0);
  });
  it("webhook URLs must be https", async () => {
    await expect(h.db.query("insert into public.company_channels (company_id, kind, webhook_url) values ($1,'gchat_webhook','http://insecure.test')", [A])).rejects.toThrow(/check/);
  });
  it("only coordinators of a company pass the coordinate check", async () => {
    expect(await h.as(U.carol, async (q) => (await q<{ can_coordinate: boolean }>("select public.can_coordinate($1)", [A])).rows[0]!.can_coordinate)).toBe(true);
    expect(await h.as(U.alice, async (q) => (await q<{ can_coordinate: boolean }>("select public.can_coordinate($1)", [A])).rows[0]!.can_coordinate)).toBe(false);
  });
});
