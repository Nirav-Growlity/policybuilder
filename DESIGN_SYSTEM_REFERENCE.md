# ESGtech Design System Reference

Condensed from [UI_UX_DESIGN_SYSTEM.md](D:/esgtech-main-dev/docs/UI_UX_DESIGN_SYSTEM.md), inspected on 2026-10-07.
This reference uses that audit only; application files were not re-inspected or changed.
Measurements are source-defined or explicitly approximate, rather than browser-verified.

## 1. Executive Design DNA

ESGtech is a compact enterprise SaaS interface organized around assessments, dashboards, and dense data. Its main visual language combines bright blue actions, white surfaces, pale blue-gray borders, Helvetica typography, pill controls, and rounded rectangular cards. Green adds a sustainability accent. Labels and controls are small and often bold; generous card padding and outer spacing keep the dense content readable. Borders establish most hierarchy, with restrained shadows on ordinary surfaces and stronger elevation on floating UI.

The typical composition is a heading and filter toolbar, followed by KPI cards, charts, and detail tables. Top navigation establishes the product area; narrow vertical rails and contextual menus organize assessments. Structured forms commonly sit above existing-entry grids. Interactions use explicit actions, compact icon groups, confirmation dialogs, revision drawers, progress indicators, and pill toasts. Small screens stack cards and forms, wrap filters, and retain horizontally scrolling tables.

## 2. Canonical Design Priority

**Default reference: the established main application and administration family.** Reproduce its blue/white palette, compact Helvetica text, pill controls, 2px pale borders, and 10px standard cards.
The audit calls several of these implementations **Legacy**. They remain dominant and active; their age does not make the newer report-catalog controls the default.
The source has no single formal canonical layer. The ranking below is a documentation decision based on the audit's observed usage.

| Priority | Visual family | Classification and location | Reuse rule |
|---|---|---|---|
| 1 | Established application | **Canonical**; administration, CRUD, GHG/ESG assessments, shared shell; older active implementations | Default for general application reproduction |
| 2 | Newer rectangular UI | **Alternative**; chiefly reports catalog; 1px borders, 5–15px radii, smaller controls | Reuse as a coherent family where that appearance is intended; not a replacement default |
| 3 | Dashboard and workflow variants | **Feature-specific**; scope KPIs, Materiality, BRSR, ESG summary | Retain local metric, workflow, and accent treatments within their feature |
| 4 | Authentication | **Feature-specific**; login/password recovery, photography and glass-like composition | Authentication only |
| 5 | Report interfaces | **Report-only**; ESG report preview/editorial content and Materiality reports | Preserve each report's typography, palette, and geometry |
| 6 | Print/PDF layouts | **Report-only**; fixed landscape/portrait canvases, ESG Score A4 output | Keep page and print rules separate from responsive application UI |
| 7 | Historical/unused modules | **Legacy**; older grids, tabs, charts, exports without an established active consumer | Do not use as a default merely because a component exists |

Labels used throughout:

- **Canonical** — this document's recommended default, supported by dominant active use.
- **Alternative** — a valid secondary family, used intentionally as a complete treatment.
- **Feature-specific** — a local visual pattern, not a general application rule.
- **Report-only** — editorial/report styling, including generated document layouts.
- **Legacy** — older implementation; active use and deprecation must be distinguished.
- **Documentation token** — a normalized role name, not an installed project token.

## 3. Core Design Tokens

Role names below are **Documentation tokens**. The named source colors exist, but these semantic aliases do not.

### Main application colors

| Role | Exact value | Source meaning / use |
|---|---|---|
| Primary action | `#4186F3` | Existing `blue`; also `light-blue` and overridden `blue-400` |
| Primary hover, where defined | `#6EA3F5` | Existing `blue-light`; explicit newer UI Button hover, not universal legacy behavior |
| Page background | `#FFFFFF` or `#F7F8FA` | White or pale blue-gray depending on layout |
| Surface / card | `#FFFFFF` | Existing `primary` means white |
| Subtle surface | `#F7F8FA` | `gray-blue-98`; rails, table headers, hover |
| Soft surface / canonical border | `#F5F6F7` | `gray-blue-97`; 2px main controls/cards |
| Selected / hover surface | `#F2F3F5` | `gray-blue-96`; selected grid rows |
| Alternative component border | `#DADEE6` | `gray-blue-90`; newer 1px controls |
| Divider / shell border | `#EDEFF2` | `gray-blue-95` |
| Strong text | `#26334D` | `gray-blue-30` |
| Secondary text | `#4D5E80` | `gray-blue-50`; navigation, labels, headings |
| Muted text | `#6B7A99` | `gray-blue-60` |
| Established field / table text | `#7D8FB3` | `gray-blue-70` |
| Placeholder / helper | `#ADB8CC` | `gray-blue-80`; newer input instead uses `#6B7A99` |
| Success / brand green | `#3EAC5C` | Existing `green`; local workflows also use other greens |
| Warning / orange accent | `#FF6633` | Existing `orange` |
| Warning highlight | `#FFD559` | Existing `yellow` |
| Danger | `#FF0000` | Existing `red`; destructive button and field errors |
| Information | `#4186F3` | Frequently paired with blue at 5–10% alpha |
| Modal overlay | `#000000` at 40% | DefaultPopup; mobile navigation uses 30% |

### Scoped colors

Dark mode has its own surface/text/action mappings in section 20; do not infer them by inverting this table.

| Family | Defining colors | Scope |
|---|---|---|
| ESG report pillars | Environment `#16A34A`; Social `#2563EB`; Governance `#7C3AED` | Report-only |
| Materiality report | Blue `#1679F0`; green `#00AA50`; navy `#0A1628` / `#0F2A52` | Report-only |
| ESG summary hero | `#EDF9F0` → `#F4F1FF`, 118° | Feature-specific gradient |

## 4. Typography

**Canonical stack:** `"Helvetica", "Helvetica Neue", Arial, sans-serif`.
The audit found no globally loaded application webfont. Sizes below assume a 16px root; custom sizes do not imply custom line-height tokens.

| Role | Size | Weight | Line height / treatment |
|---|---|---|---|
| Page title | 20px → 24px at `sm` | 700 | Stock `text-xl` / `text-2xl`: 28px / 32px |
| Dashboard title | 24px | Bold | Blue; tight tracking |
| Section / modal title | 18–20px | 700 | Stock size line heights commonly 28px |
| Small card title | 14–16px | 600–700 | Family-specific; 20px / 24px with stock utilities |
| Body | 14px or 16px | Context-dependent | Stock line heights 20px / 24px |
| Small body / dense UI | 12px | Context-dependent | Stock line height 16px |
| Form label | 12px | 700 | 16px; blue-gray; red required asterisk |
| Helper text | 12px | 500 | Pale `#ADB8CC` |
| Validation error | 12px | Not standardized | Red beneath the field |
| Canonical button | 12px | 700 | 16px |
| Header navigation | 13px | 700 | No dedicated custom line-height scale |
| Standard table header | 14px | 500 | `#4D5E80` |
| Standard table body | 14px | Inherited | `#7D8FB3` |
| KPI value | 28px representative | 700 | Dashboard family spans 24–30px and 700–800 |
| KPI label / unit / trend | 14px / 14px / 12px | 600 / 500 / 600 | Value remains the strongest element |

Uppercase is used selectively for compact badges, metric labels, and table/report captions, not general body copy.
**Alternative:** newer UI buttons use 12px/600, large buttons 14px; newer table headings use 11px bold uppercase and bodies 12px.
**Exceptions:** calendar styles reference Roboto; report Inter and PDF Arial/Helvetica remain separate in section 22.

## 5. Spacing System

The source combines a normal 4px base scale with pixel-named overrides and important local dimensions.

| Space | Common use |
|---|---|
| 4px | Small icon/label gaps; dropdown placement gap |
| 8px | Compact toolbar/menu gaps; newer button icon gap |
| 12px | Compact interiors; grid cell padding |
| 16px | Page gutters; dashboard grid gaps; small-screen card spacing |
| 20px | KPI padding; modal child gaps; rail item gaps |
| 24px | Newer card padding; larger form gaps; upload padding |
| 30px | Page vertical padding; canonical button horizontal padding |
| 32px | Larger grids; BRSR card padding/gaps |
| 40px | Desktop popup padding; report section spacing |
| 48px | Report margins; large empty-state spacing |
| 60px | Narrow rail width and larger local spacing |
| 64px | Large emphasis/empty-state graphics |

Retain these additional values where their components require them: **6px** label gap, **10px** icon gap/date padding, **14px** field vertical padding, **15px** button vertical padding, **25px** header navigation gap, and **50px** header actions.

| Composition | Established spacing |
|---|---|
| Page | 16px horizontal gutters; typically 30px vertical padding |
| Canonical card | Header 16→20px; body 16→24px vertical and 20→30px horizontal |
| Newer card | 24px |
| Forms | Label/control gap 6px; grouped fields stack then use local columns; no single universal field-row gap |
| Toolbars / grids | Compact 8px gaps; dashboard grids commonly 16px; reports catalog 24px; BRSR 32px |
| Default modal | 20px padding → 40px at `sm`; 20px child gaps |

**Tailwind interpretation warning:** `--spacing-15/25/30/50/60` equal **15/25/30/50/60px**, not multiples of 4px.
This affects padding, gaps, width, and height: `px-30 = 30px`, `gap-25 = 25px`, `h-50 = 50px`, and `w-60 = 60px`.

## 6. Border & Radius System

| Border role | Thickness / color |
|---|---|
| Canonical input, textarea, select, secondary button, card | 2px solid `#F5F6F7` |
| Header / footer divider | 2px solid `#EDEFF2` |
| Alternative controls/cards | Usually 1px solid `#DADEE6` |
| AG Grid root | 2px solid `#F5F6F7` |
| Table row divider | Usually 1px in newer/report tables |
| Upload region | 2px dashed |
| Focused canonical dropdown | 3px blue border; other fields use blue border/ring |
| Dark surface border | White at 10% alpha; hover often 15% |

| Radius family | Value | Use |
|---|---|---|
| Small control / icon tile | 4–6px | Checkbox 4px; small newer button/tooltip 5px; KPI tile 6px |
| Upload / compact surface | 8px | FileUpload, autocomplete, report tables |
| Standard application card | 10px | Canonical Card; AG Grid root |
| Menus / selected compact controls | 12px | Dropdown menu; compact date control |
| Alternative card / dialog | 15px | New UI Card / Dialog |
| Modal / feature card | 16px | DefaultPopup, scope/Materiality cards |
| Established fields / large cards | 24px | Main fields, BRSR cards, AI panel |
| Pill / circle | Full / 9999px | Main buttons, avatars, badges, rail circles |

ESG summary's 18px cards and 22px hero are feature-specific.
These families are documentation groupings. Undefined radius classes and the unresolved shared KPI radius are listed in section 26.

## 7. Shadow / Elevation

These levels are **documentation groupings**, not formal elevation tokens. Ordinary application hierarchy relies mainly on borders.

| Level | Representative exact CSS shadow | Use |
|---|---|---|
| 0 — flat | `none` | Page, header, rails, canonical Card |
| 1 — subtle | `0px 2px 5px 0px rgba(38,51,77,0.03)` | Existing `shadow-100`; secondary buttons, fields |
| 1 — KPI | `0px 2px 4px 0px rgba(0,0,0,0.06)` | Shared KPI card |
| 2 — raised | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Representative `shadow-md` |
| 3 — menu | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Dropdown `shadow-lg` |
| 3 — header menu | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` | Header dropdown `shadow-xl` |
| 4 — modal | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | DefaultPopup `shadow-2xl` |
| 4 — assistant | `0 12px 40px rgba(0,0,0,0.12)` | Feature-specific floating AI panel |

Dark-theme and print rules often remove shadows. Summary/report shadows are local treatments, not global elevation defaults.

## 8. Application Shell

| Element | Canonical geometry / behavior |
|---|---|
| Header | Sticky at top 0; z-index 40; approximately 68px height budget |
| Header sizing | 50px controls + 8px top/bottom padding + 2px bottom border |
| Content container | Full width with 16px gutters; capped at 1440px from the 1440px threshold |
| Main page spacing | Typically 30px vertical padding |
| Header controls | 50px circles; pale 2px borders and subtle shadows |
| GHG / Data Management rail | 60px below `sm`; 100px from `sm` |
| ESG assessment rail | 70px below `sm`; 100px from `sm` |
| Rail positioning | Sticky below the header; viewport-height workspace minus 68px; internal overflow where required |
| Rail surface | Pale blue-gray; Data Management uses white |
| Footer | White bordered surface; stacked on mobile, horizontal at `md` |
| Footer presence | Omitted in several assessment, summary, and reporting workspaces |
| Print | Header, footer, and assistant chrome removed |

Contextual question/category panels can sit beside the rail; there is no universal expanded/collapsed sidebar contract.
The footer's layout height budgets are not a universal fixed-height requirement.

## 9. Navigation

| Pattern | Appearance and states | Responsive behavior |
|---|---|---|
| Header links | 13px bold; blue-gray default; blue hover/active text; 25px gaps | Hidden below `md`, visible from 768px |
| Header dropdown | Minimum 200px; 12px radius; border; `shadow-xl`; rows 16px horizontal / 10px vertical, 14px semibold | Nested mobile navigation uses the mobile panel |
| Mobile navigation | Fixed left panel, full height, maximum 280px; black 30% backdrop | Hamburger below `md`; 300ms slide; body scroll locked |
| Assessment rail | Circular items; pale/white default, tinted hover, colored active border/text | 60/70px rail expands to 100px at `sm` |
| Data Management rail | Green active treatment, scale 1.1 and shadow; hover scale 1.05 | Vertical overflow and edge fades |
| Breadcrumbs | Wrapping 12px bold text; 20px chevrons; current item blue | Gaps increase at `sm` |
| Category chips | Full radius; 16px horizontal / 8px vertical padding; 14px bold | Horizontal scroll and arrow controls |
| BRSR tabs | 14px labels, 20px icons, 2px blue active underline | Horizontal overflow |

The shared pill-shaped `Tabs` module had no established active importer; it is a historical style, not the default tab reference.
**Access states:** enabled items behave normally; locked items remain visible with a lock and muted treatment and may explain the restriction when activated; hidden items are removed.
Do not equate a visible locked item with an ordinary disabled control.

## 10. Button System

### Canonical: established pill Button

| Property | Contract |
|---|---|
| Geometry | Full-width default; 30px horizontal / 15px vertical padding; full pill radius |
| Typography / icon | 12px bold, 16px line height; 10px icon gap |
| Height | Approximately 46px primary/delete; 50px secondary with 2px borders; content-driven |
| Primary | `#4186F3` background; white label |
| Secondary | White background; `#4D5E80` label; 2px `#F5F6F7` border; `shadow-100` |
| Danger | Delete variant: `#FF0000` background; white label |
| Hover / pressed / focus | No comprehensive shared treatment established in this component |
| Disabled | Commonly 70% opacity |
| Loading | 16px spinner; native button disabled while loading |
| Icon placement | Native button: after label; link: before label |

No distinct shared outline or ghost variant exists in this family.
The **canonical shell icon control** is a separate 50px circular treatment with 2px pale border and subtle shadow, not a pill Button size variant.

### Alternative: newer UI Button

| Variant | Default | Hover |
|---|---|---|
| Primary / default | Blue `#4186F3` background/border, white text | `#6EA3F5` |
| Outline | White background; blue border/text | Blue background, white text |
| Secondary | `#F5F6F7` background; `#4D5E80` text; `#DADEE6` border | `#EDEFF2` background |
| Ghost | Transparent, muted text | Pale background, stronger text |
| Link | Blue text | Underline |

| Size | Height | Horizontal padding | Radius | Text |
|---|---|---|---|---|
| Small | 32px | 12px | 5px | 12px / 600 |
| Default | 40px | 16px | 10px | 12px / 600 |
| Large | 44px | 24px | 10px | 14px / 600 |
| Icon | 40 × 40px | — | 10px | Icon content |

Alternative states: 8px content gap; 2px focus-visible blue ring at 50% with 2px offset; disabled 50% opacity; general transition; no shared loading or danger variant.
This family is active primarily in the reports catalog. Keep its geometry distinct from the pill family.

## 11. Form System

### Canonical established controls

Inputs, textareas, and dropdowns share white surfaces, 2px `#F5F6F7` borders, 24px corners, and compact bold text.
Labels are 12px/700; standard field text is `#7D8FB3`; helpers/placeholders commonly use `#ADB8CC`.

| Control | Geometry / padding | Typography and identifying treatment |
|---|---|---|
| Input | About 48px; 14px vertical, 16→24px horizontal; 24px radius | 12px bold; `shadow-100`; password adds trailing 20px visibility icon |
| Textarea | Height from rows; 15px vertical, 16→24px horizontal; 24px radius | Established field label/helper treatment |
| Select | About 48px; 14px vertical; 24px left / 48px right; 24px radius | 12px bold; trailing chevron |
| Search | Default width 250px; about 40px high; 10px vertical padding; 24px radius; 2px border | Leading 20px search icon; trailing clear action when populated |
| Checkbox | 16px square; 2px border; 4px radius | Blue checked state; 12px bold label |
| Radio | 16px circle; 10px label gap | Blue checked/focus treatment |
| Date picker | Pill wrapper; 2px border; 10px vertical / 24px horizontal padding | Blue selected day; today border/background; no clear icon; 38px minimum loading placeholder |
| File upload | 2px dashed border; 8px radius; 24px padding; content-driven height | 32px upload icon; 14px copy; blue drag-over/selected treatment; filename and remove action |
| Company image upload | 12px upload-region radius; 20px padding | 56px contained thumbnail with 8px radius; replace/remove and preview |

### Shared field states

- **Focus:** blue border/ring on established text controls; focused dropdown uses 3px blue border.
- **Error:** 12px red message beneath the field; red border is not universal.
- **Disabled:** established Input/Dropdown commonly use 60% opacity.
- **Required:** red asterisk; label region minimum 28px, helper region minimum 38px; label/control gap 6px.
- **Filled / read-only / success:** no consistently distinct visual treatment was established.
- Search, checkbox, radio, date, and upload controls do not have one uniform audited focus/error/disabled contract.

Select menus use a 12px radius, 2px border, `shadow-lg`, 4px placement gap, and typically 260px maximum height.
Searchable/multi-select versions add search, checkbox rows, optional Apply, and a no-results message.
PortalDropdown aligns to trigger width and allows about 340px menu height.

### Alternative and feature-specific controls

| Control | Distinct appearance | Classification |
|---|---|---|
| New UI Input | 36px high; 1px `#DADEE6`; 10px radius; 12px horizontal / 6px vertical padding; 12px normal `#26334D`; placeholder `#6B7A99`; `shadow-2xs` | Alternative; availability does not establish dominant active use |
| New UI Input states | 1px blue focus ring at 30%; disabled 50% opacity | Alternative |
| New UI Select | 36px trigger; 1px border; 10px radius; 12px text; check-mark options | Alternative |
| Compact summary date | 38px wrapper; 12px radius; 1px border; 12px semibold | Feature-specific |
| Materiality switch | 36 × 20px track; 16px white thumb; blue checked track; 200ms motion | Feature-specific; no shared Switch module |
| Airport autocomplete | 1px bordered rounded rectangle; 14px text; location icon; red error border; suggestion menu up to 320px | Feature-specific travel control |

## 12. Card System

**Canonical application card: the established `Card.Head` / `Card.Body` family.**

| Family | Surface / border | Radius | Padding | Shadow / hover |
|---|---|---|---|---|
| Canonical Card | White; 2px `#F5F6F7` | 10px | Header 16→20px; body vertical 16→24px, horizontal 20→30px | No base shadow; no universal hover |
| Shared KPI | White; 1px `#E5E7EB` | Unresolved `--radius-card` | 20px | `0 2px 4px rgba(0,0,0,0.06)` |
| Scope KPI | White; 1px blue-gray | 16px | 20px | Subtle shadow; hover border |
| Dashboard / chart | White or pale | Usually 10–16px | Local 16–24px | Header, visualization, legend/detail; local elevation |
| New UI Card | White; 1px `#DADEE6` | 15px | 24px | `shadow-100`; 200ms transition; Alternative |
| Report catalog | White; 1px border | 15px | 24px | Hover border/shadow; equal-height flex; Alternative |
| Materiality KPI | White; border and colored 4px top edge | 16px | 20px | Metric-led; Feature-specific |
| BRSR action card | White; gray border | 24px | 32px | Hover tint, icon scale, stronger shadow; Feature-specific |
| Report metric / KPI | White or report tint | Local compact radius | Report-specific | Very subtle shadow; Report-only |

Shared KPI anatomy: minimum 150px height; 32px colored icon tile with 6px radius and 20px white icon; 14px label; 28px bold value; 14px unit; 12px trend.
The shared KPI's radius and light text variables are unresolved in the audit; do not silently substitute another card's geometry.
Report catalog cards have a minimum 220px height, 16px bold title, 12px description, and divided action footer; actions are explicit controls.
ESG summary retains separate 18px cards, 22px gradient hero, and a dark `#273452` CTA; these do not redefine the standard card.

## 13. Table / Data Grid System

### Canonical standard table and active data grid

| Property | Standard HTML table | AG Grid / data-heavy table |
|---|---|---|
| Header | 14px/500, `#4D5E80` | 48px high; pale `#F7F8FA`; `#4D5E80` text |
| Body | 14px, `#7D8FB3` | 14px Helvetica Neue; `#7D8FB3` text; white rows |
| Row height | Content-driven; about 36px mobile / 52px from `sm` for a simple 20px line | 48px default |
| Cell padding | Horizontal 8→12px; vertical 8→16px at `sm` | 12px horizontal |
| Border | Local table treatment; not one universal row border contract | Root 2px `#F5F6F7`, 10px radius |
| Hover | Local; no universal HTML-table hover | `#F7F8FA` |
| Selected | Local | `#F2F3F5` |
| Empty / loading | Local empty copy or loading content | Grid loading/overlay and local empty state |
| Mobile | Horizontal overflow; cells commonly nowrap | Horizontal scrolling; no universal row-to-card conversion |

Use compact trailing edit/delete/history/download actions. Pagination stacks on narrow screens and becomes a row at `sm`.
Materiality import grids retain local differences, including approximately 40px headers and 48px rows.

### Secondary table families

| Family | Defining treatment |
|---|---|
| New UI table — Alternative | 40px header; 11px bold uppercase heading; 12px body; 16px cell padding; pale header/hover; blue-tinted selection; 1px dividers; active dominance not established |
| ESG report table — Report-only | 1px outer border; 8px radius; `#F8FAFC` header; 1.5px `#E2E8F0` header divider; 9px vertical / 12px horizontal header padding; 8.5px vertical / 12px horizontal body padding |
| Report table finishing | Alternating white / `#FAFBFE` rows; tinted totals; muted dash for missing data; wrapping underlined document links; report typography |

## 14. Status / Badge System

There is **no universal status palette or status component** spanning every workflow. The newer UI Badge is a useful **Alternative**, not proof of a global canonical status contract.
Its geometry is full radius, 2px vertical / 10px horizontal padding, 10px/600 uppercase text, wider tracking, and 4px content gap.

| State | Audited background | Text | Border / identifying shape |
|---|---|---|---|
| Info | `#4186F3` at 10% | `#4186F3` | Blue at 20%; UI Badge pill |
| Success | `#3EAC5C` at 10% | `#3EAC5C` | Green at 25%; UI Badge pill |
| Warning | `#FFD559` at 15% | `#FF6633` | Yellow at 40%; UI Badge pill |
| Inactive / muted | `#F2F3F5` | `#6B7A99` | `#DADEE6`; muted UI Badge pill |
| Error | No shared application capsule background | Main error text `#FF0000`; local palettes vary | No UI Badge danger variant; workflow-specific |
| Active / enabled | Feature access uses emerald; navigation uses blue or feature color | Context-specific | Active border/text, selected circle, or state pill; no universal HEX set |
| Locked | Feature access uses amber; navigation may simply be muted | Context-specific | Lock icon plus label; not always a capsule |
| Processing | Local workflow treatment | Context-specific | Spinner/progress plus short state label; no universal palette |

Report-only StatusBadge is a smaller 11px/600 pill with a 5px dot, 1.2 line height, and 2.5px vertical / 7–8px horizontal padding.
Its Yes/No/N/A/Info palettes remain report-specific; do not import their meanings into general application status labels.

## 15. Modals, Drawers & Floating UI

### Canonical DefaultPopup

| Property | Contract |
|---|---|
| Panel | Full available width; default maximum 812px; 16px radius |
| Padding | 16px outer viewport gutter; panel 20px → 40px at `sm`; 20px child gap |
| Border / shadow | No single border specified by the audit; `shadow-2xl` |
| Overlay / layer | Black 40%, dark 60%, with blur; z-index 99 |
| Heading / description | 20px bold title; 12px → 14px description |
| Close control | 32px circle with 20px X |
| Dismissal | Outside/Escape dismissal normally available; configured prevention leaves explicit close action |
| Motion | Declared 300ms opening / 200ms closing opacity-scale; conditional mounting can skip the visible exit |

### Other floating families

| Pattern | Geometry / appearance | Classification |
|---|---|---|
| Revision drawer | Right edge, full height, maximum about 576px; scrollable body and context header; other dimensions are local | Active assessment pattern |
| Select dropdown | Trigger-width context; menu max-height typically 260px; 12px radius; 2px border; `shadow-lg`; flips placement | Canonical select family |
| Portal dropdown | Trigger-width alignment; max-height about 340px; higher portal layer | Feature-specific alternative |
| Header dropdown | Minimum 200px, 12px radius, border, `shadow-xl` | Canonical navigation |
| Radix Dialog | Maximum 512px, 24px padding, 15px radius, 1px border | Available Alternative; not dominant modal |
| Radix Sheet | Side panel 75% viewport; `sm` maximum 448px; full height | Available Alternative |
| Radix Popover | 288px width, 16px padding, 10px radius, 1px border | Available Alternative |
| Materiality modal | Common widths 520/700px; near 92vh maximum height; 16px radius | Feature-specific raw overlays |
| TooltipTd | Maximum 480px; 5px radius; 10px horizontal / 6px vertical padding; 12px white text on `#26334D`; `shadow-md` | Main portal tooltip |
| New UI tooltip | 11px text; 10px horizontal / 4px vertical padding; 5px radius; mouse/focus opening | Alternative |

Assistant UI remains feature-specific: desktop floating panel with 24px corners; mobile right panel 320px wide, capped at 90vw, below the 68px header.

## 16. Feedback States

| State | Visual treatment |
|---|---|
| Toast | Bottom-center pill; minimum 40px height; 24px horizontal / 8px vertical padding; 14px medium text; 20px semantic icon; `shadow-lg` |
| Toast semantics | Green/red/blue/yellow-amber tinted backgrounds with white text; dark mode uses a translucent dark surface; no visible progress bar or close button |
| Notification center | 50px circular bell, count/unread indicators; dropdown up to about 420px, viewport-constrained; 2px border, 12px radius, strong shadow |
| Notification row | 14px heading, 12px body, smaller timestamp; read/unread distinction and explicit action pills |
| Route progress | 4px blue bar at the top |
| Inline progress | 5px full-radius track, blue fill, 500ms width transition |
| Inline loading | 16px spinner |
| Route loading | 32/48px spinner or 64px blue/pale circular loader with bouncing dots |
| Blocking loading | Viewport overlay, black 10%, 32px spinner |
| Skeleton | Pulsing neutral blocks matching form/editor regions |
| Empty content | Local icon/illustration, title, muted explanation, relevant CTA; some report empties use a dashed card |
| Error | Bordered error card with explanatory copy and retry/back actions; not-found uses a centered animated illustration |
| Validation | 12px red text under the field; no universal error-border state |
| Access unavailable | Centered card, blue-tinted icon, heading, explanation, and CTA |

No universal banner/alert appearance is established. Brief toast timing and inconsistent state semantics are cautions in section 26.

## 17. Iconography

Heroicons outline is the dominant application library. Lucide appears in KPIs, newer dashboards, and report catalog cards.
Outline icons define navigation and controls; filled shapes serve selected indicators and specialized assets.

| Size | Typical placement |
|---|---|
| 16px | Inline actions, trends, spinners |
| 20px | Standard form/navigation/button icon; KPI icon inside tile |
| 24px | Larger actions and menus |
| 32px | Upload and empty-state graphics; KPI tile dimension |
| 48px | Feature-unavailable emphasis |

Additional local sizes: 12px check marks, 14px locks, and 64px onboarding/BRSR graphics.
Library icons generally inherit `currentColor`; public SVGs can have fixed fills.
Inputs use leading search/location and trailing chevron/password icons; tables use compact trailing action groups; rails center icons in circles.
Keep the canonical Button's 10px gap and the alternative Button's 8px gap distinct.

## 18. Responsive Design

| Breakpoint / range | Actual changes |
|---|---|
| Below `sm` / 640px | Hamburger navigation; 60/70px rails; single-column scope KPIs; wrapping filters; stacked forms, pagination, footer; smaller card/modal padding |
| `sm` / 640px | Rails become 100px; page titles grow 20→24px; popup padding grows 20→40px; scope KPIs become two columns; standard table padding increases |
| `md` / 768px | Desktop header navigation; dashboard charts often two columns; report catalog two columns; footer horizontal; travel origin/destination fields two columns |
| `lg` / 1024px | Scope KPIs four columns; report catalog three columns; BRSR two-column cards; report preview right sidebar appears |
| `xl` / 1280px | Report preview left sidebar grows 256→270px and right sidebar 256→260px; selected large layouts gain spacing |
| Custom / 1440px | Main container capped at 1440px |
| `2xl` / 1536px | Some administration statistics expand to five columns |

Dashboard grids commonly use 16px gaps; report catalog 24px; BRSR 32px.
Forms stack first and gain columns only where their local composition defines them.
Tables remain scrollable; the application does not consistently transform table rows into mobile cards.
Modals retain viewport gutters and full available width beneath their maximum width.
Legacy buttons start full-width; toolbar/footer layouts override width or stack actions.
Fixed report canvases scale within preview space rather than reflowing like application cards.
**Feature-specific exception:** ESG summary uses four columns, three below 1280px, two below 768px, one below 480px.

## 19. Motion

| Purpose | Duration | Effect / easing |
|---|---|---|
| Fast header menu | 100ms open / 75ms close | Opacity and scale 95→100%; no separate shared menu-easing token |
| Standard hover | 150–200ms | Color, border, shadow; default ease-in-out |
| Mobile navigation | 300ms | Horizontal slide |
| DefaultPopup | 300ms open / 200ms close | Opacity/scale; observable exit depends on mounting |
| Progress fill | 500ms | Width transition |
| Materiality switch | 200ms | Thumb translation |
| ESG summary card | 200ms | Lift 2px and shadow; `ease`; Feature-specific |
| Assistant panel | 400ms desktop / 300ms mobile | Scale/opacity/translation; Feature-specific |
| Authentication photography | 1000ms fade | Feature-specific long transition |
| Loading / skeleton | Repeating | Spin, pulse, bounce |

Default easing: `cubic-bezier(0.4, 0, 0.2, 1)`.
Ease-out: `cubic-bezier(0, 0, 0.2, 1)`; ease-in: `cubic-bezier(0.4, 0, 1, 1)`.
There is no universal page-transition system. Unsupported entrance classes and incomplete reduced-motion coverage must not be mistaken for a working motion specification.

## 20. Dark Mode

Dark mode is class-driven, with near-black backgrounds, charcoal surfaces, gray text, muted blue actions, and frequently reduced shadows.

| Role | Exact value |
|---|---|
| Page | `#060708` |
| Header | `#141414` |
| Surface | `#101214` |
| Raised surface | `#16191D` |
| Muted surface | `#1D2024` |
| Border / hover border | `#FFFFFF` at 10% / 15% |
| Strong text | `#DCDEE1` |
| Secondary text | `#B7BEC8` |
| Muted text | `#8993A0` |
| User-root action / lighter action | `#4776B5` / `#789BC9` |
| Global action / lighter action | `#3B76BB` / `#6A8CBA` |
| Success | Text `#6EE7A0`; background `rgba(16,185,129,0.10)` |
| Warning | Text `#FCD34D`; background `rgba(245,158,11,0.10)` |
| Error | Text `#FCA5A5`; background `rgba(220,38,38,0.10)` |
| Modal overlay | `#000000` at 60%, with blur |

Use the user-root action values for that scoped application subtree; global dark values do not override all descendants uniformly.
The user-root `blue-400` / `light-blue` values are `#6F94C5` / `#5F87BD`; global equivalents are `#608EC9` / `#4F79AB`.
Dark secondary buttons are explicit: default background/border/text `#38414B` / `#66717D` / `#F1F5F9`; hover `#46515D` / `#7B8794` / white; disabled `#30363D` / `#4B5561` / `#AEB7C2`.
Local chart and workflow overrides coexist; these mappings are the common reference, not a guarantee that every component shares identical dark tokens.

## 21. Authentication Design

**Feature-specific:** photography-led authentication is distinct from the working application shell.

| Element | Audited treatment |
|---|---|
| Background | Large, centered, cover photography; rotating login imagery |
| Overlay | Approximately 40–50% black |
| Panel | Glass-like composition over photography; audit does not establish one reusable exact panel geometry |
| Main heading | 32px, 700, line height 1.2 |
| Secondary heading | 28px |
| Font | Application Helvetica stack |
| Form | Shared established pill Input/Button and small red FormError |
| Identity | White Growlity logo on dark/photo surfaces |
| Motion | 1000ms image fade; retain as authentication-specific behavior |

The photographic treatment and larger headings do not redefine application cards or page typography.
Older login/set-password illustrations are available legacy assets, not the primary current visual reference.

## 22. Report / PDF Design Families

**Report-only:** preserve each family as a separate composition; shared branding does not imply shared page geometry.

| Family | Font / geometry | Visual identity |
|---|---|---|
| ESG Data Management report | Inter with system fallbacks; 1920 × 1080px landscape; 48px internal margins | Editorial headers, large metrics, dense bordered tables; blue-gray neutrals; environmental green, social blue, governance purple |
| Materiality report | Inter with system fallbacks; 794 × 1123px portrait; 44px/24px inner spacing; 56px header / 46px footer | Compact editorial hierarchy, navy covers, portrait photography, blue `#1679F0`, green `#00AA50`, slate neutrals |
| ESG Score PDF | Arial, Helvetica, sans-serif; 210 × 297mm A4; 10mm frame margin | 3px black page frame; body 11pt/1.7; H2 16pt; H3 10.5pt; footer 8.5pt; print padding 12mm 12mm 18mm |
| React PDF content | Helvetica | Renderer-specific document treatment; not application typography |

### ESG report essentials

| Role | Specification |
|---|---|
| Heading hierarchy | H1 28px/800/1.2; H2 22px/800/1.25; H3 16px/700/1.3 |
| Body / table cell | 13.5px/500; body line height 1.55, cell 1.45 |
| Small / caption | 12.5px/500/1.45; 11px/600/1.3 |
| Pillar surfaces | Environment `#F0FDF4`; Social `#EFF6FF`; Governance `#F5F3FF`; some use 8% tints |
| Tables | Compact 8px corners, thin borders, alternating white/`#FAFBFE`, tinted totals |

Embedded Inter faces are 400/600/700; requested 500/800/900 can be synthesized. Preserve that distinction when reproducing the reported appearance.
Materiality uses `#0F172A` strong text, `#475569` secondary, `#64748B` muted, `#E2E8F0` borders, and `#F8FAFC` surfaces.
Report preview is a workspace: left sidebar 256→270px at `xl`; right sidebar hidden below `lg`, then 256→260px at `xl`; flexible center and internal scrolling below the 68px header.
Generic print rules and fixed report canvases differ; ESG landscape output overrides generic print zoom rather than adopting it.

## 23. Core Component Inventory

The following 38 components identify the important active visual building blocks. Paths are copied or resolved from the audit's component inventory; they were not re-inspected.

| Component | Purpose | Visual family | Source path |
|---|---|---|---|
| Header | Sticky product shell | Canonical | [Header/index.tsx](D:/esgtech-main-dev/src/components/Header/index.tsx) |
| Navigation | Top-level navigation | Canonical | [Navigation.tsx](D:/esgtech-main-dev/src/components/Header/Navigation.tsx) |
| NavigationLink | Link/access states | Canonical | [NavigationLink.tsx](D:/esgtech-main-dev/src/components/Header/NavigationLink.tsx) |
| NavigationDropdown | Nested navigation | Canonical | [NavigationDropdown.tsx](D:/esgtech-main-dev/src/components/Header/NavigationDropdown.tsx) |
| MobileMenu | Sliding mobile navigation | Canonical | [MobileMenu.tsx](D:/esgtech-main-dev/src/components/Header/MobileMenu.tsx) |
| Footer | Legal/social shell footer | Canonical | [Footer.tsx](D:/esgtech-main-dev/src/components/Footer.tsx) |
| PageTitle | Responsive page heading | Canonical | [PageTitle.tsx](D:/esgtech-main-dev/src/components/PageTitle.tsx) |
| Breadcrumbs | Context hierarchy | Canonical | [Breadcrumbs.tsx](D:/esgtech-main-dev/src/components/Breadcrumbs.tsx) |
| Button | Pill primary/secondary/delete | Canonical; older active | [Button.tsx](D:/esgtech-main-dev/src/components/Button.tsx) |
| Input | Pill text/password/number field | Canonical; older active | [Input.tsx](D:/esgtech-main-dev/src/components/Input.tsx) |
| Textarea | Rounded multiline field | Canonical; older active | [Textarea.tsx](D:/esgtech-main-dev/src/components/Textarea.tsx) |
| Dropdown | Select/search/multi-select | Canonical | [Dropdown.tsx](D:/esgtech-main-dev/src/components/Dropdown.tsx) |
| PortalDropdown | Portal selection menu | Feature-specific alternative | [PortalDropdown.tsx](D:/esgtech-main-dev/src/components/PortalDropdown.tsx) |
| SearchInput | Search/clear field | Canonical | [SearchInput.tsx](D:/esgtech-main-dev/src/components/SearchInput.tsx) |
| Checkbox | Small labeled checkbox | Canonical; older active | [Checkbox.tsx](D:/esgtech-main-dev/src/components/Checkbox.tsx) |
| Radio | Labeled radio control | Canonical | [Radio.tsx](D:/esgtech-main-dev/src/components/Radio.tsx) |
| DatePickerCalender | Date/filter field | Canonical | [DatePickerCalender.tsx](D:/esgtech-main-dev/src/components/DatePickerCalender.tsx) |
| FileUpload | Bordered upload region | Canonical | [FileUpload.tsx](D:/esgtech-main-dev/src/components/FileUpload.tsx) |
| CompanyImageUpload | Logo upload/preview | Canonical administration | [CompanyImageUpload.tsx](D:/esgtech-main-dev/src/components/CompanyImageUpload.tsx) |
| FormError | Inline validation copy | Canonical | [FormError.tsx](D:/esgtech-main-dev/src/components/FormError.tsx) |
| Card | Standard bordered container | Canonical; older active | [card/index.tsx](D:/esgtech-main-dev/src/components/card/index.tsx) |
| KPICard | Icon/value/unit/trend | Dashboard; unresolved tokens | [KPICard.tsx](D:/esgtech-main-dev/src/components/KPICard.tsx) |
| DashboardFilterHeader | Heading and reporting filters | Dashboard | [DashboardFilterHeader.tsx](D:/esgtech-main-dev/src/components/dashboard/DashboardFilterHeader.tsx) |
| ProgressBar | Compact completion bar | Canonical | [ProgressBar.tsx](D:/esgtech-main-dev/src/components/ProgressBar.tsx) |
| Pagination | Data navigation | Canonical | [Pagination.tsx](D:/esgtech-main-dev/src/components/Pagination.tsx) |
| TooltipTd | Portal information tooltip | Canonical | [Tooltip.tsx](D:/esgtech-main-dev/src/components/Tooltip.tsx) |
| DefaultPopup | Main centered modal | Canonical | [popup/index.tsx](D:/esgtech-main-dev/src/components/popup/index.tsx) |
| NotificationBell | Bell/feed trigger | Canonical | [NotificationBell.tsx](D:/esgtech-main-dev/src/components/notifications/NotificationBell.tsx) |
| NotificationList | Read/unread/action rows | Canonical | [NotificationList.tsx](D:/esgtech-main-dev/src/components/notifications/NotificationList.tsx) |
| SpinnerLoader | Blocking loading overlay | Canonical | [SpinnerLoader.tsx](D:/esgtech-main-dev/src/components/SpinnerLoader.tsx) |
| FeatureThemeToggle | Theme control | Canonical shell | [FeatureThemeToggle.tsx](D:/esgtech-main-dev/src/components/theme/FeatureThemeToggle.tsx) |
| SideNav | GHG assessment rail | Feature-specific shell | [SideNav.tsx](D:/esgtech-main-dev/src/app/(user)/sites/[siteId]/assessment/SideNav.tsx) |
| AssessmentEntriesGridV2 | GHG existing-entry grid | Canonical assessment | [AssessmentEntriesGridV2.tsx](D:/esgtech-main-dev/src/app/(user)/sites/[siteId]/assessment/_form/components/AssessmentEntriesGridV2.tsx) |
| EsgDataGrid | ESG existing-entry grid | Canonical assessment | [EsgDataGrid.tsx](D:/esgtech-main-dev/src/app/(user)/ESG_Data_Management/Esg_data_Assesmnent_form/components/EsgDataGrid.tsx) |
| RowRevisionHistoryDrawer | Right-side change history | Assessment pattern | [RowRevisionHistoryDrawer.tsx](D:/esgtech-main-dev/src/app/(user)/sites/[siteId]/assessment/_form/components/RowRevisionHistoryDrawer.tsx) |
| UI Button | Smaller rectangular controls | Alternative; reports catalog | [ui/button.tsx](D:/esgtech-main-dev/src/components/ui/button.tsx) |
| UI Card | Structured 1px-border card | Alternative; reports catalog | [ui/card.tsx](D:/esgtech-main-dev/src/components/ui/card.tsx) |
| ClientReportCard | Report availability/action card | Alternative; reports catalog | [ClientReportCard.tsx](D:/esgtech-main-dev/src/app/(user)/reports/ClientReportCard.tsx) |

## 24. Repeated UI Patterns

These are reusable **documentation patterns**; the source does not abstract every composition into one component.

| Pattern | Visual / interaction structure |
|---|---|
| Page toolbar | Heading left, selectors/actions right; wrap or stack on narrow screens |
| Dashboard hierarchy | Filter header → metric grid → chart cards → detail tables |
| Filter cluster | Site + reporting period + pillar/category; compact selectors with optional Apply |
| Assessment frame | Narrow rail + contextual question/menu panel + form + existing-data grid |
| Form and existing data | Bordered form card above entry table; explicit save and row actions |
| Metric grid | Icon/label → large value → unit/trend; responsive 1/2/4-column scope layout |
| Chart card | Heading and optional action, visualization, legend or compact detail table |
| Revision drawer | Right-side context header, chronological history, changed fields, loading/empty/retry states |
| Bulk import | Template action → upload region → editable validation grid → save action |
| Empty-state card | Centered icon/illustration, title, explanation, contextual CTA |
| Access restriction | Muted label with lock/explanation, or centered unavailable card; hidden controls omitted |
| Confirmation dialog | Standard popup, concise explanation, cancel and destructive/submit controls |
| Reporting-period control | Date picker or year/month / CY-FY grouping near the heading |

## 25. Important Assets

Use the established identity assets and preserve their aspect ratios. Main header logo treatment is approximately 50px high with automatic width; compact/full variants respond to available space.

| Asset / group | Purpose | Path |
|---|---|---|
| Horizontal Growlity logo | Main header identity | [Growlity - Logo.svg](<D:/esgtech-main-dev/public/svg/Growlity - Logo.svg>) |
| Compact G icon | Compact identity/favicon | [G-Icon.svg](D:/esgtech-main-dev/public/svg/G-Icon.svg) |
| White Growlity logo | Dark/photo authentication surfaces | [Growlity - Logo white.svg](<D:/esgtech-main-dev/public/svg/Growlity - Logo white.svg>) |
| Authentication photography | Centered cover imagery; `bgImage1.png`, `bgImage3.png`, `bgImage4.png`, `bgImage5.png` | [public/images](D:/esgtech-main-dev/public/images) |
| Report cover photography | Earth, ESG puzzle, governance gavel, team unity, wind turbines | [images/cover](D:/esgtech-main-dev/public/images/cover) |
| Materiality report imagery | `assessment-cover-bg.png`, `report-cover-bg.png`, `report-skyline.png`, `growlity-logo.webp` | [images/materiality-report](D:/esgtech-main-dev/public/images/materiality-report) |
| Framework identities | BRSR, CBAM, CDP, CSRD, EcoVadis, GRI, IFRS, SASB, TCFD | [images/frameworks](D:/esgtech-main-dev/public/images/frameworks) |
| SDG badges | Contained square SDG graphics | [public/SDG](D:/esgtech-main-dev/public/SDG) |
| Report category imagery | Sustainability/social/governance topical illustrations | [images/report](D:/esgtech-main-dev/public/images/report) |
| Error / coming-soon | Centered status illustrations; `error.gif`, `coming-soon.gif` | [public/images](D:/esgtech-main-dev/public/images) |

Company logos use contain rather than cover; report/auth photographs use cover where their composition requires it.
Logo artwork is not an exact color-token sample: main logo green is `#3DAC5A`, while UI green is `#3EAC5C`; the G icon uses `#1679F0` blue.

## 26. Design Inconsistencies / Warnings

| Issue | Reproduction rule |
|---|---|
| Misleading `primary` token | It means white; use `blue = #4186F3` for main actions |
| Multiple control/card families | Preserve pill/2px and rectangular/1px treatments separately; newer does not automatically mean canonical |
| Pixel-named spacing | Interpret 15/25/30/50/60 as exact pixels wherever the override applies |
| Undefined corner utilities | `rounded-4/8/16/20` did not generate CSS; do not read them as pixel values |
| Unresolved KPI variables | `--radius-card` is undefined; light `--foreground` / `--muted-foreground` were not found; intended styling is not confirmed |
| Undefined colors | `text-Secondary`, `gray-blue-20/40`, and generic `background` references do not establish valid palette values |
| Conflicting utilities | Class concatenation does not resolve Tailwind conflicts; textual class order is not a reliable visual override |
| Mixed fonts / neutral palettes | Helvetica, Roboto, Inter, Arial and blue-gray/slate/gray coexist; keep scoped families distinct |
| Report font weights | Only Inter 400/600/700 faces were embedded; additional weights may be synthesized |
| Unsupported animation names | `animate-in`, `animate-fadeIn`, and fade/zoom/slide entrance classes were not backed by discovered CSS; spin/pulse/transitions are supported |
| Inconsistent status/focus/error behavior | Do not invent a universal status palette, focused state, or red error border from one local example |
| Inactive historical modules | No active importer is evidence to avoid using a module as the default, not proof that it can never execute |
| Accessibility gaps | Preserve visual identity without copying removed tab stops, suppressed focus, unlabeled actions, or unassociated field errors |
| Low-contrast small text | Blue/white is 3.54:1; `#7D8FB3`/white 3.25:1; `#ADB8CC`/white 2.00:1; audit values are not an accessibility certification |
| Brief toast / motion coverage | Audit records 800ms default toast dismissal and incomplete reduced-motion handling; these are cautions, not recommended UX rules |
| Authentication file extensions | Four `bgImage*.png` files contain JPEG data |
| Print families | Fixed landscape, portrait, and A4 layouts use different geometry and print rules |

## 27. Do / Don't Guide

### Do

- Use the established main application family as the default reference.
- Keep main blue `#4186F3`, blue-gray neutrals, white bordered cards, and compact Helvetica text.
- Preserve 2px borders, pill controls, 10px standard cards, and the source's meaningful pixel spacing.
- Keep dashboard metrics prominent and pair structured forms with compact data tables.
- Retain the sticky header, responsive rails, wrapping filters, and horizontal table scrolling.
- Use local semantic colors consistently within each audited workflow.
- Keep authentication, feature variants, report pages, and dark-theme scopes explicit.
- Treat normalized role names and elevation levels as documentation, not existing project APIs.

### Don't

- Promote the newer rectangular family to the global default based only on its age or directory name.
- Mix pill buttons, 36px newer inputs, and report cards into an invented uniform family.
- Move report Inter typography, pillar palettes, or fixed-page geometry into ordinary application screens.
- Treat every local color, gradient, or Materiality card as a general token.
- Assume missing utilities, unresolved CSS variables, or declared animation names produce the intended appearance.
- Copy unused historical components or accessibility gaps as authoritative design rules.
- Assume every route represents a different design system or every status shares one palette.

## 28. Final Design System Cheat Sheet

**Visual identity:** compact enterprise dashboards and assessments with bright blue actions, white bordered cards, pale blue-gray neutrals, Helvetica text, and rounded pill controls.

| Area | Essential reference |
|---|---|
| Design priority | **Established main application is Canonical**; older active shared controls define the default; report-catalog rectangular controls are Alternative |
| Primary colors | Action `#4186F3`; lighter blue `#6EA3F5` where defined; white `#FFFFFF`; subtle `#F7F8FA`; soft border `#F5F6F7`; divider `#EDEFF2`; strong text `#26334D`; secondary `#4D5E80`; success `#3EAC5C`; danger `#FF0000` |
| Typography | Helvetica / Helvetica Neue / Arial; page title 20→24px bold; section 18–20px bold; body 14–16px; dense labels/buttons 12px bold; navigation 13px bold; metric 28px bold |
| Spacing | Core 4, 8, 12, 16, 20, 24, 30, 32, 40, 48, 60, 64px; preserve 14px field and 15px button vertical padding; spacing names 15/25/30/50/60 are exact pixels |
| Radius | Canonical card 10px; menu 12px; modal 16px; fields 24px; buttons/badges full; newer small controls 5/10px and cards 15px |
| Shadows | Flat canonical cards; subtle `0 2px 5px rgba(38,51,77,0.03)`; menus `shadow-lg` / header `shadow-xl`; modal `0 25px 50px -12px rgb(0 0 0 / 0.25)` |
| Shell | Sticky header ≈68px; maximum container 1440px; 16px gutters; typically 30px page vertical padding; rail 60/70→100px |
| Responsive | `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536px; desktop nav at `md`; scope KPIs 1→2→4; charts 1→2 at `md`; tables scroll |
| Dark | Page `#060708`, surface `#101214`, raised `#16191D`, text `#DCDEE1`, secondary `#B7BEC8`, muted `#8993A0`, border white 10%; user-root blue `#4776B5` |

### Canonical components at a glance

| Component | Default visual contract |
|---|---|
| Button | Full-width pill; 30px horizontal / 15px vertical; 12px bold; blue/white primary; white pale-bordered secondary; red delete |
| Input / select | About 48px; 24px corners; 2px pale border; 12px bold; blue focus; small red error copy |
| Card | White; 2px `#F5F6F7`; 10px corners; responsive header/body padding; flat base |
| Table / grid | Standard 14px data typography; AG Grid 48px rows/headers and 12px horizontal cell padding; pale header/hover; horizontal overflow |
| Modal | DefaultPopup; maximum 812px; 16px corners; 20→40px padding; black blurred 40% overlay; strong shadow |
| Badge / status | Compact local capsules, dots, locks and progress; **no universal canonical badge palette**; newer UI Badge is Alternative |
| Navigation | 13px bold header links with blue active text; mobile left panel up to 280px; context-specific circular assessment rail |

Authentication keeps its photographic/glass-like composition. Reports retain Inter or PDF-specific fonts and their own landscape/portrait/A4 geometry.
When a value is unresolved or a state is not standardized, follow the documented family distinction instead of fabricating a global rule.
