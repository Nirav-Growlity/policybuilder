import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const SEED_DIR = path.join(process.cwd(), "data", "seed-policies");

export async function GET() {
  try {
    const files = await fs.readdir(SEED_DIR);
    const templates = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const raw = await fs.readFile(path.join(SEED_DIR, f), "utf-8");
          const data = JSON.parse(raw);
          return {
            id: data.id,
            name: data.name,
            industry: data.industry,
            summary: data.summary,
            tagline: data.tagline,
          };
        })
    );
    return NextResponse.json({ templates });
  } catch (e) {
    console.error("Templates list failed", e);
    return NextResponse.json({ templates: [] });
  }
}
