"""Build the document fonts that PDF and DOCX exports share.

Word can only embed four static faces per family (regular, bold, italic,
bold italic), so every face here is pinned to the weight the PDF draws for
the matching CSS request: regular for font-weight 400 and bold for the 600
the document headings and table headers use (700 where a family has no 600,
or where it must keep the metrics of the Office font it stands in for).

Two kinds of family are built:

* LOCAL families already ship variable WOFF2 files in public/fonts for the
  PDF. Only their Word faces are built here.
* LIBRARY families are fetched from the Google Fonts repository at a pinned
  commit. Each face is built once and written twice, as a WOFF2 the PDF
  loads and a TTF Word embeds, so both exports draw identical glyphs. Their
  @font-face rules and Word slots are written to lib/document-font-library.ts.

Run with fontTools and brotli installed:
    python scripts/build-document-fonts.py
"""

import json
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.otlLib.optimize import compact
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public" / "fonts"
WORD = FONTS / "word"
LIBRARY_MODULE = ROOT / "lib" / "document-font-library.ts"
GOOGLE_FONTS_COMMIT = "66928797f271fed5ee428544e7229685e2d90127"
CACHE = Path(tempfile.gettempdir()) / "policycraft-font-sources" / GOOGLE_FONTS_COMMIT

# family -> slot -> (source file in public/fonts, wght to pin for variable sources)
LOCAL = {
    "Source Sans 3": {"regular": ("source-sans-3-400.woff2", 400), "bold": ("source-sans-3-400.woff2", 600), "italic": ("source-sans-3-400i.woff2", None)},
    "Source Serif 4": {"regular": ("source-serif-4-400.woff2", 400), "bold": ("source-serif-4-400.woff2", 600), "italic": ("source-serif-4-400i.woff2", None)},
    "Libre Caslon Text": {"regular": ("libre-caslon-text-400.woff2", None), "bold": ("libre-caslon-text-700.woff2", None), "italic": ("libre-caslon-text-400i.woff2", None)},
    "IBM Plex Sans": {"regular": ("ibm-plex-sans-400.woff2", 400), "bold": ("ibm-plex-sans-400.woff2", 600)},
    "IBM Plex Serif": {"regular": ("ibm-plex-serif-400.woff2", None), "bold": ("ibm-plex-serif-600.woff2", None), "italic": ("ibm-plex-serif-400i.woff2", None)},
    "Inter": {"regular": ("inter-400.woff2", 400), "bold": ("inter-400.woff2", 600)},
    "Atkinson Hyperlegible": {"regular": ("atkinson-hyperlegible-400.woff2", None), "bold": ("atkinson-hyperlegible-700.woff2", None), "italic": ("atkinson-hyperlegible-400i.woff2", None), "bold-italic": ("atkinson-hyperlegible-700i.woff2", None)},
    "Space Grotesk": {"regular": ("space-grotesk-400.woff2", 400), "bold": ("space-grotesk-400.woff2", 600)},
    "Public Sans": {"regular": ("public-sans-400.woff2", 400), "bold": ("public-sans-400.woff2", 600)},
    "Archivo": {"regular": ("archivo-400.woff2", 400), "bold": ("archivo-400.woff2", 600)},
    # Only 600+ upright faces are declared, so the browser draws 400 text at 600.
    "Playfair Display": {"regular": ("playfair-display-600.woff2", 600), "bold": ("playfair-display-600.woff2", 600), "italic": ("playfair-display-600i.woff2", None), "bold-italic": ("playfair-display-600i.woff2", None)},
    "Fraunces": {"regular": ("fraunces-400.woff2", 400), "bold": ("fraunces-400.woff2", 600), "italic": ("fraunces-400i.woff2", 400), "bold-italic": ("fraunces-400i.woff2", 600)},
    # The lightest declared face is 500, which the browser uses for 400 text.
    "Cormorant Garamond": {"regular": ("cormorant-garamond-500.woff2", 500), "bold": ("cormorant-garamond-500.woff2", 600), "italic": ("cormorant-garamond-500i.woff2", None)},
    "Caveat": {"regular": ("caveat-500.woff2", 500), "bold": ("caveat-500.woff2", 600)},
    "IBM Plex Mono": {"regular": ("ibm-plex-mono-400.woff2", None), "bold": ("ibm-plex-mono-600.woff2", None)},
    "JetBrains Mono": {"regular": ("jetbrains-mono-400.woff2", 400), "bold": ("jetbrains-mono-400.woff2", 600)},
}

# family -> (directory under ofl/, slot -> (source file, wght to pin for variable sources))
LIBRARY = {
    # Metric-compatible stand-ins for the Office fonts, so a policy set in
    # Arial, Calibri, Cambria, Times New Roman or Georgia breaks lines in the
    # PDF exactly where Word does. Bold stays 700 to keep those metrics.
    "Arimo": ("arimo", {"regular": ("Arimo[wght].ttf", 400), "bold": ("Arimo[wght].ttf", 700), "italic": ("Arimo-Italic[wght].ttf", 400), "bold-italic": ("Arimo-Italic[wght].ttf", 700)}),
    "Carlito": ("carlito", {"regular": ("Carlito-Regular.ttf", None), "bold": ("Carlito-Bold.ttf", None), "italic": ("Carlito-Italic.ttf", None), "bold-italic": ("Carlito-BoldItalic.ttf", None)}),
    "Caladea": ("caladea", {"regular": ("Caladea-Regular.ttf", None), "bold": ("Caladea-Bold.ttf", None), "italic": ("Caladea-Italic.ttf", None), "bold-italic": ("Caladea-BoldItalic.ttf", None)}),
    "Tinos": ("tinos", {"regular": ("Tinos-Regular.ttf", None), "bold": ("Tinos-Bold.ttf", None), "italic": ("Tinos-Italic.ttf", None), "bold-italic": ("Tinos-BoldItalic.ttf", None)}),
    "Gelasio": ("gelasio", {"regular": ("Gelasio[wght].ttf", 400), "bold": ("Gelasio[wght].ttf", 700), "italic": ("Gelasio-Italic[wght].ttf", 400), "bold-italic": ("Gelasio-Italic[wght].ttf", 700)}),
    # Sans families common in corporate reports and policies.
    "Roboto": ("roboto", {"regular": ("Roboto[wdth,wght].ttf", 400), "bold": ("Roboto[wdth,wght].ttf", 600), "italic": ("Roboto-Italic[wdth,wght].ttf", 400), "bold-italic": ("Roboto-Italic[wdth,wght].ttf", 600)}),
    "Open Sans": ("opensans", {"regular": ("OpenSans[wdth,wght].ttf", 400), "bold": ("OpenSans[wdth,wght].ttf", 600), "italic": ("OpenSans-Italic[wdth,wght].ttf", 400), "bold-italic": ("OpenSans-Italic[wdth,wght].ttf", 600)}),
    "Lato": ("lato", {"regular": ("Lato-Regular.ttf", None), "bold": ("Lato-SemiBold.ttf", None), "italic": ("Lato-Italic.ttf", None), "bold-italic": ("Lato-SemiBoldItalic.ttf", None)}),
    "Noto Sans": ("notosans", {"regular": ("NotoSans[wdth,wght].ttf", 400), "bold": ("NotoSans[wdth,wght].ttf", 600), "italic": ("NotoSans-Italic[wdth,wght].ttf", 400), "bold-italic": ("NotoSans-Italic[wdth,wght].ttf", 600)}),
    "PT Sans": ("ptsans", {"regular": ("PT_Sans-Web-Regular.ttf", None), "bold": ("PT_Sans-Web-Bold.ttf", None), "italic": ("PT_Sans-Web-Italic.ttf", None), "bold-italic": ("PT_Sans-Web-BoldItalic.ttf", None)}),
    "Montserrat": ("montserrat", {"regular": ("Montserrat[wght].ttf", 400), "bold": ("Montserrat[wght].ttf", 600), "italic": ("Montserrat-Italic[wght].ttf", 400), "bold-italic": ("Montserrat-Italic[wght].ttf", 600)}),
    "Nunito Sans": ("nunitosans", {"regular": ("NunitoSans[YTLC,opsz,wdth,wght].ttf", 400), "bold": ("NunitoSans[YTLC,opsz,wdth,wght].ttf", 600), "italic": ("NunitoSans-Italic[YTLC,opsz,wdth,wght].ttf", 400), "bold-italic": ("NunitoSans-Italic[YTLC,opsz,wdth,wght].ttf", 600)}),
    "Poppins": ("poppins", {"regular": ("Poppins-Regular.ttf", None), "bold": ("Poppins-SemiBold.ttf", None), "italic": ("Poppins-Italic.ttf", None), "bold-italic": ("Poppins-SemiBoldItalic.ttf", None)}),
    "Libre Franklin": ("librefranklin", {"regular": ("LibreFranklin[wght].ttf", 400), "bold": ("LibreFranklin[wght].ttf", 600), "italic": ("LibreFranklin-Italic[wght].ttf", 400), "bold-italic": ("LibreFranklin-Italic[wght].ttf", 600)}),
    # Serif families common in formal policies.
    "Merriweather": ("merriweather", {"regular": ("Merriweather[opsz,wdth,wght].ttf", 400), "bold": ("Merriweather[opsz,wdth,wght].ttf", 600), "italic": ("Merriweather-Italic[opsz,wdth,wght].ttf", 400), "bold-italic": ("Merriweather-Italic[opsz,wdth,wght].ttf", 600)}),
    "Lora": ("lora", {"regular": ("Lora[wght].ttf", 400), "bold": ("Lora[wght].ttf", 600), "italic": ("Lora-Italic[wght].ttf", 400), "bold-italic": ("Lora-Italic[wght].ttf", 600)}),
    "Noto Serif": ("notoserif", {"regular": ("NotoSerif[wdth,wght].ttf", 400), "bold": ("NotoSerif[wdth,wght].ttf", 600), "italic": ("NotoSerif-Italic[wdth,wght].ttf", 400), "bold-italic": ("NotoSerif-Italic[wdth,wght].ttf", 600)}),
    "PT Serif": ("ptserif", {"regular": ("PT_Serif-Web-Regular.ttf", None), "bold": ("PT_Serif-Web-Bold.ttf", None), "italic": ("PT_Serif-Web-Italic.ttf", None), "bold-italic": ("PT_Serif-Web-BoldItalic.ttf", None)}),
    "Libre Baskerville": ("librebaskerville", {"regular": ("LibreBaskerville[wght].ttf", 400), "bold": ("LibreBaskerville[wght].ttf", 600), "italic": ("LibreBaskerville-Italic[wght].ttf", 400), "bold-italic": ("LibreBaskerville-Italic[wght].ttf", 600)}),
    "EB Garamond": ("ebgaramond", {"regular": ("EBGaramond[wght].ttf", 400), "bold": ("EBGaramond[wght].ttf", 600), "italic": ("EBGaramond-Italic[wght].ttf", 400), "bold-italic": ("EBGaramond-Italic[wght].ttf", 600)}),
}

STYLE_NAMES = {"regular": "Regular", "bold": "Bold", "italic": "Italic", "bold-italic": "Bold Italic"}

# Western and Central European Latin, punctuation, currency (including the
# rupee sign), letterlike symbols, arrows and the bullets and boxes policy
# lists use.
UNICODES = [
    *range(0x20, 0x7F), *range(0xA0, 0x180), *range(0x218, 0x21C), 0x2C6, 0x2C7, 0x2D8, 0x2D9, 0x2DA, 0x2DB, 0x2DC, 0x2DD,
    *range(0x2000, 0x2070), *range(0x20A0, 0x20C1), 0x2113, 0x2116, 0x2122, 0x2126, 0x212E,
    *range(0x2190, 0x2196), 0x2212, 0x2215, 0x2219, 0x221E, 0x2248, 0x2260, 0x2264, 0x2265,
    0x25A0, 0x25A1, 0x25AA, 0x25AB, 0x25B2, 0x25B6, 0x25BC, 0x25C0, 0x25CB, 0x25CF, 0x25E6,
    0x2610, 0x2611, 0x2612, 0x2713, 0x2714, 0x2717, 0xFB01, 0xFB02,
]


def slug(family: str) -> str:
    return family.lower().replace(" ", "-")


def fetch(directory: str, name: str) -> Path:
    target = CACHE / directory / name
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://raw.githubusercontent.com/google/fonts/{GOOGLE_FONTS_COMMIT}/ofl/{directory}/{urllib.parse.quote(name)}"
        with urllib.request.urlopen(url) as response:
            target.write_bytes(response.read())
    return target


def build_face(family: str, slot: str, source: Path, wght: int | None, subset_glyphs: bool) -> tuple[TTFont, int]:
    """Returns the Word-ready face and the weight its glyphs are drawn at."""
    font = TTFont(source)
    drawn = font["OS/2"].usWeightClass
    if "fvar" in font:
        # Pin wght to the requested weight and every other axis (opsz, wdth) to its default.
        pins = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
        if wght is not None:
            axis = next(axis for axis in font["fvar"].axes if axis.axisTag == "wght")
            pins["wght"] = drawn = int(min(max(wght, axis.minValue), axis.maxValue))
        font = instantiateVariableFont(font, pins, updateFontNames=False)
    font.flavor = None
    if subset_glyphs:
        options = subset.Options()
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.notdef_outline = True
        # The default feature set (kerning, ligatures, marks) without the
        # stylistic alternates, and no hinting: both would triple the size
        # Word embeds in every export.
        options.hinting = False
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=UNICODES)
        subsetter.subset(font)
        if "GPOS" in font:
            # Instancing flattens class kerning; recompacting keeps it small.
            compact(font, 9)

    bold = slot in ("bold", "bold-italic")
    italic = slot in ("italic", "bold-italic")
    style = STYLE_NAMES[slot]
    full_name = family if slot == "regular" else f"{family} {style}"
    ps_name = f"{family.replace(' ', '')}-{style.replace(' ', '')}"

    # Word looks faces up by legacy family + style, so every face shares one
    # family name and declares its slot through the RIBBI style bits.
    names = font["name"]
    for name_id in (16, 17, 21, 22, 25):
        names.removeNames(nameID=name_id)
    for name_id, value in ((1, family), (2, style), (3, f"PolicyCraft:{ps_name}"), (4, full_name), (6, ps_name)):
        names.setName(value, name_id, 3, 1, 0x409)
        names.setName(value, name_id, 1, 0, 0)

    os2 = font["OS/2"]
    os2.usWeightClass = 700 if bold else 400
    selection = os2.fsSelection & ~(1 | 1 << 5 | 1 << 6)
    selection |= (1 if italic else 0) | (1 << 5 if bold else 0) | (1 << 6 if not bold and not italic else 0)
    os2.fsSelection = selection
    font["head"].macStyle = (1 if bold else 0) | (2 if italic else 0)
    return font, drawn


def font_face(family: str, slot: str, weight: int) -> str:
    style = "italic" if "italic" in slot else "normal"
    return f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};font-display:swap;src:url(\"/fonts/{slug(family)}-{slot}.woff2\") format('woff2');}}"


def main() -> None:
    WORD.mkdir(exist_ok=True)
    for stale in WORD.glob("*.ttf"):
        stale.unlink()

    for family, slots in LOCAL.items():
        for slot, (source, wght) in slots.items():
            build_face(family, slot, FONTS / source, wght, subset_glyphs=False)[0].save(WORD / f"{slug(family)}-{slot}.ttf")
        print(f"{family}: {', '.join(slots)}")

    faces: dict[str, str] = {}
    word_slots: dict[str, list[str]] = {}
    for family, (directory, slots) in LIBRARY.items():
        css = []
        for slot, (source, wght) in slots.items():
            font, drawn = build_face(family, slot, fetch(directory, source), wght, subset_glyphs=True)
            font.save(WORD / f"{slug(family)}-{slot}.ttf")
            font.flavor = "woff2"
            font.save(FONTS / f"{slug(family)}-{slot}.woff2")
            # Declaring only these two weights makes CSS pick the same face
            # Word uses: 500 and below get regular, 600 and above get bold.
            css.append(font_face(family, slot, drawn if "bold" in slot else 400))
        faces[family] = "".join(css)
        word_slots[family] = list(slots)
        print(f"{family}: {', '.join(slots)}")

    LIBRARY_MODULE.write_text(
        "// Generated by scripts/build-document-fonts.py. Do not hand-edit.\n"
        f"// Source: github.com/google/fonts at {GOOGLE_FONTS_COMMIT} (SIL Open Font License).\n\n"
        f"export const LIBRARY_FONT_FACES: Record<string, string> = {json.dumps(faces, indent=2)};\n\n"
        f"export const LIBRARY_WORD_SLOTS: Record<string, readonly (\"regular\" | \"bold\" | \"italic\" | \"bold-italic\")[]> = {json.dumps(word_slots, indent=2)};\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
