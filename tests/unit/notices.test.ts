import { describe, expect, it } from "vitest";
import { dictFor } from "@/i18n";
import { noticeText } from "@/lib/notices";

describe("noticeText", () => {
  it("writes the same notice in the reader's language", () => {
    const n = { kind: "report_status", params: { status: "in_progress" }, body: "" };
    expect(noticeText(dictFor("th"), n)).toContain("กำลังแก้ไข");
    expect(noticeText(dictFor("en"), n)).toContain("In progress");
  });
  it("fills numbers and falls back to stored text for unknown kinds", () => {
    expect(noticeText(dictFor("en"), { kind: "report_due", params: { hours: 5 }, body: "" })).toContain("5 hours");
    expect(noticeText(dictFor("th"), { kind: "legacy_kind", params: {}, body: "ข้อความเดิม" })).toBe("ข้อความเดิม");
  });
});
