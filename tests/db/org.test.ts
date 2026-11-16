import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, B, BU, M, seedOrg, U } from "./seed";

let h: Db;
const ids = async (user: string | null, sql: string, params: unknown[] = []) =>
  h.as(user, async (q) => (await q<{ id: string }>(sql, params)).rows.map((r) => r.id).sort());

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
});

describe("company isolation (memberships, companies, directory)", () => {
  it("an employee of A sees company A only, never B", async () => {
    expect(await ids(U.alice, "select id from public.companies")).toEqual([A]);
  });
  it("an employee cannot read colleagues' memberships (work email, codes) – only their own", async () => {
    expect(await ids(U.alice, "select id from public.memberships")).toEqual([M.alice]);
  });
  it("the directory shows colleagues of the own company and nobody from B", async () => {
    const rows = await h.as(U.alice, async (q) => (await q<{ company_id: string }>("select company_id from public.directory")).rows);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.company_id === A)).toBe(true);
  });
  it("the directory exposes no e-mail or employee code columns", async () => {
    const cols = await h.db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'directory'");
    const names = cols.rows.map((c) => c.column_name);
    expect(names).not.toContain("work_email");
    expect(names).not.toContain("employee_code");
  });
  it("the coordinator of A cannot see or manage company B", async () => {
    expect(await ids(U.carol, "select id from public.companies")).toEqual([A]);
    expect(await ids(U.carol, "select id from public.memberships where company_id = $1", [B])).toEqual([]);
    expect(await h.denied(U.carol, "select public.import_roster($1, '[{\"email\":\"x@y.co\"}]'::jsonb)", [B])).toMatch(/err_forbidden/);
    expect(await h.denied(U.carol, "select public.create_invitation($1)", [B])).toMatch(/err_forbidden/);
  });
  it("central team sees every company", async () => {
    expect(await ids(U.erin, "select id from public.companies")).toEqual([A, B].sort());
  });
  it("a pending user sees no business data at all, but can list joinable companies", async () => {
    expect(await ids(U.pam, "select id from public.companies")).toEqual([]);
    expect(await ids(U.pam, "select company_id as id from public.directory")).toEqual([]);
    const opts = await h.as(U.pam, async (q) => (await q("select * from public.join_company_options()")).rows);
    expect(opts.length).toBe(2);
  });
  it("a user whose membership ended loses access immediately", async () => {
    await h.admin((q) => q("update public.memberships set status = 'ended' where id = $1", [M.bob]));
    expect(await ids(U.bob, "select id from public.companies")).toEqual([]);
    await h.admin((q) => q("update public.memberships set status = 'active' where id = $1", [M.bob]));
    expect(await ids(U.bob, "select id from public.companies")).toEqual([B]);
  });
});

describe("no privilege escalation from the browser", () => {
  it("users cannot change their own status, roles or memberships directly", async () => {
    expect(await h.denied(U.pam, "update public.profiles set status = 'active' where id = $1", [U.pam])).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "insert into public.role_assignments (user_id, role, scope_type) values ($1, 'central_team', 'group')", [U.alice])).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "update public.memberships set company_id = $1 where id = $2", [B, M.alice])).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "insert into public.memberships (user_id, company_id) values ($1, $2)", [U.alice, B])).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "insert into public.platform_admins (user_id) values ($1)", [U.alice])).toMatch(/permission denied/);
  });
  it("users can edit their display name but not someone else's profile", async () => {
    await h.as(U.alice, async (q) => {
      const r = await q("update public.profiles set display_name = 'Alice X' where id = $1 returning id", [U.alice]);
      expect(r.rows.length).toBe(1);
      const other = await q("update public.profiles set display_name = 'hacked' where id = $1 returning id", [U.bob]);
      expect(other.rows.length).toBe(0);
    });
  });
  it("granting a central role needs a platform admin; a coordinator cannot make themselves central", async () => {
    expect(await h.denied(U.carol, "select public.grant_role($1, 'central_team', 'group', null)", [U.carol])).toMatch(/err_forbidden/);
    expect(await h.denied(U.carol, "select public.grant_role($1, 'coordinator', 'company', $2)", [U.alice, A])).toMatch(/err_forbidden/);
  });
  it("a coordinator may grant supervisor to a member of their own company only", async () => {
    await h.asCommit(U.carol, async (q) => q("select public.grant_role($1, 'supervisor', 'company', $2)", [U.alice, A]));
    expect(await h.denied(U.carol, "select public.grant_role($1, 'supervisor', 'company', $2)", [U.bob, B])).toMatch(/err_forbidden/);
    await h.admin((q) => q("delete from public.role_assignments where user_id = $1 and role = 'supervisor'", [U.alice]));
  });
  it("the supervisor of alice sees alice's membership; alice cannot see dave's", async () => {
    expect(await ids(U.dave, "select id from public.memberships where user_id = $1", [U.alice])).toEqual([M.alice]);
    expect(await ids(U.alice, "select id from public.memberships where user_id = $1", [U.dave])).toEqual([]);
  });
  it("company_exec of A cannot read the memberships table of A (aggregates only, later)", async () => {
    expect(await ids(U.gina, "select id from public.memberships where user_id <> $1", [U.gina])).toEqual([]);
  });
});

describe("provisioning", () => {
  it("a verified e-mail on the roster activates a new user automatically", async () => {
    const nid = UUID(31);
    await h.admin(async (q) => {
      await q("insert into public.roster_entries (company_id, work_email, display_name) values ($1, 'new@corp-a.test', 'คนใหม่')", [A]);
      await q("insert into auth.users (id, email, email_confirmed_at) values ($1, 'New@corp-a.test', now())", [nid]);
    });
    const n = await h.asCommit(nid, async (q) => (await q<{ claim_roster: number }>("select public.claim_roster()")).rows[0]!.claim_roster);
    expect(n).toBe(1);
    expect(await ids(nid, "select id from public.companies")).toEqual([A]);
  });
  it("an unverified e-mail never claims a roster entry", async () => {
    const uid = UUID(32);
    await h.admin(async (q) => {
      await q("insert into public.roster_entries (company_id, work_email) values ($1, 'victim@corp-a.test')", [A]);
      await q("insert into auth.users (id, email, email_confirmed_at) values ($1, 'victim@corp-a.test', null)", [uid]);
    });
    const n = await h.asCommit(uid, async (q) => (await q<{ claim_roster: number }>("select public.claim_roster()")).rows[0]!.claim_roster);
    expect(n).toBe(0);
    expect(await ids(uid, "select id from public.companies")).toEqual([]);
  });
  it("an invitation code works once, and every failure gives the same answer", async () => {
    const uid = UUID(33);
    await h.addUser(uid);
    const code = await h.asCommit(U.carol, async (q) => (await q<{ create_invitation: string }>("select public.create_invitation($1, 24)", [A])).rows[0]!.create_invitation);
    expect(await h.denied(uid, "select public.redeem_invitation('WRONGCODE1')")).toMatch(/err_invite_invalid/);
    await h.asCommit(uid, async (q) => q("select public.redeem_invitation($1)", [code.toLowerCase()]));
    expect(await ids(uid, "select id from public.companies")).toEqual([A]);
    expect(await h.denied(UUID(34), "select public.redeem_invitation($1)", [code])).toMatch(/err_/);
    const stored = await h.db.query<{ code_hash: string }>("select code_hash from public.invitations");
    expect(stored.rows.some((r) => r.code_hash === code)).toBe(false); // only the hash is stored
  });
  it("join requests: only the coordinator of that company decides; approval creates the membership", async () => {
    const uid = UUID(35);
    await h.addUser(uid);
    const rid = await h.asCommit(uid, async (q) => (await q<{ request_join: string }>("select public.request_join($1, 'ขอเข้าร่วม')", [A])).rows[0]!.request_join);
    expect(await h.denied(U.bob, "select public.decide_join($1, true)", [rid])).toMatch(/err_forbidden|err_not_found/);
    expect(await ids(U.carol, "select id from public.join_requests where id = $1", [rid])).toEqual([rid]);
    expect(await ids(U.bob, "select id from public.join_requests where id = $1", [rid])).toEqual([]);
    await h.asCommit(U.carol, async (q) => q("select public.decide_join($1, true)", [rid]));
    expect(await ids(uid, "select id from public.companies")).toEqual([A]);
  });
});

describe("platform admins", () => {
  it("only admins can grant; no accounts are created from an e-mail; non-admins are refused", async () => {
    expect(await h.denied(U.alice, "select public.grant_admin('alice@example.test')")).toMatch(/err_forbidden/);
    expect(await h.denied(U.frank, "select public.grant_admin('nobody@nowhere.test')")).toMatch(/err_no_such_account/);
    await h.asCommit(U.frank, async (q) => q("select public.grant_admin('erin@example.test')"));
    await h.admin((q) => q("delete from public.platform_admins where user_id = $1", [U.erin]));
  });
  it("admins cannot revoke themselves or the owner", async () => {
    expect(await h.denied(U.frank, "select public.revoke_admin($1)", [U.frank])).toMatch(/err_cannot_revoke_self/);
    expect(await h.denied(U.frank, "select public.revoke_admin($1)", [U.owner])).toMatch(/err_cannot_revoke_owner/);
  });
  it("the admin list is invisible to everyone else", async () => {
    expect(await ids(U.alice, "select user_id as id from public.platform_admins")).toEqual([]);
    expect((await ids(U.frank, "select user_id as id from public.platform_admins")).length).toBe(2);
  });
});

describe("audit trail", () => {
  it("row-change triggers record membership/role/admin changes without personal data", async () => {
    const r = await h.db.query<{ action: string; detail: unknown }>("select action, detail from public.audit_log where action like 'db.%'");
    expect(r.rows.some((x) => x.action === "db.memberships.insert")).toBe(true);
    expect(r.rows.some((x) => x.action === "db.platform_admins.insert")).toBe(true);
    const settings = r.rows.filter((x) => x.action.startsWith("db.platform_settings"));
    expect(JSON.stringify(settings)).not.toContain("example.test"); // setting values (owner e-mail) never copied
  });
  it("rows cannot be updated or deleted, not even by the table owner", async () => {
    await expect(h.db.query("update public.audit_log set entity = 'x'")).rejects.toThrow(/append-only/);
    await expect(h.db.query("delete from public.audit_log")).rejects.toThrow(/append-only/);
    await expect(h.db.query("truncate public.audit_log")).rejects.toThrow(/append-only/);
  });
  it("only admins can read the trail; users cannot write to it", async () => {
    expect(await h.as(U.alice, async (q) => (await q("select * from public.audit_log")).rows.length)).toBe(0);
    expect((await h.as(U.frank, async (q) => (await q("select * from public.audit_log")).rows.length)) > 0).toBe(true);
    expect(await h.denied(U.alice, "insert into public.audit_log (action, entity) values ('x.y.z','t')")).toMatch(/permission denied/);
  });
  it("the switch: turning a group off drops its rows, but audit.* is always recorded", async () => {
    const count = async () => Number((await h.db.query<{ n: string }>("select count(*)::int as n from public.audit_log")).rows[0]!.n);
    await h.db.query("insert into public.platform_settings (key, value) values ('audit', '{\"enabled\": true, \"off\": [\"report\"]}') on conflict (key) do update set value = excluded.value");
    const before = await count();
    await h.db.query("insert into public.audit_log (action, entity) values ('report.status.change','reports')");
    expect(await count()).toBe(before); // dropped
    await h.db.query("insert into public.audit_log (action, entity) values ('idea.status.change','ideas')");
    expect(await count()).toBe(before + 1); // other groups still recorded
    await h.db.query("update public.platform_settings set value = '{\"enabled\": false, \"off\": []}' where key = 'audit'");
    const b2 = await count();
    await h.db.query("insert into public.audit_log (action, entity) values ('idea.status.change','ideas')");
    expect(await count()).toBe(b2); // whole trail off
    await h.db.query("insert into public.audit_log (action, entity) values ('audit.switches','platform_settings')");
    expect(await count()).toBe(b2 + 1); // switch changes are always recorded
    await h.db.query("delete from public.platform_settings where key = 'audit'");
  });
  it("purge removes only rows older than four years and records itself", async () => {
    await h.db.query("set app.purging = '1'");
    await h.db.query("insert into public.audit_log (at, action, entity) values (now() - interval '5 years', 'old.thing.done', 'x')");
    await h.db.query("set app.purging = '0'");
    expect(await h.denied(U.frank, "select public.admin_purge_audit(now())")).toMatch(/err_too_recent/);
    const n = await h.asCommit(U.frank, async (q) => (await q<{ admin_purge_audit: string }>("select public.admin_purge_audit(now() - interval '4 years')")).rows[0]!.admin_purge_audit);
    expect(Number(n)).toBe(1);
    expect((await h.db.query("select * from public.audit_purges")).rows.length).toBe(1);
    expect((await h.db.query("select * from public.audit_log where action = 'audit.purge'")).rows.length).toBe(1);
  });
});

describe("analytics and consent", () => {
  it("a user records only their own content-free events, once per day for 'active'", async () => {
    await h.asCommit(U.alice, async (q) => q("insert into public.product_events (user_id, name) values ($1, 'active')", [U.alice]));
    expect(await h.denied(U.alice, "insert into public.product_events (user_id, name) values ($1, 'active')", [U.alice])).toMatch(/duplicate|unique/);
    expect(await h.denied(U.alice, "insert into public.product_events (user_id, name) values ($1, 'active')", [U.bob])).toMatch(/row-level security/);
    expect(await h.denied(U.alice, "insert into public.product_events (user_id, name, tag) values ($1, 'x_y', 'Has Spaces!')", [U.alice])).toMatch(/check/);
    expect(await h.denied(U.alice, "select * from public.product_events")).toMatch(/permission denied/); // write-only for browsers
  });
  it("consents are private to their owner", async () => {
    await h.asCommit(U.alice, async (q) => q("insert into public.consents (user_id, kind, version) values ($1, 'privacy', 'v1')", [U.alice]));
    expect(await h.as(U.bob, async (q) => (await q("select * from public.consents")).rows.length)).toBe(0);
    expect(await h.denied(U.bob, "insert into public.consents (user_id, kind, version) values ($1, 'privacy', 'v1')", [U.alice])).toMatch(/row-level security/);
  });
  it("service-only tables are invisible to browser roles", async () => {
    expect(await h.denied(U.alice, "select * from public.aivora_links")).toMatch(/permission denied/);
    expect(await h.denied(U.alice, "select * from public.company_features")).toMatch(/permission denied/);
  });
});

describe("analytics and templates", () => {
  it("only admins can read the usage dashboard", async () => {
    expect(await h.denied(U.alice, "select public.admin_analytics(7)")).toMatch(/err_forbidden/);
    const r = await h.as(U.frank, async (q) => (await q<{ admin_analytics: { dau: number; daily: unknown[] } }>("select public.admin_analytics(7)")).rows[0]!.admin_analytics);
    expect(typeof r.dau).toBe("number");
    expect(Array.isArray(r.daily)).toBe(true);
  });
  it("company templates are visible to central team only", async () => {
    expect((await h.as(U.alice, async (q) => (await q("select * from public.company_templates")).rows.length))).toBe(0);
    expect((await h.as(U.erin, async (q) => (await q("select * from public.company_templates")).rows.length)) > 0).toBe(true);
  });
});

describe("platform admin company operations", () => {
  it("only platform admins can create companies or business units", async () => {
    expect(await h.denied(U.carol, "select public.admin_create_company('x-co','X','X',null,null)")).toMatch(/err_forbidden/);
    expect(await h.denied(U.erin, "select public.admin_create_bu('กลุ่มใหม่')")).toMatch(/err_forbidden/); // central team is not a platform admin
    const id = await h.asCommit(U.frank, async (q) => (await q<{ admin_create_company: string }>("select public.admin_create_company('new-co','บริษัทใหม่','New Co',$1,(select id from public.company_templates limit 1))", [BU])).rows[0]!.admin_create_company);
    const row = await h.db.query<{ response_sla_hours: number }>("select response_sla_hours from public.companies where id = $1", [id]);
    expect(row.rows[0]!.response_sla_hours).toBe(48);
  });
  it("rejects bad company codes and SLA values", async () => {
    expect(await h.denied(U.frank, "select public.admin_create_company('Bad Code!','X','X',null,null)")).toMatch(/err_invalid_input/);
    expect(await h.denied(U.frank, "select public.admin_update_company($1,'active',0)", [A])).toMatch(/err_invalid_input/);
  });
  it("the first coordinator can be seated only from a verified, existing account", async () => {
    expect(await h.denied(U.frank, "select public.admin_set_coordinator($1,'ghost@nowhere.test')", [A])).toMatch(/err_no_such_account/);
    await h.asCommit(U.frank, async (q) => q("select public.admin_set_coordinator($1,'alice@example.test')", [A]));
    expect((await h.as(U.alice, async (q) => (await q("select * from public.role_assignments where user_id = $1 and role = 'coordinator'", [U.alice])).rows.length))).toBe(1);
    await h.admin((q) => q("delete from public.role_assignments where user_id = $1 and role = 'coordinator'", [U.alice]));
  });
});
