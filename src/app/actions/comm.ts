"use server";
import { revalidatePath } from "next/cache";
import { AppError, expectRows, type ActionState } from "@/lib/errors";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { assertFeature } from "@/server/features";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => {
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};
const KINDS = ["news", "exec_message", "success_story", "must_read"] as const;

export async function createAnnouncement(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const target = str(fd, "company", 40); // company id or "group"
    const companyId = target === "group" ? null : uuid(target);
    await assertFeature("announcements", companyId ?? s.memberships[0]?.companyId);
    const title = str(fd, "title", 200);
    const body = str(fd, "body", 10_000);
    const kind = str(fd, "kind", 20) as (typeof KINDS)[number];
    if (!title || !KINDS.includes(kind)) throw new AppError("err_invalid_input");
    const requiresAck = fd.get("requires_ack") === "on" || kind === "must_read";
    const due = str(fd, "ack_due", 20);
    const sb = await createClient();
    const ins = await sb
      .from("announcements")
      .insert({ author_id: s.userId, company_id: companyId, title, body, kind, requires_ack: requiresAck, ack_due_at: requiresAck && due ? new Date(`${due}T23:59:59+07:00`).toISOString() : null })
      .select("id");
    if (ins.error) throw ins.error;
    const id = expectRows(ins.data)[0]!.id;

    const audiences: { announcement_id: string; audience_type: string; target_id: string | null }[] = [];
    if (companyId === null) audiences.push({ announcement_id: id, audience_type: "group", target_id: null });
    for (const d of fd.getAll("dept").map(String)) audiences.push({ announcement_id: id, audience_type: "department", target_id: uuid(d) });
    for (const p of fd.getAll("pos").map(String)) audiences.push({ announcement_id: id, audience_type: "position", target_id: uuid(p) });
    if (audiences.length) {
      const a = await sb.from("announcement_audiences").insert(audiences);
      if (a.error) throw a.error;
    }
    const pub = await sb.rpc("publish_announcement", { p_id: id });
    if (pub.error) throw pub.error;
    await audit({ by: s.userId, action: "announcement.publish", entity: "announcements", entityId: id, companyId, detail: { kind, recipients: Number(pub.data), requires_ack: requiresAck } });
    revalidatePath("/news");
    return `n:${pub.data}`;
  });
}

export async function acknowledge(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("ack_announcement", { p_id: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "announcement.ack", entity: "announcements", entityId: id });
    revalidatePath(`/news/${id}`);
    revalidatePath("/");
  });
}

/** Called by the detail page once it is shown. Failure here is harmless. */
export async function markRead(id: string): Promise<void> {
  try {
    await requireActive();
    const sb = await createClient();
    await sb.rpc("mark_announcement_read", { p_id: uuid(id) });
  } catch {
    /* reading must never break the page */
  }
}

export async function addComment(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const body = str(fd, "body", 1000);
    if (!body) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.from("announcement_comments").insert({ announcement_id: id, author_id: s.userId, body }).select("id");
    if (error) throw error;
    expectRows(data);
    revalidatePath(`/news/${id}`);
  });
}

export async function hideComment(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "comment", 40));
    const sb = await createClient();
    const { data, error } = await sb.from("announcement_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id, announcement_id");
    if (error) throw error;
    const row = expectRows(data)[0]!;
    await audit({ by: s.userId, action: "announcement.comment_hide", entity: "announcement_comments", entityId: id });
    revalidatePath(`/news/${row.announcement_id}`);
  });
}

export async function toggleLike(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    if (str(fd, "liked", 5) === "yes") {
      const { error } = await sb.from("reactions").delete().eq("entity_type", "announcement").eq("entity_id", id).eq("user_id", s.userId);
      if (error) throw error;
    } else {
      const { error } = await sb.from("reactions").insert({ entity_type: "announcement", entity_id: id, user_id: s.userId });
      if (error && error.code !== "23505") throw error;
    }
    revalidatePath(`/news/${id}`);
  });
}

export async function archiveAnnouncement(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("archive_announcement", { p_id: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "announcement.archive", entity: "announcements", entityId: id });
    revalidatePath("/news");
  });
}

export async function markAllRead(): Promise<ActionState> {
  return guarded(async () => {
    await requireActive();
    const sb = await createClient();
    const { error } = await sb.rpc("mark_notifications_read", {});
    if (error) throw error;
    revalidatePath("/inbox");
  });
}
