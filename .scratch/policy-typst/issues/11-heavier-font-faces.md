# 11 Static weight and optical-size faces for Typst

Status: ready-for-agent
Type: task
Blocked by: 03

Chromium draws `font-weight: 700` (cover title, cover brand line, target table first column) and 800 (section markers, acknowledgement labels) from the variable web fonts in `public/fonts`. Typst can't instance variable fonts and only has the Word TTFs in `public/fonts/word`, whose "bold" is pinned at 600 (`scripts/build-document-fonts.py`). Those texts therefore come out a little lighter in the Typst PDF.

Build static 700 and 800 instances for the families whose web font goes past 600, written somewhere Word export doesn't read (for example `public/fonts/typst/`), and add them to `policyFontFiles`. Options: the existing Python script with fontTools (needs `pip install fonttools brotli`), or `fontkit`, which is already in `node_modules`.

Also optical size (found in ticket 05): Source Serif 4 (opsz 8–60, default 20) and Fraunces (opsz 9–144) are variable in `public/fonts`. Chromium sets opsz to the CSS px size (`font-optical-sizing: auto`), so body text at 11 pt uses opsz ≈ 14.7, which sets wider than the TTF's default 20. Heritage Crest paragraphs wrap one line shorter in Typst because of it (4/10 matching page breaks). Build instances at the optical sizes the templates use: body sizes (12–16 px), subheading 13 pt and heading 17 pt. Give them distinct family names, and have `typstFontFamily` pick the nearest instance per text role.

Check: the harness cover pages (brand and title weight match Chromium side by side) and people-charter-regular page breaks (target 9/10 or better).
