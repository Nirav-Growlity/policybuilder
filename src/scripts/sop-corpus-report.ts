/**
 * Summarises the extracted SOP corpus in data/seed-sops: SOPs per manual and
 * per catalog topic, the unmapped share and words per SOP.
 *   npx tsx scripts/sop-corpus-report.ts [--topics-only]
 */
import fs from "fs";
import path from "path";
import { SOP_CATALOG } from "../lib/sop/catalog";
import type { GeneratedSopSection } from "../lib/sop/schema";
import type { SeedSop, SeedSopManual } from "../lib/sop/seed-types";

const SEED_DIR = path.join(__dirname, "../data/seed-sops");

/** Words in the normalised SOP, to compare against the source's word count. */
function sectionWords(section: GeneratedSopSection): number {
  const parts: string[] = [section.title];
  const blocks = (list: Array<{ text: string; columns?: string[]; rows?: string[][] }>) =>
    list.forEach((block) => parts.push(block.text, ...(block.columns ?? []), ...(block.rows ?? []).flat()));
  switch (section.kind) {
    case "definitions":
      section.rows.forEach((row) => parts.push(row.term, row.definition));
      break;
    case "responsibilities":
      section.rows.forEach((row) => parts.push(row.role, ...row.responsibilities));
      break;
    case "procedure":
      section.steps.forEach((step) => {
        parts.push(step.heading, step.responsible ?? "", ...(step.substeps ?? []).map((sub) => sub.text));
        blocks(step.body);
      });
      break;
    case "monitoring":
      section.kpis.forEach((kpi) => parts.push(kpi.indicator, kpi.target, kpi.frequency, kpi.owner));
      blocks(section.narrative);
      break;
    case "records":
      section.rows.forEach((row) => parts.push(row.record, row.owner, row.retention, row.format));
      break;
    case "references":
      parts.push(...section.items);
      break;
    default:
      blocks(section.blocks);
  }
  return parts.join(" ").split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length;
}

const sopWords = (sop: SeedSop) => sop.sections.reduce((sum, section) => sum + sectionWords(section), 0);

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "-");
const mean = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);

function main() {
  if (!fs.existsSync(SEED_DIR)) {
    console.error("No data/seed-sops yet. Run scripts/import-sop-seeds.ts first.");
    process.exit(1);
  }
  const files = fs.readdirSync(SEED_DIR).filter((file) => file.endsWith(".json")).sort();
  const manuals = files.map((file) => JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), "utf8")) as SeedSopManual);
  const bytes = files.reduce((sum, file) => sum + fs.statSync(path.join(SEED_DIR, file)).size, 0);
  const sops = manuals.flatMap((manual) => manual.sops.map((sop) => ({ manual, sop, words: sopWords(sop) })));
  const topicsOnly = process.argv.includes("--topics-only");

  if (!topicsOnly) {
    console.log("\nSOPs per manual");
    const width = Math.max(...manuals.map((manual) => manual.id.length), 8);
    console.log(`${"manual".padEnd(width)}  sops  unmapped  src words  out words  industry`);
    for (const manual of manuals) {
      const rows = sops.filter((row) => row.manual === manual);
      const unmapped = rows.filter((row) => !row.sop.catalogId).length;
      const front = Object.values(manual.frontMatter).filter((value) => value.trim()).length;
      console.log(
        `${manual.id.padEnd(width)}  ${String(rows.length).padStart(4)}  ${String(unmapped).padStart(8)}  ${String(mean(rows.map((row) => row.sop.sourceWords))).padStart(9)}  ${String(mean(rows.map((row) => row.words))).padStart(9)}  ${manual.industry} [${manual.industryTags.join(", ")}]${front < 2 ? `  (front matter: ${front}/4 fields)` : ""}`
      );
    }
  }

  console.log("\nSOPs per catalog topic");
  console.log("topic                          kind         manuals  sops  catalog freq  avg words");
  const topicRows = SOP_CATALOG.map((topic) => {
    const rows = sops.filter((row) => row.sop.catalogId === topic.id);
    return { topic, rows, manuals: new Set(rows.map((row) => row.manual.id)).size };
  }).sort((a, b) => b.manuals - a.manuals || b.rows.length - a.rows.length);
  for (const { topic, rows, manuals: count } of topicRows) {
    const drift = topic.frequency !== count ? " *" : "";
    console.log(
      `${topic.id.padEnd(30)} ${topic.kind.padEnd(12)} ${String(count).padStart(7)}  ${String(rows.length).padStart(4)}  ${String(topic.frequency).padStart(12)}  ${String(mean(rows.map((row) => row.words))).padStart(9)}${drift}`
    );
  }
  const unknown = sops.filter((row) => row.sop.catalogId && !SOP_CATALOG.some((topic) => topic.id === row.sop.catalogId));
  if (unknown.length) console.log(`! ${unknown.length} SOPs point at ids missing from the catalog`);

  const unmapped = sops.filter((row) => !row.sop.catalogId);
  if (unmapped.length && !topicsOnly) {
    console.log("\nUnmapped SOPs");
    for (const row of unmapped) console.log(`  ${row.manual.id}: ${row.sop.title}`);
  }

  const words = sops.map((row) => row.words);
  const source = sops.map((row) => row.sop.sourceWords);
  const ratio = source.reduce((a, b) => a + b, 0) ? words.reduce((a, b) => a + b, 0) / source.reduce((a, b) => a + b, 0) : 0;
  const emptySections = sops.reduce((sum, row) => sum + row.sop.sections.filter((section) => sectionWords(section) <= section.title.split(/\s+/).length).length, 0);
  console.log(
    `\n${manuals.length} manuals, ${sops.length} SOPs, ${(bytes / 1024 / 1024).toFixed(1)} MB` +
      `\nunmapped (catalogId null): ${unmapped.length} = ${pct(unmapped.length, sops.length)} (target under 5%)` +
      `\ntopics used: ${topicRows.filter((row) => row.manuals).length}/${SOP_CATALOG.length}` +
      `\nwords per SOP (normalised): mean ${mean(words)}, p10 ${quantile(words, 0.1)}, median ${quantile(words, 0.5)}, p90 ${quantile(words, 0.9)}, max ${Math.max(0, ...words)}` +
      `\nwords per SOP (source): mean ${mean(source)}, median ${quantile(source, 0.5)}; normalised/source ${ratio.toFixed(2)}` +
      `\nsections per SOP: ${(sops.reduce((sum, row) => sum + row.sop.sections.length, 0) / Math.max(sops.length, 1)).toFixed(1)}, empty sections ${emptySections}`
  );
}

main();
