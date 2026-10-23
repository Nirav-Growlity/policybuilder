import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { photoCoverCrop, preparePhotoCoverImage } from "./photo-cover-image";
import { photoCoverImageSize } from "./design/photo-cover";
import { SOP_DESIGNS } from "./design/templates";

test("aspect differences inside eight percent need no substantial crop", () => {
  assert.equal(photoCoverCrop(1600, 1000, { width: 160, height: 100 }), null);
  assert.equal(photoCoverCrop(1700, 1000, { width: 160, height: 100 }), null);
  assert.equal(photoCoverCrop(1500, 1000, { width: 160, height: 100 }), null);
});

test("mismatched portrait and wide artwork crops to the slot around its focus", () => {
  assert.deepEqual(photoCoverCrop(1024, 1456, { width: 166, height: 64 }), { left: 0, top: 531, width: 1024, height: 395 });
  assert.deepEqual(photoCoverCrop(2000, 1000, { width: 100, height: 100 }, { x: 100, y: 50 }), { left: 1000, top: 0, width: 1000, height: 1000 });
  assert.ok(photoCoverCrop(1750, 1000, { width: 160, height: 100 }));
  assert.ok(photoCoverCrop(1400, 1000, { width: 160, height: 100 }));
});

test("legacy 1024x1456 photos and near-matching photos fill the slot with no padded pixels", async () => {
  for (const [width, height] of [[1024, 1456], [1700, 1000]]) {
    const source = await sharp({ create: { width, height, channels: 3, background: "#cc3300" } }).png().toBuffer();
    const image = await preparePhotoCoverImage({ content: source, mime: "image/png" }, { width: 166, height: 64 });
    const { data, info } = await sharp(image.content).raw().toBuffer({ resolveWithObject: true });
    assert.ok(Math.abs(info.width / info.height - 166 / 64) < 0.005);
    assert.ok(data.every((value, index) => value === [204, 51, 0][index % info.channels]), "every pixel retains the source colour; no padding or bars");
  }
});

test("every template requests multiples of 16 within the image API aspect limits", () => {
  for (const design of SOP_DESIGNS) {
    const [width, height] = photoCoverImageSize(design).split("x").map(Number);
    assert.equal(width % 16, 0);
    assert.equal(height % 16, 0);
    assert.ok(width / height >= 0.4 && width / height <= 2.5);
  }
});
