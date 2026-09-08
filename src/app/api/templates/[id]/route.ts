import { NextRequest, NextResponse } from "next/server";
import { templateDetail } from "@/lib/document-templates";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const template = templateDetail(id);
  return template
    ? NextResponse.json({ template })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
