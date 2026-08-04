import { NextRequest, NextResponse } from "next/server";
import { parseDocxBuffer } from "@/lib/docx/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const arr = await file.arrayBuffer();
    const buf = Buffer.from(arr);
    const { policy, text } = await parseDocxBuffer(buf);
    return NextResponse.json({ policy, textLength: text.length });
  } catch (e) {
    console.error("Parse failed", e);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
