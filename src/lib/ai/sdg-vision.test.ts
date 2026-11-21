import assert from "node:assert/strict";
import test from "node:test";

import { importedPolicyToPolicy, summarizeImport } from "../docx/import-to-policy";
import { parseImportedPolicyHtmlWithImages, type DocxImage } from "../docx/parse";
import { initialPolicy } from "../initial-policy";
import type { ImportedPolicyContext } from "../types";
import { SDG_VISION_MAX_BYTES, SDG_VISION_MAX_IMAGES, addSdgGoalsFromImages, prepareSdgImages, readSdgGoalsFromImages, type PreparedImage } from "./sdg-vision";

const readHtml = (html: string) =>
  parseImportedPolicyHtmlWithImages(html, { fileName: "policy.docx", policyType: "labour-human-rights", importedAt: "2026-11-21T00:00:00.000Z" });

/** Not a real picture: direct png/jpeg/webp bytes under the limit are passed through unread. */
const image = (index: number, overrides: Partial<DocxImage> = {}): DocxImage => ({
  index,
  contentType: "image/png",
  alt: "",
  size: 4_000,
  data: Buffer.from(`fake-png-${index}`),
  ...overrides,
});

const PICTURE_ONLY = `<h1>Labour Policy</h1><h1>Scope</h1><p>All sites.</p><p><img src="docx-image:0" alt=""></p>
  <h1>Sustainable Development Goals</h1><p><img src="docx-image:1" alt=""></p>`;

const SDG_PICTURE_ONLY = `<h1>Labour Policy</h1><h1>Scope</h1><p>All sites.</p><h1>Sustainable Development Goals</h1><p><img src="docx-image:0" alt=""></p>`;

test("pictures are tracked per section, so only the SDG section's pictures are goal candidates", () => {
  const { reference, imageIndexes } = readHtml(PICTURE_ONLY);
  const sdg = reference.sections.find((section) => section.kind === "sdg");
  const scope = reference.sections.find((section) => section.kind === "scope");
  assert.ok(sdg && scope);
  assert.deepEqual(imageIndexes.get(sdg.id), [1]);
  assert.deepEqual(imageIndexes.get(scope.id), [0], "a picture outside the SDG section is not an SDG candidate");
  assert.deepEqual(sdg.imageAlts, [""]);
});

test("a prompt of pictures is at most four, each a supported type under the byte limit", async () => {
  const many = Array.from({ length: 7 }, (_, index) => image(index));
  const prepared = await prepareSdgImages(many);
  assert.equal(prepared.length, SDG_VISION_MAX_IMAGES);
  assert.equal(prepared[0].mediaType, "image/png");
  assert.equal(prepared[0].data, Buffer.from("fake-png-0").toString("base64"));
});

test("a picture that cannot be read or downscaled is skipped, not sent", async () => {
  const oversized = image(0, { data: Buffer.alloc(SDG_VISION_MAX_BYTES + 10, 1), size: SDG_VISION_MAX_BYTES + 10 });
  const unreadable = image(1, { contentType: "image/x-emf" });
  const missing = image(2, { data: null });
  assert.deepEqual(await prepareSdgImages([oversized, unreadable, missing]), []);
});

test("goal numbers read from the pictures keep only 1 to 17, once each", async () => {
  const run = async () => ({ sdgs: [8, 3, 0, 18, 3, 99, 5, 4, -2, 8] });
  assert.deepEqual(await readSdgGoalsFromImages([image(0)], { run }), [3, 4, 5, 8]);
  assert.deepEqual(await readSdgGoalsFromImages([image(0)], { run: async () => ({ sdgs: "all of them" }) }), [], "an answer of the wrong shape is empty");
  assert.deepEqual(await readSdgGoalsFromImages([], { run }), [], "no picture, no request");
});

test("a mocked vision answer fills the SDG section and the policy's goals", async () => {
  const { reference } = readHtml(SDG_PICTURE_ONLY);
  const seen: PreparedImage[][] = [];
  const result = await addSdgGoalsFromImages(reference, [image(0)], {
    enabled: true,
    run: async (images) => {
      seen.push(images);
      return { sdgs: [3, 4, 5, 8] };
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].length, 1);
  assert.equal(result.read, true);
  assert.deepEqual(result.reference.sections.find((section) => section.kind === "sdg")?.sdgGoals, [3, 4, 5, 8]);
  assert.equal(reference.sections.find((section) => section.kind === "sdg")?.sdgGoals, undefined, "the input is not mutated");

  const { patch, report } = importedPolicyToPolicy(result.reference, initialPolicy("labour-human-rights"));
  assert.deepEqual(patch.sdgs, [3, 4, 5, 8]);
  assert.equal(patch.sections?.find((section) => section.kind === "sdg")?.enabled, true);
  assert.ok(report.filled.includes("sdg"));
  assert.doesNotMatch(summarizeImport(report), /pictures/, "goals were read, so nothing is left to pick");
});

test("alt text that names the goals is used without any model call", async () => {
  const { reference } = readHtml(`<h1>Labour Policy</h1><h1>Sustainable Development Goals</h1><p><img src="docx-image:0" alt="UN SDG 3, 4, 5 and 8"></p>`);
  let called = 0;
  const result = await addSdgGoalsFromImages(reference, [image(0, { alt: "UN SDG 3, 4, 5 and 8" })], { enabled: true, run: async () => { called++; return { sdgs: [1] }; } });
  assert.equal(called, 0);
  assert.equal(result.read, false);
  const { patch } = importedPolicyToPolicy(result.reference, initialPolicy("labour-human-rights"));
  assert.deepEqual(patch.sdgs, [3, 4, 5, 8]);
});

test("text in the SDG section that names the goals is used without any model call", async () => {
  const { reference } = readHtml(`<h1>Labour Policy</h1><h1>Sustainable Development Goals</h1><p>Goal 3 and Goal 8.</p><p><img src="docx-image:0" alt=""></p>`);
  let called = 0;
  await addSdgGoalsFromImages(reference, [image(0)], { enabled: true, run: async () => { called++; return { sdgs: [1] }; } });
  assert.equal(called, 0);
  assert.deepEqual(importedPolicyToPolicy(reference, initialPolicy("labour-human-rights")).patch.sdgs, [3, 8]);
});

test("without a key, with no pictures or with no SDG section nothing is requested", async () => {
  const { reference } = readHtml(SDG_PICTURE_ONLY);
  let called = 0;
  const run = async () => { called++; return { sdgs: [1] }; };
  assert.equal((await addSdgGoalsFromImages(reference, [image(0)], { enabled: false, run })).read, false);
  assert.equal((await addSdgGoalsFromImages(reference, [], { enabled: true, run })).read, false);
  const noSdg = readHtml(`<h1>Labour Policy</h1><h1>Scope</h1><p>All sites.</p><p><img src="docx-image:0" alt=""></p>`).reference;
  assert.equal((await addSdgGoalsFromImages(noSdg, [image(0)], { enabled: true, run })).read, false);
  assert.equal(called, 0);
});

test("when the vision reader fails the SDG step stays on with no goals and the summary says to pick them", async () => {
  const { reference } = readHtml(SDG_PICTURE_ONLY);
  const failed: ImportedPolicyContext[] = [];
  for (const run of [async () => { throw new Error("overloaded"); }, async () => ({ sdgs: [] }), async () => ({ nonsense: true })]) {
    const result = await addSdgGoalsFromImages(reference, [image(0)], { enabled: true, run });
    assert.equal(result.read, false);
    assert.equal(result.reference, reference, "the reference comes back unchanged");
    failed.push(result.reference);
  }
  const { patch, report } = importedPolicyToPolicy(failed[0], initialPolicy("labour-human-rights"));
  assert.deepEqual(patch.sdgs, []);
  assert.equal(patch.sections?.find((section) => section.kind === "sdg")?.enabled, true);
  assert.ok(report.filled.includes("sdg"));
  assert.match(summarizeImport(report), /SDG goals are pictures; pick them in the SDG step\./);
});

test("an invalid goal number in the section's recorded goals never reaches the policy", () => {
  const { reference } = readHtml(SDG_PICTURE_ONLY);
  const tampered: ImportedPolicyContext = {
    ...reference,
    sections: reference.sections.map((section) => (section.kind === "sdg" ? { ...section, sdgGoals: [0, 3, 18, 3, 8, 1e9] } : section)),
  };
  assert.deepEqual(importedPolicyToPolicy(tampered, initialPolicy("labour-human-rights")).patch.sdgs, [3, 8]);
});
