import "server-only";
import { toErrorCode, type ActionState } from "@/lib/errors";

/** Wrap a Server Action body: success -> {ok}, failure -> {error: err_*}. Redirects/404s pass through. */
export async function guarded(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined };
  } catch (e) {
    if ((e as { digest?: string } | null)?.digest) throw e; // redirect() / notFound()
    const code = toErrorCode(e);
    if (code === "err_generic") console.error("action failed", (e as Error)?.message);
    return { ok: false, error: code };
  }
}

export const str = (fd: FormData, k: string, max = 500): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
