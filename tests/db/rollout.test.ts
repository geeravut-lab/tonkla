import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, B, BU, seedOrg, U } from "./seed";

let h: Db;
let wave: string;
const NEW = UUID(801);

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.admin(async (q) => {
    await q("insert into public.companies (id, business_unit_id, code, name_th, status) values ($1,$2,'wave-co','บริษัทรอบแรก','setup')", [NEW, BU]);
  });
});

describe("rollout waves", () => {
  it("only platform admins manage waves; central team can read them", async () => {
    expect(await h.denied(U.carol, "select public.admin_create_wave('รอบ 1', null, null, '{}')")).toMatch(/err_forbidden/);
    wave = (await h.asCommit(U.frank, async (q) => q<{ admin_create_wave: string }>("select public.admin_create_wave('รอบ 1', $1, '2026-12-01', array['anonymous_channel','polls'])", [BU]))).rows[0]!.admin_create_wave;
    expect(await h.as(U.erin, async (q) => (await q("select * from public.rollout_waves")).rows.length)).toBe(1);
    expect(await h.as(U.alice, async (q) => (await q("select * from public.rollout_waves")).rows.length)).toBe(0);
  });
  it("only known phase-2 features can be attached to a wave", async () => {
    expect(await h.denied(U.frank, "select public.admin_create_wave('x', null, null, array['not_a_feature'])")).toMatch(/check/);
  });
  it("readiness is computed from real data and cannot be ticked by hand", async () => {
    await h.asCommit(U.frank, async (q) => q("select public.admin_assign_wave($1,$2)", [NEW, wave]));
    const r = await h.as(U.frank, async (q) => (await q<{ company_readiness: Record<string, boolean> }>("select public.company_readiness($1)", [NEW])).rows[0]!.company_readiness);
    expect(r).toMatchObject({ coordinator: false, people: false, categories: false, criteria: false, training: false });
    expect(await h.denied(U.alice, "select public.company_readiness($1)", [NEW])).toMatch(/err_forbidden/);
    expect(await h.denied(U.frank, "select public.admin_set_checklist($1,'coordinator',true)", [NEW])).toMatch(/check/); // computed items are not tickable
  });
  it("a company cannot go live until coordinator, people, categories, criteria and training are all in place", async () => {
    expect(await h.denied(U.frank, "select public.admin_activate_company($1)", [NEW])).toMatch(/err_not_ready/);
    await h.admin(async (q) => {
      await q("insert into public.report_categories (company_id, key, name_th) values ($1,'equipment','อุปกรณ์')", [NEW]);
      await q("insert into public.idea_criteria (company_id, name_th) values ($1,'ผลกระทบ')", [NEW]);
      await q("insert into public.roster_entries (company_id, work_email) values ($1,'a@wave.test')", [NEW]);
      await q("insert into public.memberships (user_id, company_id) values ($1,$2)", [U.dave, NEW]);
      await q("insert into public.role_assignments (user_id, role, scope_type, scope_id) values ($1,'coordinator','company',$2)", [U.dave, NEW]);
    });
    expect(await h.denied(U.frank, "select public.admin_activate_company($1)", [NEW])).toMatch(/err_not_ready/); // still no training
    await h.asCommit(U.dave, async (q) => q("select public.admin_set_checklist($1,'training',true)", [NEW])); // its own coordinator confirms training
    expect(await h.denied(U.alice, "select public.admin_set_checklist($1,'training',true)", [NEW])).toMatch(/err_forbidden/);
    await h.asCommit(U.frank, async (q) => q("select public.admin_activate_company($1)", [NEW]));
    expect((await h.db.query<{ status: string }>("select status from public.companies where id = $1", [NEW])).rows[0]!.status).toBe("active");
  });
  it("going live switches on the wave's phase-2 features for that company only and tells its coordinator", async () => {
    const on = (await h.db.query<{ key: string }>("select key from public.company_features where company_id = $1 and enabled", [NEW])).rows.map((r) => r.key).sort();
    expect(on).toEqual(["anonymous_channel", "polls"]);
    expect((await h.db.query("select * from public.company_features where company_id = $1", [A])).rows.length).toBe(0);
    expect((await h.as(U.dave, async (q) => (await q("select * from public.notifications where kind = 'company_activated'")).rows.length))).toBe(1);
  });
  it("activating a whole wave goes live with the ready companies and skips the rest", async () => {
    const second = UUID(802);
    await h.admin((q) => q("insert into public.companies (id, business_unit_id, code, name_th, status, wave_id) values ($1,$2,'late-co','ยังไม่พร้อม','setup',$3)", [second, BU, wave]));
    const r = await h.asCommit(U.frank, async (q) => q<{ admin_activate_wave: { activated: number; skipped: number } }>("select public.admin_activate_wave($1)", [wave]));
    expect(r.rows[0]!.admin_activate_wave).toEqual({ activated: 0, skipped: 1 }); // first one was already live
    expect((await h.db.query<{ status: string }>("select status from public.companies where id = $1", [second])).rows[0]!.status).toBe("setup");
    expect((await h.db.query<{ status: string }>("select status from public.rollout_waves where id = $1", [wave])).rows[0]!.status).toBe("active");
    expect(B).toBeTruthy();
  });
});
