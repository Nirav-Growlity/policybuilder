import assert from "node:assert/strict";
import test from "node:test";

import type { SopAiEvent, SopAiResult, SopGenerationState } from "./ai-contract";
import { startManualGeneration, streamSopAi } from "./ai-client";
import { createEmptyManual, createEmptySop } from "./initial-manual";
import type { SopManual } from "./types";

type Script = (call: { type: string; sopId?: string; attempt: number }) => { events: SopAiEvent[]; delayMs?: number; hang?: boolean };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sopResult = (text: string): SopAiResult => ({
  type: "sop",
  sop: { sections: [{ id: "s", kind: "purpose", title: "Purpose", enabled: true, blocks: [{ id: "b", type: "paragraph", text }] }] },
});

/** Replaces fetch with a scripted NDJSON stream per request; records concurrency. */
function mockFetch(script: Script) {
  const original = globalThis.fetch;
  const attempts = new Map<string, number>();
  const stats = { inFlight: 0, maxInFlight: 0, calls: [] as Array<{ type: string; sopId?: string; url: string }> };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { type: string; sopId?: string };
    const key = `${body.type}:${body.sopId ?? ""}`;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    stats.calls.push({ type: body.type, sopId: body.sopId, url: String(input) });
    const plan = script({ type: body.type, sopId: body.sopId, attempt });
    const signal = init?.signal ?? undefined;
    stats.inFlight += 1;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    const encoder = new TextEncoder();
    let finished = false;
    const finish = () => { if (!finished) { finished = true; stats.inFlight -= 1; } };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        signal?.addEventListener("abort", () => {
          finish();
          try { controller.error(new DOMException("aborted", "AbortError")); } catch { /* closed */ }
        }, { once: true });
        for (const event of plan.events) {
          await wait(plan.delayMs ?? 5);
          if (signal?.aborted) return;
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        if (plan.hang) return;
        finish();
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
  }) as typeof fetch;
  return { stats, restore: () => { globalThis.fetch = original; } };
}

function manualWith(count: number): SopManual {
  return createEmptyManual({ sops: Array.from({ length: count }, (_, index) => createEmptySop({ title: `SOP ${index + 1}` })) });
}

function run(manual: SopManual, options: { concurrency?: number; includeFrontMatter?: boolean } = {}) {
  const states: SopGenerationState[] = [];
  const done = new Map<string, SopAiResult>();
  let frontMatter: SopAiResult | undefined;
  let frontMatterError: string | undefined;
  const handle = startManualGeneration({
    orgId: 7,
    manualId: "m-1",
    getManual: () => manual,
    sopIds: manual.sops.map((sop) => sop.id),
    includeFrontMatter: options.includeFrontMatter ?? false,
    concurrency: options.concurrency,
    onState: (state) => states.push(state),
    onSopDone: (sopId, result) => done.set(sopId, result),
    onFrontMatterDone: (result) => { frontMatter = result; },
    onFrontMatterError: (message) => { frontMatterError = message; },
  });
  const settled = async (expected: number, timeoutMs = 3_000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const final = new Set(states.filter((state) => state.status === "done" || state.status === "failed").map((state) => state.sopId));
      const latest = manual.sops.filter((sop) => {
        const last = [...states].reverse().find((state) => state.sopId === sop.id);
        return last && (last.status === "done" || last.status === "failed");
      });
      if (final.size >= expected && latest.length >= expected) return;
      await wait(10);
    }
    throw new Error("queue did not settle");
  };
  const lastState = (sopId: string) => [...states].reverse().find((state) => state.sopId === sopId);
  return { handle, states, done, settled, lastState, frontMatter: () => frontMatter, frontMatterError: () => frontMatterError };
}

test("streamSopAi posts NDJSON to the route and reports partial JSON", async () => {
  const { stats, restore } = mockFetch(() => ({ events: [{ delta: '{"sections":[{"kind":"purpose",' }, { delta: '"title":"Purpose"}]}' }, { done: true, result: sopResult("ok") }] }));
  try {
    const manual = manualWith(1);
    const partials: unknown[] = [];
    const result = await streamSopAi({ type: "sop", manual, sopId: manual.sops[0].id }, { orgId: 7, manualId: "m 1", onPartial: (partial) => partials.push(partial) });
    assert.equal(result.type, "sop");
    assert.equal(stats.calls[0].url, "/api/documents/sop/ai?orgId=7&manualId=m%201");
    assert.ok(partials.length >= 1);
    assert.deepEqual(partials.at(-1), { sections: [{ kind: "purpose", title: "Purpose" }] });
  } finally {
    restore();
  }
});

test("streamSopAi rejects with the route's error message", async () => {
  const { restore } = mockFetch(() => ({ events: [{ delta: "{" }, { error: "This content could not be generated." }] }));
  try {
    const manual = manualWith(1);
    await assert.rejects(streamSopAi({ type: "sop", manual, sopId: manual.sops[0].id }, { orgId: 1, manualId: "m" }), /could not be generated/);
  } finally {
    restore();
  }
});

test("the queue respects the concurrency limit, warms the cache with one SOP first and reports partial sections", async () => {
  const { stats, restore } = mockFetch(({ type, sopId }) => type === "front-matter" ? {
    events: [{ done: true, result: { type: "front-matter", frontMatter: { introduction: [], objective: [], benefits: ["b"], coreValues: [], howToUse: [] } } }],
  } : ({
    delayMs: 15,
    events: [{ delta: '{"sections":[{"kind":"purpose","title":"Purpose","blocks":[{"type":"paragraph","text":"To' }, { delta: ' define"}]}]}' }, { done: true, result: sopResult(String(sopId)) }],
  }));
  try {
    const manual = manualWith(6);
    const queue = run(manual, { concurrency: 2, includeFrontMatter: true });
    // Before the first SOP sends text, only it is running.
    assert.equal(stats.calls.length, 1);
    await queue.settled(6);
    assert.equal(queue.done.size, 6);
    assert.ok(stats.maxInFlight <= 3, `max in flight ${stats.maxInFlight} (2 SOPs + front matter)`);
    assert.ok(queue.states.some((state) => state.status === "writing" && state.partialSections?.[0]?.kind === "purpose"));
    await wait(50);
    assert.equal(queue.frontMatter()?.type, "front-matter", "front matter ran alongside the SOPs");
  } finally {
    restore();
  }
});

test("a failed SOP is retried once automatically, then reported as failed", async () => {
  const { stats, restore } = mockFetch(({ sopId, attempt }) => {
    if (sopId === "flaky" && attempt === 1) return { events: [{ error: "Temporary failure." }] };
    if (sopId === "broken") return { events: [{ error: "Still broken." }] };
    return { events: [{ delta: "{}" }, { done: true, result: sopResult("ok") }] };
  });
  try {
    const manual = manualWith(3);
    manual.sops[0].id = "flaky";
    manual.sops[1].id = "broken";
    const queue = run(manual);
    await queue.settled(3);
    assert.equal(queue.lastState("flaky")?.status, "done");
    assert.equal(queue.lastState("broken")?.status, "failed");
    assert.equal(queue.lastState("broken")?.error, "Still broken.");
    assert.equal(stats.calls.filter((call) => call.sopId === "broken").length, 2);
    assert.ok(!queue.done.has("broken"));

    // A manual retry runs it again.
    queue.handle.retry("broken");
    await wait(80);
    assert.equal(stats.calls.filter((call) => call.sopId === "broken").length, 4);
  } finally {
    restore();
  }
});

test("cancel aborts running and queued SOPs without applying anything", async () => {
  const { stats, restore } = mockFetch(() => ({ hang: true, events: [{ delta: "{" }] }));
  try {
    const manual = manualWith(4);
    const queue = run(manual, { concurrency: 2, includeFrontMatter: true });
    await wait(60);
    queue.handle.cancel();
    await wait(30);
    for (const sop of manual.sops) {
      assert.equal(queue.lastState(sop.id)?.status, "failed");
      assert.equal(queue.lastState(sop.id)?.error, "Stopped.");
    }
    assert.equal(queue.done.size, 0);
    assert.equal(stats.inFlight, 0);
    assert.equal(queue.frontMatterError(), "Stopped.");
  } finally {
    restore();
  }
});
