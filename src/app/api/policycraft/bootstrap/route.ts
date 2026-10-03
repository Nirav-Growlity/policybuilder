import { NextResponse } from "next/server";
import { getPolicyCraftAuthResult, parsePolicyCraftOrganizationSelector } from "@/lib/policycraft-auth";
import { getCompanyMaster } from "@/lib/policycraft-repository";

export async function GET(request: Request) {
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const { auth, response } = await getPolicyCraftAuthResult({ ...(selector.provided ? { organizationId: selector.organizationId } : {}), operation: "read" });
  if (!auth) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompanyMaster(auth);
    return NextResponse.json({ organization: auth.organization, company }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("PolicyCraft bootstrap failed", error);
    return NextResponse.json({ error: "Could not load company data" }, { status: 500 });
  }
}

