import synonymCatalog from "./focus-area-synonyms.json";
import { normalizeSubSector } from "./focus-area-catalog";

const synonymsByNormalizedLabel = new Map<string, readonly string[]>(
  Object.entries(synonymCatalog).map(([label, synonyms]) => [normalizeSubSector(label), synonyms]),
);

export function getSystemFocusAreaSynonyms(label: string): readonly string[] | null {
  return synonymsByNormalizedLabel.get(normalizeSubSector(label)) ?? null;
}

export function pickSystemFocusAreaSynonym(
  canonicalLabel: string,
  currentLabel: string,
  activeLabels: string[],
): string | null {
  const synonyms = getSystemFocusAreaSynonyms(canonicalLabel);
  if (!synonyms) return null;

  const excluded = new Set([
    normalizeSubSector(currentLabel),
    ...activeLabels.map(normalizeSubSector),
  ]);
  const available = synonyms.filter((label) => !excluded.has(normalizeSubSector(label)));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}
