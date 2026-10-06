# Company classification validation

PolicyCraft now uses the supplied ISIC hierarchy: 22 sectors, 87 subsectors and
721 industry group/class entries. Duplicate industry display names appear once
per subsector. A source-integrity comparison against the provided ESGtech JSON
passed. Existing free-text values remain editable.

The legacy JSON properties `industry` and `subCategory` retain their meanings
(sector and subsector). Optional `industryDetail` carries the third level through
company forms, organization profiles, ESG reads, policy state, catalog lookup and
AI/cover context. Existing saved focus selections and authored content survive
classification edits. No migration, direct database change, or browser UI check
was performed.

## Focused checks

From `D:/Policy PoC/src`:

```powershell
node --import tsx --test --test-force-exit --test-reporter=spec lib/company-classification.test.ts lib/focus-area-catalog.test.ts lib/policycraft-mapping.test.ts lib/policycraft-organization-repository.test.ts lib/ai/cover.test.ts lib/ai/mock.test.ts lib/docx/parse.test.ts
```

Result: 46 tests passed. After the review correction to the cover prompt, the
13 tests in `lib/ai/cover.test.ts` passed again.

```powershell
node node_modules/eslint/bin/eslint.js lib/company-classification.ts lib/company-classification.test.ts lib/focus-area-catalog.ts lib/constants.ts lib/initial-policy.ts lib/starter-templates.ts lib/types.ts lib/policycraft-mapping.ts lib/policycraft-mapping.test.ts lib/policycraft-organization-repository.ts lib/policycraft-organization-repository.test.ts lib/policycraft-types.ts lib/ai/cover.ts lib/ai/cover.test.ts lib/ai/mock.ts lib/ai/mock.test.ts app/api/ai/route.ts components/builder/company-info-form.tsx components/builder/company-setup-screen.tsx components/builder/steps/step-focus.tsx components/workspace/standalone-organization-editor.tsx lib/store.ts
git -c core.safecrlf=false diff --check
```

Result: passed. An earlier broader lint run also included `step-setup.tsx` and
reported its existing two `any` errors and 17 unused-variable warnings. The two
`any` expressions are present in the original HEAD.

## Broader checks

The `package.json` test command was executed through the installed Node runtime
with `--test-concurrency=2`: 348 tests, 325 passed, 23 failed. Failures concern
existing cover/header/Word/PDF rendering and revision schedules. The five failed
test files were run on an archived copy of the original HEAD
`4bdb63aadb9a1ab62b6f33f6aca2ee4d0a8a864c`; all 23 failure names also occurred
there (the baseline produced 24 failures). No new failure names were introduced.

```powershell
node node_modules/typescript/bin/tsc --noEmit
```

Result: two diagnostics in the unchanged `lib/policycraft-login-regression.test.ts`
(TS7023 at line 10 and TS2352 at line 16). That file is identical to the original
HEAD. No changed-file TypeScript diagnostic was reported. The `npx` launcher
tried to fetch a missing command shim and failed with `ENOTFOUND`; the local
runtime was used for the completed checks.

Logs and baseline comparison artifacts are under the ignored directory
`D:/Policy PoC/tmp/company-classification/`.

## Standards review

No hard documented-standard breaches. A duplicated parent-selection reset was
consolidated into `withCompanyClassification`, with regression coverage for
clearing descendants, preserving unrelated details and reselecting legacy values.

## Spec review

The review identified that the artwork prompt should explicitly name Industry.
The prompt now names all three levels and prioritizes the most specific supplied
industry; its exported prompt behavior is covered by the cover test. No other
concrete missing requirement or scope creep was found.

Manual acceptance remains: check the three dependent selectors in company
details and the standalone organization editor, including an old saved draft.

Suggested commit: `feat: add ISIC sector subsector and industry classification`.
