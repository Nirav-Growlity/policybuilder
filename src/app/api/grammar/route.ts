import { NextRequest, NextResponse } from "next/server";
import {
  getPolicyCraftAuthResult,
  parsePolicyCraftOrganizationSelector,
  policyCraftAuthFailure,
  policyCraftMutationFailure,
} from "@/lib/policycraft-auth";

export const runtime = "nodejs";

const INSTRUCTIONS = `You are a precise proofreader. Correct only spelling, punctuation, capitalization, grammar, and clear typographical errors in the user's text. Preserve the original meaning, facts, tone, formatting, terminology, proper nouns, abbreviations, numbers, and line breaks. Do not add ideas, remove ideas, paraphrase, summarize, or explain. Return only the corrected text.`;

export async function POST(request: NextRequest) {
  const mutationFailure = policyCraftMutationFailure(request, "json");
  if (mutationFailure) return mutationFailure;

  const selector = parsePolicyCraftOrganizationSelector(request.nextUrl.searchParams.get("orgId"));
  if (!selector.provided || !selector.valid) {
    return NextResponse.json({ error: "A valid organization is required." }, { status: 400 });
  }

  let access: Awaited<ReturnType<typeof getPolicyCraftAuthResult>>;
  try {
    access = await getPolicyCraftAuthResult({
      organizationId: selector.organizationId,
      documentId: request.nextUrl.searchParams.get("documentId") || undefined,
      operation: "write",
    });
  } catch (error) {
    const failure = policyCraftAuthFailure(error);
    if (failure) return failure;
    throw error;
  }
  if (!access.auth) return access.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let text: unknown;
  try {
    ({ text } = await request.json() as { text?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > 20_000) {
    return NextResponse.json({ error: "Text is too long to check" }, { status: 413 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key is not configured" }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        reasoning: { effort: "none" },
        text: { verbosity: "low" },
        max_output_tokens: Math.min(8_192, Math.max(256, Math.ceil(text.length / 3) + 64)),
        instructions: INSTRUCTIONS,
        input: text,
      }),
    });

    if (!response.ok) {
      console.error("Grammar API error", response.status, await response.text());
      return NextResponse.json({ error: "Grammar check failed" }, { status: 502 });
    }

    const data = await response.json() as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    // `output_text` is a convenience property in the SDK. Fetch responses expose
    // the generated text inside output[].content[] instead.
    const corrected = data.output_text ?? data.output
      ?.flatMap((item) => item.content || [])
      .filter((content) => content.type === "output_text")
      .map((content) => content.text || "")
      .join("");
    if (!corrected?.trim()) return NextResponse.json({ error: "Grammar check returned no text" }, { status: 502 });
    return NextResponse.json({ text: corrected });
  } catch (error) {
    console.error("Grammar route failed", error);
    return NextResponse.json({ error: "Grammar check failed" }, { status: 502 });
  }
}
