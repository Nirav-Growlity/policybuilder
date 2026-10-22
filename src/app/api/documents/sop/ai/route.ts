import { NextResponse } from "next/server";

import { ClaudeContextTooLargeError, ClaudeKeyMissingError, ClaudeRefusalError, hasClaudeKey } from "@/lib/ai/claude";
import { parseSopAiRequest, runSopGeneration, SopOutputError } from "@/lib/ai/sop-generation";
import { getManual } from "@/lib/manual-repository";
import { MAX_MANUAL_JSON_BYTES, resolveManualAuth } from "@/lib/manual-request";
import { policyCraftMutationFailure } from "@/lib/policycraft-auth";
import type { SopAiEvent } from "@/lib/sop/ai-contract";

export const runtime = "nodejs";

const NDJSON = "application/x-ndjson";

function errorMessage(error: unknown): string {
  if (error instanceof ClaudeRefusalError) return "This content could not be generated. Try rephrasing the instruction.";
  if (error instanceof SopOutputError) return error.message;
  if (error instanceof ClaudeKeyMissingError) return error.message;
  if (error instanceof ClaudeContextTooLargeError) return "This manual is too large to send to the AI in one request.";
  return "Generation failed. Please try again.";
}

/**
 * Writes SOP content with Claude: a whole SOP, one section, a refinement,
 * the front matter or the closing. With `Accept: application/x-ndjson` the
 * answer streams as {delta} lines followed by one {done,result} or {error};
 * otherwise the JSON body is {result} or {error}.
 */
export async function POST(request: Request) {
  const invalid = policyCraftMutationFailure(request, "json");
  if (invalid) return invalid;

  const manualId = new URL(request.url).searchParams.get("manualId");
  if (!manualId) return NextResponse.json({ error: "manualId is required." }, { status: 400 });
  const resolved = await resolveManualAuth(request, { manualId, operation: "write" });
  if ("response" in resolved) return resolved.response;
  if (!hasClaudeKey()) return NextResponse.json({ error: new ClaudeKeyMissingError().message }, { status: 503 });

  const raw = await request.text();
  if (raw.length > MAX_MANUAL_JSON_BYTES) return NextResponse.json({ error: "Manual is too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const parsed = parseSopAiRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const stored = await getManual(resolved.auth.organization.id, manualId);
  if (!stored) return NextResponse.json({ error: "Manual not found." }, { status: 404 });
  if (stored.kind !== "sop") return NextResponse.json({ error: "This manual is not an SOP manual." }, { status: 400 });
  const importedContext = stored.importedContext;

  if (!(request.headers.get("accept")?.includes(NDJSON) ?? false)) {
    try {
      const run = await runSopGeneration(parsed.request, { importedContext, signal: request.signal });
      return NextResponse.json({ result: run.result, source: run.source });
    } catch (error) {
      if (!(error instanceof ClaudeRefusalError || error instanceof SopOutputError)) console.error("SOP AI failed", error);
      return NextResponse.json({ error: errorMessage(error) }, { status: error instanceof ClaudeRefusalError || error instanceof SopOutputError ? 422 : 502 });
    }
  }

  const signal = request.signal;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SopAiEvent) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const run = await runSopGeneration(parsed.request, {
          importedContext,
          signal,
          onDelta: (delta) => send({ delta }),
        });
        if (!signal.aborted) send({ done: true, result: run.result });
      } catch (error) {
        if (!signal.aborted) {
          if (!(error instanceof ClaudeRefusalError || error instanceof SopOutputError)) console.error("SOP AI stream failed", error);
          send({ error: errorMessage(error) });
        }
      } finally {
        try { controller.close(); } catch { /* the client already went away */ }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": `${NDJSON}; charset=utf-8`,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
