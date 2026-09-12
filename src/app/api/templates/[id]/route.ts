import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ctx.params;
  return NextResponse.json({ error: "Templates are currently unavailable" }, { status: 404 });
}
