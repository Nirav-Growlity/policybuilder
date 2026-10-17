// Speed and quality check for Claude Haiku 5.5 writing one SOP as structured JSON.
// Run (needs ANTHROPIC_API_KEY in .env): npx tsx scripts/claude-spike.ts
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { estimateTokens, streamClaudeText, type ClaudeEffort } from "../lib/ai/claude";

const SpikeSop = z.object({
  title: z.string(),
  purpose: z.string(),
  scope: z.string(),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })),
  responsibilities: z.array(z.object({ role: z.string(), responsibilities: z.array(z.string()) })),
  procedure: z.array(z.object({ heading: z.string(), body: z.string(), responsible: z.string() })),
  kpis: z.array(z.object({ indicator: z.string(), target: z.string(), frequency: z.string(), owner: z.string() })),
  records: z.array(z.object({ record: z.string(), owner: z.string(), retention: z.string() })),
  review: z.string(),
});

const SYSTEM = `You are a senior ESG and operations consultant who writes Standard Operating Procedures for company SOP manuals. Write formal, specific, audit-ready procedures in British English. Use the company's industry, sites and departments. Never invent laws, certificates or figures the company did not give; describe the control instead.`;

const CONTEXT = `COMPANY: Acme Textiles Pvt Ltd, textile dyeing and finishing, Tiruppur (India). Sites: Unit 1 dyeing house, Unit 2 ETP and warehouse. Departments: EHS, Production, HR, Procurement, Admin, IT. Manual Doc No ACME/SOP/01, Rev 01.`;

async function run(topic: string, effort: ClaudeEffort) {
  const user = `Write the SOP "${topic}". Include 5-8 definitions, 4-6 roles, 6-9 procedure steps, 4-6 KPIs and 3-5 records. Each procedure step body is 2-4 sentences.`;
  const started = performance.now();
  let firstTokenAt = 0;
  const result = await streamClaudeText(
    { system: SYSTEM, cachedContext: CONTEXT, user, maxTokens: 6_000, effort, format: zodOutputFormat(SpikeSop) },
    () => { firstTokenAt ||= performance.now(); },
  );
  const total = performance.now() - started;
  const parsed = SpikeSop.safeParse(JSON.parse(result.text));
  console.log(
    `${topic} @ ${effort}: first text ${((firstTokenAt - started) / 1000).toFixed(1)}s, total ${(total / 1000).toFixed(1)}s, ` +
    `in=${result.usage.input_tokens} (est ${estimateTokens(SYSTEM + CONTEXT + user)}) cacheRead=${result.usage.cache_read_input_tokens ?? 0} ` +
    `out=${result.usage.output_tokens}, words=${result.text.split(/\s+/).length}, schema ${parsed.success ? "ok" : "FAILED"}`,
  );
  mkdirSync(".scratch", { recursive: true });
  writeFileSync(`.scratch/claude-spike-${topic.replace(/\W+/g, "-")}-${effort}.json`, result.text);
}

async function main() {
  for (const effort of ["low", "medium"] as const) {
    await run("Waste Segregation and Disposal", effort);
    await run("Approval of Sensitive Transactions", effort);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
