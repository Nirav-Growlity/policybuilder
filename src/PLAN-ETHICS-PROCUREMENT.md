# PolicyCraft — Ethics & Sustainable Procurement Policy Types

## Goal
Add `ethics` and `sustainable-procurement` as first-class policy types in the PolicyCraft app, with seed policies parsed from ~34 real .docx documents using OpenAI API, and full support across parsing, preview, PDF export, DOCX export, AI generation, and the builder UI.

---

## Phase 1 — Core Type System (`src/lib/types.ts`)

Extend `PolicyType` union (line 1):
```ts
export type PolicyType = "environmental" | "labour-human-rights" | "living-wage" | "ethics" | "sustainable-procurement";
```

---

## Phase 2 — Policy Profiles (`src/lib/constants.ts`)

Add two new entries to `POLICY_PROFILES`:

### `"ethics"` profile
- `id: "ethics"`, `label: "Ethics Policy"`, `short: "Ethics"`, `icon: "ShieldCheck"` (already imported)
- `accent: "#3b6d11"`, `accentSoft: "#eef5e8"`, `documentPrefix: "ETH"`, `exportName: "Ethics-Policy"`
- `standards: ["ISO 37001", "UNGC", "BRSR", "SDGs"]`
- `focusAreas`: Anti-Corruption & Anti-Bribery, Conflicts of Interest, Data Privacy & Confidentiality, Gifts & Hospitality, Whistleblowing & Speak-Up, Regulatory Compliance, Fair Competition & Antitrust, Corporate Governance
- `responsibilities`: Compliance Officer, HR Manager, IT Manager, Internal Audit Team, Senior Management, Employees
- `sdgs: [8, 10, 12, 16, 17]`
- `aiRole: "ethics policy documents"`

### `"sustainable-procurement"` profile
- `id: "sustainable-procurement"`, `label: "Sustainable Procurement Policy"`, `short: "Sustainable Procurement"`, `icon: "Leaf"`
- `accent: "#854f0b"`, `accentSoft: "#faf3e0"`, `documentPrefix: "SP"`, `exportName: "Sustainable-Procurement-Policy"`
- `standards: ["ISO 20400", "EcoVadis", "UNGC", "BRSR", "SDGs"]`
- `focusAreas`: Supplier Code of Conduct & Onboarding, Supplier Due Diligence & Risk Assessment, Environmental Requirements for Suppliers, Ethical Sourcing & Anti-Corruption, Labour & Human Rights in Supply Chain, Supply Chain Transparency & Traceability, Supplier Capacity Building & Training, Monitoring, Auditing & Continuous Improvement
- `responsibilities`: Procurement Team, Sustainability Team, Suppliers, Senior Management, All Employees
- `sdgs: [8, 9, 12, 16, 17]`
- `aiRole: "sustainable procurement policy documents"`

---

## Phase 3 — Policy Selector UI (`src/components/builder/policy-selector.tsx`)

- Line 9: Add `ShieldCheck` to ICONS map: `{ Leaf, Users, BadgeIndianRupee, ShieldCheck }`
- Line 47: Add description text for the two new types:
  - `profile.id === "ethics"` → `"Integrity, transparency and anti-corruption practices."`
  - `profile.id === "sustainable-procurement"` → `"Responsible sourcing, supplier standards and supply chain integrity."`

---

## Phase 4 — Store (`src/lib/store.ts`)

No structural changes needed. `initialPolicy()` already uses `getPolicyProfile()` and will automatically pick up the new types.

---

## Phase 5 — Docx Parsing API (`src/app/api/parse/docx/route.ts`)

Change line 17 to accept the new types:
```ts
const policyType: PolicyType =
  requestedType === "labour-human-rights" || requestedType === "living-wage" || requestedType === "ethics" || requestedType === "sustainable-procurement"
    ? requestedType
    : "environmental";
```

---

## Phase 6 — Docx Parser (`src/lib/docx/parse.ts`)

### Add ethics focus area detection patterns to `FOCUS_AREA_KEYS`:
```ts
{ name: "Anti-Corruption & Anti-Bribery", patterns: [/anti.?corruption/i, /anti.?bribery/i, /bribe/i, /corrupt/i, /unlawful inducement/i] },
{ name: "Conflicts of Interest", patterns: [/conflict.*interest/i, /personal.*gain/i, /undisclosed.*interest/i] },
{ name: "Data Privacy & Confidentiality", patterns: [/data.*privacy/i, /confidential/i, /information.*security/i, /personal.*data/i, /gdpr/i] },
{ name: "Gifts & Hospitality", patterns: [/gift/i, /hospitality/i, /entertainment.*policy/i, /brib/i] },
{ name: "Whistleblowing & Speak-Up", patterns: [/whistleblow/i, /speak.?up/i, /reporting.*concern/i, /grievance.*ethic/i] },
{ name: "Regulatory Compliance", patterns: [/regulatory.*compliance/i, /legal.*compliance/i, /laws.*regulation/i] },
{ name: "Fair Competition & Antitrust", patterns: [/fair.*competition/i, /antitrust/i, /competition.*law/i, /cartel/i] },
{ name: "Corporate Governance", patterns: [/corporate.*governance/i, /board.*oversight/i, /accountability/i] },
```

### Add sustainable procurement focus area detection patterns:
```ts
{ name: "Supplier Code of Conduct & Onboarding", patterns: [/supplier.*code.*conduct/i, /supplier.*onboard/i, /vendor.*code/i] },
{ name: "Supplier Due Diligence & Risk Assessment", patterns: [/supplier.*due.*diligence/i, /supplier.*risk/i, /vendor.*assess/i, /supply.*chain.*risk/i] },
{ name: "Environmental Requirements for Suppliers", patterns: [/supplier.*environment/i, /supplier.*green/i, /environmental.*criteria.*supplier/i] },
{ name: "Ethical Sourcing & Anti-Corruption", patterns: [/ethical.*sourc/i, /responsible.*sourc/i, /conflict.*mineral/i] },
{ name: "Labour & Human Rights in Supply Chain", patterns: [/supplier.*labour/i, /supplier.*human.*rights/i, /supply.*chain.*labour/i, /supplier.*worker/i] },
{ name: "Supply Chain Transparency & Traceability", patterns: [/supply.*chain.*transparency/i, /supply.*chain.*traceab/i, /supplier.*disclosure/i] },
{ name: "Supplier Capacity Building & Training", patterns: [/supplier.*training/i, /supplier.*capacity/i, /supplier.*develop/i, /supplier.*improvement/i] },
{ name: "Monitoring, Auditing & Continuous Improvement", patterns: [/supplier.*audit/i, /supplier.*monitor/i, /supplier.*assess.*compliance/i, /supplier.*evaluat/i] },
```

---

## Phase 7 — PDF Export (`src/lib/pdf/generate.tsx`)

No structural changes needed. Already policy-type-agnostic via `getPolicyProfile()`.

---

## Phase 8 — DOCX Export (`src/lib/docx/generate.ts`)

No structural changes needed. Already policy-type-agnostic via `getPolicyProfile()`.

---

## Phase 9 — Policy Preview (`src/components/policy/policy-preview.tsx`)

No structural changes needed. Already policy-type-agnostic via `getPolicyProfile()`.

---

## Phase 10 — AI Route (`src/app/api/ai/route.ts`)

No structural changes needed. Already policy-type-agnostic.

---

## Phase 11 — AI Mock (`src/lib/ai/mock.ts`)

No structural changes needed. Already uses `getPolicyProfile()`.

---

## Phase 12 — Templates Page (`src/app/templates/page.tsx`)

No structural changes needed. Already reads `policyType` from seed JSON files.

---

## Phase 13 — Parsing Scripts

### New file: `src/scripts/parse-ethics-policies.ts`
Based on `parse-social-policies.ts`. Key differences:
- **Document discovery regex:** `/ethic|ethical|integrity|governance|anti-corruption|business conduct|compliance/i`
- **Exclusion regex:** `/labou?r|human rights|living wage|fair wage|environment|sustain.*procure|green.*procure|supply chain|responsible.*sourc/i`
- **Type classification:** Always `"ethics"`
- **Output:** `src/data/seed-policies/ethics-{company-slug}.json`

### New file: `src/scripts/parse-procurement-policies.ts`
Same pattern, but:
- **Document discovery regex:** `/sustain.*procure|green.*procure|responsible.*sourc|supply chain|supplier|procurement/i`
- **Type classification:** Always `"sustainable-procurement"`
- **Output:** `src/data/seed-policies/sustainable-procurement-{company-slug}.json`

---

## Phase 14 — Generate Seed Policies

Run both scripts sequentially:
1. `npx ts-node src/scripts/parse-ethics-policies.ts` → ~19 seed JSON files
2. `npx ts-node src/scripts/parse-procurement-policies.ts` → ~15 seed JSON files

### Ethics companies (19):
Allchem, Cherry Hill, CTX, Kraftwares, Naxpar, Renewsys, Yash Speciality, Anupam Rasayan, Excel, Ganges, KBL Cosmetic, Prestige Promotion, Quality Rubbers, Sri All India, PISPL, RIYA TRAVELS, Shilpa Medicare, Vasuda Pharma

### Sustainable procurement companies (15):
CTX, Naxpar, 20 Microns, Anupam Rasayan, Excel, Ganges, KBL Cosmetic, Prestige Promotion, Quality Rubbers, Sri All India, MEWBURN, PISPL, RIYA TRAVELS, RL FINECHEM

---

## Phase 15 — Testing

1. `npm run typecheck` — verify no TypeScript errors
2. `npm run lint` — verify no lint errors
3. Verify in browser:
   - Policy selector shows all 5 types with correct icons, colors, descriptions
   - Selecting ethics loads correct defaults (8 focus areas, 6 responsibilities, 5 SDGs)
   - Selecting sustainable-procurement loads correct defaults (8 focus areas, 5 responsibilities, 5 SDGs)
   - AI generation (mock mode) works for both new types
   - Templates page shows ethics and procurement templates with correct type tags
   - Builder steps render correctly for new types
   - Export generates correct filenames (`Ethics-Policy.docx`, `Sustainable-Procurement-Policy.pdf`)
   - Docx drag-drop parsing works for new types

---

## File Change Summary

| File | Action | Description |
|---|---|---|
| `src/lib/types.ts` | Modify | Extend PolicyType union (+2 values) |
| `src/lib/constants.ts` | Modify | Add 2 new POLICY_PROFILES entries |
| `src/components/builder/policy-selector.tsx` | Modify | Add ShieldCheck icon + descriptions for new types |
| `src/app/api/parse/docx/route.ts` | Modify | Accept new types in fallback logic |
| `src/lib/docx/parse.ts` | Modify | Add ~16 new focus area detection patterns |
| `src/scripts/parse-ethics-policies.ts` | Create | OpenAI parsing script for ethics docs |
| `src/scripts/parse-procurement-policies.ts` | Create | OpenAI parsing script for procurement docs |
| `src/data/seed-policies/ethics-*.json` | Create | ~19 seed files (generated by script) |
| `src/data/seed-policies/sustainable-procurement-*.json` | Create | ~15 seed files (generated by script) |

**No changes needed in:** `src/lib/pdf/generate.tsx`, `src/lib/docx/generate.ts`, `src/components/policy/policy-preview.tsx`, `src/app/api/ai/route.ts`, `src/lib/ai/mock.ts`, `src/app/templates/page.tsx`, `src/lib/store.ts`, `src/lib/sections.ts`, `src/lib/quantitative.ts`

**Total: 5 files modified, 2 scripts created, ~34 seed JSON files generated**

---

## Execution Order

1. `types.ts` + `constants.ts` (foundation)
2. `policy-selector.tsx` (UI shows new types)
3. `parse/docx/route.ts` + `docx/parse.ts` (parsing supports new types)
4. `parse-ethics-policies.ts` + `parse-procurement-policies.ts` (scripts created)
5. Run scripts → generates ~34 seed JSON files
6. Test everything
