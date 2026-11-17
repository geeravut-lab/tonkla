import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanDetail } from "@/server/audit";

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));

describe("audit coverage", () => {
  const actionFiles = files("src/app/actions").filter((f) => f.endsWith(".ts"));
  it("every action file that checks staff permission also writes to the audit trail", () => {
    const staff = /requireAdmin\(|requireCoordinator\(|requireExec\(/;
    for (const f of actionFiles) {
      const src = readFileSync(f, "utf8");
      if (staff.test(src)) {
        expect(src, f).toMatch(/from "@\/server\/audit"/);
        expect(src, f).toMatch(/\baudit\(\{/);
      }
    }
  });
  it("every action file starts with 'use server' and checks a session or permission before doing work", () => {
    for (const f of actionFiles) {
      const src = readFileSync(f, "utf8");
      expect(src.startsWith('"use server"'), f).toBe(true);
    }
  });
});

describe("cleanDetail", () => {
  it("drops keys that look like personal data or free text", () => {
    const out = cleanDetail({ id: "x", email: "a@b.co", display_name: "Somchai", note: "hello", password: "p", token: "t", count: 3, ok: true, url: "http://x" });
    expect(out).toEqual({ id: "x", count: 3, ok: true });
  });
  it("limits length and size", () => {
    const out = cleanDetail({ s: "x".repeat(500), list: Array.from({ length: 50 }, (_, i) => i), nested: { a: 1 } });
    expect((out.s as string).length).toBe(120);
    expect((out.list as number[]).length).toBe(20);
    expect(out.nested).toBeUndefined();
    const many = cleanDetail(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i])));
    expect(Object.keys(many).length).toBe(20);
  });
});
