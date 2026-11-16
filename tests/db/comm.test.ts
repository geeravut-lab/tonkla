import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, B, BU, seedOrg, U } from "./seed";

let h: Db;
const DEPT_A = UUID(301);
const POS_A = UUID(302);
const eve = UUID(21); // employee of A in the department
const ids = async (user: string, sql: string, params: unknown[] = []) => h.as(user, async (q) => (await q<{ id: string }>(sql, params)).rows.map((r) => r.id).sort());
const pings = async () => (await h.db.query<{ topic: string }>("select topic from realtime.sent")).rows.map((r) => r.topic);

async function draft(user: string, company: string | null, requiresAck = false) {
  return h.asCommit(user, async (q) =>
    (await q<{ id: string }>("insert into public.announcements (author_id, company_id, title, body, kind, requires_ack) values ($1,$2,'หัวข้อ','เนื้อหา','news',$3) returning id", [user, company, requiresAck])).rows[0]!.id,
  );
}

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.addUser(eve);
  await h.admin(async (q) => {
    await q("update public.profiles set status = 'active' where id = $1", [eve]);
    await q("insert into public.departments (id, company_id, name_th) values ($1, $2, 'ฝ่ายขาย')", [DEPT_A, A]);
    await q("insert into public.positions (id, company_id, name_th) values ($1, $2, 'พนักงานขาย')", [POS_A, A]);
    await q("insert into public.memberships (user_id, company_id, department_id, position_id) values ($1, $2, $3, $4)", [eve, A, DEPT_A, POS_A]);
  });
});

describe("announcement audiences and visibility", () => {
  it("only coordinators/execs of a company (or central for the group) can create announcements", async () => {
    expect(await h.denied(U.alice, "insert into public.announcements (author_id, company_id, title) values ($1,$2,'x')", [U.alice, A])).toMatch(/row-level security/);
    expect(await h.denied(U.carol, "insert into public.announcements (author_id, company_id, title) values ($1,$2,'x')", [U.carol, B])).toMatch(/row-level security/);
    expect(await h.denied(U.carol, "insert into public.announcements (author_id, company_id, title) values ($1,null,'x')", [U.carol])).toMatch(/row-level security/);
    expect(await h.denied(U.carol, "insert into public.announcements (author_id, company_id, title, status) values ($1,$2,'x','published')", [U.carol, A])).toMatch(/permission denied/);
    await draft(U.carol, A);
    await draft(U.gina, A); // company executive may write too
    await draft(U.erin, null); // central team: group level
  });

  it("a company-level announcement cannot address other companies, business units or the group", async () => {
    const id = await draft(U.carol, A);
    for (const [type, target] of [["group", null], ["business_unit", BU], ["company", B]] as const)
      expect(await h.denied(U.carol, "insert into public.announcement_audiences (announcement_id, audience_type, target_id) values ($1,$2,$3)", [id, type, target])).toMatch(/err_forbidden/);
  });

  it("drafts are invisible to employees; publishing delivers only to the addressed people", async () => {
    const id = await draft(U.carol, A);
    await h.asCommit(U.carol, async (q) => q("insert into public.announcement_audiences (announcement_id, audience_type, target_id) values ($1,'department',$2)", [id, DEPT_A]));
    expect(await ids(eve, "select id from public.announcements where id = $1", [id])).toEqual([]); // draft
    const n = await h.asCommit(U.carol, async (q) => (await q<{ publish_announcement: number }>("select public.publish_announcement($1)", [id])).rows[0]!.publish_announcement);
    expect(n).toBe(1); // only eve is in the department
    expect(await ids(eve, "select id from public.announcements where id = $1", [id])).toEqual([id]);
    expect(await ids(U.alice, "select id from public.announcements where id = $1", [id])).toEqual([]); // same company, other department
    expect(await ids(U.bob, "select id from public.announcements where id = $1", [id])).toEqual([]); // other company
    expect(await ids(U.carol, "select id from public.announcements where id = $1", [id])).toEqual([id]); // author/coordinator
  });

  it("a group announcement reaches everyone in every company; company B cannot read A's company announcement", async () => {
    const g = await draft(U.erin, null);
    await h.asCommit(U.erin, async (q) => q("insert into public.announcement_audiences (announcement_id, audience_type) values ($1,'group')", [g]));
    await h.asCommit(U.erin, async (q) => q("select public.publish_announcement($1)", [g]));
    expect(await ids(U.alice, "select id from public.announcements where id = $1", [g])).toEqual([g]);
    expect(await ids(U.bob, "select id from public.announcements where id = $1", [g])).toEqual([g]);
    const a = await draft(U.carol, A);
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [a]));
    expect(await ids(U.alice, "select id from public.announcements where id = $1", [a])).toEqual([a]); // default audience = whole company
    expect(await ids(U.bob, "select id from public.announcements where id = $1", [a])).toEqual([]);
  });

  it("people who join the company later receive announcements that are still open", async () => {
    const a = await draft(U.carol, A);
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [a]));
    const late = UUID(22);
    await h.addUser(late);
    await h.admin(async (q) => {
      await q("update public.profiles set status = 'active' where id = $1", [late]);
      await q("insert into public.memberships (user_id, company_id) values ($1, $2)", [late, A]);
    });
    expect(await ids(late, "select id from public.announcements where id = $1", [a])).toEqual([a]);
  });

  it("only a manager can publish; employees cannot publish or archive", async () => {
    const id = await draft(U.carol, A);
    expect(await h.denied(U.alice, "select public.publish_announcement($1)", [id])).toMatch(/err_forbidden/);
    expect(await h.denied(U.bob, "select public.archive_announcement($1)", [id])).toMatch(/err_forbidden/);
  });
});

describe("must-read acknowledgement and readership", () => {
  it("a must-read can be acknowledged by its recipient only, and the manager sees who has not read", async () => {
    const id = await draft(U.carol, A, true);
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [id]));
    expect(await h.denied(U.bob, "select public.ack_announcement($1)", [id])).toMatch(/err_no_rows/); // not a recipient
    await h.asCommit(U.alice, async (q) => q("select public.mark_announcement_read($1)", [id]));
    const before = await h.as(U.carol, async (q) => (await q<{ user_id: string; acked_at: string | null }>("select * from public.announcement_readership($1)", [id])).rows);
    expect(before.find((r) => r.user_id === U.alice)?.acked_at).toBeNull();
    await h.asCommit(U.alice, async (q) => q("select public.ack_announcement($1)", [id]));
    const after = await h.as(U.carol, async (q) => (await q<{ user_id: string; acked_at: string | null }>("select * from public.announcement_readership($1)", [id])).rows);
    expect(after.find((r) => r.user_id === U.alice)?.acked_at).not.toBeNull();
    expect(await h.denied(U.alice, "select * from public.announcement_readership($1)", [id])).toMatch(/err_forbidden/);
  });
  it("receipts cannot be edited or inserted directly", async () => {
    expect(await h.denied(U.alice, "update public.announcement_receipts set acked_at = now()")).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "insert into public.announcement_receipts (announcement_id, user_id) values (gen_random_uuid(), $1)", [U.alice])).toMatch(/permission denied/);
  });
});

describe("comments and reactions", () => {
  it("recipients can comment and like; outsiders cannot even see the thread", async () => {
    const id = await draft(U.carol, A);
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [id]));
    await h.asCommit(U.alice, async (q) => q("insert into public.announcement_comments (announcement_id, author_id, body) values ($1,$2,'ขอบคุณค่ะ')", [id, U.alice]));
    await h.asCommit(U.alice, async (q) => q("insert into public.reactions (entity_type, entity_id, user_id) values ('announcement',$1,$2)", [id, U.alice]));
    expect(await h.denied(U.bob, "insert into public.announcement_comments (announcement_id, author_id, body) values ($1,$2,'hi')", [id, U.bob])).toMatch(/row-level security/);
    expect(await h.denied(U.bob, "insert into public.reactions (entity_type, entity_id, user_id) values ('announcement',$1,$2)", [id, U.bob])).toMatch(/row-level security/);
    expect(await h.as(U.bob, async (q) => (await q("select * from public.announcement_comments")).rows.length)).toBe(0);
    expect(await h.denied(U.alice, "insert into public.announcement_comments (announcement_id, author_id, body) values ($1,$2,'as bob')", [id, U.bob])).toMatch(/row-level security/);
  });
  it("a comment can be hidden by its author or a manager, not by a colleague", async () => {
    const id = await draft(U.carol, A);
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [id]));
    const cid = await h.asCommit(U.alice, async (q) => (await q<{ id: string }>("insert into public.announcement_comments (announcement_id, author_id, body) values ($1,$2,'x') returning id", [id, U.alice])).rows[0]!.id);
    const mine = await h.as(eve, async (q) => (await q("update public.announcement_comments set deleted_at = now() where id = $1 returning id", [cid])).rows.length);
    expect(mine).toBe(0);
    const byManager = await h.as(U.carol, async (q) => (await q("update public.announcement_comments set deleted_at = now() where id = $1 returning id", [cid])).rows.length);
    expect(byManager).toBe(1);
  });
});

describe("notifications", () => {
  it("each recipient gets exactly one notification per announcement, visible only to them", async () => {
    const id = await draft(U.carol, A);
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [id]));
    await h.admin((q) => q("select app.notify($1,'announcement','ซ้ำ','','/news/x','ann:' || $2::text)", [U.alice, id])); // duplicate key
    expect(await h.as(U.alice, async (q) => (await q("select * from public.notifications where dedupe_key = $1", [`ann:${id}`])).rows.length)).toBe(1);
    expect(await h.as(U.bob, async (q) => (await q("select * from public.notifications where dedupe_key = $1", [`ann:${id}`])).rows.length)).toBe(0);
    expect(await h.as(U.carol, async (q) => (await q("select * from public.notifications where dedupe_key = $1", [`ann:${id}`])).rows.length)).toBe(0); // author is not notified of own post
  });
  it("users cannot create or edit notifications directly; marking read goes through the function", async () => {
    expect(await h.denied(U.alice, "insert into public.notifications (user_id, kind, title, dedupe_key) values ($1,'x_y','t','k')", [U.alice])).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "update public.notifications set title = 'x'")).toMatch(/permission denied/);
    const n = await h.asCommit(U.alice, async (q) => (await q<{ mark_notifications_read: number }>("select public.mark_notifications_read()")).rows[0]!.mark_notifications_read);
    expect(n).toBeGreaterThan(0);
    expect(await h.as(U.alice, async (q) => (await q("select * from public.notifications where read_at is null")).rows.length)).toBe(0);
  });
  it("internal links only", async () => {
    await expect(h.db.query("select app.notify($1,'x_y','t','','https://evil.example','bad1')", [U.alice])).resolves.toBeTruthy(); // notify swallows errors...
    expect(await h.as(U.alice, async (q) => (await q("select * from public.notifications where dedupe_key = 'bad1'")).rows.length)).toBe(0); // ...and nothing is stored
  });
});

describe("live signals", () => {
  it("a new notification pings only its owner's topic, and pings carry no data", async () => {
    await h.db.query("delete from realtime.sent");
    await h.admin((q) => q("select app.notify($1,'announcement','t','','/news','ping-test')", [U.alice]));
    expect(await pings()).toEqual([`u:${U.alice}`]);
    const payloads = await h.db.query<{ payload: unknown }>("select payload from realtime.sent");
    expect(payloads.rows.every((r) => JSON.stringify(r.payload) === "{}")).toBe(true);
  });
  it("a join request pings the company's coordinator topic", async () => {
    await h.db.query("delete from realtime.sent");
    const pam = U.pam;
    await h.asCommit(pam, async (q) => q("select public.request_join($1)", [A]));
    expect(await pings()).toContain(`co:${A}`);
    expect(await h.as(U.carol, async (q) => (await q("select * from public.notifications where kind = 'join_request'")).rows.length)).toBe(1); // the coordinator is told
  });
  it("topic listening rules are decided by the database", async () => {
    const may = async (user: string, topic: string) => h.as(user, async (q) => (await q<{ ok: boolean }>("select app.live_may_hear($1) as ok", [topic])).rows[0]!.ok);
    expect(await may(U.alice, `u:${U.alice}`)).toBe(true);
    expect(await may(U.alice, `u:${U.bob}`)).toBe(false);
    expect(await may(U.alice, `co:${A}`)).toBe(false);
    expect(await may(U.carol, `co:${A}`)).toBe(true);
    expect(await may(U.carol, `co:${B}`)).toBe(false);
    expect(await may(U.alice, "central")).toBe(false);
    expect(await may(U.erin, "central")).toBe(true);
    expect(await may(U.alice, "adm")).toBe(false);
    expect(await may(U.frank, "adm")).toBe(true);
    expect(await may(U.alice, "garbage")).toBe(false);
    expect(await may(U.alice, "co:not-a-uuid")).toBe(false);
  });
});
