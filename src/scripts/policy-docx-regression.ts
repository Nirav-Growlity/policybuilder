// Policy DOCX regression against the pre-template renderer and font embedding.
// Run: node --import tsx scripts/policy-docx-regression.ts [--tests]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { mock } from "node:test";
import JSZip from "jszip";
import { generateDocx } from "../lib/docx/generate";
import { templatePreviewPolicy } from "../lib/sample-policies";
async function normalizedDocx(data: Buffer) {
  const zip = await JSZip.loadAsync(data);
  const fontTable = await zip.file("word/fontTable.xml")!.async("string");
  const rels = await zip.file("word/_rels/fontTable.xml.rels")!.async("string");
  const keys = new Map<string, string>();
  for (const embed of fontTable.matchAll(/<w:embed\w+\b[^>]+>/g)) {
    const id = /r:id="([^"]+)"/.exec(embed[0])?.[1];
    const key = /w:fontKey="([^"]+)"/.exec(embed[0])?.[1];
    const rel = [...rels.matchAll(/<Relationship\b[^>]+>/g)].find(match => match[0].includes(`Id="${id}"`));
    const target = rel && /Target="([^"]+)"/.exec(rel[0])?.[1];
    if (target && key) keys.set(`word/${target}`, key);
  }
  const entries = new Map<string, Buffer>();
  for (const name of Object.keys(zip.files).sort()) {
    if (zip.files[name].dir) continue;
    let content = await zip.file(name)!.async("nodebuffer");
    const key = keys.get(name);
    if (key) {
      content = Buffer.from(content);
      const bytes = key.replaceAll(/[{}-]/g, "").match(/../g)!.map(byte => parseInt(byte, 16)).reverse();
      for (let i = 0; i < 32; i++) content[i] ^= bytes[i % 16];
    }
    if (name === "word/fontTable.xml") content = Buffer.from(content.toString().replace(/w:fontKey="[^"]+"/g, 'w:fontKey="KEY"'));
    entries.set(name, content);
  }
  return entries;
}

async function main() {
  const prefix = `.policy-baseline-${process.pid}`;
  const files = [`lib/docx/${prefix}-fonts.ts`, `lib/docx/${prefix}-generate.ts`, `lib/docx/${prefix}.test.ts`];
  try {
    const old = (file: string) => execFileSync("git", ["show", `5b0714c:src/lib/docx/${file}`], { encoding: "utf8" });
    writeFileSync(files[0], old("document-fonts.ts"));
    writeFileSync(files[1], old("generate.ts").replace('"./document-fonts"', `"./${prefix}-fonts"`));
    writeFileSync(files[2], old("generate.test.ts").replace('"./generate"', `"./${prefix}-generate"`));
    if (process.argv.includes("--tests")) {
      console.log(execFileSync(process.execPath, ["--import", "tsx", "--test", files[2]], { encoding: "utf8" }));
      return;
    }
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T00:00:00Z").getTime() });
    const baseline = await import(`../${files[1]}`) as { generateDocx: typeof generateDocx };
    for (const id of ["standard-pack", "executive-brief", "controlled-manual", "governance-register", "operations-guide", "sustainability-charter", "people-charter", "metrics-ledger"]) {
      const policy = templatePreviewPolicy(id, "environmental");
      const before = await normalizedDocx(await baseline.generateDocx(policy));
      const after = await normalizedDocx(await generateDocx(policy));
      assert.deepEqual([...before.keys()], [...after.keys()], id);
      for (const [name, content] of before) assert.ok(content.equals(after.get(name)!), `${id}: ${name}`);
      console.log(`${id}: every DOCX part identical to 5b0714c after font-key deobfuscation (fixed clock)`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error) console.log(error.stdout);
    else console.error(error);
    process.exitCode = 1;
  } finally {
    mock.timers.reset();
    for (const file of files) unlinkSync(file);
  }
}
main();
