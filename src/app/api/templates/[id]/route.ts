import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const SEED_DIR = path.join(process.cwd(), "data", "seed-policies");

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const files = await fs.readdir(SEED_DIR);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(SEED_DIR, f), "utf-8");
      const data = JSON.parse(raw);
      if (data.id === id) {
        return NextResponse.json({ template: data });
      }
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    console.error("Template get failed", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
