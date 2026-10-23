import { NextResponse } from "next/server";
import sharp from "sharp";

import { cleanJsonText, createClaudeText, hasClaudeKey } from "@/lib/ai/claude";
import {
  AI_COVER_IMAGE_MODEL,
  AI_COVER_IMAGE_SIZE,
  buildAICoverDesignPrompt,
  buildAICoverLayoutPrompt,
  fallbackAICoverLayout,
  normalizeAICoverDesign,
  normalizeAICoverLayout,
  type AICoverDesign,
  type AICoverLayoutSuggestion,
} from "@/lib/ai/cover";
import { buildHandbookCoverArtworkContext, buildSopCoverArtworkContext, buildSopCoverImagePrompt, createSopCoverComposition, fallbackSopCoverDesign, sopCoverLibraryName, type CoverManual } from "@/lib/ai/sop-cover";
import { parseManualOfKind } from "@/lib/documents/manual-render";
import { createCoverAsset, createCoverTemplate } from "@/lib/cover-repository";
import { getManual } from "@/lib/manual-repository";
import { MAX_MANUAL_JSON_BYTES, resolveManualAuth } from "@/lib/manual-request";
import { policyCraftMutationFailure } from "@/lib/policycraft-auth";
import type { SopCover } from "@/lib/sop/types";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
type CoverPreview = { mediaType: "image/jpeg"; data: string };

/** Logs the provider's error on the server; the browser only gets the fallback text. */
async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.text().catch(() => "");
  console.error("SOP AI cover image request failed", response.status, body.slice(0, 500));
  return new Error(fallback);
}

/** A smaller JPEG of the artwork: enough to judge where text can sit, far fewer tokens. */
async function previewForAnalysis(png: Buffer): Promise<CoverPreview> {
  const jpeg = await sharp(png).resize({ height: 1152, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return { mediaType: "image/jpeg", data: jpeg.toString("base64") };
}

async function analyzeLayout(preview: CoverPreview, context: string): Promise<AICoverLayoutSuggestion> {
  const prompt = buildAICoverLayoutPrompt(context);
  try {
    const { text } = await createClaudeText({ system: prompt.system, user: prompt.user, images: [preview], maxTokens: 2_000, effort: "low" });
    return text.trim() ? normalizeAICoverLayout(JSON.parse(cleanJsonText(text))) : fallbackAICoverLayout();
  } catch (error) {
    console.warn("SOP cover layout fell back to the default", error instanceof Error ? error.message : error);
    return fallbackAICoverLayout();
  }
}

async function analyzeDesign(manual: CoverManual, preview: CoverPreview, context: string, layout: AICoverLayoutSuggestion): Promise<AICoverDesign> {
  const fallback = fallbackSopCoverDesign(manual);
  const prompt = buildAICoverDesignPrompt(context, layout);
  try {
    const { text } = await createClaudeText({ system: prompt.system, user: prompt.user, images: [preview], maxTokens: 2_000, effort: "low" });
    return text.trim() ? normalizeAICoverDesign(JSON.parse(cleanJsonText(text)), fallback) : fallback;
  } catch (error) {
    console.warn("SOP cover typography fell back to the template", error instanceof Error ? error.message : error);
    return fallback;
  }
}

/**
 * Generates an AI cover for an SOP manual or employee handbook: artwork from the image model,
 * text placement and colours from Claude, artwork stored as a cover asset
 * and the composition saved to the shared cover library. Responds with
 * `{ cover }` (variant "ai", the composition and its library id) for
 * `manual.cover`. The body may carry the current (unsaved) `manual`, the
 * `orgId` and an art-direction `instruction`; otherwise the stored manual is used.
 */
export async function POST(request: Request, context: Context) {
  const invalid = policyCraftMutationFailure(request, "json");
  if (invalid) return invalid;
  const { id } = await context.params;
  const raw = await request.text();
  if (raw.length > MAX_MANUAL_JSON_BYTES) return NextResponse.json({ error: "Manual is too large." }, { status: 413 });
  let body: { manual?: unknown; orgId?: unknown; instruction?: unknown } = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }
  }
  const resolved = await resolveManualAuth(request, {
    manualId: id,
    operation: "write",
    bodyOrgId: body.orgId,
    bodyProvidesOrg: Object.prototype.hasOwnProperty.call(body, "orgId"),
  });
  if ("response" in resolved) return resolved.response;
  const { auth } = resolved;

  const stored = await getManual<unknown>(auth.organization.id, id);
  if (!stored) return NextResponse.json({ error: "Manual not found." }, { status: 404 });
  const parsed = parseManualOfKind(stored.kind, body.manual ?? stored.manual);
  if (!parsed) return NextResponse.json({ error: stored.kind === "handbook" ? "A valid employee handbook is required." : "A valid SOP manual is required." }, { status: 400 });
  const manual: CoverManual = parsed.manual;
  const title = stored.title;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 503 });

  const instruction = typeof body.instruction === "string" ? body.instruction.replace(/\s+/g, " ").trim().slice(0, 400) : "";
  const artworkContext = parsed.kind === "handbook" ? buildHandbookCoverArtworkContext(parsed.manual, instruction) : buildSopCoverArtworkContext(parsed.manual, instruction);
  try {
    const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_COVER_IMAGE_MODEL,
        prompt: buildSopCoverImagePrompt(artworkContext, parsed.kind === "handbook" ? "employee handbook" : "SOP manual"),
        n: 1,
        size: AI_COVER_IMAGE_SIZE,
        quality: "high",
        background: "auto",
        output_format: "png",
      }),
      signal: request.signal,
    });
    if (!imageResponse.ok) throw await responseError(imageResponse, "The AI cover artwork could not be generated.");
    const imageData = await imageResponse.json() as { data?: Array<{ b64_json?: unknown; revised_prompt?: unknown }> };
    const encoded = imageData.data?.[0]?.b64_json;
    if (typeof encoded !== "string" || !encoded) throw new Error("The image service returned no artwork.");
    const png = Buffer.from(encoded, "base64");
    const metadata = await sharp(png).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || metadata.width >= metadata.height) {
      throw new Error("The image service returned artwork with invalid A4 portrait dimensions.");
    }

    // The layout prompt also names the exact overlay text, so give it the manual title and company.
    const layoutContext = JSON.stringify({ ...JSON.parse(artworkContext), title, companyName: manual.company.name, hasLogo: Boolean(manual.company.companyLogo) });
    const preview = await previewForAnalysis(png);
    const layout = hasClaudeKey() ? await analyzeLayout(preview, layoutContext) : fallbackAICoverLayout();
    const design = hasClaudeKey() ? await analyzeDesign(manual, preview, artworkContext, layout) : fallbackSopCoverDesign(manual);

    const asset = await createCoverAsset(auth, png, "image/png", metadata.width, metadata.height);
    const composition = createSopCoverComposition(manual, title, asset.id, layout, design);
    let libraryTemplateId: string | undefined;
    try {
      libraryTemplateId = await createCoverTemplate(auth, sopCoverLibraryName(title), composition, asset.id);
    } catch (error) {
      // The cover still applies; only the library copy is missing.
      console.warn("SOP cover could not be added to the library", error instanceof Error ? error.message : error);
    }
    const revisedPrompt = typeof imageData.data?.[0]?.revised_prompt === "string" ? imageData.data[0].revised_prompt : undefined;
    const cover: SopCover = { variant: "ai", composition, ...(libraryTemplateId ? { libraryTemplateId } : {}) };
    return NextResponse.json({ cover, composition, libraryTemplateId, layout, revisedPrompt });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("SOP AI cover generation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI cover generation failed." }, { status: 502 });
  }
}
