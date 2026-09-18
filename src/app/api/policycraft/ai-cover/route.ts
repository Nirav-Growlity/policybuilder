import { NextResponse } from "next/server";
import sharp from "sharp";
import { getPolicyProfile, POLICY_PROFILES } from "@/lib/constants";
import {
  AI_COVER_IMAGE_MODEL,
  AI_COVER_IMAGE_SIZE,
  AI_COVER_LAYOUT_MODEL,
  buildAICoverDesignPrompt,
  buildAICoverArtworkContext,
  buildAICoverImagePrompt,
  createAICoverComposition,
  fallbackAICoverDesign,
  fallbackAICoverLayout,
  normalizeAICoverDesign,
  normalizeAICoverLayout,
} from "@/lib/ai/cover";
import type { AICoverDesign } from "@/lib/ai/cover";
import type { Policy } from "@/lib/types";

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

async function analyzeAICoverDesign(policy: Policy, imageDataUrl: string, artworkContext: string, apiKey: string): Promise<AICoverDesign> {
  const fallback = fallbackAICoverDesign(policy);
  const prompt = buildAICoverDesignPrompt(artworkContext);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_COVER_LAYOUT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: [
            { type: "text", text: prompt.user },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ] },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return fallback;
    return normalizeAICoverDesign(JSON.parse(content.replace(/```json|```/g, "").trim()), fallback);
  } catch (error) {
    console.warn("AI cover design analysis fell back to the document theme", error instanceof Error ? error.message : error);
    return fallback;
  }
}

export async function POST(request: Request) {
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
    const design = await analyzeAICoverDesign(policy, imageDataUrl, artworkContext, apiKey);
    const layout = normalizeAICoverLayout(fallbackAICoverLayout());
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
