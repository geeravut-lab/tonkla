/** Known audit event kinds, grouped by their first word. The admin screen lets people tick which to keep. */
export const AUDIT_KINDS: Record<string, readonly string[]> = {
  auth: ["auth.login", "auth.logout", "auth.link_identity", "auth.password_change"],
  admin: ["admin.grant", "admin.revoke"],
  settings: ["settings.feature_flag", "settings.brand", "settings.audit", "settings.company_feature", "settings.automation", "settings.messaging", "settings.company_channel"],
  company: ["company.create", "company.update", "company.wave", "company.activate", "company.checklist"],
  member: ["member.join_request", "member.join_decide", "member.roster_import", "member.invite_create", "member.invite_redeem", "member.role_grant", "member.role_revoke", "member.end", "member.supervisor"],
  consent: ["consent.privacy"],
  emergency: ["emergency.report", "emergency.status", "emergency.note"],
  qa: ["qa.session", "qa.close", "qa.answer", "qa.hide"],
  event: ["event.create", "event.cancel"],
  poll: ["poll.create", "poll.close"],
  challenge: ["challenge.create", "challenge.close"],
  recognition: ["recognition.award", "recognition.rules"],
  knowledge: ["knowledge.save", "knowledge.status", "knowledge.practice_share", "knowledge.practice_edit"],
  dashboard: ["dashboard.export"],
  anon: ["anon.status", "anon.reply", "anon.note", "anon.handler"],
  ai: ["ai.keys", "ai.route", "ai.test", "ai.prompt_save", "ai.prompt_clear"],
  privacy: ["privacy.request", "privacy.export", "privacy.anonymize", "privacy.decide"],
  idea: ["idea.submit", "idea.transition", "idea.assign", "idea.share", "idea.vote", "idea.score", "idea.outcome", "idea.outcome_verify"],
  report: ["report.submit", "report.transition", "report.quick_fix", "report.assign", "report.merge", "report.share", "report.metoo"],
  announcement: ["announcement.publish", "announcement.ack", "announcement.archive", "announcement.comment_hide"],
  audit: ["audit.switches", "audit.export", "audit.purge"],
  db: ["db.memberships", "db.role_assignments", "db.platform_admins", "db.profiles", "db.companies", "db.platform_settings"],
};
/** Groups that are always recorded, even when the trail is switched off (changing the switches must leave a trace). */
export const AUDIT_ALWAYS = "audit";
export const AUDIT_ACTION_RE = /^[a-z][a-z_]*(\.[a-z_]+){1,3}$/;
