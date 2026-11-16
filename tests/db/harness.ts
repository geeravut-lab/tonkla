import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Stand-ins for what Supabase provides (auth schema, roles, default grants).
const SUPABASE_SHIM = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb not null default '{}'::jsonb, raw_user_meta_data jsonb not null default '{}'::jsonb, email_confirmed_at timestamptz, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant select on auth.users to service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export type Db = Awaited<ReturnType<typeof createDb>>;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }

  /** Run `fn` as the given user (null = anon) through the same role switch PostgREST uses. */
  async function as<T>(user: string | null, fn: (q: PGlite["query"]) => Promise<T>): Promise<T> {
    const role = user ? "authenticated" : "anon";
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated" } : { role: "anon" })]);
      const out = await fn(db.query.bind(db) as PGlite["query"]);
      await db.exec("rollback");
      return out;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  }

  /** Same as `as`, but commits (for setup that later steps read). */
  async function asCommit<T>(user: string | null, fn: (q: PGlite["query"]) => Promise<T>): Promise<T> {
    const role = user ? "authenticated" : "anon";
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated" } : { role: "anon" })]);
      const out = await fn(db.query.bind(db) as PGlite["query"]);
      await db.exec("commit");
      return out;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  }

  /** Setup as the table owner (bypasses RLS) – what the service role does. */
  async function admin<T>(fn: (q: PGlite["query"]) => Promise<T>): Promise<T> {
    return fn(db.query.bind(db) as PGlite["query"]);
  }

  async function addUser(id: string, email = `${id}@example.test`) {
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()) on conflict do nothing", [id, email]);
  }

  /** Expect a statement to be rejected (permission denied / RLS violation / constraint). */
  async function denied(user: string | null, sql: string, params: unknown[] = []): Promise<string> {
    try {
      await as(user, async (q) => q(sql, params));
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error(`expected statement to be rejected: ${sql}`);
  }

  return { db, as, asCommit, admin, addUser, denied };
}
