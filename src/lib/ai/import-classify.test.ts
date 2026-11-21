import assert from "node:assert/strict";
import test from "node:test";

import { flattenUnits } from "../docx/import-classification";
import { importedPolicyToPolicy } from "../docx/import-to-policy";
import { initialPolicy } from "../initial-policy";
import type { ImportedPolicyContext } from "../types";
import { CONTEXT_TOKEN_CEILING, CONTEXT_TOKEN_TARGET, estimateTokens } from "./claude";
import {
  IMPORT_CLASSIFY_SYSTEM,
  MAX_CHUNKS,
  MAX_UNITS_PER_CHUNK,
  UNIT_TEXT_LIMIT,
  chunkUnits,
  classifyImport,
  parseReferenceInput,
  unitLine,
  validChunkLabels,
} from "./import-classify";
import { parseImportedPolicyHtml } from "../docx/parse";

const parse = (html: string): ImportedPolicyContext =>
  parseImportedPolicyHtml(html, { fileName: "policy.docx", policyType: "environmental", importedAt: "2026-11-21T00:00:00.000Z" });

const SMALL = parse(`<h1>Acme Environmental Policy</h1>
  <h1>Scope</h1><p>This policy applies to all sites.</p>
  <h1>Objectives</h1><ul><li>Install LED lighting.</li><li>Meter every outlet.</li></ul>
  <h1>Responsibilities</h1><table><tbody><tr><th>Role</th><th>Duty</th></tr><tr><td>CEO</td><td>Owns the policy</td></tr></tbody></table>`);

/** A document of `sections` sections with `parts` long paragraphs each. */
function hugeDocument(sections: number, parts: number, length: number): ImportedPolicyContext {
  const body = ("Wastewater is treated before discharge and every outlet is metered monthly. ").repeat(Math.ceil(length / 70)).slice(0, length);
  const html = Array.from({ length: sections }, (_, s) => `<h1>Custom part ${s}</h1>${Array.from({ length: parts }, (_, p) => `<p>${body} ${s}-${p}</p>`).join("")}`).join("");
  return parse(`<h1>Huge policy</h1>${html}`);
}

test("a normal document is one prompt far below the context target", () => {
  const units = flattenUnits(SMALL);
  const chunks = chunkUnits(SMALL, units, "environmental");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].units.length, units.length);
  assert.ok(chunks[0].tokens < 2_000, `${chunks[0].tokens} tokens`);
  assert.match(chunks[0].prompt, /^Policy type: environmental\./);
  assert.match(chunks[0].prompt, /0 p This policy applies to all sites\./);
});

test("a table row is one part with its cells joined, the first row marked as the header", () => {
  const units = flattenUnits(SMALL);
  const rows = units.filter((unit) => unit.type === "r");
  assert.deepEqual(rows.map((unit) => [unit.text, unit.header]), [["Role | Duty", true], ["CEO | Owns the policy", false]]);
  assert.match(unitLine(rows[0]), /^\d+ h Role \| Duty$/);
});

test("a part is cut to the unit limit in the prompt only", () => {
  const long = "word ".repeat(200).trim();
  const reference = parse(`<h1>Scope</h1><p>${long}</p>`);
  const [unit] = flattenUnits(reference);
  assert.equal(unit.text, long, "the unit keeps the document's full text");
  assert.ok(unitLine(unit).length <= UNIT_TEXT_LIMIT + 8);
  assert.match(unitLine(unit), /…$/);
});

test("a large document is split into prompts that stay under the context target and never near the ceiling", () => {
  const reference = hugeDocument(60, 40, 600);
  const units = flattenUnits(reference);
  assert.ok(units.length >= 2_000);
  const chunks = chunkUnits(reference, units, "environmental");
  assert.ok(chunks.length > 1, "it is split");
  const system = estimateTokens(IMPORT_CLASSIFY_SYSTEM);
  for (const chunk of chunks) {
    assert.ok(chunk.tokens + system < CONTEXT_TOKEN_TARGET, `${chunk.tokens + system} tokens in one prompt`);
    assert.ok(chunk.tokens + system < CONTEXT_TOKEN_CEILING);
    assert.ok(chunk.units.length <= MAX_UNITS_PER_CHUNK);
  }
  // Prompts are consecutive runs of ids with nothing missing or repeated.
  const ids = chunks.flatMap((chunk) => chunk.units.map((unit) => unit.id));
  assert.deepEqual(ids, units.map((unit) => unit.id));
});

test("a section split between prompts repeats its heading in the second", () => {
  const reference = hugeDocument(1, 600, 200);
  const chunks = chunkUnits(reference, flattenUnits(reference), "environmental");
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) assert.match(chunk.prompt, /#\d+ Custom part 0/);
});

test("a prompt that would hold more than the token budget is split even when each part is small", () => {
  const reference = hugeDocument(2, 50, 240);
  const units = flattenUnits(reference);
  const budget = 1_500;
  const chunks = chunkUnits(reference, units, "environmental", budget);
  assert.ok(chunks.length > 2);
  for (const chunk of chunks) assert.ok(chunk.tokens <= budget + 100, `${chunk.tokens}`);
});

test("only labels for the prompt's own parts are kept, and malformed answers give nothing", () => {
  const units = flattenUnits(SMALL);
  const [chunk] = chunkUnits(SMALL, units, "environmental");
  const labels = validChunkLabels({ u: [{ i: 0, d: "scp" }, { i: 1, e: 99, d: "obj", a: "Water" }, { i: 500, d: "scp" }, { i: 3, e: 2, d: "res" }] }, chunk);
  assert.deepEqual(labels.map((label) => [label.i, label.e]), [[0, undefined], [1, units[units.length - 1].id]]);
  assert.deepEqual(validChunkLabels({ u: [{ i: 0, d: "not-a-destination" }] }, chunk), []);
  assert.deepEqual(validChunkLabels("nonsense", chunk), []);
  assert.deepEqual(validChunkLabels({ u: [{ i: "0", d: "scp" }] }, chunk), []);
});

test("classifyImport sends one mocked request per prompt and returns the labels", async () => {
  const requests: { system: string; user: string; maxTokens: number }[] = [];
  const result = await classifyImport(SMALL, {
    enabled: true,
    run: async (request) => {
      requests.push(request);
      return { u: [{ i: 0, d: "scp" }, { i: 1, e: 2, d: "obj", a: "Lighting" }] };
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].system, IMPORT_CLASSIFY_SYSTEM);
  assert.ok(requests[0].maxTokens >= 1_000 && requests[0].maxTokens <= 16_000);
  assert.equal(result?.chunks, 1);
  assert.equal(result?.failedChunks, 0);
  assert.equal(result?.classification.u.length, 2);
});

test("classifyImport runs a large document as several requests, none above the context target", async () => {
  const reference = hugeDocument(60, 40, 600);
  const sizes: number[] = [];
  const result = await classifyImport(reference, {
    enabled: true,
    run: async (request) => {
      sizes.push(estimateTokens(request.system) + estimateTokens(request.user));
      return { u: [] };
    },
  });
  assert.equal(result, null, "no labels came back");
  assert.ok(sizes.length > 1 && sizes.length <= MAX_CHUNKS);
  for (const size of sizes) assert.ok(size < CONTEXT_TOKEN_TARGET, `${size}`);
});

test("classifyImport gives up quietly: no key, a failing request or invalid output all return null", async () => {
  let called = 0;
  assert.equal(await classifyImport(SMALL, { enabled: false, run: async () => { called++; return { u: [] }; } }), null);
  assert.equal(called, 0, "no request without a key");
  assert.equal(await classifyImport(SMALL, { enabled: true, run: async () => { throw new Error("network down"); } }), null);
  assert.equal(await classifyImport(SMALL, { enabled: true, run: async () => ({ u: [{ i: 0, d: "bogus" }] }) }), null);
  assert.equal(await classifyImport(parse("<h1>Empty</h1>"), { enabled: true, run: async () => ({ u: [{ i: 0, d: "scp" }] }) }), null);
});

test("when classification fails the built-in rules give the same policy as no classification", async () => {
  const none = await classifyImport(SMALL, { enabled: true, run: async () => { throw new Error("down"); } });
  assert.equal(none, null);
  // The browser maps with no classification at all when the request fails.
  const withRules = importedPolicyToPolicy(SMALL, initialPolicy("environmental"), undefined);
  const rulesOnly = importedPolicyToPolicy(SMALL, initialPolicy("environmental"));
  const strip = (value: unknown) => JSON.stringify(value, (key, item) => (key === "id" && typeof item === "string" && item.startsWith("import-") ? undefined : item));
  assert.equal(strip(withRules.patch), strip(rulesOnly.patch));
});

test("one failing prompt does not discard the labels of the others", async () => {
  const reference = hugeDocument(12, 60, 400);
  let calls = 0;
  const result = await classifyImport(reference, {
    enabled: true,
    run: async (request) => {
      calls++;
      if (calls === 1) throw new Error("timeout");
      const first = /^(\d+) /m.exec(request.user.split("\n").find((line) => /^\d+ p /.test(line)) ?? "");
      return { u: [{ i: Number(first?.[1] ?? 0), d: "cus", t: "Custom part 1" }] };
    },
  });
  assert.ok(result);
  assert.equal(result?.failedChunks, 1);
  assert.ok((result?.classification.u.length ?? 0) >= 1);
});

test("an untrusted reference is rebuilt from known fields and bounded", () => {
  assert.equal(parseReferenceInput(null), null);
  assert.equal(parseReferenceInput({ sections: "x" }), null);
  assert.equal(parseReferenceInput({ sections: Array.from({ length: 601 }, () => ({ title: "x", blocks: [] })) }), null);
  assert.equal(parseReferenceInput({ sections: [{ title: "x", blocks: 5 }] }), null);

  const rebuilt = parseReferenceInput({
    fileName: "a.docx",
    policyType: "not-a-type",
    title: "T",
    text: "ignored",
    extra: "ignored",
    sections: [{ id: "s0", title: "Scope", level: 9, kind: "weird", blocks: [{ type: "paragraph", text: "All sites." }, { type: "script", text: "x" }, { type: "list", items: ["a", 5], ordered: true }] }],
  });
  assert.ok(rebuilt);
  assert.equal(rebuilt?.policyType, "environmental");
  assert.equal(rebuilt?.text, "");
  assert.equal(rebuilt?.sections[0].level, 1);
  assert.equal(rebuilt?.sections[0].kind, "custom");
  assert.deepEqual(rebuilt?.sections[0].blocks, [{ type: "paragraph", text: "All sites." }, { type: "list", ordered: true, items: ["a", ""] }]);

  const tooBig = { sections: [{ title: "x", blocks: Array.from({ length: 3_001 }, () => ({ type: "paragraph", text: "x" })) }] };
  assert.equal(parseReferenceInput(tooBig), null);
});
