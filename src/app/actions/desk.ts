"use server";
import { revalidatePath } from "next/cache";
import { AppError, type ActionState } from "@/lib/errors";
import { requireCoordinator } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (fd: FormData, k: string) => {
  const v = str(fd, k, 40);
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};

export async function decideJoin(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireCoordinator();
    const id = uuid(fd, "request");
    const approve = str(fd, "decision", 10) === "approve";
    const sb = await createClient();
    const { error } = await sb.rpc("decide_join", { p_request: id, p_approve: approve });
    if (error) throw error;
    await audit({ by: s.userId, action: "member.join_decide", entity: "join_requests", entityId: id, detail: { approved: approve } });
    revalidatePath("/desk");
  });
}

export async function importRoster(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireCoordinator();
    const company = uuid(fd, "company");
    const lines = str(fd, "csv", 200_000).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 1000);
    const rows = lines.map((l) => {
      const [email, code, ...name] = l.split(/[,\t;]/).map((x) => x.trim());
      return { email: email ?? "", code: code ?? "", name: name.join(" ") };
    });
    if (rows.length === 0) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.rpc("import_roster", { p_company: company, p_rows: rows });
    if (error) throw error;
    await audit({ by: s.userId, action: "member.roster_import", entity: "roster_entries", companyId: company, detail: { rows: Number(data) } });
    revalidatePath("/desk");
    return `n:${data}`;
  });
}

export async function createInvite(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireCoordinator();
    const company = uuid(fd, "company");
    const sb = await createClient();
    const { data, error } = await sb.rpc("create_invitation", { p_company: company, p_ttl_hours: 72 });
    if (error) throw error;
    await audit({ by: s.userId, action: "member.invite_create", entity: "invitations", companyId: company });
    return `code:${data}`;
  });
}

export async function setRole(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireCoordinator();
    const company = uuid(fd, "company");
    const user = uuid(fd, "user");
    const sb = await createClient();
    if (str(fd, "op", 10) === "revoke") {
      const { error } = await sb.rpc("revoke_role", { p_id: uuid(fd, "role_id") });
      if (error) throw error;
      await audit({ by: s.userId, action: "member.role_revoke", entity: "role_assignments", companyId: company, detail: { role: "supervisor" } });
    } else {
      const { error } = await sb.rpc("grant_role", { p_user: user, p_role: "supervisor", p_scope_type: "company", p_scope_id: company });
      if (error) throw error;
      await audit({ by: s.userId, action: "member.role_grant", entity: "role_assignments", entityId: user, companyId: company, detail: { role: "supervisor" } });
    }
    revalidatePath("/desk");
  });
}

export async function endMember(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireCoordinator();
    const id = uuid(fd, "membership");
    const sb = await createClient();
    const { error } = await sb.rpc("end_membership", { p_membership: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "member.end", entity: "memberships", entityId: id });
    revalidatePath("/desk");
  });
}
