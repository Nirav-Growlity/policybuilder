// Reads Sustainable Development Goal numbers out of text: "SDG 8", "Goals 6, 7 and 13",
// "12. Responsible Consumption", or a goal's name. Shared by the mapper and the parse route.

const SDG_NAME_PATTERNS: [number, RegExp][] = [
  [1, /no poverty/i], [2, /zero hunger/i], [3, /good health/i], [4, /quality education/i], [5, /gender equality/i],
  [6, /clean water|water and sanitation/i], [7, /affordable (?:and|&) clean energy|clean energy/i], [8, /decent work/i],
  [9, /industry,? innovation|industry (?:and|&) innovation/i], [10, /reduced inequalit/i], [11, /sustainable cities/i],
  [12, /responsible consumption/i], [13, /climate action/i], [14, /life below water/i], [15, /life on land/i],
  [16, /peace,? justice|peace and justice/i], [17, /partnerships? for the goals|^partnerships$/i],
];

export function sdgNumbersFromText(text: string): number[] {
  const found = new Set<number>();
  const add = (value: number) => { if (Number.isInteger(value) && value >= 1 && value <= 17) found.add(value); };
  for (const match of text.matchAll(/\b(?:SDGs?|Goals?)\s*(?:no\.?|number|#)?\s*:?\s*((?:\d{1,2}(?:\s*(?:,|and|&|\/|to|-|–)\s*)?)+)/gi)) {
    const numbers = match[1].match(/\d{1,2}/g)?.map(Number) ?? [];
    const range = /\b(?:to|-|–)\b|[-–]/.test(match[1]) && numbers.length === 2 && numbers[0] < numbers[1] && !/,|and|&/.test(match[1]);
    if (range) for (let n = numbers[0]; n <= numbers[1]; n++) add(n);
    else numbers.forEach(add);
  }
  for (const line of text.split("\n")) {
    // A leading number counts only with "SDG"/"Goal" or that goal's own name ("8. Decent Work ...");
    // "1. We align with..." and "12.5% reduction" name no goal. A bare goal name counts only on a
    // short label-like line, not in prose that happens to mention "climate action".
    const named = SDG_NAME_PATTERNS.filter(([, pattern]) => pattern.test(line)).map(([n]) => n);
    const lead = /^\s*(SDG|Goal)?\s*(\d{1,2})\s*[.):–-](?!\d)/i.exec(line);
    if (lead && (lead[1] || named.includes(Number(lead[2])))) add(Number(lead[2]));
    else if (!lead && line.trim().split(/\s+/).length <= 12) named.forEach(add);
  }
  return [...found].sort((a, b) => a - b);
}

/** Goal numbers from a model or other untrusted source: integers 1 to 17, once each, in order. */
export function validSdgNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 17))].sort((a, b) => a - b);
}
