import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { isFixtureMode, supabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const PRIVACY_VERSION = "2026-11-v1";

export type Role = "supervisor" | "coordinator" | "company_exec" | "central_team" | "group_owner";
export type Session = {
  userId: string;
  email: string | null;
  displayName: string;
  locale: "th" | "en";
  status: "pending" | "active" | "suspended";
  mustChangePassword: boolean;
  hasConsent: boolean;
  memberships: { id: string; companyId: string; companyName: string; isPrimary: boolean }[];
  roles: { id: string; role: Role; scopeType: string; scopeId: string | null }[];
  isAdmin: boolean;
  isCentral: boolean;
  isSupervisor: boolean;
  /** Companies this person coordinates (all companies for central team). */
  coordinatedCompanies: { id: string; name: string }[];
  /** Companies where this person is an executive (all for central team). */
  execCompanies: { id: string; name: string }[];
};

const FIXTURE: Session = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "fixture@example.test",
  displayName: "Fixture User",
  locale: "th",
  status: "active",
  mustChangePassword: false,
  hasConsent: true,
  memberships: [{ id: "m1", companyId: "c1", companyName: "บริษัท ตัวอย่าง", isPrimary: true }],
  roles: [],
  isAdmin: true,
  isCentral: true,
  isSupervisor: true,
  coordinatedCompanies: [{ id: "c1", name: "บริษัท ตัวอย่าง" }],
  execCompanies: [{ id: "c1", name: "บริษัท ตัวอย่าง" }],
};

export const getSession = cache(async (): Promise<Session | null> => {
  if (isFixtureMode()) return FIXTURE;
  if (!supabaseEnv()) return null;
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const [profile, memberships, roles, admin, companies, consent] = await Promise.all([
    sb.from("profiles").select("display_name, locale, status, must_change_password").eq("id", user.id).maybeSingle(),
    sb.from("memberships").select("id, company_id, is_primary, companies(name_th, name_en)").eq("user_id", user.id).eq("status", "active"),
    sb.from("role_assignments").select("id, role, scope_type, scope_id").eq("user_id", user.id),
    sb.from("platform_admins").select("user_id").eq("user_id", user.id),
    sb.from("companies").select("id, name_th, business_unit_id"),
    sb.from("consents").select("version").eq("user_id", user.id).eq("kind", "privacy").eq("version", PRIVACY_VERSION),
  ]);
  if (!profile.data) return null;

  const roleRows = (roles.data ?? []).map((r) => ({ id: r.id as string, role: r.role as Role, scopeType: r.scope_type as string, scopeId: (r.scope_id as string | null) ?? null }));
  const isCentral = roleRows.some((r) => r.scopeType === "group" && (r.role === "central_team" || r.role === "group_owner"));
  const all = (companies.data ?? []).map((c) => ({ id: c.id as string, name: c.name_th as string, bu: c.business_unit_id as string | null }));
  const coordinates = (c: { id: string; bu: string | null }) =>
    isCentral || roleRows.some((r) => r.role === "coordinator" && ((r.scopeType === "company" && r.scopeId === c.id) || (r.scopeType === "business_unit" && r.scopeId === c.bu)));
  const exec = (c: { id: string }) => isCentral || roleRows.some((r) => r.role === "company_exec" && r.scopeType === "company" && r.scopeId === c.id);

  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: profile.data.display_name as string,
    locale: profile.data.locale as "th" | "en",
    status: profile.data.status as Session["status"],
    mustChangePassword: !!profile.data.must_change_password,
    hasConsent: (consent.data ?? []).length > 0,
    memberships: (memberships.data ?? []).map((m) => ({
      id: m.id as string,
      companyId: m.company_id as string,
      companyName: ((m.companies as unknown as { name_th: string } | null)?.name_th ?? "") as string,
      isPrimary: !!m.is_primary,
    })),
    roles: roleRows,
    isAdmin: (admin.data ?? []).length > 0,
    isCentral,
    isSupervisor: roleRows.some((r) => r.role === "supervisor"),
    coordinatedCompanies: all.filter(coordinates).map(({ id, name }) => ({ id, name })),
    execCompanies: all.filter(exec).map(({ id, name }) => ({ id, name })),
  };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Signed in, approved, consented. Everything inside the app shell goes through this. */
export async function requireActive(): Promise<Session> {
  const s = await requireSession();
  if (s.status === "suspended") redirect("/login");
  if (s.mustChangePassword) redirect("/password"); // a password set by someone else must be replaced first
  if (s.status === "pending") redirect("/join");
  if (!s.hasConsent) redirect("/consent");
  return s;
}

/** Admin pages answer 404 to everyone else: they do not reveal that the page exists. */
export async function requireAdmin(): Promise<Session> {
  const s = await requireActive();
  if (!s.isAdmin) notFound();
  return s;
}

export async function requireCoordinator(): Promise<Session> {
  const s = await requireActive();
  if (s.coordinatedCompanies.length === 0) notFound();
  return s;
}
