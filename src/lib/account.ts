/** People who sign in through Aivora (LINE) get a made-up address that is not a real mailbox: show their name instead of it. */
export const SYNTHETIC_EMAIL = /@users\.tonkla\.invalid$/i;

export function accountLabel(s: { email: string | null; displayName: string }): string {
  return s.email && !SYNTHETIC_EMAIL.test(s.email) ? s.email : s.displayName;
}
