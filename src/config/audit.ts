/** Known audit event kinds, grouped by their first word. The admin screen lets people tick which to keep. */
export const AUDIT_KINDS: Record<string, readonly string[]> = {
  auth: ["auth.login", "auth.logout", "auth.link_identity", "auth.password_change"],
  admin: ["admin.grant", "admin.revoke"],
  settings: ["settings.feature_flag", "settings.brand", "settings.audit", "settings.company_feature"],
  company: ["company.create", "company.update"],
  member: ["member.join_request", "member.join_decide", "member.roster_import", "member.invite_create", "member.invite_redeem", "member.role_grant", "member.role_revoke", "member.end", "member.supervisor"],
  consent: ["consent.privacy"],
  announcement: ["announcement.publish", "announcement.ack", "announcement.archive", "announcement.comment_hide"],
  audit: ["audit.switches", "audit.export", "audit.purge"],
  db: ["db.memberships", "db.role_assignments", "db.platform_admins", "db.profiles", "db.companies", "db.platform_settings"],
};
/** Groups that are always recorded, even when the trail is switched off (changing the switches must leave a trace). */
export const AUDIT_ALWAYS = "audit";
export const AUDIT_ACTION_RE = /^[a-z][a-z_]*(\.[a-z_]+){1,3}$/;
