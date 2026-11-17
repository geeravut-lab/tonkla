import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

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
