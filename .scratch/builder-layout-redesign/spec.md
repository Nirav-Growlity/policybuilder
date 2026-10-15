# Builder layout redesign — Write / Design / Review modes

Status: ready-for-agent · Branch: `design-change` · Requested 2026-10-12

## Goal

Declutter the policy builder (`/builder`) by regrouping existing features into three modes. **No functional change**: every control, state, autosave/guard behaviour, role difference, and keyboard shortcut keeps working. The only addition is an optional live PDF preview while writing (user-approved).

Keep the approved PolicyCraft tokens (blue brand, Helvetica, light/dark via `next-themes`, 8px controls, 14px panels, 40px builder fields). Fix clutter through layout, spacing and hierarchy, not new colours.

## User decisions

- Flow: Write / Design / Review & export modes **plus** an optional live preview beside the writing steps.
- Sticky footer Back/Next.
- One "Policy" ⋯ menu (policy context, company details, reset) and a manager task chip with a popover.
- Step 1 document metadata collapses to a summary line; the duplicate "Live outline" goes away.
- A slimmer step rail.
- Implement directly (no prototype).

## Layout

```
┌ header ─────────────────────────────────────────────────────────────────────────┐
│ [≡] ← Workspace  Ethics Policy · Org  Saved   [Write|Design|Review & export]  [Task 27%] [⋯] [Preview] [A] │
├ rail ──────┬ content (scrolls) ───────────────────────────┬ preview (optional) ─┤
│ progress   │ h1 Step title                                 │ PdfPolicyPreview     │
│ 1 Structure│ short description                             │ (debounced)          │
│ 2 ...      │ step panels                                   │                      │
│            ├ sticky footer ───────────────────────────────┤                      │
│            │ Step 1 of 8          [Back] [Next: Declaration]│                      │
└────────────┴──────────────────────────────────────────────┴──────────────────────┘
```

### Modes (derived, not persisted to the server)

- Shell-local state `designOpen` (boolean). Mode = `designOpen ? "design" : step === "export" ? "review" : "write"`.
- **Write**: steps other than `export` (custom sections included). Rail + content + optional preview pane.
- **Design**: hides the step rail and content. Shows the existing `DesignInspector` (same four tabs and components; it can become a non-floating left panel, ~360px) beside a large `PdfPolicyPreview` of the current policy. Leaving Design returns to the previous mode/step.
- **Review & export**: `step === "export"`, rendering `StepExport` unchanged (readiness, cover editor, AI cover loader, preview). Download PDF and Download Word stay visible in this mode (header or footer).
- Mode switcher: "Write" → `designOpen=false`; if on `export`, go to the last write step (`prev()` or the remembered step). "Design" → `designOpen=true`. "Review & export" → `designOpen=false; setStep("export")`.
- Ctrl/Cmd+B keeps toggling the design controls, now meaning "toggle Design mode". Ctrl/Cmd+\ and Ctrl/Cmd+[ keep toggling rail collapse. Escape closes drawers and popovers.
- "Edit active cover" (dock-sections.tsx) and AI cover library edit call `requestCoverEdit` + `setStep("export")`. These must leave Design mode and land in Review with the cover editor open, even if `step` was already `export` (watch `coverEditorRequest` in the store).
- While `coverEditing` is true, the mode switcher is hidden or disabled, as the inspector toggles are today.

### Live preview (Write mode)

- "Preview" toggle in the header (aria-pressed, aria-controls). Persist open/closed per browser in localStorage (`policycraft_builder_preview_open`, try/catch), default closed.
- Render `PdfPolicyPreview` directly. **Never** mount `StepExport` for this: it auto-generates an AI cover on mount.
- `PdfPolicyPreview` requests a server render on every policy change. Wrap it with a debounced policy (~800ms after the last edit) in a new wrapper component. Don't modify `components/policy/pdf-policy-preview.tsx`.
- Pass the same `includeAuthorSignature`, `authorSignatureDate` and `signatureUpdatedAt` that `StepExport` passes.
- ≥1200px: right pane, about 40% width (min 380px, max 640px), with its own scroll. <1200px: right drawer using the existing drawer pattern (focus trap, Escape, scrim, 250ms slide, reduced motion).

### Header

- Left: expand-rail button (only when collapsed; only one "Expand sidebar" button in the DOM), "← Workspace" link (same role-based href), policy type label plus org name, save status (role=status, aria-live, same strings).
- Centre: mode switcher (segmented; `aria-current="page"` or `aria-pressed`).
- Right: task chip (managers only, same conditions as today's banner), Policy ⋯ menu, Preview toggle (Write only), `ApplicationSessionMenu` (theme controls stay reachable), "Workflow" drawer button (<1200).
- The step title moves out of the header into the content top as `h1` with the step description beneath it (one line, muted).

### Policy ⋯ menu (accessible menu button: arrow keys, Escape, focus return)

- No context: "Add policy context (.docx)" opens the same hidden file input. With context: shows the filename, "Replace policy context" and "Remove policy context" (same `clearImportedPolicy`). Show a small indicator on the trigger when context is attached.
- "Company details" (only when `draftId || backendDocumentId`) opens the same warning modal, then the editor modal.
- Separator, then "Reset all fields" (same `window.confirm` + `reset()`).
- Drag-and-drop .docx anywhere keeps working.

### Task chip (managers)

- Compact button: status icon + "Task" + percentage (or a loading or error state). It opens a non-modal popover `section[aria-label="Assigned task"]` containing today's banner content unchanged: org, title, policy type, `DeadlineLabel`, `TaskProgress`, `TaskStatus`, "Mark task complete", Retry on error. The completion `Modal` is unchanged.

### Sticky footer (Write and Review)

- At the bottom of the content column, inside the scroll container's parent (not overlapping content).
- Left: "Step n of N". Right: Back (disabled on the first step), primary "Next: {next step label}" (calls `next()`; hidden on the last step). In Review mode, also Download PDF and Download Word (same `usePolicyDownload`, busy states, sr-only status).

### Slim rail (272px expanded / 68px collapsed, unchanged widths)

- Keep the brand link, active-policy meta, progress bar, collapse button, and step buttons (`aria-current="step"`, done checks, layoutId marker).
- Remove per-step descriptions; keep them as `title` tooltips. Tighter rows.
- Remove the footer reset (it moves to the Policy menu).
- Fix the stray horizontal scrollbar (`overflow-x: hidden`).
- Fix: in the narrow drawer with a persisted collapse, always render the expanded content.
- The `export` step stays in the rail list (it is step 8). Clicking it enters Review mode.

### Step 1 (step-structure.tsx)

- "Document Header & Revision Metadata" becomes a summary row: document number, revision and review frequency, plus a warning when no reviewer designation exists (same copy as today). An "Edit details" disclosure (`aria-expanded`) reveals the identical existing form. Expand it by default when the document number is empty.
- Remove the "Live outline" aside. The outline list shows numbering for visible sections only, matching the old TOC (hidden rows show no number or a "Hidden" tag), and takes the full width.

## Preserve (contract)

- IDs: `#builder-workflow`, `#builder-content`, `#design-inspector`, `#inspector-tab-*`.
- Accessible names used by QA: "Collapse sidebar", "Expand sidebar", "Workflow", "Hide workflow", "Close controls", tab names, step-name buttons, "Download PDF", "Mark task complete", "Confirm completion", region "Assigned task", "Close workflow navigation".
- Rename "Design controls"/"Hide controls" to the Design mode button. Then update `scripts/verify-professional-ui.ts`, `scripts/verify-tasks-ui.mjs`, and `D:/Policy PoC/tmp/redesign-p6-20261008/*.mjs` in the same change.
- `ai-cover-workflow.test.tsx` asserts "Document design". Keep that copy.
- Don't touch BuilderClient state/effects (lines 61–640), `lib/store.ts`, autosave, navigation guards, `key={step}`, or the `key` on draft and org.
- Independent scrolling, 1199/1200 breakpoint (JS and CSS together), reduced motion, visible focus rings, and 13px/14px builder type.

## Validation

From `src/`: `npm test`, `npm run test:signatures`, `npm run lint`, `npm run build`. Browser check at 1440 and 1200/1199 in light and dark: each mode, the preview toggle and debounce, cover-edit hand-off from Design, manager task chip, Policy menu actions, and keyboard shortcuts.
