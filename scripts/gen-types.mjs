// Regenerates src/lib/database.types.ts from the live schema (run after every migration).
import { writeFileSync } from "node:fs";
const REF = process.env.SUPABASE_PROJECT_REF || "yfowqsfyfvzgwqdbkykx";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/types/typescript?included_schemas=public`, {
  headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
});
if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
const { types } = await res.json();
writeFileSync("src/lib/database.types.ts", types);
console.log("wrote src/lib/database.types.ts", types.length, "bytes");
