import fs from "fs";
import path from "path";
import OpenAI from "openai";
import mammoth from "mammoth";
import dotenv from "dotenv";
// @ts-expect-error package has no declaration
import WordExtractor from "word-extractor";
import { getPolicyProfile } from "../lib/constants";

dotenv.config({ path: path.join(__dirname, "../.env") });
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const root = path.join(__dirname, "../..");
const seedDir = path.join(__dirname, "../data/seed-policies");
const roots = ["KUSH", "Kenal - EcoVadis Policies", "Hetvi- Policies"];
const relevant = /(sustain.*procure|green.*procure|responsible.*sourc|supply chain|supplier|procurement)/i;

function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function walk(dir: string, all: string[] = []): string[] {
  if (!fs.existsSync(dir)) return all;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file, all); } else { all.push(file); }
  }
  return all;
}
async function text(file: string) {
  if (/\.docx$/i.test(file)) return (await mammoth.extractRawText({ path: file })).value;
  return (await new WordExtractor().extract(file)).getBody();
}
function paragraphs(value: unknown, fallback = "") {
  return Array.isArray(value) ? value.map(String).map(x => x.trim()).filter(Boolean).join("\n\n") || fallback : typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function prompt() {
  return `You are an expert policy-document parser. Extract the Sustainable Procurement Policy text into valid JSON only. Preserve source paragraphs verbatim; never summarize or invent. Do not include table-of-contents, acknowledgements, signatures, or revision history. Keep all meaningful commitments. Extract quantitative targets only when measurable or time-bound; preserve complete wording and include baseline/deadline only where stated.
Schema: {"company":{"address":"string","sites":[{"location":"string","address":"string","primaryFunction":"string"}]},"declaration":{"preface_paragraphs":["string"],"declaration_paragraphs":["string"],"scope_paragraphs":["string"]},"focusAreas":["string"],"qualitative":{"Focus Area":["string"]},"quantitative":[{"area":"string","targets":[{"target":"string","baseline":"string","deadline":"string"}]}],"sdgs":[1],"responsibilities":[{"role":"string","duty":"string"}],"monitoring_paragraphs":["string"],"reviewMechanism_paragraphs":["string"]}`;
}
async function parse(file: string) {
  const company = path.basename(path.dirname(file));
  const seed = path.join(seedDir, `sustainable-procurement-${slug(company)}.json`);
  const source = await text(file);
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt() },
      { role: "user", content: `Company: ${company}\nFile: ${path.basename(file)}\n\nPolicy text:\n${source}` }
    ]
  });
  const data = JSON.parse(response.choices[0].message.content || "{}") as Record<string, any>;

  const defaultProfile = getPolicyProfile("sustainable-procurement");
  let existing: any = null;
  if (fs.existsSync(seed)) {
    existing = JSON.parse(fs.readFileSync(seed, "utf8"));
  } else {
    // try finding base company seed to copy company meta
    const baseFiles = fs.readdirSync(seedDir);
    const baseMatch = baseFiles.find(f => f.includes(slug(company)) && !f.startsWith("labour-") && !f.startsWith("living-") && !f.startsWith("ethics-") && !f.startsWith("sustainable-"));
    const baseObj = baseMatch ? JSON.parse(fs.readFileSync(path.join(seedDir, baseMatch), "utf8")) : null;

    existing = {
      id: `sustainable-procurement-${slug(company)}`,
      name: company,
      industry: "Source policy template",
      summary: `Parsed Sustainable Procurement Policy template from ${path.basename(file)}.`,
      tagline: "Sustainable Procurement Policy",
      policy: {
        policyType: "sustainable-procurement",
        company: baseObj?.policy?.company || { name: company, industry: "", site: "", sites: [], docNum: "SP-001", revNum: "01", effectiveDate: "", reviewDate: "", approver: "" },
        standards: defaultProfile.standards,
        declaration: { preface: "", declaration: "", scope: "" },
        focusAreas: defaultProfile.focusAreas,
        qualitative: {},
        quantitative: [],
        sdgs: defaultProfile.sdgs,
        responsibilities: defaultProfile.responsibilities,
        monitoring: "",
        reviewMechanism: ""
      }
    };
  }

  const old = existing.policy;
  existing.policy = {
    ...old,
    policyType: "sustainable-procurement",
    company: {
      ...old.company,
      ...(data.company?.address ? { address: data.company.address, site: data.company.address } : {}),
      ...(data.company?.sites?.length ? { sites: data.company.sites } : {})
    },
    declaration: {
      preface: paragraphs(data.declaration?.preface_paragraphs, old.declaration?.preface),
      declaration: paragraphs(data.declaration?.declaration_paragraphs, old.declaration?.declaration),
      scope: paragraphs(data.declaration?.scope_paragraphs, old.declaration?.scope)
    },
    focusAreas: data.focusAreas?.length ? data.focusAreas : old.focusAreas,
    qualitative: Object.keys(data.qualitative || {}).length ? data.qualitative : old.qualitative,
    quantitative: data.quantitative?.length ? data.quantitative : old.quantitative,
    sdgs: data.sdgs?.length ? data.sdgs : old.sdgs,
    responsibilities: data.responsibilities?.length ? data.responsibilities : old.responsibilities,
    monitoring: paragraphs(data.monitoring_paragraphs, old.monitoring),
    reviewMechanism: paragraphs(data.reviewMechanism_paragraphs, old.reviewMechanism)
  };
  existing.summary = `Parsed Sustainable Procurement Policy template from ${path.basename(file)}.`;
  existing.sourcePath = path.relative(root, file);
  existing.sourceTextLength = source.length;
  existing.parsedAt = new Date().toISOString();

  fs.writeFileSync(seed, JSON.stringify(existing, null, 2));
  console.log(`Parsed ${path.basename(seed)}`);
}

async function main() {
  const candidates = roots
    .flatMap(folder => walk(path.join(root, folder)))
    .filter(file => /\.(docx|doc)$/i.test(file) && !/^~\$|^~wrl/i.test(path.basename(file)) && relevant.test(path.basename(file)));

  console.log(`Found ${candidates.length} candidate Sustainable Procurement documents.`);
  const batchSize = Number(process.env.PARSE_BATCH || 20);
  const files = candidates.slice(0, batchSize);
  for (const file of files) {
    try {
      await parse(file);
    } catch (err) {
      console.error(`Error parsing ${file}:`, err);
    }
  }
  console.log(`Completed Sustainable Procurement policy seeds in this batch.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
