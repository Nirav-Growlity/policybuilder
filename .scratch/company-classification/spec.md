# Company classification

Update PolicyCraft company details to show Sector, Subsector and Industry using
the hierarchy supplied in `D:/esgtech-main-dev/src/data/isic_classification.json`.

- Replace the old selectable sector/subsector catalog in both company-detail and
  standalone organization forms with the canonical ISIC hierarchy.
- Filter subsectors by sector and industries by both parents. Changing a parent
  clears its dependent selections; reselecting the same parent preserves them.
- Retain existing free-text and legacy saved company details. Preserve the saved
  JSON meanings of `industry` (sector) and `subCategory` (subsector); store the new
  third level in optional `industryDetail`.
- Carry the third level through organization profiles, ESG company hydration,
  draft company state, AI generation and cover context wherever the current
  classification flows. Shared ESG master data stays read-only.
- Use the detailed industry or its group for existing focus-area mappings,
  falling back to legacy subsector matching. Existing authored content and saved
  focus catalogs survive company classification edits.
- Keep the current document presentation and organization permissions intact.
  No database migration or browser automation is required for this change.

Validation: hierarchy and catalog regression tests, mapping/profile and AI tests,
existing test suite, TypeScript, affected-file lint, and diff whitespace checks.
