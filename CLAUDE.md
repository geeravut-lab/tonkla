# Tonkla

Tonkla (ต้นกล้า) is a central employee portal for a group of 30+ companies in Thailand. It has three jobs: group-wide communication, letting employees report work problems with proposed fixes, and letting employees propose new products, services and processes.

Read `docs/spec.md` before doing anything. It is the source of truth for scope, roles, modules, phases and open decisions. It is written in Thai.

## Current state

Greenfield. No application code yet. The tech stack, data model, UX/UI and all-phase build plan have been **proposed and are awaiting the owner's approval**:

- `docs/TONKLA-PLAN-KNOWLEDGE.md` (stack, architecture, phases, decisions D1–D14)
- `docs/TONKLA-DATA-MODEL-KNOWLEDGE.md` (tables, RLS, minimum permission tests)
- `docs/TONKLA-UX-UI-KNOWLEDGE.md` and `docs/design/` (look and feel, logo, favicon, preview page)

Do not scaffold or write application code until the owner approves. After approval, build milestone by milestone as listed in the plan (M1.1 first).

`docs/Knowledge-Index.md` indexes the knowledge files copied from RooSuk and ThaiPass. They describe proven patterns and the bugs that came with them; the plan (section 9) says which Tonkla feature uses each one. Read the knowledge file for a feature before building it.

## Infrastructure (set by the owner)

- Hosting: Vercel, **production deployments only**. No preview deployments. Production URL: https://tonkla.vercel.app (provisional until the owner picks a domain).
- Backend: Supabase project `https://yfowqsfyfvzgwqdbkykx.supabase.co` for Auth, Database and Storage. This is the only project, so it is production: every schema change is a migration file, destructive changes are done in two steps and need the owner's approval first.
- Code: https://github.com/geeravut-lab/tonkla. Work on a branch, verify with CI, merge to `main` to deploy.
- The owner has asked Claude to operate Supabase and Vercel on their behalf. That needs network access to those hosts and credentials saved through the secure credential form. Never ask for secrets in chat, never write them to the repo, logs or docs, and never put them behind a `NEXT_PUBLIC_` name.

## Standing rules from the owner

- **After every completed task, end the reply with a "ขั้นตอนถัดไป" section** (in Thai): what is still open in the current milestone or phase, what could come next in the following phase, and a recommendation, so the owner can pick what to order next.
- **Every button, link or menu item that triggers work shows a loading spinner** right where the user pressed, locks against double presses while pending, and clears when the work finishes or fails. Use the shared `PendingButton` / `PendingLink` components only; a lint rule and an e2e test enforce this.
- Audit trail, AI provider/model settings, AI prompts and rules, branding, feature flags and live sync are admin-configurable features, not hard-coded. See the plan for the owner's exact requirements (R5 to R14).
- Cross-cutting engineering rules from `docs/Knowledge-Index.md`: count rows after every UPDATE, hiding a button is not disabling a feature, admin-settable values are never duplicated in the UI, fallbacks keep working rather than stop, external notifications are self-explanatory and carry no sensitive content, user-visible errors are readable sentences.

## Rules that hold for all work here

- Company data isolation is enforced on the server or in database rules, never only in the UI. Every permission rule gets a test.
- Mobile first. Design and test every employee-facing screen at phone width before desktop.
- UI text is Thai first, with English available. No hard-coded strings; all text goes through i18n.
- Every problem report and idea has an owner, a status the submitter can see, and a response deadline.
- The anonymous channel routes to the central team only, never to the submitter's own company.
- Do not rebuild chat, video meetings or email. Link out to the tools each company already uses.
- Build only the current phase. Items in `docs/spec.md` are tagged (1), (2) or (3); do not build a later phase's features unless the owner asks.
- No secrets, keys or real employee data in the repo.

## Working with the owner

- Reply to the owner in Thai.
- When a decision changes scope or design, update `docs/spec.md` in the same pull request as the code.
- Work on a branch and open a pull request; do not commit to `main` directly.
