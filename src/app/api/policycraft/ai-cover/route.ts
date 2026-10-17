import { NextResponse } from "next/server";
import sharp from "sharp";
import { getPolicyProfile, POLICY_PROFILES } from "@/lib/constants";
import {
  AI_COVER_IMAGE_MODEL,
  AI_COVER_IMAGE_SIZE,
  buildAICoverDesignPrompt,
  buildAICoverArtworkContext,
  buildAICoverImagePrompt,
  buildAICoverLayoutPrompt,
  createAICoverComposition,
  fallbackAICoverDesign,
  fallbackAICoverLayout,
  normalizeAICoverDesign,
  normalizeAICoverLayout,
} from "@/lib/ai/cover";
import type { AICoverDesign } from "@/lib/ai/cover";
import { cleanJsonText, createClaudeText, hasClaudeKey } from "@/lib/ai/claude";
import type { Policy } from "@/lib/types";
import { getPolicyCraftAuthResult, parsePolicyCraftOrganizationSelector, policyCraftMutationFailure } from "@/lib/policycraft-auth";

export const runtime = "nodejs";

function isPolicy(value: unknown): value is Policy {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Policy>;
  const company = candidate.company;
  const declaration = candidate.declaration;
  return typeof candidate.policyType === "string"
    && Object.prototype.hasOwnProperty.call(POLICY_PROFILES, candidate.policyType)
    && !!company && typeof company === "object"
    && typeof company.name === "string"
    && typeof company.industry === "string"
    && !!declaration && typeof declaration === "object"
    && typeof declaration.declaration === "string"
    && typeof declaration.scope === "string"
    && Array.isArray(candidate.standards)
    && Array.isArray(candidate.focusAreas)
    && Array.isArray(candidate.quantitative);
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.text().catch(() => "");
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: unknown } | string };
      const message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
      if (typeof message === "string" && message.trim()) return new Error(message.slice(0, 240));
    } catch {
      // Keep provider response details out of the client response.
    }
  }
  return new Error(fallback);
}

type CoverPreview = { mediaType: "image/jpeg"; data: string };

/** A smaller JPEG of the artwork: enough detail to judge text zones, far fewer tokens than the full PNG. */
async function coverPreviewForAnalysis(encodedPng: string): Promise<CoverPreview> {
  const jpeg = await sharp(Buffer.from(encodedPng, "base64"))
    .resize({ height: 1152, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { mediaType: "image/jpeg", data: jpeg.toString("base64") };
}

async function analyzeAICoverLayout(preview: CoverPreview, artworkContext: string) {
  const fallback = fallbackAICoverLayout();
  const prompt = buildAICoverLayoutPrompt(artworkContext);
  try {
    const { text } = await createClaudeText({
      system: prompt.system,
      user: prompt.user,
      images: [preview],
      maxTokens: 2_000,
      effort: "low",
    });
    if (!text.trim()) return fallback;
    return normalizeAICoverLayout(JSON.parse(cleanJsonText(text)));
  } catch (error) {
    console.warn("AI cover layout analysis fell back to the safe default", error instanceof Error ? error.message : error);
    return fallback;
  }
}

async function analyzeAICoverDesign(policy: Policy, preview: CoverPreview, artworkContext: string, layout: ReturnType<typeof fallbackAICoverLayout>): Promise<AICoverDesign> {
  const fallback = fallbackAICoverDesign(policy);
  const prompt = buildAICoverDesignPrompt(artworkContext, layout);
  try {
    const { text } = await createClaudeText({
      system: prompt.system,
      user: prompt.user,
      images: [preview],
      maxTokens: 2_000,
      effort: "low",
    });
    if (!text.trim()) return fallback;
    return normalizeAICoverDesign(JSON.parse(cleanJsonText(text)), fallback);
  } catch (error) {
    console.warn("AI cover design analysis fell back to the document theme", error instanceof Error ? error.message : error);
    return fallback;
  }
}

export async function POST(request: Request) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const { auth, response } = await getPolicyCraftAuthResult({ ...(selector.provided ? { organizationId: selector.organizationId } : {}), operation: "write" });
  if (!auth) return response || NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  const body = await request.json().catch(() => null) as { policy?: unknown } | null;
  if (!isPolicy(body?.policy)) return NextResponse.json({ error: "A valid policy is required." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 503 });

  const policy = body.policy;
  const artworkContext = buildAICoverArtworkContext(policy);

  try {
    const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_COVER_IMAGE_MODEL,
        prompt: buildAICoverImagePrompt(artworkContext),
        n: 1,
        size: AI_COVER_IMAGE_SIZE,
        quality: "high",
        background: "auto",
        output_format: "png",
      }),
    });
    if (!imageResponse.ok) throw await responseError(imageResponse, "The AI cover artwork could not be generated.");
    const imageData = await imageResponse.json() as { data?: Array<{ b64_json?: unknown; revised_prompt?: unknown }> };
    const encoded = imageData.data?.[0]?.b64_json;
    if (typeof encoded !== "string" || !encoded) throw new Error("The image service returned no artwork.");
    const metadata = await sharp(Buffer.from(encoded, "base64")).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || metadata.width >= metadata.height) throw new Error("The image service returned artwork with invalid A4 portrait dimensions.");
    const imageDataUrl = `data:image/png;base64,${encoded}`;
    const preview = await coverPreviewForAnalysis(encoded);
    const layout = hasClaudeKey() ? await analyzeAICoverLayout(preview, artworkContext) : fallbackAICoverLayout();
    const design = hasClaudeKey() ? await analyzeAICoverDesign(policy, preview, artworkContext, layout) : fallbackAICoverDesign(policy);
    const revisedPrompt = typeof imageData.data?.[0]?.revised_prompt === "string" ? imageData.data[0].revised_prompt : undefined;

    const composition = createAICoverComposition(policy, imageDataUrl, layout, design);
    return NextResponse.json({
      composition,
      layout,
      revisedPrompt,
      policyLabel: getPolicyProfile(policy.policyType).label,
    });
  } catch (error) {
    console.error("AI cover generation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI cover generation failed." }, { status: 502 });
  }
}
