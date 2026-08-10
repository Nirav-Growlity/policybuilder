import { NextRequest, NextResponse } from "next/server";
import { mockGenerate } from "@/lib/ai/mock";
import { parseRequestedCount, type AIContext } from "@/lib/ai/prompts";
import { getQuantitativeYearOptions, normalizeQuantitativeTarget, REPORTING_FREQUENCY, TARGET_PERIOD } from "@/lib/quantitative";
import fs from "fs";
import path from "path";
import { getPolicyProfile } from "@/lib/constants";

export const runtime = "nodejs";

function getTemplatesContext(policyType: string): string {
  try {
    const dir = path.join(process.cwd(), "data", "seed-policies");
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const templates = files.map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      return JSON.parse(content);
    }).filter(template => (template.policy?.policyType || "environmental") === policyType).map(template => {
      const policy = template.policy || {};
      return {
        name: template.name, sourcePath: template.sourcePath, declaration: policy.declaration,
        definitions: policy.definitions,
        focusAreas: (policy.focusAreas || []).slice(0, 12),
        qualitative: Object.fromEntries(Object.entries(policy.qualitative || {}).map(([area, items]) => [area, Array.isArray(items) ? items.slice(0, 6) : items])),
        quantitative: (policy.quantitative || []).map((area: { area: string; targets?: unknown[] }) => ({ area: area.area, targets: (area.targets || []).slice(0, 6) })),
        responsibilities: (policy.responsibilities || []).slice(0, 6), monitoring: String(policy.monitoring || "").slice(0, 1200), reviewMechanism: String(policy.reviewMechanism || "").slice(0, 900),
      };
    });
    return `Reference templates for the active ${policyType} policy type. Use them only as drafting evidence: preserve the selected policy type, adapt language to the company, and never copy company-specific facts or targets without user confirmation. Match the relevant section's depth and structure.\n${JSON.stringify(templates)}`;
  } catch (e) {
    console.warn("Failed to load seed policies as AI context", e);
    return "Ensure your generated content matches the selected policy type and follows a formal, practical policy structure.";
  }
}

const SYSTEM_BASE = `You are a senior sustainability consultant who writes formal sustainability policy documents for companies. You adapt the topic, commitments, measures, and frameworks to the selected policy type.
Use the provided reference policies as context for what to write and where to write what, adapting to the specific company's industry and focus areas.
CRITICAL INSTRUCTION: Analyze the reference documents to see exactly how much content is written for the specific section you are generating. Your response MUST match the same length, depth, and structure. Do not generate a 5-paragraph essay for a section that is only 3 sentences in the reference policies.
Always return valid JSON with no markdown fences.`;

function buildPrompt(ctx: AIContext): { user: string; system: string } {
  const p = ctx.policy;
  const profile = getPolicyProfile(p.policyType);
  const tpl = p.presentationTemplate || "standard";
  let templateContext = "";
  
  if (tpl === "executive") {
    templateContext = "The user has selected an 'Executive Summary' template. Your generated content should be highly concise and focus strictly on high-level targets and immediate responsibilities. Do not overproduce content, take reference from shorter policies.";
  } else if (tpl === "comprehensive") {
    templateContext = "The user has selected a 'Comprehensive ESG' template. Your generated content should be detailed and in-depth, suitable for a comprehensive ESG report. Do not underproduce content, take reference from the more exhaustive policies.";
  } else {
    templateContext = "The user has selected a 'Standard ISO 14001' template. Your generated content should have a traditional length, taking reference from standard-length policies.";
  }

  const SYSTEM = `${SYSTEM_BASE}\n\nTEMPLATE CONTEXT: ${templateContext}\n\n${getTemplatesContext(p.policyType)}`;
  const co = p.company;
  const stds = p.standards.join(", ") || profile.standards.join(", ");
  const industry = co.industry || "manufacturing";
  const company = co.name || "a manufacturing company";
  const reportingPeriod = co.reportingPeriod || "FY";
  const quantitativeYears = getQuantitativeYearOptions(reportingPeriod);
  const quantitativeRules = `Use ${reportingPeriod === "FY" ? "fiscal-year labels in the format FY YYYY-YY" : "calendar years"}. reportingFrequency must be either "${REPORTING_FREQUENCY}" or "${TARGET_PERIOD}". For "${REPORTING_FREQUENCY}", baseline and deadline must be empty. For "${TARGET_PERIOD}", baseline must be one of ${quantitativeYears.baseline.join(", ")} and deadline must be one of ${quantitativeYears.deadline.join(", ")}. Use "${TARGET_PERIOD}" unless the target is explicitly an annual activity.`;

  const existingStr =
    ctx.existingContent &&
    (Array.isArray(ctx.existingContent)
      ? ctx.existingContent.length > 0
      : Boolean(ctx.existingContent))
      ? `\n\nEXISTING CONTENT ALREADY WRITTEN IN THIS SECTION:\n${JSON.stringify(
          ctx.existingContent
        )}\nCRITICAL INSTRUCTION: Do NOT duplicate or rewrite any of the points listed above. Generate ONLY NEW, distinct points that complement the existing ones.`
      : "";

  const reqCount = parseRequestedCount(ctx.customPrompt);
  const customStr = ctx.customPrompt
    ? `\n\nHIGHEST PRIORITY USER DIRECTIVE: "${ctx.customPrompt}".\n${
        reqCount
          ? `CRITICAL QUANTITY REQUIREMENT: Generate EXACTLY ${reqCount} new unique item(s). Do NOT output more than ${reqCount} item(s).`
          : "Strictly follow the user directive for content, tone, and quantity."
      }`
    : "";

  switch (ctx.type) {
    case "preface":
      return {
        system: SYSTEM,
        user: `Write a Preface for a ${profile.label} of ${company} in ${industry}, aligned with ${stds}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "declaration":
      return {
        system: SYSTEM,
        user: `Write a Policy Declaration for a ${profile.label} of ${company}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "scope":
      return {
        system: SYSTEM,
        user: `Write a Scope section for a ${profile.label} of ${company} operating at ${co.site || "its covered sites"}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "focus":
      return {
        system: SYSTEM,
        user: `Suggest key focus areas for a ${profile.label} of ${company} in ${industry}, aligned with ${stds}.${existingStr}${customStr}\nIf no count is specified in the user directive, suggest 7-9 areas. Return JSON: {"areas": ["...", "..."]}`,
      };
    case "qualitative": {
      const area = p.focusAreas[ctx.areaIndex ?? 0] || "this focus area";
      return {
        system: SYSTEM,
        user: `Write qualitative objectives for "${area}" in a ${profile.label} of ${company}.${existingStr}${customStr}\nIf no count is specified in the user directive, generate 3 new objectives. Return JSON: {"objectives": ["...", "..."]}`,
      };
    }
    case "quantitative": {
      const area = p.quantitative[ctx.areaIndex ?? 0]?.area || "this area";
      return {
        system: SYSTEM,
        user: `Write quantitative targets for "${area}" in a ${profile.label} of ${company}. ${quantitativeRules}${existingStr}${customStr}\nIf no count is specified in the user directive, generate 3 new targets. Return JSON: {"targets": [{"target": "...", "baseline": "...", "deadline": "...", "reportingFrequency": "Target period"}]}`,
      };
    }
    case "quantitative-topic": {
      const area = ctx.areaName || "this area";
      return {
        system: SYSTEM,
        user: `Write 3 quantitative targets for the user-defined topic "${area}" in a ${profile.label} of ${company}. ${quantitativeRules}${customStr}\nReturn JSON: {"targets": [{"target": "...", "baseline": "...", "deadline": "...", "reportingFrequency": "Target period"}]}`,
      };
    }
    case "quantitative-refine": {
      const area = ctx.areaName || p.quantitative[ctx.areaIndex ?? 0]?.area || "this area";
      return {
        system: SYSTEM,
        user: `Refine this single quantitative target for "${area}" in a ${profile.label} of ${company}: ${JSON.stringify(ctx.existingContent)}. Preserve the user's intent while making it specific and measurable. ${quantitativeRules}${customStr}\nReturn JSON: {"targets": [{"target": "...", "baseline": "...", "deadline": "...", "reportingFrequency": "Target period"}]}`,
      };
    }
    case "sdg":
      return {
        system: SYSTEM,
        user: `For a ${profile.label} of ${company} in ${industry}, which UN SDG numbers are relevant?${existingStr}${customStr}\nReturn JSON: {"sdgs": [1,3,8]}`,
      };
    case "responsibilities":
      return {
        system: SYSTEM,
        user: `Write responsibilities for a ${profile.label} of ${company}.${existingStr}${customStr}\nIf no count is specified in the user directive, generate 5-6 responsibilities. Return JSON: {"responsibilities": [{"role": "...", "duty": "..."}]}`,
      };
    case "monitoring":
      return {
        system: SYSTEM,
        user: `Write a Monitoring, Reporting & Transparency section for a ${profile.label} of ${company}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "review":
      return {
        system: SYSTEM,
        user: `Write a Review Mechanism & Continuous Improvement section for a ${profile.label} of ${company}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "all":
    default:
      return {
        system: SYSTEM,
        user: `Write a 2-sentence summary for a ${profile.label} of ${company}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
  }
}

export async function POST(req: NextRequest) {
  const ctx = (await req.json()) as AIContext;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(mockGenerate(ctx));
  }

  try {
    const { user, system } = buildPrompt(ctx);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI error", err);
      return NextResponse.json(mockGenerate(ctx));
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed.targets)) {
        parsed.targets = parsed.targets.map((target: Record<string, unknown>) =>
          normalizeQuantitativeTarget(target, ctx.policy.company.reportingPeriod || "FY")
        );
      }
      return NextResponse.json({ ...parsed, source: "openai" });
    } catch {
      return NextResponse.json({ text: clean, source: "openai" });
    }
  } catch (e) {
    console.error("AI route failed", e);
    return NextResponse.json(mockGenerate(ctx));
  }
}
