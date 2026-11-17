import { describe, expect, it } from "vitest";
import { composeEmail, sendResend, validAddress, type EmailConfig } from "@/server/email-core";

const base = { brand: "Tonkla", title: "รายงานปัญหา", summary: "เรื่องของคุณมีความคืบหน้า", button: "เปิดแอป", url: "https://tonkla-th.vercel.app/reports/1", footer: "อีเมลนี้ส่งอัตโนมัติ", recipient: "somchai@company.example", recipientName: "สมชาย" };
const cfg: EmailConfig = { key: "k", from: "Tonkla <onboarding@resend.dev>", redirectTo: null };

describe("composing e-mail", () => {
  it("goes to the real recipient normally", () => {
    const m = composeEmail(base, cfg);
    expect(m.to).toBe("somchai@company.example");
    expect(m.subject).toBe("Tonkla: เรื่องของคุณมีความคืบหน้า");
    expect(m.text).toContain("https://tonkla-th.vercel.app/reports/1");
  });
  it("in test mode everything goes to the one redirect address and says who it was meant for", () => {
    const m = composeEmail(base, { ...cfg, redirectTo: "owner@example.com" });
    expect(m.to).toBe("owner@example.com");
    expect(m.subject).toContain("[TEST → สมชาย]");
    expect(m.text).toContain("somchai@company.example");
  });
  it("escapes HTML in titles and summaries", () => {
    const m = composeEmail({ ...base, title: '<script>alert(1)</script>', summary: 'a "b" <i>' }, cfg);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
  it("accepts ordinary addresses and refuses odd ones", () => {
    expect(validAddress("a.b@c-d.co.th")).toBe(true);
    for (const bad of ["", "a@b", "a b@c.com", "<a@b.com>", "a@b.c"]) expect(validAddress(bad), bad).toBe(false);
  });
});

describe("sending through Resend", () => {
  const msg = composeEmail(base, cfg);
  const respond = (status: number) => (async () => new Response("err", { status })) as unknown as typeof fetch;
  it("uses the queue id as the idempotency key and a bearer key", async () => {
    let seen: { headers: Record<string, string>; body: string } | null = null;
    const f = (async (_u: string, init: RequestInit) => { seen = { headers: init.headers as Record<string, string>, body: String(init.body) }; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    expect(await sendResend(cfg, msg, "row-1", f)).toEqual({ kind: "sent" });
    expect(seen!.headers["Idempotency-Key"]).toBe("row-1");
    expect(seen!.headers.Authorization).toBe("Bearer k");
    expect(JSON.parse(seen!.body).to).toEqual(["somchai@company.example"]);
  });
  it("tells apart retryable, refused, rate-limited and bad-credential answers", async () => {
    expect((await sendResend(cfg, msg, "r", respond(500))).kind).toBe("retry");
    expect((await sendResend(cfg, msg, "r", respond(422))).kind).toBe("blocked");
    expect((await sendResend(cfg, msg, "r", respond(429))).kind).toBe("quota");
    expect((await sendResend(cfg, msg, "r", respond(401))).kind).toBe("pause");
    expect((await sendResend(cfg, msg, "r", (async () => { throw new Error("down"); }) as unknown as typeof fetch)).kind).toBe("retry");
  });
});
