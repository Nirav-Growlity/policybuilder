# PolicyCraft UI redesign plan — refined execution roadmap

**Status:** Approved design decisions and execution roadmap. P0–P3 are accepted; P4–P7 implementation and QA are complete. Remaining implementation has continued through P13 under the user's 2026-10-09 authorization. P10 uses the approved immediate-navigation fallback; P12 and P13 are ready for review. Desktop/browser and actual Word inspection are recorded, with explicit P8/P9/P11 QA carryover and baseline limitations below. The latest user instruction waives mobile QA. Deployment remains unauthorized.

**Master source:** The previously approved plan in this chat, confirmed and supplied by the user. This file consolidates that approved plan in the repository. `TARGET_PROJECT_ANALYSIS.md` and `DESIGN_SYSTEM_REFERENCE.md` remain supporting references. Saving this plan does not authorize application changes or package installation during P0.

## 1. Approved design baseline

[TARGET_PROJECT_ANALYSIS.md](</D:/Policy PoC/TARGET_PROJECT_ANALYSIS.md>) remains the current-state reference. [DESIGN_SYSTEM_REFERENCE.md](</D:/Policy PoC/DESIGN_SYSTEM_REFERENCE.md>) supplies selected inspiration. Approved decisions take precedence over both documents and skill defaults.

### Surface scope

| Surface | Approved scope |
|---|---|
| Public home | Redesign |
| Login | Redesign |
| Invitation/onboarding | Redesign |
| User workspace/drafts | Redesign |
| Admin workspace | Redesign |
| Manager workspace | Redesign |
| Policy builder | Redesign |
| Builder sidebar | Polish |
| Design inspector | Redesign |
| Tasks | Polish |
| Organization management | Redesign |
| Policy inventory | Redesign |
| Cover editor UI | Redesign |
| AI generation UI | Redesign |
| Signature UI | Redesign |
| PDF preview controls | Redesign |
| All eight generated document themes | Consistency polish |
| PDF output | Consistency polish |
| DOCX output | Consistency polish |

Retain moderate redesign intensity, selective reference borrowing, and distinct public, operational, authoring, tooling, and document families.

### Application colors and themes

| Role | Light | Dark |
|---|---|---|
| Brand | `#4186F3` | `#4186F3` |
| Page / panel | `#F8FAFC` / `#FFFFFF` | `#0B1220` / `#111D32` |
| Inset / raised surface | `#F1F5F9` | `#182842` |
| Main / secondary text | `#0F172A` / `#475569` | `#F1F5F9` / `#A8B6CD` |
| Divider / control boundary | `#CBD5E1` / `#8495AA` | `#334765` / `#647A98` |
| Primary action / text | `#2563EB` / white | `#60A5FA` / `#0B1220` |
| Selection background / text | `#EFF6FF` / `#1D4ED8` | `#1B3157` / `#93C5FD` |
| Success text | `#15803D` | `#86EFAC` |
| Warning text | `#92400E` | `#FCD34D` |
| Error text | `#B91C1C` | `#FCA5A5` |
| Subtle AI accent | `#0F766E` | `#5EEAD4` |

Preserve the following decisions:

- One application status palette with tinted surfaces, text, and Lucide icons; retain existing status meanings and labels.
- Sparse gold accents and fewer gradients; introduce no new gradients.
- Blue-gray dark mode with device preference initially and browser-saved Light/Dark/System overrides through `next-themes`.
- Theme controls in public/auth chrome, workspace account menus, and the builder toolbar.
- Theme changes preserve unsaved state.
- Document palettes, paper canvases, signature artwork, and generated output remain independent of application theme.

### Typography, density, and shape

- Application typography: `"Helvetica", "Helvetica Neue", Arial, sans-serif`; sans headings throughout. JetBrains Mono remains for identifiers.
- Builder controls: 13px; builder copy: 14px. Operational text: 14–15px. Workspace titles: 28–32px. Public headings: responsive 36–72px.
- Compact panel padding: 16px; operational cards: 24px. Operational gutters: 20–40px; public gutters: 24–56px.
- Retain compact authoring, balanced operational, and spacious public densities.
- Buttons/inputs: 8px corners; authoring panels: 14px; operational cards: 12px; standard modals: 16px; authentication cards: 24px; badges: pills.
- Ordinary cards use borders without shadows. Floating UI and authentication retain restrained elevation. Clickable cards change border/tint without lifting.
- Keep all document and signature font assets needed by existing workflows.

### Layouts and components

| Family | Locked decision |
|---|---|
| Workspace shell | Top navigation; in-flow 68px desktop header; visible role plus account dropdown |
| Mobile navigation | Accessible drawers below 1024px; retain brand, account access, and public CTA |
| Builder shell | Existing independent scrolling; 272px expanded/68px compact sidebar; 280px mobile drawer below 1200px |
| Inspector | 360px panel/viewport-capped drawer; retain Templates, Design, Document, and AI covers tabs |
| Central editor | Flatter authoring sections within the existing workbench |
| Operational records | Existing desktop tables/mobile cards and feature-specific lists |
| Buttons | Shared base with primary, secondary, outline, ghost, danger, icon, text, loading, and purposeful feature variants |
| Fields | 40px shared/builder, 44px operational; mixed-case labels; associated error text and red border |
| Focus | Visible 2px blue ring with 2px offset, adapted for inset tooling |
| Forms | RHF/Zod for conventional forms; existing builder state and grammar behavior remain |
| Dates/selects | Preserve custom calendar, native task dates, and native/custom control roles; improve keyboard accessibility |
| Modals | Standardize suitable dialogs on the existing shared Modal |
| Popovers | Shared visual shell; existing specialized interactions remain |
| Toasts | Existing custom Toaster available application-wide |
| Loading | Stable busy buttons, truthful status, targeted initial-record skeletons, approved AI/PDF loaders |

Standard modals retain content-appropriate sizing, the existing 460px small default, viewport gutters, body scrolling, focus handling, Escape, and restoration. Use a 40% black backdrop and restrained 4px blur. Standard dialogs close through explicit controls or Escape, without backdrop dismissal. Preserve specialty drawer behavior and busy restrictions.

Modal footers group cancel then primary/danger actions on desktop and stack full-width on mobile.

Toasts use bottom-right desktop/bottom-center mobile placement, five active seconds, hover/focus pause, and accessible close controls. Keep contextual errors, conflicts, and recovery instructions inline.

### Feature-specific decisions

- Public home: split text-and-policy-preview hero, stacked on mobile, plus the approved workflow walkthrough.
- Login/invitations: compact centered cards.
- Tasks: preserve flat summaries, rows, and workflow presentation.
- Cover editor: distinct slate tooling; desktop tool/property columns and grouped, scrollable tools on narrow screens. Preserve paper canvas and guide colors.
- Signatures: type/draw/upload mode tabs, generous preview, separate library section, mobile stacking.
- PDF controls: grouped page/view, zoom, and export actions; wrapping on mobile; visible loading, stale, and error status.
- Documents: polish all eight themes without changing palettes, fonts, point sizes, line-spacing defaults, margins, layouts, theme IDs, or authored override precedence.

### Motion decisions

| Area | Approved motion |
|---|---|
| Buttons | Subtle `.98` press scale and color feedback |
| Clickable cards | 150ms border/tint changes |
| Local navigation | Moving selection marker |
| Sidebar | 200ms width transition |
| Inspector | 200ms subtle opacity reveal |
| Standard modals | 200ms fade and `.98 → 1` scale |
| Drawers | 250ms edge slide |
| Dropdowns/popovers | 150ms fade and small anchored scale |
| Tabs | 200ms moving underline; 150ms content fade |
| Existing expandable regions | 200ms height/opacity |
| Toasts | 200ms fade and 6px rise |
| Busy actions | Concise text, stable button width, 1s spinner rotation |
| Initial record skeletons | Gentle 2s opacity pulses |
| AI loader | Stationary writing page; 2.4s text-line reveal cycle |
| PDF loader | Restrained page-stack assembly; 2.4s cycle |
| Builder steps | 150ms content fade; immediate selection/scrolling |
| New records | 150ms appearance fade; immediate edits/reordering |
| Progress/counts | 300ms bars and short count crossfades |
| PDF updates | Existing 180ms dimming and lifecycle |
| HTML document entrance | 220ms opacity-only fade; static exports |
| Public/auth entrances | Restrained 200ms entrances |

AI/PDF decoration stops after two cycles, or 4.8 seconds. Other nonessential loops stop within five seconds. Truthful busy status remains.

Preserve the major-motion-only reduction policy: suppress route morphing, GSAP choreography/pinning, sidebar width motion, drawer slides, modal scale/reveal, and accordion height motion. Retain small feedback; reduced-motion toasts use opacity only and PDF loaders use a static stack.

Canvas-containing overlays use opacity-only treatment. Decorative transforms must not affect Moveable geometry, signature canvases, document page planes, or PDF pages.

**Public GSAP:** retain all eight capability descriptions in normal flow. Preview phases cover structure/scope; commitments/targets/SDGs; responsibilities/review/export. Pin only at widths ≥1024px and heights ≥720px. Use in-flow reveals elsewhere and static phases under reduced motion. Scope loading and cleanup to the public experience.

**Native routes:** enable the installed experimental Next integration only after build/browser validation. Share genuine existing brand lockups; use 200ms crossfades for other eligible same-context routes. Navigate immediately for authentication/session changes, source-aware organization changes, exports, history restoration, reduced motion, and unsupported browsers. Preserve RSC, Suspense, routing, and state lifecycles. Failure retains immediate navigation without router freezing or alternate packages.

### Dependency decisions

Approved packages remain exactly:

`motion`, `gsap`, `@gsap/react`, `class-variance-authority`, `tailwind-merge`, `radix-ui`, `react-hook-form`, `zod`, `@hookform/resolvers`, and `next-themes`.

Reuse existing `clsx`, Lucide, Zustand, Moveable, React Colorful, Signature Pad, and export tooling.

Retain the rejected alternatives: Mantine, AutoAnimate, icon replacement, new grid/chart libraries, calendar/toast replacement, and Radix Dialog/Popover replacements for existing specialized controls. Add no shadcn initializer, global preset, CLI, or extra animation CSS package.

## 2. Phased implementation roadmap

**Execution order is serial.** Each phase requires approval of its predecessor. Work may be delegated within the authorized phase, with nonoverlapping ownership. Preparation for a future implementation phase must not become implementation before its checkpoint.

**Desktop-first priority — 2026-10-08:** The user requested “focus on desktop first instead of mobile.” Prioritize desktop layout, spacing and interactions, and present desktop evidence first at each checkpoint. Preserve approved responsive decisions and completed mobile work; perform responsive verification after desktop stabilization under the existing QA contract. This changes execution priority, not the approved design or phase order.

Every UI phase must satisfy the common QA contract in Section 3 and its specific acceptance criteria below.

| Checklist | Dependencies | Deliverable and acceptance criteria |
|---|---|---|
| ☑ **P0 — Preflight and baseline** | Final approval of this revision | Record existing changes, baseline failures, fixtures, screenshots, ownership, and dependency state. Read applicable guidance and installed Next docs. Establish document/asset baselines. No application changes or package installation. |
| ☑ **P1 — Shared foundation and two pilots** | P0 approved | Introduce scoped application tokens, theme infrastructure, and curated primitives on **Login and Admin Policy Inventory**. Demonstrate typography, fields, buttons, statuses, tables/mobile cards, and representative overlays in both modes. Unmigrated surfaces and documents retain their existing styling. |
| ☑ **P2 — Shells, interactions, and feedback** | P1 approved | Apply approved role navigation/account controls, invitation styling, shared dialog/notification treatment, and local Motion behavior. Verify role links, redirects, focus, dismissal, scroll locking, toast timing, and menu accessibility. |
| ☑ **P3 — Workspaces and operational records** | P2 approved | Migrate user drafts, admin/manager records, organization lists, and remaining policy inventory surfaces. Preserve filters, active/archive behavior, ownership metadata, actions, and desktop/mobile presentation. |
| ☐ **P4 — Conventional forms** | P3 approved | Adopt RHF/Zod for approved auth, invitation, organization, access, and account forms. Preserve accepted inputs, validation timing, payloads, server errors, pending states, and redirects. Builder forms remain outside this migration. |
| ☐ **P5 — Tasks** | P4 approved | Polish task summaries, tables/cards, controls, and dialogs; reuse the approved form stack where applicable. Preserve deadlines, status/progress, history, task rules, and builder handoff. Resolve scoped CSS conflicts without changing task logic. |
| ☐ **P6 — Builder, sidebar, inspector, and AI controls** | P5 approved | Apply the approved workbench and section treatment, inspector grouping, generation/grammar controls, and local motion. Verify 1200px boundaries, scroll, shortcuts, persisted collapse, hydration, autosave/conflicts, and policy-dependent steps. |
| ☐ **P7 — Cover editor and AI cover workflow** | P6 approved | Restyle tools and narrow-screen grouping; implement the approved AI illustration loader. Verify scaling, screen/document coordinates, handles, snapping, rotation, layer order, selected composition, and manual/AI separation using fixtures. |
| ☐ **P8 — Signatures** | P7 approved | Implement the approved mode/preview/library composition. Verify type/draw/upload/library paths, selected fonts, canvas coordinates, transparency, private asset resolution, and export preparation. |
| ☐ **P9 — Public home and GSAP** | P8 approved | Complete public styling, responsive navigation, hero, and three-phase walkthrough. Verify readable content, pinning thresholds, in-flow alternatives, reduced motion, cleanup, and mobile performance. |
| ☑ **P10 — Native route transitions** | P9 approved | Implement and validate the approved experimental integration. Verify real matching brand pairs and all immediate-navigation exclusions. Enable only after successful validation; otherwise document the approved immediate-navigation fallback. |
| ☐ **P11 — PDF preview, HTML/PDF, and theme consistency** | P10 approved | Deliver grouped PDF controls, approved PDF loader/HTML entrance, and consistency polish across eight themes. Preserve PDF.js lifecycle, stale/retry behavior, page visibility, zoom, geometry, theme defaults, and assets. Assess shared-model effects on DOCX before changing shared styling. |
| ☑ **P12 — DOCX and cross-renderer verification** | P11 approved | Align approved document styling in DOCX and validate all eight themes across HTML/PDF/DOCX. Preserve font embedding/aliases, signatures, covers, assets, tables, geometry, and authored overrides. Record rendered Word evidence separately from structural checks. |
| ☑ **P13 — Final integration and handoff** | P12 approved | Complete final regression/build checks, shared-style cleanup, visual review, and cross-feature verification. Close all introduced defects and reconcile the checklist/logs. Present final evidence and remaining limitations for acceptance. |

Each phase ends at a **stop-and-review checkpoint**. Completion of QA authorizes submission for review, not advancement. User approval must explicitly release the next phase.

### Files/components affected

These are ownership boundaries, not permission to refactor every listed module.

| Phase | Principal affected areas |
|---|---|
| P1 | [globals.css](</D:/Policy PoC/src/app/globals.css>), [layout.tsx](</D:/Policy PoC/src/app/layout.tsx>), `D:\Policy PoC\src\components\ui`; [Login](</D:/Policy PoC/src/app/login/page.tsx>), [Admin Policy Inventory](</D:/Policy PoC/src/app/admin/policies/page.tsx>) |
| P2 | [WorkspaceShell](</D:/Policy PoC/src/components/workspace/workspace-shell.tsx>), shared modal/toast/disclosure components, [invitation page](</D:/Policy PoC/src/app/accept-invitation/page.tsx>) |
| P3 | `D:\Policy PoC\src\app\dashboard`, `D:\Policy PoC\src\app\drafts`, admin/manager record routes, `D:\Policy PoC\src\components\workspace` listing components |
| P4 | Approved auth/admin form routes, organization editor/assignment components; existing request and validation contracts remain protected |
| P5 | `D:\Policy PoC\src\components\tasks`, including shared task UI and scoped stylesheet |
| P6 | [BuilderClient](</D:/Policy PoC/src/app/builder/BuilderClient.tsx>), `D:\Policy PoC\src\components\builder` shell, steps, inspector, and generation controls |
| P7 | [cover-editor.tsx](</D:/Policy PoC/src/components/builder/cover-editor.tsx>), AI cover workflow/library/loader components |
| P8 | [signature-maker.tsx](</D:/Policy PoC/src/components/builder/signature-maker.tsx>) and its UI integration |
| P9 | [public home](</D:/Policy PoC/src/app/page.tsx>) and public-only walkthrough components |
| P10 | [Next configuration](</D:/Policy PoC/src/next.config.ts>), root/eligible route boundaries and transition helpers |
| P11 | [pdf-policy-preview.tsx](</D:/Policy PoC/src/components/policy/pdf-policy-preview.tsx>), HTML preview/PDF loader, existing theme/render/print modules |
| P12 | `D:\Policy PoC\src\lib\docx` and necessary shared document-style seams |

Main agent owns dependencies, root styling/theme integration, shared integration files, and final reporting. `policycraft-builder-ui` owns assigned application UI. `policycraft-document-output` owns assigned preview/output files.

Keep PDF toolbar and rendering changes under the same owner because they share `pdf-policy-preview.tsx`. Main integrates requested root CSS changes; agents must not edit overlapping files concurrently.

Consult `ask-matt` and repository guidance at assignment start. Apply `frontend-skill` and `web-design-guidelines` to affected UI, without overriding approved decisions. Use document/PDF verification skills when those phases require artifact rendering.

### Package installation schedule

Install packages immediately before their first authorized use, not collectively at the beginning.

| First phase | Packages | Initial record |
|---|---|---|
| P1 | `class-variance-authority`, `tailwind-merge`, `radix-ui`, `next-themes` | Undeclared at P0; installed during P1 (see live dependency log) |
| P2 | `motion` | Installed in authorized P2; resolved 14.0.0; see live dependency log |
| P4 | `react-hook-form`, `zod`, `@hookform/resolvers` | Installed at first authorized use; see live dependency log |
| P9 | `gsap`, `@gsap/react` | Approved; not declared |

Record resolved versions, purpose, lockfile changes, compatibility results, and bundle observations. Reuse packages in later phases without reinstalling.

An incompatibility blocks the current phase. Do not silently substitute packages, alter design decisions, or upgrade Next/React to force compatibility.

## 3. Mandatory QA and visual standards

### Every UI phase

Provide browser evidence for every changed surface:

**User override — 2026-10-09:** “no need to do qa for mobile.” Remaining QA is desktop only. Preserve responsive implementation and historical mobile evidence; do not treat omitted mobile QA as a blocker or require new mobile captures. Desktop interaction, output verification and honest evidence limits still apply.

- Desktop and mobile screenshots in **both light and dark modes**; use 1440×900 and 390×844 as standard comparison sizes.
- Responsive checks at narrow mobile and tablet widths, plus relevant boundaries: 1024px navigation, 1199/1200px builder, and 719/720px walkthrough height.
- Short-screen and zoom/reflow checks where applicable.
- Representative normal, loading, empty, error, disabled, selected, and overlay states relevant to that phase.
- Keyboard navigation, visible focus, labels/errors, announcements, contrast, dismissal, restoration, scroll locking, and interaction tests.
- Reduced-motion behavior and theme persistence/hydration checks.
- Adjacent-path regression checks, including approved pilot screens when shared components change.

Use stable fixtures and intercepted responses for write operations. Preserve production data. Use authorized read-only sessions where available; missing test access or browser capability must be recorded as a blocker, never represented as passed QA.

### Anti-sloppy acceptance criteria

- Spacing and typography follow the approved surface presets.
- Related labels, controls, headings, actions, and columns align consistently.
- Visual hierarchy makes primary work, navigation, and secondary context clear.
- Component states use the shared variants and semantic colors consistently.
- Cards, borders, shadows, and gradients serve approved purposes.
- Motion follows the approved timings and responsibilities, without competing engines.
- No unintended clipping, overflow, overlapping controls, hidden actions, unstable busy widths, or unreadable theme combinations.
- Screenshots are inspected and defects corrected before submission for user review.

These standards evaluate implementation quality; they do not introduce another design system.

### Code and export requirements

Retain the original focused TypeScript/ESLint checks, relevant existing tests, final `npm test`, signature tests, production build, and `git diff --check`, run from `D:\Policy PoC\src`.

Document baseline failures separately. Repair introduced failures within the authorized phase. Repeat checks when changes or unresolved concerns justify them.

P11/P12 additionally verify all eight themes with representative long tables, page breaks, logos, covers, and signatures. Inspect PDF renders and DOCX structures/assets; use rendered Word inspection where needed. Structural DOCX checks do not prove Word appearance.

The accessibility target remains **WCAG 2.2 AA**. Report measured checks and coverage rather than claiming certification.

## 4. Functionality protections and resolved execution conflicts

Preserve authentication, authorization, role behavior, source-aware organization scoping, routes, APIs, database behavior, business rules, builder state, autosave, conflicts, task state, signatures, cover data, private assets, and document rendering contracts.

Preserve existing component props and feature variants. RHF/Zod must mirror accepted inputs and submission behavior. The grammar-aware Textarea, calendar, specialized popovers, Modal, and custom Toaster retain their contracts.

| Execution risk/conflict | Required resolution |
|---|---|
| Global foundation could redesign every screen before pilot approval | Introduce application-scoped tokens and explicit surface opt-in; migrate only the two pilots in P1 |
| Root typography/dark styling could leak into output | Keep legacy/document variables, fonts, paper styles, and print behavior independent; test portals and document subtrees |
| Shared portals could escape pilot styling | Apply the same scoped application treatment to participating modal/toast/menu portal content |
| Task stylesheet could override shared dialogs | Check task `:global` rules and specificity during P5; retain task behavior |
| Form migration could change data or state | Preserve validation timing, payloads, server errors, dirty input, and pending behavior |
| Animation could affect canvas geometry or focus | Exclude canvas scaling/layout projection; verify focus/scroll lifecycle during transitions |
| PDF toolbar and rendering could receive conflicting edits | One phase owner for their shared file |
| Experimental route motion could become an early prerequisite | Keep enablement isolated to P10; immediate navigation remains the approved fallback |
| Source/skill defaults could conflict with approved design | Approved PolicyCraft decisions remain authoritative |
| All dependencies could be installed prematurely | Use the phase-specific installation log |

No migrations, database writes, backend feature changes, new theme IDs, font-default changes, or dormant route activation are included.

## 5. Review checkpoints and execution records

### Checkpoint procedure

**User execution override — 2026-10-08:** The user instructed “dont ask me anything and complete till p7.” This accepts the submitted P3 result and explicitly releases serial execution of P4, P5, P6 and P7 without intermediate approval questions. Each phase still requires its own deliverables, QA, evidence and progress record before the next phase begins. Approved design decisions and functionality protections remain unchanged. Stop after P7; P8 onward and deployment remain unauthorized. Historical checkpoint statements below describe their original authorization state and are superseded by this live override.

**Latest execution override — 2026-10-09:** The user instructed “continue the whole thing.” This supersedes the prior P7 stopping boundary and releases the remaining approved roadmap through P13 in serial order, after each predecessor's implementation, checks and visual QA are complete. Record each concrete phase result for review without repeating approval questions. Individual visual acceptance is not inferred from this execution authorization. All approved decisions, phase-specific dependency timing and protected functionality remain unchanged. Deployment is not authorized.

**Continuation after the browser blocker — 2026-10-09:** After the P8 browser blocker was reported, the user instructed “continue with the rest of the phases.” Proceed with the remaining implementation in serial phase order and complete available checks; carry outstanding browser/artifact checks explicitly as QA pending rather than treating them as passed or blocking all implementation. The user also directed use of the local `.env` database and Computer Use with the local browser. The Brave connection recovered on this continuation. Preserve existing records and keep mutation tests synthetic. Final QA acceptance and deployment are separate from implementation authorization.

For every phase:

1. Confirm predecessor approval and assign file ownership.
2. Implement only the authorized phase.
3. Complete its tests, browser QA, screenshots, and applicable export checks.
4. Update the master checklist, dependency log, and progress record.
5. Present the concrete result and evidence for review.
6. **Stop until the user approves advancement.**

Rejection returns the phase to rework. Correct defects within the approved design, rerun affected checks, and resubmit. Design changes require explicit, narrowly scoped authorization; do not restart the design interview.

Approval of this revised roadmap initially authorizes **P0 only**. Later checkpoint approvals release the named next phase. Final acceptance does not imply deployment authorization.

### Record format

Keep these records in the master plan:

- **Phase checklist:** phase, status, predecessor approval, QA outcome, review decision, next phase authorization.
- **Dependency log:** package, introducing phase, resolved version, purpose, installation/compatibility results, subsequent changes.
- **Progress record:** phase/date, owner/files, completed work, commands/results, screenshot links with viewport/theme/state, accessibility/interaction evidence, regression results, blockers, and user approval reference.

Use statuses: `NOT_STARTED`, `IN_PROGRESS`, `QA_PENDING`, `AWAITING_USER_REVIEW`, `REWORK_REQUIRED`, `BLOCKED`, and `APPROVED`.

Mark a checklist item complete only after acceptance criteria and user review are satisfied. Record native-route fallback explicitly if used.

**Initial planning snapshot, before P0:** planning review completed; approved chat source confirmed; both references reviewed; approved packages remained undeclared; implementation phases had not started. Browser/export QA had not run for the planning revision. Current status is recorded in the live checklist and phase records below.

### Execution pointer

[IMPLEMENT.md](</D:/Policy PoC/IMPLEMENT.md>) points to this master and instructs an implementer to read the master, repository guidance, and applicable skills; select the next authorized phase; verify its dependencies and ownership; install only packages assigned to that phase; follow its acceptance criteria and QA contract; update these records; and stop at the review checkpoint. It must not duplicate tokens, design decisions, or create a second roadmap.

### Live phase checklist

| Phase | Status | Predecessor approval | QA outcome | Review decision | Next phase authorization |
|---|---|---|---|---|---|
| P0 | APPROVED | Roadmap approved by user on 2026-10-08 | Baselines captured; existing failures and coverage limits recorded below | User replied “approved” to P0/P1 checkpoint | P1 authorized |
| P1 | APPROVED | User approved P0 and released P1 on 2026-10-08 | Build, focused lint, access/signature suites and fixture browser QA pass; unchanged baseline failures and coverage limits recorded below | User replied “approved” to P1/P2 checkpoint on 2026-10-08 | P2 authorized |
| P2 | APPROVED | User approved P1 and released P2 on 2026-10-08 | Build, focused lint, access/signature suites and 205 fixture browser checks pass; 94 screenshots reviewed; baseline failures unchanged | User replied “approved” to the P2/P3 checkpoint on 2026-10-08 | P3 authorized |
| P3 | APPROVED | P2 checkpoint accepted | Recorded P3 QA passes with existing baseline limitations | User approved and authorized continuation through P7 | P4 authorized |
| P4 | AWAITING_USER_REVIEW | Explicit serial execution approval through P7 | Focused checks/build and 254 browser checks pass; baseline TS errors retained | Concrete evidence recorded; pixel acceptance remains pending | P5 advancement preauthorized after QA |
| P5 | AWAITING_USER_REVIEW | P4 phase QA complete; explicit through-P7 approval | Functional/build/browser checks and final visual inspection pass | Evidence available; visual acceptance remains pending | P6 advancement preauthorized after QA |
| P6 | AWAITING_USER_REVIEW | P5 phase QA complete; explicit through-P7 approval | Focused tests/build, 384 browser checks and final visual inspection pass | Evidence available; individual pixel acceptance pending | P7 advancement preauthorized after QA |
| P7 | AWAITING_USER_REVIEW | P6 implementation and QA complete; explicit through-P7 approval | Final build, 45 cover/AI tests, 405 browser checks, 140 inspected captures and 16 HTML paper comparisons pass | Concrete evidence recorded; individual visual acceptance pending | P8 advancement preauthorized; P7 QA complete |
| P8 | QA_PENDING | Whole-roadmap execution authorized; continuation with explicit QA carryover | Build, 33 signature tests, lint and integrity pass; targeted local Brave signature/picker QA passes | Persistence, uploads, stale-response and full signature export fixture matrix pending | User authorized remaining implementation |
| P9 | QA_PENDING | User directed remaining implementation | Public implementation, final production build, lint, both source-review rechecks and local Brave desktop checks pass | Broader role/error/sign-out and runtime reduced-motion fixtures pending; mobile QA waived | Continue with explicit QA carryover |
| P10 | AWAITING_USER_REVIEW | Approved fallback selected after source feasibility review | Immediate navigation retained; experimental flag and route wrappers remain disabled | Decision recorded; experimental transitions are not claimed as validated | P11 continuation authorized |
| P11 | QA_PENDING | Remaining implementation authorized; P10 fallback recorded | Preview/loader/entrance and eight-theme contrast polish implemented; all eight desktop PDF/HTML previews render; 19 PDF fixtures rastered and inspected | Runtime stale/error/retry fixtures remain; mobile QA waived | P12 implementation continued under QA carryover authorization |
| P12 | AWAITING_USER_REVIEW | Remaining implementation and export checks authorized | All eight Word body/heading families verified; three target-row layouts corrected; 19 final Word fixtures/277 pages/zero body blanks; all current pages visually covered | Baseline partial PDF font use and cross-format pagination differences recorded; exact font/page parity not claimed | Concrete evidence ready; individual acceptance pending |
| P13 | AWAITING_USER_REVIEW | Remaining roadmap authorized | Final build and scoped lint pass; 358 tests/335 pass/23 exact baseline failures; two baseline TS diagnostics; source reviews/integrity and final page review complete | No unresolved introduced defect; P8/P9/P11 desktop fixture QA and baseline issues explicitly carried over | Handoff ready; deployment not authorized |

### Live dependency log

P1 and P2 versions are resolved below. Later-phase versions remain unresolved until their authorized use. No packages were installed during P0 or P3; P1 installed only its four approved packages, and P2 installed only Motion. P3 reuses them with unchanged manifest and lockfile hashes.

| Package | Introducing phase | Resolved version | Purpose | Installation / compatibility | Subsequent changes |
|---|---|---|---|---|---|
| class-variance-authority | P1 | 0.7.1 | Opted-in button/input/status variants | Installed; focused lint, production build and pilot browser checks pass | None |
| tailwind-merge | P1 | 3.7.0 | Shared primitive class composition with existing clsx | Installed; existing Tailwind 4 build and pilot browser checks pass | None |
| radix-ui | P1 | 1.7.0 | Accessible Light/Dark/System ToggleGroup only | Installed; keyboard and controlled-state/hydration checks pass; existing Modal/disclosure retained | None |
| next-themes | P1 | 0.4.6 | Root theme provider with scoped application styling | Installed; System preference, saved overrides, reload and state-preservation checks pass | None |
| motion | P2 | 14.0.0 | Scoped local navigation, account/drawer, auth, dialog/disclosure and toast motion | Installed via existing Bun with scripts disabled; production build, focused lint and browser checks pass on unchanged Next/React | Necessary Motion transitives and tslib deduplication recorded below; no framework upgrades |
| react-hook-form | P4 | 7.89.0 | Conventional form state | Installed through existing Bun with lifecycle scripts disabled; React 19/RHF/Zod peer compatibility, build and fixture QA pass | No framework upgrades |
| zod | P4 | 4.6.5 | Mirrored conventional validation | Installed through existing Bun with lifecycle scripts disabled; React 19/RHF/Zod peer compatibility, build and fixture QA pass | No framework upgrades |
| @hookform/resolvers | P4 | 5.9.1 | Approved form/schema integration | Installed through existing Bun with lifecycle scripts disabled; React 19/RHF/Zod peer compatibility, build and fixture QA pass | No framework upgrades |
| gsap | P9 | 3.15.0 | Public walkthrough choreography | Installed with existing Bun and lifecycle scripts disabled; first build and targeted browser checks pass | No framework upgrades |
| @gsap/react | P9 | 2.1.2 | Public-only GSAP lifecycle and cleanup | Installed with existing Bun and lifecycle scripts disabled; first build and targeted browser checks pass | No framework upgrades |

### P0 progress record — 2026-10-08

- **Authorization:** User supplied this roadmap and instructed “PLEASE IMPLEMENT THIS PLAN.” Per Section 5 this releases P0 only.
- **Ownership:** Main owns this master, `IMPLEMENT.md`, ignored baseline scripts/logs/screenshots and integration reporting. `policycraft-architect` owns read-only safety/fixture inspection and impact mapping; no application-file editing is assigned. Future phase ownership remains subject to its checkpoint.
- **Initial repository state:** `DESIGN_SYSTEM_REFERENCE.md` and `TARGET_PROJECT_ANALYSIS.md` were the only untracked files; no tracked application changes. These existing references are preserved.
- **Guidance:** Root `AGENTS.md`, `src/AGENTS.md`, `src/CLAUDE.md`, `ask-matt` routing and execution-document guidance consulted. Installed Next documentation governs framework implementation; P10 integration remains disabled.
- **Dependency baseline:** Existing Next 16.2.12, React 19.2.4 and Tailwind 4 application. Existing Playwright Core and export libraries are available. The ten approved packages are absent as direct dependencies. No installs authorized in P0.
- **Checks, screenshots, document/asset baselines:** Captured and inspected as described below. P0 establishes comparison evidence; it does not represent the existing application as defect-free or satisfy later implementation-phase QA.
- **User checkpoint:** Accepted when the user replied “approved” to the submitted P0 checkpoint and request to release P1. P1 became authorized; P2 did not.

#### Repository and dependency integrity

Baseline commit: `1e2ce7eca88bf1016771a59a9ba07ec8fe413c76`. The repository uses `src/bun.lock`; there is no `src/package-lock.json`. No manifest or lockfile edits occurred. `git diff --name-only` remained empty after preflight; the only new repository documents are this master and `IMPLEMENT.md`, alongside the two preexisting untracked references. Scratch harnesses, logs and export artifacts are isolated under ignored `tmp/redesign-p0-20261008`; browser images are under ignored `src/output/playwright/redesign-p0-20261008`.

| Preserved input | SHA-256 |
|---|---|
| src/package.json | `be10ff4208d2a3a98c5bcd57634aa6da99bd062879b74f6e0b308cfb8b07d2e4` |
| src/bun.lock | `151bbed3020ba4fbdddbe900d01d664ec6381c840129415569afa86493b0ea8c` |
| TARGET_PROJECT_ANALYSIS.md | `b0cd4789eab91c9b0d5e1db5390f2ef4216e44e7098c3b0da36e7b7c0f573647` |
| DESIGN_SYSTEM_REFERENCE.md | `a9a379dd6af66dd326184e73a8a3d76ccaf59c27db4584d50236eb90ebc47e5b` |

Installed Next `viewTransition` configuration and App Router view-transition guides were consulted. The installed integration is experimental and App Router uses bundled React canary features; no Next/React upgrade or transition enablement occurred. The P0 build without the flag does **not** prove P10 compatibility.

#### Commands and measured results

Application checks ran from `D:\Policy PoC\src`. Test/build processes explicitly used `DATABASE_URL=mysql://test:test@127.0.0.1:1/policycraft_test`; test suites use their existing fixture seams. `POLICY_LAYOUT_QA_DIR` was unset for the main suite. No seed importer, preview-asset generator, migration, or live-data mutation was run.

| Check | Result | Evidence |
|---|---|---|
| `npm test` | Exit 1; 354 tests, 331 passed, 23 failed, none skipped | [Full baseline log](</D:/Policy PoC/tmp/redesign-p0-20261008/npm-test.log>) |
| `npm run test:signatures` | Exit 0; all 33 passed | [Signature baseline log](</D:/Policy PoC/tmp/redesign-p0-20261008/signatures.log>) |
| `node --import tsx --test --test-force-exit lib/policycraft-login-regression.test.ts` | Exit 1; 0/1 passed; mocked pre-migration admin bootstrap returns 503 rather than expected 200 | [Login regression log](</D:/Policy PoC/tmp/redesign-p0-20261008/login-regression.log>) |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Exit 2; two errors in the existing login regression test: TS7023 and TS2352 | [TypeScript baseline log](</D:/Policy PoC/tmp/redesign-p0-20261008/typecheck.log>) |
| `npm run lint -- app/login/page.tsx app/admin/policies/page.tsx components/ui` | Exit 1; three existing `react-hooks/set-state-in-effect` errors in `ai-action-button.tsx`, `calendar.tsx`, and `toast.tsx`; no pilot-page diagnostics | [Focused lint log](</D:/Policy PoC/tmp/redesign-p0-20261008/lint-pilots.log>) |
| `npm run build` | Exit 0; compilation, build TypeScript, static generation and route output succeeded; Better Auth base-URL warnings recorded | [Production build log](</D:/Policy PoC/tmp/redesign-p0-20261008/build.log>) |
| `git diff --check` | Exit 0; no tracked diff or whitespace defects at baseline | Final repository integrity check |
| API-mocked browser baseline and targeted keyboard checks | Exit 0; 30 screenshots, no page errors, no failed requests, no unmapped API requests in completed capture | [Screenshot evidence](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/evidence.json>), [keyboard evidence](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/a11y-evidence.json>), [capture log](</D:/Policy PoC/tmp/redesign-p0-20261008/browser.log>) |
| Existing application PDF/DOCX renderers with eight synthetic samples | Exit 0; all inputs preserved, all PDF pages A4 within rounding tolerance; eight DOCX packages pass ZIP and A4 section-geometry checks | [Renderer log](</D:/Policy PoC/tmp/redesign-p0-20261008/documents.log>), [source/theme/asset baseline](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/baseline.json>), [DOCX structural audit](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/docx-audit.json>) |

The standalone TypeScript result and production-build TypeScript result are recorded separately; build success does not erase the broader checker diagnostics. P0 does not repair baseline application/test failures. Later validation must compare against these failures and report introduced defects separately, without suppressing tests or changing protected behavior to obtain a green result.

#### Existing failures and follow-up risks

| Baseline observation | Coverage / future handling |
|---|---|
| HTML AI-cover saved color assertion; running-header logo fallback assertion | Two existing main-suite failures; retain as comparison evidence for P7/P11 |
| DOCX AI-cover saved color and reviewer/footer assertion | Two existing main-suite failures; review at the authorized document phases while preserving authored precedence and output contracts |
| PDF bordered-footer clearance | One existing assertion failure at 20mm inset / 6pt stroke; record geometry before P11 |
| PDF reviewer designation across eight themes, with and without large logo | Sixteen existing assertion failures; full log records missing reviewer designation, including page 2 in the standard sample |
| Half-yearly/every-two-year revision schedules and custom-row preservation | Two existing main-suite failures; no revision-history business logic changes authorized by this UI roadmap |
| Optional-organization-migration login regression | Separate existing failing test and two type diagnostics; fixture result does not establish live database behavior. Do not apply migrations or change backend behavior under P0 or silently expand the UI scope |
| Shared control effects | Three lint errors recorded; retain current functionality during later authorized styling work |
| Public home at 390px | Browser-reported document scroll width 487px; inspected screenshots show navigation spilling beyond the mobile viewport. Existing baseline defect for P9; Login and Admin Inventory did not overflow at sampled widths |
| Dark OS preference | Current surfaces remain light; no theme override controls exist. P1 introduces the approved theme system only on opted-in surfaces |
| Synthetic PDF samples | Inspected pages 1–3 for each theme. Page 2 contains the cover motif with very little other content; contents begin on page 3. Preserve this evidence for P11 investigation; no conclusion about live saved-policy output or fix is claimed |
| Word rendering | Bundled runtime provides Poppler but no LibreOffice. DOCX ZIP/assets/geometry are verified; Microsoft Word appearance is unverified. Arrange the required render/manual Word evidence in P12 before claiming visual acceptance |

There is no remaining blocker to submitting the **P0 baseline** for review. Existing test failures and the later Word-rendering requirement remain open risks; they are not marked resolved. Live authentication, production data, every document page, every interaction and complete WCAG coverage were not tested in P0.

#### Browser fixtures, isolation and interaction evidence

The capture reused the existing local Next server at `http://localhost:3000` and installed Edge 154.0.4258.62. No unrelated server was stopped. An attempted separate dev start was blocked first by sandbox path canonicalization and then by Next's existing-server guard; using the existing server resolved baseline access. The Playwright CLI was not installed; no CLI download occurred. Existing `playwright-core` and Edge were used instead, with ignored harnesses and no new browser-test dependency.

All application API requests in the completed capture were intercepted. The fixture-only session cookie lets the existing route proxy reach client UI; it is not a real credential. Synthetic `/api/policycraft/access` responses provide `{ actor, organizations, homeHref }`; `/api/policycraft/admin/documents` provides `{ documents, creators }` and controlled loading/empty/error states. Both attempted sign-ins were intercepted and returned fixture errors; archive dialogs were opened and dismissed without submission. No fixture mutation reached the server.

Preserve Login's initial access lookup, Better Auth submission, second access lookup, role-checked `safeNext()` and `homeHref` fallback. Preserve inventory active/archive and organization/creator/type filters, source labels, safe summary projection, lock versions, 401 redirect, export context and request payloads. Existing `scripts/verify-workspace-polish-ui.mjs` and `scripts/verify-tasks-ui.mjs` offer broader mocked regressions for their authorized phases; they were inspected, not mistaken for live-authentication evidence.

Measured keyboard checks at 1440×900 and 390×844 confirmed Email → Password Tab order, a visible 2px existing green focus outline, keyboard disclosure activation, dialog Tab containment, Escape dismissal, focus restoration to the disclosure trigger, body scroll locking and restoration. The sampled Sign in button has white text on `#1A5C3A`, approximately 7.97:1 contrast; this measures one existing state only. Relevant pilot controls had associated labels in the captured states. Login busy buttons disabled correctly and retained entered input after fixture errors; inventory retry recovered after fixture failures. A 1280×480 capture used reduced motion. P1/P2 still require the complete approved blue focus treatment, contrast/state matrix, theme persistence/hydration, zoom/reflow and reduced-motion implementation checks.

All 30 completed screenshots were visually inspected. Normal matrix captures use light/dark **OS preference**; the current app has no designed dark mode. Viewports are listed below; captures use full-page images, so taller content may exceed viewport height. Debug failure images from harness setup are not acceptance evidence.

| Surface / state | Viewport / preference | Evidence |
|---|---|---|
| Public / normal | 1440×900; light / dark OS | [Light](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/public-desktop-light.png>) / [Dark preference](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/public-desktop-dark.png>) |
| Public / normal | 390×844; light / dark OS | [Light](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/public-mobile-light.png>) / [Dark preference](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/public-mobile-dark.png>) |
| Login / normal | 1440×900; light / dark OS | [Light](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-desktop-light.png>) / [Dark preference](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-desktop-dark.png>) |
| Login / normal | 390×844; light / dark OS | [Light](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-mobile-light.png>) / [Dark preference](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-mobile-dark.png>) |
| Inventory / normal | 1440×900; light / dark OS | [Light](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-desktop-light.png>) / [Dark preference](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-desktop-dark.png>) |
| Inventory / normal | 390×844; light / dark OS | [Light](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-mobile-light.png>) / [Dark preference](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-mobile-dark.png>) |
| Login / busy and error | 1440×900; light | [Busy](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-desktop-busy-light.png>) / [Error](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-desktop-error-light.png>) |
| Login / busy and error | 390×844; light | [Busy](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-mobile-busy-light.png>) / [Error](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-mobile-error-light.png>) |
| Inventory / loading, empty, error | 1440×900; light | [Loading](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-desktop-loading-light.png>) / [Empty](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-desktop-empty-light.png>) / [Error](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-desktop-error-light.png>) |
| Inventory / loading, empty, error | 390×844; light | [Loading](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-mobile-loading-light.png>) / [Empty](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-mobile-empty-light.png>) / [Error](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-mobile-error-light.png>) |
| Inventory / archive dialog | 1440×900 / 390×844; light | [Desktop](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-desktop-archive-dialog-light.png>) / [Mobile](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-mobile-archive-dialog-light.png>) |
| Login / keyboard focus | 320×844; light | [Narrow focus](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/login-320-light-keyboard.png>) |
| Inventory / responsive normal | 320×900 / 768×900; light | [320px](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-320-light.png>) / [768px](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-768-light.png>) |
| Inventory / navigation boundary | 1023×900 / 1024×900; light | [1023px](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-1023-light.png>) / [1024px](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-1024-light.png>) |
| Inventory / short screen, reduced motion | 1280×480; light | [Short screen](</D:/Policy PoC/src/output/playwright/redesign-p0-20261008/admin-inventory-short-reduced-light.png>) |

#### Document and asset comparison baseline

Ignored `document-baseline.mjs` calls the existing shared model and actual PDF/DOCX renderers with `templatePreviewPolicy(theme.id, 'environmental')`, a synthetic company name and document number. It preserves serialized input and records complete theme definitions, resolved defaults, palettes, typography, layout metadata, geometry and artifact checksums. No theme default or authored override was changed. The existing dense-DOCX all-eight-template test also passed within the full suite; this is structural evidence, not Word appearance.

The baseline includes 71 existing public font files and 23 protected source/reference/dependency hashes. All 23 hashes were checked unchanged after generation. Signature font imports and assets remain in their existing application paths; nothing was removed. Unbordered document geometry is 210×297mm with 22mm content margins; DOCX section geometry is 11906×16838 twips. Border and header/footer calculations remain defined by the existing shared geometry module and captured source hash.

| Theme ID | PDF pages | DOCX bytes | Baseline outputs |
|---|---:|---:|---|
| standard-pack | 10 | 203437 | [PDF](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/standard-pack.pdf>) / [DOCX](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/standard-pack.docx>) |
| executive-brief | 11 | 103038 | [PDF](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/executive-brief.pdf>) / [DOCX](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/executive-brief.docx>) |
| controlled-manual | 11 | 22060 | [PDF](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/controlled-manual.pdf>) / [DOCX](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/controlled-manual.docx>) |
| governance-register | 10 | 82443 | [PDF](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/governance-register.pdf>) / [DOCX](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/governance-register.docx>) |
| operations-guide | 10 | 22162 | [PDF](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/operations-guide.pdf>) / [DOCX](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/operations-guide.docx>) |
| sustainability-charter | 11 | 6559736 | [PDF](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/sustainability-charter.pdf>) / [DOCX](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/sustainability-charter.docx>) |
| people-charter | 11 | 6674351 | [PDF](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/people-charter.pdf>) / [DOCX](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/people-charter.docx>) |
| metrics-ledger | 11 | 77356 | [PDF](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/metrics-ledger.pdf>) / [DOCX](</D:/Policy PoC/tmp/redesign-p0-20261008/documents/metrics-ledger.docx>) |

Poppler rendered pages 1–3 of each PDF into adjacent `THEME-01.png`, `THEME-02.png`, and `THEME-03.png` comparison images; all 24 were inspected. These samples cover titles, motifs and contents, not every body/table/signature page. P11/P12 retain the full all-theme long-table, page-break, logo, cover, signature, asset and authored-override matrix required in Section 3. Baseline DOCX ZIP checks found intact media/font entries and A4 sections in all eight artifacts, with appearance explicitly unverified. No application-source remediation or package installation has occurred.

Final documentation checks confirmed that every local link in this master resolves and both saved Markdown documents have no trailing whitespace. Application sources, dependency files and both original references remain unchanged.

**P0 submission and acceptance:** Baseline work was submitted for review and accepted by the user's subsequent “approved” reply. P0 is checked complete. That checkpoint released **P1 — Shared foundation and two pilots** only.

### P1 progress record — 2026-10-08

- **Authorization:** User replied “approved” to the submitted P0 checkpoint and request to release P1. P0 is now approved; P1 is the sole authorized implementation phase. P2 remains gated.
- **Priority:** Applied the user's desktop-first instruction; desktop screenshots lead this submission. Existing mobile presentation and responsive checks are retained.
- **Scope delivered:** Scoped shared foundation, theme infrastructure and curated primitives on Login and Admin Policy Inventory. The inventory page background is scoped through its pilot marker so its surrounding content area follows the pilot theme. Public pages, workspace navigation/header, other operational routes, builder, tasks and document styling retain their existing treatment.
- **Ownership:** Main owns root CSS/layout, three application theme/surface modules, scoped integration in the existing Modal/action disclosure, dependency manifest/lockfile, evidence harnesses and master records. `policycraft-architect` supplied the read-only impact map and specification review. `policycraft-builder-ui` owned both pilot pages, their two CSS modules and the new primitive TSX/CSS pair. A separate standards reviewer inspected changes without editing. No concurrent file ownership overlapped.
- **Guidance:** Root/nested repository guidance, installed Next server/client/provider, layout and CSS documentation, explicit `ask-matt` routing, `frontend-skill` app guidance, `web-design-guidelines`, browser verification guidance and the two-axis `code-review` workflow were consulted. Approved choices remained authoritative; no design interview, issue-tracker setup or alternative design system was introduced.
- **Result at first submission:** `AWAITING_USER_REVIEW`. The subsequent user approval accepted P1 and released P2, as recorded in the live checklist and P1 acceptance paragraph below. The evidence and limitations from that submission remain preserved.

#### Files and functionality protections

| Owner | Files | Completed work / protection |
|---|---|---|
| Main | [globals.css](</D:/Policy PoC/src/app/globals.css>), [layout.tsx](</D:/Policy PoC/src/app/layout.tsx>) | Append `.pc-ui` tokens/classes and pilot-only inventory backdrop; root provider remains inside the existing server layout. Preserve legacy variables, document fonts, paper/print rules and document font-face injection. |
| Main | [application-theme-provider.tsx](</D:/Policy PoC/src/components/ui/application-theme-provider.tsx>), [application-surface.tsx](</D:/Policy PoC/src/components/ui/application-surface.tsx>), [application-theme-control.tsx](</D:/Policy PoC/src/components/ui/application-theme-control.tsx>) | Light/Dark/System persistence using `data-pc-theme` and `policycraft-application-theme`; explicit surface context, stable mounted control and no theme-keyed child remount. Native color scheme applies only within opted-in surfaces. |
| Main | [modal.tsx](</D:/Policy PoC/src/components/ui/modal.tsx>), [action-disclosure.tsx](</D:/Policy PoC/src/components/ui/action-disclosure.tsx>) | Context-dependent pilot appearance, including portal content; preserve legacy branch, props and existing dismissal/focus/busy contracts. Pilot menus scroll into view only when their bounds leave the viewport. |
| UI specialist | [app-primitives.tsx](</D:/Policy PoC/src/components/ui/app-primitives.tsx>), [app-primitives.module.css](</D:/Policy PoC/src/components/ui/app-primitives.module.css>) | CVA-based buttons, fields, inputs and statuses with approved semantic colors, stable busy width and focus feedback. Existing shared Input/grammar Textarea are unchanged. |
| UI specialist | [Login](</D:/Policy PoC/src/app/login/page.tsx>), [Login styles](</D:/Policy PoC/src/app/login/page.module.css>) | Centered authentication card, 44px fields, inline errors, theme control and keyboard skip link. Preserve sign-in call, invited-email lock/unlock, query parsing, access effect, safe-next redirects and pending input. |
| UI specialist | [Admin Policy Inventory](</D:/Policy PoC/src/app/admin/policies/page.tsx>), [Inventory styles](</D:/Policy PoC/src/app/admin/policies/page.module.css>) | Flat operational panel, aligned desktop filters/table, existing mobile records, semantic stages and grouped actions. Preserve fetch/query/popstate, source-aware scoping, lock versions, archive/restore/delete, export payloads and read-only restrictions. |
| Main | [package.json](</D:/Policy PoC/src/package.json>), [bun.lock](</D:/Policy PoC/src/bun.lock>) | Add only the four P1 dependencies; no Next/React upgrades, database, API or business-logic edits. |

The protected-source/asset comparison checked **87 hashes: 71 fonts and 16 unmodified source/reference files**, all unchanged. This includes workspace shell, builder, cover/signature tooling, document model/themes/geometry/renderers and both references. [Hash results](</D:/Policy PoC/tmp/redesign-p1-20261008/protected-assets.json>). Browser checks additionally compared workspace-header markup/colors and document-thumbnail markup/paper geometry across application themes.

#### Dependency installation and bundle observation

From `D:\Policy PoC\src`, the existing Bun 1.3.14 executable ran `bun add class-variance-authority tailwind-merge radix-ui next-themes --ignore-scripts`. The manifest gained only these four direct dependencies. The existing Bun lock gained 168 lines with no removals; 77 packages including transitives were installed. [Installation log](</D:/Policy PoC/tmp/redesign-p1-20261008/install.log>). Production build and browser use validated this phase against existing Next 16.2.12, React 19.2.4 and Tailwind 4. Motion, GSAP and RHF/Zod packages remain undeclared and deferred to their phases.

The [production HTML JS snapshot](</D:/Policy PoC/tmp/redesign-p1-20261008/bundle-observation.json>) references 11 scripts for Login (732,312 raw bytes; 222,517 estimated gzip bytes) and 14 for Inventory (1,104,185 raw bytes; 304,365 estimated gzip bytes). These include existing shared application code. They are file-compression estimates, not measured network transfer or a dependency-size delta; P0 retained no comparable chunk snapshot. Recheck only if later package/code changes justify it.

#### Code verification

Commands ran from `D:\Policy PoC\src`. Fixture test runs used an unreachable local database URL; no live database writes or migrations occurred. Full-suite failing test names were compared with P0 and matched exactly.

| Command | Result | Evidence |
|---|---|---|
| `npm run test:access` | 80/80 pass | [Log](</D:/Policy PoC/tmp/redesign-p1-20261008/access.log>) |
| `npm run test:signatures` | 33/33 pass | [Log](</D:/Policy PoC/tmp/redesign-p1-20261008/signatures.log>) |
| `npm test` | 354 total: 331 pass, 23 existing failures; no new failing test names | [Log](</D:/Policy PoC/tmp/redesign-p1-20261008/npm-test.log>) |
| Existing standalone login-regression test | Existing 503-versus-200 fixture/migration failure persists | [Log](</D:/Policy PoC/tmp/redesign-p1-20261008/login-regression.log>) |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Two existing test-only diagnostics in `lib/policycraft-login-regression.test.ts` (TS7023/TS2352); no new diagnostics | [Log](</D:/Policy PoC/tmp/redesign-p1-20261008/typecheck.log>) |
| `node node_modules/eslint/bin/eslint.js` on the nine changed TSX files | Pass | [Log](</D:/Policy PoC/tmp/redesign-p1-20261008/lint.log>) |
| `npm run build` | Pass, including build TypeScript and route generation; existing Better Auth base-URL warnings remain | [Log](</D:/Policy PoC/tmp/redesign-p1-20261008/build.log>) |
| `git diff --check` | Pass; platform line-ending warnings only | Working-tree check at submission |

The existing 23 suite failures remain the P0 rendering/revision baseline: HTML AI-cover color, header-logo theme rendering, DOCX AI-cover/reviewer behavior, PDF border/footer and all-theme reviewer-designation cases, and revision-history cases. They were not suppressed, repaired incidentally or presented as passing. All-phase final acceptance still requires the roadmap's later regression/export verification.

#### Browser, accessibility and interaction verification

Used the existing Playwright Core 1.63 and installed Microsoft Edge 154.0.4258.62 against `http://localhost:3000`. All API reads/writes were fulfilled by synthetic fixtures, external origins were blocked and no unmapped API escaped. The existing user development server was retained. This establishes client behavior, not live authentication/database acceptance.

- [Pilot matrix](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/evidence.json>): 42 captures covering both pilots and the unchanged public surface, standard desktop/mobile light/dark modes, busy/error/loading/empty/dialog states and responsive boundaries. No runtime page errors, failed requests or unmapped APIs.
- [Interaction results](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/interactions.json>): **50/50 checks pass** across desktop/mobile. Theme controls preserve input, saved overrides persist after reload, System follows OS changes, and Radix arrows move focus. Verified labels/focus, safe redirects, search URL behavior, modal focus containment/restoration, scroll locking, explicit dismissal and busy restrictions. Intercepted archive/restore/delete and PDF/Word requests retain filenames, source-aware organization context and lock-version payloads. Four expected fixture-401 network console messages are recorded separately from runtime/hydration failures.
- [Extended results](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/extended-qa.json>): **36/36 checks pass**, with 20 captures. Verified visible/clickable menus including bottom-row actions, native filters/history, no-result recovery, clear-filter focus, deleted standalone read-only behavior, login success/401 handoff, adjacent legacy Managers styling, short screens and reduced modal motion. Widths 320/640/768/1023/1024 have no horizontal overflow. Effective 200% reflow uses a 720×450 CSS viewport; actual browser zoom was not measured.
- [Final state refresh](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/focused-states-evidence.json>): refreshed 12 empty/error/archive-dialog images after visual corrections. Waited for fonts and finite entrance animations; dialog/backdrop opacity is 1 for each accepted modal capture. In-progress animation/debug failure screenshots are excluded from acceptance evidence.
- [Final keyboard evidence](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/focused-keyboard-evidence.json>): **3/3 checks pass** for desktop light/dark and 320px Login. The first keyboard target has a visible 2px brand-blue outline with 2px offset; narrow focus presentation avoids covering theme controls.
- Contrast checks measured the primary Sign in treatment at approximately 5.17:1 in light mode and above 4.5:1 in dark mode. Extended sampled text/background checks covered 27 light and 24 dark combinations with opaque backgrounds; disabled controls, document content and transparent compositions were excluded. Coverage is targeted and does not constitute WCAG certification.

All **66 unique accepted screenshots** were visually inspected, including the final keyboard refresh. The [inspection-sheet index](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/review-images.json>) groups the initial 64; the two added desktop keyboard captures are linked below. Screenshot inspection corrected filter visibility, action-menu clipping/alignment, dark danger-button contrast, empty-state icon alignment and focus-ring consistency. Existing workspace chrome remains intentionally unmigrated until P2, visible above the inventory pilot in both modes.

#### Desktop-first review evidence

Standard desktop captures use 1440×900; files may be taller when full-page content requires it.

| Surface / state | Light | Dark |
|---|---|---|
| Login / normal | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/login-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/login-desktop-dark.png>) |
| Inventory / normal | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-dark.png>) |
| Login / busy | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/login-desktop-busy-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/login-desktop-busy-dark.png>) |
| Login / error | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/login-desktop-error-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/login-desktop-error-dark.png>) |
| Inventory / loading | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-loading-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-loading-dark.png>) |
| Inventory / empty | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-empty-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-empty-dark.png>) |
| Inventory / error | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-error-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-error-dark.png>) |
| Inventory / archive dialog | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-archive-dialog-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/admin-inventory-desktop-archive-dialog-dark.png>) |
| Login / keyboard focus | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/login-desktop-keyboard-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p1-20261008/login-desktop-keyboard-dark.png>) |

Responsive evidence remains available in the matrix and inspection index: 390×844 light/dark normal and state captures, 320px Login, inventory breakpoint checks and short-screen/reflow captures. The 1199/1200px builder and 719/720px GSAP boundaries remain future-phase requirements; those surfaces were not changed in P1.

#### Review, risks and checkpoint

The read-only architecture/specification review found no confirmed specification violations after scope/portal protection checks. The standards review found a missing clear-filter focus ring, which was corrected and browser-verified. It also noted duplicate inventory/primitives styling as a nonblocking maintenance concern; a broad cleanup is deferred until later authorized component reuse. Visual QA corrections were resubmitted through affected checks, without changing approved design choices.

No P1-specific implementation blocker remains. Known baseline suite/typecheck failures, limited accessibility sampling, fixture-only authentication, estimated bundle sizes and unverified Word appearance remain explicitly open limitations. P1 made no document-renderer changes; P0 assets/artifacts and all eight theme contracts are preserved, and P11/P12 still require their full render/export matrix.

**P1 submission and acceptance:** Shared foundation and both pilots were submitted for desktop-first review. The user's subsequent “approved” reply accepted P1 and released **P2 — Shells, interactions, and feedback** only. P1 is checked complete. Final deployment remains unauthorized.

### P2 progress record — 2026-10-08

- **Authorization:** User replied “approved” to P1 acceptance and release of P2. P2 is the sole authorized implementation phase; P3 remains gated.
- **Priority:** Desktop-first workspace navigation/account treatment, invitations and shared feedback. Preserve completed responsive work and the approved responsive QA contract.
- **Preparation completed:** Preserved the accepted P1 working tree and captured 20 phase-specific source/manifest/lockfile copies before edits, with hashes and initial Git status in [P2 baseline](</D:/Policy PoC/tmp/redesign-p2-20261008/baseline.json>). The architect mapped impact read-only; main and UI specialist used nonoverlapping ownership and consulted repository guidance, `ask-matt`, installed Next documentation and the applicable UI/review skills.
- **Dependency:** Installed only approved `motion` immediately before P2 use. Other approved future-phase packages remain deferred.
- **Result:** `AWAITING_USER_REVIEW`. Implementation and the evidence below are ready for acceptance. P2 remains unchecked until the user accepts it; no P3 implementation or installation is authorized.

#### Delivered scope and ownership

| Owner | Files | Delivered behavior and protections |
|---|---|---|
| UI specialist | [Workspace shell](</D:/Policy PoC/src/components/workspace/workspace-shell.tsx>), [shell styles](</D:/Policy PoC/src/components/workspace/workspace-shell.module.css>) | In-flow 68px desktop header, preserved role links/selection/task badge, visible role/account menu, theme/sign-out controls, viewport-capped popover and accessible drawer below 1024px. Retained access/401/role redirects, source/scope storage cleanup, manager polling and sign-out retry. Operational children remain outside the application chrome scope. |
| UI specialist | [Invitation](</D:/Policy PoC/src/app/accept-invitation/page.tsx>), [invitation styles](</D:/Policy PoC/src/app/accept-invitation/page.module.css>) | Compact centered card in both modes, existing new/existing-account branches, truthful loading/pending/error/accepted/recovery states and field-level invalid styling for existing password-validation messages. Accepted inputs, timing, ref guards, request bodies, session cleanup and redirects remain unchanged. |
| Main | [Modal](</D:/Policy PoC/src/components/ui/modal.tsx>), [ActionDisclosure](</D:/Policy PoC/src/components/ui/action-disclosure.tsx>), [Toaster](</D:/Policy PoC/src/components/ui/toast.tsx>) | Approved local Motion treatment; retained specialized contracts and immediate dismissal. Global custom notifications use semantic icons, accessible close, five active seconds with hover/focus pause and opacity-only reduced motion. Dialogs preserve explicit/Escape dismissal, focus/scroll handling and caller busy restrictions. |
| Main | [Root layout](</D:/Policy PoC/src/app/layout.tsx>), [builder route wrapper](</D:/Policy PoC/src/app/builder/page.tsx>), [global styles](</D:/Policy PoC/src/app/globals.css>) | Moved the existing Toaster to the application root and removed its redundant builder wrapper. Scoped tokens, legacy fonts/paper/print styles and Suspense remain protected. Canvas/page-containing application dialogs cannot receive decorative scaling. |
| Main | [Login](</D:/Policy PoC/src/app/login/page.tsx>), [shared primitives](</D:/Policy PoC/src/components/ui/app-primitives.tsx>) | Added the approved 200ms auth entrance with matching server/client initial styles and a static reduced-motion CSS override. Corrected `aria-invalid` prop order so an undefined cloned prop cannot override a genuinely invalid field. Login requests/state and existing primitive props remain intact. |
| Main | [Manifest](</D:/Policy PoC/src/package.json>), [lockfile](</D:/Policy PoC/src/bun.lock>), this master | Motion-only installation, integration, evidence and checkpoint records. No backend/API/database/business-rule changes. |

**Scoped dialog rollout:** The shared application dialog/disclosure treatment is implemented and verified on the opted-in Inventory pilot. Existing operational page bodies and their legacy dialog contents retain their compatible styles until their authorized P3/P4/P5 migration. Builder/tooling overlays remain assigned to their specialized phases. This follows the approved opt-in protection against premature restyling and unreadable legacy content in dark portals; it does not change the final shared-dialog decision.

The [protected hash comparison](</D:/Policy PoC/tmp/redesign-p2-20261008/protected-assets.json>) checked **85 hashes: 71 fonts and 14 protected source/reference files**, all unchanged. Builder state/client logic, cover/signature tooling, document model/themes/geometry/renderers and reference documents were preserved. No document exports were restyled or claimed as revalidated in P2; the P11/P12 matrix remains required.

#### Dependency installation and bundle observation

Ran the existing Bun 1.3.14 `bun add motion --ignore-scripts` from `D:\Policy PoC\src`; [installation log](</D:/Policy PoC/tmp/redesign-p2-20261008/install.log>). Resolved Motion **14.0.0** and its required motion/framer-motion/motion-dom/motion-utils transitives. The P2-only manifest comparison adds just `motion`; the lockfile comparison has 12 additions/25 removals, including required tslib 2.8.1 hoisting/deduplication while legacy 1.14.1 remains nested where needed. Next 16.2.12, React 19.2.4 and Tailwind 4 were not upgraded. GSAP and RHF/Zod remain undeclared.

The final [production JS snapshot](</D:/Policy PoC/tmp/redesign-p2-20261008/bundle-observation.json>) references 12 Login scripts (875,169 raw bytes; 270,324 estimated gzip bytes) and 15 Inventory scripts (1,253,667 raw bytes; 353,451 estimated gzip bytes). Compared with the preserved P1 snapshot, total estimated gzip increases are 47,807 and 49,086 bytes respectively. These include all P2 client changes and shared code; they are compression estimates, not measured transfer or isolated Motion package costs. Global feedback introduces this shared client cost; public GSAP remains deferred and separately scoped.

#### Code verification

Commands ran from `D:\Policy PoC\src`. Access/signature/full-suite fixtures used an unreachable local database URL; no migrations or live database writes occurred.

| Command | Result | Evidence |
|---|---|---|
| `npm run test:access` | 80/80 pass | [Log](</D:/Policy PoC/tmp/redesign-p2-20261008/access.log>) |
| `npm run test:signatures` | 33/33 pass | [Log](</D:/Policy PoC/tmp/redesign-p2-20261008/signatures.log>) |
| `npm test` | 354 total: 331 pass, 23 unchanged baseline failures | [Log](</D:/Policy PoC/tmp/redesign-p2-20261008/npm-test.log>), [exact failing-name comparison](</D:/Policy PoC/tmp/redesign-p2-20261008/baseline-test-comparison.json>) |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Existing TS7023/TS2352 in `lib/policycraft-login-regression.test.ts`; no new diagnostics | [Log](</D:/Policy PoC/tmp/redesign-p2-20261008/typecheck.log>) |
| `node node_modules/eslint/bin/eslint.js` on nine changed TSX files | Pass | [Log](</D:/Policy PoC/tmp/redesign-p2-20261008/lint.log>) |
| `npm run build` | Pass, including production TypeScript and route generation; existing Better Auth base-URL warnings remain | [Log](</D:/Policy PoC/tmp/redesign-p2-20261008/build.log>) |
| `git diff --check` | Pass; platform line-ending warnings only | Working-tree check at submission |

The full suite's 23 failing names match P1 exactly. Existing rendering/revision failures and the two test-only TypeScript diagnostics remain explicitly open; they were not suppressed or repaired incidentally.

#### Browser, accessibility and interaction verification

Used existing Playwright Core 1.63 with installed Microsoft Edge 154.0.4258.62 against the retained `http://localhost:3000` development server. Synthetic fixtures intercepted every API request, and external origins were blocked. Evidence establishes client behavior, not live authentication, email delivery or database acceptance.

| Evidence | Passing checks | Coverage |
|---|---|---|
| [Desktop matrix](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/desktop-evidence.json>) | 67/67 | 32 captures; all three role shells/account menus, both invitation modes, inline validation/server failures, accepted/retry recovery, loading/unavailable, light/dark at 1440×900. Preserved role paths, current selection, manager open-task count, immediate logout/login recovery and entered input on theme/error changes. |
| [Responsive and regression matrix](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/extended-evidence.json>) | 67/67 | 30 captures; 320/390/768/1023/1024px, 1280×280 short screen and effective 200% reflow at 720×450. No horizontal overflow on tested migrated surfaces. Theme persistence/System preference, account genuine-breakpoint dismissal, drawer Tab/Escape/focus/scroll/inert behavior, invitation busy widths, pilot dialog/disclosure and safe-next sign-in regression. |
| [Feedback](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/feedback-evidence.json>) | 15/15 | 8 captures; success/error/info notifications in both themes, desktop/mobile placement, truthful announcement, accessible close, active-time expiry, pause beyond five wall-clock seconds on hover and keyboard focus, reduced-motion opacity and unchanged adjacent builder variables. This fixture rendered no canvases; its empty canvas comparison does not prove coordinate behavior. All builder actions and saves were intercepted fixtures. |
| [Final state refresh](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/final-states-evidence.json>) | 23/23 | 26 captures; manager/user mobile roles, invitation mobile loading/error/unavailable/accepted, relevant-field invalid state with approved error border, unchanged generic server-error treatment, recovery-heading focus, keyboard focus and SSR-stable reduced-motion Login/invitation entrances. |
| [Drawer refresh](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/drawer-refresh-evidence.json>) | 20/20 | 8 refreshed captures; all role drawers in both themes, accessible hidden title, settled viewport geometry, focus restoration and reduced motion. |
| [Targeted accessibility measurements](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/a11y-evidence.json>) | 13/13 | 79 opaque text/background samples across chrome/Inventory/invitation meet 4.5:1. Checked Helvetica stack, labels/autocomplete, 44px fields and visible 2px focus with 2px offset. Disabled/transparent compositions, all legacy page bodies and document content are outside this sample. |

**205/205 checks pass.** Accepted runs report no runtime page errors, hydration/control warnings or unmapped API requests. Actual browser zoom was not measured; the 720×450 capture is CSS reflow equivalent. Accessibility coverage is targeted, not WCAG certification. Canvas geometry is protected by scoped CSS/source preservation and still requires the specialized browser fixtures in P7/P8/P11. Builder/GSAP breakpoint and export matrices remain assigned to their future phases.

All **94 unique final screenshots** were visually inspected through the [inspection index](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/review-images.json>), with relevant full-size checks. Corrected the header's extra pixel, same-state screenshot breakpoint dismissal, short-screen popover containment, field error semantics, control/popover radii, reduced-motion SSR mismatch and the visible drawer-title overlap. Refreshed captures wait for fonts, opacity, relevant border transitions and settled drawer transforms. Intermediate/debug images are excluded from acceptance evidence. Retained cream/green operational bodies and builder styling are intentional future-phase boundaries.

#### Desktop-first review evidence

| Surface / state | Light | Dark |
|---|---|---|
| Admin Inventory with new shell | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/workspace-admin-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/workspace-admin-desktop-dark.png>) |
| Account / theme controls | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/workspace-admin-account-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/workspace-admin-account-desktop-dark.png>) |
| New account invitation | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/invitation-new-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/invitation-new-desktop-dark.png>) |
| Existing account invitation | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/invitation-existing-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/invitation-existing-desktop-dark.png>) |
| Notification / success | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/toast-success-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p2-20261008/toast-success-desktop-dark.png>) |

#### Standards review

Read-only P2 comparison against the accepted P1 snapshot found **zero hard documented-standard violations**. One nonblocking possible duplicated-code smell remains: desktop/mobile navigation share the same existing active-route predicate. This is a maintenance heuristic, not a correctness violation or justification for changing role paths. Browser evidence verifies both role presentations. No broad cleanup was performed.

#### Specification review

Read-only review found **zero confirmed blocking specification findings**. Role/access/session/storage contracts and P2 dependency/surface boundaries were preserved. The review raised the context-opt-in dialog rollout as an acceptance limitation; its explicit migration boundary is recorded above. P2 implements shared treatment on the participating pilot while retaining compatible legacy bodies until their authorized feature migration. QA found and corrected the concrete focus/style/hydration issues before submission.

**P2 submission and acceptance:** P2 was submitted for desktop-first review. The user's subsequent “approved” reply accepted P2 and released **P3 — Workspaces and operational records** only. P2 is checked complete. Baseline test/typecheck failures, fixture-only auth/data evidence, sampled accessibility, shared client bundle growth and unverified export/Word appearance remain recorded limitations. No deployment is authorized.

### P3 progress record — 2026-10-08

- **Authorization:** User replied “approved” to the accepted P2 checkpoint and release request for P3. P4 remains unauthorized.
- **Priority and protection:** Desktop implementation and visual review first, followed by the approved responsive QA contract. Preserve source-aware organization scoping, filters, active/archive behavior, ownership, routes and existing actions. Conventional form-library migration remains P4; tasks, builder and outputs remain in their separate phases.
- **Accepted baseline:** Preserved 708 source/configuration files and working-tree status before P3 application edits in [baseline record](</D:/Policy PoC/tmp/redesign-p3-20261008/baseline.json>). All accepted P1/P2 changes remain in the shared working tree.
- **Ownership:** Read-only architecture mapping preceded implementation. UI specialists owned drafts/manager records and admin/organization lists in separate files; main owned scoped root integration, conditional assignment-picker visuals, shared skeleton, evidence and this record. No P3 packages are scheduled or installed.
- **Guidance:** Root/nested guidance, explicit `ask-matt` routing, installed Next CSS/client-boundary documentation, `frontend-skill` app-UI guidance and current Web Interface Guidelines were applied without changing approved decisions. Read-only standards/specification review compared against the accepted P2 working tree, rather than the earlier Git HEAD. `diagnosing-bugs` was used for the measured rename focus regression.
- **Result:** `AWAITING_USER_REVIEW`. Implementation, focused verification and the evidence below are ready for acceptance with recorded baseline limitations. P3 remains unchecked until user acceptance, and P4 remains unauthorized.

#### Implemented surfaces and ownership

| Owner | Files / surface | Completed work and preserved behavior |
|---|---|---|
| UI specialist | [Drafts](</D:/Policy PoC/src/app/dashboard/page.tsx>), [styles](</D:/Policy PoC/src/app/dashboard/page.module.css>) | Scoped application styling, flat policy-type groups, aligned actions and thumbnails, shared rename/delete dialogs, announced load/error states and initial-record skeleton. `/drafts` still reexports the dashboard page. Preserve grouping, filters, active/archive, scoped builder links, title trim/255-character limit, lock-version conflicts, archive/restore and archived-only deletion. |
| UI specialist | [Manager policies](</D:/Policy PoC/src/app/manager/page.tsx>), [styles](</D:/Policy PoC/src/app/manager/page.module.css>) | Approved operational typography, native organization selection, filter/search presentation, policy rows and dialogs. Preserve assigned-org requests, source/creator metadata, complete aggregate loading or error, query/history behavior, request-generation isolation, archive payloads and scoped builder handoff. |
| UI specialist | [Manager roster](</D:/Policy PoC/src/app/admin/page.tsx>), [styles](</D:/Policy PoC/src/app/admin/page.module.css>) | Aligned desktop table/mobile records, existing status meanings and labels, expiry/delivery information, action disclosure and scoped dialog contents. Preserve query/status filtering, assignments, access controls, invitation resend/cancel and action restrictions. |
| UI specialist | [Organization lists](</D:/Policy PoC/src/components/workspace/organization-listing.tsx>), [styles](</D:/Policy PoC/src/components/workspace/organization-listing.module.css>), [section navigation](</D:/Policy PoC/src/components/workspace/organization-section-navigation.tsx>), [navigation styles](</D:/Policy PoC/src/components/workspace/organization-section-navigation.module.css>) | Scoped ESG/PolicyCraft list presentation, approved selection marker, readable source badges, search and grouped actions. Preserve source separation, created notices, unavailable records, routes and local filtering. |
| Main | [Assignment picker](</D:/Policy PoC/src/components/workspace/organization-manager-assignment.tsx>), [styles](</D:/Policy PoC/src/components/workspace/organization-manager-assignment.module.css>) | Apply new visual classes only within an application surface; retain original classes on unmodified form/detail pages. Preserve active-manager search, additive assignment payload, inline errors, pending restrictions and focus restoration. |
| Main | [Record skeleton](</D:/Policy PoC/src/components/ui/record-skeleton.tsx>), [styles](</D:/Policy PoC/src/components/ui/record-skeleton.module.css>), [root CSS](</D:/Policy PoC/src/app/globals.css>) | Decorative initial-record placeholders pulse twice over four seconds, then stop; static under reduced motion. Truthful loading status remains. Opted-in workspace backgrounds match approved light/dark tokens without altering document/legacy variables. |

**P3/P4 boundary:** Organization navigation opts in independently; the organization layout and dedicated new/edit/access/account form bodies remain unchanged. Existing Admin Policy Inventory is retained and regression checked. No RHF/Zod migration, task polish, builder change, document styling or route-transition enablement is included.

The [accepted-source and protected-asset comparison](</D:/Policy PoC/tmp/redesign-p3-20261008/integrity.json>) checks **708 accepted source/configuration hashes**, finding only the seven intended existing UI files changed. Eight scoped UI/style files were added. All **85 protected hashes, including 71 fonts**, remain unchanged; manifest and lockfile are unchanged. Authentication, APIs, database code, builder state and output contracts are preserved. Test failing names match accepted P2 exactly.

#### Code verification

Commands ran from `D:\Policy PoC\src`. Tests used an unreachable local database URL; no migrations or live writes occurred.

| Command | Result | Evidence |
|---|---|---|
| `npm run test:access` | 80/80 pass | [Log](</D:/Policy PoC/tmp/redesign-p3-20261008/access.log>) |
| `npm run test:organizations` | 41/41 pass | [Log](</D:/Policy PoC/tmp/redesign-p3-20261008/organizations.log>) |
| `npm run test:signatures` | 33/33 pass | [Log](</D:/Policy PoC/tmp/redesign-p3-20261008/signatures.log>) |
| `npm test` | 354 total: 331 pass, 23 unchanged baseline failures | [Log](</D:/Policy PoC/tmp/redesign-p3-20261008/npm-test.log>), [exact failing-name comparison](</D:/Policy PoC/tmp/redesign-p3-20261008/integrity.json>) |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Existing test-only TS7023/TS2352 in `lib/policycraft-login-regression.test.ts`; no new diagnostics | [Log](</D:/Policy PoC/tmp/redesign-p3-20261008/typecheck.log>) |
| `node node_modules/eslint/bin/eslint.js` on the seven changed/new TSX files | Pass after final corrections | [Log](</D:/Policy PoC/tmp/redesign-p3-20261008/lint.log>) |
| `npm run build` | Pass after final corrections; existing Better Auth base-URL warnings remain | [Log](</D:/Policy PoC/tmp/redesign-p3-20261008/build.log>) |
| `git diff --check` | Pass; platform line-ending warnings only | [Log](</D:/Policy PoC/tmp/redesign-p3-20261008/diff-check.log>) |

The 23 existing rendering/revision failures and two test-only TypeScript diagnostics were not suppressed or repaired incidentally. Export appearance remains assigned to P11/P12.

#### Browser and visual QA

Used existing Playwright Core 1.63 and installed Microsoft Edge 154.0.4258.62. Final QA runs against an isolated production preview on `127.0.0.1:3018`, with an unreachable database URL and every API fulfilled by synthetic fixtures; external origins are blocked. The user's development server on port 3000 is retained. Development chunk/HMR failures and diagnostic screenshots are excluded from acceptance evidence. This establishes client behavior, not live authentication, database or email acceptance.

| Evidence | Passing checks | Coverage |
|---|---|---|
| [Desktop matrix](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/desktop-evidence.json>) | 52/52 | 34 captures; drafts, manager policies, manager roster, ESG/PolicyCraft organizations and adjacent Admin Inventory at 1440×900, light/dark. Typography, scoped source records, thumbnails within unchanged paper planes, actions, menus and dialogs. Assignment checklist/badges fit the dialog. |
| [State matrix](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/states-evidence.json>) | 48/48 | 32 captures; initial loading, announced errors, genuine empty lists and manager no-assignment state in both themes. Skeletons are decorative and finite; failed draft loading does not also claim an empty list. |
| [Responsive matrix](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/responsive-evidence.json>) | 168/168 | 54 captures; 320/390/600/768px, navigation at 1023/1024px, effective 200% reflow at 720×450 and 1280×280 short screen. Tested controls remain inside the viewport, dialog footers remain reachable and Escape restores scrolling. |
| [Action matrix](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/actions-evidence.json>) | 50/50 | 14 captures; rename trim/255-character limit, lock-version conflict/input retention, stable busy width/Escape guards, archive/restore, archived-only deletion/error recovery, additive manager assignment, search/source switching and trigger-focus restoration. All mutations intercepted. |
| [Accessibility/theme matrix](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/a11y-evidence.json>) | 158/158 | 16 captures; associated field labels, approved computed fonts, 2px focus/offset, dialog Tab/Shift+Tab containment, Escape/restoration/scroll lock and explicit dismissal. Saved theme overrides persist, System follows device preference and entered search/picker input survives theme changes. Reduced-motion skeletons are static and dialog scaling is suppressed. |

**476/476 dedicated UI checks pass**, with **150 unique captures**. Final accepted matrices report no runtime/hydration warnings, unmapped API requests or recorded critical resource failures. [Aggregate results](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/summary.json>). Contrast measurements cover **1,336 opaque text/background samples**, each meeting at least 4.5:1; disabled/transparent compositions and document content are excluded. Browser platform-font measurements confirm Arial, an approved Helvetica-stack fallback, for sampled headings, filters and links: [font evidence](</D:/Policy PoC/tmp/redesign-p3-20261008/probe-fonts.log>).

**Broader workflow limitation:** The copied existing workspace flow passes its preceding roster/assignment/inventory assertions, then stops waiting for the manager's search query to commit to the URL; later assertions are not represented as passed. [Flow log](</D:/Policy PoC/tmp/redesign-p3-20261008/existing-flow.log>). The minimal probe confirms local title filtering and entered input work, the 250ms timer fires and `router.replace` receives the correct scoped URL, but it does not commit within the same twelve-second window. This also reproduces against the isolated accepted P2 snapshot: [P2 comparison](</D:/Policy PoC/tmp/redesign-p3-20261008/search-comparison-accepted-p2.json>), [P3 comparison](</D:/Policy PoC/tmp/redesign-p3-20261008/search-comparison-p3.json>). Search debounce/query code is unchanged. The exact Next/runtime cause and live-session impact are unestablished; no routing replacement, framework upgrade or business-logic change was made to force a pass. This is an explicit baseline limitation for review, not complete workflow acceptance.

The comparison snapshot reuses installed dependencies and unchanged protected public assets, with fixture-only server settings. Its copied Next configuration required a scratch-only bundler root for the dependency junction; application configuration and sources are unchanged. [Comparison build](</D:/Policy PoC/tmp/redesign-p3-20261008/runtime-baseline-build.log>). Temporary comparison and P3 production previews were stopped after QA; the user's development server was retained.

The **150-capture set** was visually inspected through the [inspection index](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/review-images.json>), with relevant full-size checks and targeted rechecks after corrections. Fixed fieldset minimum-width clipping of source badges. The apparent scrim offset in scrolled full-page images was a capture artifact; final dialog images normalize scrolling, use viewport captures and measure overlay bounds. A premature unstyled reduced-motion capture was excluded and refreshed after explicit stylesheet readiness. Fonts, finite animations and modal geometry settle before accepted captures. Diagnostic/intermediate images are excluded.

#### Desktop-first review evidence

| Surface / state | Light | Dark |
|---|---|---|
| User drafts | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/drafts-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/drafts-desktop-dark.png>) |
| Manager policies | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/manager-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/manager-desktop-dark.png>) |
| Manager roster | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/admin-managers-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/admin-managers-desktop-dark.png>) |
| ESG organizations | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/organizations-esg-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/organizations-esg-desktop-dark.png>) |
| PolicyCraft organizations | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/organizations-policycraft-desktop-light.png>) | [Screenshot](</D:/Policy PoC/src/output/playwright/redesign-p3-20261008/organizations-policycraft-desktop-dark.png>) |

#### Review and checkpoint

Read-only standards review found no unresolved hard findings or material optional smells; specification review found no confirmed blocking findings. Review corrections include scoped Helvetica headings, dark portal contents, cancel/primary mobile order, 2px focus offsets, initial-only finite skeletons, thumbnail containment, stable busy widths, fieldset containment and distinct load-error/empty presentation. A browser focus trace showed rename-field `autoFocus` ran before Modal captured the trigger; deferred field focus fixes restoration while keeping initial field focus and the shared Modal unchanged. Targeted visual recheck confirms assignment badges and final viewport scrims fit in light/dark modes.

Organization lists retain their existing nonvirtualized rendering; large-list performance is not established by these fixtures. Accessibility sampling is targeted, not WCAG certification. Actual browser zoom and PDF/DOCX/Word appearance are not claimed. Later builder, canvas, public GSAP, native routing and output phases retain their required specialized checks.

Final integrity/record validation found no unexpected source changes, missing local evidence links or trailing whitespace in the master, execution pointer and eight new UI/style files. Both temporary previews are stopped; no commit or deployment was performed.

**Checkpoint:** P3 is submitted for desktop-first user review with the baseline limitations above. Completion of focused QA does not authorize P4. User acceptance must explicitly release **P4 — Conventional forms**; deployment is not authorized. The checklist remains unchecked until acceptance.

### P4 progress record — 2026-10-08

- **Authorization:** User instruction “dont ask me anything and complete till p7” releases serial P4–P7 execution and supersedes intermediate approval questions. Desktop first remains required. P8 onward is excluded.
- **Baseline:** 716 accepted source/configuration files saved before P4 in [snapshot](</D:/Policy PoC/tmp/redesign-p4-20261008/baseline.json>). Existing builder-page Toaster removal matches the root application-wide provider; it is preserved as pre-existing work.
- **Ownership:** Architect mapped contracts read-only. Auth specialist owns login/invitation; operational specialist owns organization editor and manager/admin forms. Main owns packages, records, integration and browser evidence.
- **Dependencies:** Installed only RHF 7.89.0, Zod 4.6.5 and resolvers 5.9.1 through existing Bun with scripts disabled. Sandbox Bun attempts failed with ENOENT; authorized escalation succeeded. No rejected packages or framework upgrades.
- **Status:** AWAITING_USER_REVIEW; implementation and phase QA complete. Advancement through P7 is already explicitly authorized; individual visual acceptance is not implied.

#### P4 completed implementation and verification

Conventional login/invitation, manager creation, administrator confirmation and organization profile forms now use the approved RHF/Zod stack while retaining native constraints, accepted inputs, validation timing, API payloads, pending restrictions and redirects. Organization field-array keys remain separate from persisted site IDs; multipart profiles/logo uploads, lock versions, dirty-input conflicts and explicit reload remain intact. Existing-account grants use the currently selected organization IDs with the reviewed account identity. Assignment actions retain their established non-form contracts. Builder forms are unchanged.

Scoped styles cover [manager creation](</D:/Policy PoC/src/app/admin/managers/new/page.tsx>), [administrator access](</D:/Policy PoC/src/app/admin/administration/page.tsx>), [organization editor](</D:/Policy PoC/src/components/workspace/standalone-organization-editor.tsx>), [login](</D:/Policy PoC/src/app/login/page.tsx>) and [invitations](</D:/Policy PoC/src/app/accept-invitation/page.tsx>). Organization load/error wrappers opt in independently. Approved typography, fields, border-based panels, semantic colors and mobile dialog action stacking are consistent. Review corrected dark portal text, manager success contrast, legacy background/font leakage, inherited bold input text and fragmented mobile organization names. No global document variables or fonts changed.

| Check | Result | Evidence |
|---|---|---|
| Focused ESLint on seven affected TSX files | Pass | [Log](</D:/Policy PoC/tmp/redesign-p4-20261008/lint.log>) |
| Access tests | 80/80 pass | [Log](</D:/Policy PoC/tmp/redesign-p4-20261008/access.log>) |
| Organization tests | 41/41 pass | [Log](</D:/Policy PoC/tmp/redesign-p4-20261008/organizations.log>) |
| TypeScript | Only existing TS7023/TS2352 in login regression test; no introduced diagnostics | [Log](</D:/Policy PoC/tmp/redesign-p4-20261008/typecheck.log>) |
| Final production build / diff whitespace | Pass | [Build](</D:/Policy PoC/tmp/redesign-p4-20261008/build.log>), [diff check](</D:/Policy PoC/tmp/redesign-p4-20261008/diff-check.log>) |
| Integrity | 716 baseline hashes, ten intended existing files changed; 85 protected hashes unchanged | [Record](</D:/Policy PoC/tmp/redesign-p4-20261008/integrity.json>) |

Browser QA used an isolated production preview with unreachable database settings, intercepted synthetic API responses and blocked external origins. [Main matrix](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/evidence.json>) passes 168 checks/47 captures, [additional states](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/extra-evidence.json>) passes 59 checks/eight captures, and [invitation recovery](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/extra-auth-evidence.json>) passes 27 checks/four captures. **254 checks, 59 captures and 2,335 opaque contrast samples pass.** Final runs report zero runtime errors, hydration/control warnings or unmapped API requests.

Desktop 1440×900 and mobile 390×844 light/dark evidence includes normal/error/loading/empty/conflict/confirmation states, narrow/tablet/reflow layouts, native required focus, theme persistence with entered input, reduced motion, dialog keyboard containment/Escape/restoration/scroll locking and explicit dismissal. Tests cover existing invitation sign-in failure without acceptance, exact empty acceptance payload, new-account password payload, sign-out recovery and locked invited-email scoped login. Multipart logo/site edits and creation redirect are verified. Screenshots were visually inspected; refreshed mobile selector and recovery captures passed targeted recheck. [Inspection index](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/review-images.json>).

Desktop review examples: [organization light](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/organization-new-desktop-light.png>), [organization dark](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/organization-new-desktop-dark.png>), [manager light](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/manager-new-desktop-light.png>), [manager dark](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/manager-new-desktop-dark.png>).

Read-only standards and specification reviewers found no remaining hard findings after corrections. Evidence establishes fixture client behavior, not live authentication/email/database acceptance. Contrast/keyboard coverage is targeted, not WCAG certification; reflow checks do not establish actual browser zoom. Existing test/typecheck and prior manager-query runtime limitations remain recorded. No commit or deployment occurred. **P5 may advance under the explicit through-P7 authorization; P4 visual acceptance remains available for user review.**

P4 cold-page JavaScript observations include shared/framework chunks: Login 1,199,516 decoded bytes (337,286-byte gzip estimate), manager creation 1,736,945 (464,416 estimate), organization creation 1,764,369 (473,529 estimate). These are response-body/gzip observations, not measured transport transfer or a P3 delta; a comparable accepted P3 cold-load sample is unavailable. [Bundle record](</D:/Policy PoC/src/output/playwright/redesign-p4-20261008/bundle-observations.json>). No additional libraries were introduced outside the approved P4 schedule.


### P5 progress record — 2026-10-08

- Authorization: P4 QA complete; user explicitly preauthorized serial execution through P7.
- Baseline: 719 accepted source/configuration files saved in [snapshot](</D:/Policy PoC/tmp/redesign-p5-20261008/baseline.json>).
- Ownership: UI specialist owns four task UI/stylesheet files; main owns integration, evidence and records. Architect impact map completed before implementation.
- Dependencies: none introduced; reuse approved form/Motion/primitives.
- Baseline workflow: task tabs and status URL/reload pass; clear-filter URL commit fails on the pre-P5 production build. [Original baseline log](</D:/Policy PoC/tmp/redesign-p5-20261008/baseline-flow.log>). Remaining independent scenarios pass after explicit clean-route navigation, including saved-progress and completion guards. [Remaining baseline log](</D:/Policy PoC/tmp/redesign-p5-20261008/baseline-remaining-flow.log>). This does not establish clear-filter navigation acceptance.
- Status: AWAITING_USER_REVIEW; implementation and phase QA complete. P6 advancement is preauthorized; visual acceptance is not implied.

#### P5 completed implementation and verification — 2026-10-09

Tasks retain flat summaries, desktop tables/mobile rows, native deadlines, status/progress and existing actions. Scoped application tokens and shared form/primitives now cover task records and dialogs. RHF/Zod validation remains submit-only; labels/errors are associated, accepted payloads and eligibility restrictions are preserved. History reopens fetch fresh events; decorative expansion does not cache stale history. Tab markers, panel fades and history motion follow the approved timings. Loading pulses use two 2-second cycles, then stop while truthful loading text remains; reduced-motion loading is static.

Final visual corrections clear the search icon with scoped 36px input padding, keep native filter values readable on narrow screens, and apply approved 44px operational fields and 14px table text. Dialogs retain viewport-capped internal scrolling. Short-screen and validation captures show both top and footer positions; measured dialog bounds remain inside 16px gutters and primary actions are fully reachable. These scroll states do not indicate the dialog extending outside the viewport. No shared Modal geometry was changed.

| Check | Result | Evidence |
|---|---|---|
| Task tests | 32/32 pass | [Log](</D:/Policy PoC/tmp/redesign-p5-20261008/tasks.log>) |
| Focused ESLint | Pass on three task TSX files | [Log](</D:/Policy PoC/tmp/redesign-p5-20261008/final-lint.log>) |
| TypeScript | Only existing TS7023/TS2352 test diagnostics | [Log](</D:/Policy PoC/tmp/redesign-p5-20261008/typecheck.log>) |
| Current production build | Pass | [Log](</D:/Policy PoC/tmp/redesign-p5-20261008/final-build.log>) |
| Phase integrity / diff check | Four intended task files; no unexpected changes; 85 protected hashes unchanged; manifest/lock unchanged | [Integrity](</D:/Policy PoC/tmp/redesign-p5-20261008/integrity.json>), [diff check](</D:/Policy PoC/tmp/redesign-p5-20261008/diff-check.log>) |
| Browser matrix | 276 passing checks, 52 captures, 5,182 opaque contrast samples; no runtime/hydration warnings or unmapped APIs | [Evidence](</D:/Policy PoC/src/output/playwright/redesign-p5-20261008/evidence.json>) |
| Finite/reduced motion | Three passing checks | [Evidence](</D:/Policy PoC/src/output/playwright/redesign-p5-20261008/motion-evidence.json>) |
| Existing workflow remainder | Pass, including task start, independent policy, offline/conflict/stale guards and save before completion | [Log](</D:/Policy PoC/tmp/redesign-p5-20261008/remaining-flow.log>) |
| Dialog bounds/fonts | Viewport gutters, reachable actions and approved Helvetica stack measured | [Evidence](</D:/Policy PoC/src/output/playwright/redesign-p5-20261008/dialog-bounds.json>) |

Desktop/mobile light/dark states include tasks and manager work, normal/loading/empty/error, selected filters/tabs, history, creation/reassignment/reopening, validation, short screens and reduced motion. Keyboard/focus, busy width/Escape restrictions, policy-dependent eligibility, deadline payloads, history freshness and builder handoff are tested with intercepted fixtures. All write responses are synthetic; this does not establish live authentication, database or AI acceptance. Accessibility sampling is targeted, not WCAG certification; actual browser zoom is not claimed.

The clear-filter URL issue is reproduced on the accepted P4 production baseline and excluded from acceptance. Clean-route navigation permits independent remaining scenarios without changing routing logic. Standards/specification review found no remaining hard findings after corrections. All nine final contact sheets and five targeted full-size captures in the [52-capture inspection index](</D:/Policy PoC/src/output/playwright/redesign-p5-20261008/review-images.json>) passed visual review. Desktop examples: [admin light](</D:/Policy PoC/src/output/playwright/redesign-p5-20261008/admin-normal-light-desktop-1440x900.png>), [admin dark](</D:/Policy PoC/src/output/playwright/redesign-p5-20261008/admin-normal-dark-desktop-1440x900.png>), [manager dark](</D:/Policy PoC/src/output/playwright/redesign-p5-20261008/manager-normal-dark-desktop-1440x900.png>).

### P6 progress record — 2026-10-09

- Authorization: P5 implementation and QA complete; user explicitly released serial continuation through P7.
- Preparation: [Read-only impact map](</D:/Policy PoC/tmp/redesign-p6-20261008/impact-map.md>) confirms scope, ownership, autosave/state contracts and document/canvas exclusions. Baseline source snapshot precedes application changes.
- Ownership: Builder UI specialist owns builder-specific chrome, inspector and authoring files; main owns shared UI adapters, root styling, integration, evidence and records.
- Dependencies: none required; reuse previously installed approved libraries. GSAP remains deferred to P9.
- Status: AWAITING_USER_REVIEW. Implementation, focused checks, production build and final browser/visual QA are complete. P7 advancement is already explicitly authorized; individual visual acceptance is not implied.

Builder-specific work includes independent scrolling, 272/68px desktop workflow navigation, the 280px narrow drawer, 360px inspector, theme controls, accessible local navigation and setup/authoring treatment. Main integrated scoped Button/Panel/Field/calendar/AI-control adapters; builder state and grammar contracts remain intact. Source review resolved label association, inactive combobox ArrowUp, drawer focus and mobile inspector motion. Browser rework resolved dark primary/control contrast and external preview-dialog Escape/Tab ownership. No dependencies were added.

#### P6 completed implementation and verification

The focused calendar/autosave/storage/task-progress checks pass 16/16; signatures pass 33/33. Focused shared/builder ESLint and the final company-header lint pass. Standalone TypeScript retains only the recorded TS7023/TS2352 diagnostics in the existing login-regression test. The final production build passes. [Phase integrity](</D:/Policy PoC/tmp/redesign-p6-20261008/integrity.json>) records 21 intended existing-file changes and four new UI/style files, no unexpected changes, 83 unchanged protected hashes and the two explicitly authorized UI-source changes (`Input` and `BuilderClient`). Manifest/lock, immutable output/state contracts and font assets are preserved.

Browser QA used installed Edge against an isolated production preview with intercepted API fixtures and blocked external origins. [Builder matrix](</D:/Policy PoC/src/output/playwright/redesign-p6-20261008/evidence.json>) passes 58 checks/nine captures; [authoring/setup/inspector matrix](</D:/Policy PoC/src/output/playwright/redesign-p6-20261008/extras-evidence.json>) passes 290 checks/134 captures and 7,440 opaque text/control contrast samples; [motion and adjacent pilots](</D:/Policy PoC/src/output/playwright/redesign-p6-20261008/motion-evidence.json>) passes 30 checks/18 captures. Final visual review inspected all 28 contact sheets plus targeted full-size desktop, mobile, task, preview-overlay, Login and Admin Inventory images. It found one narrow company-card header defect; the final scoped correction stacks its badge below the title/description below 640px. [Targeted final recheck](</D:/Policy PoC/src/output/playwright/redesign-p6-20261008/company-setup-targeted-recheck.json>) passes six checks/captures at 1440, 390 and 320px in both modes. All six final captures were inspected and the defect is closed. **384 browser checks pass**, with no recorded runtime, hydration or unmapped-API failures.

Checks cover 272/68/360px desktop geometry, 1199/1200px behavior, scroll/shortcuts/collapse persistence, policy-dependent steps, keyboard and field associations, calendar/combobox interaction, theme persistence with unsaved input, finite/reduced motion, preview-canvas geometry, focus containment/restoration, nondismissive backdrop, Escape ownership and scroll locking. Dark-control contrast, grouped labels, drawer focus and external-dialog ownership were corrected. P7 workflow/library bodies retain scoped legacy styling until their phase; application aliases do not leak into paper previews or canvas planes.

Assigned-task regression passes including start/builder handoff, independent policies, offline/conflict/stale saves blocking completion and save-before-complete. Its [log](</D:/Policy PoC/tmp/redesign-p6-20261008/tasks-regression.log>) retains the accepted clear-filter URL baseline limitation; the clean-route workaround does not establish a fix. All 16 actual HTML paper fingerprints (eight themes × two application modes) match the accepted P5 baseline in [paper record](</D:/Policy PoC/tmp/redesign-p6-20261008/paper-current.json>). These establish sampled HTML styling/geometry, not PDF/DOCX appearance. Synthetic PDF preview checks establish client lifecycle/planes only; live authentication/database/AI, actual browser zoom and WCAG certification are not claimed. Standards/specification review has no remaining hard findings. No commit or deployment occurred.

### P7 progress record — 2026-10-09

- Authorization: P6 implementation and final QA complete; the user explicitly authorized serial continuation through P7 without questions, then released the whole remaining roadmap on 2026-10-09. P8 begins only after P7 QA completes.
- Preparation: [Read-only cover/AI impact map](</D:/Policy PoC/tmp/redesign-p6-20261008/p7-impact-map.md>) and UI preparation confirm ownership, geometry/state/autosave boundaries and fixture requirements.
- Ownership: One builder UI specialist owns cover editor, AI workflow/library/loader and narrow integration seams. Main owns root styling, integration, evidence, dependencies and records. No overlapping edits.
- Dependencies: none required; no packages installed. GSAP remains deferred to P9.
- Status: AWAITING_USER_REVIEW. Implementation, production build, browser state/interaction checks and final screenshot inspection are complete. P8 advancement is preauthorized by the whole-roadmap execution override; individual visual acceptance remains pending.

#### P7 completed implementation and verification — 2026-10-09

Cover tools, properties, layers, templates, readiness status and AI workflow/library use the approved authoring palette, typography, spacing and responsive grouping. The stationary AI page reveals text for two 2.4-second cycles, then stops decoration while retaining truthful busy status; reduced motion uses static artwork. Shared template/discard/delete dialogs preserve explicit dismissal, focus, scroll locking and the approved motion treatment.

Browser testing found and corrected two presentation/interaction defects: editor canvas layers intercepted a discard dialog, resolved by local stacking isolation without changing geometry; and a fixed color picker escaped the tablet drawer's viewport. The first viewport correction used a body portal; a follow-up P8 integration check found that Tab could leave the mobile modal drawer. The final correction removes the drawer's retained identity transform after its approved slide entrance, allowing the picker to remain inside the drawer while keeping viewport positioning and native keyboard order. This adjacent regression requires fresh browser proof in P8. Source review also closed the tab-arrow canvas-nudge conflict and an overly broad suppression of standard modal scale.

The final local production build and focused UI lint pass. Cover/AI tests pass **45/45**; signatures pass **33/33**; `git diff --check` passes. The full suite remains **331/354**, with the identical **23 pre-existing failures** recorded in [baseline comparison](</D:/Policy PoC/tmp/redesign-p7-20261008/test-baseline-comparison.json>). The two existing TypeScript diagnostics remain separately recorded. Integrity checks confirm only ten authorized UI files changed, with **175 rendering/state files and 71 font assets unchanged**; package manifest and lockfile are unchanged.

Final browser evidence is **405 passing checks / 140 inspected captures**: primary geometry/workflow 38/14, supplemental state/responsive 330/118, and adjacent Login/Admin Inventory 37/8. Accepted runs have zero runtime errors, failures or unmapped API traffic. Desktop/mobile light/dark, narrow/tablet/short screens, reduced motion, modal/picker focus and scroll lifecycle, private synthetic assets, library ownership/active-cover guards, retry recovery and theme-preserved edits are covered. All **16 HTML paper comparisons** across eight themes and both app modes match the accepted baseline. See the [desktop-first screenshot index](</D:/Policy PoC/src/output/playwright/redesign-p7-20261008/review/index.md>) and [integrity record](</D:/Policy PoC/tmp/redesign-p7-20261008/integrity.json>).

Every write in browser QA was intercepted and kept in memory; live database/authentication/AI-service and Word/export appearance acceptance are not claimed. Earlier failed harness diagnostics remain separate from final passing evidence. No commit or deployment occurred.

### P8 progress record — 2026-10-09

- Authorization: P7 implementation and visual QA complete; the latest whole-roadmap user instruction releases serial P8 execution.
- Preparation: [Signature UI handoff](</D:/Policy PoC/tmp/redesign-p8-20261009/ui-preparation.md>); source/configuration baseline preserved before application edits.
- Ownership: builder UI specialist owns `signature-maker.tsx`, optional local styling and only necessary Responsibilities spacing. Main owns integration, evidence, dependencies and records, plus the narrowly scoped P7 picker keyboard-containment correction in `theme-inspector.tsx`, `design-inspector.module.css` and `design-inspector.tsx`. Signature APIs, storage, request scopes, artwork generation and export contracts remain protected.
- Dependencies: none introduced; GSAP remains deferred to P9.
- Status: QA_PENDING. The approved capture/preview/library composition is implemented; complete browser/visual QA before advancing.

#### P8 continuation and remaining QA — 2026-10-09

The user reaffirmed continuation from P8 through P13, then directed use of the local database configuration in `.env` and Computer Use with their local browser. No environment file or database was modified. Browser-driven saves/deletes still require synthetic fixtures or a deliberately isolated QA record; existing user signatures and policies must be preserved. No deployment or commit occurred.

Fresh code-only validation from `src/`: `npm.cmd run test:signatures` passes **33/33**; `npx.cmd eslint components/builder/signature-maker.tsx components/builder/design-inspector.tsx components/builder/theme-inspector.tsx` exits 0. From the repository root, `node tmp/redesign-p8-20261009/check-signature-contracts.mjs` confirms **15 unchanged helper contracts**, `node tmp/redesign-phase-integrity.mjs p8` confirms only the four intended UI files changed, **168 immutable files and 71 font assets unchanged**, and `git diff --check` exits 0 (existing line-ending warnings only). The previously saved production build is successful; it was not repeated during this continuation because application code did not change.

Existing viewport diagnostics report 86 checks and 12 captures with no failures, but the inspected screenshots do not show the signature editor below the Responsibilities content and do not establish P8 visual acceptance. Existing picker JSON records show containment at 768/light, 390/dark and 320/light; these are prior artifacts, not a fresh regression run. The full signature harness is prepared but has not completed its full matrix. Actual signature-state capture/inspection, type/draw/upload/library behavior, font readiness, transparent artwork, exact scope/stale requests, error recovery, keyboard upload, malformed-image handling, delayed writes across scope changes and export preparation remain required. Unit export tests pass, but that is distinct from browser export preparation and rendered output proof.

Tool blocker: sandbox preview startup failed with `EADDRINUSE`; the required escalated launch was rejected, including the retry using `.env`. At the user's subsequent direction, Computer Use detected the local **Brave Browser** but failed to enumerate its tabs with **“Unable to load browser request-header policy. Retry the browser command.”** The same error occurred on retry and after resetting the Computer Use JavaScript session. Native computer APIs are disabled in this session, so no native-window fallback was attempted. No browser page was inspected or operated during this continuation. Restore the local browser connection before resuming P8 QA; P9–P13 remain preauthorized in serial order, with no application changes or package installs started for those phases.

### Resumed P8–P13 execution — 2026-10-09

The local Brave connection subsequently recovered. The user directed continuation with the remaining implementation while retaining explicit QA carryover, then waived mobile QA. The local app used its existing `.env` database setup and authenticated admin session. No migration, environment edit, deliberate policy/signature save/delete/upload, commit or deployment was performed. Builder viewing may invoke existing autosave; this record does not establish a zero-write database audit.

P8 fresh targeted Computer Use checks cover all five typed styles, preview in both application modes, disabled empty Apply, unsaved draw/Undo/Redo/Clear, capture/library composition and inspector color-picker Tab/Escape containment. Signature tests pass 33/33; signature helper contracts and protected fonts remain unchanged. Persistence, actual uploads, delayed writes, stale scope responses and the full browser export-preparation matrix remain unverified. [Local record](</D:/Policy PoC/tmp/redesign-p8-20261009/local-browser-review.md>).

P9 delivers the public homepage and scoped three-phase GSAP walkthrough. Public navigation, access lookup and admin CTA remain intact. Pinning applies only at the approved desktop dimensions with motion permitted; normal-flow alternatives retain readable phase content. Fresh local browser evidence covers desktop light/dark, pinning boundary checks at 1024×720, normal flow at 1023×720 and 1024×719, cleanup and all eight theme descriptions. Independent Standards/Spec rechecks found no hard issue. The final production build passes. Other-role/sign-out/access-error and runtime forced reduced-motion fixtures remain unverified; historical mobile checks are retained but further mobile QA is waived. [Browser record](</D:/Policy PoC/tmp/redesign-p9-20261009/local-browser-review.md>) and [phase integrity](</D:/Policy PoC/tmp/redesign-p9-20261009/final-integrity.json>).

P10 selects the previously approved immediate-navigation fallback after source feasibility review. No experimental Next flag, route-transition wrapper or synthetic matching brand pair was enabled. This is the concrete fallback outcome, not a claim that experimental transitions were validated. [Decision](</D:/Policy PoC/tmp/redesign-remaining-20261009/p10-decision.md>).

P11 groups page/view/zoom/export actions, adds the approved finite PDF loader and opacity-only HTML entrance, and scopes professional modular-heading ink to restore contrast on pale cards. The PDF request/document/page lifecycle, cancellation, stale guards, lazy canvases and geometry remain unchanged. The loader uses application Helvetica and static error/reduced-motion presentation. All eight PDF and HTML themes render in the user's desktop Brave browser. Nineteen pure synthetic PDF/HTML fixtures cover parity, long-content stress, manual/AI covers and authored overrides; all original PDF pages were rastered for inspection. The temporary browser fixture route and public fixture files were removed before the final build. [Desktop browser record](</D:/Policy PoC/tmp/redesign-p11-20261009/local-browser-review.md>), [manifest](</D:/Policy PoC/tmp/redesign-p11-20261009/artifacts/manifest.json>) and [phase integrity](</D:/Policy PoC/tmp/redesign-p11-20261009/final-integrity.json>). Runtime stale/error/retry fixtures remain a separate QA carryover.

P12 adds fourteen exact named Word font faces derived from existing bundled WOFF2 assets and maps the eight themes to embedded DOCX families. Font metadata and embedding permissions are preserved; the original 71 protected fonts retain their hashes. Actual Microsoft Word PDFs verify body and heading families from embedded font metadata rather than relying on Word's substituted PDF font aliases. Red/green minimized Word fixtures exposed oversized quantitative rows being pushed away from their heading; removing `cantSplit` only from the three target body-row layouts fixes the section heading/first-target association across all eight stress themes. Compact repeated headers remain together. Title-owned professional acknowledgement breaks plus omission of the final section spacer remove five introduced blank pages. All 19 final Word fixtures contain 277 pages with zero blank bodies; 272 raster hashes exactly match the individually inspected originals, and the five replacement acknowledgement pages pass native visual reinspection. Baseline PDF resource inspection finds requested body faces in three of eight themes, with identical resource sets in P0 and P11; this pre-existing partial font use remains documented, not represented as exact cross-format parity. [Font conversion](</D:/Policy PoC/tmp/redesign-p12-20261009/font-conversion.json>), [actual Word fonts](</D:/Policy PoC/tmp/redesign-p12-20261009/font-verification-final.json>), [target pagination](</D:/Policy PoC/tmp/redesign-p12-20261009/pagination-final.json>), [Word matrix](</D:/Policy PoC/tmp/redesign-p12-20261009/artifacts/word-rendered-final/raster-manifest.json>) and [baseline PDF font diagnosis](</D:/Policy PoC/tmp/redesign-p13-20261009/pdf-font-assessment.md>).

P13 integration preserves all API/persistence, signature, theme and page-geometry modules relative to the frozen P9 start. The combined source-scope check has no unexpected edits; all original protected fonts and new Word-font hashes pass. The final production build passes; focused lint reports zero errors and five existing image warnings, with zero diagnostics on the three final correction files. Direct invocation of the installed TypeScript compiler reports only the two existing login-regression diagnostics. The final full suite has **358 tests, 335 passes and 23 failures**, exactly matching the P7 failure names; four new regression tests pass and there are no introduced failures. Earlier launch-timeout and transient-fade failures were investigated and are absent from this final run. The cover pixel fixture now waits for the finite approved opacity entrance before comparing exact artwork colors. Signature tests pass 33/33, access 80/80 and tasks 32/32. The suite remains globally non-green because of the baseline failures. Standards/Spec rechecks and final native Word page inspection have no unresolved introduced finding. P8/P9/P11 runtime fixture limits remain explicit, mobile QA is waived, and deployment requires separate authorization. [Baseline comparison](</D:/Policy PoC/tmp/redesign-p13-20261009/test-baseline-comparison.json>), [Standards source review](</D:/Policy PoC/tmp/redesign-p13-20261009/standards-review.md>), [scope integrity](</D:/Policy PoC/tmp/redesign-p13-20261009/final-scope-integrity.json>) and [handoff](</D:/Policy PoC/POLICYCRAFT_UI_REDESIGN_HANDOFF.md>).
