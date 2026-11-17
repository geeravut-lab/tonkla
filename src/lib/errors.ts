/** Server code throws AppError with an `err_*` code; screens translate it with errorText(). */
export class AppError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export type ActionState = { ok: boolean; error?: string; message?: string } | null;

/** Turn anything thrown into an err_* code (Postgres exceptions raised as 'err_xxx' pass through). */
export function toErrorCode(e: unknown): string {
  if (e instanceof AppError) return e.code;
  const msg = (e as { message?: string } | null)?.message ?? "";
  const m = msg.match(/\berr_[a-z_]+\b/);
  if (m) return m[0];
  if ((e as { code?: string } | null)?.code === "42501") return "err_forbidden";
  return "err_generic";
}

/**
 * PostgREST reports success for an UPDATE/DELETE that matched no row (RLS or a stale id).
 * Every important write selects the ids it touched and passes them here.
 */
export function expectRows<T>(rows: T[] | null | undefined, min = 1): T[] {
  if (!rows || rows.length < min) throw new AppError("err_no_rows");
  return rows;
}
