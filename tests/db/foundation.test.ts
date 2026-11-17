import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";

let h: Db;
beforeAll(async () => {
  h = await createDb();
  await h.addUser(UUID(1));
});

describe("foundation", () => {
  it("every table in public has row level security enabled", async () => {
    const r = await h.db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });

  it("platform_settings is invisible to browser clients (anon and authenticated)", async () => {
    await h.admin((q) => q("insert into public.platform_settings (key, value) values ('brand', '{}')"));
    expect(await h.denied(null, "select * from public.platform_settings")).toMatch(/permission denied/);
    expect(await h.denied(UUID(1), "select * from public.platform_settings")).toMatch(/permission denied/);
    expect(await h.denied(UUID(1), "insert into public.platform_settings (key) values ('x')")).toMatch(/permission denied/);
    expect(await h.denied(UUID(1), "update public.platform_settings set value = '{}'")).toMatch(/permission denied/);
  });
});
