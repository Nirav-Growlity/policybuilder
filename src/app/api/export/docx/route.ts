import { NextRequest, NextResponse } from "next/server";
import { generateDocx } from "@/lib/docx/generate";
import type { Policy } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { policy } = (await req.json()) as { policy: Policy };
    const buf = await generateDocx(policy);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Environmental-Policy.docx"`,
      },
    });
  } catch (e) {
    console.error("DOCX export failed", e);
    return NextResponse.json({ error: "DOCX export failed" }, { status: 500 });
  }
}
