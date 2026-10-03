# Scoped previews and exports
Status: implemented; live private-asset and Word visual acceptance pending
Owner: policycraft-document-output; main agent owns export-route integration
Blocked by: 01 (guards), 02 (validated browser context)

Carry scoped context through cover/AI/library/media requests, DOCX hydration, downloads and previews. Separate preview caches and in-flight requests by actor/org. Preserve same-scope layered PDF loader and scroll state.

Acceptance: inaccessible organization assets never resolve; cross-scope transitions never show previous PDF; signatures always belong to the current actor; authored content/rendering remains intact.

Verification: preview/cache, export-context and hydration tests plus existing rendering tests. Live DB assets/signatures remain pending user setup.

Evidence: scoped preview/cache and DOCX hydration tests pass; real PDF/DOCX generation verifies injected private artwork and the current actor signature. Baseline full-suite rendering expectations still fail. See `docs/admin-manager-access-validation.md` for the precise proof boundary.
