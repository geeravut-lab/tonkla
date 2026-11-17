"use server";
import { revalidatePath } from "next/cache";
import { expectRows, type ActionState } from "@/lib/errors";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { guarded, str } from "@/server/action";

export async function saveProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const name = str(fd, "display_name", 80);
    if (name.length < 1) throw new (await import("@/lib/errors")).AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.from("profiles").update({ display_name: name }).eq("id", s.userId).select("id");
    if (error) throw error;
    expectRows(data);
    revalidatePath("/account");
  });
}
