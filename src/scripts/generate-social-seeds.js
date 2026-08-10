/* eslint-disable @typescript-eslint/no-require-imports */
/* Deterministically distils retained labour, human-rights and wage source documents into builder seeds. */
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");

const root = path.resolve(__dirname, "..", "..");
const sources = ["KUSH", "Kenal - EcoVadis Policies", "Hetvi- Policies"];
const output = path.join(root, "src", "data", "seed-policies");
const relevant = /(labou?r|human rights|workforce|employee rights|workplace rights|living wage|fair wage|social policy|responsible workforce)/i;
const wage = /(living wage|fair wage)/i;
const profiles = {
  "labour-human-rights": { label: "Labour & Human Rights Policy", prefix: "LHR", standards: ["EcoVadis", "UNGC", "ILO", "ISO 45001", "ISO 26000", "SA8000", "SDGs"], sdgs: [3,4,5,8,10,16,17], focusAreas: ["Occupational Health & Safety", "Fair Working Conditions, Hours & Benefits", "Social Dialogue & Freedom of Association", "Career Development & Training", "Child Labour, Forced Labour & Modern Slavery", "Non-Discrimination, Harassment & Inclusion", "Employee Wellbeing & Work-Life Balance", "Grievance Mechanisms & Non-Retaliation", "Supply-Chain & Stakeholder Human Rights"] },
  "living-wage": { label: "Living Wage Policy", prefix: "LW", standards: ["EcoVadis", "UNGC", "ILO", "ISO 26000", "SA8000", "SDGs"], sdgs: [1,3,5,8,10], focusAreas: ["Living-Wage Benchmark & Methodology", "Legal Minimum-Wage Compliance", "Benefits, Allowances & Total Remuneration", "Pay Equity & Transparency", "Timely, Traceable Payment", "Employee & Contractor Coverage", "Periodic Review & Cost-of-Living Adjustment", "Wage Grievances & Corrective Action"] },
};

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function walk(dir, out = []) { for (const ent of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, ent.name); ent.isDirectory() ? walk(p, out) : out.push(p); } return out; }
async function readText(file) {
  if (/\.docx$/i.test(file)) return (await mammoth.extractRawText({ path: file })).value;
  const document = await new WordExtractor().extract(file);
  return document.getBody();
}
function lines(text) { return text.replace(/\r/g, "").split(/\n+/).map(s => s.replace(/\s+/g, " ").trim()).filter(s => s.length > 2); }
function headingKey(line) {
  const s = line.toLowerCase().replace(/^\d+(\.\d+)*\.?\s*/, "");
  if (/(preface|preamble|introduction|overview|why it matters)/.test(s)) return "preface";
  if (/(policy declaration|policy statement|our commitment|commitments|human rights and labour commitments)/.test(s)) return "declaration";
  if (/(scope|applicability)/.test(s)) return "scope";
  if (/(definition|living wage determination|methodology)/.test(s)) return "definitions";
  if (/(focus areas|key.*(areas|priorities)|what'?s expected|performance areas)/.test(s)) return "focus";
  if (/(qualitative|strategic approach|objectives|commitments & targets|action framework)/.test(s)) return "qualitative";
  if (/(quantitative|performance.*target|targets)/.test(s)) return "quantitative";
  if (/(responsibilit|governance)/.test(s)) return "responsibilities";
  if (/(monitoring|reporting|performance reporting|tracking)/.test(s)) return "monitoring";
  if (/(review|continuous improvement)/.test(s)) return "review";
  return null;
}
function distil(text, type, company) {
  const profile = profiles[type];
  const sections = Object.fromEntries(["preface","declaration","scope","definitions","focus","qualitative","quantitative","responsibilities","monitoring","review"].map(k => [k, []]));
  let current = "preface";
  for (const line of lines(text)) {
    const key = line.length < 140 ? headingKey(line) : null;
    if (key) { current = key; continue; }
    if (line.length > 14) sections[current].push(line);
  }
  const join = (key, max = 5) => sections[key].slice(0, max).join("\n\n");
  const focus = sections.focus.filter(x => x.length < 180).slice(0, 12);
  const commitments = sections.qualitative.concat(sections.declaration).filter(x => x.length > 20 && x.length < 700).slice(0, 24);
  const targetLines = lines(text).filter(x => /\b\d+%|\bzero\b|\bby\s+(?:fy\s*)?20\d{2}|annually|per year/i.test(x) && x.length < 450).slice(0, 18);
  const responsibilities = sections.responsibilities.filter(x => x.length > 20).slice(0, 6).map((d, i) => ({ role: i === 0 ? "Policy Owners" : `Implementation Responsibility ${i + 1}`, duty: d }));
  return {
    policyType: type,
    company: { name: company, industry: "", site: "", sites: [], docNum: `${profile.prefix}-001`, revNum: "01", effectiveDate: "", reviewDate: "", approver: "" },
    standards: profile.standards,
    declaration: {
      preface: join("preface") || `${company} is committed to the principles set out in this ${profile.label}.`,
      declaration: join("declaration") || `${company} will implement this ${profile.label} through accountable management and continual improvement.`,
      scope: join("scope") || `This policy applies to operations, employees, workers, contractors, suppliers and business partners of ${company}, as applicable.`,
    },
    ...(type === "living-wage" ? { definitions: { title: "Living Wage", content: join("definitions", 8) || "A living wage is remuneration sufficient to support a decent standard of living, assessed using local conditions and a transparent periodic review." } } : {}),
    focusAreas: focus.length ? focus : profile.focusAreas,
    qualitative: { "Source Policy Commitments": commitments.length ? commitments : ["Maintain documented practices and continual improvement actions for this policy."] },
    quantitative: targetLines.length ? [{ area: "Source Policy Targets", targets: targetLines.map(target => ({ target, baseline: "", deadline: "" })) }] : [],
    sdgs: profile.sdgs, responsibilities: responsibilities.length ? responsibilities : [{ role: "Senior Management", duty: "Approve the policy, provide resources, and review performance." }],
    monitoring: join("monitoring", 8) || "Performance is monitored through periodic reviews, feedback channels, and management reporting.",
    reviewMechanism: join("review", 6) || "This policy is reviewed at least every two years or earlier when requirements change.",
  };
}

(async () => {
  let count = 0;
  for (const source of sources) for (const file of walk(path.join(root, source))) {
    const base = path.basename(file);
    if (!/\.(docx|doc)$/i.test(base) || /^~\$|^~wrl/i.test(base) || !relevant.test(base)) continue;
    const type = wage.test(base) ? "living-wage" : "labour-human-rights";
    const company = path.basename(path.dirname(file));
    const id = `${type}-${slug(company)}`;
    const text = await readText(file);
    const policy = distil(text, type, company);
    fs.writeFileSync(path.join(output, `${id}.json`), JSON.stringify({ id, name: company, industry: "Source policy template", summary: `Parsed ${profiles[type].label} template from the retained source document.`, tagline: profiles[type].label, policy, sourcePath: path.relative(root, file), sourceTextLength: text.length }, null, 2));
    count++;
  }
  console.log(`Parsed ${count} social-policy templates.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
