import { AppError } from "@/lib/errors";

/** Checked before anything is sent to the server (same limits as bcrypt in Supabase Auth: 72 bytes). */
export function passwordProblem(current: string, next: string, confirm: string): string | null {
  if (!current) return "err_password_current_wrong";
  if (next.length < 8 || new TextEncoder().encode(next).length > 72) return "err_weak_password";
  if (next !== confirm) return "err_password_mismatch";
  if (next === current) return "err_password_same";
  return null;
}
export function assertPassword(current: string, next: string, confirm: string): void {
  const p = passwordProblem(current, next, confirm);
  if (p) throw new AppError(p);
}
