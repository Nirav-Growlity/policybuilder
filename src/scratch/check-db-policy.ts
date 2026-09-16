import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { generateDocx } from "../lib/docx/generate";
import JSZip from "jszip";
import fs from "node:fs/promises";

dotenv.config();

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute<any[]>("SELECT policy_json FROM policycraft_documents WHERE id = '1a70ffb1-68c5-4cee-a214-50a0c98f9c01'");
  const policy = typeof rows[0].policy_json === "string" ? JSON.parse(rows[0].policy_json) : rows[0].policy_json;
  await conn.end();

  const buf = await generateDocx(policy);
  await fs.writeFile("scratch/db-policy.docx", buf);
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const titleShape = docXml.match(/<v:shape id="cover-text-cover-policy-title"[\s\S]*?<\/v:shape>/);
  console.log("TITLE SHAPE IN DB POLICY:");
  console.log(titleShape ? titleShape[0] : "NOT FOUND");

  const paragraphs = docXml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
  console.log("Total paragraphs:", paragraphs.length);
}
run().catch(console.error);
