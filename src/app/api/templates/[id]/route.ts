import { NextRequest, NextResponse } from "next/server";
import { getStarterTemplate } from "@/lib/starter-templates";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const template = getStarterTemplate(id);
  return template
    ? NextResponse.json({ template })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
