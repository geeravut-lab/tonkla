import { describe, expect, it } from "vitest";
import { th } from "@/i18n/dict/gdash";
import { groupCsv, type GroupDash } from "@/lib/group-csv";

const t = { ...th } as never;
const row = { members: 40, participants: 12, reports_new: 5, reports_answered: 4, reports_in_time: 4, reports_overdue: 1, reports_resolved: 2, ideas_new: 3, ideas_adopted: 1, value_money: "12000", value_hours: 0, value_revenue: 0 };
const d: GroupDash = { days: 30, companies: [{ ...row, name: '=HYPERLINK("x")', bu_name: "ผลิต" }], units: [{ ...row, bu_name: "ผลิต", companies: 1 }], recurring: [{ key: "equipment", name: "อุปกรณ์", companies: 2, reports: 4, open: 3 }] };

describe("group CSV export", () => {
  it("has the three blocks and only numbers and names", () => {
    const csv = groupCsv(d, t);
    expect(csv).toContain("อุปกรณ์");
    expect(csv.split("\n").filter((l) => l === "").length).toBe(3); // a blank line before each block
    expect(csv).toContain("12000");
  });
  it("neutralises cells that a spreadsheet would execute", () => {
    expect(groupCsv(d, t)).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
