import { NextResponse } from "next/server";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { getCompanyMaster } from "@/lib/policycraft-repository";

export async function GET() {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompanyMaster(auth);
    return NextResponse.json({ organization: auth.organization, company });
  } catch (error) {
    console.error("PolicyCraft bootstrap failed", error);
    return NextResponse.json({ error: "Could not load company data" }, { status: 500 });
  }
}

