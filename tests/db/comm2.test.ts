import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { A, B, seedOrg, U } from "./seed";

let h: Db;
const soon = () => new Date(Date.now() + 86_400_000).toISOString();
const rows = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.as(user, async (q) => (await q<T>(sql, params)).rows);
const call = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => h.asCommit(user, async (q) => (await q<T>(sql, params)).rows);

beforeAll(async () => {
  h = await createDb();
  await seedOrg(h);
});

describe("emergency reports", () => {
  let id = "";
  it("a member reports for their own company only; the people who handle it are told, without the details", async () => {
    expect(await h.denied(U.alice, "select public.report_emergency($1,'safety','โรงงาน 2','ไฟไหม้',null)", [B])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.pam, "select public.report_emergency($1,'safety','x','y',null)", [A])).toMatch(/err_forbidden|permission/);
    id = (await call<{ report_emergency: string }>(U.alice, "select public.report_emergency($1,'safety','โรงงาน 2','ไฟไหม้ที่คลังสินค้า','081-234-5678')", [A]))[0]!.report_emergency;
    const notices = await h.admin((q) => q<{ user_id: string; body: string; title: string; kind: string }>("select user_id, body, title, kind from public.notifications where kind = 'emergency_new'"));
    expect(notices.rows.map((r) => r.user_id).sort()).toEqual([U.carol, U.erin].sort());
    for (const n of notices.rows) expect(n.body + n.title).not.toMatch(/ไฟไหม้|โรงงาน|081/);
  });
  it("only the reporter, the company coordinators and the central team can read it", async () => {
    expect((await rows(U.alice, "select id from public.emergency_incidents")).length).toBe(1);
    expect((await rows(U.carol, "select id from public.emergency_incidents")).length).toBe(1);
    expect((await rows(U.erin, "select id from public.emergency_incidents")).length).toBe(1);
    for (const u of [U.bob, U.dave, U.gina, U.frank]) expect((await rows(u, "select id from public.emergency_incidents")).length, u).toBe(0);
    expect((await rows(U.bob, "select id from public.emergency_events")).length).toBe(0);
  });
  it("only coordinators can change the status; the reporter is told", async () => {
    expect(await h.denied(U.alice, "select public.emergency_set_status($1,'resolved','')", [id])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.bob, "select public.emergency_set_status($1,'resolved','')", [id])).toMatch(/err_forbidden|permission/);
    await call(U.carol, "select public.emergency_set_status($1,'acknowledged','กำลังไปที่เกิดเหตุ')", [id]);
    expect((await rows<{ status: string; handled_by: string }>(U.alice, "select status, handled_by from public.emergency_incidents"))[0]).toMatchObject({ status: "acknowledged", handled_by: U.carol });
    const n = await h.admin((q) => q<{ user_id: string }>("select user_id from public.notifications where kind = 'emergency_update'"));
    expect(n.rows.map((r) => r.user_id)).toEqual([U.alice]);
  });
  it("notes work both ways between the reporter and the handlers, and nobody else", async () => {
    await call(U.alice, "select public.emergency_add_note($1,'ผู้บาดเจ็บ 1 คน')", [id]);
    await call(U.carol, "select public.emergency_add_note($1,'เรียกรถพยาบาลแล้ว')", [id]);
    expect((await rows(U.alice, "select id from public.emergency_events where kind = 'note'")).length).toBe(3);
    expect(await h.denied(U.bob, "select public.emergency_add_note($1,'x')", [id])).toMatch(/err_not_found/);
  });
  it("an unattended emergency reaches the central team once after 10 minutes; an acknowledged one does not", async () => {
    const two = (await call<{ report_emergency: string }>(U.alice, "select public.report_emergency($1,'health','อาคาร B','เป็นลม',null)", [A]))[0]!.report_emergency;
    expect((await h.admin((q) => q<{ n: number }>("select public.run_emergency_escalation() as n"))).rows[0]!.n).toBe(0);
    await h.admin((q) => q("update public.emergency_incidents set created_at = now() - interval '11 minutes' where id = $1 or id = $2", [id, two]));
    expect((await h.admin((q) => q<{ n: number }>("select public.run_emergency_escalation() as n"))).rows[0]!.n).toBe(1); // `id` was acknowledged
    expect((await h.admin((q) => q<{ n: number }>("select public.run_emergency_escalation() as n"))).rows[0]!.n).toBe(0);
    const n = await h.admin((q) => q<{ user_id: string }>("select user_id from public.notifications where kind = 'emergency_escalated'"));
    expect(n.rows.map((r) => r.user_id)).toEqual([U.erin]);
  });
  it("a person cannot flood the channel", async () => {
    for (let i = 0; i < 3; i++) await call(U.alice, "select public.report_emergency($1,'other','a','b',null)", [A]);
    expect(await h.denied(U.alice, "select public.report_emergency($1,'other','a','b',null)", [A])).toMatch(/err_too_many/);
  });
  it("urgent notices skip the person's own work-notification preference for LINE", async () => {
    expect((await h.admin((q) => q<{ g: string }>("select app.kind_group('emergency_new') g"))).rows[0]!.g).toBe("urgent");
  });
});

describe("Q&A", () => {
  let s = "";
  let q1 = "";
  it("hosts: the central team for the whole group, coordinators and executives for their company", async () => {
    expect(await h.denied(U.alice, "select public.qa_create_session(null,'ถามผู้บริหาร','',$1)", [soon()])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.carol, "select public.qa_create_session(null,'ถามผู้บริหาร','',$1)", [soon()])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.carol, "select public.qa_create_session($1,'x y z','',$2)", [B, soon()])).toMatch(/err_forbidden|permission/);
    s = (await call<{ qa_create_session: string }>(U.erin, "select public.qa_create_session(null,'ถามผู้บริหารกลุ่ม','',$1)", [soon()]))[0]!.qa_create_session;
    expect((await call(U.gina, "select public.qa_create_session($1,'ถามผู้บริหารบริษัท A','',$2)", [A, soon()])).length).toBe(1);
  });
  it("sessions follow the scope: group-wide for everyone, company ones for that company", async () => {
    expect((await rows(U.alice, "select id from public.qa_sessions")).length).toBe(2);
    expect((await rows(U.bob, "select id from public.qa_sessions")).length).toBe(1);
    expect((await rows(U.pam, "select id from public.qa_sessions")).length).toBe(0);
  });
  it("a hidden name stays hidden from colleagues but not from the hosts or the asker", async () => {
    q1 = (await call<{ qa_ask: string }>(U.alice, "select public.qa_ask($1,'ทำไมโบนัสปีนี้ลดลง',true)", [s]))[0]!.qa_ask;
    await call(U.bob, "select public.qa_ask($1,'จะมีสวัสดิการใหม่ไหม',false)", [s]);
    const asBob = await rows<{ body: string; asker: string | null }>(U.bob, "select body, asker from public.qa_list($1)", [s]);
    expect(asBob.find((r) => r.body.includes("โบนัส"))!.asker).toBeNull();
    expect(asBob.find((r) => r.body.includes("สวัสดิการ"))!.asker).not.toBeNull();
    expect((await rows<{ asker: string | null }>(U.alice, "select asker from public.qa_list($1) where body like '%โบนัส%'", [s]))[0]!.asker).not.toBeNull();
    expect((await rows<{ asker: string | null }>(U.erin, "select asker from public.qa_list($1) where body like '%โบนัส%'", [s]))[0]!.asker).not.toBeNull();
    // the table itself never shows another person's question
    expect((await rows(U.bob, "select id from public.qa_questions")).length).toBe(1);
  });
  it("one vote per person that can be taken back; votes are private", async () => {
    expect((await call<{ qa_vote: boolean }>(U.dave, "select public.qa_vote($1)", [q1]))[0]!.qa_vote).toBe(true);
    await call(U.bob, "select public.qa_vote($1)", [q1]);
    expect((await rows<{ votes: number; voted: boolean }>(U.dave, "select votes, voted from public.qa_list($1) where id = $2", [s, q1]))[0]).toEqual({ votes: 2, voted: true });
    expect((await call<{ qa_vote: boolean }>(U.dave, "select public.qa_vote($1)", [q1]))[0]!.qa_vote).toBe(false);
    expect((await rows(U.bob, "select * from public.qa_votes")).length).toBe(1);
  });
  it("only hosts answer or hide; the asker is told of an answer; hidden questions leave the public list", async () => {
    expect(await h.denied(U.alice, "select public.qa_answer($1,'x')", [q1])).toMatch(/err_forbidden|permission/);
    await call(U.erin, "select public.qa_answer($1,'โบนัสเป็นไปตามผลประกอบการ')", [q1]);
    expect((await h.admin((q) => q<{ user_id: string }>("select user_id from public.notifications where kind = 'qa_answered'"))).rows.map((r) => r.user_id)).toEqual([U.alice]);
    await call(U.erin, "select public.qa_hide($1,true)", [q1]);
    expect((await rows(U.bob, "select id from public.qa_list($1)", [s])).length).toBe(1);
    expect((await rows(U.erin, "select id from public.qa_list($1)", [s])).length).toBe(2);
    await call(U.erin, "select public.qa_hide($1,false)", [q1]);
    expect((await rows(U.bob, "select id from public.qa_list($1)", [s])).length).toBe(2);
  });
  it("outsiders cannot ask or read; a closed session takes no more questions; asking is limited", async () => {
    expect(await h.denied(U.pam, "select public.qa_ask($1,'อยากถาม ...',false)", [s])).toMatch(/err_not_found/);
    for (let i = 0; i < 4; i++) await call(U.alice, "select public.qa_ask($1,$2,false)", [s, `คำถามที่ ${i} ของฉัน`]);
    expect(await h.denied(U.alice, "select public.qa_ask($1,'คำถามเกินโควตา',false)", [s])).toMatch(/err_too_many/);
    expect(await h.denied(U.alice, "select public.qa_close_session($1)", [s])).toMatch(/err_forbidden|permission/);
    await call(U.erin, "select public.qa_close_session($1)", [s]);
    expect(await h.denied(U.bob, "select public.qa_ask($1,'ช้าไปแล้ว',false)", [s])).toMatch(/err_closed/);
  });
});

describe("events and RSVP", () => {
  let ev = "";
  it("hosts create events by scope; people see events of their scope with the counts only", async () => {
    expect(await h.denied(U.alice, "select public.event_create(null,'งานปีใหม่','',$1,null,'','',null)", [soon()])).toMatch(/err_forbidden|permission/);
    ev = (await call<{ event_create: string }>(U.erin, "select public.event_create(null,'งานปีใหม่กลุ่ม','',$1,null,'โรงแรม','https://example.com/e',2)", [soon()]))[0]!.event_create;
    await call(U.carol, "select public.event_create($1,'อบรมความปลอดภัย','',$2,null,'ห้องประชุม','',null)", [A, soon()]);
    expect((await rows(U.alice, "select id from public.events_list()")).length).toBe(2);
    expect((await rows(U.bob, "select id from public.events_list()")).length).toBe(1);
    expect(await h.denied(U.erin, "select public.event_create(null,'ลิงก์ไม่ปลอดภัย','',$1,null,'','javascript:alert(1)',null)", [soon()])).toMatch(/check constraint|violates/);
  });
  it("RSVP can be changed; capacity is enforced; guests are listed to hosts only", async () => {
    await call(U.alice, "select public.event_rsvp($1,'going')", [ev]);
    await call(U.bob, "select public.event_rsvp($1,'going')", [ev]);
    expect(await h.denied(U.dave, "select public.event_rsvp($1,'going')", [ev])).toMatch(/err_event_full/);
    await call(U.dave, "select public.event_rsvp($1,'maybe')", [ev]);
    await call(U.alice, "select public.event_rsvp($1,'going')", [ev]); // saying the same again is fine when already going
    await call(U.bob, "select public.event_rsvp($1,'no')", [ev]);
    await call(U.dave, "select public.event_rsvp($1,'going')", [ev]);
    const l = (await rows<{ going: number; maybe: number; mine: string }>(U.alice, "select going, maybe, mine from public.events_list() where id = $1", [ev]))[0]!;
    expect(l).toEqual({ going: 2, maybe: 0, mine: "going" });
    expect((await rows(U.erin, "select * from public.event_guests($1)", [ev])).length).toBe(3);
    expect(await h.denied(U.alice, "select * from public.event_guests($1)", [ev])).toMatch(/err_forbidden|permission/);
    expect((await rows(U.alice, "select * from public.event_rsvps")).length).toBe(1); // only your own answer
    expect(await h.denied(U.pam, "select public.event_rsvp($1,'going')", [ev])).toMatch(/err_not_found/);
  });
  it("cancelling tells the people who said going or maybe, once", async () => {
    expect(await h.denied(U.alice, "select public.event_cancel($1)", [ev])).toMatch(/err_forbidden|permission/);
    expect((await call<{ event_cancel: number }>(U.erin, "select public.event_cancel($1)", [ev]))[0]!.event_cancel).toBe(2);
    expect((await call<{ event_cancel: number }>(U.erin, "select public.event_cancel($1)", [ev]))[0]!.event_cancel).toBe(0);
    expect(await h.denied(U.bob, "select public.event_rsvp($1,'going')", [ev])).toMatch(/err_closed/);
  });
});

describe("polls", () => {
  let p = "";
  let opts: { id: string; label: string }[] = [];
  it("hosts create a poll with 2–10 options", async () => {
    expect(await h.denied(U.alice, "select public.poll_create(null,'อาหารกลางวัน',array['ก','ข'],false,'after_vote',$1)", [soon()])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.erin, "select public.poll_create(null,'ตัวเลือกเดียว',array['ก'],false,'after_vote',$1)", [soon()])).toMatch(/err_invalid_input/);
    p = (await call<{ poll_create: string }>(U.erin, "select public.poll_create(null,'วันหยุดเพิ่มวันไหน',array['ศุกร์','เสาร์','จันทร์'],false,'after_vote',$1)", [soon()]))[0]!.poll_create;
    opts = await rows<{ id: string; label: string }>(U.alice, "select id, label from public.poll_options where poll_id = $1 order by pos", [p]);
    expect(opts.map((o) => o.label)).toEqual(["ศุกร์", "เสาร์", "จันทร์"]);
    expect((await rows(U.pam, "select id from public.poll_options")).length).toBe(0);
  });
  it("results stay hidden until you voted (or the poll closed); one ballot per person; single choice means one option", async () => {
    expect(await h.denied(U.alice, "select * from public.poll_results($1)", [p])).toMatch(/err_forbidden|permission/);
    expect(await h.denied(U.alice, "select public.poll_vote($1, $2::uuid[])", [p, [opts[0]!.id, opts[1]!.id]])).toMatch(/err_invalid_input/);
    await call(U.alice, "select public.poll_vote($1, $2::uuid[])", [p, [opts[0]!.id]]);
    expect(await h.denied(U.alice, "select public.poll_vote($1, $2::uuid[])", [p, [opts[1]!.id]])).toMatch(/err_already_done/);
    await call(U.bob, "select public.poll_vote($1, $2::uuid[])", [p, [opts[0]!.id]]);
    await call(U.dave, "select public.poll_vote($1, $2::uuid[])", [p, [opts[2]!.id]]);
    const r = await rows<{ label: string; votes: number; voters: number }>(U.alice, "select label, votes, voters from public.poll_results($1)", [p]);
    expect(r.map((x) => x.votes)).toEqual([2, 0, 1]);
    expect(r[0]!.voters).toBe(3);
  });
  it("nobody can see how another person voted, not even hosts or admins", async () => {
    for (const u of [U.carol, U.erin, U.frank, U.bob]) expect((await rows<{ user_id: string }>(u, "select user_id from public.poll_votes")).every((x) => x.user_id === u), u).toBe(true);
    expect(await h.denied(U.pam, "select public.poll_vote($1, $2::uuid[])", [p, [opts[0]!.id]])).toMatch(/err_not_found/);
  });
  it("an option of another poll is refused; a closed poll takes no votes; after_close polls show results only when closed", async () => {
    const q = (await call<{ poll_create: string }>(U.erin, "select public.poll_create(null,'เลือกสี',array['แดง','เขียว'],true,'after_close',$1)", [soon()]))[0]!.poll_create;
    const qo = await rows<{ id: string }>(U.alice, "select id from public.poll_options where poll_id = $1 order by pos", [q]);
    expect(await h.denied(U.alice, "select public.poll_vote($1, $2::uuid[])", [q, [opts[0]!.id]])).toMatch(/err_invalid_input/);
    await call(U.alice, "select public.poll_vote($1, $2::uuid[])", [q, [qo[0]!.id, qo[1]!.id]]);
    expect(await h.denied(U.alice, "select * from public.poll_results($1)", [q])).toMatch(/err_forbidden|permission/);
    expect((await rows(U.erin, "select * from public.poll_results($1)", [q])).length).toBe(2); // hosts always
    await call(U.erin, "select public.poll_close($1)", [q]);
    expect((await rows(U.alice, "select * from public.poll_results($1)", [q])).length).toBe(2);
    expect(await h.denied(U.bob, "select public.poll_vote($1, $2::uuid[])", [q, [qo[0]!.id]])).toMatch(/err_closed/);
    expect(await h.denied(U.alice, "select public.poll_close($1)", [p])).toMatch(/err_forbidden|permission/);
  });
  it("a poll of one company is invisible to other companies", async () => {
    await call(U.carol, "select public.poll_create($1,'ภายในบริษัท A',array['ใช่','ไม่'],false,'after_vote',$2)", [A, soon()]);
    expect((await rows(U.bob, "select id from public.polls where company_id is not null")).length).toBe(0);
    expect((await rows(U.alice, "select id from public.polls where company_id is not null")).length).toBe(1);
  });
});
