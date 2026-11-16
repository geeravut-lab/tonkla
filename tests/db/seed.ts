import { UUID, type Db } from "./harness";

export const U = {
  alice: UUID(11), // employee, company A, supervised by dave
  bob: UUID(12), // employee, company B
  carol: UUID(13), // coordinator, company A
  dave: UUID(14), // supervisor in company A
  erin: UUID(15), // central team
  frank: UUID(16), // platform admin
  pam: UUID(17), // pending (no membership)
  gina: UUID(18), // company exec, company A
  owner: UUID(19), // protected owner / admin
};
export const BU = UUID(100);
export const A = UUID(101);
export const B = UUID(102);
export const M = { alice: UUID(201), bob: UUID(202), carol: UUID(203), dave: UUID(204), gina: UUID(205) };

/** Standard two-company world used by every permission test. Runs with full rights (like the service role). */
export async function seedOrg(h: Db) {
  const q = h.db.query.bind(h.db);
  for (const [name, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()) on conflict do nothing", [id, `${name}@example.test`]).catch(async () => {
      await h.addUser(id, `${name}@example.test`);
    });
  }
  await q("insert into public.business_units (id, name_th) values ($1, 'กลุ่ม 1')", [BU]);
  await q("insert into public.companies (id, business_unit_id, code, name_th, status) values ($1, $3, 'co-a', 'บริษัท A', 'active'), ($2, $3, 'co-b', 'บริษัท B', 'active')", [A, B, BU]);
  await q("update public.profiles set status = 'active' where id <> $1", [U.pam]);
  await q(
    `insert into public.memberships (id, user_id, company_id, supervisor_membership_id) values
      ($1, $6, $9, $4), ($2, $7, $10, null), ($3, $8, $9, null), ($4, $11, $9, null), ($5, $12, $9, null)`,
    [M.alice, M.bob, M.carol, M.dave, M.gina, U.alice, U.bob, U.carol, A, B, U.dave, U.gina],
  );
  await q("insert into public.role_assignments (user_id, role, scope_type, scope_id) values ($1,'coordinator','company',$2), ($3,'supervisor','company',$2), ($4,'company_exec','company',$2)", [U.carol, A, U.dave, U.gina]);
  await q("insert into public.role_assignments (user_id, role, scope_type) values ($1,'central_team','group')", [U.erin]);
  await q("insert into public.platform_admins (user_id) values ($1), ($2)", [U.frank, U.owner]);
  await q("insert into public.platform_settings (key, value) values ('owner', jsonb_build_object('email','owner@example.test'))");
}
