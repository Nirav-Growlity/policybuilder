import { templatePreviewPolicy } from "../lib/sample-policies";
import { generateDocx } from "../lib/docx/generate";
import JSZip from "jszip";
import fs from "node:fs/promises";

import { createInitialCoverComposition } from "../components/builder/cover-editor";

async function main() {
  const policy = templatePreviewPolicy("standard-pack", "sustainable-procurement");
  policy.coverComposition = createInitialCoverComposition(policy);
  console.log("Cover composition elements:", policy.coverComposition.elements.map(e => ({ id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, align: (e as any).align })));
  const buf = await generateDocx(policy);
  await fs.writeFile("scratch/output.docx", buf);
  console.log("Saved scratch/output.docx, length:", buf.length);

  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")!.async("string");
  console.log("Doc XML length:", docXml.length);
  
  const shapes = docXml.match(/<v:shape[\s\S]*?<\/v:shape>/g) || [];
  console.log("Shapes count:", shapes.length);
  for (const s of shapes) {
    console.log("SHAPE:", s);
  }
}
main().catch(console.error);
