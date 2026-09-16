import JSZip from "jszip";
import fs from "node:fs/promises";

async function run() {
  const buf = await fs.readFile("scratch/output.docx");
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const match = docXml.match(/<v:shape id="cover-text-cover-policy-title"[\s\S]*?<\/v:shape>/);
  console.log("MATCH:", match ? match[0] : "NOT FOUND");
}
run().catch(console.error);
