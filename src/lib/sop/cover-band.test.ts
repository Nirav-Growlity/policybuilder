import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { COVER_BAND, toCoverBand } from "./cover-band";

const A4 = { size: "A4" as const, widthMm: 210, heightMm: 297 };
const W = 1024;
const H = 1456;

/** Portrait artwork like a policy AI cover: blank white top 40%, busy stripes below. */
async function artworkWithBlankTop() {
  const stripes = Array.from({ length: 40 }, (_, i) => `<rect x="${i * 26}" y="${H * 0.4}" width="13" height="${H * 0.6}" fill="${i % 2 ? "#1d4e45" : "#d08a2c"}"/>`).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${stripes}</svg>`)).png().toBuffer();
}

/** Share of the band's rows that are pure white. */
async function whiteRowShare(content: Buffer) {
  const { data, info } = await sharp(content).greyscale().raw().toBuffer({ resolveWithObject: true });
  let white = 0;
  for (let y = 0; y < info.height; y += 1) {
    let all = true;
    for (let x = 0; x < info.width && all; x += 4) all = data[y * info.width + x] > 250;
    if (all) white += 1;
  }
  return white / info.height;
}

test("the cover band has the page band's shape", async () => {
  const band = await toCoverBand({ mime: "image/png", content: await artworkWithBlankTop() }, A4, "#eef3f1");
  const { width = 0, height = 0 } = await sharp(band.content).metadata();
  assert.equal(band.ext, "png");
  assert.equal(width, W);
  assert.ok(Math.abs(height / width - (297 * COVER_BAND) / 210) < 0.01);
});

test("blank space left for overlay text is cropped out of the band", async () => {
  const art = await artworkWithBlankTop();
  const centred = await sharp(art).resize({ width: W, height: Math.round(W * ((297 * COVER_BAND) / 210)), fit: "cover", position: "centre" }).png().toBuffer();
  const band = await toCoverBand({ mime: "image/png", content: art }, A4, "#eef3f1");
  assert.ok(await whiteRowShare(centred) > 0.2, "a centre crop keeps part of the blank area");
  assert.equal(await whiteRowShare(band.content), 0);
});

test("transparent artwork is flattened onto the background colour", async () => {
  const clear = await sharp({ create: { width: 400, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const band = await toCoverBand({ mime: "image/png", content: clear }, A4, "#336699");
  const { data, info } = await sharp(band.content).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  assert.deepEqual([...data.subarray(0, 3)], [0x33, 0x66, 0x99]);
});

test("SVG covers pass through untouched", async () => {
  const svg = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"/>");
  const band = await toCoverBand({ mime: "image/svg+xml", content: svg }, A4, "#fff");
  assert.equal(band.ext, "svg");
  assert.equal(band.content, svg);
});
