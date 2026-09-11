import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";
import mammoth from "mammoth";
import dotenv from "dotenv";
// @ts-expect-error package has no declaration
import WordExtractor from "word-extractor";
import { getPolicyProfile } from "../lib/constants";
import type { PolicyType } from "../lib/types";

dotenv.config({ path: path.join(__dirname, "../.env") });

const ROOT = path.join(__dirname, "../..");
const SEED_DIR = path.join(__dirname, "../data/seed-policies");
const MODEL = "gpt-5.6-luna";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const execFileAsync = promisify(execFile);

type SourceGroup = "KUSH" | "Kenal" | "Hetvi";

type SourceRoot = {
  group: SourceGroup;
  directory: string;
};

type Candidate = {
  file: string;
  company: string;
  sourceGroup: SourceGroup;
  policyType: PolicyType;
};

type Seed = Record<string, any> & {
  id: string;
  name: string;
  policy: Record<string, any>;
};

const SOURCE_ROOTS: SourceRoot[] = [
  { group: "KUSH", directory: path.join(ROOT, "KUSH_Policies", "KUSH") },
  { group: "Kenal", directory: path.join(ROOT, "Policies - Kenal") },
  { group: "Hetvi", directory: path.join(ROOT, "Polices- All Comapnies Hetvi", "All Company- Polices") },
];

const POLICY_TYPES: PolicyType[] = [
  "environmental",
  "labour-human-rights",
  "living-wage",
  "ethics",
  "sustainable-procurement",
];

const ENVIRONMENTAL_SEED_ALIASES: Record<string, string> = {
  ctx: "environmental/ctx-lifesciences-pvt-ltd.json",
  excel: "environmental/excel-industries-limited.json",
  pispl: "environmental/parekh-integrated-services-pvt-ltd.json",
  vasudapharma: "environmental/vasudha-pharma-chem-ltd.json",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function walk(directory: string, files: string[] = []): string[] {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function inferPolicyType(fileName: string): PolicyType | undefined {
  const name = fileName.toLowerCase();

  if (/living wage|fair wage|fair wages|living wges/.test(name)) return "living-wage";
  if (/labou?r|human rights|workforce|employee rights|workplace rights|social justice|social responsibility|equal opportunity|fair labor|labou?r practices|welfare|inclusive workplace|social policy/.test(name)) {
    return "labour-human-rights";
  }
  if (/ethic|ethical|integrity|governance|anti.?corrupt|business conduct|compliance|fair business|information security|business practices/.test(name)) {
    return "ethics";
  }
  if (/procure|sourcing|supply chain|supplier|purchasing|conflict mineral/.test(name)) return "sustainable-procurement";
  if (/environ|green|sustainab|ehs|roadmap|stewardship|climate|api discharge|pharmaceutical discharges|esg|integrated env/.test(name)) {
    return "environmental";
  }

  return undefined;
}

function displayCompany(directory: string, root: string): { name: string } {
  const relative = path.relative(root, directory);
  const company = relative.split(path.sep)[0] || path.basename(directory);
  return { name: company };
}

function candidatesFromRoot(sourceRoot: SourceRoot): Candidate[] {
  return walk(sourceRoot.directory)
    .filter((file) => /\.(docx?|pdf)$/i.test(file))
    .filter((file) => !/^~\$|^~wrl/i.test(path.basename(file)))
    .flatMap((file) => {
      const policyType = inferPolicyType(path.basename(file));
      if (!policyType) return [];
      const companyInfo = displayCompany(path.dirname(file), sourceRoot.directory);
      return [{
        file,
        company: companyInfo.name,
        sourceGroup: sourceRoot.group,
        policyType,
      }];
    });
}

function candidateRank(file: string): number {
  const name = path.basename(file).toLowerCase();
  let rank = fs.statSync(file).size / 1_000_000;
  if (/final|approved|updated|revised|latest|v2|2026|2025/.test(name)) rank += 4;
  if (/draft|old|superseded|copy|acknowledge/.test(name)) rank -= 2;
  return rank;
}

function choosePrimaryCandidates(candidates: Candidate[]): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.sourceGroup}|${slug(candidate.company)}|${candidate.policyType}`;
    const group = groups.get(key) || [];
    group.push(candidate);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => group.sort((a, b) => {
    const rank = candidateRank(b.file) - candidateRank(a.file);
    return rank || a.file.localeCompare(b.file);
  })[0]);
}

async function extractText(file: string): Promise<string> {
  if (/\.docx$/i.test(file)) return (await mammoth.extractRawText({ path: file })).value;
  if (/\.doc$/i.test(file)) return (await new WordExtractor().extract(file)).getBody();

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join("\n\n");
}

async function renderPdfImages(file: string): Promise<string[]> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "policy-seed-pdf-"));
  const prefix = path.join(directory, "page");
  try {
    await execFileAsync("pdftoppm", ["-png", "-r", "110", file, prefix], { windowsHide: true });
    return fs.readdirSync(directory)
      .filter((name) => name.endsWith(".png"))
      .sort()
      .map((name) => `data:image/png;base64,${fs.readFileSync(path.join(directory, name)).toString("base64")}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function paragraphs(value: unknown, fallback = ""): string {
  if (Array.isArray(value)) {
    const result = value.map(String).map((item) => item.trim()).filter(Boolean).join("\n\n");
    return result || fallback;
  }
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sourcePrompt(policyType: PolicyType): string {
  const profile = getPolicyProfile(policyType);
  const methodology = policyType === "living-wage"
    ? ` Also extract the living-wage definition, benchmark methodology, remuneration coverage, and review basis into definitions_paragraphs.`
    : "";
  return `You are an expert ${profile.label} policy parser. Extract the supplied source document into valid JSON only. Preserve meaningful source wording verbatim; never summarize, invent, or copy facts from another company. Omit tables of contents, acknowledgements, signatures, and revision history. Keep every meaningful commitment. Return arrays even when empty.${methodology}

Schema:
{
  "company": {"name": "string", "address": "string", "sites": [{"location": "string", "address": "string", "primaryFunction": "string"}]},
  "declaration": {"preface_paragraphs": ["string"], "declaration_paragraphs": ["string"], "scope_paragraphs": ["string"]},
  "definitions_paragraphs": ["string"],
  "focusAreas": ["string"],
  "qualitative": {"Focus Area": ["string"]},
  "quantitative": [{"area": "string", "targets": [{"target": "string", "baseline": "string", "deadline": "string"}]}],
  "sdgs": [1],
  "responsibilities": [{"role": "string", "duty": "string"}],
  "monitoring_paragraphs": ["string"],
  "reviewMechanism_paragraphs": ["string"]
}`;
}

function allSeedFiles(): string[] {
  return walk(SEED_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.relative(SEED_DIR, file));
}

function matchScore(company: string, seed: Seed): number {
  const source = normalize(company);
  const scoreName = (name: string): number => {
    const candidate = normalize(name);
    if (!candidate) return 0;
    if (candidate === source) return 100;
    if (candidate.includes(source) || source.includes(candidate)) return Math.min(source.length, candidate.length) >= 6 ? 80 : 0;
    return 0;
  };

  const displayScore = typeof seed.name === "string" ? scoreName(seed.name) : 0;
  return displayScore;
}

function findExistingSeed(company: string, policyType: PolicyType): { file: string; seed: Seed } | undefined {
  if (policyType === "environmental") {
    const aliasFile = ENVIRONMENTAL_SEED_ALIASES[normalize(company)];
    if (aliasFile && fs.existsSync(path.join(SEED_DIR, aliasFile))) {
      try {
        const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, aliasFile), "utf8")) as Seed;
        if (seed.policy?.policyType === policyType) return { file: aliasFile, seed };
      } catch {
        // Fall through to normal matching when the aliased seed is invalid.
      }
    }
  }

  const matches = allSeedFiles().flatMap((file) => {
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), "utf8")) as Seed;
      return seed.policy?.policyType === policyType ? [{ file, seed, score: matchScore(company, seed) }] : [];
    } catch {
      return [];
    }
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return matches[0] && { file: matches[0].file, seed: matches[0].seed };
}

function findCompanySeed(company: string): Seed | undefined {
  return allSeedFiles().flatMap((file) => {
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), "utf8")) as Seed;
      return matchScore(company, seed) > 0 ? [seed] : [];
    } catch {
      return [];
    }
  })[0];
}

function createSeed(company: string, policyType: PolicyType): Seed {
  const profile = getPolicyProfile(policyType);
  const base = findCompanySeed(company);
  const id = `${policyType === "environmental" ? "" : `${policyType}-`}${slug(company)}`;
  return {
    id,
    name: base?.name || company,
    industry: base?.industry || "Source policy template",
    summary: `Parsed ${profile.label} from a source policy document.`,
    tagline: profile.label,
    policy: {
      policyType,
      company: base?.policy?.company || {
        name: company,
        industry: "",
        site: "",
        sites: [],
        docNum: `${profile.documentPrefix}-001`,
        revNum: "01",
        effectiveDate: "",
        reviewDate: "",
        approver: "",
      },
      standards: profile.standards,
      declaration: { preface: "", declaration: "", scope: "" },
      ...(policyType === "living-wage" ? { definitions: { title: "Living Wage Definition & Methodology", content: "" } } : {}),
      focusAreas: profile.focusAreas,
      qualitative: {},
      quantitative: [],
      sdgs: profile.sdgs,
      responsibilities: profile.responsibilities,
      monitoring: "",
      reviewMechanism: "",
    },
  };
}

function mergeParsed(seed: Seed, policyType: PolicyType, parsed: Record<string, any>, source: Candidate, sourceTextLength: number): Seed {
  const profile = getPolicyProfile(policyType);
  const old = seed.policy || {};
  const parsedQualitative = parsed.qualitative && typeof parsed.qualitative === "object" ? parsed.qualitative : undefined;
  const parsedCompany = parsed.company && typeof parsed.company === "object" ? parsed.company : {};
  const company = {
    ...(old.company || {}),
    ...(typeof parsedCompany.name === "string" && parsedCompany.name.trim() ? { name: parsedCompany.name.trim() } : {}),
    ...(typeof parsedCompany.address === "string" && parsedCompany.address.trim() ? { address: parsedCompany.address.trim(), site: parsedCompany.address.trim() } : {}),
    ...(Array.isArray(parsedCompany.sites) && parsedCompany.sites.length ? { sites: parsedCompany.sites } : {}),
  };

  const next: Seed = {
    ...seed,
    name: seed.name || company.name || source.company,
    summary: `Parsed ${profile.label} from ${path.basename(source.file)}.`,
    tagline: seed.tagline || profile.label,
    policy: {
      ...old,
      policyType,
      company,
      standards: old.standards?.length ? old.standards : profile.standards,
      declaration: {
        ...(old.declaration || {}),
        preface: paragraphs(parsed.declaration?.preface_paragraphs, old.declaration?.preface),
        declaration: paragraphs(parsed.declaration?.declaration_paragraphs, old.declaration?.declaration),
        scope: paragraphs(parsed.declaration?.scope_paragraphs, old.declaration?.scope),
      },
      ...(policyType === "living-wage" ? {
        definitions: {
          ...(old.definitions || { title: "Living Wage Definition & Methodology" }),
          content: paragraphs(parsed.definitions_paragraphs, old.definitions?.content),
        },
      } : {}),
      focusAreas: Array.isArray(parsed.focusAreas) && parsed.focusAreas.length ? parsed.focusAreas : (old.focusAreas || profile.focusAreas),
      qualitative: parsedQualitative && Object.keys(parsedQualitative).length ? parsedQualitative : (old.qualitative || {}),
      quantitative: Array.isArray(parsed.quantitative) ? parsed.quantitative : (old.quantitative || []),
      sdgs: Array.isArray(parsed.sdgs) && parsed.sdgs.length ? parsed.sdgs : (old.sdgs || profile.sdgs),
      responsibilities: Array.isArray(parsed.responsibilities) && parsed.responsibilities.length ? parsed.responsibilities : (old.responsibilities || profile.responsibilities),
      monitoring: paragraphs(parsed.monitoring_paragraphs, old.monitoring),
      reviewMechanism: paragraphs(parsed.reviewMechanism_paragraphs, old.reviewMechanism),
    },
    sourcePath: path.relative(ROOT, source.file).replaceAll(path.sep, "/"),
    sourceFiles: [path.relative(ROOT, source.file).replaceAll(path.sep, "/")],
    sourceGroup: source.sourceGroup,
    sourceTextLength,
    parsedAt: new Date().toISOString(),
  };
  return next;
}

function seedFileName(company: string, policyType: PolicyType): string {
  const fileName = `${policyType === "environmental" ? "" : `${policyType}-`}${slug(company)}.json`;
  return path.join(policyType, fileName);
}

async function parseCandidate(source: Candidate): Promise<void> {
  const sourcePath = path.relative(ROOT, source.file).replaceAll(path.sep, "/");
  const existing = findExistingSeed(source.company, source.policyType);
  if (existing?.seed.sourcePath === sourcePath && existing.seed.sourceGroup === source.sourceGroup) {
    console.log(`[SKIP] ${source.sourceGroup} ${source.company} / ${source.policyType} already imported -> ${existing.file}`);
    return;
  }

  const sourceText = await extractText(source.file);
  const isScannedPdf = /\.pdf$/i.test(source.file) && !sourceText.trim();
  if (!sourceText.trim() && !isScannedPdf) throw new Error("source document contains no extractable text");

  const userContent: any[] = [{
    type: "text",
    text: `Company folder: ${source.company}\nSource file: ${path.basename(source.file)}${sourceText.trim() ? `\n\nPolicy text:\n${sourceText}` : "\n\nThe attached page images are the complete scanned policy. Read them in order and extract the policy content."}`,
  }];
  if (isScannedPdf) {
    userContent.push(...(await renderPdfImages(source.file)).map((url) => ({ type: "image_url", image_url: { url } })));
  }

  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sourcePrompt(source.policyType) },
      { role: "user", content: userContent },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("model returned no JSON content");
  const parsed = JSON.parse(content) as Record<string, any>;

  const seed = mergeParsed(existing?.seed || createSeed(source.company, source.policyType), source.policyType, parsed, source, sourceText.length || fs.statSync(source.file).size);
  const outputName = existing?.file || seedFileName(source.company, source.policyType);
  const outputPath = path.join(SEED_DIR, outputName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`[${source.sourceGroup}] ${source.company} / ${source.policyType} -> ${outputName}`);
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set in src/.env or the process environment");
  fs.mkdirSync(SEED_DIR, { recursive: true });

  const allCandidates = SOURCE_ROOTS.flatMap(candidatesFromRoot);
  const companyFilter = process.env.PARSE_COMPANY?.split(",").map((value) => normalize(value.trim())).filter(Boolean);
  const selected = choosePrimaryCandidates(allCandidates)
    .filter((candidate) => !companyFilter?.length || companyFilter.includes(normalize(candidate.company)));
  const limit = Number(process.env.PARSE_BATCH || selected.length);
  const batch = selected.slice(0, limit);
  const concurrency = Math.max(1, Number(process.env.PARSE_CONCURRENCY || 3));
  console.log(`Found ${allCandidates.length} supported source documents; selected ${selected.length} company/type imports; processing ${batch.length} with ${MODEL} (concurrency ${concurrency}).`);

  let completed = 0;
  let failed = 0;
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < batch.length) {
      const candidate = batch[nextIndex];
      nextIndex += 1;
      try {
        await parseCandidate(candidate);
        completed += 1;
      } catch (error) {
        failed += 1;
        console.error(`[FAILED] ${candidate.file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, () => worker()));
  console.log(`Completed ${completed} imports; ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
