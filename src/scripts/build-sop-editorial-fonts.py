"""Complete the four Word/Typst slots used by the two editorial SOP templates.

Reuses the pinned Google Fonts sources and name/metric normalization from
build-document-fonts.py. Existing regular and bold faces are left untouched.
Run: python scripts/build-sop-editorial-fonts.py
"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("document_fonts", Path(__file__).with_name("build-document-fonts.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

for family, slot, source, weight in [
    ("IBM Plex Sans", "italic", builder.fetch("ibmplexsans", "IBMPlexSans-Italic[wdth,wght].ttf"), 400),
    ("IBM Plex Sans", "bold-italic", builder.fetch("ibmplexsans", "IBMPlexSans-Italic[wdth,wght].ttf"), 600),
    ("Source Serif 4", "bold-italic", builder.fetch("sourceserif4", "SourceSerif4-Italic[opsz,wght].ttf"), 600),
]:
    font, _ = builder.build_face(family, slot, source, weight, False)
    font.flavor = None
    font.save(builder.WORD / f"{builder.slug(family)}-{slot}.ttf")
    print(f"{family}: {slot}")
