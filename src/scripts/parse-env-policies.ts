import fs from "fs";
import path from "path";
import OpenAI from "openai";
import mammoth from "mammoth";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env") });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DATA_DIR = path.join(__dirname, "../data/seed-policies");
const ROOT_DOCS_DIR = path.join(__dirname, "../../");

const MAPPING: { json: string; dir: string; baseDir: string }[] = [
  // Hetvi
  { json: "allchem-lifescience-pvt-ltd.json", dir: "Allchem", baseDir: "Hetvi- Policies" },
  { json: "cherry-hill-interiors-pvt-ltd.json", dir: "Cherry Hill", baseDir: "Hetvi- Policies" },
  { json: "ctx-lifesciences-pvt-ltd.json", dir: "CTX", baseDir: "Hetvi- Policies" },
  { json: "kraftwares.json", dir: "Kraftwares", baseDir: "Hetvi- Policies" },
  { json: "naxpar-pharma-pvt-ltd.json", dir: "Naxpar", baseDir: "Hetvi- Policies" },
  { json: "renewsys.json", dir: "Renewsys", baseDir: "Hetvi- Policies" },
  { json: "yash-speciality-chemicals-llp.json", dir: "Yash Speciality", baseDir: "Hetvi- Policies" },

  // Kenal
  { json: "20-microns.json", dir: "20 Microns", baseDir: "Kenal - EcoVadis Policies" },
  { json: "anupam-rasayan.json", dir: "Anupam Rasayan", baseDir: "Kenal - EcoVadis Policies" },
  { json: "excel-industries-limited.json", dir: "Excel", baseDir: "Kenal - EcoVadis Policies" },
  { json: "ganges-jute-pvt-ltd.json", dir: "Ganges", baseDir: "Kenal - EcoVadis Policies" },
  { json: "arminak-solutions-llc-dba-kbl-cosmetics.json", dir: "KBL Cosmetic dba Arminak Solution", baseDir: "Kenal - EcoVadis Policies" },
  { json: "prestige-promotion.json", dir: "Prestige Promotion", baseDir: "Kenal - EcoVadis Policies" },
  { json: "quality-rubbers.json", dir: "Quality Rubbers", baseDir: "Kenal - EcoVadis Policies" },
  { json: "sri-all-india-exports.json", dir: "Sri All India", baseDir: "Kenal - EcoVadis Policies" },

  // Kush
  { json: "drt-anthea-aroma-chemicals-pvt-ltd.json", dir: "Anthea Group", baseDir: "KUSH" },
  { json: "mewburn-ellis-llp.json", dir: "MEWBURN", baseDir: "KUSH" },
  { json: "parekh-integrated-services-pvt-ltd.json", dir: "PISPL", baseDir: "KUSH" },
  { json: "riya-travels.json", dir: "RIYA TRAVELS", baseDir: "KUSH" },
  { json: "rl-finechem.json", dir: "RL FINECHEM", baseDir: "KUSH" },
  { json: "shilpa-medicare-limited.json", dir: "Shilpa Medicare Ltd", baseDir: "KUSH" },
  { json: "vasudha-pharma-chem-ltd.json", dir: "Vasuda Pharma", baseDir: "KUSH" }
];

// @ts-expect-error - no types for word-extractor
import WordExtractor from "word-extractor";

async function extractTextFromDocx(filePath: string) {
  if (filePath.endsWith(".doc")) {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(filePath);
    return doc.getBody();
  } else {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
}

const SYSTEM_PROMPT = `You are an expert document parser. Extract the sections of the Environmental Policy text provided and map them to the following JSON schema. 

CRITICAL INSTRUCTIONS FOR PARAGRAPHS:
1. Extract ALL paragraphs verbatim. DO NOT summarize or truncate.
2. For preface, declaration, scope, monitoring, and reviewMechanism, output them as an ARRAY OF STRINGS (where each string element is ONE paragraph). 
3. DO NOT combine paragraphs into a single string element. If Preface has 3 paragraphs, preface_paragraphs MUST contain 3 separate string items.
4. For qualitative: For EVERY focus area, extract ALL qualitative goals and bullet points mentioned in the text for that area.
5. For quantitative: Extract ALL measurable/numerical targets for each focus area.
6. For responsibilities: Extract ALL role and duty pairs listed in the document.

Schema format (Output ONLY valid JSON, no markdown blocks):
{
  "declaration": {
    "preface_paragraphs": ["string array of verbatim paragraphs in preface/introduction/preamble"],
    "declaration_paragraphs": ["string array of verbatim paragraphs in policy declaration/statement/aims"],
    "scope_paragraphs": ["string array of verbatim paragraphs in scope/applicability"]
  },
  "focusAreas": ["string array of focus area titles"],
  "qualitative": {
    "Focus Area Title": ["string array of ALL qualitative goals for this area"]
  },
  "quantitative": [
    {
      "area": "Focus Area Title",
      "targets": [
        {
          "target": "string",
          "baseline": "string",
          "deadline": "string"
        }
      ]
    }
  ],
  "responsibilities": [
    {
      "role": "string",
      "duty": "string"
    }
  ],
  "monitoring_paragraphs": ["string array of verbatim paragraphs"],
  "reviewMechanism_paragraphs": ["string array of verbatim paragraphs"]
}`;

async function main() {
  for (const { json: jsonFile, dir: dirName, baseDir } of MAPPING) {
    const jsonPath = path.join(DATA_DIR, jsonFile);
    if (!fs.existsSync(jsonPath)) continue;

    const companyDir = path.join(ROOT_DOCS_DIR, baseDir, dirName);
    if (!fs.existsSync(companyDir)) {
      console.log(`Directory not found: ${companyDir}`);
      continue;
    }

    const files = fs.readdirSync(companyDir);
    const envDoc = files.find((f) => f.toLowerCase().includes("environ") && (f.endsWith(".docx") || f.endsWith(".doc")) && !f.startsWith("~"));
    if (!envDoc) {
      console.log(`No environmental docx found for ${dirName}`);
      continue;
    }

    console.log(`Processing ${dirName} -> ${envDoc}`);
    const docPath = path.join(companyDir, envDoc);
    const text = await extractTextFromDocx(docPath);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Policy Text:\n\n${text}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      const data = JSON.parse(response.choices[0].message.content || "{}");

      const existing = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

      const joinParas = (arr?: any, fallback?: string) => {
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.map((p) => String(p).trim()).filter(Boolean).join("\n\n");
        }
        if (typeof arr === "string" && arr.trim()) {
          return arr.trim();
        }
        return fallback || "";
      };

      existing.policy = {
        ...existing.policy,
        policyType: "environmental",
        declaration: {
          preface: joinParas(data.declaration?.preface_paragraphs, existing.policy.declaration?.preface),
          declaration: joinParas(data.declaration?.declaration_paragraphs, existing.policy.declaration?.declaration),
          scope: joinParas(data.declaration?.scope_paragraphs, existing.policy.declaration?.scope),
        },
        focusAreas: data.focusAreas || [],
        qualitative: data.qualitative || {},
        quantitative: data.quantitative || [],
        responsibilities: data.responsibilities || [],
        monitoring: joinParas(data.monitoring_paragraphs, existing.policy.monitoring),
        reviewMechanism: joinParas(data.reviewMechanism_paragraphs, existing.policy.reviewMechanism),
      };

      fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2));
      console.log(`Updated ${jsonFile}`);
    } catch (e) {
      console.error(`Failed on ${dirName}:`, e);
    }
  }
}

main().catch(console.error);
