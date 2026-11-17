import { describe, expect, it } from "vitest";
import { newCaseCode, newSecret, nonceHash, secretHash, signToken, verifyToken } from "@/server/anon-core";

describe("anonymous channel tokens", () => {
  it("verifies a fresh token and exposes only a random nonce", () => {
    const t = signToken("k");
    const v = verifyToken(t, "k");
    expect(v?.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(t).not.toMatch(/user|@/);
  });
  it("rejects tampering, a wrong key, expiry and garbage", () => {
    const t = signToken("k", 1_000);
    expect(verifyToken(t, "other", 1_001)).toBeNull();
    expect(verifyToken(t.replace(/.$/, (c) => (c === "0" ? "1" : "0")), "k", 1_001)).toBeNull();
    expect(verifyToken(t, "k", 1_000 + 61 * 60 * 1000)).toBeNull();
    for (const bad of ["", "a.b.c", "x".repeat(40), "00.1.2"]) expect(verifyToken(bad, "k")).toBeNull();
  });
  it("two tokens never share a nonce", () => {
    expect(verifyToken(signToken("k"), "k")!.nonce).not.toBe(verifyToken(signToken("k"), "k")!.nonce);
  });
  it("case codes and secrets use the unambiguous alphabet and are keyed-hashed for storage", () => {
    expect(newCaseCode()).toMatch(/^AN-[A-HJ-NP-Z2-9]{8}$/);
    const s = newSecret();
    expect(s).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    expect(secretHash(s.toLowerCase(), "k")).toBe(secretHash(s, "k"));
    expect(secretHash(s, "k")).not.toBe(secretHash(s, "k2"));
    expect(secretHash(s, "k")).not.toContain(s);
    expect(nonceHash("abc")).toHaveLength(64);
  });
});
