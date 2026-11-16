# Tonkla

Tonkla (ต้นกล้า) is a central employee portal for a group of 30+ companies in Thailand. It has three jobs: group-wide communication, letting employees report work problems with proposed fixes, and letting employees propose new products, services and processes.

Read `docs/spec.md` before doing anything. It is the source of truth for scope, roles, modules, phases and open decisions. It is written in Thai.

## Current state

Greenfield. No code yet and the tech stack is not chosen.

The first task in this repo is to propose a tech stack, a data model and a Phase 1 build plan, then wait for the owner's approval before scaffolding. The stack requirements are listed in `docs/spec.md` section 8.

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
