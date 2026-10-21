# SOP Manual: gap analysis against the reference manuals

Date: 2026-10-21
Branch checked: `policies-ai-edit-and-workspace` (SOP code as on `documents-sop`)

## 1. Answer in one paragraph

No, we are not missing anything that blocks the main job. All 46 reference
SOP manuals can be rebuilt in our product with the same topics and the same
core SOP skeleton. 701 of the 705 reference SOPs match a topic in our catalog,
and Purpose, Scope, Roles, Procedure, Records and Review appear in almost every
manual and all exist in ours. **But the gaps are real, and they come in three
groups:**

1. **Sections and tables the consultants write in almost every manual that we
   cannot produce as first-class parts.** These are a per-SOP *Compliance*
   (legal and regulatory) section, free tables inside sections (escalation
   matrices, approval limits, waste registers, retention schedules), forms and
   annexures, and flowcharts or images.
2. **Inputs we never ask for, so the AI either writes generic text or leaves
   `[placeholders]`.** These are contact details, the company profile,
   certifications held, plant facts (equipment, permits, baselines), approval
   limits, and form numbering.
3. **Document-control fields the manuals print that we do not store or
   print.** These are Last review date, Issue date or Issue no., Supersedes, a
   richer revision history, distribution or controlled-copy notes, and per-SOP
   control data.

Section 5 ranks every gap with how many of the 46 manuals have it. Section 6
lists bugs and inconsistencies found in our own code during the check.
Section 8 is the per-manual breakdown.

## 2. How this was checked

- **Reference set:** every SOP manual in the repo (employee handbooks
  excluded). That is 45 `.docx` files in `SOP/`,
  `SOP Manual  Employee Handbook/SOP MANUAL/` and
  `Employee Handbook - SOP Manual/SOP/`, plus `SOP/SOP Manual- AMWL.pdf`:
  **46 manuals, about 705 SOPs.**
- **Extraction:** each `.docx` was dumped to text with headings, list items,
  table rows and page header/footer text kept
  (`tmp/sop-gap/extract.py`, output in `tmp/sop-gap/text/`). The AMWL PDF was
  read page by page.
- **Review:** five parallel reviews of 9 to 10 manuals each. Every manual got
  the same checklist: front matter in order, manual control fields, per-SOP
  header fields, per-SOP headings mapped to our section kinds, tables and their
  columns, forms, images, signatures, closing pages, and SOP topics.
- **Cross-check against our imported seed corpus** (`src/data/seed-sops/*.json`,
  705 SOPs). 1,063 reference sections did not map to any of our section kinds.
  The most common unmapped headings are:

  | Unmapped heading | Count |
  |---|---|
  | Compliance | 122 |
  | Documentation (and variants) | ~110 |
  | Abbreviations | 19 |
  | Future initiatives | 13 |
  | Commitment statement | 12 |
  | Standard distribution record | 5 |
  | CAPA / corrective and preventive action | 5+ |
  | Enforcement and penalties | 6 |
  | Escalation matrix | 2+ |

- **Our side:** read directly from code. The data model is
  `src/lib/sop/types.ts`. Inputs come from `components/documents/new-manual/*`,
  `components/builder/company-info-form.tsx` and
  `components/documents/builder/*`. Output comes from `lib/sop/render-model.ts`,
  `lib/typst/sop/manual.typ` and `lib/docx/sop-generate.ts`. The AI input is
  `lib/ai/sop-prompts.ts`, and the import is `lib/docx/sop-parse.ts`.

Counts below are "manuals out of 46 that have the item", taken from the
reviewers' reads. Treat them as ±2: many manuals use bold text instead of Word
headings, and images do not survive text extraction.

## 3. What we have today

### 3.1 Inputs

| Where | Fields |
|---|---|
| Company (setup step 1) | Name\*, logo (+ palette), sector / subsector / industry detail, country, website, financial reporting period (FY/CY), sites (location, address, primary function) |
| Manual control (setup step 1) | Document no., revision, classification (Internal / Confidential / Public / Controlled copy), effective date, review frequency, next review date (auto), prepared by, reviewed by, approved by\* |
| SOP selection (step 2) | Catalog of 55 topics (43 ESG + 12 operational), suggested by industry; custom SOPs (title, pillar, department); import of an existing `.docx` manual; grouping by pillar, by department, or none |
| Look (step 3) | 5 templates, accent colour, font pair, A4/Letter, SOP header card on/off, cover (template / upload / AI) |
| Per SOP (builder) | Title, code (auto `PREFIX-DEPT-NNN`), pillar, department, owner, version; each section on/off and renamable; custom sections |
| Front matter (builder) | Introduction, Objective, Benefits (lines), Sites (from company), Core values (value + meaning), How to use, Glossary |
| Closing (builder) | Review mechanism, Revision history (rev, date, change), Approval statement, Signatories (role, name, designation, date) |

### 3.2 Outputs (PDF and Word, same content)

- Cover with a document-control grid: Doc no., Revision, Effective, Next
  review, Prepared, Reviewed, Approved, Classification.
- Contents page with page numbers.
- Front matter: Introduction, Objective (+ benefits), Scope and Applicability
  (sites table: Sr., Site, Address, Primary function), Core Values, How to
  Use, Glossary.
- Chapter dividers (E/S/G or department).
- Per SOP: an opener with a meta card (SOP No., Version, Department, Owner,
  Effective, Next review, Prepared by, Approved by). The numbered sections are:
  1. Purpose
  2. Scope
  3. Definitions (table)
  4. Roles & Responsibilities (table)
  5. Procedure (numbered steps, optional responsible, sub-steps; numbered
     blocks or step table)
  6. Monitoring & KPIs (Indicator / Target / Frequency / Owner)
  7. Training
  8. Records (Record / Owner / Retention / Format)
  9. References
  10. Review & Amendment
  11. Appendix (off by default)
  12. Custom sections
- Closing: Review Mechanism, Revision history, Approval (statement +
  signature table or stamp panel, both with signature space).
- Running header and footer: logo/company, current SOP, doc no./rev/effective
  (some templates), page X of Y.

## 4. Confirmed: what is covered

These match or exceed the reference manuals, so no action is needed.

| Item | Reference usage | Our status |
|---|---|---|
| SOP topics | 705 SOPs | 701 map to the catalog. The 4 unmapped are CSR, Stakeholder Engagement, Product Quality & Customer Satisfaction, and Sustainability Customer Offerings |
| Purpose, Scope, Roles, Procedure, Review per SOP | ~all 46 | Covered |
| Definitions, Monitoring/KPIs, Training, Records, References per SOP | about half of the manuals | Covered (and on by default) |
| E/S/G or department chapters | ~12 manuals | Covered |
| Sites table in front matter | ~40 | Covered (column differences in 5.3) |
| Intro / objective / core values / benefits front matter | ~30 | Covered (benefits as a list, not a table) |
| Doc no. / Rev / Page in running header | ~30 | Covered in the control-table and register-line templates |
| Revision history table | ~25 | Covered (but fewer columns, see O5) |
| Approval with signature space | ~15 | Covered. `signature-table` has a Signature column and `stamp-panel` has a signing line |
| Procedure as a step table with a responsible column | ~8 | Covered by the `step-table` layout (extra columns missing, see O23) |
| KPI table with targets | ~6 | Covered. Most references have no targets at all |
| Contents page | 4 | Covered (we always print it) |
| Per-SOP meta card | 5 | Covered. Most references have none |

Parts we print that references rarely have: How to Use (1 of 46), Glossary at
manual level (~4), and the per-SOP meta card (5). These are not problems; they
are optional or empty-safe.

## 5. Gaps

Each gap is marked **I** (an input we do not collect) or **O** (an output
part we do not print), or both. Priority: **P1** means most manuals have it or
it is audit-visible. **P2** is common. **P3** is occasional or cosmetic.

### 5.1 Per-SOP sections we do not have

| # | Gap | Type | Manuals | Examples | Priority |
|---|---|---|---|---|---|
| O1 | **Compliance / Legal & Regulatory Compliance** section per SOP: the Acts, rules, standards and buyer codes that apply, and how compliance is shown. 122 reference sections carry exactly this heading | O + I | **22** | Arrival, Excel, Alchem, IMS, Indutch, Jutify, Mars Stitch, RS Composite, Stella, Waaree, Transpek, Jay Finechem, JRS&GMW, Praveen, Riya, Gloster, ISRPL, Priya, PSAFL, Somakannan, BRAL, Ganges (clause reference) | **P1** |
| O3 | **Introduction / Overview / Summary / Objectives** before Purpose (context paragraph plus objective bullets) | O | **18** | ASCG, Arminak, Bedmutha, Alchem, Novopor, Navitas, Jutify, RS Composite, Jay, JRS, Praveen, Riya, Skypass, Ballyfabs, Choksi, CTX, Naxpar, Kraftwares | **P1** |
| O8 | **Non-compliance / Corrective actions (CAPA) / Enforcement & penalties / Disciplinary** | O | **11** (+3 with a "Violations" note) | ASCG, IMS, Mars Stitch, Navitas, AMWL, Cherry Hill, Tagoor, Gloster, BRAL, Naxpar, Kraftwares | P2 |
| O10 | **Continuous improvement / Future initiatives** (planned improvements, targets) | O | 9 | Alchem, Jay, JRS, Praveen, Riya, ISRPL, PSAFL, Priya, RS Composite | P2 |
| O11 | **Abbreviations** table per SOP (separate from Definitions) | O | 7 | Ganges, Alchem, Navitas, JRS, Praveen, Priya, PSAFL | P3, or reuse Definitions |
| O26 | **Prerequisites / Equipment & materials required** | O | 2 | Gautam, Ognibene | P3 |
| O26b | **Emergency response protocols** inside the SOP | O | 4 | Transpek, Novopor, AMWL, Rakheja | P3 (custom section works) |
| O34 | **Conclusion** and **Commitment statement** box at SOP end | O | 3 | Excel, Gloster (conclusion); JRS, Priya (commitment box) | P3 |

Today these can only be added by hand as custom sections. The AI never writes
custom sections (`AI_WRITTEN_SECTION_KINDS`), so a generated manual never has
them. O1 is the most visible miss, because auditors read the compliance
section first.

### 5.2 Content inside sections

| # | Gap | Type | Manuals | Examples | Priority |
|---|---|---|---|---|---|
| O2 | **Free tables inside any section.** Users cannot create or edit a table in narrative/custom/procedure text (the editor is plain text: paragraphs, "-" bullets, "1." lists). Tables that come from import are kept but moved to the end of the section on the first edit (see B3). The most common kinds are below | O | **~42** (1,460 tables in the corpus) | everywhere | **P1** |
| O2a | Escalation matrix (severity / criteria / response time / owner) | O | 11 | Arminak, Bedmutha, IMS, Novopor, Jutify, Navitas, Stella, Waaree, Tagoor, RS Composite, Gloster | (part of O2) |
| O2b | Approval / delegation-of-authority limits (value band → approver, in INR/USD) | O + I | 13 | Alchem, Arrival, Dawar, IMS, Quality Rubbers, Navitas, Tagoor, Waaree, Jay, Skypass, JRS, Permeshwar, Cherry Hill | (part of O2) |
| O2c | Retention schedule (record / period / criteria / disposal method) | O | ~20 | Birla, Gloster, Waaree, Stella, Ognibene, Ballyfabs, AMWL, Cherry Hill… | (part of O2) |
| O2d | Waste register / bin-colour table / waste stream matrix | O | ~18 | Sri All India, Dawar, Transpek, AMLRS, Gloster, Jutify, PSAFL… | (part of O2) |
| O2e | Monitoring parameters (parameter / unit / permissible range / test frequency / method) | O | 4 | AMWL, Choksi, Indutch, Navitas | (part of O2) |
| O4 | **Forms, formats, checklists, log templates** printed in the manual (customer feedback form, incident report form, FORM 10 hazardous waste manifest, monthly consumption logs, F-gas register), with checkboxes and signature lines | O | **14** | Arminak, Alchem, Gautam, Ganges, Jutify, Prestige, Ognibene, Navitas, RS Composite, Stella, Waaree, Jay, Riya, Skypass | **P1** |
| O17 | **Form / record numbers.** Records with a form code (e.g. `BFIL/EHS/001`, `R/01-23`), and References as a "Document No. / Title" list | O + I | 14 | Gautam, Ganges, Transpek, Novopor, Quality Rubbers, Navitas, AMWL, Skypass, Praveen, Birla, Gloster, Ballyfabs, CTX, Tagoor | P2 |
| O7 | **Flowcharts, images, pictograms** (process flow, decision flowchart, GHS / transport pictograms) | O | **12** | Bedmutha, Gautam, Arminak, Ganges, ASCG, Alchem, Novopor, RS Composite, Birla, ISRPL, Jay, Praveen | P2 |
| O27 | **Several lettered appendices / annexures per SOP** (Annex A, B…; "Annex: Prohibited Transactions"). We have a single appendix, off by default and never written by AI | O | 5 | Gautam, Alchem, Ballyfabs, Choksi, CTX | P2 |
| O23 | Step-table columns beyond Responsible (Details, Status/Notes, Time guideline, Supporting document) | O | 8 | Ballyfabs, Choksi, CTX, BRAL, Kraftwares, AMWL, Cherry Hill, Gautam, Jay | P3 |
| O24 | KPI table extras (Baseline, Formula, weighted scorecards with Weightage % / Score) | O | 6 | Jutify, Gautam, AMLRS, Ganges, Arminak, Skypass | P3 (O2 would cover) |
| O25 | Roles table extras (Key Activities, Frequency, separate "Accountability") | O | 3 | Jay, Quality Rubbers, Transpek | P3 |
| O16 | **Applicable sites per SOP** (site table or site list inside each SOP's Scope) | O + I | 4 | Dawar, Gautam, Sri All India, Permeshwar | P3 |
| O18 | Callouts / notice boxes, table captions, footnotes, taglines | O | 8 | Quality Rubbers, JRS, Priya, Indutch, Prestige; taglines: Ballyfabs, Choksi, CTX, Naxpar, Bedmutha | P3 |

### 5.3 Manual-level document control and closing

| # | Gap | Type | Manuals | Examples | Priority |
|---|---|---|---|---|---|
| O6 | **Last review date** as its own field (printed beside Effective and Next review) | I + O | **16** | IMS, Indutch, Jutify, Quality Rubbers, Tagoor, Transpek, AMLRS, Rakheja, Birla, Jay, JRS, Praveen, Skypass, Priya, PSAFL, Kraftwares | **P1** |
| O5 | **Revision history columns** beyond Rev / Date / Description: Reviewed By, Approved By, Section revised, Revision date vs Effective date, Reason / Purpose | I + O | **16** | ASCG, Arminak, Bedmutha, Gautam, Ganges, Indutch, Mars Stitch, Prestige, Sri All India, Waaree, Cherry Hill, Stella, AMLRS, Riya, Skypass, IMS | **P1** |
| O5b | Revision table holding milestone rows (Effective / Review / Last review / Next review dates) | O | 6 | Birla, Gloster, Jay, JRS, AMLRS, Somakannan | P3 (covered once O6 is printed) |
| O28 | **Issue date / Date of issue / Origin date / Issue No.** (separate from Rev. No.) | I + O | 7 | IMS, Transpek, Navitas, AMWL, BRAL, PSAFL, ISRPL | P2 |
| O29 | **Supersedes** printed in the control grid / header | I + O | 2 | Jay Finechem, Praveen | P2 (we already store it, see B1) |
| O13 | **Distribution / controlled copy**: distribution list, "Controlled copy" vs "Uncontrolled when printed" statement, staff acknowledgement of receipt | I + O | **10** | Excel, Alchem, Gautam, Indutch, Navitas, Tagoor, Sri All India, ISRPL, Praveen, Riya | P2 |
| O12 | **Structured review mechanism**: review-trigger table (trigger / action / authority), staged review process, review committee or owner-by-category table, approval authority by change type, risk-based review intervals | O | **10** | Jay, JRS, Priya, PSAFL, ASCG, Bedmutha, Alchem, Gautam, Stella, Waaree | P2 (O2 would cover the tables) |
| O15 | **Per-SOP control data that differs by SOP**: own doc no., effective date, revision date, review frequency, prepared/reviewed/approved roles. We copy the manual's values into every SOP's meta card, and there is no Reviewed by per SOP | I + O | 5 | Navitas, Bedmutha, Tagoor, Gautam, Ognibene | P2 |
| O15b | Per-SOP revision history | O | 1 | Gautam | P3 |
| O31 | Scanned signature / stamp image in approval | I + O | 1 | AMWL | P3 |

### 5.4 Front matter, chapters and cover

| # | Gap | Type | Manuals | Examples | Priority |
|---|---|---|---|---|---|
| O20 | **Manual title and subtitle**. Ours is fixed to "SOP Manual" / "Standard Operating Procedures". References use "ESG SOP Manual", "The ESG Compliance Guide", "Standard Operating Practices", "Company-Wide SOP, All Departments", "Environment, Product Stewardship and Governance" | I + O | 6 | Gloster, Jay, AMWL, Naxpar, PSAFL, Navitas | P2 |
| O19 | **Extra front-matter parts**: ESG framing / pillar intro pages with focus areas, Governance structure (level / responsibility / decision authority), Structure of this manual, Document control & compliance section, Audience / language / accessibility, Company overview with goal and vision | O | 8 | ASCG, Arminak, JRS, PSAFL, Gautam, Tagoor, Riya, AMLRS | P3 |
| O21 | **Certifications / standards held** stated on cover or intro (ISO 9001/14001/45001, SA8000, BSCI, SMETA, BRC, GMP) | I + O | 4 | Ganges, PSAFL, JRS, ISRPL | P2 (as input, see I3) |
| O14 | **Chapter-level content**: shared Definitions for a chapter, editable chapter intro text, Roles/Review once per chapter. Our divider text is fixed (`PILLAR_SUMMARIES`, "Procedures owned by X") | O | 8 | Ballyfabs, Choksi, CTX, BRAL, AMWL, Quality Rubbers, Arminak, ASCG | P3 |
| O22 | **Site table columns**: Country, Entity / legal entity, Unit name, Business activity, plus a note that the listed sites are the only operational ones | I + O | 7 | ASCG, Stella, Priya, PSAFL, AMLRS, Cherry Hill, Waaree | P3 |
| O30 | Benefits as a table (Benefit area / Description) | O | 4 | ASCG, Arminak, Bedmutha, Novopor | P3 |
| O32 | Company address or website in the running header | O | 2 | Gloster, AMLRS | P3 |

### 5.5 Inputs we never ask for (what the AI is missing)

Our AI receives only: company name, industry classification, country, sites,
departments, the control data and the SOP register (`buildSopManualContext`).
The prompt correctly forbids inventing facts, so anything below comes out as
generic text or `[placeholder]`. Navitas, a consultant-written reference, has
28 "[To be confirmed by the Company]" markers. Our output will have the same
kind of holes, and nothing in the product flags them (see B6).

| # | Missing input | Used for | Manuals | Priority |
|---|---|---|---|---|
| I1 | **Contact directory**: ethics / grievance / EHS / compliance / HR emails, emergency numbers (fire, police, hospital), named compliance officer, customer hotline | Reporting channels in procedures, emergency SOPs, whistleblower and grievance SOPs | **20** | **P1** |
| I2 | **Company profile facts**: year founded, products/services, markets, headcount, tagline, mission/vision | Introduction (references open with a real company profile; ours can only be generic) | ~15 | **P1** |
| I3 | **Certifications and standards held / buyer programmes** | References, Compliance section, Introduction, cover | ~10 (cited throughout; on cover in 4) | **P1** |
| I4 | **Operational facts per topic**: installed equipment (ETP/STP, solar MWp, filters, DG sets), waste streams and authorised recyclers, consents/permits, permitted quantities, baselines and targets, monitored parameters | Procedure, KPIs, registers. This is where references are most specific | ~12 | P2 (could be an optional per-SOP "facts" box the AI must use) |
| I5 | **Approval limits / delegation of authority** with currency | Sensitive-transaction, procurement and gifts SOPs | 13 | P2 |
| I6 | **Form / record numbering scheme** (e.g. `{PREFIX}/{DEPT}/F-01`) and the list of existing forms | Records, References, procedures | 14 | P2 |
| I7 | **Last review date, Issue date, Issue no., Supersedes** | Document control (O6, O28, O29) | 16 / 7 / 2 | **P1** for last review |
| I8 | **Per-SOP overrides**: prepared/reviewed/approved, effective date, review frequency, applicable sites | Per-SOP control (O15, O16) | 5 + 4 | P2 |
| I9 | **Distribution list / controlled-copy holders** | O13 | 10 | P2 |
| I10 | **Manual title and subtitle** | Cover, header (O20) | 6 | P2 |
| I11 | **Applicable laws and regulators** (e.g. state pollution control board, Factories Act, labour law of the country). The prompt only names laws "when certain", so most of our References and every Compliance section stay thin | O1 Compliance, References | ~25 name specific Acts | **P1** (pairs with O1) |
| I12 | **Organisation structure**: governance committee, review committee, grade/hierarchy table | Roles, governance front matter, review mechanism | 5 | P3 |

`reportingPeriod` (FY/CY) is collected on the company form but not used by
the SOP manual. That is fine; it is a policy field.

## 6. Bugs and inconsistencies found in our code

| # | Finding | Where | Effect |
|---|---|---|---|
| B1 | `control.supersedes` is in the model, render model and import, but no input field sets it (the wizard sets `""`). The cover grid does not print it in either Typst (`control-rows`) or Word (`controlGrid`) | `new-manual-wizard.tsx:50`, `details-step.tsx`, `manual.typ:404`, `sop-generate.ts:1466` | A stored field that never shows |
| B2 | The import parses **Issue date** and **Last review date** from reference headers (`ParsedSopControl`), but `SopManualControl` has nowhere to keep them, so they are dropped | `lib/docx/sop-parse.ts:70-72, 749-766` | An imported manual loses data the source showed |
| B3 | Narrative editing (`plainToRichText`) keeps table blocks but always appends them **after** all text. The first edit to a section with an imported or AI table moves the table to the end. Users also cannot add or edit a table there | `components/documents/manual-helpers.ts:41-53` | Imported SOP layout changes silently; no way to author O2 tables |
| B4 | The footer and the cover panel say **"Controlled copy"** whatever the Classification setting (Internal / Public / Confidential) | `manual.typ:187, 438`; `sop-generate.ts:1436, 1445, 1549` | A "Public" manual still prints "Controlled copy" |
| B5 | Cover title and eyebrow are hard-coded ("SOP Manual", "Standard Operating Procedures") | `render-model.ts` (`title`, `cover`) | No manual title (O20) |
| B6 | The AI is told to write `[placeholder]` for unknown values, but the Review readiness checks do not look for bracketed placeholders | `manual-helpers.ts` `readinessChecks` | A manual can be marked "Ready to export" with `[consented discharge limit]` in it |
| B7 | The AI schema allows `table` blocks, but the prompt never asks for one, and the AI never writes Appendix or custom sections | `sop-prompts.ts`, `ai-contract.ts` `AI_WRITTEN_SECTION_KINDS` | Generated SOPs never get escalation matrices, retention schedules or annexes, which references almost always have |
| B8 | The per-SOP meta card prints the manual's Effective / Next review / Prepared / Approved for every SOP, and there is no Reviewed by | `render-model.ts` `toRenderSop` | Fine for most manuals; wrong for the 5 that control each SOP separately (O15) |

## 7. Recommended order of work

1. **Document control completeness** (small and audit-visible). Add Last review
   date, Issue date, and Supersedes to the details form, cover grid, running
   header and Word output. Keep what the import already parses (B1, B2).
   Extend revision history with Reviewed by and Approved by. Make the
   "Controlled copy" text follow Classification (B4). Add a manual title and
   subtitle (B5).
2. **Compliance section kind** (O1 + I11). Add it to the canonical skeleton,
   on by default, after References or merged with them. Write it with the AI
   from the country, the certifications and a new "applicable laws and
   regulators" input. Optionally add a "Non-compliance & corrective action"
   kind (O8) and an "Introduction / Overview" kind before Purpose (O3).
3. **Contact directory and company profile inputs** (I1, I2, I3). Add them to
   the company step and pass them to the AI context, so emails, helplines,
   certifications and a real company profile appear where the references put
   them.
4. **Tables in any section** (O2, B3). Add a table block editor to
   narrative/custom/appendix sections, and keep blocks in their original order.
   Then let the AI add tables where the topic calls for them (escalation
   matrix, retention schedule, approval limits, waste register) (B7).
5. **Forms and annexures** (O4, O17, O27, I6). Add a per-SOP "Forms & formats"
   list (code, title, retention) and multiple lettered appendices, each holding
   free text, a table or a form template (fields + checkboxes + signature
   lines).
6. **Placeholder check** (B6). Add a readiness check that lists every
   `[...]` the AI left, with a Fix link.
7. Later (P3): images and flowcharts in SOP bodies (O7), per-SOP control
   overrides (O15, O16), chapter intro text and shared chapter definitions
   (O14), distribution list (O13), and the column extras in O22 to O25.

## 8. Per-manual breakdown

Key: **FM** = front matter, **SOP+** = per-SOP parts beyond our skeleton,
**Ctl** = control/closing items beyond ours.

| # | Manual | FM | SOP+ | Ctl |
|---|---|---|---|---|
| 1 | Advanced Supply Chain Group | Intro, objective, benefits table, sites (country), ESG framing | Introduction, Non-compliance & remediation, image placeholder | Review owner-by-category table; revision history + Reviewed/Approved by |
| 2 | Alchem International | Intro, objective, scope, core values (8) | Introduction/background, Compliance, Abbreviations, approval tier matrix, risk scoring, emergency contacts, feedback form appendix | Review mechanism as a full SOP: approval by change type, controlled copies |
| 3 | Arminak (KBL Cosmetics) | Intro, objective, benefits table, sites, ESG framing, E/S/G pillar pages | Introduction, escalation matrix, data-capture forms, incident form with signature, text flow diagrams, supplier scorecard | Revision history + Revision date / Approved by |
| 4 | Arrival Fashion | Title block only | SOP code; Compliance; prose responsibilities | Effective / Next review / Approved by lines |
| 5 | Bedmutha Industries | Intro, objective, benefits table, sites | Per-SOP header card with tagline and its own Prepared/Approved; Introduction; flowcharts; escalation matrix | Review committee table; revision history + Revision date / Approved by |
| 6 | Dawar Footwear | None | Sites table in every SOP; Evidence of compliance; ₹ thresholds; waste register | Doc no. in header; blank Approved by |
| 7 | Excel Industries | Overview, objective, applicability, sites | Compliance & regulations; Conclusion; Standard distribution record | Revision history (matches ours) |
| 8 | Ganges Jute | Title with ISO/SA8000/BRC certifications; index; abbreviations | Doc no. per SOP; KPI table; list of documents (DS flowcharts) and list of records with codes; clause reference; appraisal form | Revision table with reason / purpose |
| 9 | Gautam Solar | Purpose, scope, structure of manual, document control & compliance, how to use, training & acknowledgement | SOP no./version/department; sites per SOP; Prerequisites; KPI formula; Records & Forms with form IDs; lettered appendices; flowcharts; per-SOP revision history | Review as SOP with risk-based intervals; signature table |
| 10 | IMS | Amendment sheet, about, scope with sites | CAPA; Compliance requirements; escalation; approval limits | Issue no. and Rev no.; last annual review; amendment history; signature |
| 11 | Indutch Composites | Control block, company intro, sites, purpose, guiding principles | Compliance; captioned tables | Last review date; Manual control & distribution; revision history + Approved by |
| 12 | Jutify Lifestyle | Control block, applicability, sites | Objectives; Compliance; escalation; KPI with baseline; feedback form appendix | Last review / Next review; review mechanism steps |
| 13 | Mars Stitch | Company intro & mission, scope, sites | Reporting violations; Compliance & disciplinary | Revision history + Section updated / Approved by; signature table |
| 14 | Navitas Solar | Document control (issue date, copy, number of SOPs); SOP index with Areas covered | Own doc no., revision date, copy status and Prepared/Reviewed/Approved per SOP; Objectives; Definitions & abbreviations; blank registers; approval matrix; 28 "[To be confirmed]" placeholders | No closing |
| 15 | Novopor | Intro, objective, benefits table, sites with function | Introduction; escalation matrix; emergency preparedness; forms list with codes; annexures (flow diagram, do's and don'ts) | Revision history; blank Approved by |
| 16 | Ognibene | Intro, units table | Equipment & materials; effective date per SOP; confidentiality; noise log template | Reviewed by / Approved by lines |
| 17 | Prestige Promotion | Intro, purpose, objectives, sites, definitions | Feedback/complaint form annexure; table footnotes | Revision history + Section revised |
| 18 | Quality Rubbers | Intro, objectives, scope | Department chapters with intro text; roles with Frequency; approval thresholds; callout box; form codes | Approved by name; Last / Next review; contact no./email |
| 19 | AMWL (PDF) | Designed cover; contents; intro (history, mission); sites | E/S/G chapters, shared chapter definitions; lettered SOPs; step table with Status/Notes; monitoring parameters; contact emails | Origin date in header; scanned signature |
| 20 | Rakheja Enterprises | Purpose, objectives, scope, sites | Lettered thematic sections | Signature column; Last review date |
| 21 | RS Composite | Company profile, objective, scope, sites, core values | Introduction; Compliance; pictograms; emergency contacts; feedback form appendix | Prepared by only |
| 22 | Sri All India Exports | Intro, purpose, objectives, scope with sites, definitions, document control | Sites per SOP; Incident reporting & response; waste register | Revision history + Section revised / Approved by |
| 23 | Stella Hospitality | Intro, purpose, scope, sites (4 countries), core values | Escalation matrix; contact information; confidentiality; enforcement; feedback form appendix | Revision history + Approval date |
| 24 | Tagoor Laboratories | About this manual; document control (last review, distribution, status); control statement | Department / effective / review frequency per SOP; approval matrices; escalation | Revision control record |
| 25 | Transpek Industry | None | Accountability; form codes on records; emergency response; wide registers | Header with Issue/Rev and Eff. date; last review date |
| 26 | Waaree Energies | Intro, purpose, scope, sites (+ note), core values | Escalation matrix; approver-tier matrix; Compliance & legal; form appendix | Revision history + Reviewed by / Approval date |
| 27 | Cherry Hill Interiors | Contents; intro; scope with sites (+ note) | Corrective actions; frequency of inspections; audit schedule; step table | Revision history + Reviewed by / Approved by |
| 28 | AML RightSource | Intro, scope (legal entities), who it applies to, company overview & vision | Weighted KPI scorecard | Website in header; milestone-date table |
| 29 | Birla Jute | Intro, purpose, scope, core values, applicability | Pictograms; reference document list | Milestone-date table incl. last review |
| 30 | Gloster | Purpose, review cycle, applicability with sites | SOP no. per SOP; Compliance; Non-compliance & corrective action; Conclusion; contacts; list of documents/records | Milestone-date table; address in header; contact no. |
| 31 | ISRPL | Intro; scope with coverage sub-parts and sites | Compliance-style coverage; GHS pictograms; company ESG data (baselines, MWp) | Issued / Checked / Approved and "Uncontrolled when printed" in header |
| 32 | Jay Finechem | Intro, purpose, review cycle, applicability with sites | Introduction; Objectives; Compliance; Continuous improvement; FORM 10 manifest; feedback form; approval thresholds | Supersede no. in header; review-trigger matrix; review stages; signature table |
| 33 | JRS Pharma & GMW | Applicability with sites; company profile with certifications; governance structure | Introduction; Abbreviations; Compliance; Continuous improvement; commitment box | Review-trigger matrix; review stages; Sign |
| 34 | Permeshwar Creations | None | Sites in every SOP; contacts | Named approver |
| 35 | Praveen Laboratories | Company intro, objective, scope, core values | Introduction; Objectives; Compliance; Continuous improvement; emergency contacts; grade table; format numbers | Supersede in header; acknowledgement and signature table |
| 36 | Riya Travel & Tours | Scope & purpose; objectives & business impact; audience; language & accessibility; training requirements | Objectives; Compliance; Continuous improvement; feedback form; hierarchy table | Revision history + Reviewed by / Approved by |
| 37 | Skypass Travel | Applicability with sites; intro | Form/register codes; feedback form; approval and scoring matrices | Prepared / Approved in header; revision history + Reviewed by / Approved by |
| 38 | Priya Associates | Cover table; applicability with sites (entity/unit); intro | Abbreviations; Compliance; Continuous improvement; commitment box | Review-trigger table; Last review; Sign |
| 39 | Padma Satel Arab Fashion (PSAFL) | Applicability with sites (business activity); intro with certifications; governance structure | Abbreviations; Compliance; Future initiatives; training matrix; legal register; reporting schedule | Review-trigger table; review stages; Date of issue; Last review; Sign |
| 40 | Somakannan Textiles | None (intro at the end) | Compliance; contact emails | Review history (maps to ours) |
| 41 | Ballyfabs International | Intro with tagline; sites | Overview; shared Governance definitions; step table with Status/Notes; coded forms; annex; contact email | Effective / Next review / Approved by |
| 42 | B R Agrotech (BRAL) | Intro; sites | Enforcement & penalties; shared Governance definitions; step table; contact emails | Issue date |
| 43 | Choksi Heraeus | Intro with tagline; sites | Overview; shared Governance definitions; monitoring parameters; annex; CAPA register; emails | Effective / Next review / Approved by |
| 44 | Kraftwares (SOP_Manual_Corrected) | Contents; intro; sites | Summary; step table; contact emails | Last / Next review and Rev in header |
| 45 | CTX Lifesciences | Intro with tagline; sites | Overview; shared Governance definitions; coded forms; annex; emails | Effective / Next review / Approved by |
| 46 | Naxpar Pharma | Intro with tagline; sites | Overview; Corrective actions; emails | Approved by (company) |

## 9. Files produced by this check

- `tmp/sop-gap/extract.py`: the extraction script.
- `tmp/sop-gap/text/*.txt`: the 45 text dumps, plus `_index.tsv` with word
  counts.
- `tmp/sop-gap/BRIEF.md`: the checklist each review followed.
