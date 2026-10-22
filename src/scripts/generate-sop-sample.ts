// Generates the sample SOP manual used for template previews and PDF/DOCX
// parity checks. Writes lib/sop/fixtures/sample-manual.json.
// Run (needs ANTHROPIC_API_KEY): npx tsx scripts/generate-sop-sample.ts
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { streamClaudeText } from "../lib/ai/claude";

const SampleSop = z.object({
  purpose: z.string(),
  scope: z.string(),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })),
  responsibilities: z.array(z.object({ role: z.string(), responsibilities: z.array(z.string()) })),
  procedure: z.array(z.object({
    heading: z.string(),
    body: z.string(),
    responsible: z.string(),
    substeps: z.array(z.string()),
  })),
  kpis: z.array(z.object({ indicator: z.string(), target: z.string(), frequency: z.string(), owner: z.string() })),
  training: z.string(),
  records: z.array(z.object({ record: z.string(), owner: z.string(), retention: z.string(), format: z.string() })),
  references: z.array(z.string()),
  review: z.string(),
});

const FrontMatter = z.object({
  introduction: z.array(z.string()),
  objective: z.string(),
  benefits: z.array(z.string()),
  coreValues: z.array(z.object({ title: z.string(), description: z.string() })),
  howToUse: z.string(),
  reviewMechanism: z.string(),
  approvalStatement: z.string(),
});

const SYSTEM = `You are a senior ESG and operations consultant who writes Standard Operating Procedures for company SOP manuals. Write formal, specific, audit-ready text in British English. Use the company's sites, departments and roles. Never invent laws, certificates or figures the company did not give; describe the control instead.`;

const COMPANY = `COMPANY: Meridian Textiles Pvt Ltd, cotton yarn dyeing and knitted fabric finishing for export brands.
Sites: Unit 1 Dyeing House, SIPCOT Perundurai, Erode, Tamil Nadu (dyeing and finishing); Unit 2 Effluent Treatment Plant and Warehouse, same campus (ETP, chemical and finished goods storage); Head Office, Avinashi Road, Coimbatore (administration, HR, procurement, IT).
Departments: EHS, Production, Quality, HR, Procurement, Finance, IT, Administration.
Manual: MTPL/SOP/01, Revision 01.`;

const SOPS = [
  { code: "MTPL-EHS-001", title: "Waste Segregation and Disposal", pillar: "E", department: "EHS", owner: "EHS Manager" },
  { code: "MTPL-EHS-002", title: "Hazardous Chemical Storage and Handling", pillar: "E", department: "EHS", owner: "EHS Manager" },
  { code: "MTPL-PRD-001", title: "Energy Efficiency in Dyeing Operations", pillar: "E", department: "Production", owner: "Production Head" },
  { code: "MTPL-EHS-003", title: "Water Conservation and Effluent Treatment", pillar: "E", department: "EHS", owner: "ETP In-charge" },
  { code: "MTPL-EHS-004", title: "Air Emissions Monitoring", pillar: "E", department: "EHS", owner: "EHS Manager" },
  { code: "MTPL-EHS-005", title: "Workplace Safety Incident Reporting", pillar: "S", department: "EHS", owner: "Safety Officer" },
  { code: "MTPL-HR-001", title: "Recruitment and Onboarding", pillar: "S", department: "HR", owner: "HR Manager" },
  { code: "MTPL-HR-002", title: "Employee Performance Evaluation", pillar: "S", department: "HR", owner: "HR Manager" },
  { code: "MTPL-HR-003", title: "Grievance Handling", pillar: "S", department: "HR", owner: "HR Manager" },
  { code: "MTPL-FIN-001", title: "Approval of Sensitive Transactions", pillar: "G", department: "Finance", owner: "Chief Financial Officer" },
  { code: "MTPL-IT-001", title: "Confidential Data Breach Response", pillar: "G", department: "IT", owner: "IT Manager" },
  { code: "MTPL-PUR-001", title: "Supplier ESG Due Diligence", pillar: "G", department: "Procurement", owner: "Procurement Head" },
] as const;

async function writeSop(sop: (typeof SOPS)[number]) {
  const { text } = await streamClaudeText({
    system: SYSTEM,
    cachedContext: COMPANY,
    user: `Write the SOP "${sop.title}" (${sop.code}, owned by the ${sop.owner}, ${sop.department} department). Include 4-7 definitions, 4-6 roles, 5-8 procedure steps (each body 2-4 sentences, 0-3 short substeps), 4-6 KPIs, 3-5 records, 2-4 references to internal documents or recognised standards by name only.`,
    maxTokens: 6_000,
    effort: "low",
    format: zodOutputFormat(SampleSop),
  }, () => {});
  return { ...sop, ...SampleSop.parse(JSON.parse(text)) };
}

async function pool<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
      console.log(`  done ${index + 1}/${items.length}: ${(items[index] as { title?: string }).title ?? index}`);
    }
  }));
  return results;
}

async function main() {
  const started = performance.now();
  const [front, sops] = await Promise.all([
    streamClaudeText({
      system: SYSTEM,
      cachedContext: COMPANY,
      user: "Write the SOP manual's front matter: a 2-3 paragraph introduction, the objective of the manual, 5-6 expected benefits, 4 core values with one-sentence descriptions, a short how-to-use paragraph, a review mechanism paragraph and a one-sentence approval statement.",
      maxTokens: 4_000,
      effort: "low",
      format: zodOutputFormat(FrontMatter),
    }, () => {}).then((result) => FrontMatter.parse(JSON.parse(result.text))),
    pool(SOPS, 5, writeSop),
  ]);
  mkdirSync("lib/sop/fixtures", { recursive: true });
  writeFileSync("lib/sop/fixtures/sample-manual.json", `${JSON.stringify({ front, sops }, null, 2)}\n`);
  console.log(`Wrote ${sops.length} SOPs in ${((performance.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
