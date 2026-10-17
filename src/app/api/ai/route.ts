import { NextRequest, NextResponse } from "next/server";
import { mockGenerate } from "@/lib/ai/mock";
import { parseRequestedCount, type AIContext } from "@/lib/ai/prompts";
import { buildTemplateContext } from "@/lib/ai/template-context";
import { buildImportedPolicyContext } from "@/lib/ai/imported-policy-context";
import { getQuantitativeYearOptions, normalizeQuantitativeTarget, REPORTING_FREQUENCY, TARGET_PERIOD } from "@/lib/quantitative";
import { getPolicyProfile, POLICY_PROFILES } from "@/lib/constants";
import { getCompanyClassificationContext } from "@/lib/company-classification";
import {
  ClaudeRefusalError,
  cleanJsonText,
  createClaudeText,
  hasClaudeKey,
  streamClaudeText,
  type ClaudeRequest,
} from "@/lib/ai/claude";
import {
  getPolicyCraftAuthResult,
  parsePolicyCraftOrganizationSelector,
  policyCraftAuthFailure,
  policyCraftMutationFailure,
} from "@/lib/policycraft-auth";

export const runtime = "nodejs";

const SYSTEM_BASE = `You are a senior sustainability consultant who writes formal sustainability policy documents for companies. You adapt the topic, commitments, measures, and frameworks to the selected policy type.
Use the provided reference policies as context for what to write and where to write what, adapting to the specific company's industry and focus areas.
CRITICAL INSTRUCTION: Analyze the reference documents to see exactly how much content is written for the specific section you are generating. Your response MUST match the same length, depth, and structure. Do not generate a 5-paragraph essay for a section that is only 3 sentences in the reference policies.
Always return valid JSON with no markdown fences.`;

function buildPrompt(ctx: AIContext): { user: string; system: string; context: string } {
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

  const activeArea = ctx.areaName
    || (ctx.type === "qualitative" ? p.focusAreas[ctx.areaIndex ?? 0] : undefined)
    || (["quantitative", "quantitative-refine"].includes(ctx.type) ? p.quantitative[ctx.areaIndex ?? 0]?.area : undefined);
  const templateReferences = buildTemplateContext({
    policyType: p.policyType,
    requestType: ctx.type,
    areaName: activeArea,
  });
  const importedReference = buildImportedPolicyContext(ctx.referencePolicy, ctx.type);
  const co = p.company;
  const classificationContext = getCompanyClassificationContext(co);
  const SYSTEM = SYSTEM_BASE;
  const CONTEXT = `COMPANY CLASSIFICATION CONTEXT: ${classificationContext || "Not provided"}. Treat these labels as factual company context and use the most specific supplied level when adapting content.\n\n${importedReference ? `${importedReference}\n\n` : ""}SECONDARY TEMPLATE CONTEXT: ${templateContext}\n\n${templateReferences}`;
  const stds = p.standards.join(", ") || profile.standards.join(", ");
  const industry = co.industryDetail || co.subCategory || co.industry || "manufacturing";
  const company = co.name || "a manufacturing company";
  const reportingPeriod = co.reportingPeriod || "FY";
  const quantitativeYears = getQuantitativeYearOptions(reportingPeriod);
  const quantitativeRules = `Use ${reportingPeriod === "FY" ? "fiscal-year labels in the format FY YYYY-YY" : "calendar years"}. reportingFrequency must be either "${REPORTING_FREQUENCY}" or "${TARGET_PERIOD}". For "${REPORTING_FREQUENCY}", baseline and deadline must be empty and the target must explicitly describe an ongoing annual activity. For "${TARGET_PERIOD}", baseline must be one of ${quantitativeYears.baseline.join(", ")} and deadline must be one of ${quantitativeYears.deadline.join(", ")}. Every target must contain a measurable percentage or numeric value; physical units, counts, rates, thresholds, and zero values are valid. Do not rely on baseline or deadline years as the measurement. Mention baseline and achievement timing naturally in the same main target sentence. Use "${TARGET_PERIOD}" unless the target is explicitly an annual activity. Keep exactly one complete measurable target sentence per item; do not add related subtopics or extra supporting points.`;
  const targetShape = '{"target": "one complete measurable target sentence", "baseline": "...", "deadline": "...", "reportingFrequency": "Target period"}';
  const reviewerDesignations = (p.company.reviewerDesignations || []).map((designation) => designation.trim()).filter(Boolean);

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
        context: CONTEXT,
        user: `Write a Preface for a ${profile.label} of ${company} in ${industry}, aligned with ${stds}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "declaration":
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write a Policy Declaration for a ${profile.label} of ${company}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "scope":
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write a Scope section for a ${profile.label} of ${company} operating at ${co.site || "its covered sites"}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "qualitative": {
      const area = p.focusAreas[ctx.areaIndex ?? 0] || "this focus area";
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write qualitative objectives for "${area}" in a ${profile.label} of ${company}.${existingStr}${customStr}\nIf no count is specified in the user directive, generate 3 new objectives. Return JSON: {"objectives": ["...", "..."]}`,
      };
    }
    case "quantitative": {
      const area = p.quantitative[ctx.areaIndex ?? 0]?.area || "this area";
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write quantitative targets for "${area}" in a ${profile.label} of ${company}. ${quantitativeRules}${existingStr}${customStr}\nIf no count is specified in the user directive, generate 3 new targets. Return JSON: {"targets": [${targetShape}]}`,
      };
    }
    case "quantitative-topic": {
      const area = ctx.areaName || "this area";
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write 3 quantitative targets for the user-defined topic "${area}" in a ${profile.label} of ${company}. ${quantitativeRules}${customStr}\nReturn JSON: {"targets": [${targetShape}]}`,
      };
    }
    case "quantitative-refine": {
      const area = ctx.areaName || p.quantitative[ctx.areaIndex ?? 0]?.area || "this area";
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Refine this single quantitative target for "${area}" in a ${profile.label} of ${company}: ${JSON.stringify(ctx.existingContent)}. Preserve the user's intent while making it specific and measurable. ${quantitativeRules}${customStr}\nReturn JSON: {"targets": [${targetShape}]}`,
      };
    }
    case "sdg":
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `For a ${profile.label} of ${company} in ${industry}, which UN SDG numbers are relevant?${existingStr}${customStr}\nReturn JSON: {"sdgs": [1,3,8]}`,
      };
    case "responsibilities":
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write responsibilities for a ${profile.label} of ${company}.${existingStr}${customStr}\nIf no count is specified in the user directive, generate 5-6 responsibilities. Return JSON: {"responsibilities": [{"role": "...", "duty": "..."}]}`,
      };
    case "monitoring":
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write a Monitoring, Reporting & Transparency section for a ${profile.label} of ${company}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "review":
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write a Review Mechanism & Continuous Improvement section for a ${profile.label} of ${company}. Name the responsible reviewer designation(s) explicitly (for example, Sustainability Manager, EHS Manager, Compliance Officer, or Executive Committee); do not refer only to a department or function. ${reviewerDesignations.length ? `Use these configured reviewer designation(s): ${reviewerDesignations.join(", ")}.` : "If no designation is configured, propose at least one suitable named designation."} State review frequency, triggers, approval, feedback, and communication.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
    case "all":
    default:
      return {
        system: SYSTEM,
        context: CONTEXT,
        user: `Write a 2-sentence summary for a ${profile.label} of ${company}.${existingStr}${customStr}\nReturn JSON: {"text": "..."}`,
      };
  }
}

export async function POST(req: NextRequest) {
  const mutationFailure = policyCraftMutationFailure(req, "json");
  if (mutationFailure) return mutationFailure;

  const selector = parsePolicyCraftOrganizationSelector(req.nextUrl.searchParams.get("orgId"));
  if (!selector.provided || !selector.valid) {
    return NextResponse.json({ error: "A valid organization is required." }, { status: 400 });
  }

  let access: Awaited<ReturnType<typeof getPolicyCraftAuthResult>>;
  try {
    access = await getPolicyCraftAuthResult({
      organizationId: selector.organizationId,
      documentId: req.nextUrl.searchParams.get("documentId") || undefined,
      operation: "write",
    });
  } catch (error) {
    const failure = policyCraftAuthFailure(error);
    if (failure) return failure;
    throw error;
  }
  if (!access.auth) return access.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let ctx: AIContext;
  try {
    ctx = await req.json() as AIContext;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!ctx?.policy || !Object.prototype.hasOwnProperty.call(POLICY_PROFILES, ctx.policy.policyType)) {
    return NextResponse.json({ error: "Unsupported policy type" }, { status: 400 });
  }
  const streaming = req.headers.get("accept")?.includes(NDJSON) ?? false;

  if (streaming) return streamGeneration(ctx, req.signal);

  if (!hasClaudeKey()) {
    return NextResponse.json(mockGenerate(ctx));
  }

  try {
    const { text } = await createClaudeText(toClaudeRequest(ctx), req.signal);
    return NextResponse.json(finalizeModelOutput(text, ctx));
  } catch (e) {
    console.error("AI route failed", e);
    return NextResponse.json(mockGenerate(ctx));
  }
}

const NDJSON = "application/x-ndjson";

/** Generous enough for the longest section (a full quantitative table), short enough to stay fast. */
const POLICY_MAX_TOKENS = 6_000;

function toClaudeRequest(ctx: AIContext): ClaudeRequest {
  const { system, context, user } = buildPrompt(ctx);
  return { system, cachedContext: context, user, maxTokens: POLICY_MAX_TOKENS, effort: "low" };
}

/** Turns the model's raw JSON text into the response the builder expects. */
function finalizeModelOutput(text: string, ctx: AIContext) {
  const clean = cleanJsonText(text);
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed.targets)) {
      parsed.targets = parsed.targets.map((target: Record<string, unknown>) =>
        normalizeQuantitativeTarget(target, ctx.policy.company.reportingPeriod || "FY")
      );
    }
    return { ...parsed, source: "claude" };
  } catch {
    return { text: clean, source: "claude" };
  }
}

type StreamEvent = { delta: string } | { done: true; result: unknown } | { error: string };

/**
 * Streams a generation as newline-delimited JSON: `delta` events carry the
 * model's raw JSON text as it arrives, and one `done` event carries the final,
 * normalised result. Without an API key the mock answer is streamed the same
 * way so the writing experience matches.
 */
function streamGeneration(ctx: AIContext, signal: AbortSignal) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        if (hasClaudeKey() && await streamFromClaude(ctx, signal, send)) return;
        await streamMock(ctx, signal, send);
      } catch (error) {
        if (!signal.aborted) {
          console.error("AI stream failed", error);
          send({ error: "Generation failed." });
        }
      } finally {
        try { controller.close(); } catch { /* the client already went away */ }
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": `${NDJSON}; charset=utf-8`,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Returns false when Claude fails before any text arrives, so the caller can
 * fall back to the mock answer. A refusal or failure mid-stream is reported
 * as an error event instead, because the client already shows partial text.
 */
async function streamFromClaude(ctx: AIContext, signal: AbortSignal, send: (event: StreamEvent) => void) {
  let sentText = false;
  try {
    const { text } = await streamClaudeText(toClaudeRequest(ctx), (delta) => {
      sentText = true;
      send({ delta });
    }, signal);
    send({ done: true, result: finalizeModelOutput(text, ctx) });
    return true;
  } catch (error) {
    if (signal.aborted) return true;
    if (error instanceof ClaudeRefusalError) {
      send({ error: "This section could not be generated. Try rephrasing the instruction." });
      return true;
    }
    console.error("Claude error", error);
    if (sentText) throw error;
    return false;
  }
}

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

/** Streams the mock answer in word-sized pieces at a model-like pace. */
async function streamMock(ctx: AIContext, signal: AbortSignal, send: (event: StreamEvent) => void) {
  const result = mockGenerate(ctx);
  const pieces = JSON.stringify(result).match(/\s*\S{1,7}/g) ?? [];
  await pause(450, signal);
  for (const piece of pieces) {
    if (signal.aborted) return;
    send({ delta: piece });
    await pause(16 + Math.random() * 34, signal);
  }
  send({ done: true, result });
}
