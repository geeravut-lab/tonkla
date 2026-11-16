"use server";
import { redirect } from "next/navigation";

/** Search is a GET-style navigation: the term lives in the URL so results can be shared and Back works. */
export async function directorySearch(fd: FormData): Promise<void> {
  const q = typeof fd.get("q") === "string" ? String(fd.get("q")).trim().slice(0, 60) : "";
  redirect(q ? `/directory?q=${encodeURIComponent(q)}` : "/directory");
}
