import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClaudeParams,
  CLAUDE_MODEL,
  CONTEXT_TOKEN_CEILING,
  ClaudeContextTooLargeError,
  cleanJsonText,
  estimateTokens,
} from "./claude";

test("uses Claude Haiku 5.5 at low effort by default", () => {
  const params = buildClaudeParams({ system: "S", user: "U", maxTokens: 1_000 });
  assert.equal(params.model, CLAUDE_MODEL);
  assert.equal(CLAUDE_MODEL, "claude-haiku-5-5");
  assert.equal(params.output_config?.effort, "low");
  assert.equal(params.thinking, undefined, "thinking stays on (adaptive) by leaving the parameter out");
});

test("puts the cache breakpoint on the reference context, after the stable system text", () => {
  const params = buildClaudeParams({ system: "rules", cachedContext: "company and references", user: "task", maxTokens: 1_000 });
  const system = params.system as Array<{ text: string; cache_control?: unknown }>;
  assert.equal(system.length, 2);
  assert.equal(system[0].text, "rules");
  assert.equal(system[0].cache_control, undefined);
  assert.deepEqual(system[1].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(params.messages[0].content, "task");
});

test("caches the system text when there is no separate context", () => {
  const params = buildClaudeParams({ system: "rules", user: "task", maxTokens: 1_000 });
  const system = params.system as Array<{ cache_control?: unknown }>;
  assert.deepEqual(system[0].cache_control, { type: "ephemeral", ttl: "1h" });
});

test("sends images before the task text", () => {
  const params = buildClaudeParams({
    system: "rules",
    user: "describe",
    images: [{ mediaType: "image/jpeg", data: "abc" }],
    maxTokens: 500,
  });
  const content = params.messages[0].content as Array<{ type: string }>;
  assert.deepEqual(content.map((block) => block.type), ["image", "text"]);
});

test("refuses prompts above the 90K token ceiling", () => {
  const huge = "x".repeat(Math.ceil((CONTEXT_TOKEN_CEILING + 1_000) * 3.5));
  assert.throws(() => buildClaudeParams({ system: "rules", cachedContext: huge, user: "task", maxTokens: 500 }), ClaudeContextTooLargeError);
  assert.ok(estimateTokens(huge) > CONTEXT_TOKEN_CEILING);
});

test("strips code fences from JSON answers", () => {
  assert.equal(cleanJsonText('```json\n{"a":1}\n```'), '{"a":1}');
});
