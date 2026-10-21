# PolicyCraft

PolicyCraft is a web app for writing formal sustainability policies, the kind companies submit for ESG ratings such as EcoVadis. A guided builder takes a policy from a blank page to a branded, signed PDF or Word document. AI drafts each section using real policies from the same sector as reference.

It covers five policy types:

| Policy type | What it covers |
| --- | --- |
| Environmental | Emissions, energy, water, waste, biodiversity, environmental management |
| Labour & Human Rights | Working conditions, non-discrimination, child and forced labour, grievance channels |
| Living Wage | Wage methodology, living-wage benchmarks, pay review |
| Ethics | Anti-bribery, conflicts of interest, data protection, whistleblowing |
| Sustainable Procurement | Supplier code of conduct, screening, audits, responsible sourcing |

---

## Contents

- [How it works: the full flow](#how-it-works-the-full-flow)
- [Who uses it](#who-uses-it)
- [The policy builder, step by step](#the-policy-builder-step-by-step)
- [How AI drafting works](#how-ai-drafting-works)
- [Design studio and export](#design-studio-and-export)
- [Admin and manager workflows](#admin-and-manager-workflows)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [Testing and verification](#testing-and-verification)
- [Seed policy library](#seed-policy-library)
- [Deployment](#deployment)
- [Further documentation](#further-documentation)

---

## How it works: the full flow

```mermaid
flowchart TD
    A[Sign in at /login] --> B{Role?}
    B -->|Admin| C["/admin workspace"]
    B -->|Manager| D["/manager workspace"]
    B -->|Client user| E["/drafts workspace"]

    C --> F[Choose an organization]
    D --> F
    E --> F

    F --> G[Pick a policy type<br/>or open a saved draft]
    G --> H[Company setup<br/>name, sector, country, sites, logo, review cycle]
    H --> I["Optional: import an existing .docx or .doc<br/>as an AI reference"]
    I --> J[Builder steps<br/>structure → declaration → focus areas → objectives<br/>→ targets → SDGs → responsibilities → custom sections]
    J -->|AI drafts any section| K[(OpenAI, streamed<br/>or built-in mock)]
    K --> J
    J --> L[Design studio<br/>template, theme, fonts, cover, logo, signature]
    L --> M[Live PDF preview]
    M --> N[Export PDF or Word]

    J -. autosaves every change .-> DB[(MySQL<br/>policycraft_documents)]
    L -. autosaves .-> DB
```

In words:

1. **Sign in.** A single login page sends each person to their own workspace: `/admin`, `/manager` or `/drafts`.
2. **Choose an organization.** Every policy belongs to one client organization. Admins can see all of them, managers see the ones assigned to them, and client users see only their own.
3. **Start or resume a policy.** Pick one of the five policy types, or reopen a saved draft.
4. **Company setup.** Company details (sector and sub-sector, country, operating sites, reporting period, logo, document and revision numbers, review cycle, approver) come from the organization profile and can be changed for this policy only.
5. **Import a reference (optional).** Upload the company's current policy as `.docx` or `.doc`. It is parsed and passed to the AI as extra context.
6. **Write the policy.** Work through the builder steps. Each step can be written by hand or drafted by AI and then edited.
7. **Design it.** Choose a document template and theme, adjust typography and colours, build a cover (by hand or with AI), and add a signature.
8. **Preview and export.** The live preview is the same render the PDF uses. Export as PDF or editable Word.

Drafts autosave as you work, roughly a second after the last change, and are saved again before you navigate away.

---

## Who uses it

| Role | Home | What they can do |
| --- | --- | --- |
| **Client user** | `/drafts` | Create and edit policies for their own organization. |
| **Manager** | `/manager` | Work on policies for the organizations they are assigned to, and pick up policy tasks with deadlines. Several managers can share one organization. |
| **Admin** | `/admin` | Everything a manager can do across all organizations, plus managing managers, assignments, invitations, PolicyCraft-only organizations, tasks and other administrators. |

PolicyCraft roles are separate from roles on the shared ESG platform. Granting someone PolicyCraft access does not change their ESG account. Terms like *assignment*, *policy task* and *manager progress* are defined in [`CONTEXT.md`](CONTEXT.md).

---

## The policy builder, step by step

The builder is at `/builder`. The left rail shows the steps and progress, the centre holds the editor, and a live preview of the document sits alongside.

| # | Step | What you do |
| --- | --- | --- |
| 1 | **Document structure** | Turn standard sections on or off, reorder them, and add custom sections. Standard sections: Preface, Policy Declaration, Scope, Definitions, Key Focus Areas, Qualitative Objectives, Quantitative Targets, SDG Alignment, Roles & Responsibilities, Monitoring & Reporting, Review Mechanism, Revision History. |
| 2 | **Declaration & scope** | Write the preface, the formal policy declaration and the scope. For Living Wage this step also covers the wage methodology. |
| 3 | **Key focus areas** | Choose the topics the policy commits to, from a catalogue tuned to the policy type and the company's sector, or add your own. |
| 4 | **Qualitative objectives** | Write commitments for each focus area. |
| 5 | **Quantitative targets** | Set measurable targets, each with a baseline year, a deadline and a reporting frequency. Year labels follow the company's FY or CY reporting period. |
| 6 | **SDG alignment** | Link the policy to the UN Sustainable Development Goals, shown with the official icons. |
| 7 | **Responsibilities** | Assign roles and duties, and set reviewer designations and the review mechanism. |
| 8 | **Custom sections** | Write any sections you added in step 1. |
| 9 | **Preview & export** | Review the finished document and download it. |

Steps for sections you turned off are skipped automatically.

---

## How AI drafting works

Every section has an AI button. Drafting goes through `POST /api/ai` (`src/app/api/ai/route.ts`):

```mermaid
sequenceDiagram
    participant U as Builder (browser)
    participant API as /api/ai
    participant Ctx as Context builders
    participant LLM as OpenAI

    U->>API: section type + policy + company + optional instruction
    API->>API: check session and organization scope
    API->>Ctx: get reference passages
    Ctx-->>API: matching seed-policy excerpts,<br/>imported policy, company classification
    alt OPENAI_API_KEY is set
        API->>LLM: system + user prompt (JSON mode, streamed)
        LLM-->>API: tokens
        API-->>U: NDJSON stream of partial JSON
    else no key, or the request fails
        API-->>U: built-in mock answer, streamed at a similar pace
    end
    U->>U: text fills in live, and Stop keeps what has arrived
```

How the prompt is built:

- **Reference policies.** Excerpts from real policies of the same type (see [Seed policy library](#seed-policy-library)) show the model what each section usually contains and how long it is. The model is told to match that length and depth instead of padding.
- **Company context.** Sector, sub-sector and industry detail, country, sites and reporting period make the output specific to the company.
- **Imported policy.** If the user uploaded their existing policy, it is added as higher-priority context.
- **Template length.** Executive templates ask for shorter content and comprehensive ones for more detail.
- **No repeats.** Content already in the section is sent along so the model only adds new points.
- **User instruction.** An optional instruction such as "add 3 targets on water" takes priority, including the number of items requested.
- **Target rules.** Quantitative targets must be measurable, and must use the allowed baseline and deadline years in the correct FY or CY format.

Without an `OPENAI_API_KEY` the whole app still works: `lib/ai/mock.ts` returns realistic content built from the seed library. That covers local development, demos and the test suite.

Other AI-backed features:

- **Grammar check:** `POST /api/grammar`
- **AI cover design:** `POST /api/policycraft/ai-cover` generates a cover image and layout, which go into a reusable cover library.

---

## Design studio and export

### Document templates

There are eight print-ready layouts, each with preview pages in `src/public/template-previews/`:

| Template | Template | Template | Template |
| --- | --- | --- | --- |
| Standard Pack | Executive Brief | Controlled Manual | Governance Register |
| Operations Guide | Sustainability Charter | People Charter | Metrics Ledger |

On top of the template you can change:

- **Theme and colours.** These can be taken from the company logo's palette.
- **Typography.** Heading and body fonts from a bundled font library, plus sizes and line spacing.
- **Cover page.** Build it in the cover editor with draggable and resizable elements, use an AI-generated cover, or reuse a saved one.
- **Logo position, table of contents, SDG display style, acknowledgement page.**
- **Signature.** Draw or type a signature in the signature maker. It is stored per user and placed on the author approval block.
- **Revision history.** Generated automatically from document and revision numbers and review dates.

### Export

| Format | Route | How |
| --- | --- | --- |
| **PDF** | `POST /api/export/pdf` | Renders the same HTML/CSS document the live preview uses and prints it with headless Chromium (`playwright-core`, or `@sparticuz/chromium` on serverless). Fonts are embedded and hyphenation is handled, so the PDF matches the preview. |
| **Word (.docx)** | `POST /api/export/docx` | Builds a native, editable Word file with the `docx` library, with the same sections, styles, cover and assets. |

Both exports check that the signed-in user may access the policy's organization before rendering.

Locally, the PDF exporter looks for an installed Chrome or Edge. Set `POLICY_PDF_CHROME_PATH` to use a specific browser.

---

## Admin and manager workflows

```mermaid
flowchart LR
    subgraph Admin
      A1[Add organization<br/>ESG or PolicyCraft-only]
      A2[Add manager<br/>existing account or invitation]
      A3[Assign managers<br/>to organizations]
      A4[Create policy task<br/>org + policy type + deadline]
      A5[Monitor Manager Work tab]
      A6[Add another administrator]
    end
    subgraph Manager
      M1[Accept invitation<br/>and set password]
      M2[See assigned organizations]
      M3[Start or resume task in builder]
      M4[Mark task complete]
    end
    A2 --> M1 --> M2
    A3 --> M2
    A4 --> M3 --> M4 --> A5
```

- **Organizations.** *ESG organizations* come from the shared ESG platform. *PolicyCraft organizations* (`/admin/organizations/policycraft`) exist only inside PolicyCraft. Each has a profile (company name, sector, country, website, reporting period, logo, sites) that new policies start from. Editing a profile does not change policies already saved.
- **Managers.** Someone who already has an account gets manager access once an admin confirms it, with no email involved. Someone new receives an invitation that expires after 72 hours and lets them choose a password. Public signup is disabled.
- **Invitation email.** Mailtrap Email Sandbox is used in development and test, and ZeptoMail in production. Set `POLICYCRAFT_MAIL_PROVIDER` to override.
- **Tasks.** An admin asks a manager to write a specific policy for an organization by a deadline (end of day, IST). The manager starts the task from `/manager/tasks`. The **Manager Work** tab tracks each manager's own saved progress, and edits by others don't count toward it. Completing a task saves the policy first and asks for confirmation if sections are still empty.
- **Ownership.** A policy always belongs to its organization and keeps its original creator, even when other people edit it.

---

## Architecture

```mermaid
flowchart TB
    subgraph Browser
      UI[Next.js App Router pages<br/>React 19 · Zustand store]
      PV[Live preview<br/>pdf.js render]
    end

    subgraph "Next.js server (Node runtime)"
      PX[proxy.ts<br/>session check on protected routes]
      AUTH["/api/auth<br/>Better Auth"]
      PC["/api/policycraft/*<br/>documents · orgs · tasks · access · covers · signatures"]
      AI["/api/ai · /api/grammar"]
      EX["/api/export/pdf · /api/export/docx"]
      PARSE["/api/parse/docx"]
    end

    DB[(MySQL<br/>shared ESG database<br/>+ policycraft_* tables)]
    OAI[(OpenAI API)]
    CHR[[Headless Chromium]]
    SMTP[(Mailtrap / ZeptoMail)]

    UI --> PX --> PC & AI & EX & PARSE
    UI --> AUTH
    AUTH --> DB
    PC --> DB
    PC --> SMTP
    AI --> OAI
    EX --> CHR
    EX --> DB
```

- **Authentication.** [Better Auth](https://www.better-auth.com/) with email and password, using the ESG platform's existing `users` and `account` tables. Sharing `BETTER_AUTH_SECRET` with the ESG app keeps sessions compatible between the two.
- **Authorization.** `src/proxy.ts` sends anonymous visitors on protected routes to `/login`, or returns `401` for API calls. Each API route then checks the user's role and organization scope (`lib/policycraft-auth.ts`, `lib/policycraft-access-policy.ts`). If the access tables are missing, requests are refused.
- **Storage.** PolicyCraft only adds its own `policycraft_*` tables and never changes the shared ESG tables. A policy is stored as one JSON document per organization and policy type.
- **Client state.** One Zustand store (`lib/store.ts`) holds the policy being edited. Autosave (`lib/policycraft-autosave.ts`) batches changes and saves them before navigation.

### Tech stack

| Area | Tools |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, view transitions), TypeScript |
| Styling and motion | Tailwind CSS 4, CSS modules, Radix UI, Motion, GSAP, Lenis |
| State and forms | Zustand, React Hook Form, Zod |
| Auth and DB | Better Auth, MySQL (`mysql2`), bcrypt |
| AI | OpenAI (chat completions in JSON mode with streaming, image generation for covers) |
| Documents | Playwright Core / `@sparticuz/chromium` (PDF), `docx` (Word), `pdf-lib`, `pdfjs-dist`, `mammoth` and `word-extractor` (import), `hyphen` |
| Email | Nodemailer (Mailtrap sandbox, ZeptoMail) |
| Tests | Node's built-in test runner via `tsx`, Playwright-driven UI checks |

---

## Repository layout

```
policybuilder/
├── src/                         ← the Next.js application (run all commands from here)
│   ├── app/
│   │   ├── page.tsx             landing page
│   │   ├── login/               sign-in
│   │   ├── accept-invitation/   manager invitation acceptance
│   │   ├── drafts/              client-user workspace
│   │   ├── manager/             manager workspace (organizations, tasks)
│   │   ├── admin/               admin workspace (organizations, managers, policies, tasks, administration)
│   │   ├── builder/             the policy builder
│   │   ├── templates/           template gallery
│   │   ├── preview/[id]/        standalone document view
│   │   └── api/                 route handlers (ai, export, parse, auth, policycraft/*)
│   ├── components/
│   │   ├── builder/             builder shell, steps/, design-studio/, cover editor, signature maker
│   │   ├── policy/              HTML and PDF policy previews
│   │   ├── workspace/           admin and manager workspace UI
│   │   ├── tasks/ templates/ public/ auth/ ui/
│   ├── lib/
│   │   ├── ai/                  prompts, mock generator, streaming client, reference context
│   │   ├── pdf/                 print-document renderer and PDF generation
│   │   ├── docx/                Word import (parse) and export (generate)
│   │   ├── policycraft-*.ts     access, organizations, tasks, invitations, export, autosave
│   │   ├── store.ts types.ts constants.ts sections.ts document-themes.ts …
│   ├── data/seed-policies/      ~400 structured reference policies, one folder per policy type
│   ├── migrations/              additive SQL migrations and the admin bootstrap example
│   ├── scripts/                 seed import, preview generation, verification scripts
│   └── public/                  fonts, SDG icons, template previews, landing-page art
├── docs/                        rollout runbooks, validation reports, research notes
├── CONTEXT.md                   domain vocabulary
└── <company folders>/           source policy documents the seed library was built from
```

---

## Getting started

### Prerequisites

- **Node.js 20.9+**, plus [Bun](https://bun.sh/) (there is a `bun.lock`; npm also works)
- **MySQL 8**, either the shared ESG database or a local copy containing its `users`, `account` and `organizations` tables
- **Google Chrome or Microsoft Edge** installed locally, for PDF export
- Optional: an **OpenAI API key**. Without one, the app uses mock AI content.

### 1. Install

```bash
git clone https://github.com/Nirav-Growlity/policybuilder.git
cd policybuilder/src
bun install        # or: npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in at least `DATABASE_URL` and `BETTER_AUTH_SECRET`. See [Environment variables](#environment-variables) for the rest.

### 3. Prepare the database

Apply the migrations in `src/migrations/` in date order, then make an existing account the first administrator. See [Database migrations](#database-migrations).

### 4. Run

```bash
bun run dev -- -p 3000     # or: npm run dev -- -p 3000
```

Open <http://localhost:3000> and sign in at `/login`. The development server builds into `.next-local/` so that a stale `.next/` folder can't block compilation.

### Production build

```bash
bun run build
bun run start
```

---

## Environment variables

Set these in `src/.env`. Use `src/.env.development.local` for local-only overrides such as Mailtrap credentials.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes* | MySQL connection string, e.g. `mysql://user:pass@localhost:3306/esgtech` |
| `HOST`, `USER_NAME`, `PASSWORD`, `DATABASE`, `DB_PORT` | Yes* | Used instead of `DATABASE_URL` when it isn't set |
| `BETTER_AUTH_SECRET` | Yes in production | Session signing secret. Use the ESG app's secret so sessions work across both apps. |
| `NEXT_PUBLIC_BASE_URL` | Recommended | Public origin of the app, used by auth |
| `POLICYCRAFT_APP_URL` | For invitations | Origin used in invitation links. Must be HTTPS in production. |
| `OPENAI_API_KEY` | No | Turns on real AI drafting, grammar checks and AI covers. Without it, mock content is used. |
| `POLICY_PDF_CHROME_PATH` | No | Path to a specific Chrome or Edge binary for PDF export |
| `POLICYCRAFT_MAIL_PROVIDER` | No | `mailtrap` or `zeptomail`. Defaults to Mailtrap in development and ZeptoMail in production. |
| `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USERNAME`, `MAILTRAP_PASSWORD`, `MAILTRAP_EMAIL` | Dev invitations | Mailtrap Email Sandbox SMTP credentials |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_EMAIL` | Prod invitations | ZeptoMail SMTP. `MAIL_EMAIL` must be a verified sender. |

\* Set either `DATABASE_URL` or the individual connection fields.

To check SMTP settings without sending any email:

```bash
node --import tsx scripts/verify-invitation-smtp.ts
```

---

## Database migrations

Migrations are **additive** and applied **by hand** by the database owner. They create `policycraft_*` tables and never change shared ESG tables.

| Migration | Creates |
| --- | --- |
| `2026_09_create_policycraft_documents.sql` | `policycraft_documents`: saved policies |
| `2026_09_create_policycraft_cover_assets.sql` | `policycraft_cover_assets`, `policycraft_cover_templates` |
| `2026_09_add_policy_type_to_policycraft_cover_templates.sql` | Adds a policy type to cover templates |
| `2026_10_create_policycraft_access.sql` | `policycraft_user_access`, `policycraft_manager_organizations`, `policycraft_manager_invitations` |
| `2026_10_create_policycraft_organizations.sql` | `policycraft_organizations`, `policycraft_organization_profiles`, migration state |
| `2026_10_create_policycraft_tasks.sql` | `policycraft_tasks`, `policycraft_manager_progress`, `policycraft_task_events` |
| `2026_10_reset_policycraft_signatures.sql` | `policycraft_user_signatures` |

After the access migration, make an existing account the first admin with [`migrations/bootstrap_policycraft_admin.example.sql`](src/migrations/bootstrap_policycraft_admin.example.sql). More administrators can then be added from **Admin → Administration** in the app. The full steps and checks are in [`migrations/README_policycraft_access.md`](src/migrations/README_policycraft_access.md).

---

## Testing and verification

Run these from `src/`.

| Command | What it checks |
| --- | --- |
| `npm test` | The main unit and integration suite: AI context, templates, themes, PDF and DOCX generation, access rules, invitations, organizations, tasks, autosave |
| `npm run test:access` | Access control, invitations, storage scoping and export authorization |
| `npm run test:organizations` | Organization profiles, logos, mapping and task integration |
| `npm run test:tasks` | Task rules, progress tracking and transactional persistence |
| `npm run test:signatures` | Signature storage, scope and rendering in exports |
| `npm run lint` | ESLint |

Browser checks run against a dev server you start yourself. They mock every API, so no live data changes and no email is sent. Set `POLICYCRAFT_UI_URL` to the server's address and `POLICYCRAFT_UI_OUTPUT` to choose the screenshot folder.

```bash
node --import tsx scripts/verify-access-ui.mjs
npm run tasks:verify-ui
node scripts/verify-admin-add-ui.mjs
```

Anonymous-access checks confirm that protected APIs reject requests without a session cookie:

```bash
node scripts/verify-access-anonymous.mjs
node scripts/verify-organizations-anonymous.mjs
node scripts/verify-tasks-anonymous.mjs
```

---

## Seed policy library

`src/data/seed-policies/` holds about 400 structured JSON policies, one folder per policy type. They are what makes AI drafting sector-aware, and they also power mock mode and starter templates.

They were built from real company policy documents (the company folders at the repo root) by:

```bash
npm run seeds:import
```

`scripts/import-policy-seeds.ts` walks the source folders and reads `.docx` files (mammoth), legacy `.doc` files (word-extractor) and scanned PDFs (as page images). It sends each document to OpenAI to extract the structured policy (declaration, scope, focus areas, objectives, targets, SDGs, responsibilities) and writes one JSON file per company and policy type. `scripts/verify-seed-policies.js` and `scripts/find-duplicates.js` check the results.

To regenerate the template preview images in `public/template-previews/`, run `npm run templates:previews`.

---

## Deployment

The app runs on any Node host, and on Vercel or AWS Lambda, where PDF export switches to `@sparticuz/chromium` automatically. `next.config.ts` bundles the fonts and Chromium files that the export routes need.

Before switching traffic to a new release:

1. Apply the migrations the release needs. Runtime checks refuse requests until the tables exist.
2. Set the production environment variables: database, `BETTER_AUTH_SECRET`, an HTTPS `POLICYCRAFT_APP_URL`, ZeptoMail SMTP and `OPENAI_API_KEY`.
3. Follow the smoke checks and rollback plan in the runbooks below.

---

## Further documentation

| Document | Topic |
| --- | --- |
| [`docs/policycraft-production-rollout.md`](docs/policycraft-production-rollout.md) | Release, migration and bootstrap, smoke checks, rollback |
| [`docs/policycraft-organizations-rollout.md`](docs/policycraft-organizations-rollout.md) | Rolling out PolicyCraft-only organizations |
| [`docs/policycraft-tasks-rollout.md`](docs/policycraft-tasks-rollout.md) | Rolling out tasks and progress tracking, including backfill |
| [`src/migrations/README_policycraft_access.md`](src/migrations/README_policycraft_access.md) | Access migration and adding administrators |
| [`docs/invitation-mail-providers-research.md`](docs/invitation-mail-providers-research.md) | Mailtrap and ZeptoMail setup and troubleshooting |
| [`CONTEXT.md`](CONTEXT.md) | Domain vocabulary |
| [`DESIGN_SYSTEM_REFERENCE.md`](DESIGN_SYSTEM_REFERENCE.md) | UI design system |
| [`src/README.md`](src/README.md) | Detailed operational notes for the app directory |
