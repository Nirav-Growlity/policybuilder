# Employee Handbook: research and implementation plan

Date: 2026-10-23
Base branch for the work: `policies-ai-edit-and-workspace` (holds the complete SOP
implementation; `main` and `organization-svg-logo` do not have the Documents area).

## 1. Summary

The Employee Handbook becomes the second document kind in the Documents area,
built on the same pieces as the SOP manual: the `policycraft_manuals` table
(`kind = 'handbook'` already exists in the enum), the manuals API routes, the
wizard, the builder shell with outline rail, section editors, AI generation
queue, Typst PDF preview and export, DOCX export, AI cover and Review & export.

The one real difference is the content model. An SOP manual is a flat list of
SOPs that all share one section skeleton. A handbook is a list of *chapters*
(Welcome, Working hours, Leave, Code of conduct, Grievance, …) whose
sub-structure varies by chapter. The plan keeps the SOP machinery and swaps in a
handbook content model, a handbook catalog and handbook prompts, generalising
the SOP modules only where the "SOP" assumption is baked in.

## 2. What the SOP implementation looks like today

Everything below lives on `policies-ai-edit-and-workspace`.

| Layer | Files | Notes |
|---|---|---|
| Storage | `migrations/2026_10_create_policycraft_manuals.sql`, `lib/manual-repository.ts`, `lib/manual-request.ts`, `lib/manual-validation.ts` | Already generic: `ManualKind = "sop" \| "handbook"`, `kind` filter in `listManuals`, `validateManualPayload` switches on kind (handbook branch currently a pass-through). Summary row reads `JSON_LENGTH(manual_json, '$.sops')` and `$.theme`. |
| API | `app/api/documents/manuals/route.ts`, `[id]/route.ts`, `[id]/{preview,pdf,docx,ai-cover}/route.ts`, `app/api/documents/sop/ai/route.ts` | CRUD is kind-agnostic. Render, export, AI cover and AI text routes hard-code `stored.kind !== "sop"` → 404/400 and parse with `sopManualSchema`. |
| Domain | `lib/sop/types.ts`, `schema.ts`, `initial-manual.ts`, `catalog.ts` + `data/sop-catalog.json`, `company-facts.ts`, `store.ts` | `SopManual = { company, control, grouping, frontMatter, sops[], closing, theme, themeOptions, cover, facts? }`. Each `Sop` has a canonical 14-kind section skeleton (`SOP_SECTION_KINDS`). Zustand store with `RailSelection = front \| closing \| sop`. |
| AI | `lib/sop/ai-contract.ts`, `ai-client.ts`, `generation-queue.ts`, `apply-ai-result.ts`, `lib/ai/sop-generation.ts`, `sop-prompts.ts`, `sop-template-context.ts`, `data/seed-sops/*.json` (46 manuals, 705 SOPs) | NDJSON streaming, compact "sections keyed by kind" wire schema, cached manual context, reference examples from the seed corpus, per-section refine (Improve / Shorten / Fix grammar / Rewrite / Custom), front-matter and closing writers. |
| Render | `lib/sop/render-types.ts`, `render-model.ts`, `render-service.ts`, `design/templates.ts`, `design/resolve.ts`, `cover-band.ts`, `lib/typst/sop/manual.typ`, `lib/docx/sop-generate.ts` | One `SopRenderModel` (cover, control grid, front matter sections, chapters → sops → numbered sections, closing) feeds both Typst and DOCX. Only a handful of hard-coded strings are SOP-specific: "SOP No.", "SOP-EHS-001", "SOPs in this manual", pillar labels, the `stats.sopCount` cover line. |
| UI | `components/documents/documents-hub.tsx`, `document-type-chooser.tsx`, `new-manual/*`, `builder/*`, `design/sop-design-controls.tsx`, `manual-helpers.ts` | Hub already has a "handbook" type filter, group heading and "Employee handbooks are coming soon" empty state; the chooser card is `available: false`. Builder: `SopBuilder` → `SopBuilderShell` (rail, modes Write / Design / Review) → `SopWriter` / `FrontMatterWriter` / `ClosingWriter`; `section-editors.tsx` has `NarrativeField` (text + inline tables), `RowsTable`, `LinesField`, `ProcedureEditor`. |
| Tests | `npm run test:documents` (10 files) | Node test runner, `renderToStaticMarkup` for components. |

Not present on the branch: the `.docx` import route (the wizard shows "coming
soon" because `isImportAvailable` gets a 404).

## 3. What the reference handbooks look like

53 handbook `.docx` files were read from `Employee Handbook - SOP Manual/Employee
Handbook/*` and `SOP Manual  Employee Handbook/HANDBOOK/*` (plus a few `.doc` and
`.pdf` that were skipped). Outlines are in `.scratch/handbook-research/outline/`
and the aggregation script in `.scratch/handbook-research/headings.py`.

Size: 3,200 to 49,000 words, median about 15,000 words (an SOP manual SOP is
900 to 1,300 words; a handbook chapter is typically 400 to 1,500 words).

### 3.1 Chapters and how many of the 53 handbooks have them

| Chapter topic | Handbooks |
|---|---|
| Training & development | 53 |
| Compensation, salary, payroll | 52 |
| Performance, appraisal, promotion, career mobility | 52 |
| Working hours, attendance, shifts, overtime | 52 |
| POSH / anti-harassment / equal opportunity / DEI | 52 |
| Health, safety and well-being | 51 |
| IT, data, confidentiality, social media | 50 |
| Code of conduct, ethics, conflict of interest, gifts | 49 |
| Grievance / whistleblower / remediation | 49 |
| Purpose, scope, applicability of the handbook | 48 |
| Leave and holidays | 48 |
| Employment terms, categories, probation | 46 |
| Benefits, insurance, PF, gratuity | 45 |
| Recruitment, joining, onboarding, induction | 44 |
| Welcome / message from leadership | 38 |
| Forms and annexures | 35 |
| Revision history / review mechanism / document control | 35 |
| Vision, mission, values | 30 |
| Separation, exit, notice period, retirement | 29 |
| Travel and expenses | 24 |
| About the company / profile / legacy | 24 |
| Transfer, deputation, flexible / remote work | 23 |
| Dress code and grooming | 19 |
| Discipline and misconduct | 18 |
| Acknowledgement / declaration form | 10 explicit, many more as a final block |

ESG-driven chapters recur because these handbooks are written for EcoVadis /
buyer audits: child and forced labour prevention, security personnel and use of
force, freedom of movement, wage adequacy and equal pay, affinity groups,
family-friendly programmes, employee assistance, contracted-worker safety,
environmental commitment, anti-corruption, specific approval of sensitive
transactions, record retention.

### 3.2 Structure inside a chapter

Chapters are narrative with sub-headings, not a fixed skeleton. The most common
sub-headings across all chapters: Purpose (29 handbooks), Scope (29),
Confidentiality (24), Reporting channels (24), Objective (22), Applicability
(22), Employee responsibilities (21), Eligibility (21), Continuous improvement
(20), Procedure (20), Review mechanism (18), Investigation process (18),
Definitions (17), Roles & responsibilities (17), Non-retaliation (14).

So a chapter is: an optional purpose/scope opener, then free sub-sections
(paragraphs, bullets, tables), with recurring patterns per topic:

- Leave: a table or per-type blocks (Eligibility, Entitlement, Conditions) for
  Earned/Privilege, Casual, Sick, Maternity, Paternity, Compensatory, LWP; a
  holiday list table; encashment; application process.
- Compensation: salary components (table), bonus, overtime rates, payment
  schedule, EPF/ESI, increments, equal pay.
- Working hours: hours table by work week / shift, attendance tracking,
  late-coming rules, overtime approval.
- Grievance / whistleblower / POSH: reporting channels with contact details,
  investigation steps, timelines, confidentiality, non-retaliation, appeal.
- Recruitment: steps with responsible roles (often a 4-column table: phase,
  activities, timeline, responsible), pre-employment checks table, documents
  required list.
- Conduct / discipline: prohibited conduct list, misconduct types, disciplinary
  actions table (violation → action).

Tables appear in 50 of 53 handbooks (median 9 per handbook); forms (grievance
form, acknowledgement form, nomination form) in about a third.

### 3.3 Front and back matter

- Front: document-control block (Document name/number, Rev, Effective, Last
  review, Next review, Prepared/Approved by) in about 35; applicability sites
  table (Site / Address / Primary function) in about 20 (same columns as the SOP
  manual); welcome message; about us / purpose / business priorities / legacy;
  vision-mission-values; how to use this handbook; often an explicit "Employee
  rights and ethical workplace commitments" page.
- Back: review mechanism + revision history table (Rev / Date / Change /
  Reviewed by / Approved by); key contacts table; abbreviations; FAQs; record
  retention schedule; office addresses; **acknowledgement form** (name,
  designation, signature, date), sometimes a confidentiality agreement.

Everything in the front and back matter maps onto what the SOP manual already
stores (`control`, `frontMatter.sites`, `facts.contacts`, `closing.revisionHistory`,
`closing.approval`), plus three new parts: welcome message, vision/mission/values
as prose, and the acknowledgement form.

## 4. Design decisions

1. **Same table, same routes, new `manual_json` shape.** `kind = 'handbook'`
   rows hold a `HandbookManual`. `validateManualPayload` gets a real handbook
   branch. The summary query needs `part_count` from `$.chapters` when kind is
   handbook (a `CASE` on `m.kind`).
2. **Chapter-based content model, reusing the SOP block and row types.**
   A chapter has a title, optional code, owner (department or role), status,
   and an ordered list of sub-sections. Sub-section kinds are the SOP narrative
   section (title + `RichTextBlock[]`, which already supports paragraphs,
   bullets, numbered lists and tables) plus the SOP structured kinds that
   handbooks also use: `definitions`, `responsibilities`, `procedure` (steps
   with responsible role), `records`, `references`, `appendix`. New structured
   kind: `contacts` is not needed (facts.contacts prints as Key Contacts) but
   `form` (a fillable form: fields + signature lines) is wanted for the
   grievance and acknowledgement forms; in the first cut a form is an appendix
   with a table block, exactly how the SOP AI writes appendices.
3. **Grouping is by part, not pillar.** Handbook chapters group under parts
   such as "Introduction", "Employment", "Working at the company",
   "Compensation and benefits", "Conduct and ethics", "Health, safety and
   well-being", "Speaking up", "Leaving", "Appendices". Grouping options:
   `part | none` (no ESG pillar grouping).
4. **One shared builder, parameterised by kind.** Rather than copying 30
   components, the SOP builder, rail, writers, dialogs and AI hooks are
   generalised to a *manual adapter* that supplies labels ("SOP" vs "Chapter"),
   the part list, section-kind lists, the AI request types and the render-model
   builder. Where generalising is awkward (SopWriter header fields: pillar,
   code, version), a handbook-specific writer component is written and the
   shell/rail stay shared.
5. **Render model stays shared.** `SopRenderModel` already expresses
   cover → control grid → front matter sections → chapters → items → numbered
   sections → closing. The handbook builds the same model (chapters = parts,
   `RenderSop` = chapter) with a few extra fields (`itemLabel`, `showMetaCard`,
   acknowledgement block, welcome page) so the Typst template and DOCX
   generator need label changes, a welcome/acknowledgement component and
   nothing structural. Every existing SOP design template then works for
   handbooks; one or two handbook-leaning templates can be added later.
6. **AI follows the SOP pattern exactly.** A chapter is written in one request
   with a "sections keyed by kind" wire schema; the catalog topic supplies the
   suggested sub-section outline per chapter (e.g. Leave → Types & entitlements
   table, Public holidays, Encashment, Application process). Reference
   examples come from a new `data/seed-handbooks/*.json` corpus extracted from
   the 53 handbooks with the same batch script approach as `import-sop-seeds.ts`.
   Company facts (profile, certifications, regulations, contacts) and the
   company master snapshot feed the cached manual context unchanged.
7. **Inputs the handbook needs that the SOP wizard does not ask for:**
   working-hours and shift pattern, weekly off, leave entitlements per type,
   probation and notice periods, payroll date, and the country's labour-law
   set. These go into a "Handbook facts" panel (same shape as
   `CompanyFactsPanel`), all optional, with `[placeholder]` fallbacks and the
   existing placeholder readiness check.

## 5. Implementation plan

Work in order; each step leaves the app working and tested.

### Step 1: Domain model and storage (lib)

- `lib/handbook/types.ts`: `HandbookManual`, `HandbookChapter`,
  `HandbookSection` (reuse `RichTextBlock`, `SopDefinitionRow`,
  `SopResponsibilityRow`, `SopProcedureStep`, `SopRecordRow` by import),
  `HandbookPart` grouping, `HandbookFrontMatter` (welcome, about, vision,
  mission, values, purpose, howToUse, sites, glossary), `HandbookClosing`
  (reviewMechanism, revisionHistory, approval, acknowledgement text and form
  fields), `HandbookFacts` (hours, leave table, probation, notice, payroll,
  laws). Reuse `SopManualControl`, `SopCover`, `SopThemeOptions`,
  `SopCompanyFacts`, `SopTemplateId` as-is (consider moving them to
  `lib/documents/shared-types.ts` with re-exports so `lib/sop` keeps working).
- `lib/handbook/schema.ts`: Zod mirror with the same compile-time
  `Equal<>` guards as `lib/sop/schema.ts`; `generatedChapterSchema`.
- `lib/handbook/initial-manual.ts`: `createEmptyChapter`, `createEmptyHandbook`,
  `withHandbookSkeleton` (adds newer sub-section kinds switched off, like
  `withSopSkeleton`).
- `lib/handbook/catalog.ts` + `data/handbook-catalog.json`: about 35 chapter
  topics from §3.1 with `part`, `owner`, `frequency`, `industries`, `aliases`,
  `description`, and an `outline` (suggested sub-section kinds/titles the AI
  fills). `recommendChapters(company)` mirrors `recommendSops`. Country tags
  (India vs. US/UAE) matter more than industry here; include a `regions` field.
- `lib/manual-validation.ts`: handbook branch with `handbookManualSchema` and a
  `MAX_CHAPTERS` cap.
- `lib/manual-repository.ts`: `part_count` from `$.chapters` for handbooks.
- `lib/handbook/store.ts`: either a second zustand store or (preferred) make
  `useSopBuilder` generic over the manual/item type via a factory
  `createManualStore<Manual, Item>()`; the rail selection becomes
  `front | closing | item:<id>`.
- Tests: schema round-trips, skeleton insertion, catalog recommendation.

### Step 2: Render model, Typst and DOCX

- `lib/sop/render-types.ts`: add `itemLabel` ("SOP" | "Chapter"), optional
  `welcome` front section flag, `closing.acknowledgement` (title, statement,
  fields), and make `RenderSop.pillar` optional (handbook items have none).
  Bump `version` to 2.
- `lib/handbook/render-model.ts`: `buildHandbookRenderModel(manual, options)`
  producing the shared model: parts → chapters, section numbering per chapter,
  Key Contacts and Certifications from facts (reuse the SOP helper by moving
  `factSections` into a shared module), welcome page, acknowledgement page.
- `lib/sop/render-service.ts`: generalise `prepareSopRender`/`renderManualPdf`
  to take a prepared model builder (or add `prepareHandbookRender` that shares
  the image loading and template-art code).
- `lib/typst/sop/manual.typ`: read `m.itemLabel` instead of "SOP"/"SOPs";
  cover stats line uses the label; add `welcome` and `acknowledgement`
  components (acknowledgement = statement + a signature table using the
  existing `signature-table` approval component). Skip the per-item meta card
  when `pillar` is absent unless the template forces it.
- `lib/docx/sop-generate.ts`: the same three label sites and the two new
  components, keeping the "every Typst visual has a Word equivalent" rule.
- Routes: `[id]/preview`, `[id]/pdf`, `[id]/docx`, `[id]/ai-cover` dispatch on
  `stored.kind` (sop → existing path; handbook → handbook schema + model).
  File-name fallback "Employee-Handbook.pdf".
- Tests: a `sample-handbook.json` fixture, render-model tests (numbering,
  parts, acknowledgement), a DOCX generation smoke test, Typst compile of the
  fixture through `renderSopManual`.

### Step 3: AI generation

- `lib/handbook/ai-contract.ts`: request types `chapter`, `chapter-section`,
  `refine`, `front-matter`, `closing`, `manual-field` (fields: welcome, about,
  purpose, howToUse, reviewMechanism, approvalStatement, acknowledgement).
  Reuse `SopGenerationState`/queue by making the queue generic over the item id
  (it already only knows `sopId` strings; rename to `itemId` in the shared
  type with a compatibility alias).
- `lib/ai/handbook-prompts.ts`: system prompt in the house style learnt from
  the corpus (British English; employee-facing "you" voice is what the
  references use, unlike SOPs; eligibility/entitlement/procedure patterns;
  tables for leave types, salary components, working hours, disciplinary
  actions; reporting channels named from facts.contacts; `[placeholders]` for
  entitlements not given in handbook facts). Cached manual context = company,
  sites, facts, handbook facts, chapter register. Per-chapter task lists the
  sub-sections to fill from the catalog outline.
- `lib/ai/handbook-generation.ts`: `parseHandbookAiRequest`,
  `finalizeHandbookOutput`, `mockHandbookOutput`, `runHandbookGeneration`,
  mirroring `sop-generation.ts`.
- `app/api/documents/handbook/ai/route.ts`: copy of the SOP AI route bound to
  the handbook generation module (or one route under
  `api/documents/manuals/[id]/ai` that dispatches on kind; prefer the latter
  and leave the SOP route as a thin alias).
- Seed corpus: `scripts/import-handbook-seeds.ts` built from
  `import-sop-seeds.ts` (deterministic docx outline via `lib/docx/docx-model.ts`,
  Haiku normalisation through the Batches API, catalog refresh). Output
  `data/seed-handbooks/<company>.json`; `lib/ai/handbook-template-context.ts`
  selects 3 to 5 reference chapters by topic, region and industry. The corpus
  is a one-off cost (about 53 handbooks × ~20 chapters); run it before the AI
  prompts are tuned.
- Tests: request parsing, output finalisation, prompt budget, mock output
  matches schema (same shape as `sop-prompts.test.ts`).

### Step 4: Wizard

- `app/documents/handbook/new/page.tsx` → `NewHandbookWizard` sharing
  `WizardHeader`, `WizardHeading`, `DetailsStep` (company form +
  `ManualDetailsPanel` with "Handbook title" defaults + `CompanyFactsPanel`)
  plus a new `HandbookFactsPanel` (hours, leave entitlements table, probation,
  notice, payroll date, applicable labour laws).
- Step 2 `ChooseChaptersStep`: the same three starts (Recommended for
  <country/industry>, Import, Scratch) with the chapter catalog grouped by
  part; custom chapter composer (title, part, owner).
- Step 3 `LookStep` unchanged (same templates, options and cover chooser).
- `buildNewHandbook(input)` in `components/documents/handbook-helpers.ts`;
  `createManual` posts `kind: "handbook"`; redirect to
  `/documents/handbook/<id>?generate=1[&cover=ai]`.
- `document-type-chooser.tsx`: handbook card `available: true`, `onChoose`
  typed `"sop" | "handbook"`, hub routes to the right `new` page; remove the
  "coming soon" copy in the hub empty state and hero description.

### Step 5: Builder

- `app/documents/handbook/[id]/page.tsx` → `HandbookBuilder`.
- Generalise `builder-context.tsx` (`ManualBuilderActions`), `SopBuilderShell`
  (labels: "Add chapter", "Chapter 3 of 18", rail summary "Employee handbook,
  18 chapters"), `ManualRail` (groups from parts; the item menu is unchanged),
  `ProgressPill`, `builder-dialogs.tsx` (Add chapter modal over the handbook
  catalog; Manual details modal with the handbook facts panel), `review-mode`
  and `placeholders-dialog` (readiness checks come from the kind's helper).
  Mechanism: a `ManualKindAdapter` object passed through context with
  `labels`, `catalog`, `outline(manual)`, `isItemWritten`, `readinessChecks`,
  `placeholders`, `aiRequest*`, `renderPreview` so the shared components never
  branch on strings.
- `ChapterWriter` (new, parallel to `SopWriter`): header fields title, code
  (optional), part, owner; sub-sections as panels using the existing
  `SectionBody`/`StreamingSectionBody` editors (they already cover every kind
  the handbook uses) and `SectionAiActions`; "Add sub-section" with a kind
  picker instead of "Add appendix".
- `HandbookFrontMatterWriter` / `HandbookClosingWriter`: reuse `FieldPanel`,
  `PartNotice`, `NarrativeField`, `RowsTable`; add Welcome, About, Vision /
  Mission / Values, Acknowledgement form fields.
- `use-section-ai.ts`: parameterise on the adapter's request builders (the
  five actions and their order stay: Improve, Shorten, Fix grammar, Rewrite,
  Custom).
- `sop-pdf-preview.tsx`: already posts the whole manual to `/preview`; add an
  `itemId` body field name the route accepts for both kinds.
- Hub: `listSopManuals` becomes `listManuals(orgId, view)` without the
  `kind=sop` filter; `resumeHref` and cover thumbnail by kind; stats line
  "Items across documents" or two counters.

### Step 6: Review, export and polish

- Readiness checks for handbooks: company and approver; document control;
  contacts; every chapter written; chapters without a procedure where the
  catalog expects one (grievance, recruitment, leave application); unique
  chapter codes (if codes used); placeholders; welcome written;
  acknowledgement present.
- Export file names, page-count recording, `X-Page-Count` unchanged.
- `npm run test:documents` gains the handbook test files; the `.scratch`
  outline tooling moves under `scripts/` as `handbook-corpus-report.ts` if
  kept.
- Live check in Brave on port 3000: create a handbook for a test org,
  generate about 18 chapters, preview, export PDF and DOCX, AI cover, archive
  and restore.

## 6. Open questions to settle before Step 3

1. Voice: the references address the employee ("you are entitled to…") while
   SOPs use third person. Confirm the handbook prompt should use second person.
2. Region: most handbooks are Indian (EPF, ESI, gratuity, POSH); a few are US
   (Arminak, PennEngineering) or Gulf (Stella). Decide whether the catalog
   carries region-specific chapters (e.g. "Statutory benefits (India)") or the
   AI adapts one chapter by `company.country`.
3. Forms: first cut as appendix tables, or a real `form` section kind with
   field rows and signature lines rendered as a fillable form in PDF and DOCX.
4. Import: still absent for SOPs; keep "coming soon" for handbooks too, or
   build the docx import for both kinds using `lib/docx/docx-model.ts`.

## 7. Files produced by this research

- `.scratch/handbook-research/outline.py`: outline extractor (python-docx).
- `.scratch/handbook-research/headings.py`: heading frequency aggregation.
- `.scratch/handbook-research/outline/*.txt` and `_index.tsv`: one outline per
  handbook with word, heading and table counts.
- `.scratch/handbook-research/docx/`: the 53 handbook files copied out of the
  `policies-ai-edit-and-workspace` branch (not for commit).
