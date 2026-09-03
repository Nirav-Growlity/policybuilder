# Theme and starter-template library rationale

## Decision

PolicyCraft treats a **theme** as presentation and a **starter template** as content and structure. The two catalogs are intentionally separate:

- Themes control cover composition, contents, page grid, section openings, running furniture, data treatment, typography, density, color, and optional image treatment.
- Starters provide generic policy language, section structure, intended audience, and an estimated document depth.
- Applying a starter preserves company information already entered in the builder.
- The company-derived source-policy corpus remains private input to the policy-scoped AI context. It is not a public template catalog.

This distinction follows the public Proposal.biz model: its document-template catalog is browsed by category and uses explicit preview/use actions, while visual theme customization is handled separately.

## Catalog shape

The public theme library contains 24 presets: three structurally distinct presets in each of eight families. Each definition carries its family, intent, tags, image capability, preview recipe, default density, and structural signature so catalog integrity can be tested without relying on color.

The starter library contains 25 generic policies: five depth/audience profiles for each of the five PolicyCraft policy types. Starters use placeholders rather than invented organization-specific dates, performance claims, targets, achievements, or citations.

## Product and privacy boundary

Existing source policies under `data/seed-policies` continue to support active-policy and active-section AI relevance selection. Public `/templates` and `/api/templates` load only the curated starter catalog in `lib/starter-templates.ts`; they do not enumerate the source-policy directory.

## References

- [Proposal.biz template library](https://www.proposal.biz/templates/)
- [Starting with a template](https://support.proposal.biz/articles/starting-with-a-template)
- [Customizing a theme](https://support.proposal.biz/articles/customizing-your-theme)
