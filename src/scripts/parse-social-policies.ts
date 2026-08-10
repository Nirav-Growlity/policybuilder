import fs from "fs";
import path from "path";
import OpenAI from "openai";
import mammoth from "mammoth";
import dotenv from "dotenv";
// @ts-expect-error package has no declaration
import WordExtractor from "word-extractor";

dotenv.config({ path: path.join(__dirname, "../.env") });
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const root = path.join(__dirname, "../..");
const seedDir = path.join(__dirname, "../data/seed-policies");
const roots = ["KUSH", "Kenal - EcoVadis Policies", "Hetvi- Policies"];
const relevant = /(labou?r|human rights|workforce|employee rights|workplace rights|living wage|fair wage|social policy|responsible workforce)/i;
const wage = /(living wage|fair wage)/i;
type Type = "labour-human-rights" | "living-wage";

function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function walk(dir: string, all: string[] = []): string[] { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); entry.isDirectory() ? walk(file, all) : all.push(file); } return all; }
async function text(file: string) { if (/\.docx$/i.test(file)) return (await mammoth.extractRawText({ path: file })).value; return (await new WordExtractor().extract(file)).getBody(); }
function paragraphs(value: unknown, fallback = "") { return Array.isArray(value) ? value.map(String).map(x => x.trim()).filter(Boolean).join("\n\n") || fallback : typeof value === "string" && value.trim() ? value.trim() : fallback; }
function prompt(type: Type) {
  const title = type === "living-wage" ? "Living Wage Policy" : "Labour and Human Rights Policy";
  return `You are an expert policy-document parser. Extract the ${title} text into valid JSON only. Preserve source paragraphs verbatim; never summarize or invent. Do not include table-of-contents, acknowledgements, signatures, or revision history. Keep all meaningful commitments. Extract quantitative targets only when measurable or time-bound; preserve complete wording and include baseline/deadline only where stated. For Living Wage, extract the wage definition, benchmark methodology, remuneration coverage, and review basis into definitions_paragraphs. Schema: {"company":{"address":"string","sites":[{"location":"string","address":"string","primaryFunction":"string"}]},"declaration":{"preface_paragraphs":["string"],"declaration_paragraphs":["string"],"scope_paragraphs":["string"]},"definitions_paragraphs":["string"],"focusAreas":["string"],"qualitative":{"Focus Area":["string"]},"quantitative":[{"area":"string","targets":[{"target":"string","baseline":"string","deadline":"string"}]}],"sdgs":[1],"responsibilities":[{"role":"string","duty":"string"}],"monitoring_paragraphs":["string"],"reviewMechanism_paragraphs":["string"]}`;
}
async function parse(file: string) {
  const type: Type = wage.test(path.basename(file)) ? "living-wage" : "labour-human-rights";
  const company = path.basename(path.dirname(file));
  const seed = path.join(seedDir, `${type}-${slug(company)}.json`);
  const source = await text(file);
  const response = await client.chat.completions.create({ model: "gpt-5.6-luna", response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt(type) }, { role: "user", content: `Company: ${company}\nFile: ${path.basename(file)}\n\nPolicy text:\n${source}` }] });
  const data = JSON.parse(response.choices[0].message.content || "{}") as Record<string, any>;
  const existing = JSON.parse(fs.readFileSync(seed, "utf8"));
  const old = existing.policy;
  existing.policy = {
    ...old, policyType: type,
    company: { ...old.company, ...(data.company?.address ? { address: data.company.address, site: data.company.address } : {}), ...(data.company?.sites?.length ? { sites: data.company.sites } : {}) },
    declaration: { preface: paragraphs(data.declaration?.preface_paragraphs, old.declaration?.preface), declaration: paragraphs(data.declaration?.declaration_paragraphs, old.declaration?.declaration), scope: paragraphs(data.declaration?.scope_paragraphs, old.declaration?.scope) },
    ...(type === "living-wage" ? { definitions: { title: "Living Wage Definition & Methodology", content: paragraphs(data.definitions_paragraphs, old.definitions?.content) } } : {}),
    focusAreas: data.focusAreas?.length ? data.focusAreas : old.focusAreas, qualitative: Object.keys(data.qualitative || {}).length ? data.qualitative : old.qualitative, quantitative: data.quantitative?.length ? data.quantitative : old.quantitative, sdgs: data.sdgs?.length ? data.sdgs : old.sdgs, responsibilities: data.responsibilities?.length ? data.responsibilities : old.responsibilities,
    monitoring: paragraphs(data.monitoring_paragraphs, old.monitoring), reviewMechanism: paragraphs(data.reviewMechanism_paragraphs, old.reviewMechanism),
  };
  existing.summary = `Parsed ${type === "living-wage" ? "Living Wage" : "Labour & Human Rights"} template from ${path.basename(file)}.`;
  existing.sourcePath = path.relative(root, file); existing.sourceTextLength = source.length; existing.parsedAt = new Date().toISOString();
  fs.writeFileSync(seed, JSON.stringify(existing, null, 2)); console.log(`Parsed ${path.basename(seed)}`);
}
async function main() {
  const candidates = roots.flatMap(folder => walk(path.join(root, folder))).filter(file => /\.(docx|doc)$/i.test(file) && !/^~\$|^~wrl/i.test(path.basename(file)) && relevant.test(path.basename(file)));
  const batchSize = Number(process.env.PARSE_BATCH || 4);
  const files = candidates.filter((file) => {
    const type: Type = wage.test(path.basename(file)) ? "living-wage" : "labour-human-rights";
    const seed = path.join(seedDir, `${type}-${slug(path.basename(path.dirname(file)))}.json`);
    return !JSON.parse(fs.readFileSync(seed, "utf8")).parsedAt;
  }).slice(0, batchSize);
  await Promise.all(files.map(parse));
  console.log(`Completed ${files.length} structured social-policy seeds in this batch.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
