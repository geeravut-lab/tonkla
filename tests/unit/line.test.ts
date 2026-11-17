import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CODE_RE, buildLineMessage, generateCode, hashCode, nextAttemptDelayMinutes, normalizeCode, pushLine, quotaAllows, safeAppUrl, verifySignature } from "@/server/line-core";

const cfg = { secret: "s3cret", token: "tok", basicId: "@abc" };
const sign = (body: string) => createHmac("sha256", cfg.secret).update(body).digest("base64");
const res = (status: number) => (async () => new Response("", { status })) as unknown as typeof fetch;

describe("webhook signature", () => {
  it("accepts the exact body and rejects anything else", () => {
    const body = '{"events":[]}';
    expect(verifySignature(body, sign(body), cfg.secret)).toBe(true);
    expect(verifySignature(body + " ", sign(body), cfg.secret)).toBe(false);
    expect(verifySignature(body, sign(body), "other")).toBe(false);
    expect(verifySignature(body, null, cfg.secret)).toBe(false);
    expect(verifySignature(body, "not base64 !!!", cfg.secret)).toBe(false);
  });
});

describe("link codes", () => {
  it("are 8 characters without confusing letters, random, normalised, and only hashed for storage", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toMatch(CODE_RE);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(190);
    expect(normalizeCode(" ab cd 2345 ")).toBe("ABCD2345");
    expect(hashCode("abcd2345", "k")).toBe(hashCode("ABCD 2345", "k"));
    expect(hashCode("ABCD2345", "k")).not.toBe(hashCode("ABCD2345", "k2"));
    expect(hashCode("ABCD2345", "k")).not.toContain("ABCD2345");
  });
});

describe("Flex card", () => {
  const card = { title: "ต".repeat(500), lines: Array.from({ length: 20 }, (_, i) => ({ label: "ป".repeat(80), text: `ค่า${i}`.repeat(100) })), button: "เปิดแอปเปิดแอปเปิดแอปเปิดแอปเปิดแอป", href: "/reports/abc" };
  it("never exceeds LINE's limits, however long the input is", () => {
    const m = buildLineMessage(card, "https://tonkla-th.vercel.app");
    expect(m.altText.length).toBeLessThanOrEqual(400);
    const body = m.contents.body.contents as { type: string; text?: string; contents?: { text: string }[] }[];
    expect(body.length).toBeLessThanOrEqual(9); // title + 8 lines
    expect(body[0]!.text!.length).toBeLessThanOrEqual(100);
    for (const row of body.slice(1)) for (const t of row.contents ?? []) expect(t.text.length).toBeLessThanOrEqual(120);
    expect(m.contents.footer.contents[0]!.action.label.length).toBeLessThanOrEqual(20);
  });
  it("links only to the app's own pages and opens in the phone's browser", () => {
    expect(safeAppUrl("https://tonkla-th.vercel.app/", "/news/1")).toBe("https://tonkla-th.vercel.app/news/1?openExternalBrowser=1");
    expect(safeAppUrl("https://tonkla-th.vercel.app", "/desk?company=x")).toBe("https://tonkla-th.vercel.app/desk?company=x&openExternalBrowser=1");
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "", "news"]) expect(safeAppUrl("https://tonkla-th.vercel.app", bad)).toBe("https://tonkla-th.vercel.app/?openExternalBrowser=1");
  });
  it("puts the whole message in altText (lock screen) and a readable button colour", () => {
    const m = buildLineMessage({ title: "เรื่องใหม่", lines: [{ text: "มอบหมายให้คุณ" }, { label: "สถานะ", text: "รับเรื่องแล้ว" }], button: "เปิดแอป", href: "/" }, "https://x.test");
    expect(m.altText).toBe("เรื่องใหม่ · มอบหมายให้คุณ · สถานะ รับเรื่องแล้ว");
  });
});

describe("push result mapping", () => {
  it("maps LINE's answers to what the queue must do", async () => {
    expect((await pushLine(cfg, "U1", [], "k", "http://x", res(200))).kind).toBe("sent");
    expect((await pushLine(cfg, "U1", [], "k", "http://x", res(409))).kind).toBe("sent"); // already delivered with this retry key
    expect((await pushLine(cfg, "U1", [], "k", "http://x", res(401))).kind).toBe("pause");
    expect((await pushLine(cfg, "U1", [], "k", "http://x", res(403))).kind).toBe("pause");
    expect((await pushLine(cfg, "U1", [], "k", "http://x", res(400))).kind).toBe("blocked");
    expect((await pushLine(cfg, "U1", [], "k", "http://x", res(429))).kind).toBe("quota");
    expect((await pushLine(cfg, "U1", [], "k", "http://x", res(503))).kind).toBe("retry");
    expect((await pushLine(cfg, "U1", [], "k", "http://x", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).kind).toBe("retry");
  });
  it("sends the retry key and the token, never in the body", async () => {
    let seen: RequestInit | undefined;
    await pushLine(cfg, "U1", [{ type: "text", text: "x" }], "retry-123", "http://x", (async (_u: unknown, init?: RequestInit) => { seen = init; return new Response("", { status: 200 }); }) as unknown as typeof fetch);
    expect((seen!.headers as Record<string, string>)["X-Line-Retry-Key"]).toBe("retry-123");
    expect((seen!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(String(seen!.body)).not.toContain("tok");
  });
  it("backs off 2, 10, 30 minutes and then gives up", () => {
    expect([1, 2, 3, 4].map(nextAttemptDelayMinutes)).toEqual([2, 10, 30, null]);
  });
  it("keeps a reserve of the quota for urgent messages", () => {
    expect(quotaAllows(940, 1000, 100, false)).toBe(false);
    expect(quotaAllows(940, 1000, 100, true)).toBe(true);
    expect(quotaAllows(1000, 1000, 100, true)).toBe(false);
  });
});
