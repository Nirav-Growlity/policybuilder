/**
 * Parses every reference SOP manual and prints coverage per file:
 *   npx tsx scripts/sop-parse-report.ts [filter] [--detail]
 */
import fs from "fs";
import path from "path";
import { parseSopDocx, type ParsedSopManual } from "../lib/docx/sop-parse";
import { findSopReferenceRoot, listSopReferenceFiles } from "./sop-reference-files";

type Row = {
  file: string;
  tocSops: number;
  sops: number;
  sections: number;
  unclassified: number;
  purpose: number;
  procedure: number;
  warnings: number;
};

function summarize(file: string, manual: ParsedSopManual): Row {
  const sections = manual.sops.flatMap((sop) => sop.sections);
  return {
    file,
    tocSops: manual.toc.filter((entry) => entry.role === "sop").length,
    sops: manual.sops.length,
    sections: sections.length,
    unclassified: sections.filter((section) => !section.kind || section.inferred).length,
    purpose: manual.sops.filter((sop) => sop.sections.some((section) => section.kind === "purpose")).length,
    procedure: manual.sops.filter((sop) => sop.sections.some((section) => section.kind === "procedure")).length,
    warnings: manual.warnings.length,
  };
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "-";
}

async function main() {
  const root = findSopReferenceRoot();
  if (!root) {
    console.error("Reference folders not found. Set SOP_REFERENCE_ROOT to the folder that contains SOP/.");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const detail = args.includes("--detail");
  const filter = args.find((arg) => !arg.startsWith("--"))?.toLowerCase();
  const files = listSopReferenceFiles(root).filter((file) => !filter || file.toLowerCase().includes(filter));

  const rows: Row[] = [];
  for (const file of files) {
    const label = path.relative(root, file);
    try {
      const started = Date.now();
      const manual = await parseSopDocx(fs.readFileSync(file));
      const row = summarize(label, manual);
      rows.push(row);
      if (detail) {
        console.log(`\n### ${label} (${Date.now() - started} ms) — "${manual.title}" company=${manual.company?.name ?? "?"} sites=${manual.frontMatter.sites.length}`);
        console.log(`control: ${JSON.stringify(manual.control)}`);
        console.log(`front: ${manual.frontMatter.sections.map((s) => s.label).join(" | ")}`);
        manual.sops.forEach((sop, i) => {
          const sections = sop.sections.map((s) => `${s.label}${s.kind ? `=${s.kind}${s.inferred ? "?" : ""}` : ""}`).join(" | ");
          console.log(`  ${i + 1}. ${sop.title}${sop.code ? ` [${sop.code}]` : ""}${sop.group ? ` {${sop.group}}` : ""}\n      ${sections}`);
        });
        console.log(`closing: ${manual.closing.sections.map((s) => s.label).join(" | ")} rev=${manual.closing.revisionHistory.length}`);
        for (const warning of manual.warnings) console.log(`  ! ${warning}`);
      }
    } catch (error) {
      console.log(`${label}: FAILED ${(error as Error).message}`);
    }
  }

  const width = Math.max(...rows.map((row) => row.file.length), 10);
  console.log(`\n${"file".padEnd(width)}  toc  sops  sects  unclass  purpose  proced  warn`);
  for (const row of rows) {
    const flag = row.tocSops && row.sops !== row.tocSops ? " *" : "";
    console.log(
      `${row.file.padEnd(width)}  ${String(row.tocSops).padStart(3)}  ${String(row.sops).padStart(4)}  ${String(row.sections).padStart(5)}  ${pct(row.unclassified, row.sections).padStart(7)}  ${pct(row.purpose, row.sops).padStart(7)}  ${pct(row.procedure, row.sops).padStart(6)}  ${String(row.warnings).padStart(4)}${flag}`
    );
  }
  const total = rows.reduce(
    (sum, row) => ({ sops: sum.sops + row.sops, sections: sum.sections + row.sections, unclassified: sum.unclassified + row.unclassified, purpose: sum.purpose + row.purpose, procedure: sum.procedure + row.procedure }),
    { sops: 0, sections: 0, unclassified: 0, purpose: 0, procedure: 0 }
  );
  console.log(
    `\n${rows.length} files, ${total.sops} SOPs, ${total.sections} sections, unclassified ${pct(total.unclassified, total.sections)}, purpose ${pct(total.purpose, total.sops)}, procedure ${pct(total.procedure, total.sops)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
