// Seats the FIRST platform administrator (there is no "become admin" page). Run once after that person has signed in.
//   node scripts/grant-admin.mjs <email> [--owner]
// --owner also records the e-mail as the protected owner account (admin rights can never be removed from it).
// Uses the Supabase Management API like db-migrate.mjs (token injected by the proxy or SUPABASE_ACCESS_TOKEN).
const REF = process.env.SUPABASE_PROJECT_REF || "yfowqsfyfvzgwqdbkykx";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const email = (process.argv[2] || "").trim().toLowerCase();
const owner = process.argv.includes("--owner");
if (!/^[^@\s'";]+@[^@\s'";]+\.[^@\s'";]+$/.test(email)) {
  console.error("usage: node scripts/grant-admin.mjs <email> [--owner]");
  process.exit(1);
}
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
const rows = await sql(`select id from auth.users where lower(email) = '${email}' and email_confirmed_at is not null`);
if (rows.length !== 1) {
  console.error("No confirmed account with that e-mail. The person must sign in once first.");
  process.exit(2);
}
await sql(`insert into public.profiles (id) values ('${rows[0].id}') on conflict (id) do nothing;
  update public.profiles set status = 'active' where id = '${rows[0].id}';
  insert into public.platform_admins (user_id) values ('${rows[0].id}') on conflict do nothing;
  ${owner ? `insert into public.platform_settings (key, value) values ('owner', jsonb_build_object('email', '${email}')) on conflict (key) do update set value = excluded.value;` : ""}`);
console.log(`administrator seated${owner ? " (owner)" : ""}`);
