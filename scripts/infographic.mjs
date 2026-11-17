// Builds the Tonkla feature infographic (3 pages) in Thai and English: HTML -> PNG per page + one PDF.
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/infographic.mjs <out-dir> <screenshot-dir>
// The phone shows real screenshots of the running app (app-home-th.png); colours are the Tonkla design tokens.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || "docs/infographic";
const SHOTS = process.argv[3] || "docs/infographic";
mkdirSync(OUT, { recursive: true });

const C = { primary: "#0E7A5C", hover: "#0A6149", pressed: "#084C3A", leaf: "#5BC98F", sprout: "#B8EBCF", sun: "#FFB84D", mint: "#DDF5E8", bg: "#F4FAF6", ink: "#10282B", muted: "#506468", line: "#DCE8E2", warn: "#FFE9B8", danger: "#FDE4E1", dangerFg: "#B42318", info: "#E4EEF3", infoFg: "#1D4A5E" };
const TINT = { mint: C.mint, sun: "#FFF0D6", warn: C.warn, danger: C.danger, info: C.info, sprout: "#D4F3E3" };
const FG = { mint: C.primary, sun: "#9A5B00", warn: "#8A5A00", danger: C.dangerFg, info: C.infoFg, sprout: C.hover };

const font = (f, file, range) => `@font-face{font-family:'${f}';src:url('file://${root}/node_modules/@fontsource-variable/noto-sans-thai/files/${file}') format('woff2');font-weight:100 900;unicode-range:${range}}`;
const FONTS = font("TK", "noto-sans-thai-thai-wght-normal.woff2", "U+0E01-0E5B,U+200C-200D,U+25CC") + font("TK", "noto-sans-thai-latin-wght-normal.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD");

const I = {
  alert: '<path d="M12 4 3 20h18L12 4Z"/><path d="M12 10v5M12 17.5v.01"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
  news: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z"/><path d="M10 21h4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.4 0 4 1.7 4 4.5"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="m8 15 3-4 3 2 5-6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mega: '<path d="M4 10v4l11 4V6L4 10Z"/><path d="M15 9a3 3 0 0 1 0 6M7 14v4"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  poll: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M4 18h16M12 3v2M4.5 6.5l1.5 1.2M19.5 6.5 18 7.7"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M8 17h10"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M9 20h6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  repeat: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 17v4M17 19h4"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  build: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  file: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  eyeoff: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/><path d="M4 4l16 16"/>',
  heart: '<path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M16 14h2"/>',
  steps: '<circle cx="6" cy="6" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 7l3 3M14 13l3 3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.700l1-1"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.500h2"/>',
  inbox: '<path d="M4 13l2-8h12l2 8v6H4v-6Z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
  export: '<path d="M12 4v11M8 8l4-4 4 4M5 19h14"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

// ------------------------------------------------------------------ content
const TH = {
  lang: "th", app: "Tonkla", sub: "ต้นกล้า · พอร์ทัลพนักงานของกลุ่มบริษัท",
  hero: { h1: ["เสียงของพนักงาน ถึงคนที่แก้ได้", "ภายในเวลาที่กำหนด"], p: "สื่อสารทั้งกลุ่ม แจ้งปัญหาพร้อมวิธีแก้ เสนอไอเดียใหม่ และยกย่องผลงานที่ถูกนำไปใช้จริง ครบในที่เดียวสำหรับกลุ่มบริษัทกว่า 30 แห่ง ใช้บนมือถือเป็นหลัก ภาษาไทยก่อน อังกฤษได้ พร้อม AI ที่เสนอแนะ แต่คนเป็นผู้ตัดสินใจเสมอ", cta: "เข้าสู่ระบบด้วย Google · LINE" },
  s1: { n: 1, t: "เส้นทางของพนักงาน", cards: [
    ["alert", "mint", "แจ้งปัญหา", "ถ่ายรูป ส่งได้ใน 1 นาที ทุกเรื่องมีผู้รับผิดชอบและกำหนดตอบ 48 ชั่วโมง"],
    ["bell", "sun", "ติดตามผลได้เอง", "เห็นสถานะทุกขั้น รับเรื่อง กำลังทำ แก้แล้ว พร้อมแจ้งเตือนทาง LINE หรืออีเมล"],
    ["bulb", "sprout", "ไอเดียที่ถูกนำไปใช้", "เสนอไอเดีย ผ่าน 5 ระยะ ผลลัพธ์ที่ยืนยันแล้ว ได้คะแนนและรางวัล"],
  ] },
  s2: { n: 2, t: "แจ้งปัญหาให้ใช่ ตามให้ถึงที่สุด", cards: [
    ["clock", "warn", "ผู้รับผิดชอบ + กำหนดตอบทุกเรื่อง", "เกินกำหนดแล้วระบบยกระดับไปผู้ประสานงานและทีมกลางเอง ไม่มีเรื่องหาย"],
    ["repeat", "info", "ฉันก็เจอ + ตรวจเรื่องซ้ำ", "เจอปัญหาเดียวกันกดแทนการแจ้งซ้ำ ระบบและ AI ช่วยชี้เรื่องที่เหมือนกัน"],
    ["check", "mint", "หัวหน้างานปิดเรื่องเล็กได้ทันที", "เรื่องความรุนแรงต่ำถึงกลางจบที่หัวหน้า ไม่ต้องรอผ่านหลายชั้น"],
    ["book", "sprout", "แนวปฏิบัติที่ดีสร้างให้อัตโนมัติ", "เมื่อปัญหาถูกแก้ บทเรียนถูกเก็บเป็นแนวปฏิบัติ แบ่งปันทั้งกลุ่มได้"],
  ] },
  s3: { n: 3, t: "จากไอเดีย สู่ผลลัพธ์ที่วัดได้", cards: [
    ["steps", "mint", "5 ระยะ เกณฑ์เปิดเผย", "ส่ง › คัดกรอง › ประเมิน › ทดลอง › ขยายผล มีผลลัพธ์ประหยัดเงิน ลดเวลา เพิ่มรายได้ ที่ต้องมีคนที่สองยืนยัน"],
    ["target", "sun", "โจทย์ท้าทาย + คลังไอเดีย", "ผู้บริหารตั้งโจทย์ตามเป้าหมายปี มีกำหนดเวลา ค้นไอเดียเดิมก่อนเสนอใหม่ (ค้นภาษาไทยได้)"],
    ["users", "info", "นำไปใช้ที่บริษัทฉัน + ทีมข้ามบริษัท", "ขยายผลไอเดียที่ได้ผลไปบริษัทอื่น เจ้าของเดิมได้เครดิตและคะแนน"],
    ["wallet", "warn", "งบทดลองอนุมัติเร็ว", "ขอเงินทดลองก้อนเล็ก ภายในวงเงินบริษัท คนที่สองอนุมัติใน 48 ชั่วโมง ใช้เกินที่อนุมัติไม่ได้"],
  ] },
  head2: { h: "สื่อสาร ร่วมมือ และยกย่อง ทั้งกลุ่มบริษัท", p: "ข่าวสาร · เหตุฉุกเฉิน · ถามตอบผู้บริหาร · ชุมชน · รางวัล" },
  s4: { n: 4, t: "เมนูสื่อสารทั้งกลุ่ม ครบในที่เดียว", cards: [
    ["mega", "mint", "ข่าวและประกาศ", "ส่งถึงทั้งกลุ่ม บริษัท หรือแผนก เลือกให้ต้องรับทราบ ดูได้ว่าใครอ่านแล้ว"],
    ["siren", "danger", "แจ้งเหตุฉุกเฉิน", "แจ้งทันทีถึงผู้ประสานงานและทีมกลาง ไม่มีผู้รับเกิน 10 นาที ยกระดับอัตโนมัติ"],
    ["chat", "info", "ถามตอบผู้บริหาร", "ตั้งคำถาม โหวตข้อที่อยากให้ตอบ เลือกซ่อนชื่อจากเพื่อนร่วมงานได้"],
    ["cal", "sun", "ปฏิทิน + โพลสั้น", "กิจกรรมพร้อมตอบรับ จำกัดจำนวนที่นั่ง โพลที่ไม่มีใครเห็นว่าคุณเลือกอะไร"],
  ], chips: [["bell", "แจ้งเตือน LINE · อีเมล · Teams · Google Chat"], ["spark", "หน้าจออัปเดตสด ไม่ต้องรีเฟรช"], ["globe", "ไทย / English"], ["phone", "ออกแบบมือถือก่อน ปุ่มใหญ่ อ่านง่าย"]] },
  s5: { n: 5, t: "ร่วมมือ และยกย่องผลงานจริง", cards: [
    ["users", "mint", "ชุมชนตามสายงาน", "การเงิน บุคคล การตลาด ไอที รวมคนสายเดียวกันจากทุกบริษัท ถามตอบแบ่งปันวิธีทำงาน"],
    ["steps", "sprout", "ทีมร่วมข้ามบริษัท", "ตั้งทีมรอบไอเดียหนึ่งเรื่อง เชิญคนต่างแผนกต่างบริษัท เห็นเฉพาะไอเดียของทีม"],
    ["trophy", "sun", "คะแนนและรางวัลจากการใช้จริง", "ไม่ได้นับจำนวนที่ส่ง ผลงานเด่นรายเดือน รางวัล “กล้าลอง” และรางวัลประจำปีระดับกลุ่ม"],
    ["file", "info", "คลังความรู้ + ถามด้วย AI", "นโยบาย คู่มือ แบบฟอร์ม แยกสิทธิ์ตามบริษัท ถามเป็นภาษาธรรมดา ตอบจากเอกสารที่คุณเห็นเท่านั้น"],
  ] },
  s6: { n: 6, t: "ไว้ใจได้ ปลอดภัย", cards: [
    ["lock", "mint", "ข้อมูลแยกรายบริษัท", "บังคับที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่ม แต่ละบริษัทเห็นเฉพาะของตน"],
    ["eyeoff", "danger", "ช่องร้องเรียนไม่ระบุตัวตน", "ไม่เก็บชื่อ บัญชี บริษัท หรือเวลา ถึงเฉพาะทีมกลางที่แต่งตั้ง ติดตามด้วยรหัสลับ"],
    ["bell", "sun", "แจ้งเตือนนอกแอปไม่มีเนื้อหาลับ", "การ์ด LINE และอีเมลมีเฉพาะหัวข้อกับสถานะ เปิดดูรายละเอียดในแอป"],
    ["shield", "info", "PDPA ในมือผู้ใช้", "ขอสำเนาข้อมูลของตนเอง ขอลบ ปิดการแจ้งเตือนได้ทุกเมื่อ มีบันทึก audit ที่แก้ไม่ได้"],
  ], safe: ["ความปลอดภัยของคุณมาก่อน", "AI เสนอแนะเท่านั้น ไม่ตัดสินแทนคน ไม่ส่งชื่อหรืออีเมลของพนักงานให้ AI เรื่องร้องเรียนไม่ระบุตัวตนไม่เข้า AI ผู้ดูแลระบบตั้งผู้ให้บริการและรุ่น AI ได้ และปิดทั้งหมดได้"] },
  head3: { h: "สำหรับผู้ประสานงาน ผู้บริหาร และผู้ดูแลระบบ", p: "รับเรื่อง · เห็นภาพรวม · ตั้งค่าได้เอง · ตรวจย้อนหลังได้" },
  s7: { n: 7, t: "ผู้ประสานงานบริษัท: เห็นงานค้าง จัดการง่าย", cards: [
    ["inbox", "mint", "งานของผู้ประสานงาน", "รับเรื่อง มอบหมาย รวมเรื่องซ้ำ เห็นเรื่องใกล้ครบและเกินกำหนดในหน้าเดียว"],
    ["users", "info", "นำเข้ารายชื่อ + รหัสเชิญ", "นำเข้าพนักงานจาก CSV อนุมัติคำขอเข้าร่วม กำหนดผู้บังคับบัญชาและบทบาท"],
    ["clock", "warn", "กติกาเตือนอัตโนมัติ", "ตั้งเวลาเตือนก่อนครบกำหนดและยกระดับเมื่อเกินกำหนด เปิดปิดได้รายกติกา"],
    ["spark", "sprout", "AI ช่วยคิด คนตัดสินใจ", "แนะนำหมวดและความรุนแรง ผู้รับผิดชอบที่เหมาะ สรุปประจำสัปดาห์ และแปลข่าว"],
  ] },
  s8: { n: 8, t: "ผู้บริหารและทีมกลาง: ภาพรวมที่เชื่อถือได้", banner: ["Dashboard บริษัท + ภาพรวมทั้งกลุ่ม", "เทียบตามกลุ่มธุรกิจและรายบริษัท หมวดปัญหาที่ซ้ำในหลายบริษัท มูลค่าที่ยืนยันแล้ว (ประหยัดเงิน ลดเวลา เพิ่มรายได้) บริษัทเล็กแสดงเป็นจำนวนแทนร้อยละ ส่งออก CSV สำหรับประชุมผู้บริหาร"], chips: [["chart", "ตัวเลขรวมเท่านั้น ไม่มีเนื้อหาเรื่องหรือชื่อคน"], ["export", "ส่งออก CSV (บันทึกใน audit)"], ["trend", "อัตรานำไปใช้ และเวลาตอบ"], ["star", "รางวัลประจำปีระดับกลุ่ม"]] },
  s9: { n: 9, t: "ผู้ดูแลระบบ: โปร่งใส ตรวจย้อนหลังได้", chips: [["file", "Audit trail เปิดปิดได้ เลือกชนิดเหตุการณ์ได้"], ["gear", "สวิตช์ฟีเจอร์ รอบการขยายทีละกลุ่มบริษัท"], ["spark", "เลือกผู้ให้บริการ AI และรุ่น ตั้งกฎเพิ่มโดยมีด่านตรวจ"], ["mail", "ตั้งค่า LINE อีเมล Teams / Google Chat"], ["build", "เพิ่มบริษัทใหม่จากแม่แบบ ไม่ต้องเขียนโปรแกรม"], ["link", "เข้าสู่ระบบด้วย Google · LINE (Aivora) · อีเมลสำหรับบัญชีสำรอง"]],
    trust: ["ทำไมไว้ใจ Tonkla ได้", [["ข้อมูลของแต่ละบริษัทแยกกัน", "บังคับที่ฐานข้อมูล ทดสอบสิทธิ์ทุกกติกา"], ["ทุกเรื่องมีเจ้าของและกำหนดตอบ", "ไม่มีเรื่องที่ไม่มีใครรับผิดชอบ"], ["คนเป็นผู้ตัดสินใจ", "AI เสนอแนะ ทุกการอนุมัติเป็นของคน"], ["เปิดใช้ทีละรอบ", "ฟีเจอร์ใหม่เปิดให้บริษัทที่พร้อมก่อน"]]] },
  s10: { n: 10, t: "เริ่มได้ตามบทบาทของคุณ", cards: [["พนักงาน", "เข้าสู่ระบบ แจ้งปัญหา เสนอไอเดีย ตามผลได้เอง", "เริ่มที่นี่"], ["ผู้ประสานงานบริษัท", "รับเรื่อง ตั้งกติกา เห็นภาพรวมบริษัท", "ผู้ดูแลระบบเชิญก่อน"], ["ผู้บริหาร · ทีมกลาง", "ภาพรวมทั้งกลุ่ม รางวัล และการตัดสินใจ", "แต่งตั้งโดยผู้ดูแลระบบ"]] },
  foot: { h: "เริ่มส่งเสียงวันนี้", p: "tonkla-th.vercel.app", cta: "เข้าสู่ระบบ", note: "Tonkla เปิดใช้ทีละบริษัทตามรอบการขยาย ฟีเจอร์ที่เห็นอาจต่างกันตามบทบาทและการตั้งค่าของบริษัท AI เป็นเพียงข้อเสนอแนะ โปรดตรวจสอบก่อนตัดสินใจ" },
};
const EN = {
  lang: "en", app: "Tonkla", sub: "Employee portal for a group of companies",
  hero: { h1: ["Every employee's voice,", "to the person who can fix it"], p: "Group-wide communication, problem reports with proposed fixes, new ideas and recognition for what is actually adopted, in one place for a group of 30+ companies. Mobile first, Thai first with English available, and AI that only suggests: people always decide.", cta: "Sign in with Google · LINE" },
  s1: { n: 1, t: "The employee's journey", cards: [
    ["alert", "mint", "Report a problem", "Take a photo and send it in a minute. Every report gets an owner and a 48-hour response deadline."],
    ["bell", "sun", "Follow it yourself", "See every step: received, in progress, solved, with notices on LINE or e-mail."],
    ["bulb", "sprout", "Ideas that get used", "Send an idea through 5 stages, confirmed results, then points and awards."],
  ] },
  s2: { n: 2, t: "Report it right, follow it through", cards: [
    ["clock", "warn", "Owner + deadline on every report", "Past the deadline, the system escalates to the coordinator and the central team by itself. Nothing gets lost."],
    ["repeat", "info", "Me too + duplicate check", "Hit “me too” instead of reporting again. The system and AI point out similar reports."],
    ["check", "mint", "Supervisors close small cases", "Low and medium severity can end with the supervisor, with no long chain of approvals."],
    ["book", "sprout", "Good practices written for you", "When a problem is solved, the lesson is kept as a good practice that can be shared group-wide."],
  ] },
  s3: { n: 3, t: "From idea to measured result", cards: [
    ["steps", "mint", "5 stages, open criteria", "Submit › Screen › Evaluate › Pilot › Scale. Results (money saved, time saved, revenue) need a second person to confirm."],
    ["target", "sun", "Challenges + idea library", "Executives set challenges for the year's goals with a deadline. Search existing ideas first (Thai search works)."],
    ["users", "info", "Adopt at my company + teams", "Take an idea that worked to another company. The original owner gets credit and points."],
    ["wallet", "warn", "Small pilot budgets, fast approval", "Ask for a small sum within the company limit. A second person approves within 48 hours; spending can never exceed the approval."],
  ] },
  head2: { h: "Communicate, collaborate, recognise", p: "News · emergencies · ask the executives · communities · awards" },
  s4: { n: 4, t: "Group-wide communication, in one place", cards: [
    ["mega", "mint", "News and announcements", "To the whole group, a company or a department. Make it must-read and see who has read it."],
    ["siren", "danger", "Emergency reports", "Straight to coordinators and the central team. If nobody picks it up in 10 minutes it escalates."],
    ["chat", "info", "Ask the executives", "Ask a question, vote for the ones you want answered, hide your name from colleagues if you wish."],
    ["cal", "sun", "Calendar + short polls", "Events with RSVP and limited seats. Polls where nobody can see what you chose."],
  ], chips: [["bell", "Notices on LINE · e-mail · Teams · Google Chat"], ["spark", "Screens update live, no refresh"], ["globe", "Thai / English"], ["phone", "Mobile first, big buttons, easy to read"]] },
  s5: { n: 5, t: "Collaborate and recognise real results", cards: [
    ["users", "mint", "Communities by function", "Finance, HR, marketing, IT: people in the same function from every company ask, answer and share."],
    ["steps", "sprout", "Cross-company teams", "A team around one idea with people from other departments and companies, who see only that idea."],
    ["trophy", "sun", "Points and awards for real use", "Not for how many you send. Monthly highlights, the “dare to try” award and annual group awards."],
    ["file", "info", "Knowledge base + ask with AI", "Policies, manuals and forms by company. Ask in plain language; answers come only from documents you may read."],
  ] },
  s6: { n: 6, t: "Trustworthy and safe", cards: [
    ["lock", "mint", "Company data stays separate", "Enforced in the database, not just by hiding buttons. Each company sees only its own."],
    ["eyeoff", "danger", "Anonymous complaint channel", "No name, account, company or time is stored. Only the appointed central team reads it; follow it with a secret code."],
    ["bell", "sun", "Outside notices carry no secrets", "LINE cards and e-mail hold only a title and a status. Details are opened in the app."],
    ["shield", "info", "PDPA in the user's hands", "Export your own data, ask for deletion, switch notices off any time. A tamper-proof audit trail."],
  ], safe: ["Your safety comes first", "AI only suggests and never decides for people. Employee names and e-mails are not sent to AI, anonymous complaints never reach AI, and administrators choose the AI provider and model, or switch it all off."] },
  head3: { h: "Coordinators, executives and admins", p: "Handle · see the whole picture · configure yourself · audit afterwards" },
  s7: { n: 7, t: "Company coordinators: see the backlog, handle it easily", cards: [
    ["inbox", "mint", "The coordinator desk", "Pick up, assign, merge duplicates. Reports nearing or past their deadline in one page."],
    ["users", "info", "Roster import + invite codes", "Import staff from CSV, approve join requests, set supervisors and roles."],
    ["clock", "warn", "Automatic reminder rules", "Set reminders before a deadline and escalation after it, rule by rule."],
    ["spark", "sprout", "AI helps think, people decide", "Suggests category and severity, a fitting owner, a weekly summary and news translation."],
  ] },
  s8: { n: 8, t: "Executives and the central team: a picture you can trust", banner: ["Company dashboard + whole-group overview", "Compare business units and companies, categories that recur across companies, confirmed value (money, time, revenue). Small companies show counts instead of percentages. CSV export for executive meetings."], chips: [["chart", "Aggregates only: no report text, no names"], ["export", "CSV export (recorded in the audit)"], ["trend", "Adoption rate and response time"], ["star", "Annual group awards"]] },
  s9: { n: 9, t: "Administrators: transparent and auditable", chips: [["file", "Audit trail you can switch on and filter by event type"], ["gear", "Feature switches and rollout waves, a few companies at a time"], ["spark", "Choose the AI provider and model; extra rules pass a safety review"], ["mail", "Set up LINE, e-mail, Teams / Google Chat"], ["build", "Add a company from a template, no coding"], ["link", "Sign in with Google · LINE (Aivora) · e-mail for backup accounts"]],
    trust: ["Why you can trust Tonkla", [["Each company's data is separate", "Enforced in the database, every rule tested"], ["Every report has an owner and a deadline", "Nothing without somebody responsible"], ["People decide", "AI suggests, every approval is human"], ["Opened in waves", "New features reach ready companies first"]]] },
  s10: { n: 10, t: "Start by your role", cards: [["Employee", "Sign in, report a problem, send an idea, follow it yourself", "Start here"], ["Company coordinator", "Pick up reports, set rules, see the company picture", "Invited by an admin"], ["Executives · central team", "Group overview, awards and decisions", "Appointed by an admin"]] },
  foot: { h: "Raise your voice today", p: "tonkla-th.vercel.app", cta: "Sign in", note: "Tonkla opens company by company in rollout waves, so the features you see can differ by role and company settings. AI only suggests: please check before deciding." },
};

// ------------------------------------------------------------------ pieces
const card = ([ic, tone, title, text], kind) => `<div class="card ${kind}"><div class="ic" style="background:${TINT[tone]};color:${FG[tone]}">${ico(ic)}</div><div class="ct"><h3 style="color:${tone === "danger" ? C.dangerFg : C.hover}">${title}</h3><p>${text}</p></div></div>`;
const chip = ([ic, text], i) => `<span class="chip"><i style="background:${Object.values(TINT)[i % 6]};color:${Object.values(FG)[i % 6]}">${ico(ic).replace('width="34" height="34"', 'width="22" height="22"')}</i>${text}</span>`;
const sec = (s, inner, extra = "") => `<section><div class="sh"><b>${s.n}</b><h2>${s.t}</h2><u></u></div>${inner}${extra}</section>`;
const grid = (cards, cols, kind) => `<div class="grid c${cols}">${cards.map((c) => card(c, kind)).join("")}</div>`;
const chips = (list) => `<div class="chips">${list.map(chip).join("")}</div>`;
const mark = `<svg viewBox="0 0 120 120" width="100%" height="100%"><rect width="120" height="120" rx="28" fill="${C.primary}"/><path d="M60 94 V58" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M60 66 C34 68 22 52 24 34 C45 33 60 46 60 66 Z" fill="${C.sprout}"/><path d="M60 58 C60 37 76 22 99 22 C100 46 84 60 60 58 Z" fill="#fff"/><circle cx="60" cy="26" r="6" fill="${C.sun}"/></svg>`;
const img = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;

function page1(L, shot) {
  return `<div class="page p1"><div class="hero">
    <div class="dots"></div><div class="sunc"></div>
    <div class="brand"><div class="logo">${mark}</div><div><b>${L.app}</b><span>${L.sub}</span></div></div>
    <h1>${L.hero.h1[0]}<br>${L.hero.h1[1]}</h1><p class="lead">${L.hero.p}</p>
    <div class="cta">${L.hero.cta}</div>
    <div class="phone"><div class="screen"><img src="${img(shot)}" alt=""></div></div>
    <svg class="wave" viewBox="0 0 1414 120" preserveAspectRatio="none"><path d="M0 120V70C260 -10 760 -10 1414 80v40Z" fill="${C.bg}"/></svg>
  </div>
  <div class="body">${sec(L.s1, grid(L.s1.cards, 3, "tall"))}${sec(L.s2, grid(L.s2.cards, 2, "row"))}${sec(L.s3, grid(L.s3.cards, 2, "row"))}</div>
  <div class="pn">1 / 3</div></div>`;
}
function head(h) { return `<div class="band"><h1>${h.h}</h1><p>${h.p}</p><svg viewBox="0 0 1414 90" preserveAspectRatio="none"><path d="M0 90C220 10 760 -20 1414 70V90Z" fill="${C.bg}"/></svg></div>`; }
function page2(L) {
  return `<div class="page p2">${head(L.head2)}<div class="body">
    ${sec(L.s4, grid(L.s4.cards, 4, "tall"), chips(L.s4.chips))}${sec(L.s5, grid(L.s5.cards, 2, "row"))}${sec(L.s6, grid(L.s6.cards, 2, "row"))}
    <div class="safe"><div class="ic" style="background:#fff;color:${C.primary}">${ico("shield").replace('width="34" height="34"', 'width="44" height="44"')}</div><div><h3>${L.s6.safe[0]}</h3><p>${L.s6.safe[1]}</p></div></div></div><div class="pn">2 / 3</div></div>`;
}
function page3(L) {
  const roles = L.s10.cards.map(([t, p, tag], i) => `<div class="role ${i === 0 ? "first" : ""}">${i === 0 ? `<em>${tag}</em>` : ""}<h3>${t}</h3><p>${p}</p>${i > 0 ? `<span class="tag">${tag}</span>` : ""}</div>`).join("");
  return `<div class="page p3">${head(L.head3)}<div class="body">
    ${sec(L.s7, grid(L.s7.cards, 2, "row"))}
    ${sec(L.s8, `<div class="banner"><div class="ic" style="background:#fff;color:${C.primary}">${ico("chart").replace('width="34" height="34"', 'width="44" height="44"')}</div><div><h3>${L.s8.banner[0]}</h3><p>${L.s8.banner[1]}</p></div></div>`, chips(L.s8.chips))}
    ${sec(L.s9, chips(L.s9.chips))}
    ${sec(L.s10, `<div class="roles">${roles}</div>`)}</div>
    <div class="foot"><div class="logo">${mark}</div><div><b>${L.foot.h}</b><span>${L.foot.p}</span></div><div class="cta">${L.foot.cta}</div><small>${L.foot.note}</small></div><div class="pn pn3">3 / 3</div></div>`;
}

const CSS = `${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
@page{size:1414px 2000px;margin:0}
body{font-family:'TK','Noto Sans Thai',sans-serif;color:${C.ink};background:${C.bg};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:1414px;height:2000px;position:relative;overflow:hidden;background:${C.bg};break-after:page}
.hero{position:relative;height:750px;overflow:hidden;background:linear-gradient(125deg,${C.pressed} 0%,${C.hover} 42%,${C.primary} 100%);color:#fff;padding:52px 82px}
.dots{position:absolute;left:760px;top:70px;width:300px;height:300px;background-image:radial-gradient(rgba(255,255,255,.35) 3px,transparent 3.5px);background-size:41px 41px}
.sunc{position:absolute;right:-60px;top:-70px;width:250px;height:250px;border-radius:50%;background:${C.sun}}
.brand{display:flex;align-items:center;gap:24px}.brand b{display:block;font-size:44px;line-height:1.1}.brand span{font-size:23px;opacity:.85}
.logo{width:92px;height:92px;border-radius:24px;background:#fff;padding:6px;flex:none}
h1{font-size:58px;line-height:1.26;font-weight:800;margin-top:40px;max-width:860px}
.lead{font-size:24px;line-height:1.55;opacity:.92;max-width:780px;margin-top:22px}
.cta{display:inline-flex;align-items:center;margin-top:30px;padding:18px 40px;border-radius:999px;background:${C.sun};color:${C.ink};font-weight:800;font-size:28px;box-shadow:0 10px 24px rgba(0,0,0,.18)}
.phone{position:absolute;right:96px;top:70px;width:310px;height:640px;border-radius:50px;background:#0b1f21;padding:13px;transform:rotate(7deg);box-shadow:0 24px 50px rgba(0,0,0,.35)}
.screen{width:100%;height:100%;border-radius:38px;overflow:hidden;background:#fff}.screen img{width:100%;height:100%;object-fit:cover;object-position:top}
.wave{position:absolute;left:0;bottom:-2px;width:100%;height:120px}
.body{padding:34px 82px 0;display:flex;flex-direction:column;gap:30px}
.p1 .body{padding-top:0;gap:22px}.p1 section{gap:14px}.p1 .card.tall{padding:20px 22px;gap:6px}.p1 .card.tall .ic{width:72px;height:72px}.p1 .card.row{padding:16px 22px}.p1 .card p{font-size:19.5px;line-height:1.45;margin-top:4px}.p1 .grid{gap:14px}
section{display:flex;flex-direction:column;gap:18px}
.sh{display:flex;align-items:center;gap:20px}.sh b{width:60px;height:60px;border-radius:50%;background:${C.primary};color:#fff;display:grid;place-items:center;font-size:30px;flex:none}
.sh h2{font-size:36px;font-weight:800;color:${C.pressed};white-space:nowrap}.sh u{flex:1;height:3px;background:linear-gradient(90deg,${C.leaf},transparent)}
.grid{display:grid;gap:18px}.c2{grid-template-columns:1fr 1fr}.c3{grid-template-columns:repeat(3,1fr)}.c4{grid-template-columns:repeat(4,1fr)}
.card{background:#fff;border-radius:26px;box-shadow:0 4px 18px rgba(16,40,43,.09);padding:22px 24px}
.card.tall{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:26px 24px}
.card.row{display:flex;gap:20px;align-items:center}
.ic{width:78px;height:78px;border-radius:50%;display:grid;place-items:center;flex:none}
.card.tall .ic{width:84px;height:84px}.ic svg{width:38px;height:38px}
.card h3{font-size:26px;font-weight:800;line-height:1.3}.card p{font-size:20.5px;line-height:1.5;color:${C.muted};margin-top:6px}
.c4 .card h3{font-size:24px}.c4 .card p{font-size:19px}
.chips{display:flex;flex-wrap:wrap;gap:12px}.chip{display:inline-flex;align-items:center;gap:12px;background:#fff;border:2px solid ${C.line};border-radius:999px;padding:8px 22px 8px 9px;font-weight:700;font-size:20px;color:${C.ink}}
.chip i{width:40px;height:40px;border-radius:50%;display:grid;place-items:center}
.band{position:relative;height:240px;background:linear-gradient(125deg,${C.pressed} 0%,${C.hover} 45%,${C.primary} 100%);color:#fff;padding:54px 82px}
.band h1{font-size:50px;margin:0;max-width:1200px}.band p{font-size:25px;opacity:.88;margin-top:10px}.band svg{position:absolute;left:0;bottom:-2px;width:100%;height:90px}
.p2 .body,.p3 .body{padding-top:6px}
.p1 .body{height:1170px;justify-content:space-between}.p2 .body{height:1700px;justify-content:space-between}.p3 .body{height:1480px;justify-content:space-between}
.p3 .body{gap:22px}.p3 section{gap:14px}.p3 .card.row{padding:16px 22px}.p3 .card p{font-size:19.5px;line-height:1.45;margin-top:4px}.p3 .grid{gap:14px}.p3 .banner{padding:20px 28px}.p3 .role{padding:22px 24px 20px}.p3 .role p{font-size:19.5px;margin:6px 0 10px}.p3 .chips{gap:10px}
.safe,.banner{display:flex;gap:26px;align-items:center;border-radius:28px;padding:26px 32px;border:2px solid ${C.sprout};background:linear-gradient(120deg,${C.mint},#EAF7F0)}
.safe h3,.banner h3{font-size:28px;font-weight:800;color:${C.pressed}}.safe p,.banner p{font-size:21px;line-height:1.55;color:${C.muted};margin-top:6px}
.safe .ic,.banner .ic{width:96px;height:96px;box-shadow:0 4px 14px rgba(16,40,43,.12)}
.trust{background:linear-gradient(120deg,${C.pressed},${C.hover});color:#fff;border-radius:30px;padding:30px 36px}
.trust h3{font-size:32px;font-weight:800;margin-bottom:18px}.tg{display:grid;grid-template-columns:1fr 1fr;gap:20px 36px}
.ti{display:flex;gap:18px;align-items:flex-start}.ti i{width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.16);display:grid;place-items:center;flex:none}
.ti b{display:block;font-size:23px}.ti span{font-size:19px;opacity:.85;line-height:1.5}
.roles{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.role{position:relative;background:#fff;border-radius:26px;padding:28px 26px 24px;box-shadow:0 4px 18px rgba(16,40,43,.09);border:2px solid transparent}
.role.first{border-color:${C.sun};background:#FFF8EA}
.role em{position:absolute;right:22px;top:-16px;background:${C.sun};color:${C.ink};font-style:normal;font-weight:800;font-size:20px;padding:6px 18px;border-radius:999px}
.role h3{font-size:30px;font-weight:800;color:${C.pressed}}.role p{font-size:20.5px;line-height:1.5;color:${C.muted};margin:8px 0 12px}
.tag{display:inline-block;background:${C.mint};color:${C.hover};font-weight:700;font-size:18px;padding:6px 16px;border-radius:999px}
.foot{position:absolute;left:0;right:0;bottom:0;height:250px;background:linear-gradient(125deg,${C.pressed},${C.primary});color:#fff;display:flex;align-items:center;gap:26px;padding:26px 82px 56px;border-top-left-radius:90px 40px;border-top-right-radius:90px 40px;flex-wrap:wrap}
.foot .logo{width:100px;height:100px}.foot b{display:block;font-size:44px}.foot span{font-size:28px;opacity:.92}
.foot .cta{margin:0 0 0 auto;font-size:30px;padding:20px 48px}.foot small{position:absolute;left:82px;right:82px;bottom:16px;font-size:16px;opacity:.78;line-height:1.4}
.pn{position:absolute;right:82px;bottom:26px;font-size:21px;color:${C.muted}}.pn3{color:rgba(255,255,255,.85);bottom:auto;top:1736px;display:none}
`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
for (const [L, code] of [[TH, "th"], [EN, "en"]]) {
  const html = `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><title>Tonkla ${code}</title><style>${CSS}</style></head><body>${page1(L, `${SHOTS}/app-home-th.png`)}${page2(L)}${page3(L)}</body></html>`;
  const htmlPath = `${OUT}/tonkla-infographic-${code}.html`;
  writeFileSync(htmlPath, html);
  const page = await browser.newPage({ viewport: { width: 1414, height: 2000 }, deviceScaleFactor: 2 });
  await page.goto(`file://${resolve(htmlPath)}`);
  await page.evaluate(() => document.fonts.ready);
  const pages = await page.locator(".page").all();
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `${OUT}/tonkla-infographic-${code}-${i + 1}.png` });
  await page.pdf({ path: `${OUT}/tonkla-infographic-${code}.pdf`, width: "1414px", height: "2000px", printBackground: true, preferCSSPageSize: true });
  // overflow check: any page whose content runs beyond 2000px is reported
  const over = await page.evaluate(() => [...document.querySelectorAll(".page")].map((p, i) => [i + 1, Math.round(p.querySelector(".body").getBoundingClientRect().bottom - p.getBoundingClientRect().top), p.querySelector(".foot") ? 1750 : 2000]));
  console.log(code, "body bottom vs limit:", JSON.stringify(over));
  await page.close();
}
await browser.close();
