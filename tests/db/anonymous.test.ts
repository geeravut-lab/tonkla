import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { A, seedOrg, U } from "./seed";

let h: Db;
const submit = async (nonce: string, code = "AN-ABCDEFGH", secret = "hash1", title = "เรื่องร้องเรียนทดสอบ") =>
  h.admin((q) => q<{ anon_submit: string }>("select public.anon_submit($1,$2,$3,'complaint',$4,'รายละเอียด')", [nonce, code, secret, title]));

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.asCommit(U.frank, async (q) => q("select public.admin_set_anon_handler($1, true)", [U.erin])); // central team member appointed as handler
});

describe("anonymity by construction", () => {
  it("the tables hold no reference to a person or a company", async () => {
    const cols = (await h.db.query<{ column_name: string; table_name: string }>("select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('anonymous_reports','anonymous_events','anon_used_tokens')")).rows;
    const names = cols.map((c) => c.column_name);
    for (const banned of ["user_id", "submitter_id", "author_id", "company_id", "ip", "email", "created_at", "at"]) expect(names, banned).not.toContain(banned);
    expect(cols.filter((c) => c.table_name === "anonymous_reports").map((c) => c.column_name)).toContain("day"); // a date, not a timestamp
    const type = (await h.db.query<{ data_type: string }>("select data_type from information_schema.columns where table_name = 'anonymous_reports' and column_name = 'day'")).rows[0]!.data_type;
    expect(type).toBe("date");
  });
  it("no foreign key leads from a case to a person or company", async () => {
    const fks = (await h.db.query<{ t: string }>("select ccu.table_name as t from information_schema.table_constraints tc join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name where tc.constraint_type = 'FOREIGN KEY' and tc.table_name in ('anonymous_reports','anonymous_events','anon_used_tokens')")).rows.map((r) => r.t);
    expect(fks.filter((t) => t !== "anonymous_reports")).toEqual([]);
  });
});

describe("who can read cases", () => {
  it("only appointed central handlers: not employees, coordinators, executives, other central staff, or platform admins", async () => {
    await submit("n1");
    for (const u of [U.alice, U.carol, U.gina, U.dave, U.frank, U.owner]) expect(await h.as(u, async (q) => (await q("select * from public.anonymous_reports")).rows.length), u).toBe(0);
    expect(await h.as(U.erin, async (q) => (await q("select * from public.anonymous_reports")).rows.length)).toBe(1);
    expect(await h.as(U.erin, async (q) => (await q("select * from public.anonymous_events")).rows.length)).toBe(1);
  });
  it("platform admins appoint handlers but must pick central staff; they see who handles, never the cases", async () => {
    expect(await h.denied(U.carol, "select public.admin_set_anon_handler($1, true)", [U.carol])).toMatch(/err_forbidden/);
    expect(await h.denied(U.frank, "select public.admin_set_anon_handler($1, true)", [U.alice])).toMatch(/err_not_central/);
    expect(await h.as(U.frank, async (q) => (await q("select * from public.anonymous_handlers")).rows.length)).toBe(1);
  });
  it("a handler who loses the central role loses access at once", async () => {
    await h.admin((q) => q("delete from public.role_assignments where user_id = $1", [U.erin]));
    expect(await h.as(U.erin, async (q) => (await q("select * from public.anonymous_reports")).rows.length)).toBe(0);
    await h.admin((q) => q("insert into public.role_assignments (user_id, role, scope_type) values ($1,'central_team','group')", [U.erin]));
  });
  it("browsers cannot write or call the server-only functions", async () => {
    expect(await h.denied(U.erin, "insert into public.anonymous_reports (case_code, secret_hash, category, title, body) values ('AN-ABCDEFGH','x','other','abc','x')")).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "select public.anon_submit('n','AN-ABCDEFGH','h','other','abc','x')")).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "select public.anon_status('AN-ABCDEFGH','h')")).toMatch(/permission denied/);
  });
});

describe("submitting and following a case", () => {
  it("a token can be used once (replay is refused); the quota is three per day", async () => {
    await submit("once", "AN-BBBBBBBB");
    await expect(submit("once", "AN-CCCCCCCC")).rejects.toThrow(/duplicate|unique/);
    const take = async () => h.asCommit(U.alice, async (q) => (await q<{ anon_take_token: boolean }>("select public.anon_take_token()")).rows[0]!.anon_take_token);
    expect([await take(), await take(), await take(), await take()]).toEqual([true, true, true, false]);
    expect(await h.asCommit(U.pam, async (q) => (await q<{ anon_take_token: boolean }>("select public.anon_take_token()")).rows[0]!.anon_take_token)).toBe(false); // pending users cannot
  });
  it("handlers are told a case exists without its content, in the app and by live signal", async () => {
    await h.db.query("delete from realtime.sent");
    await submit("n2", "AN-DDDDDDDD", "hash2", "ความลับสุดยอด");
    const n = (await h.as(U.erin, async (q) => (await q<{ title: string; body: string }>("select title, body from public.notifications where kind = 'anon_new' order by created_at desc limit 1")).rows))[0]!;
    expect(n.title).toBe("AN-DDDDDDDD");
    expect(JSON.stringify(n)).not.toContain("ความลับ");
    expect((await h.db.query<{ topic: string }>("select topic from realtime.sent")).rows.map((r) => r.topic)).toContain("anon");
  });
  it("the reporter checks status with code + secret only; a wrong code and a wrong secret look the same", async () => {
    const ok = await h.admin((q) => q<{ anon_status: { status: string } }>("select public.anon_status('an-abcdefgh','hash1')"));
    expect(ok.rows[0]!.anon_status.status).toBe("received");
    const msg = (e: unknown) => (e as Error).message;
    const a = await h.admin((q) => q("select public.anon_status('AN-ABCDEFGH','wrong')")).catch(msg);
    const b = await h.admin((q) => q("select public.anon_status('AN-ZZZZZZZZ','hash1')")).catch(msg);
    expect(a).toBe(b);
    expect(String(a)).toMatch(/err_anon_not_found/);
  });
  it("the reporter sees replies but never internal notes; follow-ups reach handlers", async () => {
    const id = (await h.as(U.erin, async (q) => (await q<{ id: string }>("select id from public.anonymous_reports where case_code = 'AN-ABCDEFGH'")).rows))[0]!.id;
    expect(await h.denied(U.alice, "select public.anon_reply($1,'reply','x')", [id])).toMatch(/err_forbidden/);
    await h.asCommit(U.erin, async (q) => q("select public.anon_reply($1,'note','ภายใน: ตรวจสอบฝ่ายบัญชีก่อน')", [id]));
    await h.asCommit(U.erin, async (q) => q("select public.anon_set_status($1,'reviewing','รับเรื่องแล้ว กำลังตรวจสอบ')", [id]));
    await h.admin((q) => q("select public.anon_followup('AN-ABCDEFGH','hash1','มีข้อมูลเพิ่ม')"));
    const st = (await h.admin((q) => q<{ anon_status: { status: string; messages: { kind: string; body: string }[] } }>("select public.anon_status('AN-ABCDEFGH','hash1')"))).rows[0]!.anon_status;
    expect(st.status).toBe("reviewing");
    expect(JSON.stringify(st.messages)).toContain("รับเรื่องแล้ว");
    expect(JSON.stringify(st.messages)).not.toContain("ภายใน");
    expect((await h.as(U.erin, async (q) => (await q("select * from public.notifications where kind = 'anon_followup'")).rows.length)) > 0).toBe(true);
  });
  it("a closed case accepts no follow-up", async () => {
    const id = (await h.as(U.erin, async (q) => (await q<{ id: string }>("select id from public.anonymous_reports where case_code = 'AN-ABCDEFGH'")).rows))[0]!.id;
    await h.asCommit(U.erin, async (q) => q("select public.anon_set_status($1,'closed','')", [id]));
    await expect(h.admin((q) => q("select public.anon_followup('AN-ABCDEFGH','hash1','อีกครั้ง')"))).rejects.toThrow(/err_invalid_input/);
  });
  it("handlers' live topic is closed to everyone else", async () => {
    const may = (u: string) => h.as(u, async (q) => (await q<{ ok: boolean }>("select app.live_may_hear('anon') as ok")).rows[0]!.ok);
    expect(await may(U.erin)).toBe(true);
    for (const u of [U.alice, U.carol, U.frank]) expect(await may(u)).toBe(false);
    expect(A).toBeTruthy();
  });
});
