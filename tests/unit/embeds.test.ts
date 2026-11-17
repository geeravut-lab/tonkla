import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : /\.(ts|tsx)$/.test(f) ? [join(dir, f)] : []));

describe("embedded relations stay unambiguous", () => {
  it("announcements reach profiles by two routes (author and receipts), so an embed must name the foreign key", () => {
    const bad = walk("src").filter((f) => /from\("announcements"\)\s*\.select\("[^"]*\bprofiles\(/.test(readFileSync(f, "utf8").replace(/\s+/g, " ")));
    expect(bad, "write profiles!announcements_author_id_fkey(...) instead of profiles(...)").toEqual([]);
  });
});
