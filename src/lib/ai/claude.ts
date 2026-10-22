import Anthropic from "@anthropic-ai/sdk";

/** The one text model for the whole app: policies, SOP manuals, grammar and cover layouts. */
export const CLAUDE_MODEL = "claude-haiku-5-5";

/**
 * Every request stays under 100K input tokens. That keeps Haiku 5.5 on its
 * lower price tier and keeps time-to-first-token short. Prompts aim for the
 * target and are trimmed to fit; the ceiling is a hard stop.
 */
export const CONTEXT_TOKEN_TARGET = 40_000;
export const CONTEXT_TOKEN_CEILING = 90_000;

/** Rough token estimate for English prose with some JSON: about 3.5 characters per token. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.5);
}

export type ClaudeEffort = "low" | "medium" | "high";

export class ClaudeRefusalError extends Error {
  constructor(readonly category: string | null) {
    super("The model declined to write this content.");
    this.name = "ClaudeRefusalError";
  }
}

export class ClaudeContextTooLargeError extends Error {
  constructor(readonly estimatedTokens: number) {
    super(`Prompt is about ${estimatedTokens} tokens, above the ${CONTEXT_TOKEN_CEILING} token ceiling.`);
    this.name = "ClaudeContextTooLargeError";
  }
}

export class ClaudeKeyMissingError extends Error {
  constructor() {
    super("Anthropic API key is not configured.");
    this.name = "ClaudeKeyMissingError";
  }
}

let cachedClient: Anthropic | null = null;

export function hasClaudeKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getClaudeClient() {
  if (!hasClaudeKey()) return null;
  cachedClient ??= new Anthropic();
  return cachedClient;
}

/**
 * Cache layout (Haiku 5.5 caches any prefix of 512+ tokens). The structured
 * output schema renders ahead of the system prompt, so a different schema is
 * a different prefix: keep schemas stable per route.
 * - `system`: 1-hour breakpoint, shared by every request on the route.
 * - `cachedContext`: 1-hour breakpoint, shared by every request about one
 *   document (company, sites, register).
 * - `reusableContext`: 5-minute breakpoint at the start of the user turn, for
 *   material that follow-up requests about the same item repeat (the reference
 *   SOPs for one section). Longer TTLs must come first, so it is last.
 */
export interface ClaudeRequest {
  /** Stable instructions. Keep this byte-identical across requests so it caches. */
  system: string;
  /** Reference material shared by every request about one document. Keep it byte-stable while the document is edited. */
  cachedContext?: string;
  /** Material that follow-up requests about the same item send again; it opens the user turn. */
  reusableContext?: string;
  /** The volatile part: the task for this one request. */
  user: string;
  /** Images shown to the model before the task text, as base64 without a data: prefix. */
  images?: Array<{ mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string }>;
  maxTokens: number;
  effort?: ClaudeEffort;
  format?: Anthropic.Messages.JSONOutputFormat;
}

const HOUR = { type: "ephemeral", ttl: "1h" } as const;

export function buildClaudeParams(request: ClaudeRequest): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const estimated = estimateTokens(request.system + (request.cachedContext ?? "") + (request.reusableContext ?? "") + request.user);
  if (estimated > CONTEXT_TOKEN_CEILING) throw new ClaudeContextTooLargeError(estimated);

  const system: Anthropic.Messages.TextBlockParam[] = [{ type: "text", text: request.system, cache_control: HOUR }];
  if (request.cachedContext) system.push({ type: "text", text: request.cachedContext, cache_control: HOUR });

  return {
    model: CLAUDE_MODEL,
    max_tokens: request.maxTokens,
    system,
    messages: [{ role: "user", content: userContent(request) }],
    output_config: {
      effort: request.effort ?? "low",
      ...(request.format ? { format: request.format } : {}),
    },
  };
}

function userContent(request: ClaudeRequest): Anthropic.Messages.MessageParam["content"] {
  if (!request.images?.length && !request.reusableContext) return request.user;
  return [
    ...(request.images ?? []).map((image): Anthropic.Messages.ImageBlockParam => ({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data },
    })),
    ...(request.reusableContext ? [{ type: "text" as const, text: request.reusableContext, cache_control: { type: "ephemeral" as const } }] : []),
    { type: "text", text: request.user },
  ];
}

export interface ClaudeTextResult {
  text: string;
  stopReason: Anthropic.Messages.StopReason | null;
  usage: Anthropic.Messages.Usage;
}

function assertUsable(message: Anthropic.Messages.Message) {
  if (message.stop_reason === "refusal") {
    throw new ClaudeRefusalError(message.stop_details?.category ?? null);
  }
}

function textOf(message: Anthropic.Messages.Message) {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Streams one request and reports each text delta as it arrives. Thinking
 * blocks are skipped; only the answer text is forwarded.
 */
export async function streamClaudeText(
  request: ClaudeRequest,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<ClaudeTextResult> {
  const client = getClaudeClient();
  if (!client) throw new ClaudeKeyMissingError();
  const stream = client.messages.stream(buildClaudeParams(request), { signal });
  stream.on("text", (delta) => {
    if (delta) onDelta(delta);
  });
  const message = await stream.finalMessage();
  assertUsable(message);
  logUsage(message);
  return { text: textOf(message), stopReason: message.stop_reason, usage: message.usage };
}

/** One request without streaming, for short answers such as grammar fixes. */
export async function createClaudeText(request: ClaudeRequest, signal?: AbortSignal): Promise<ClaudeTextResult> {
  const client = getClaudeClient();
  if (!client) throw new ClaudeKeyMissingError();
  const message = await client.messages.create(buildClaudeParams(request), { signal });
  assertUsable(message);
  logUsage(message);
  return { text: textOf(message), stopReason: message.stop_reason, usage: message.usage };
}

function logUsage(message: Anthropic.Messages.Message) {
  if (process.env.CLAUDE_USAGE_LOG !== "1") return;
  const { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } = message.usage;
  console.info(
    `[claude] in=${input_tokens} cacheRead=${cache_read_input_tokens ?? 0} cacheWrite=${cache_creation_input_tokens ?? 0} out=${output_tokens} stop=${message.stop_reason}`,
  );
}

/** Strips stray code fences so the caller can JSON.parse the answer. */
export function cleanJsonText(text: string) {
  return text.replace(/```json|```/g, "").trim();
}
