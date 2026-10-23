import { NextResponse } from "next/server";

import { ClaudeContextTooLargeError, ClaudeKeyMissingError, ClaudeRefusalError, hasClaudeKey } from "@/lib/ai/claude";
import { HandbookOutputError, parseHandbookAiRequest, runHandbookGeneration } from "@/lib/ai/handbook-generation";
import type { HandbookAiEvent } from "@/lib/handbook/ai-contract";
import { getManual } from "@/lib/manual-repository";
import { MAX_MANUAL_JSON_BYTES, resolveManualAuth } from "@/lib/manual-request";
import { policyCraftMutationFailure } from "@/lib/policycraft-auth";

export const runtime = "nodejs";

const NDJSON = "application/x-ndjson";

function errorMessage(error: unknown): string {
  if (error instanceof ClaudeRefusalError) return "This content could not be generated. Try rephrasing the instruction.";
  if (error instanceof HandbookOutputError) return error.message;
  if (error instanceof ClaudeKeyMissingError) return error.message;
  if (error instanceof ClaudeContextTooLargeError) return "This handbook is too large to send to the AI in one request.";
  return "Generation failed. Please try again.";
}

const expected = (error: unknown) => error instanceof ClaudeRefusalError || error instanceof HandbookOutputError;

/**
 * Writes handbook content with Claude: a whole chapter, one section, a
 * refinement, the front matter, the closing or one field. With
 * `Accept: application/x-ndjson` the answer streams as {delta} lines followed
 * by one {done,result} or {error}; otherwise the JSON body is {result} or {error}.
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
  if (raw.length > MAX_MANUAL_JSON_BYTES) return NextResponse.json({ error: "Handbook is too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const parsed = parseHandbookAiRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const stored = await getManual(resolved.auth.organization.id, manualId);
  if (!stored) return NextResponse.json({ error: "Handbook not found." }, { status: 404 });
  if (stored.kind !== "handbook") return NextResponse.json({ error: "This document is not an employee handbook." }, { status: 400 });

  if (!(request.headers.get("accept")?.includes(NDJSON) ?? false)) {
    try {
      const run = await runHandbookGeneration(parsed.request, { signal: request.signal });
      return NextResponse.json({ result: run.result });
    } catch (error) {
      if (!expected(error)) console.error("Handbook AI failed", error);
      return NextResponse.json({ error: errorMessage(error) }, { status: expected(error) ? 422 : 502 });
    }
  }

  const signal = request.signal;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: HandbookAiEvent) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const run = await runHandbookGeneration(parsed.request, { signal, onDelta: (delta) => send({ delta }) });
        if (!signal.aborted) send({ done: true, result: run.result });
      } catch (error) {
        if (!signal.aborted) {
          if (!expected(error)) console.error("Handbook AI stream failed", error);
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
