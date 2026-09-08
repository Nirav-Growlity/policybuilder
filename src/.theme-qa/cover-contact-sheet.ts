import sharp from "sharp";
import { DOCUMENT_THEMES } from "../lib/document-themes";
async function main(){
 const tiles=[];
 for(const [i,theme] of DOCUMENT_THEMES.entries()){
 tiles.push({input:await sharp(`public/template-previews/${theme.id}/environmental-cover.png`).resize(350,495).png().toBuffer(),left:(i%4)*374+12,top:Math.floor(i/4)*540+34});
 tiles.push({input:Buffer.from(`<svg width="350" height="28"><text x="0" y="20" font-family="Arial" font-size="13" fill="#263238">${theme.name}</text></svg>`),left:(i%4)*374+12,top:Math.floor(i/4)*540+4});
 }
 await sharp({create:{width:1496,height:1080,channels:3,background:'#e9eceb'}}).composite(tiles).png().toFile('.theme-qa/cover-redesign.png');
}
main();
