# Theme and starter-template library rationale

## Decision

The original visual catalog has been replaced by the sample-based catalog described in `sample-template-audit.md`. The catalog still exposes eight universal choices so existing API and persistence contracts remain stable, but each visual definition now follows a distinct layout pattern observed in the project DOCX corpus.

PolicyCraft treats a **theme** as presentation and a **starter template** as content and structure. The two catalogs are intentionally separate:

- Themes control cover composition, contents, page grid, section openings, running furniture, data treatment, typography, density, color, and optional image treatment.
- Starters provide generic policy language, section structure, intended audience, and an estimated document depth.
- Applying a starter preserves company information already entered in the builder.
- The company-derived source-policy corpus remains private input to the policy-scoped AI context. It is not a public template catalog.

This distinction follows the public Proposal.biz model: its document-template catalog is browsed by category and uses explicit preview/use actions, while visual theme customization is handled separately.

## Evidence-based catalog shape

The public theme library contains exactly eight canonical visual systems. The source corpus contains 87 policy documents from different organizations; the audit grouped recurring patterns rather than copying any one company identity:

| Pattern observed | Canonical design response |
| --- | --- |
| Controlled covers, revision blocks, confidentiality and approval fields | Controlled Approval Sheet |
| Standard policy packs with predictable contents and readable body pages | Quiet Aptos Policy |
| Numbered governance, audit and evidence structures | Framework Map |
| Decision papers and concise leadership review | Controlled Approval Sheet |
| Site, implementation and operating guidance | Compact Operating Standard |
| Narrative sustainability, SDG and target communication | Image Led Charter |
| People-facing commitments, plain language and acknowledgement | Heritage Crest Policy |
| Dense targets, responsibilities, baselines and evidence tables | Table Register / IMS Operating Tabs |

Each definition carries a structural signature spanning cover, contents, page frame, heading system, body grid, data treatment, control treatment, running furniture, image behavior, and density. The catalog test checks these signatures independently of color.

The starter library contains 25 generic policies: five depth/audience profiles for each of the five PolicyCraft policy types. Starters use placeholders rather than invented organization-specific dates, performance claims, targets, achievements, or citations. Old visual IDs exist only in the migration map for saved policies and are never returned by the public catalog.

## Product and privacy boundary

Existing source policies under `data/seed-policies` continue to support active-policy and active-section AI relevance selection. Public `/templates` and `/api/templates` load only the curated starter catalog in `lib/starter-templates.ts`; they do not enumerate the source-policy directory.

## References

- [Proposal.biz template library](https://www.proposal.biz/templates/)
- [Starting with a template](https://support.proposal.biz/articles/starting-with-a-template)
- [Customizing a theme](https://support.proposal.biz/articles/customizing-your-theme)
