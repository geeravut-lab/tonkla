// Fails when a colour literal appears outside the files allowed to hold one.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ALLOWED = new Set(["src/styles/theme.css", "src/config/brand.ts"]);
const RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\(|\bhsla?\(/;
const bad = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(name) && !ALLOWED.has(p.split(path.sep).join("/"))) {
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (RE.test(line)) bad.push(`${p}:${i + 1}: ${line.trim()}`);
        });
    }
  }
}
walk("src");
if (bad.length) {
  console.error("Colour literals found outside theme.css / brand.ts:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("check-no-hex: ok");
