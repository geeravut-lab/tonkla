"use server";
import { redirect } from "next/navigation";
import { runBootstrap } from "@/server/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { toErrorCode } from "@/lib/errors";

export async function bootstrapSession(): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  try {
    return { ok: true, to: await runBootstrap() };
  } catch (e) {
    console.error("bootstrap failed", toErrorCode(e));
    return { ok: false, error: toErrorCode(e) };
  }
}

export async function signOut(): Promise<void> {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  await sb.auth.signOut();
  if (data.user) await audit({ by: data.user.id, action: "auth.logout", entity: "auth", entityId: data.user.id });
  redirect("/login");
}
