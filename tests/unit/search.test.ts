import { describe, expect, it } from "vitest";
import { normalize, rank, score, tokens } from "@/lib/search";

const docs = [
  { id: 1, title: "ใช้ QR แทนใบเบิกวัสดุ", body: "ลดเวลาเบิกของในคลังสินค้า" },
  { id: 2, title: "ติดตั้งโซลาร์เซลล์บนหลังคาโรงงาน", body: "ลดค่าไฟฟ้าประจำเดือน" },
  { id: 3, title: "ระบบจองห้องประชุมออนไลน์", body: "ไม่ต้องโทรถามแผนกธุรการ" },
];

describe("idea library search", () => {
  it("splits Thai text into words even though it has no spaces", () => {
    const t = tokens("ระบบจองห้องประชุม");
    expect(t.length).toBeGreaterThan(1);
    expect(t.join("")).toBe(normalize("ระบบจองห้องประชุม"));
  });
  it("finds a document by a word inside a longer Thai title", () => {
    expect(rank("คลังสินค้า", docs).map((d) => d.id)[0]).toBe(1);
    expect(rank("ค่าไฟ", docs).map((d) => d.id)[0]).toBe(2);
    expect(rank("ห้องประชุม", docs).map((d) => d.id)[0]).toBe(3);
  });
  it("tolerates a missing letter or a different tone mark", () => {
    expect(rank("โซลาเซลล์", docs).map((d) => d.id)).toContain(2);
    expect(rank("โซล่าเซลล์", docs).map((d) => d.id)).toContain(2);
  });
  it("works for English and mixed text; ignores case", () => {
    expect(rank("qr", docs).map((d) => d.id)[0]).toBe(1);
    expect(rank("QR เบิก", docs).map((d) => d.id)[0]).toBe(1);
  });
  it("returns nothing unrelated, and everything for an empty query", () => {
    expect(rank("ฟุตบอล", docs)).toEqual([]);
    expect(rank("  ", docs)).toHaveLength(3);
    expect(score("", "abc")).toBe(0);
  });
});
