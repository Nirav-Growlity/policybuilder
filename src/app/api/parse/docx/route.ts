import { NextRequest, NextResponse } from "next/server";
import { parseDocxBuffer } from "@/lib/docx/parse";
import type { PolicyType } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return NextResponse.json({ error: "Only .docx files are supported" }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "The DOCX must be smaller than 15 MB" }, { status: 413 });
    }
    const arr = await file.arrayBuffer();
    const buf = Buffer.from(arr);
    const requestedType = fd.get("policyType");
    const policyType: PolicyType =
      requestedType === "labour-human-rights" || requestedType === "living-wage" || requestedType === "ethics" || requestedType === "sustainable-procurement"
        ? requestedType
        : "environmental";
    const referencePolicy = await parseDocxBuffer(buf, { fileName: file.name, policyType });
    return NextResponse.json({ referencePolicy });
  } catch (e) {
    console.error("Parse failed", e);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
