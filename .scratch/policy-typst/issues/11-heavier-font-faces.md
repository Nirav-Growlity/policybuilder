# 11 Static weight and optical-size faces for Typst

Status: resolved
Type: task
Blocked by: 03

Chromium draws `font-weight: 700` (cover title, cover brand line, target table first column) and 800 (section markers, acknowledgement labels) from the variable web fonts in `public/fonts`. Typst can't instance variable fonts and only has the Word TTFs in `public/fonts/word`, whose "bold" is pinned at 600 (`scripts/build-document-fonts.py`). Those texts therefore come out a little lighter in the Typst PDF.

Build static 700 and 800 instances for the families whose web font goes past 600, written somewhere Word export doesn't read (for example `public/fonts/typst/`), and add them to `policyFontFiles`. Options: the existing Python script with fontTools (needs `pip install fonttools brotli`), or `fontkit`, which is already in `node_modules`.

Also optical size (found in ticket 05): Source Serif 4 (opsz 8–60, default 20) and Fraunces (opsz 9–144) are variable in `public/fonts`. Chromium sets opsz to the CSS px size (`font-optical-sizing: auto`), so body text at 11 pt uses opsz ≈ 14.7, which sets wider than the TTF's default 20. Heritage Crest paragraphs wrap one line shorter in Typst because of it (4/10 matching page breaks). Build instances at the optical sizes the templates use: body sizes (12–16 px), subheading 13 pt and heading 17 pt. Give them distinct family names, and have `typstFontFamily` pick the nearest instance per text role.

Check: the harness cover pages (brand and title weight match Chromium side by side) and people-charter-regular page breaks (target 9/10 or better).

## Answer

- **Build:** `scripts/build-typst-fonts.py` (fontTools) writes `public/fonts/typst/` and `lib/typst/typst-font-set.ts`. Word export never reads either.
  - It parses the `@font-face` rules in `lib/document-fonts.ts` and resolves every weight the template asks for (400, 500, 600, 700, 800, italic 400/600/700) with the CSS Fonts 4 matching rules. That gives the weight Chromium actually draws, for example Fraunces 800 → 900 and Source Sans 3 800 → 700.
  - A family gets a Typst set when Chromium would draw any of those weights differently from Typst's pick among the Word faces, or when it has an opsz axis. 14 local families qualify. The library families (Arimo, Carlito, Lato…) are static and already match, so they keep their Word faces.
  - Faces drawn alike are shared, with a weight class set so Typst's nearest-weight match lands every request on Chromium's face. For example, Source Sans 3's 400 face is class 450 and also serves 500. Where that would tie, each request gets its own face.
- **Optical sizes:** these are "<family> Opsz <px>" instances, built per weight.
  - Source Serif 4 narrows about 1% per px between 8 and 20 px. Regular gets every half point the body and subheading steppers offer (8–20 pt). Semibold and bold get whole points. Both also get 22/24 pt and 36/48/60 px.
  - Fraunces moves under 0.1% per px below 36 px, so it gets a coarse grid from 12 to 144 px.
  - `face()` in `policy.typ` picks the nearest size built for the text's weight. Italic and other weights use the base family (its default opsz). Only custom cover text layers use italic.
- **Loading:** `policyFontFiles` loads the Typst set in place of the Word faces of those families. 158 files, 7.3 MB. Typst loads faces lazily, so compiler creation (≈110–140 ms) and warm renders didn't change. `next.config.ts` keeps them out of the DOCX route's trace.
- **Also fixed:** quantitative "target bands" padded both halves of a band split across pages. Chromium slices the band, so its vertical padding is now spacing, as elsewhere in the template.
- **Harness:** page openings now include artifact-tagged text. Typst tags a table header it repeats on a new page, so identical breaks inside tables were counted as mismatches. That had lowered several cases since f1b7695.
- **Check:** cover brand and title now draw at 700 (standard-pack side by side). Full harness against HEAD: people-charter-regular 4/10 → 10/10 and acknowledgement-filled 4/10 → 10/10. Every other case is unchanged. people-charter-dense stays 4/12 because of the 3-line orphan/widow rule (ticket 12).
- **Tests:** `lib/typst/policy/model.test.ts` checks that the font set replaces the Word faces it covers and has every listed size. `render.test.ts` checks that people-charter body text draws with `SourceSerif4Opsz14.67` and its cover title with `SourceSerif4Opsz60-Bold`.
