import "server-only";
import { PRIVACY_VERSION } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";

/**
 * The single post-login step, called directly by every login path (Google callback, Aivora SSO page).
 * Never rely on onAuthStateChange for this: ordering is not guaranteed (SSO-Aivora doc, step 5).
 */
export async function runBootstrap(): Promise<"/" | "/join" | "/consent"> {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) throw new AppError("err_unauthorized");

  // a verified e-mail that is on a company roster activates the person without approval
  const claim = await sb.rpc("claim_roster");
  if (claim.error) console.error("claim_roster failed", claim.error.code, claim.error.message);

  // one content-free 'active' event per day (unique index makes repeats harmless)
  const ev = await sb.from("product_events").insert({ user_id: user.id, name: "active" });
  if (ev.error && ev.error.code !== "23505") console.error("track failed", ev.error.code);

  await audit({ by: user.id, action: "auth.login", entity: "auth", entityId: user.id, detail: { provider: String(user.app_metadata?.provider ?? "unknown") } });

  const profile = await sb.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (profile.data?.status !== "active") return "/join";
  const consent = await sb.from("consents").select("version").eq("user_id", user.id).eq("kind", "privacy").eq("version", PRIVACY_VERSION);
  return (consent.data ?? []).length > 0 ? "/" : "/consent";
}
