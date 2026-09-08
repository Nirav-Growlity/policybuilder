import { NextResponse } from "next/server";
import { queryUniversalTemplates } from "@/lib/document-templates";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const templates = queryUniversalTemplates({
    q: params.get("q"),
    family: params.get("family"),
    intent: params.get("intent"),
    imageSupport: params.get("imageSupport"),
    density: params.get("density"),
  });
  return NextResponse.json({ templates });
}
