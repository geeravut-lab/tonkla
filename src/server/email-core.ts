// Pure helpers for e-mail (no database, no network): composing a message and applying the "send everything to one address" test mode.

export type EmailConfig = { key: string; from: string; redirectTo: string | null };
export type EmailMessage = { to: string; subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function validAddress(a: string): boolean {
  return /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[A-Za-z]{2,}$/.test(a);
}

/**
 * Self-explanatory and free of sensitive content: the notice's own one-line text, the title the in-app inbox shows, and a button into the app.
 * Nothing here is read from a report or idea body.
 */
export function composeEmail(o: { brand: string; title: string; summary: string; button: string; url: string; footer: string; recipient: string; recipientName: string }, cfg: EmailConfig): EmailMessage {
  const redirected = !!cfg.redirectTo;
  const to = cfg.redirectTo ?? o.recipient;
  const subjectBase = cut(o.summary || o.title, 120);
  const subject = redirected ? `[TEST → ${cut(o.recipientName || o.recipient, 40)}] ${subjectBase}` : `${o.brand}: ${subjectBase}`;
  const testNote = redirected ? `\n\n— ทดสอบ: ข้อความนี้ถูกส่งต่อมาที่ผู้ดูแลแทนผู้รับจริง (${o.recipientName || "?"} <${o.recipient}>)` : "";
  const text = `${o.title}\n${o.summary}\n\n${o.button}: ${o.url}\n\n${o.footer}${testNote}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:16px;color:#10282b">
<p style="font-size:14px;color:#506468;margin:0 0 12px">${esc(o.brand)}</p>
<h1 style="font-size:20px;margin:0 0 8px">${esc(o.title)}</h1>
<p style="font-size:16px;margin:0 0 20px">${esc(o.summary)}</p>
<p><a href="${esc(o.url)}" style="display:inline-block;background:#0e7a5c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">${esc(o.button)}</a></p>
<p style="font-size:13px;color:#506468;margin-top:24px">${esc(o.footer)}</p>${redirected ? `<p style="font-size:12px;color:#b42318">${esc(testNote.trim())}</p>` : ""}</div>`;
  return { to, subject, text, html };
}

export type SendResult = { kind: "sent" } | { kind: "retry"; error: string } | { kind: "blocked"; error: string } | { kind: "pause"; error: string } | { kind: "quota"; error: string };

/** One message through Resend. The idempotency key is the queue row id, so a repeat send is recognised and not delivered twice. */
export async function sendResend(cfg: EmailConfig, m: EmailMessage, idempotencyKey: string, f: typeof fetch = fetch, base = "https://api.resend.com"): Promise<SendResult> {
  try {
    const res = await f(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: cfg.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    });
    if (res.ok) return { kind: "sent" };
    const body = (await res.text()).slice(0, 200);
    if (res.status === 401 || res.status === 403) return { kind: "pause", error: `http ${res.status}` };
    if (res.status === 429) return { kind: "quota", error: "http 429" };
    if (res.status === 400 || res.status === 422) return { kind: "blocked", error: `http ${res.status} ${body}` };
    return { kind: "retry", error: `http ${res.status}` };
  } catch (e) {
    return { kind: "retry", error: (e as Error).message.slice(0, 120) };
  }
}
