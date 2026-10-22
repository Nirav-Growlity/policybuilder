// Tiles side-by-side parity pages into one image for review.
// Run: npx tsx scripts/parity-montage.ts <out.png> <case/page-NN.png>...
import { resolve } from "node:path";
import sharp from "sharp";

async function main() {
  const [out, ...pages] = process.argv.slice(2);
  const root = resolve("..", ".scratch", "policy-typst", "parity");
  const tiles = await Promise.all(pages.map((page) => sharp(resolve(root, page)).resize(750).png().toBuffer()));
  const rows = Math.ceil(tiles.length / 2);
  await sharp({ create: { width: 2 * 760, height: rows * 554, channels: 3, background: "#555555" } })
    .composite(tiles.map((input, index) => ({ input, left: (index % 2) * 760, top: Math.floor(index / 2) * 554 })))
    .png()
    .toFile(out);
}

main().catch((error) => { console.error(error); process.exit(1); });
