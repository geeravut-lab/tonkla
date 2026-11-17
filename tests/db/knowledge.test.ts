import { beforeAll, describe, expect, it } from "vitest";
import { createDb, UUID, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

let h: Db;
const CAT = UUID(601);
const rows = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.as(user, async (q) => (await q<T>(sql, params)).rows);
const call = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.asCommit(user, async (q) => (await q<T>(sql, params)).rows);
const doc = (user: string, company: string | null, title = "ระเบียบการลา") =>
  call<{ kb_save: string }>(user, "select public.kb_save(null,$1,'policy',$2,'',$3,'')", [company, title, "https://example.com/policy"]).then((r) => r[0]!.kb_save);

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
  await h.admin((q) => q("insert into public.report_categories (id, company_id, key, name_th) values ($1,$2,'equipment','อุปกรณ์')", [CAT, A]));
});

describe("knowledge documents", () => {
  it("the central team writes for the whole group; coordinators and executives for their company; staff cannot write", async () => {
    expect(await h.denied(U.alice, "select public.kb_save(null,$1,'policy','ระเบียบ','', 'https://x.example/a','')", [A])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.carol, "select public.kb_save(null,null,'policy','ระเบียบกลุ่ม','', 'https://x.example/a','')")).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.carol, "select public.kb_save(null,$1,'policy','ของบริษัท B','', 'https://x.example/a','')", [B])).toMatch(/err_forbidden|permission/);
    await doc(U.erin, null, "จรรยาบรรณกลุ่ม");
    await doc(U.carol, A, "คู่มือคลังสินค้า A");
    await doc(U.gina, A, "ระเบียบการลา A");
    await doc(U.erin, B, "นโยบายบริษัท B");
  });
  it("people see the group's documents and their own company's only", async () => {
    const t = (u: string) => rows<{ title: string }>(u, "select title from public.kb_documents order by title").then((r) => r.map((x) => x.title));
    expect((await t(U.alice)).sort()).toEqual(["คู่มือคลังสินค้า A", "จรรยาบรรณกลุ่ม", "ระเบียบการลา A"].sort());
    expect(await t(U.bob)).toEqual(["จรรยาบรรณกลุ่ม", "นโยบายบริษัท B"].sort());
    expect(await t(U.pam)).toEqual([]);
  });
  it("a document needs a link or a text; links must be https", async () => {
    expect(await h.denied(U.carol, "select public.kb_save(null,$1,'form','ว่างเปล่า','','','')", [A])).toMatch(/check|violates/);
    expect(await h.denied(U.carol, "select public.kb_save(null,$1,'form','ลิงก์อันตราย','','javascript:alert(1)','')", [A])).toMatch(/check|violates/);
    expect((await call(U.carol, "select public.kb_save(null,$1,'manual','คู่มือแบบข้อความ','','','ขั้นตอนที่ 1')", [A])).length).toBe(1);
  });
  it("editing bumps the version and never moves a document to another scope; archived ones leave the readers' view", async () => {
    const id = await doc(U.carol, A, "ฟอร์มเบิก");
    await call(U.carol, "select public.kb_save($1,$2,'form','ฟอร์มเบิกวัสดุ','','https://example.com/f','')", [id, A]);
    expect((await rows<{ version: number; title: string }>(U.alice, "select version, title from public.kb_documents where id = $1", [id]))[0]).toEqual({ version: 2, title: "ฟอร์มเบิกวัสดุ" });
    expect(await h.denied(U.carol, "select public.kb_save($1,null,'form','ย้ายไปกลุ่ม','','https://example.com/f','')", [id])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.alice, "select public.kb_set_status($1,'archived')", [id])).toMatch(/err_forbidden|permission/);
    await call(U.carol, "select public.kb_set_status($1,'archived')", [id]);
    expect((await rows(U.alice, "select id from public.kb_documents where id = $1", [id])).length).toBe(0);
    expect((await rows(U.carol, "select id from public.kb_documents where id = $1", [id])).length).toBe(1);
  });
});

describe("best practices from solved reports", () => {
  let rep = "";
  it("a resolved report with a real resolution note becomes a practice with only the lesson, never the description or the people", async () => {
    rep = crypto.randomUUID();
    await call(U.alice, "select public.submit_report($1,$2,$3,'high','เครื่องจักรสายพานหยุดบ่อย','รายละเอียดที่ไม่ควรถูกคัดลอก ชื่อคุณสมชาย','','')", [rep, A, CAT]);
    await call(U.carol, "select public.report_transition($1,'acknowledged','รับเรื่อง')", [rep]);
    expect((await h.admin((q) => q("select id from public.best_practices"))).rows.length).toBe(0);
    await call(U.carol, "select public.report_transition($1,'resolved','เปลี่ยนสายพานและตั้งรอบตรวจทุกเดือน')", [rep]);
    const p = (await h.admin((q) => q<{ title: string; solution: string; category_key: string; visibility: string }>("select title, solution, category_key, visibility from public.best_practices"))).rows;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ title: "เครื่องจักรสายพานหยุดบ่อย", solution: "เปลี่ยนสายพานและตั้งรอบตรวจทุกเดือน", category_key: "equipment", visibility: "company" });
    expect(JSON.stringify(p)).not.toMatch(/สมชาย|ไม่ควรถูกคัดลอก/);
    const cols = (await h.db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'best_practices'")).rows.map((c) => c.column_name);
    for (const banned of ["submitter_id", "description", "owner_id"]) expect(cols).not.toContain(banned);
  });
  it("closing afterwards does not write a second one; a refused or too-short report writes none", async () => {
    await call(U.carol, "select public.report_transition($1,'closed','ปิดงาน ตรวจแล้ว')", [rep]);
    expect((await h.admin((q) => q("select id from public.best_practices"))).rows.length).toBe(1);
    const short = crypto.randomUUID();
    await call(U.alice, "select public.submit_report($1,$2,$3,'low','เรื่องเล็ก','','','')", [short, A, CAT]);
    await call(U.carol, "select public.report_transition($1,'resolved','เสร็จ')", [short]);
    const no = crypto.randomUUID();
    await call(U.alice, "select public.submit_report($1,$2,$3,'low','เรื่องที่ปฏิเสธ','','','')", [no, A, CAT]);
    await call(U.carol, "select public.report_transition($1,'declined','ไม่อยู่ในขอบเขตของระบบนี้ครับ')", [no]);
    expect((await h.admin((q) => q("select id from public.best_practices"))).rows.length).toBe(1);
  });
  it("company members and coordinators read it; other companies do not until a coordinator shares it with the group", async () => {
    expect((await rows(U.dave, "select id from public.best_practices")).length).toBe(1);
    expect((await rows(U.bob, "select id from public.best_practices")).length).toBe(0);
    const id = (await rows<{ id: string }>(U.carol, "select id from public.best_practices"))[0]!.id;
    expect(await h.denied(U.alice, "select public.practice_share($1,true)", [id])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.bob, "select public.practice_share($1,true)", [id])).toMatch(/err_forbidden|permission/);
    await call(U.carol, "select public.practice_edit($1,'แก้ปัญหาสายพานหยุดบ่อย','เปลี่ยนสายพานและตั้งรอบตรวจทุกเดือน (ลดเวลาหยุด 40%)')", [id]);
    await call(U.carol, "select public.practice_share($1,true)", [id]);
    expect((await rows<{ title: string }>(U.bob, "select title from public.best_practices"))[0]!.title).toBe("แก้ปัญหาสายพานหยุดบ่อย");
    await call(U.carol, "select public.practice_share($1,false)", [id]);
    expect((await rows(U.bob, "select id from public.best_practices")).length).toBe(0);
    expect(await h.denied(U.pam, "select public.practice_edit($1,'abc','abcdefghijk')", [id])).toMatch(/err_forbidden|permission|err_not/);
  });
});
