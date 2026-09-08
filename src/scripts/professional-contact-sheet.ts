import sharp from "sharp";
import { DOCUMENT_THEMES } from "../lib/document-themes";
async function main() {
  const themes = DOCUMENT_THEMES;
  const tiles = [];
  for (const [i, theme] of themes.entries()) {
    for (const [j, kind] of ["cover", "body"].entries()) {
      tiles.push({ input: await sharp(`public/template-previews/${theme.id}/environmental-${kind}.png`).resize(270,382,{fit:"contain",background:"white"}).png().toBuffer(), left:(i%3)*600+j*280+20, top:Math.floor(i/3)*440+40 });
    }
    const label = `<svg width="580" height="30"><text x="10" y="22" font-family="Arial" font-size="18" fill="#233f59">${theme.name}</text></svg>`;
    tiles.push({input:Buffer.from(label),left:(i%3)*600+10,top:Math.floor(i/3)*440+5});
  }
  await sharp({create:{width:1800,height:Math.ceil(themes.length / 3) * 440,channels:3,background:"#e9eceb"}}).composite(tiles).png().toFile(".theme-qa/templates/contact-sheet.png");
}
main().then(()=>process.exit(0));
