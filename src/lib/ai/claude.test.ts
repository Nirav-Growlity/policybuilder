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

test("caches the system text and the document context separately, for an hour each", () => {
  const params = buildClaudeParams({ system: "rules", cachedContext: "company and references", user: "task", maxTokens: 1_000 });
  const system = params.system as Array<{ text: string; cache_control?: unknown }>;
  assert.equal(system.length, 2);
  assert.equal(system[0].text, "rules");
  // Its own breakpoint lets requests about other documents reuse the system text.
  assert.deepEqual(system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.deepEqual(system[1].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(params.messages[0].content, "task");
});

test("opens the user turn with reusable context behind a 5-minute breakpoint", () => {
  const params = buildClaudeParams({ system: "rules", cachedContext: "company", reusableContext: "references", user: "task", maxTokens: 1_000 });
  const content = params.messages[0].content as Array<{ type: string; text: string; cache_control?: unknown }>;
  assert.deepEqual(content.map((block) => block.text), ["references", "task"]);
  // Default TTL (5 minutes); 1-hour entries must come before it, and they do.
  assert.deepEqual(content[0].cache_control, { type: "ephemeral" });
  assert.equal(content[1].cache_control, undefined);
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
