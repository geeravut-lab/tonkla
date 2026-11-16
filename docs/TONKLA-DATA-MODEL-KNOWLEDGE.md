# Knowledge: Tonkla — Data model, สิทธิ์ (RLS) และรายการเทสขั้นต่ำ (ข้อเสนอรออนุมัติ)

สถานะ: **ข้อเสนอ ยังไม่มี migration** · 16 พ.ย. 2026 · อ่านคู่กับ [TONKLA-PLAN-KNOWLEDGE.md](./TONKLA-PLAN-KNOWLEDGE.md)

ชื่อคอลัมน์/ตารางในโค้ดเป็นภาษาอังกฤษ snake_case · เวลาทุกคอลัมน์ `timestamptz` (แสดงเป็นเวลาไทย) · ทุกตารางเปิด RLS · แท็ก **(1) (2) (3)** = เฟสที่สร้างตารางนั้น (ตาราง (2)/(3) **ไม่สร้าง** จนกว่าถึงเฟส ยกเว้นเจ้าของสั่ง)

---

## 1. ภาพรวมโมดูลและตาราง

```
กลุ่ม ─ business_units ─ companies ─ departments ─ (positions)
                            │
 auth.users ─ profiles ─ memberships (บริษัท/แผนก/ตำแหน่ง/หัวหน้า) ─ role_assignments
      │            └ aivora_links · notification_channels · consents
      │
      ├─ communication : announcements · announcement_audiences · announcement_receipts · announcement_comments · reactions
      ├─ reports       : report_categories · routing_rules · reports · report_events · report_attachments · report_metoo · report_comments
      ├─ ideas         : idea_types · ideas · idea_stage_events · idea_criteria · idea_scores · idea_votes · idea_comments · idea_outcomes
      ├─ notify        : notifications · notification_prefs · notification_queue · message_log · company_channels
      ├─ platform      : platform_settings · feature_flags/company_features · platform_admins · audit_log · audit_purges
      │                  product_events · automation_rules · cron_ticks · ai_settings · ai_prompt_versions · ai_usage_log
      └─ (2)(3)        : anonymous_reports · polls · events · qa_* · challenges · points_ledger · awards · kb_* · communities · idea_teams · idea_adoptions · pilot_budgets
```

---

## 2. แกนกลาง: โครงสร้างกลุ่มและตัวตน (1)

| ตาราง | คอลัมน์หลัก | หมายเหตุ |
| --- | --- | --- |
| `business_units` | `id`, `name_th`, `name_en`, `sort` | กลุ่มธุรกิจ ใช้เทียบใน dashboard |
| `companies` | `id`, `business_unit_id`, `code` (unique), `name_th`, `name_en`, `status` (`setup`/`active`/`paused`), `response_sla_hours` (ค่าเริ่มต้น 48), `template_id`, `is_demo`, `settings jsonb` | `settings` เก็บเฉพาะที่ต่างจากแม่แบบ |
| `departments` | `id`, `company_id`, `parent_id`, `name_th`, `name_en` | ตัวเลือก: บริษัทเล็กไม่ต้องมี |
| `positions` | `id`, `company_id`, `name_th`, `name_en` | ใช้เลือกกลุ่มผู้รับประกาศ |
| `profiles` | `id` (= `auth.users.id`), `display_name`, `avatar_path`, `locale` (`th`/`en`), `status` (`pending`/`active`/`suspended`), `must_change_password`, `created_at` | **ไม่เก็บอีเมลซ้ำ** (อยู่ใน `auth.users`) · ไม่เก็บเลขบัตร/วันเกิด |
| `memberships` | `id`, `user_id`, `company_id`, `department_id`, `position_id`, `supervisor_membership_id`, `employee_code`, `work_email`, `is_primary`, `status` (`active`/`ended`), `started_at`, `ended_at` | คนหนึ่งอยู่ได้หลายบริษัท · `unique(user_id, company_id)` |
| `role_assignments` | `id`, `user_id`, `role`, `scope_type` (`group`/`business_unit`/`company`/`department`), `scope_id`, `granted_by`, `granted_at` | บทบาท: `supervisor`, `coordinator`, `company_exec`, `central_team`, `group_owner` · "พนักงาน" = มี membership active (ไม่ต้องมีแถวนี้) · เขียนผ่านฟังก์ชัน SQL เท่านั้น |
| `roster_entries` | `id`, `company_id`, `work_email`, `employee_code`, `display_name`, `department_id`, `position_id`, `claimed_by`, `imported_by`, `batch_id` | รายชื่อนำเข้า CSV · ใช้จับคู่ตอนล็อกอินครั้งแรก |
| `invitations` | `id`, `company_id`, `code_hash`, `preset` (บทบาท/แผนก), `expires_at`, `used_by` | รหัสเชิญจากผู้ประสานงาน (เก็บ hash) |
| `join_requests` | `id`, `user_id`, `company_id`, `note`, `status`, `decided_by`, `decided_at` | ผู้ประสานงานอนุมัติ → สร้าง `memberships` |
| `aivora_links` | `aivora_user_id` (PK), `user_id` (unique) | ผูก LINE ผ่าน hub · **ห้ามผูกด้วยอีเมล** |
| `company_templates` | `id`, `name`, `config jsonb` | หมวดหมู่ ผู้อนุมัติ กำหนดตอบ ช่องทางแจ้งเตือนเริ่มต้น → "เพิ่มบริษัทด้วยแม่แบบ" ไม่ต้องเขียนโปรแกรม |
| `consents` | `user_id`, `kind`, `version`, `accepted_at` | PDPA (ประกาศความเป็นส่วนตัว, การแจ้งเตือน LINE) |

### ฟังก์ชันช่วยสำหรับ RLS (`security definer`, `stable`, `set search_path = ''`)

| ฟังก์ชัน | คืน | ใช้ทำอะไร |
| --- | --- | --- |
| `app.is_active()` | bool | ผู้ใช้ `profiles.status='active'` และมี membership active อย่างน้อย 1 |
| `app.my_company_ids()` | `uuid[]` | บริษัทที่ผู้ใช้เป็นสมาชิก active |
| `app.has_role(role, scope_type, scope_id)` | bool | รวมการสืบทอดขอบเขต (บทบาทระดับกลุ่มครอบคลุมทุกบริษัท) |
| `app.is_coordinator(company_id)` | bool | ผู้ประสานงานของบริษัทนั้น หรือ `central_team`/`group_owner` |
| `app.is_supervisor_of(user_id)` | bool | เป็นหัวหน้าตามสายใน `memberships` |
| `app.is_central()` | bool | `central_team` หรือ `group_owner` |
| `app.is_platform_admin()` | bool | มีแถวใน `platform_admins` |
| `app.can_see_report(report_id)` | bool | รวมกฎ §4 ของรายงาน |

ทุก policy เรียกฟังก์ชันเหล่านี้ด้วย `(select app.fn())` (ให้ Postgres แคชต่อ query) — ไม่เขียน subquery สิทธิ์ซ้ำเอง

---

## 3. การสื่อสาร (1)

| ตาราง | คอลัมน์หลัก | หมายเหตุ |
| --- | --- | --- |
| `announcements` | `id`, `author_id`, `company_id` (null = ระดับกลุ่ม), `kind` (`news`/`exec_message`/`success_story`/`must_read`), `title`, `body` (markdown ที่ sanitize), `requires_ack`, `ack_due_at`, `publish_at`, `expires_at`, `status` (`draft`/`published`/`archived`), `pinned` | เขียนระดับกลุ่มได้เฉพาะ `central_team`/`group_owner` · ระดับบริษัทโดย `coordinator`/`company_exec` |
| `announcement_audiences` | `announcement_id`, `audience_type` (`group`/`business_unit`/`company`/`department`/`position`), `target_id` | ผู้รับ = union ของแถวทั้งหมด |
| `announcement_receipts` | `announcement_id`, `user_id`, `delivered_at`, `read_at`, `acked_at` | **สร้างตอนเผยแพร่** (fan-out ≤ ~600 คน) เพื่อรายงาน "ใครยังไม่อ่าน" · คนที่เข้าร่วมทีหลังได้แถวเมื่อเข้าร่วม (ประกาศที่ยังไม่หมดอายุ) |
| `announcement_comments` | `id`, `announcement_id`, `author_id`, `body`, `created_at`, `deleted_at` | ตารางความเห็นแยกต่อประเภท (ไม่ใช้ polymorphic เพื่อให้ RLS เรียบง่ายและเร็ว) |
| `reactions` | `entity_type`, `entity_id`, `user_id`, `kind` (`like`) | unique ทั้งสามคอลัมน์แรก+user |
| (2) `polls`, `poll_options`, `poll_votes`, `events`, `event_rsvps`, `qa_sessions`, `qa_questions`, `qa_upvotes`, `emergency_broadcasts` | | เฟส 2 |

---

## 4. แจ้งปัญหา (1)

| ตาราง | คอลัมน์หลัก | หมายเหตุ |
| --- | --- | --- |
| `report_categories` | `id`, `company_id` (null = หมวดกลางจากแม่แบบ), `key`, `name_th`, `name_en`, `default_severity`, `active` | บริษัทตั้งหมวดของตัวเองภายใต้กรอบกลาง |
| `routing_rules` | `company_id`, `category_id`, `owner_user_id` หรือ `owner_role`, `backup_user_id`, `sla_hours` (override), `escalate_to_role` | ส่งต่ออัตโนมัติถึงผู้รับผิดชอบ |
| `reports` | `id`, `company_id`, `department_id`, `submitter_id`, `category_id`, `severity` (`low`/`medium`/`high`/`critical`), `title`, `description`, `impact`, `proposed_fix`, `status`, **`owner_id` (not null)**, **`respond_by` (not null)**, `first_response_at`, `quick_fix`, `quick_fix_approved_by`, `visibility` (`company`/`group`), `shared_by`, `shared_at`, `merged_into_id`, `escalation_level`, `resolution_note`, `outcome`, `closed_at`, `metoo_count` | ทุกเรื่องมีเจ้าของ + กำหนดตอบ = **NOT NULL ที่ฐานข้อมูล** (ตั้งโดย trigger ตอน insert จาก routing_rules/เจ้าของค่าเริ่มต้นของบริษัท) |
| `report_events` | `id`, `report_id`, `actor_id`, `type`, `from_status`, `to_status`, `note`, `created_at` | insert-only (trigger กัน update/delete) · เป็น timeline ที่ผู้แจ้งเห็น · `note` ต้องมีเมื่อ `declined`/`wont_fix` (ตอบทุกเรื่องพร้อมเหตุผล) |
| `report_attachments` | `id`, `report_id`, `storage_path`, `mime`, `bytes`, `kind` | path = `<company_id>/<report_id>/<uuid>.<ext>` · bucket ส่วนตัว · จำกัดชนิด/ขนาด |
| `report_metoo` | `report_id`, `user_id` | "ฉันก็เจอ" · trigger อัปเดต `metoo_count` |
| `report_comments` | เหมือน `announcement_comments` | |

**สถานะ:** `submitted → acknowledged → in_progress → resolved → closed` และทางออก `declined` (ไม่ทำ พร้อมเหตุผล), `merged` (รวมเรื่องซ้ำ)
**ช่องทางแก้เร็ว:** `supervisor` ตั้ง `quick_fix=true` แล้วปิดเรื่องเล็กเองได้โดยไม่เข้าผู้ประสานงาน
**ยกระดับ:** tick ดูเรื่องที่ `now() > respond_by` และยังไม่รับ → `escalation_level+1` → เปลี่ยนผู้รับแจ้ง (หัวหน้า → ผู้ประสานงาน → ทีมกลาง) ด้วย `dedupe_key` ต่อระดับ

**ใครเห็นรายงานได้ (ข้อเสนอ D5)**

| บทบาท | เห็น | แก้ได้ |
| --- | --- | --- |
| ผู้แจ้ง (พนักงาน) | เรื่องที่ตนส่ง + เรื่องที่กด "ฉันก็เจอ" · รวม timeline | แก้เนื้อหาได้ก่อนมีคนรับเรื่อง · ไม่แก้สถานะ/เจ้าของ |
| ผู้ช่วยค้นเรื่องคล้ายกัน | ผ่านฟังก์ชัน `similar_reports(company, text)` คืนเฉพาะ id/หัวข้อ/สถานะ (ไม่มีชื่อผู้แจ้ง) | กด "ฉันก็เจอ" ได้ |
| หัวหน้างาน | เรื่องของลูกทีมตามสาย | รับเรื่อง/ปิดเรื่อง `quick_fix` · ส่งต่อ |
| ผู้ประสานงาน | ทุกเรื่องในบริษัท | มอบหมายเจ้าของ · เปลี่ยนสถานะ · รวมซ้ำ · **เปิดเผยข้ามบริษัท** (`visibility='group'`) |
| เจ้าของเรื่อง | เรื่องที่ถูกมอบหมาย | ตามขั้นตอน |
| ผู้บริหารบริษัท | **ตัวเลขรวม** ผ่านฟังก์ชัน (ไม่เห็นเนื้อเรื่องรายบุคคลโดยปริยาย) | — |
| ทีมกลาง | ทุกบริษัท | ติดตามเรื่องค้าง · ยกระดับ |

---

## 5. เสนอไอเดีย (1)

| ตาราง | คอลัมน์หลัก | หมายเหตุ |
| --- | --- | --- |
| `idea_types` | `key` (`process_improvement`/`cost_reduction`/`new_product_service`/`new_revenue`), `name_th`, `name_en` | |
| `ideas` | `id`, `company_id`, `submitter_id`, `type_key`, `title`, `problem_or_opportunity`, `target_customers`, `expected_benefit`, `resources_needed`, `stage` (`submitted`/`screening`/`evaluating`/`piloting`/`scaled`/`declined`), `stage_entered_at`, `owner_id` (not null), `respond_by` (not null), `decision_reason`, `visibility` (`company`/`group`), `linked_report_id`, `challenge_id` (2) | แบบฟอร์มแผนธุรกิจย่อ · ตอบทุกเรื่องเหมือนปัญหา |
| `idea_stage_events` | `idea_id`, `actor_id`, `from_stage`, `to_stage`, `note`, `created_at` | insert-only |
| `idea_criteria` | `id`, `company_id` (null = กลาง), `name_th`, `name_en`, `weight`, `description` | **เกณฑ์เปิดเผย** ให้ผู้ส่งอ่านได้ |
| `idea_scores` | `idea_id`, `criterion_id`, `scorer_id`, `score` (1–5), `comment` | ผู้ให้คะแนน = ผู้ประเมินที่ถูกกำหนด |
| `idea_votes` | `idea_id`, `user_id`, `value` (+1) | **โหวตไอเดียตัวเองไม่ได้** · ซ้ำไม่ได้ (PK) · เห็นเฉพาะผู้ที่เห็นไอเดีย |
| `idea_comments` | เหมือน `announcement_comments` | |
| `idea_outcomes` | `id`, `idea_id`, `metric` (`money_saved_thb`/`time_saved_hours`/`revenue_added_thb`), `value`, `period_start`, `period_end`, `verified_by`, `note` | ติดตามผลหลังนำไปใช้ · ฐานของ dashboard "มูลค่าที่เกิดขึ้น" (เฟส 2) |

ไอเดียมองเห็นได้ทั้งบริษัทของผู้ส่งโดยปริยาย (เพื่อความเห็นและโหวต) และข้ามบริษัทเมื่อผู้ประสานงานอนุมัติ **[D5]**

(2) `challenges`, `idea_library` (view + `search_tokens`), (3) `idea_teams`, `idea_team_members`, `idea_adoptions`, `pilot_budgets`

---

## 6. แจ้งเตือน (1)

| ตาราง | คอลัมน์หลัก | หมายเหตุ |
| --- | --- | --- |
| `notifications` | `id`, `user_id`, `kind`, `title`, `body` (plain text รูปแบบ `noticeBody`: สรุป + บรรทัด `ป้าย: ค่า`), `href` (path ภายในเท่านั้น), `dedupe_key`, `read_at`, `created_at` | `unique(user_id, dedupe_key)` · **ข้อความชุดเดียว** ใช้ทั้งกล่องในแอป การ์ด LINE และอีเมล |
| `notification_prefs` | `user_id`, `kind`, `in_app`, `line`, `email` | ข้อความบริการเปิดเป็นค่าเริ่มต้นเมื่อผูก LINE · เตือนทั่วไป opt-in |
| `notification_channels` | `id`, `user_id`, `channel` (`line`), `address` (LINE userId), `status` (`pending`/`active`/`stopped`), `code_hash`, `code_expires_at`, `last_error`, `verified_at` | `unique(user_id, channel)` · **เพิ่ม `unique(address)` สำหรับ LINE** (บัญชี LINE เดียวผูกผู้ใช้เดียว — ช่องว่างที่ ThaiPass ยังไม่ทำ) · ไม่มี policy ให้ browser อ่าน (server ใช้ service role) |
| `notification_queue` | `id` (= `X-Line-Retry-Key`), `user_id`, `channel`, `payload jsonb`, `status`, `attempts`, `next_attempt_at`, `dedupe_key` | งานของผู้ใช้แค่เขียนคิว · tick เป็นคนส่ง |
| `message_log` | `id`, `at`, `user_id`, `channel`, `kind`, `status`, `error` | นับโควตา/แสดงข้อผิดพลาดให้แอดมิน |
| `company_channels` | `company_id`, `kind` (`teams_webhook`/`gchat_webhook`/`email_list`), `secret_ref`, `enabled`, `events text[]` | URL webhook เก็บใน Supabase Vault (`secret_ref`) ไม่เก็บตรงในตาราง |

---

## 7. แพลตฟอร์ม ผู้ดูแล และการติดตาม (1)

| ตาราง | คอลัมน์หลัก | หมายเหตุ |
| --- | --- | --- |
| `platform_settings` | `key` (PK), `value jsonb`, `updated_by`, `updated_at` | key: `brand`, `messaging`, `audit`, `ai`, `features` · ค่าเริ่มต้นอยู่ในโค้ด (ตารางว่าง = ทำงานปกติ) · **เขียนผ่าน server เท่านั้น** · มี view สาธารณะเฉพาะ `brand.version` สำหรับ `/brand/*` |
| `company_features` | `company_id`, `key`, `enabled` | override รายบริษัท · สวิตช์ระดับระบบเก็บใน `platform_settings.features` (เฉพาะค่าที่ "ปิด") · ฟีเจอร์ของเฟสถัดไปมี `defaultEnabled:false` ในโค้ดและเปิดรายบริษัทตามรอบการขยาย |
| `platform_admins` | `user_id`, `granted_by`, `granted_at` | เขียนได้ผ่าน `grant_admin`/`revoke_admin` เท่านั้น (ถอนตัวเอง/เจ้าของไม่ได้ · ให้ได้เฉพาะบัญชีที่มีอยู่แล้ว) |
| `audit_log` | `id`, `at`, `source` (`app`/`db`), `actor_id`, `actor_role`, `action` (`group.entity.verb`), `entity`, `entity_id`, `company_id`, `detail jsonb` | **append-only** (trigger กัน UPDATE/DELETE/TRUNCATE) · ไม่มี FK ไปคน/บริษัท · `detail` ผ่าน `cleanDetail` ไม่มี PII · ลบได้ทาง `admin_purge_audit()` ที่ลบเฉพาะแถวเก่ากว่ากำหนดและบันทึกการลบเอง |
| `audit_purges` | `id`, `at`, `actor_id`, `rows`, `before` | append-only |
| (สวิตช์ audit) | `platform_settings.audit = { enabled: bool, off: text[] }` | **R11:** `off` = รายการกลุ่ม/action ที่ปิดเก็บ (prefix match) · ประตูเดียว `audit_log_gate` (BEFORE INSERT) ใช้กับทั้ง app และ trigger · กลุ่ม `audit.*` (การเปลี่ยนสวิตช์/ส่งออก/ลบ) **เก็บเสมอ** |
| `product_events` | `at`, `day` (วันไทย), `user_id`, `name`, `tag` | ไม่มีเนื้อหา · unique `(user_id, day)` สำหรับ "active" |
| `automation_rules` | `key` (PK), `enabled`, `params jsonb` (ตัวเลข 0–10,000), `last_run_at`, `last_count` | เงื่อนไขอยู่ในโค้ด · seed ด้วย `ON CONFLICT DO NOTHING` |
| `cron_ticks` | `id`, `at`, `summary jsonb`, `duration_ms` | บันทึกทุกรอบ |
| `ai_settings` | `task` (PK), `enabled`, `provider`, `model`, `fallback_provider`, `fallback_model`, `params jsonb`, `updated_by`, `updated_at` | **R12** · งานที่ไม่ตั้ง = ค่าเริ่มต้นในโค้ด · คีย์ผู้ให้บริการอยู่ใน env ไม่อยู่ที่นี่ |
| `ai_prompt_versions` | `id`, `task`, `body`, `review jsonb`, `created_by`, `created_at` | **insert-only** · ปัจจุบัน = แถวล่าสุดของ task (body ว่าง = ไม่มีคำสั่งเพิ่ม) |
| `ai_usage_log` | `at`, `task`, `provider`, `model`, `outcome` (`fallback`/`error`), `input_tokens`, `output_tokens` | บันทึกเฉพาะ fallback/error + ตัวนับต่อวัน ไม่เก็บเนื้อหา |

---

## 8. รายการเทสสิทธิ์ขั้นต่ำ (ทุกกฎต้องมีเทส)

เทสเขียนด้วย PGlite (Postgres จริง) โดยจำลอง `auth.uid()` ผ่าน `request.jwt.claims` · ชุดนี้คือ "เกณฑ์ผ่าน M1.2" ขั้นต่ำ และเพิ่มต่อเมื่อเพิ่มตาราง

**การแยกบริษัท**
1. พนักงานบริษัท A อ่าน `reports`/`ideas`/`announcements`(บริษัท)/`memberships` ของบริษัท B ไม่ได้ (select ได้ 0 แถว)
2. ผู้ประสานงาน A เขียน/อ่าน/แก้ข้อมูลบริษัท B ไม่ได้ · มอบหมายเจ้าของเป็นคนนอกบริษัทไม่ได้
3. `visibility='group'` เปลี่ยนได้เฉพาะผู้ประสานงานของบริษัทเจ้าของเรื่อง และหลังเปลี่ยนบริษัทอื่นเห็นเฉพาะส่วนที่กำหนด
4. ผู้บริหารบริษัท A เรียกฟังก์ชัน dashboard ของ B ไม่ได้ และอ่านตาราง `reports` ตรง ๆ ไม่ได้
5. Storage: อ่าน/เขียน object ที่ path ขึ้นต้น `<company B>/` ด้วยผู้ใช้บริษัท A ไม่ได้
6. ผู้ใช้ `pending`/`suspended`/membership `ended` เห็นข้อมูลธุรกิจ 0 แถว และเขียนอะไรไม่ได้

**บทบาทและการยกระดับสิทธิ์**
7. ผู้ใช้ update `profiles.status`, `role_assignments`, `memberships` ของตัวเองตรง ๆ ไม่ได้ (ทั้งก่อน/หลังตั้งค่า) · `with check` ครบ
8. พนักงานเปลี่ยน `reports.status/owner_id/respond_by` ไม่ได้ · หัวหน้าเปลี่ยนได้เฉพาะลูกทีมและเฉพาะ `quick_fix`
9. ผู้ใช้ไม่เรียก `grant_admin` ได้ถ้าไม่ใช่แอดมิน · แอดมินถอนตัวเอง/เจ้าของไม่ได้ · ให้สิทธิ์อีเมลที่ไม่มีบัญชีไม่ได้
10. ผู้ใช้ SSO จาก Aivora ที่อีเมลซ้ำกับบัญชีเดิมไม่ได้บัญชีเดิม (ผูกด้วย `aivora_user_id` เท่านั้น)

**ความสมบูรณ์ของกระบวนการ**
11. insert `reports`/`ideas` โดยไม่มีเจ้าของ/กำหนดตอบ → trigger เติมให้หรือ insert ล้ม (ไม่มีทางได้แถวไร้เจ้าของ)
12. `report_events`/`idea_stage_events`/`audit_log`/`ai_prompt_versions` แก้/ลบแถวไม่ได้ (แม้ service role ผ่าน action ปกติ)
13. `declined`/`wont_fix` โดยไม่มี `note` ไม่ได้
14. โหวตไอเดียตัวเอง/โหวตซ้ำไม่ได้ · "ฉันก็เจอ" ซ้ำไม่ได้
15. เหตุการณ์ที่รันซ้ำ (tick) ไม่สร้างแจ้งเตือน/คิวซ้ำ (`dedupe_key`)

**Audit / Live / Notify**
16. สวิตช์ audit: ปิดกลุ่ม `report` แล้วแถวกลุ่มนั้นไม่ถูกบันทึก แต่การปิดถูกบันทึกเสมอ (`audit.switches`) · ปิดทั้งระบบแล้วก็ยังบันทึกการเปิดกลับ
17. `cleanDetail` ทิ้งคีย์ที่เป็นชื่อ/อีเมล/เบอร์/token/ข้อความอิสระ
18. Realtime: ผู้ใช้ subscribe `u:<คนอื่น>` / `co:<บริษัทอื่น>` / `central` / `adm` ไม่ได้ · ping ไม่มี payload
19. `notification_channels`: บัญชี LINE เดียวผูกผู้ใช้สองคนไม่ได้ · browser อ่านตารางนี้ไม่ได้ · รหัสผิดทุกสาเหตุตอบเหมือนกัน
20. LINE webhook: ลายเซ็นผิด → 401/ไม่ทำอะไร · ลายเซ็นถูก + events ว่าง → 200

**เฟส 2 (เมื่อสร้าง)**
21. `anonymous_reports` อ่านไม่ได้ทั้งโดยผู้ประสานงานบริษัท พนักงาน และแอดมินระบบ (ยกเว้น role `case_handler` ของทีมกลางที่กำหนดชัด) · ตารางไม่มีคอลัมน์ที่ชี้ตัวผู้แจ้ง · ไม่มีแถวใน `audit_log`/`product_events` ที่ผูกกับผู้แจ้ง

---

## 9. PDPA และวงจรชีวิตข้อมูล (ข้อเสนอ — ควรให้ฝ่ายกฎหมายทบทวน)

| เรื่อง | แนวทาง |
| --- | --- |
| ข้อมูลที่เก็บ | ชื่อแสดง อีเมล (ใน auth) รหัสพนักงาน ตำแหน่ง/แผนก ภาษา — **ไม่เก็บ** เลขบัตร วันเกิด เงินเดือน ที่อยู่ · รูปแนบอาจมีบุคคล: มีข้อความเตือนตอนแนบ |
| ความยินยอม | `consents` ตอนล็อกอินครั้งแรก (ประกาศความเป็นส่วนตัว) และตอนผูก LINE |
| พนักงานออก | `memberships.status='ended'` → สิทธิ์หายทันที · เรื่องที่เคยส่งคงอยู่ในฐานะบันทึกธุรกิจ โดยแสดงผู้ส่งเป็น "อดีตพนักงาน" ตามนโยบายบริษัท |
| คำขอของเจ้าของข้อมูล | ส่งออกข้อมูลของตัวเอง · ขอลบ = ทำให้ไม่ระบุตัวตน (anonymize) แทนการลบแถวที่ผูกกระบวนการ · บันทึกใน `audit_log` กลุ่ม `privacy` |
| ระยะเก็บ | `audit_log` ≥ 4 ปีแล้วลบได้ผ่านฟังก์ชันที่จำกัด · เรื่อง/ไอเดียตามนโยบายบริษัท (ตั้งผ่านแม่แบบ) · `message_log` สั้น (เช่น 90 วัน) |
| ข้อมูลออกนอกระบบ | การ์ด LINE/อีเมล/Teams ไม่มีเนื้อหาละเอียด บอกแค่ว่ามีเรื่อง · AI ปิดเป็นค่าเริ่มต้น และห้ามส่งเรื่องไม่ระบุตัวตน |
| Log ของ hosting | ช่องไม่ระบุตัวตนไม่เขียน identity/IP ลง log ของแอป (ตรวจ log ของ Vercel/Supabase ว่าเก็บอะไรบ้างก่อนเปิดช่องนี้) |

---

## 10. ดัชนีและประสิทธิภาพ (เริ่มต้น)

- `reports (company_id, status, respond_by)` สำหรับคิวและ tick · `reports (submitter_id, created_at desc)` สำหรับ "เรื่องของฉัน"
- `ideas (company_id, stage, created_at desc)` · `idea_votes` PK คู่
- `announcement_receipts (user_id, read_at)` และ `(announcement_id)` สำหรับรายงาน
- `notifications (user_id, read_at, created_at desc)` · `notification_queue (status, next_attempt_at)`
- `audit_log (at desc)`, `(actor_id, at)`, `(entity, entity_id, at)`, `(action text_pattern_ops, at)`
- ค้นหาภาษาไทย (เฟส 2): ตัดคำด้วย `Intl.Segmenter('th')` ตอนบันทึกลง `search_tokens` + `pg_trgm` — Postgres full-text ภาษาไทยในตัวใช้ไม่ได้ผลเพราะไม่มีเว้นวรรค
- ตัวเลข dashboard มาจากฟังก์ชัน SQL ตัวเดียวต่อหน้า (หนึ่ง round trip)
