import mammoth from "mammoth";
import type { Policy, PolicyType, Responsibility, QuantitativeArea } from "../types";
import { FOCUS_AREAS_DEFAULT, RESPONSIBILITIES_DEFAULT, getPolicyProfile } from "../constants";

export interface ParseResult {
  text: string;
  html: string;
  policy: Partial<Policy>;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string; number?: string }
  | { type: "para"; text: string; bold?: boolean; italic?: boolean }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] };

const SDG_KEYWORDS: Record<number, { weight: number; keywords: string[] }> = {
  1: { weight: 1, keywords: ["poverty", "no poverty"] },
  2: { weight: 1, keywords: ["hunger", "food security", "agriculture", "crop", "soil", "zero hunger"] },
  3: { weight: 1, keywords: ["health", "well-being", "patient safety", "good health"] },
  4: { weight: 1, keywords: ["education", "training program", "awareness program", "learning", "quality education"] },
  5: { weight: 1, keywords: ["gender equality", "women", "diversity and inclusion", "inclusion", "gender"] },
  6: { weight: 2, keywords: ["water stewardship", "clean water", "water consumption", "water management", "effluent treatment", "wastewater", "water recycling", "water reuse", "freshwater", "sanitation"] },
  7: { weight: 2, keywords: ["renewable energy", "clean energy", "solar", "wind power", "biomass", "energy efficiency", "affordable energy"] },
  8: { weight: 1, keywords: ["decent work", "labour", "labor rights", "wage", "employee welfare", "occupational health", "workforce", "human rights"] },
  9: { weight: 1, keywords: ["infrastructure", "innovation", "cleaner production", "clean technology", "industry innovation"] },
  10: { weight: 1, keywords: ["inequalit", "equity", "accessibility", "reduced inequalities"] },
  11: { weight: 1, keywords: ["sustainable cities", "urban", "community development", "sustainable community"] },
  12: { weight: 2, keywords: ["responsible consumption", "circular economy", "waste management", "recycling", "reuse", "sustainable production", "co-processing", "landfill"] },
  13: { weight: 2, keywords: ["climate change", "ghg emission", "greenhouse gas", "carbon footprint", "net-zero", "net zero", "climate action", "scope 1", "scope 2", "scope 3", "carbon emission"] },
  14: { weight: 1, keywords: ["ocean", "marine", "life below water"] },
  15: { weight: 1, keywords: ["biodiversity", "land use", "habitat", "forest", "ecosystem", "life on land", "soil conservation"] },
  16: { weight: 1, keywords: ["peace", "justice", "governance", "ethics", "transparency", "anti-corruption", "anti-bribery", "institution"] },
  17: { weight: 1, keywords: ["partnership", "stakeholder engagement", "collaboration", "value chain", "supplier engagement", "partnerships"] },
};

const FOCUS_AREA_KEYS: { name: string; patterns: RegExp[] }[] = [
  { name: "Energy Consumption & GHG Emissions", patterns: [/\benergy\s+consumption\b/i, /\bghg\b/i, /\bgreenhouse\s+gas\b/i, /\bscope\s*[123]\b/i, /\bcarbon\s+footprint\b/i, /\brenewable\s+energy\b/i, /\bcarbon\s+emission/i, /\benergy\s+efficiency\b/i, /\benergy\s+manag/i, /\bclimate\s+change\b/i, /\benergy\s+use\b/i] },
  { name: "Air Emissions Control", patterns: [/\bair\s+(emission|emissions|pollution|quality)\b/i, /\bvoc\b/i, /\bstack\s+emission/i, /\bair\s+quality\s+(monit|stand)/i] },
  { name: "Raw Materials & Resource Efficiency", patterns: [/\braw\s+material/i, /\bresource\s+efficien/i, /\bprocess\s+optimi[sz]ation\b/i, /\bmaterials?\s*,\s*chemicals?\b/i, /\bsolvent\s+(recover|manag)/i, /\bchemical\s+manag/i] },
  { name: "Waste Management & Circularity", patterns: [/\bwaste\s+manag/i, /\bcircular\s+economy/i, /\bhazardous\s+waste/i, /\brecycl/i, /\blandfill/i, /\bco-?processing\b/i, /\bsolid\s+waste/i, /\bplastic\s+waste/i] },
  { name: "Water Stewardship", patterns: [/\bwater\s+stewardship\b/i, /\bwater\s+manag/i, /\bwater\s+consumption\b/i, /\beffluent\s+treatment\b/i, /\bwater\s+recycle/i, /\bwater\s+reuse\b/i, /\betp\b/i, /\bwastewater\b/i, /\bfreshwater\b/i] },
  { name: "Biodiversity & Land Use", patterns: [/\bbiodiversit/i, /\bland\s+use\b/i, /\bhabitat\b/i, /\bforest(?!ry)/i, /\bsoil\s+conserv/i] },
  { name: "Climate Risk & Emergency Preparedness", patterns: [/\bclimate\s+risk\b/i, /\bclimate\s+change\s+adapta/i, /\bemergency\s+preparedness\b/i, /\bresilience\b/i, /\btcfd\b/i, /\bphysical\s+risk/i, /\btransition\s+risk/i] },
  { name: "Product End-of-Life & Environmental Stewardship", patterns: [/\bproduct\s+end.of.life\b/i, /\bproduct\s+stewardship\b/i, /\bend.of.life\b/i, /\benvironmental\s+product\b/i, /\bpcf\b/i, /\bproduct\s+carbon\b/i, /\bpackaging\b/i] },
  { name: "Customer Health & Safety", patterns: [/\bcustomer\s+health/i, /\bproduct\s+safety\b/i, /\bpatient\s+safety/i] },
  { name: "Chemicals & Hazardous Substances Management", patterns: [/\bhazardous\s+(substance|chemical)/i, /\bchemical\s+(handling|storage)/i, /\bsds\b/i, /\bsafety\s+data\s+sheet/i] },
  { name: "Environmental Compliance & Risk Management", patterns: [/\benvironmental\s+compliance\b/i, /\bcompliance\s+obligations?\b/i, /\benvironment(al)?\s+risk/i, /\bpermits?\b/i] },
];

// Section name dictionary with all variations seen across pharma policy docs
const SECTION_NAMES: Record<string, string[]> = {
  preface: [
    "preface", "preamble", "overview", "introduction", "purpose", "background",
    "intent", "why it matters", "the {x} way", "the {x} approach", "policy intent",
    "context", "about this policy",
  ],
  declaration: [
    "policy declaration", "policy statement", "declaration", "statement of policy",
    "our commitment", "environmental commitment", "aims", "objectives", "the {x} commitment",
    "commitment", "policy aim", "our aim", "labour and human rights commitments", "living wage commitments",
  ],
  scope: [
    "scope", "applicability", "1.0 scope", "1. scope", "scope of the policy",
    "scope of application", "application", "applies to",
  ],
  focusAreas: [
    "key focus areas", "focus areas", "strategic commitments", "guiding principles",
    "our focus areas", "key environmental areas", "areas where we aim",
    "key performance areas", "commitments & targets", "our commitments & approach",
    "key environmental priorities", "{x} sustainability commitments",
    "what's expected", "what we do", "key priorities", "environmental priorities",
    "commitments and approach", "policy focus areas", "focus", "key labor and human rights priorities", "key labour and human rights areas", "workforce and human rights objectives and targets", "living wage determination and application",
  ],
  qualitative: [
    "qualitative objectives", "qualitative commitments", "qualitative targets",
    "qualitative goals", "objectives and targets", "qualitative",
    "commitments and qualitative objectives", "our strategic approach", "our commitments & approach", "human rights and labour commitments", "living wage commitments", "action framework",
  ],
  quantitative: [
    "quantitative objectives", "quantitative targets", "measurable targets",
    "goals", "quantitative goals", "measurable objectives",
    "quantitative commitments", "targets and goals", "performance areas", "performance and target metrics", "performance targets",
  ],
  sdgs: [
    "alignment with the united nations sustainable development goals",
    "policy alignment with sdgs", "sdgs", "sustainable development goals",
    "covered sdgs", "covered sdgs by this policy", "policy align with sdgs",
    "alignment with sdgs", "sdg alignment", "sdg mapping",
  ],
  responsibilities: [
    "responsibilities", "governance & responsibility", "roles & responsibility",
    "responsibility for this policy", "governance of this policy",
    "governance and responsibilities", "governance", "responsibility",
    "organizational responsibilities", "roles and responsibilities",
    "governance and allocation of responsibilities", "{x} responsibilities",
    "{x} responsibility", "responsibility & authority",
    "responsibility matrix", "roles, responsibilities",
  ],
  monitoring: [
    "monitoring, reporting, and transparency", "monitoring and reporting",
    "reporting", "monitoring", "compliance obligations",
    "performance reporting", "reporting section", "tracking and monitoring",
    "monitoring framework", "monitoring and reporting framework",
    "monitoring and review", "tracking", "performance tracking",
  ],
  review: [
    "review mechanism and continuous improvement", "continuous improvement",
    "review and revision", "review and continuous improvement",
    "review mechanism for this policy", "review mechanism",
    "review", "performance enhancement and continuous improvement",
    "policy review and update mechanism", "review mechanism and review process",
    "review and update", "review process",
  ],
  definitions: ["definition", "definitions", "living wage determination", "living wage assessment", "wage review and implementation"],
  ack: [
    "employee acknowledgment form", "acknowledgement form",
    "employee acknowledgement", "acknowledgement",
    "employee acknowledgement- {x}",
  ],
};

const ROLE_KEYWORDS = [
  "board", "directors", "director", "chief", "ceo", "cfo", "coo", "cto", "cso",
  "executive", "leadership", "management",
  "ehs", "environment", "health", "safety", "sustainability", "esg",
  "qa", "qc", "quality", "regulatory", "compliance",
  "manufacturing", "operations", "production", "plant", "facility", "site",
  "procurement", "supply chain", "supply", "logistics", "warehouse",
  "human resources", "people", "hr",
  "marketing", "sales", "commercial", "business development",
  "research", "r&d", "innovation", "technology",
  "finance", "audit", "legal",
  "employees", "contractors", "suppliers", "stakeholders", "customer", "worker",
  "team", "department", "unit", "division", "organization", "company",
  "head", "officer", "manager", "lead", "coordinator", "specialist", "engineer",
  "all",
];

const ROLE_NOISE = [
  "policy", "overview", "introduction", "scope", "commitment", "purpose",
  "objective", "declaration", "statement", "applicability", "preface",
  "preamble", "background", "monitoring", "reporting", "review",
  "goals", "targets", "sdg", "sdgs", "sustainable", "development",
  "appendix", "annexure", "reference", "form", "table",
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const COMPANY_NOISE = new Set([
  "the","a","an","and","or","of","in","for","to","is","are","was","by","as","at","on","from",
  "this","that","these","those","it","we","our","their","with","without","between","into",
  "during","before","after","above","below","committed","ensure","prevent","reduce","promote",
  "support","maintain","encourage","foster","strive","adopt","implement","improve","build",
  "develop","establish","manage","monitor","review","applicable","required","necessary",
  "company","companies","policy","policies","environmental","environment","sustainability",
  "sustainable","operation","operations","product","products","service","services",
  "medicare","medicaid","aid","help","address","location","site","date","rev","revision",
  "key","focus","areas","targets","commitments","responsibilities","values",
  "statement","declaration","preamble","preface","introduction","overview","purpose",
  "scope","applicability","objectives","aims","goals",
  "alignment","framework","eco","vadis","ecovadis",
  "all","each","every","both","either","neither",
]);

function matchCompanyInText(text: string): string | null {
  const lower = text.toLowerCase();
  const wordRe = /[A-Z\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F&\-\.']*/g;
  const suffixRe = /^(?:[a-z0-9\u00C0-\u024F&\-\.']+\s+){0,6}(pvt\.?\s*)?(limited|ltd\.?|llp|private|llc|inc\.?|corporation|industries|chemicals|pharma(?:ceuticals|ceutical)?|lifesciences|group|gmbh|gesellschaft|s\.?a\.?|b\.?v\.?|s\.?r\.?l\.?)/;
  let best: { start: number; end: number; text: string } | null = null;
  let m;
  while ((m = wordRe.exec(text)) !== null) {
    const tail = lower.slice(m.index);
    const seqMatch = tail.match(suffixRe);
    if (!seqMatch) continue;
    const startIdx = m.index;
    const endIdx = m.index + seqMatch[0].length;
    const candidate = text.slice(startIdx, endIdx).trim().replace(/\s+/g, " ");
    const words = candidate.split(/\s+/);
    if (words.length < 2) continue;
    const firstWord = words[0].toLowerCase();
    if (COMPANY_NOISE.has(firstWord)) continue;
    if (candidate.length > 100 || candidate.length < 5) continue;
    if (!best || candidate.length > best.text.length) {
      best = { start: startIdx, end: endIdx, text: candidate };
    }
  }
  return best ? best.text : null;
}

export async function parseDocxBuffer(buf: Buffer, policyType: PolicyType = "environmental"): Promise<ParseResult> {
  const [raw, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer: buf }),
    mammoth.convertToHtml({ buffer: buf }),
  ]);
  const text = (raw.value || "").replace(/\u00A0/g, " ");
  const html = (htmlResult.value || "").replace(/\u00A0/g, " ");
  const blocks = htmlToBlocks(html);
  return { text, html, policy: buildPolicy(blocks, text, policyType) };
}

function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const parser = parseHtml(stripAnchors(html));
  for (const node of parser) {
    if (node.type === "h1" || node.type === "h2" || node.type === "h3" || node.type === "h4") {
      const level = node.type === "h1" ? 1 : node.type === "h2" ? 2 : node.type === "h3" ? 3 : 3;
      const text = cleanInline(node.children);
      if (!text) continue;
      const numMatch = text.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
      blocks.push({ type: "heading", level, text, number: numMatch?.[1] });
    } else if (node.type === "p") {
      const { text, bold, italic } = inlineToText(node.children);
      if (text) blocks.push({ type: "para", text, bold, italic });
    } else if (node.type === "ul" || node.type === "ol") {
      const items: string[] = [];
      for (const li of node.children) {
        if (li.type === "li") {
          const { text } = inlineToText(li.children);
          if (text) items.push(text);
        }
      }
      if (items.length) blocks.push({ type: "list", items });
    } else if (node.type === "table") {
      const rows: string[][] = [];
      for (const tr of node.children) {
        if (tr.type !== "tr") continue;
        const cells: string[] = [];
        for (const cell of tr.children) {
          if (cell.type !== "td" && cell.type !== "th") continue;
          const { text } = inlineToText(cell.children);
          cells.push(text);
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) blocks.push({ type: "table", rows });
    }
  }
  return blocks;
}

function stripAnchors(html: string): string {
  return html
    .replace(/<a\s+[^>]*id="[^"]*"[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<a\s+[^>]*id='[^']*'[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<a\s+href="[^"]*">([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<a\s+href='[^']*'>([\s\S]*?)<\/a>/gi, "$1");
}

interface HtmlNode {
  type: string;
  children: HtmlNode[];
  text?: string;
}

function parseHtml(html: string): HtmlNode[] {
  const root: HtmlNode = { type: "root", children: [] };
  const stack: HtmlNode[] = [root];
  const tagRe = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const [full, tag, attrs, text] = m;
    if (text) {
      const trimmed = decodeEntities(text);
      if (trimmed) stack[stack.length - 1].children.push({ type: "text", children: [], text: trimmed });
      continue;
    }
    const isClose = full.startsWith("</");
    const t = (tag || "").toLowerCase();
    if (isClose) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].type === t) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (t === "br" || t === "hr" || t === "img") continue;
    const node: HtmlNode = { type: t, children: [] };
    stack[stack.length - 1].children.push(node);
    const selfClose = attrs && attrs.trim().endsWith("/");
    if (
      !selfClose &&
      ["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "tr", "td", "th", "table", "thead", "tbody", "strong", "em", "b", "i", "u", "span", "div"].includes(t)
    ) {
      stack.push(node);
    }
  }
  return root.children;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function inlineToText(nodes: HtmlNode[]): { text: string; bold: boolean; italic: boolean } {
  const parts: string[] = [];
  let bold = false;
  let italic = false;
  const walk = (n: HtmlNode, parentBold = false, parentItalic = false) => {
    if (n.type === "text") {
      parts.push(n.text || "");
      return;
    }
    if (n.type === "br") {
      parts.push(" ");
      return;
    }
    if (n.type === "strong" || n.type === "b") bold = true;
    if (n.type === "em" || n.type === "i") italic = true;
    for (const c of n.children) walk(c, bold || parentBold, italic || parentItalic);
  };
  for (const n of nodes) walk(n);
  const text = decodeEntities(parts.join(" "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, bold, italic };
}

function cleanInline(nodes: HtmlNode[]): string {
  return inlineToText(nodes).text;
}

function buildPolicy(blocks: Block[], rawText: string, policyType: PolicyType = "environmental"): Partial<Policy> {
  const policy: Partial<Policy> = {
    policyType,
    company: { name: "", industry: "", site: "", sites: [], docNum: "", revNum: "01", effectiveDate: "", reviewDate: "", approver: "" },
    standards: [],
    declaration: { preface: "", declaration: "", scope: "" },
    focusAreas: [],
    qualitative: {},
    quantitative: [],
    sdgs: [],
    responsibilities: [],
    monitoring: "",
    reviewMechanism: "",
  };

  const cleaned = stripToc(blocks);
  extractCover(cleaned, rawText, policy);
  extractSites(cleaned, rawText, policy);
  const sections = sliceByHeadings(cleaned);
  fillSections(sections, policy);
  extractSdgs(cleaned, rawText, policy);
  extractResponsibilities(sections, policy);
  extractStandards(rawText, policy);
  if (policyType === "living-wage") {
    const definitions = sections.get("definitions") || [];
    const content = definitions.filter((block) => block.type === "para" || block.type === "list").map((block) => block.type === "list" ? block.items.join("\n") : block.text).join("\n\n").trim();
    if (content) policy.definitions = { title: "Living Wage Definition & Methodology", content };
  }
  applyDefaults(policy, policyType);
  return policy;
}

function stripToc(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let inToc = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (inToc) {
      if (b.type === "heading" || (b.type === "para" && !/^\s*\d+\s*$/.test(b.text) && b.text.length > 3)) {
        const isTocEntry = b.type === "para" && /\d+\s*$/.test(b.text) && b.text.length < 120;
        if (!isTocEntry) {
          inToc = false;
        }
      }
      if (inToc) continue;
    }
    if (b.type === "heading" && /^(table\s+of\s+contents|contents|index)$/i.test(b.text.trim())) {
      inToc = true;
      continue;
    }
    if (b.type === "para" && /^(table\s+of\s+contents|contents|index)$/i.test(b.text.trim()) && b.bold) {
      inToc = true;
      continue;
    }
    out.push(b);
  }
  return out;
}

function extractCover(blocks: Block[], rawText: string, policy: Partial<Policy>) {
  const titleData = extractTitle(blocks);
  if (titleData.company) policy.company!.name = titleData.company;

  const coverEnd = findCoverEnd(blocks);
  const candidates: { rows: string[][]; source: "table" | "para" }[] = [];
  for (let i = 0; i < coverEnd; i++) {
    const b = blocks[i];
    if (b.type === "table") {
      const looksCover = isCoverTable(b.rows);
      if (looksCover) candidates.push({ rows: b.rows, source: "table" });
    }
  }
  for (let i = 0; i < coverEnd; i++) {
    const b = blocks[i];
    if (b.type === "para") candidates.push({ rows: [[b.text]], source: "para" });
  }

  for (const { rows } of candidates) {
    for (const row of rows) {
      if (row.length < 1) continue;
      let label = row[0].replace(/^[:\s]+|[:\s]+$/g, "").toLowerCase();
      let val = (row[1] !== undefined ? row[1] : "").trim();
      if (!val) continue;
      val = val.replace(/^[:\s]+/, "").trim();
      if (!val || val === ":") continue;

      if (/^(document\s*(no\.?|number|#)|doc\s*no\.?)/.test(label)) {
        if (!looksLikeCompanyTable(val) && !looksLikeDate(val) && val.length < 60) {
          policy.company!.docNum = val;
        }
      } else if (/^(rev(ision)?|version|revision\s*no\.?|revision\s*number)/.test(label) && !/date/i.test(label)) {
        if (/^[0-9]+(\.[0-9]+)?$/.test(val)) {
          policy.company!.revNum = val;
        }
      } else if (/effective\s*date|valid\s*from/.test(label)) {
        if (!policy.company!.effectiveDate) {
          policy.company!.effectiveDate = parseDate(val) || val;
        }
      } else if (/last\s*review/.test(label)) {
      } else if (/next\s*review/.test(label) || (/review\s*date/.test(label) && !/last/.test(label))) {
        if (!policy.company!.reviewDate) {
          policy.company!.reviewDate = parseDate(val) || val;
        }
      } else if (/approv(ed)?\s*by/.test(label)) {
        if (val.length < 80 && !/^\[name|placeholder|designation\]$/i.test(val) && val.length > 0) {
          policy.company!.approver = val;
        }
      } else if (/^policy\s*owner/.test(label)) {
        policy.company!.industry = val;
      } else if (/^(site|location|address)$/.test(label) && val.length < 300) {
        policy.company!.site = val;
      } else if (/prepared\s*by/.test(label)) {
      }
    }
  }

  const paraCandidates = blocks.slice(0, 60).filter((b) => b.type === "para") as { type: "para"; text: string; bold?: boolean }[];
  for (const p of paraCandidates) {
    const m = p.text.match(/^(Document\s*(?:No\.?|Number|#)\s*[:\.]\s*)(.+)$/i);
    if (m && !policy.company!.docNum) {
      const v = m[2].trim();
      if (v.length < 60 && !looksLikeCompanyTable(v)) policy.company!.docNum = v;
    }
    const r = p.text.match(/^(Rev(?:ision)?\.?\s*(?:No\.?|Number|#)\s*[:\.]\s*)(.+)$/i);
    if (r && (!policy.company!.revNum || policy.company!.revNum === "01")) {
      const v = r[2].trim();
      if (/^[0-9]+(\.[0-9]+)?$/.test(v)) policy.company!.revNum = v;
    }
    const e = p.text.match(/^(Effective\s+Date\s*[:\.]\s*)(.+)$/i);
    if (e && !policy.company!.effectiveDate) policy.company!.effectiveDate = parseDate(e[2].trim()) || e[2].trim();
    const n = p.text.match(/^(Next\s+Review\s+Date\s*[:\.]\s*)(.+)$/i) || p.text.match(/^(Next\s+Review\s*[:\.]\s*)(.+)$/i);
    if (n && !policy.company!.reviewDate) policy.company!.reviewDate = parseDate(n[2].trim()) || n[2].trim();
    const a = p.text.match(/^(Approved\s+By\s*[:\.]\s*)(.+)$/i);
    if (a && !policy.company!.approver) {
      const v = a[2].trim();
      if (v.length < 80) policy.company!.approver = v;
    }
  }

  // Pick the latest rev from revision history table if found
  if (!policy.company!.revNum || policy.company!.revNum === "01" || policy.company!.revNum === "00") {
    let revFromTable = "";
    for (const b of blocks.slice(0, 80)) {
      if (b.type !== "table") continue;
      const head = b.rows[0]?.map((c) => c.toLowerCase()) || [];
      if (!head.some((h) => /revision\s*no/.test(h))) continue;
      let lastRev = "";
      for (let i = 1; i < b.rows.length; i++) {
        const row = b.rows[i];
        const headIdx = head.findIndex((h) => /revision\s*no/.test(h));
        const val = row[headIdx]?.trim() || "";
        if (val && /^[0-9]+(\.[0-9]+)?$/.test(val)) lastRev = val;
      }
      if (lastRev && lastRev !== "00") revFromTable = lastRev;
    }
    if (revFromTable) {
      policy.company!.revNum = revFromTable;
    }
  }

  if (!policy.company!.docNum) {
    const m = rawText.match(/Document\s*(?:No\.?|Number|#)\s*[:\.\s]+\s*([A-Z0-9][A-Z0-9\-\/\.]{1,40})/i);
    if (m && m[1].length < 60) policy.company!.docNum = m[1].trim();
  }
  if (!policy.company!.revNum || policy.company!.revNum === "01" || policy.company!.revNum === "00") {
    // Strict rev match: must be "Rev. No." or "Revision No." or "Revision Number" (not "Review")
    const m = rawText.match(/(?:Revision\s*(?:No\.?|Number|#)|Rev\.\s*(?:No\.?|Number|#))\s*[:\.\s]+([0-9]+(?:\.[0-9]+)?)/i);
    if (m && m[1] !== "00" && parseInt(m[1], 10) < 100) policy.company!.revNum = m[1];
  }
  if (!policy.company!.effectiveDate) {
    const m = rawText.match(/Effective\s+Date\s*[:\.][ \t]*([^\n]+)/i) || rawText.match(/Effective\s+Date[ \t]+([0-9A-Za-z\-\s,]+)/i);
    if (m) policy.company!.effectiveDate = parseDate(m[1]) || m[1].trim();
  }
  if (!policy.company!.reviewDate) {
    const m = rawText.match(/Next\s+Review\s+Date\s*[:\.][ \t]*([^\n]+)/i) || rawText.match(/Next\s+Review\s*[:\.][ \t]*([^\n]+)/i);
    if (m) policy.company!.reviewDate = parseDate(m[1]) || m[1].trim();
  }
  if (!policy.company!.approver) {
    const m = rawText.match(/Approved\s+By\s*[:\.][ \t]*([^\n]+)/i);
    if (m && m[1].length < 80 && !/^\s*$/.test(m[1])) policy.company!.approver = m[1].trim();
  }
}

function extractSites(blocks: Block[], rawText: string, policy: Partial<Policy>) {
  if (!policy.company) return;
  if (!policy.company.sites) policy.company.sites = [];

  const sites: { location?: string; address: string; primaryFunction?: string }[] = [];

  for (const b of blocks) {
    if (b.type !== "table" || b.rows.length < 2) continue;

    const firstRowStr = b.rows[0].map((c) => c.toLowerCase()).join(" ");
    const isSiteTable =
      /location|unit|site|facility|plant|address/i.test(firstRowStr) &&
      !/document\s*no|rev(ision)?\s*no|effective\s*date|approved\s*by/i.test(firstRowStr);

    if (isSiteTable) {
      const headerRow = b.rows[0].map((c) => c.toLowerCase().trim());
      let locIdx = headerRow.findIndex((h) => /location|unit|site|facility|plant|name/i.test(h));
      let addrIdx = headerRow.findIndex((h) => /address|location\s*address|premise/i.test(h));
      let funcIdx = headerRow.findIndex((h) => /function|activity|operation|primary\s*function|purpose|scope/i.test(h));

      if (locIdx === -1) locIdx = 0;
      if (addrIdx === -1) addrIdx = locIdx === 0 && b.rows[0].length > 1 ? 1 : locIdx;

      for (let r = 1; r < b.rows.length; r++) {
        const row = b.rows[r];
        if (!row || row.length < 1) continue;

        const locVal = (row[locIdx] || row[0] || "").trim();
        const addrVal = (row[addrIdx] || row[1] || locVal).trim();
        const funcVal = funcIdx !== -1 && row[funcIdx] ? row[funcIdx].trim() : (row[2] || "").trim();

        if (addrVal && addrVal.length > 5 && !/^(location|address|primary function|site)$/i.test(addrVal)) {
          sites.push({
            location: locVal && locVal !== addrVal ? locVal : (policy.company.name || "Site"),
            address: addrVal,
            primaryFunction: funcVal || "Operating Site",
          });
        }
      }
    }
  }

  if (sites.length === 0 && policy.company.site) {
    sites.push({
      location: policy.company.name || "Main Site",
      address: policy.company.site,
      primaryFunction: "Operating Facility",
    });
  }

  if (sites.length > 0) {
    policy.company.sites = sites;
    if (!policy.company.site) {
      policy.company.site = sites[0].address;
    }
  }
}

function findCoverEnd(blocks: Block[]): number {
  // Cover ends when we hit the first matched section heading or a known structure
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "heading" && b.level <= 2) {
      const matched = matchSection(b.text);
      if (matched && matched !== "ack") return i;
    }
  }
  return Math.min(30, blocks.length);
}

function looksLikeCompanyTable(s: string): boolean {
  return /(Pvt\.|Limited|Ltd\.|LLP|Private|LLC|Inc\.|Corporation|Industries|Chemicals|Pharma|Lifesciences|Medicare|Group)/i.test(s);
}

function looksLikeDate(s: string): boolean {
  return /\d{1,2}[\s\-\/](\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(s) || /FY\s*\d{2,4}/i.test(s);
}

function isCoverTable(rows: string[][]): boolean {
  if (rows.length < 2 || rows.length > 20) return false;
  const cells = rows.flat().map((c) => c.toLowerCase());
  const hits = cells.filter(
    (c) =>
      /^(document\s*(no\.?|number|#)|doc\s*no\.?)/.test(c) ||
      /^rev(ision)?\s*(no\.?|number|#)?$/.test(c) ||
      /effective\s*date/.test(c) ||
      /(next|last)\s*review/.test(c) ||
      /approv(ed)?\s*by/.test(c) ||
      /^title$/.test(c) ||
      /^prepared\s*by$/.test(c)
  ).length;
  return hits >= 2;
}

function extractTitle(blocks: Block[]): { title: string; company: string } {
  const out = { title: "", company: "" };

  let prefaceIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "heading" && matchSection(b.text) === "preface") {
      prefaceIdx = i;
      break;
    }
  }
  const coverBlocks = prefaceIdx > 0 ? blocks.slice(0, prefaceIdx) : blocks.slice(0, 25);
  const lookback = prefaceIdx > 0 ? prefaceIdx : Math.min(25, blocks.length);

  for (const b of coverBlocks) {
    if (b.type === "heading" || (b.type === "para" && (b as any).bold)) {
      const t = b.text;
      if (/environmental/i.test(t) && /policy|stewardship|responsibility|management|framework|roadmap|protection/i.test(t) && t.length < 100) {
        if (!out.title) out.title = t;
      }
    }
  }

  for (let i = 0; i < lookback; i++) {
    const b = blocks[i];
    if (b.type === "para" || b.type === "heading") {
      const t = b.text;
      if (t.length > 250) continue;
      if (/\s\d+\s*$/.test(t) && t.length < 120) continue;
      const found = matchCompanyInText(t);
      if (found) {
        out.company = found;
        break;
      }
    }
  }

  if (!out.company) {
    for (let i = 0; i < lookback; i++) {
      const b = blocks[i];
      if (b.type === "table") {
        for (const row of b.rows) {
          for (const cell of row) {
            if (cell.length > 200) continue;
            if (/\s\d+\s*$/.test(cell) && cell.length < 120) continue;
            if (looksLikeCompanyTable(cell) || /\bLLP\b/.test(cell)) {
              const found = matchCompanyInText(cell);
              if (found) {
                out.company = found;
                break;
              }
            }
          }
          if (out.company) break;
        }
        if (out.company) break;
      }
    }
  }

  if (!out.company) {
    const scanBlocks = prefaceIdx > 0 ? blocks.slice(prefaceIdx, Math.min(prefaceIdx + 5, blocks.length)) : blocks.slice(0, 5);
    for (const b of scanBlocks) {
      if (b.type === "para") {
        const t = b.text;
        const found = matchCompanyInText(t);
        if (found) {
          out.company = found;
          break;
        }
      }
    }
  }

  return out;
}

function sliceByHeadings(blocks: Block[]): Map<string, Block[]> {
  const sections = new Map<string, Block[]>();
  let current = "__intro";
  let currentMatched: string | null = null;
  if (!sections.has(current)) sections.set(current, []);

  for (const b of blocks) {
    if (b.type === "heading" && (b.level === 1 || b.level === 2)) {
      const key = normalizeHeading(b.text);
      const matched = matchSection(key);
      if (matched === "responsibilities" && currentMatched !== "responsibilities") {
        current = "responsibilities";
        currentMatched = "responsibilities";
      } else if (matched === "responsibilities" && currentMatched === "responsibilities") {
        const roleKey = "__respRole:" + key;
        current = roleKey;
        currentMatched = "responsibilities";
      } else if (matched && matched !== "responsibilities") {
        current = matched;
        currentMatched = matched;
      } else if (b.level === 1) {
        current = `__other:${key}`;
        currentMatched = null;
      } else if (b.level === 2 && !matched) {
        const subKey = "__other:" + key;
        current = subKey;
        currentMatched = currentMatched;
      }
      if (!sections.has(current)) sections.set(current, []);
    }
    sections.get(current)!.push(b);
  }
  return sections;
}

function normalizeHeading(s: string): string {
  return s.replace(/^\d+(?:\.\d+)*\.?\s*/, "").replace(/\s+/g, " ").trim();
}

function matchSection(name: string): string | null {
  const lower = name.toLowerCase().trim();
  // Strip leading number/dot (e.g., "1.1 Scope" -> "Scope")
  const stripped = lower.replace(/^[\d\.]+\s*/, "").trim();
  for (const [key, names] of Object.entries(SECTION_NAMES)) {
    for (const pat of names) {
      if (pat.includes("{x}")) continue;
      if (stripped === pat) return key;
      if (stripped.includes(pat) && pat.length >= 6) return key;
    }
  }
  // Fuzzy match using word overlap
  for (const [key, names] of Object.entries(SECTION_NAMES)) {
    for (const pat of names) {
      if (pat.includes("{x}")) continue;
      if (fuzzyMatch(stripped, pat)) return key;
    }
  }
  return null;
}

function fuzzyMatch(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false;
  // Word-level fuzzy: at least 70% of words in shorter match in longer
  const aWords = new Set(a.toLowerCase().split(/\s+/));
  const bWords = new Set(b.toLowerCase().split(/\s+/));
  const shorter = aWords.size < bWords.size ? aWords : bWords;
  const longer = aWords.size < bWords.size ? bWords : aWords;
  if (shorter.size === 0) return false;
  let overlap = 0;
  for (const w of shorter) {
    if (longer.has(w)) overlap++;
    else {
      // Partial match: startsWith
      for (const lw of longer) {
        if (lw.startsWith(w) || w.startsWith(lw)) {
          overlap++;
          break;
        }
      }
    }
  }
  return overlap / shorter.size >= 0.7;
}

function fillSections(sections: Map<string, Block[]>, policy: Partial<Policy>) {
  const grabText = (key: string) => {
    const bs = sections.get(key);
    if (!bs) return "";
    return bs
      .filter((b) => b.type === "para" || b.type === "list")
      .map((b) => (b.type === "list" ? b.items.map((i) => "• " + i).join("\n") : (b as any).text))
      .join("\n\n")
      .trim();
  };

  const declaration = grabText("declaration");
  const preface = grabText("preface");
  const scope = grabText("scope");
  if (preface) policy.declaration!.preface = preface;
  if (declaration) policy.declaration!.declaration = declaration;
  if (scope) policy.declaration!.scope = scope;

  const monitoring = grabText("monitoring");
  const review = grabText("review");
  if (monitoring) policy.monitoring = monitoring;
  if (review) policy.reviewMechanism = review;

  const fa = sections.get("focusAreas");
  if (fa) {
    const items: string[] = [];
    for (const b of fa) {
      if (b.type === "list") items.push(...b.items);
      else if (b.type === "para") {
        const parts = b.text
          .split(/\n+/)
          .map((s) => s.replace(/^[\d\.\-\)\s•·]+/, "").trim())
          .filter((s) => s.length > 4 && s.length < 200 && !/^[A-Z\s]{3,}$/.test(s));
        items.push(...parts);
      }
    }
    if (items.length) policy.focusAreas = dedupe(items).slice(0, 16);
  }

  const qual = sections.get("qualitative");
  if (qual) {
    const map: Record<string, string[]> = {};
    let currentArea = "";
    for (const b of qual) {
      if (b.type === "heading") {
        const clean = normalizeHeading(b.text);
        if (/^\d+(\.\d+)*\s+/.test(b.text) || clean.length < 80) {
          currentArea = matchFocusArea(clean) || clean;
          if (!map[currentArea]) map[currentArea] = [];
        }
      } else if (b.type === "list") {
        if (!currentArea) currentArea = "General";
        if (!map[currentArea]) map[currentArea] = [];
        map[currentArea].push(...b.items);
      } else if (b.type === "para") {
        if (!currentArea) currentArea = "General";
        if (!map[currentArea]) map[currentArea] = [];
        const parts = b.text.split(/\n+/).map((s) => s.replace(/^[\d\.\-\)\s•·]+/, "").trim()).filter(Boolean);
        map[currentArea].push(...parts);
      }
    }
    if (Object.keys(map).length) policy.qualitative = map;
  }

  const quant = sections.get("quantitative");
  if (quant) {
    const areas: QuantitativeArea[] = [];
    let cur: QuantitativeArea | null = null;
    const flush = () => {
      if (cur && cur.targets.length) areas.push(cur);
    };
    for (const b of quant) {
      if (b.type === "heading") {
        flush();
        const clean = normalizeHeading(b.text);
        cur = { area: matchFocusArea(clean) || clean, targets: [] };
      } else if (b.type === "list" && cur) {
        for (const item of b.items) {
          const t = parseQuantitativeItem(item);
          if (t) cur.targets.push(t);
        }
      } else if (b.type === "para" && cur) {
        const lines = b.text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
        for (const line of lines) {
          const t = parseQuantitativeItem(line);
          if (t) cur.targets.push(t);
        }
      } else if (b.type === "table" && cur) {
        parseQuantitativeTable(b.rows, cur);
      }
    }
    flush();
    if (!areas.length) {
      const tableBlocks = quant.filter((b) => b.type === "table") as { type: "table"; rows: string[][] }[];
      for (const tb of tableBlocks) {
        const area: QuantitativeArea = { area: "Targets", targets: [] };
        parseQuantitativeTable(tb.rows, area);
        if (area.targets.length) areas.push(area);
      }
    }
    if (areas.length) policy.quantitative = areas;
  }

  const sdgSec = sections.get("sdgs");
  if (sdgSec) {
    for (const b of sdgSec) {
      if (b.type === "table") {
        for (const row of b.rows) {
          for (const cell of row) {
            const matches = cell.match(/SDG\s*(\d{1,2})/gi);
            if (matches) {
              for (const m of matches) {
                const n = parseInt(m.replace(/SDG\s*/i, ""), 10);
                if (n >= 1 && n <= 17) {
                  if (!policy.sdgs) policy.sdgs = [];
                  if (!policy.sdgs.includes(n)) policy.sdgs.push(n);
                }
              }
            }
          }
        }
      } else if (b.type === "para") {
        const matches = b.text.match(/SDG\s*(\d{1,2})/gi);
        if (matches) {
          for (const m of matches) {
            const n = parseInt(m.replace(/SDG\s*/i, ""), 10);
            if (n >= 1 && n <= 17) {
              if (!policy.sdgs) policy.sdgs = [];
              if (!policy.sdgs.includes(n)) policy.sdgs.push(n);
            }
          }
        }
      } else if (b.type === "list") {
        for (const item of b.items) {
          const matches = item.match(/SDG\s*(\d{1,2})/gi);
          if (matches) {
            for (const m of matches) {
              const n = parseInt(m.replace(/SDG\s*/i, ""), 10);
              if (n >= 1 && n <= 17) {
                if (!policy.sdgs) policy.sdgs = [];
                if (!policy.sdgs.includes(n)) policy.sdgs.push(n);
              }
            }
          }
        }
      }
    }
  }
}

function parseQuantitativeTable(rows: string[][], area: QuantitativeArea) {
  if (!rows.length) return;
  const head = rows[0].map((c) => c.toLowerCase());
  const goalIdx = head.findIndex((h) => /^(goal|objective|parameter|metric|focus\s*area|area)$/i.test(h));
  const targetIdx = head.findIndex((h) => /^(target|metric|kpi|value|commitment)/i.test(h));
  const deadlineIdx = head.findIndex((h) => /(timeline|deadline|by|date|target\s*date|fy)/i.test(h));
  const baselineIdx = head.findIndex((h) => /baseline/i.test(h));
  const kpiIdx = head.findIndex((h) => /^(kpi|indicator|measure)$/i.test(h));
  const actionIdx = head.findIndex((h) => /(action\s*plan|future\s*action|commitment)/i.test(h));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => !c || c.length < 2)) continue;
    const goal = goalIdx >= 0 ? row[goalIdx] : "";
    const target = targetIdx >= 0 ? row[targetIdx] : (row[1] || "");
    const deadline = deadlineIdx >= 0 ? row[deadlineIdx] : "";
    const baseline = baselineIdx >= 0 ? row[baselineIdx] : "";
    const kpi = kpiIdx >= 0 ? row[kpiIdx] : "";
    const action = actionIdx >= 0 ? row[actionIdx] : "";
    if (!target || target.length < 3) continue;
    if (target.length > 800) continue;
    let combined = target;
    if (kpi && kpi.length < 200 && !/^kpi$/i.test(kpi)) combined += " (KPI: " + kpi + ")";
    if (action && action.length < 200 && actionIdx !== targetIdx) combined += " [Action: " + action + "]";
    if (goal && goal.length < 100) {
      // Multiple goals in same table — split into separate areas
      const goalArea = matchFocusArea(goal) || goal;
      const existing = area.targets.length === 0 && !area.area.startsWith("Targets");
      if (existing || area.area === "Targets") {
        area.area = goalArea;
        area.targets.push({ target: combined, baseline, deadline: parseDate(deadline) || deadline });
      } else {
        // already have a specific area; just add the target
        area.targets.push({ target: combined, baseline, deadline: parseDate(deadline) || deadline });
      }
    } else {
      area.targets.push({ target: combined, baseline, deadline: parseDate(deadline) || deadline });
    }
  }
}

function parseQuantitativeItem(text: string): { target: string; baseline: string; deadline: string } | null {
  if (!text || text.length < 4) return null;
  if (text.length > 400) return null;
  let baseline = "";
  let deadline = "";
  const baselineM = text.match(/(?:baseline|from)\s*[:\-]?\s*([0-9][0-9.,\s%a-zA-Z\-\/]{1,40})/i);
  if (baselineM) baseline = baselineM[1].trim();
  const deadlineM = text.match(/(?:by|deadline|target\s*date|by\s*[:\-]?)\s*([0-9]{4}|FY\s*[0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i);
  if (deadlineM) deadline = deadlineM[1].trim();
  const target = text.replace(/\s+/g, " ").trim();
  if (target.length < 4) return null;
  return { target, baseline, deadline };
}

function matchFocusArea(s: string): string | null {
  const lower = s.toLowerCase();
  for (const f of FOCUS_AREA_KEYS) {
    for (const p of f.patterns) {
      if (p.test(lower)) return f.name;
    }
  }
  return null;
}

function extractSdgs(blocks: Block[], rawText: string, policy: Partial<Policy>) {
  const set = new Set<number>();
  const numberedRe = /\bSDG\s*(\d{1,2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = numberedRe.exec(rawText)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 17) set.add(n);
  }
  const lower = rawText.toLowerCase();
  for (const [nStr, info] of Object.entries(SDG_KEYWORDS) as [string, typeof SDG_KEYWORDS[number]][]) {
    const n = parseInt(nStr, 10);
    let score = 0;
    for (const k of info.keywords) {
      const re = new RegExp("\\b" + k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      const occ = (lower.match(re) || []).length;
      if (occ > 0) score += occ;
    }
    if (score >= info.weight) set.add(n);
  }
  policy.sdgs = Array.from(set).sort((a, b) => a - b);
}

function extractResponsibilities(sections: Map<string, Block[]>, policy: Partial<Policy>) {
  const list: Responsibility[] = [];

  const roleSections = Array.from(sections.keys()).filter((k) => k.startsWith("__respRole:"));
  if (roleSections.length) {
    for (const key of roleSections) {
      const bs = sections.get(key)!;
      const role = normalizeHeading(key.replace("__respRole:", ""));
      if (isAckHeader(role)) continue;
      if (!isLikelyRole(role)) continue;
      const duty = bs
        .filter((b) => b.type === "list" || b.type === "para")
        .map((b) => (b.type === "list" ? b.items.map((i) => "• " + i).join("\n") : (b as any).text))
        .join("\n\n")
        .trim();
      if (role && role.length < 100) {
        list.push({ role, duty });
      }
    }
  }

  if (list.length < 2) {
    const resp = sections.get("responsibilities");
    if (resp) {
      let cur: Responsibility | null = null;
      for (const b of resp) {
        if (b.type === "heading") {
          const role = normalizeHeading(b.text);
          if (isLikelyRole(role) && !isAckHeader(role)) {
            if (cur) list.push(cur);
            cur = { role, duty: "" };
          }
        } else if (cur) {
          if (b.type === "list") {
            cur.duty = cur.duty ? cur.duty + "\n" + b.items.join("\n") : b.items.join("\n");
          } else if (b.type === "para") {
            const text = (b as any).text;
            if (text && text.length < 2000) cur.duty = cur.duty ? cur.duty + "\n" + text : text;
          }
        }
      }
      if (cur) list.push(cur);
    }
  }

  if (list.length < 2) {
    const resp = sections.get("responsibilities");
    if (resp) {
      const combinedDuty = resp
        .filter((b) => b.type === "list" || b.type === "para")
        .map((b) => (b.type === "list" ? b.items.map((i) => "• " + i).join("\n") : (b as any).text))
        .join("\n\n")
        .trim();
      if (combinedDuty.length > 100) {
        list.push({ role: "Policy Owners", duty: combinedDuty });
      }
    }
  }

  const cleaned = list
    .filter((r) => r.role && !/^\d+$/.test(r.role) && r.role.length < 100)
    .map((r) => ({ role: titleCase(r.role.trim().replace(/[&]/g, "and")), duty: r.duty.replace(/\n{3,}/g, "\n\n").trim() }));
  if (cleaned.length >= 1) policy.responsibilities = dedupeResponsibilities(cleaned);
}

function isLikelyRole(s: string): boolean {
  if (!s || s.length > 100) return false;
  const lower = s.toLowerCase();
  if (isAckHeader(lower)) return false;
  if (ROLE_NOISE.some((n) => lower === n)) return false;
  if (matchSection(s)) return false; // It's a section heading, not a role
  if (/\b(director|manager|officer|lead|head|chief|coordinator|engineer|specialist|supervisor|team|board)\b/i.test(s)) return true;
  if (ROLE_KEYWORDS.some((k) => lower.includes(k))) return true;
  // Also accept if the heading is short (likely a role)
  if (s.length < 60 && /^[A-Z]/.test(s) && !/\./.test(s)) {
    // Could be a role if it doesn't look like a section
    if (!/preface|declaration|scope|focus|qualitative|quantitative|sdg|responsibilit|monitor|review|acknowledg|objectiv|commit/i.test(lower)) {
      return true;
    }
  }
  return false;
}

function isAckHeader(s: string): boolean {
  return /acknowledg|signature|sign.?off|acknowledgement/i.test(s);
}

function dedupeResponsibilities(list: Responsibility[]): Responsibility[] {
  const seen = new Set<string>();
  const out: Responsibility[] = [];
  for (const r of list) {
    const k = r.role.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function extractStandards(rawText: string, policy: Partial<Policy>) {
  const stds = ["EcoVadis", "CDP", "GRI", "BRSR", "CSRD", "UNGC", "ILO", "ISO 14001", "ISO 14001:2015", "ISO 45001", "ISO 45001:2018", "ISO 26000", "SA8000", "TCFD", "SBTi", "RBA", "SDGs", "PSCI"];
  const found: string[] = [];
  for (const s of stds) {
    if (rawText.toLowerCase().includes(s.toLowerCase())) found.push(s);
  }
  if (found.length) policy.standards = Array.from(new Set(found));
}

function applyDefaults(policy: Partial<Policy>, policyType: PolicyType = "environmental") {
  if (policyType !== "environmental") {
    const profile = getPolicyProfile(policyType);
    if (!policy.focusAreas || policy.focusAreas.length === 0) policy.focusAreas = [...profile.focusAreas];
    else policy.focusAreas = dedupe(policy.focusAreas.map((area) => area.replace(/^\d+(?:\.\d+)*\.?\s*/, "").trim()).filter(Boolean)).slice(0, 16);
    if (!policy.responsibilities || policy.responsibilities.length < 2) policy.responsibilities = profile.responsibilities.map((item) => ({ ...item }));
    if (!policy.standards || policy.standards.length === 0) policy.standards = [...profile.standards];
    if (!policy.declaration) policy.declaration = { preface: "", declaration: "", scope: "" };
    if (!policy.qualitative) policy.qualitative = {};
    if (!policy.quantitative) policy.quantitative = [];
    if (!policy.sdgs || policy.sdgs.length === 0) policy.sdgs = [...profile.sdgs];
    if (!policy.company) policy.company = { name: "", industry: "", site: "", docNum: "", revNum: "01", effectiveDate: "", reviewDate: "", approver: "" };
    return;
  }
  if (!policy.focusAreas || policy.focusAreas.length === 0) {
    policy.focusAreas = [...FOCUS_AREAS_DEFAULT];
  } else {
    const detected = new Set<string>();
    for (const fa of policy.focusAreas) {
      const m = matchFocusArea(fa);
      if (m) detected.add(m);
    }
    for (const def of FOCUS_AREAS_DEFAULT) {
      if (policy.focusAreas.some((x) => matchFocusArea(x) === def)) detected.add(def);
    }
    const remaining = FOCUS_AREAS_DEFAULT.filter((f) => !detected.has(f));
    policy.focusAreas = [...Array.from(detected), ...remaining].slice(0, 10);
  }
  if (!policy.responsibilities || policy.responsibilities.length < 2) {
    policy.responsibilities = RESPONSIBILITIES_DEFAULT.map((r) => ({ ...r }));
  }
  if (!policy.declaration) policy.declaration = { preface: "", declaration: "", scope: "" };
  if (!policy.qualitative) policy.qualitative = {};
  if (!policy.quantitative) policy.quantitative = [];
  if (!policy.sdgs) policy.sdgs = [];
  if (!policy.company) policy.company = { name: "", industry: "", site: "", docNum: "", revNum: "01", effectiveDate: "", reviewDate: "", approver: "" };
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      if (w.length <= 3 && !/^(ehs|hr|qa|qc|rd|csr|esg)$/i.test(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function parseDate(s: string): string {
  if (!s) return "";
  const cleaned = s.trim();
  const dmy = cleaned.match(/(\d{1,2})[\s\-\/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-\/](\d{2,4})/i);
  if (dmy) {
    const mo = MONTHS.indexOf(dmy[2].toLowerCase().slice(0, 3)) + 1;
    const d = parseInt(dmy[1], 10);
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const ymd = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const dmy2 = cleaned.match(/(\d{1,2})[\s\-\/](\d{1,2})[\s\-\/](\d{2,4})/);
  if (dmy2) {
    let y = parseInt(dmy2[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${dmy2[2].padStart(2, "0")}-${dmy2[1].padStart(2, "0")}`;
  }
  const monthYear = cleaned.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
  if (monthYear) {
    const mo = MONTHS.indexOf(monthYear[1].toLowerCase().slice(0, 3)) + 1;
    return `${monthYear[2]}-${String(mo).padStart(2, "0")}-01`;
  }
  return "";
}
