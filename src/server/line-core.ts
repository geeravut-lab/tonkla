import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { LINE_COLORS } from "@/config/brand";

// Pure LINE helpers (no database): signatures, link codes, Flex cards, push/reply with an injectable fetch.

export type LineConfig = { secret: string; token: string; basicId: string };
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function generateCode(): string {
  let c = "";
  for (let i = 0; i < 8; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}

export const normalizeCode = (text: string) => text.trim().toUpperCase().replace(/\s+/g, "");
/** Only a keyed hash of the code is stored. */
export const hashCode = (code: string, secret: string) => createHmac("sha256", secret).update(normalizeCode(code)).digest("hex");

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export type Card = { title: string; lines: { label?: string; text: string }[]; button: string; href: string };

/** Internal paths only: anything else falls back to the home page. The link opens in the phone's own browser. */
export function safeAppUrl(appUrl: string, href: string): string {
  const path = /^\/([A-Za-z0-9_\-?=&.%][A-Za-z0-9/_\-?=&.%]*)?$/.test(href) ? href : "/"; // "//host" is a protocol-relative external link: refused
  return `${appUrl.replace(/\/$/, "")}${path}${path.includes("?") ? "&" : "?"}openExternalBrowser=1`;
}

/** One Flex bubble. Every field is cut: LINE rejects the WHOLE message when any text is too long. */
export function buildLineMessage(card: Card, appUrl: string) {
  const lines = card.lines.slice(0, 8);
  const body: unknown[] = [{ type: "text", text: cut(card.title, 100), weight: "bold", size: "md", color: LINE_COLORS.title, wrap: true }];
  for (const l of lines) {
    if (l.label) {
      body.push({
        type: "box", layout: "baseline", spacing: "sm",
        contents: [
          { type: "text", text: cut(l.label, 24), size: "sm", color: LINE_COLORS.muted, flex: 2, wrap: true },
          { type: "text", text: cut(l.text, 120), size: "sm", color: LINE_COLORS.text, flex: 4, wrap: true },
        ],
      });
    } else body.push({ type: "text", text: cut(l.text, 300), size: "sm", color: LINE_COLORS.text, wrap: true });
  }
  // the lock screen shows altText: it must carry the whole message by itself
  const altText = cut([card.title, ...lines.map((l) => (l.label ? `${l.label} ${l.text}` : l.text))].join(" · "), 400);
  return {
    type: "flex" as const,
    altText,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", spacing: "md", contents: body },
      footer: {
        type: "box", layout: "vertical",
        contents: [{ type: "button", style: "primary", color: LINE_COLORS.button, action: { type: "uri", label: cut(card.button, 20), uri: safeAppUrl(appUrl, card.href) } }],
      },
    },
  };
}

export type PushResult =
  | { kind: "sent" }
  | { kind: "retry"; error: string } // 5xx / network: try again later
  | { kind: "blocked"; error: string } // 400: the person blocked us or the id is invalid; do not retry
  | { kind: "pause"; error: string } // 401/403: our credentials are bad: stop everything for a while
  | { kind: "quota"; error: string }; // 429: monthly limit reached

type Fetch = typeof fetch;

export async function pushLine(cfg: LineConfig, to: string, messages: unknown[], retryKey: string, apiUrl = "https://api.line.me", f: Fetch = fetch): Promise<PushResult> {
  try {
    const res = await f(`${apiUrl}/v2/bot/message/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}`, "X-Line-Retry-Key": retryKey },
      body: JSON.stringify({ to, messages }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200 || res.status === 409) return { kind: "sent" }; // 409 = this retry key was already delivered
    if (res.status === 401 || res.status === 403) return { kind: "pause", error: `http ${res.status}` };
    if (res.status === 429) return { kind: "quota", error: "http 429" };
    if (res.status === 400) return { kind: "blocked", error: "http 400" };
    return { kind: "retry", error: `http ${res.status}` };
  } catch (e) {
    return { kind: "retry", error: (e as Error).message.slice(0, 120) };
  }
}

export async function replyLine(cfg: LineConfig, replyToken: string, text: string, apiUrl = "https://api.line.me", f: Fetch = fetch): Promise<void> {
  try {
    await f(`${apiUrl}/v2/bot/message/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text: cut(text, 1000) }] }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    /* a reply is best effort: the reply token is single-use */
  }
}

/** Backoff for retryable failures: 2, 10, 30 minutes, then give up. */
export function nextAttemptDelayMinutes(attempts: number): number | null {
  return [2, 10, 30][attempts - 1] ?? null;
}

/** Normal messages stop before the monthly quota; urgent ones may use the reserve. */
export function quotaAllows(sentThisMonth: number, quota: number, reserve: number, urgent: boolean): boolean {
  return sentThisMonth < (urgent ? quota : Math.max(0, quota - reserve));
}
export const URGENT_KINDS = new Set(["report_overdue", "report_escalated", "idea_overdue", "must_read"]);
