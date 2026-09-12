import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Templates are currently unavailable" }, { status: 404 });
}
