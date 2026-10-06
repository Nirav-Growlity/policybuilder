import { NextResponse } from "next/server";
import { getPolicyCraftAdminResult, policyCraftAuthFailure, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { createStandaloneOrganization, listPolicyCraftOrganizationRecords, standaloneCompanySnapshot, validateStandaloneOrganizationProfile } from "@/lib/policycraft-organization-repository";
import { PolicyCraftOrganizationInputError, readPolicyCraftOrganizationLogo } from "@/lib/policycraft-organization-upload";

export async function GET() {
  const auth = await getPolicyCraftAdminResult();
  if (!auth.actor) return auth.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ organizations: await listPolicyCraftOrganizationRecords() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const migration = policyCraftAuthFailure(error);
    if (migration) return migration;
    console.error("PolicyCraft organization listing failed", error);
    return NextResponse.json({ error: "Could not load organizations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const invalid = policyCraftMutationFailure(request, "multipart");
  if (invalid) return invalid;
  const auth = await getPolicyCraftAdminResult();
  if (!auth.actor) return auth.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const rawProfile = form.get("profile");
    if (typeof rawProfile !== "string") return NextResponse.json({ error: "profile is required." }, { status: 400 });
    const parsed = validateStandaloneOrganizationProfile(JSON.parse(rawProfile));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const logo = await readPolicyCraftOrganizationLogo(form, true);
    const result = await createStandaloneOrganization(auth.actor, parsed.profile, logo!);
    const company = standaloneCompanySnapshot(result.organization.id, result.profile);
    return NextResponse.json({ organization: result.organization, company, lockVersion: result.lockVersion }, { status: 201 });
  } catch (error) {
    const migration = policyCraftAuthFailure(error);
    if (migration) return migration;
    if (error instanceof SyntaxError) return NextResponse.json({ error: "profile must contain valid JSON." }, { status: 400 });
    if (error instanceof PolicyCraftOrganizationInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "Administrator access is no longer active.") return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("PolicyCraft organization creation failed", error);
    return NextResponse.json({ error: "Could not create organization." }, { status: 500 });
  }
}
