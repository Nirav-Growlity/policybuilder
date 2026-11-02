"""Extract the reference employee handbooks into data/seed-handbooks/<slug>.json.

Deterministic, no AI: each .docx is walked paragraph by paragraph; headings
(Word heading styles, Title, or short bold lines) that match a chapter topic
in data/handbook-catalog.json start a chapter, and the text up to the next
matching heading becomes that chapter's reference text (sub-headings kept as
"## ", list items as "- ", tables as "| a | b |" rows). Welcome, about and
purpose headings fill the front-matter examples.

The AI reads these files as examples of tone, structure and depth
(lib/ai/handbook-template-context.ts); it never copies their facts.

    python scripts/extract-handbook-seeds.py [<repo root>]
Requires python-docx.
"""
import json
import re
import sys
from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

SRC = Path(__file__).resolve().parent.parent
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC.parent
FOLDERS = [ROOT / "Employee Handbook - SOP Manual" / "Employee Handbook", ROOT / "SOP Manual  Employee Handbook" / "HANDBOOK"]
OUT = SRC / "data" / "seed-handbooks"
CATALOG = json.loads((SRC / "data" / "handbook-catalog.json").read_text(encoding="utf-8"))["topics"]

CHAPTER_MAX_CHARS = 5000
CHAPTER_MIN_CHARS = 300
FRONT_MAX_CHARS = 1800
TABLE_MAX_ROWS = 12

FRONT_HEADINGS = [
    ("welcome", re.compile(r"\b(welcome|message from|chairman|md s message|ceo s message|foreword)\b")),
    ("about", re.compile(r"\b(about us|about the company|about [a-z]+|company profile|company overview|our story|our legacy|who we are|overview of)\b")),
    ("purpose", re.compile(r"\b(purpose of (the|this) handbook|introduction|how to use)\b")),
]


def normalize(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9 ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def strip_numbering(text: str) -> str:
    return re.sub(r"^\s*((chapter|section|part)\s+)?([0-9ivxIVX]+[.)]?)+(\.[0-9]+)*\s*[-:.)]?\s*", "", text).strip()


def match_topic(heading: str):
    text = normalize(re.sub(r"\b(policy|policies|guidelines?|procedure)\b", " ", strip_numbering(heading), flags=re.I))
    if not text or len(text) > 70:
        return None, 0
    words = {w for w in text.split() if len(w) > 3}
    best, best_score = None, 0
    for topic in CATALOG:
        score = 0
        for name in [topic["title"], *topic["aliases"]]:
            name = normalize(name)
            if not name:
                continue
            if text == name:
                score = max(score, 100)
            elif name in text or text in name:
                score = max(score, min(95, 40 + min(len(name), len(text))))
            else:
                score = max(score, 15 * sum(1 for w in name.split() if len(w) > 3 and w in words))
        if score > best_score:
            best, best_score = topic, score
    return best, best_score


def iter_blocks(document):
    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            yield Paragraph(child, document)
        elif tag == "tbl":
            yield Table(child, document)


def is_heading(paragraph: Paragraph) -> bool:
    style = (paragraph.style.name or "").lower() if paragraph.style is not None else ""
    if style.startswith("heading") or style == "title":
        return True
    text = paragraph.text.strip()
    runs = [run for run in paragraph.runs if run.text.strip()]
    return 0 < len(text) <= 90 and bool(runs) and all(run.bold for run in runs) and not text.endswith((".", ",", ";"))


def is_list(paragraph: Paragraph) -> bool:
    style = (paragraph.style.name or "").lower() if paragraph.style is not None else ""
    return "list" in style or paragraph._p.pPr is not None and paragraph._p.pPr.numPr is not None


def table_lines(table: Table) -> list[str]:
    lines = []
    for row in table.rows[: TABLE_MAX_ROWS + 1]:
        cells = []
        try:
            for cell in row.cells:
                text = re.sub(r"\s+", " ", cell.text).strip()[:80]
                if not cells or cells[-1] != text:
                    cells.append(text)
        except Exception:  # noqa: BLE001 - irregular tables
            continue
        if any(cells):
            lines.append("| " + " | ".join(cells) + " |")
    return ["[table]", *lines] if lines else []


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:60]


def extract(path: Path, company: str):
    document = docx.Document(str(path))
    chapters: dict[str, dict] = {}
    front = {"welcome": [], "about": [], "purpose": []}
    current = None  # ("chapter", id) | ("front", key) | None
    for block in iter_blocks(document):
        if isinstance(block, Paragraph):
            text = re.sub(r"\s+", " ", block.text).strip()
            if not text:
                continue
            if is_heading(block):
                topic, score = match_topic(text)
                if topic and score >= 60:
                    current = ("chapter", topic["id"])
                    chapters.setdefault(topic["id"], {"title": strip_numbering(text).title() if text.isupper() else strip_numbering(text), "catalogId": topic["id"], "part": topic["part"], "lines": []})
                    continue
                key = next((name for name, pattern in FRONT_HEADINGS if pattern.search(normalize(text))), None)
                if key and not chapters:
                    current = ("front", key)
                    continue
                if current and current[0] == "chapter":
                    chapters[current[1]]["lines"].append(f"## {strip_numbering(text)}")
                continue
            line = f"- {text}" if is_list(block) else text
        else:
            lines = table_lines(block)
            if not lines:
                continue
            line = "\n".join(lines)
        if current is None:
            continue
        if current[0] == "chapter":
            chapters[current[1]]["lines"].append(line)
        else:
            front[current[1]].append(line)

    out = []
    for chapter in chapters.values():
        text = "\n".join(chapter["lines"]).strip()
        if len(text) < CHAPTER_MIN_CHARS:
            continue
        words = len(text.split())
        if len(text) > CHAPTER_MAX_CHARS:
            cut = text[:CHAPTER_MAX_CHARS]
            text = cut[: cut.rfind("\n")] if cut.rfind("\n") > CHAPTER_MAX_CHARS * 0.6 else cut
            text += "\n…"
        out.append({"title": chapter["title"], "catalogId": chapter["catalogId"], "part": chapter["part"], "text": text, "sourceWords": words})
    front_text = {key: "\n".join(lines)[:FRONT_MAX_CHARS] for key, lines in front.items()}
    return {"id": slug(company), "company": company, "sourceFile": str(path.relative_to(ROOT)).replace("\\", "/"), "frontMatter": front_text, "chapters": out}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    files = []
    for folder in FOLDERS:
        if folder.exists():
            files.extend(sorted(p for p in folder.rglob("*.docx") if not p.name.startswith("~$") and not re.search(r"sop", p.name, re.I)))
    written = 0
    for path in files:
        company = path.parent.name if path.parent.name.lower() != "handbook" else re.sub(r"(?i)^(final\s+)?(global\s+)?(employe+\s+handbook|hr\s+(policy\s+)?manual|hr\s+handbook)[^-_]*[-_]\s*", "", path.stem).strip() or path.stem
        try:
            seed = extract(path, company)
        except Exception as error:  # noqa: BLE001
            print(f"skip {path.name}: {error}")
            continue
        if not seed["chapters"]:
            print(f"skip {path.name}: no chapters matched")
            continue
        (OUT / f"{seed['id']}.json").write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
        written += 1
        print(f"{seed['id']}: {len(seed['chapters'])} chapters")
    print(f"{written} handbooks written to {OUT}")


if __name__ == "__main__":
    main()
