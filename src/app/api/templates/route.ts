import { NextResponse } from "next/server";
import { queryStarterTemplates, starterTemplateMeta } from "@/lib/starter-templates";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const templates = queryStarterTemplates({
    policyType: params.get("policyType"),
    profile: params.get("profile"),
    q: params.get("q"),
  }).map(starterTemplateMeta);
  return NextResponse.json({ templates });
}
