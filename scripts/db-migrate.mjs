// Applies supabase/migrations/*.sql to the Supabase project through the Management API.
// Tracks versions in supabase_migrations.schema_migrations (same table the Supabase CLI uses).
// The API token is injected by the network proxy in the agent environment, or taken from
// SUPABASE_ACCESS_TOKEN when run elsewhere. Never commit a token.
import { readdirSync, readFileSync } from "node:fs";

const REF = process.env.SUPABASE_PROJECT_REF || "yfowqsfyfvzgwqdbkykx";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DRY = process.argv.includes("--dry-run");

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

await sql(`create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);`);
const applied = new Set((await sql("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
let ran = 0;
for (const f of files) {
  const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
  if (applied.has(version)) continue;
  console.log(`${DRY ? "would apply" : "applying"} ${f}`);
  if (DRY) continue;
  const body = readFileSync(`supabase/migrations/${f}`, "utf8");
  const name = rest.join("_").replace(/'/g, "''");
  await sql(`begin;\n${body}\n;insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');\ncommit;`);
  ran += 1;
}
console.log(ran ? `done: ${ran} migration(s) applied` : "nothing to apply");
