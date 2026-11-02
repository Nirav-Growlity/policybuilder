import type { HandbookManual } from "./types";

/** Fold the former reading guidance into the handbook introduction without changing the saved input. */
export function migrateHandbook(manual: HandbookManual): HandbookManual {
  if (!manual.frontMatter.howToUse.length) return manual;
  // Blank paragraphs left in the old field are dropped rather than appended.
  const guidance = manual.frontMatter.howToUse.filter((block) => block.type === "table" || block.text.trim() !== "");
  return {
    ...manual,
    frontMatter: { ...manual.frontMatter, purpose: [...manual.frontMatter.purpose, ...guidance], howToUse: [] },
  };
}
