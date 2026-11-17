import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";
import { UUID } from "./harness";

let h: Db;
const ids = async (user: string) => h.as(user, async (q) => (await q<{ title: string }>("select title from public.announcements order by title")).rows.map((r) => r.title));

async function publish(user: string, company: string | null, title: string) {
  const id = await h.asCommit(user, async (q) =>
    (await q<{ id: string }>("insert into public.announcements (author_id, company_id, title, body, kind) values ($1,$2,$3,'x','news') returning id", [user, company, title])).rows[0]!.id,
  );
  await h.asCommit(user, async (q) => q("select public.publish_announcement($1)", [id]));
  return id;
}

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
});

describe("announcements for someone who joins after they were published", () => {
  it("an approved join request gives the new member the live group and company announcements, but not other companies', expired or draft ones", async () => {
    await publish(U.erin, null, "group: chairman message");
    await publish(U.carol, A, "company A news");
    await publish(U.erin, B, "company B news");
    const old = await publish(U.erin, null, "group: expired");
    await h.admin(async (q) => q("update public.announcements set expires_at = now() - interval '1 day' where id = $1", [old]));
    await h.asCommit(U.erin, async (q) => q("insert into public.announcements (author_id, company_id, title, body) values ($1,null,'group: draft','x')", [U.erin]));

    // pam has a pending profile and no company: sees nothing
    await h.admin(async (q) => q("update public.profiles set status = 'pending' where id = $1", [U.pam]));
    expect(await ids(U.pam)).toEqual([]);

    const req = await h.asCommit(U.pam, async (q) => (await q<{ request_join: string }>("select public.request_join($1)", [A])).rows[0]!.request_join);
    await h.asCommit(U.carol, async (q) => q("select public.decide_join($1, true)", [req]));

    expect(await ids(U.pam)).toEqual(["company A news", "group: chairman message"]);
  });

  it("running it again changes nothing, and it never gives an announcement to someone outside its audience", async () => {
    const again = await h.admin(async (q) => (await q<{ n: number }>("select app.backfill_announcements($1) as n", [U.pam])).rows[0]!.n);
    expect(again).toBe(0);
    expect(await ids(U.pam)).not.toContain("company B news");
  });
});

describe("important announcements survive expiry; moving department delivers older announcements", () => {
  const DEPT = UUID(401);
  const nid = UUID(41);

  it("a new joiner gets expired must-read / executive / pinned messages but not an expired ordinary one, and no acknowledgement reminders for them", async () => {
    const mk = async (title: string, kind: string, extra = "") => {
      const id = await h.asCommit(U.erin, async (q) => (await q<{ id: string }>("insert into public.announcements (author_id, company_id, title, body, kind, requires_ack, ack_due_at) values ($1,null,$2,'x',$3,$4,$5) returning id", [U.erin, title, kind, extra === "ack", extra === "ack" ? new Date(Date.now() - 86400000).toISOString() : null])).rows[0]!.id);
      await h.asCommit(U.erin, async (q) => q("select public.publish_announcement($1)", [id]));
      await h.admin(async (q) => q("update public.announcements set expires_at = now() - interval '2 days' where id = $1", [id]));
      return id;
    };
    await mk("old: must read", "must_read", "ack");
    await mk("old: exec", "exec_message");
    await mk("old: ordinary", "news");
    await h.addUser(nid);
    await h.admin(async (q) => q("update public.profiles set status = 'pending' where id = $1", [nid]));
    const req = await h.asCommit(nid, async (q) => (await q<{ request_join: string }>("select public.request_join($1)", [A])).rows[0]!.request_join);
    await h.asCommit(U.carol, async (q) => q("select public.decide_join($1, true)", [req]));
    const titles = await ids(nid);
    expect(titles).toContain("old: must read");
    expect(titles).toContain("old: exec");
    expect(titles).not.toContain("old: ordinary");
    await h.admin(async (q) => q("select public.run_tick()"));
    const reminders = await h.admin(async (q) => (await q<{ n: number }>("select count(*)::int as n from public.notifications where user_id = $1 and kind = 'ack_reminder'", [nid])).rows[0]!.n);
    expect(reminders).toBe(0);
  });

  it("moving a member to a department gives them the earlier announcements addressed to that department", async () => {
    await h.admin(async (q) => q("insert into public.departments (id, company_id, name_th) values ($1,$2,'ฝ่ายผลิต')", [DEPT, A]));
    const id = await h.asCommit(U.carol, async (q) => (await q<{ id: string }>("insert into public.announcements (author_id, company_id, title, body) values ($1,$2,'department news','x') returning id", [U.carol, A])).rows[0]!.id);
    await h.asCommit(U.carol, async (q) => q("insert into public.announcement_audiences (announcement_id, audience_type, target_id) values ($1,'department',$2)", [id, DEPT]));
    await h.asCommit(U.carol, async (q) => q("select public.publish_announcement($1)", [id]));
    expect(await ids(nid)).not.toContain("department news");
    await h.admin(async (q) => q("update public.memberships set department_id = $2 where user_id = $1 and company_id = $3", [nid, DEPT, A]));
    expect(await ids(nid)).toContain("department news");
  });
});
