# 11 Static 700 and 800 faces for Typst

Status: ready-for-agent
Type: task
Blocked by: 03

Chromium draws `font-weight: 700` (cover title, cover brand line, target table first column) and 800 (section markers, acknowledgement labels) from the variable web fonts in `public/fonts`. Typst can't instance variable fonts and only has the Word TTFs in `public/fonts/word`, whose "bold" is pinned at 600 (`scripts/build-document-fonts.py`). Those texts therefore come out a little lighter in the Typst PDF.

Build static 700 and 800 instances for the families whose web font goes past 600, written somewhere Word export doesn't read (for example `public/fonts/typst/`), and add them to `policyFontFiles`. Options: the existing Python script with fontTools (needs `pip install fonttools brotli`), or `fontkit`, which is already in `node_modules`.

Check: the harness cover pages; brand and title stroke weight should match Chromium side by side.
