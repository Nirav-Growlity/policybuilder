# PolicyCraft PoC — Environmental Policy Builder

## Overview
A premium Next.js 14 (App Router) + TypeScript + Tailwind single-page application that guides users through authoring an **Environmental Policy** document. The PoC is a faithful modernization of the `PolicyCraft.html` mockup with a premium/editorial visual style.

## Decisions (Confirmed)
| Topic | Choice |
|---|---|
| Stack | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Location | `D:\Policy PoC\src\` |
| Scope | **Environmental policy only** (other types hidden) |
| AI | Backend proxy at `app/api/ai` — **mocked by default**, real Claude when `ANTHROPIC_API_KEY` env var is set |
| Persistence | **File-based** — read .docx files via `mammoth`, serve 3 curated JSON seed templates |
| Exports | **PDF** (via `@react-pdf/renderer`) + **Word** (via `docx` lib) |
| Visual | Premium/editorial — Inter UI font + Fraunces/Georgia body, soft gradients, glassmorphism sidebar, magazine-style hero |

## Directory Structure
```
src/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   ├── builder/page.tsx                # 8-step builder
│   ├── templates/page.tsx              # Template gallery
│   ├── preview/[id]/page.tsx           # Standalone doc view
│   └── api/
│       ├── ai/route.ts                 # AI proxy (mock | real)
│       ├── templates/route.ts + [id]/route.ts
│       ├── parse/docx/route.ts         # .docx parser
│       └── export/pdf/route.ts + docx/route.ts
├── components/
│   ├── ui/ (button, input, panel, badge, toast, modal, tag, stepper)
│   ├── builder/
│   │   ├── sidebar.tsx, topbar.tsx
│   │   └── steps/step-{setup,declaration,focus,qualitative,quantitative,sdg,responsibilities,export}.tsx
│   └── policy/policy-preview.tsx
├── lib/
│   ├── store.ts (Zustand), types.ts, constants.ts
│   ├── ai/{prompts,mock,client}.ts
│   ├── templates/loader.ts
│   ├── docx/{parse,generate}.ts
│   └── pdf/generate.ts
├── data/seed-policies/ (ct-x, shilpa, vasuda — hand-curated from real docs)
└── PLAN.md
```

## Implementation Phases

### Phase 1 — Foundation
- `create-next-app` non-interactive in `src/`
- Install: `zustand`, `mammoth`, `docx`, `@react-pdf/renderer`, `lucide-react` (icon alternative), `clsx`
- Tailwind theme: forest green `#1a5c3a`, warm off-white, gold accent
- `lib/types.ts` — full data model
- `lib/constants.ts` — ENV defaults (8 focus areas, 6 responsibilities, 17 SDGs)

### Phase 2 — Design System
- `components/ui/*` — Button, Input, Textarea, Panel, Badge, Toast, Modal, Tag, Stepper
- `components/icons.tsx` — Lucide icon wrapper
- Premium landing page with hero, gradient backdrop, feature highlights

### Phase 3 — Builder Shell + 8 Steps
- Zustand store (persisted to localStorage)
- Sidebar: glassmorphism, progress, step list, policy badge
- Topbar: nav, AI generate-all, back/continue
- 8 step components mirroring the mockup but rebuilt as React

### Phase 4 — AI Integration
- `/api/ai/route.ts` accepts `{ type, context }`
- Mock mode returns curated, high-quality text from seed data
- Real LLM mode calls Claude when `ANTHROPIC_API_KEY` is set
- Per-section prompts tuned for environmental policy
- AI buttons trigger loading state + populate fields

### Phase 5 — Templates
- 3 curated JSON seeds in `data/seed-policies/` extracted from real docs (CTX Lifesciences, Shilpa Medicare, Vasuda Pharma)
- `/api/templates` — list templates
- `/api/templates/[id]` — get full template
- `/templates` page — gallery with "Use this template" action

### Phase 6 — Document Parsing
- `lib/docx/parse.ts` — extract text with `mammoth`
- `/api/parse/docx/route.ts` — reads files from policy folder
- Drag-drop on builder auto-fills fields (best-effort)

### Phase 7 — Exports
- `lib/docx/generate.ts` — generate `.docx` with `docx` lib
- `lib/pdf/generate.ts` — generate PDF with `@react-pdf/renderer`
- Export step UI: two big action cards

### Phase 8 — Preview & Polish
- `/preview/[id]` — standalone document-style view
- Mobile responsive
- Sample-data-on-first-visit for demos

## Data Model (lib/types.ts)
```typescript
type PolicyType = 'environmental';

interface Company {
  name: string; industry: string; site: string;
  docNum: string; revNum: string;
  effectiveDate: string; reviewDate: string; approver: string;
}

interface Declaration {
  preface: string; declaration: string; scope: string;
}

interface QuantitativeTarget {
  target: string; baseline: string; deadline: string;
}

interface QuantitativeArea { area: string; targets: QuantitativeTarget[]; }

interface Responsibility { role: string; duty: string; }

interface Policy {
  policyType: PolicyType;
  company: Company;
  standards: string[];
  declaration: Declaration;
  focusAreas: string[];
  qualitative: Record<string, string[]>;
  quantitative: QuantitativeArea[];
  sdgs: number[];
  responsibilities: Responsibility[];
  monitoring: string;
  reviewMechanism: string;
}
```

## 8 Builder Steps
1. **Company Setup** — name, industry, site, doc #, rev #, approver, dates
2. **Declaration & Scope** — preface, declaration, scope textareas
3. **Key Focus Areas** — editable list (8 ENV defaults)
4. **Qualitative Objectives** — per-focus-area commitment statements
5. **Quantitative Targets** — table: target / baseline / deadline
6. **SDG Alignment** — visual grid of 17 SDG tiles (multi-select)
7. **Responsibilities** — role + duty rows, monitoring + review textareas
8. **Preview & Export** — live document preview, PDF + Word download

## Out of Scope (PoC)
- Other policy types (Labour, Ethics, etc.) — locked to Environmental
- User authentication, multi-user, collaboration
- Backend DB (we use file-based + localStorage)
- Versioning / history
- E-signatures

## Success Criteria
- ✅ Complete all 8 steps for an environmental policy
- ✅ Premium/editorial visual style (not the mockup's look)
- ✅ AI generation works (mock by default, real LLM when key set)
- ✅ Load from 3 curated environmental templates
- ✅ Drag-drop .docx auto-populates fields
- ✅ Download polished PDF + .docx
- ✅ localStorage persistence for demo
- ✅ Mobile responsive
