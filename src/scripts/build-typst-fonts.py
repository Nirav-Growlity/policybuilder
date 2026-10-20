"""Build the extra faces the Typst policy PDF needs to match Chromium.

Typst can't instance variable fonts, and the Word TTFs in public/fonts/word
pin every family to four faces, with "bold" drawn at 600. Chromium draws the
policy preview from the variable web fonts in public/fonts, so:

* a CSS weight of 700 or 800 draws heavier than any Word face, and
* `font-optical-sizing: auto` sets the opsz axis to the font size in CSS px,
  so Source Serif 4 and Fraunces change shape (and width) with size.

For each local family where Chromium draws a weight differently from what
Typst would pick among the Word faces, this writes a full Typst set to
public/fonts/typst/: one face per weight the template asks for, each drawn at
the weight Chromium resolves for that request from the @font-face rules in
lib/document-fonts.ts. Families with an opsz axis also get instances at a
grid of optical sizes under the family name "<family> Opsz <size>".
lib/typst/fonts.ts loads these instead of the Word faces of the same family,
and lib/typst/typst-font-set.ts (written here) tells the model which exist.

Word export never reads public/fonts/typst.

Run with fontTools installed:
    python scripts/build-typst-fonts.py
"""

import json
import re
from pathlib import Path

from fontTools.otlLib.optimize import compact
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public" / "fonts"
OUT = FONTS / "typst"
FACES_MODULE = ROOT / "lib" / "document-fonts.ts"
SET_MODULE = ROOT / "lib" / "typst" / "typst-font-set.ts"

# Weights lib/typst/policy/policy.typ asks for: regular, medium, semibold, bold, extrabold.
WEIGHTS = (400, 500, 600, 700, 800)
ITALIC_WEIGHTS = (400, 600, 700)

def pt_sizes(points: list[float]) -> tuple[float, ...]:
    return tuple(round(pt * 4 / 3, 2) for pt in points)


# Optical-size instances: weight -> CSS px sizes, clamped to the font's opsz
# axis. They carry the weights running text and headings use (italic only
# appears on cover text layers); anything else draws from the base family at
# its default opsz.
#
# Source Serif 4 narrows about 1% per px from 8 to 20 px. Regular text gets
# every body and subheading size the typography steppers offer (8-20 pt in
# half points); semibold and bold, used for headings, labels and markers, get
# whole points. Fraunces moves under 0.1% per px below 36 px, so a coarse grid
# matches it.
SOURCE_SERIF_DISPLAY = pt_sizes([22, 24]) + (36, 48, 60)
FRAUNCES_GRID = (12, 16, 20, 24, 28, 36, 48, 60, 72, 96, 144)
OPSZ_GRID = {
    "Source Serif 4": {
        400: pt_sizes([x / 2 for x in range(16, 41)]) + SOURCE_SERIF_DISPLAY,
        600: pt_sizes(list(range(8, 21))) + SOURCE_SERIF_DISPLAY,
        700: pt_sizes(list(range(8, 21))) + SOURCE_SERIF_DISPLAY,
    },
    "Fraunces": {400: FRAUNCES_GRID, 600: FRAUNCES_GRID, 700: FRAUNCES_GRID},
}

STYLE_NAMES = {100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black"}

FACE_RULE = re.compile(r"font-family:\\?'([^'\\]+)\\?';font-style:(\w+);font-weight:(\d+);[^}]*?url\(\"/fonts/([^\"]+)\"\)")


def slug(family: str) -> str:
    return family.lower().replace(" ", "-")


def declared_faces() -> dict[str, list[tuple[str, int, str]]]:
    """family -> [(style, weight, file)] from the hand-written @font-face rules (library families are static)."""
    source = FACES_MODULE.read_text(encoding="utf-8-sig")
    table = source[source.index("const FACES"):source.index("};")]
    faces: dict[str, list[tuple[str, int, str]]] = {}
    for family, style, weight, file in FACE_RULE.findall(table):
        faces.setdefault(family, []).append((style, int(weight), file))
    return faces


def css_match(weights: list[int], desired: int) -> int:
    """The declared weight CSS Fonts 4 picks for `desired` (section 5.2, font-weight)."""
    if desired in weights:
        return desired
    above = sorted(w for w in weights if w > desired)
    below = sorted((w for w in weights if w < desired), reverse=True)
    if 400 <= desired <= 500:
        order = [w for w in above if w <= 500] + below + [w for w in above if w > 500]
    elif desired < 400:
        order = below + above
    else:
        order = above + below
    return order[0]


def drawn_weight(font: TTFont, declared: int) -> int:
    """Chromium instances a variable face at its declared weight; a static face draws its own."""
    if "fvar" in font:
        axis = next((a for a in font["fvar"].axes if a.axisTag == "wght"), None)
        if axis:
            return int(min(max(declared, axis.minValue), axis.maxValue))
    return font["OS/2"].usWeightClass


def word_pick(desired: int) -> str:
    """The Word slot Typst picks by nearest weight: regular is class 400, bold is class 700."""
    return "regular" if abs(desired - 400) < abs(desired - 700) else "bold"


def instance(source: Path, wght: int | None, opsz: float | None) -> TTFont:
    font = TTFont(source)
    if "fvar" in font:
        pins = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
        for axis in font["fvar"].axes:
            if axis.axisTag == "wght" and wght is not None:
                pins["wght"] = min(max(wght, axis.minValue), axis.maxValue)
            if axis.axisTag == "opsz" and opsz is not None:
                pins["opsz"] = min(max(opsz, axis.minValue), axis.maxValue)
        font = instantiateVariableFont(font, pins, updateFontNames=False)
        if "GPOS" in font:
            # Instancing flattens class kerning; recompacting keeps it small.
            compact(font, 9)
    font.flavor = None
    # Glyph names only add weight; Typst maps text through cmap.
    font["post"].formatType = 3.0
    return font


def name_face(font: TTFont, family: str, weight_class: int, drawn: int, italic: bool) -> TTFont:
    weight = min(STYLE_NAMES, key=lambda named: abs(named - drawn))
    style = STYLE_NAMES[weight] if not italic else ("Italic" if weight == 400 else f"{STYLE_NAMES[weight]} Italic")
    ps_name = f"{family.replace(' ', '')}-{style.replace(' ', '')}"
    names = font["name"]
    for name_id in (16, 17, 21, 22, 25):
        names.removeNames(nameID=name_id)
    for name_id, value in ((1, family), (2, style), (3, f"PolicyCraft:{ps_name}"), (4, f"{family} {style}"), (6, ps_name)):
        names.setName(value, name_id, 3, 1, 0x409)
        names.setName(value, name_id, 1, 0, 0)
    os2 = font["OS/2"]
    os2.usWeightClass = weight_class
    bold = weight >= 700
    selection = os2.fsSelection & ~(1 | 1 << 5 | 1 << 6)
    selection |= (1 if italic else 0) | (1 << 5 if bold else 0) | (1 << 6 if not bold and not italic else 0)
    os2.fsSelection = selection
    font["head"].macStyle = (1 if bold else 0) | (2 if italic else 0)
    return font


def plan(faces: list[tuple[str, int, str]], style: str, weights: tuple[int, ...]) -> dict[int, tuple[Path, int]]:
    """requested weight -> (source file, weight Chromium draws it at), for one style."""
    declared = {weight: file for face_style, weight, file in faces if face_style == style}
    if not declared:
        return {}
    result = {}
    for desired in weights:
        matched = css_match(list(declared), desired)
        source = FONTS / declared[matched]
        result[desired] = (source, drawn_weight(TTFont(source, lazy=True), matched))
    return result


def weight_classes(mapping: dict[int, tuple[Path, int]]) -> list[tuple[Path, int, int]]:
    """(source, drawn weight, weight class) per face, so Typst's nearest-weight match lands every request on Chromium's choice.

    Requests drawn alike share one face, classed at their mean (a 400 face that
    also serves 500 is class 450). Where that would tie with a neighbouring
    face, each request of the group gets its own face at its exact weight.
    """
    groups: dict[tuple[Path, int], list[int]] = {}
    for desired, key in mapping.items():
        groups.setdefault(key, []).append(desired)
    shared = {key: round(sum(requests) / len(requests)) for key, requests in groups.items()}

    def unambiguous(desired: int, key: tuple[Path, int]) -> bool:
        distances = sorted((abs(desired - weight_class), other) for other, weight_class in shared.items())
        return distances[0][1] == key and (len(distances) == 1 or distances[1][0] > distances[0][0])

    faces = []
    for key, requests in groups.items():
        if all(unambiguous(desired, key) for desired in requests):
            faces.append((*key, shared[key]))
        else:
            faces.extend((*key, desired) for desired in requests)
    return faces


def write_set(name: str, mapping: dict[int, tuple[Path, int]], italic: bool, opsz: float | None = None) -> None:
    for source, drawn, weight_class in weight_classes(mapping):
        font = name_face(instance(source, drawn, opsz), name, weight_class, drawn, italic)
        font.save(OUT / f"{slug(name)}-{weight_class}{'i' if italic else ''}.ttf")


def opsz_axis(source: Path) -> tuple[float, float] | None:
    font = TTFont(source, lazy=True)
    if "fvar" not in font:
        return None
    axis = next((a for a in font["fvar"].axes if a.axisTag == "opsz"), None)
    return (axis.minValue, axis.maxValue) if axis else None


def word_drawn(family: str) -> dict[str, int] | None:
    """Weights the Word faces are drawn at, read back from build-document-fonts.py's choices."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("document_fonts", ROOT / "scripts" / "build-document-fonts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    slots = module.LOCAL.get(family)
    if not slots:
        return None
    drawn = {}
    for slot in ("regular", "bold"):
        if slot in slots:
            file, wght = slots[slot]
            font = TTFont(FONTS / file, lazy=True)
            drawn[slot] = drawn_weight(font, wght) if wght is not None else font["OS/2"].usWeightClass
    return drawn


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for stale in OUT.glob("*.ttf"):
        stale.unlink()

    families: list[str] = []
    optical: dict[str, dict] = {}
    for family, faces in declared_faces().items():
        word = word_drawn(family)
        if word is None:
            continue
        upright = plan(faces, "normal", WEIGHTS)
        italic = plan(faces, "italic", ITALIC_WEIGHTS)
        axis = opsz_axis(next(iter(upright.values()))[0])
        differs = any(drawn != word.get(word_pick(desired)) for desired, (_, drawn) in upright.items())
        if not differs and axis is None:
            continue

        families.append(family)
        write_set(family, upright, False)
        if italic:
            write_set(family, italic, True)
        print(f"{family}: " + ", ".join(f"{d}->{w}" for d, (_, w) in upright.items()) + (f"; italic " + ", ".join(f"{d}->{w}" for d, (_, w) in italic.items()) if italic else ""))

        if axis is None or family not in OPSZ_GRID:
            continue
        clamp = lambda size: (lambda value: int(value) if float(value).is_integer() else value)(min(max(size, axis[0]), axis[1]))
        grid = {weight: sorted({clamp(size) for size in sizes}) for weight, sizes in OPSZ_GRID[family].items()}
        for size in sorted({size for sizes in grid.values() for size in sizes}):
            write_set(f"{family} Opsz {size}", {weight: upright[weight] for weight, sizes in grid.items() if size in sizes}, False, size)
        optical[family] = {str(weight): sizes for weight, sizes in grid.items()}
        print("  opsz " + ", ".join(f"{weight}: {len(sizes)} sizes" for weight, sizes in grid.items()))

    SET_MODULE.write_text(
        "// Generated by scripts/build-typst-fonts.py. Do not hand-edit.\n\n"
        "/** Families whose Typst faces come from public/fonts/typst instead of the Word TTFs. */\n"
        f"export const TYPST_FONT_FAMILIES: readonly string[] = {json.dumps(families)};\n\n"
        "/** Optical-size instances, named \"<family> Opsz <size>\": CSS weight -> the CSS px sizes built for it. */\n"
        f"export const TYPST_OPTICAL_SIZES: Record<string, Record<string, number[]>> = {json.dumps(optical, indent=2)};\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
