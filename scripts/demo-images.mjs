// Draws the illustrative pictures attached to the demo reports (no real photos, no real data). Output: PNG files in the given folder.
//   node scripts/demo-images.mjs /tmp/tonkla-demo-images
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const out = process.argv[2] || "/tmp/tonkla-demo-images";
mkdirSync(out, { recursive: true });

const SCENES = {
  belt: { title: "สายพานลำเลียงสะดุด", sub: "ไลน์ผลิต 2", bg: "#2b3a42", accent: "#ffb84d", art: `<rect x="40" y="250" width="720" height="44" rx="22" fill="#55656d"/><g fill="#8aa0a8">${[80,160,240,320,400,480,560,640,720].map((x)=>`<circle cx="${x}" cy="272" r="14"/>`).join("")}</g><rect x="300" y="190" width="90" height="60" rx="8" fill="#ffb84d"/><rect x="420" y="170" width="90" height="80" rx="8" fill="#e8d9b5"/><path d="M520 140 l60 -40 l20 30 l-40 50z" fill="#b42318"/><text x="40" y="150" fill="#ffb84d" font-size="26">⚠ กล่องติดที่รอยต่อสายพาน</text>` },
  wetfloor: { title: "พื้นโรงอาหารลื่น", sub: "หลังฝนตก", bg: "#3b4e5a", accent: "#ffd34d", art: `<rect x="0" y="230" width="800" height="170" fill="#7f9aa8"/><ellipse cx="420" cy="320" rx="230" ry="46" fill="#a7c2cf" opacity=".8"/><polygon points="340,110 420,110 470,260 290,260" fill="#ffd34d"/><text x="350" y="200" fill="#10282b" font-size="28" font-weight="700">ระวัง</text><text x="40" y="120" fill="#ffd34d" font-size="26">⚠ น้ำขังหน้าประตูทางเข้า</text>` },
  seal: { title: "เครื่องซีลฝารั่ว", sub: "แพ็คเกจจิ้ง สายการผลิต A", bg: "#34404a", accent: "#5bc98f", art: `<rect x="150" y="120" width="500" height="170" rx="14" fill="#5d6f7a"/><rect x="190" y="160" width="140" height="90" rx="8" fill="#1f2b33"/><rect x="470" y="150" width="140" height="110" rx="8" fill="#8aa0a8"/><path d="M400 290 q10 40 0 70 q-10 -30 0 -70z" fill="#5bc98f"/><text x="40" y="90" fill="#5bc98f" font-size="26">⚠ ของเหลวรั่วที่แท่นซีล</text>` },
  shelf: { title: "ชั้นวางสินค้าเอียง", sub: "โซนเครื่องดื่ม สาขาหลัก", bg: "#40424e", accent: "#ff8a65", art: `<g transform="rotate(-6 400 200)"><rect x="140" y="90" width="520" height="14" fill="#9aa5b1"/><rect x="140" y="190" width="520" height="14" fill="#9aa5b1"/><rect x="140" y="290" width="520" height="14" fill="#9aa5b1"/>${[160,230,300,370,440,510,580].map((x,i)=>`<rect x="${x}" y="${i%2?125:125}" width="48" height="65" rx="8" fill="${["#ff8a65","#4fc3f7","#aed581","#ffd54f"][i%4]}"/>`).join("")}</g><text x="40" y="60" fill="#ff8a65" font-size="26">⚠ ชั้นเอียง สินค้าเสี่ยงหล่น</text>` },
  forklift: { title: "ไฟเบรกรถโฟล์คลิฟท์ไม่ติด", sub: "คลังสินค้า รอบกลางคืน", bg: "#2f3b36", accent: "#ff5252", art: `<rect x="250" y="190" width="240" height="90" rx="12" fill="#f4b400"/><rect x="300" y="130" width="120" height="70" rx="10" fill="#f4b400"/><rect x="500" y="100" width="14" height="200" fill="#9aa5b1"/><rect x="514" y="250" width="110" height="10" fill="#9aa5b1"/><circle cx="300" cy="290" r="30" fill="#212121"/><circle cx="440" cy="290" r="30" fill="#212121"/><circle cx="262" cy="215" r="14" fill="#555"/><text x="40" y="90" fill="#ff5252" font-size="26">⚠ ไฟเบรกดับ ทัศนวิสัยต่ำ</text>` },
  server: { title: "ห้องเซิร์ฟเวอร์ร้อน", sub: "อุณหภูมิ 31°C ช่วงบ่าย", bg: "#26303d", accent: "#4fc3f7", art: `${[140,260,380,500].map((x)=>`<rect x="${x}" y="80" width="100" height="230" rx="8" fill="#37475a"/>${[100,140,180,220,260].map((y)=>`<rect x="${x+10}" y="${y}" width="80" height="22" rx="4" fill="#1b2430"/><circle cx="${x+78}" cy="${y+11}" r="4" fill="${y>200?"#ff5252":"#5bc98f"}"/>`).join("")}`).join("")}<text x="620" y="130" fill="#ff5252" font-size="64" font-weight="700">31°</text><text x="40" y="60" fill="#4fc3f7" font-size="26">⚠ แอร์ตัวที่ 2 ไม่เย็น</text>` },
  freezer: { title: "ตู้แช่ยาเสียงดังผิดปกติ", sub: "ห้องยา คลินิกสาขา 1", bg: "#2e4048", accent: "#80deea", art: `<rect x="250" y="90" width="300" height="230" rx="16" fill="#cfd8dc"/><rect x="270" y="110" width="260" height="190" rx="10" fill="#90a4ae"/><rect x="380" y="120" width="40" height="170" fill="#eceff1" opacity=".5"/><text x="300" y="215" fill="#10282b" font-size="46" font-weight="700">-4°C</text><text x="40" y="60" fill="#80deea" font-size="26">⚠ คอมเพรสเซอร์ส่งเสียงดัง</text>` },
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
for (const [name, s] of Object.entries(SCENES)) {
  await page.setContent(`<html><body style="margin:0;font-family:'Noto Sans Thai',sans-serif"><svg width="800" height="450" xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans Thai, Tahoma, sans-serif"><rect width="800" height="450" fill="${s.bg}"/><rect y="370" width="800" height="80" fill="#00000055"/>${s.art}<text x="40" y="410" fill="#fff" font-size="30" font-weight="700">${s.title}</text><text x="40" y="438" fill="${s.accent}" font-size="18">${s.sub} · ภาพประกอบสาธิต</text></svg></body></html>`);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("wrote", `${out}/${name}.png`);
}
await browser.close();
