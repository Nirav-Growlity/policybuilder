import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { resolveCoverAssets } from "../lib/cover-repository";
import { generateDocx } from "../lib/docx/generate";
import { normalizePolicyQuantitative } from "../lib/quantitative";
import fs from "node:fs/promises";
import JSZip from "jszip";

dotenv.config();

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute<any[]>("SELECT policy_json FROM policycraft_documents WHERE id LIKE '%aabedb7c%'");
  const policy = typeof rows[0].policy_json === "string" ? JSON.parse(rows[0].policy_json) : rows[0].policy_json;
  await conn.end();

  const resolved = await resolveCoverAssets(policy, 231);
  const buf = await generateDocx(normalizePolicyQuantitative(resolved));
  
  // Now let's fix docPr id in the docx and see what Word does!
  const zip = await JSZip.loadAsync(buf);
  let docXml = await zip.file("word/document.xml")!.async("string");
  
  let nextId = 100;
  docXml = docXml.replace(/<wp:docPr id="\d+"/g, () => `<wp:docPr id="${++nextId}"`);
  
  zip.file("word/document.xml", docXml);
  const fixedBuf = await zip.generateAsync({ type: "nodebuffer" });
  await fs.writeFile("scratch/fixed-ids.docx", fixedBuf);
  console.log("Wrote scratch/fixed-ids.docx");
}

run().catch(console.error);
