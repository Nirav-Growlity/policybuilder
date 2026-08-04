const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env')});
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Paths to search
const FOLDERS = [
    'd:\\Policy PoC\\Hetvi- Policies',
    'd:\\Policy PoC\\Kenal - EcoVadis Policies',
    'd:\\Policy PoC\\KUSH'
];
const OUTPUT_DIR = 'd:\\Policy PoC\\src\\data\\seed-policies';

async function extractTextFromDoc(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    try {
        if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } else if (ext === '.doc') {
            const extractor = new WordExtractor();
            const extracted = await extractor.extract(filePath);
            return extracted.getBody();
        }
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        return null;
    }
    return null;
}

const SYSTEM_PROMPT = `You are a data extraction assistant. You will be provided with the text of an environmental policy document. Your task is to extract information from it and format it STRICTLY as a JSON object that adheres to the following structure:

{
  "id": "kebab-case-company-name",
  "name": "Company Name",
  "industry": "Guessed Industry based on document (e.g. Pharmaceutical Manufacturing)",
  "summary": "A 1-2 sentence summary of the company's environmental stance.",
  "tagline": "A short, catchy environmental tagline.",
  "policy": {
    "policyType": "environmental",
    "company": {
      "name": "Company Name",
      "address": "Company Address (if not found, empty string)"
    },
    "standards": ["List of ISO or other standards mentioned, e.g. 'ISO 14001:2015'"],
    "declaration": {
      "preface": "Introductory text or background",
      "declaration": "Core commitment statement",
      "scope": "Scope of the policy (who/what it applies to)"
    },
    "focusAreas": ["List of 3-5 focus areas/pillars described"],
    "qualitative": {
      "Category Name (e.g. 'Environmental Advocacy and Awareness')": ["List of qualitative targets"]
    },
    "quantitative": [
      {
        "area": "Area Name (e.g. 'Reducing GHG Emissions')",
        "targets": [
          {
            "target": "Target description (e.g. Reduce emissions by 20%)",
            "baseline": "Baseline year (e.g. 2022, or empty string)",
            "deadline": "Deadline year (e.g. 2030, or empty string)"
          }
        ]
      }
    ],
    "sdgs": [List of integer SDG numbers supported by this policy, e.g. 3, 6, 7, 12, 13],
    "responsibilities": [
      {
        "role": "Role Name",
        "duty": "Duty description"
      }
    ],
    "monitoring": "Details on how the policy is monitored or audited",
    "reviewMechanism": "Details on how/when the policy is reviewed"
  }
}

Return ONLY a valid JSON object. Ensure the output is fully compliant with JSON format.`;

async function processFile(filePath, companyName) {
    console.log(`Processing file: ${filePath}`);
    const text = await extractTextFromDoc(filePath);
    
    if (!text || text.trim() === '') {
        console.warn(`No text could be extracted for ${filePath}`);
        return;
    }

    try {
        console.log(`Sending to OpenAI (length: ${text.length})...`);
        const response = await openai.chat.completions.create({
            model: "gpt-5.4-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Company: ${companyName}\n\nDocument Text:\n${text}` }
            ],
            temperature: 0.1
        });

        const jsonStr = response.choices[0].message.content;
        const parsed = JSON.parse(jsonStr);
        
        // Ensure ID is set properly if OpenAI didn't do it perfectly
        parsed.id = parsed.id || companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!parsed.id) parsed.id = 'company-' + Date.now();
        
        const outputPath = path.join(OUTPUT_DIR, `${parsed.id}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2), 'utf-8');
        console.log(`Saved JSON for ${companyName} at ${outputPath}\n`);
    } catch (err) {
        console.error(`Error processing LLM response for ${filePath}:`, err.message);
    }
}

function findEnvPolicies(dir, filesList = []) {
    if (!fs.existsSync(dir)) return filesList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findEnvPolicies(fullPath, filesList);
        } else {
            const ext = path.extname(fullPath).toLowerCase();
            const basename = path.basename(fullPath).toLowerCase();
            
            // Only process .doc and .docx
            if (ext === '.doc' || ext === '.docx') {
                // Ignore temp files like ~$ or ~WRL
                if (basename.startsWith('~$') || basename.startsWith('~wrl')) continue;
                
                // Identify if it's an environmental policy based on filename
                if (
                    basename.includes('env') || 
                    basename.includes('green') || 
                    basename.includes('ehs') || 
                    basename.includes('sustainab')
                ) {
                    filesList.push(fullPath);
                }
            }
        }
    }
    return filesList;
}

async function main() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const allPolicies = [];
    for (const folder of FOLDERS) {
        findEnvPolicies(folder, allPolicies);
    }

    console.log(`Found ${allPolicies.length} potential environmental policies.`);

    for (const filePath of allPolicies) {
        // The company name is usually the parent directory
        const companyDir = path.dirname(filePath);
        const companyName = path.basename(companyDir);
        await processFile(filePath, companyName);
    }
    
    console.log("Done processing all policies!");
}

main().catch(console.error);
