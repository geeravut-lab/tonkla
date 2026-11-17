export const isFuture = (iso: string) => new Date(iso).getTime() > Date.now();

const TZ = "Asia/Bangkok";
export const formatWhen = (iso: string, locale: "th" | "en" = "th") => new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
export const formatDay = (iso: string, locale: "th" | "en" = "th") => new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "th-TH", { timeZone: TZ, dateStyle: "full" });
/** The Bangkok calendar date (YYYY-MM-DD) of an instant, for grouping a list by day. */
export const bangkokDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
/** Default for a <input type="datetime-local">: this time tomorrow, Bangkok time. */
export const tomorrowInput = () => new Date(Date.now() + 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 16);
