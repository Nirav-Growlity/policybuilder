import { NextResponse } from "next/server";
import { getPolicyCraftAuthResult, getPolicyCraftActorResult, parsePolicyCraftOrganizationSelector, policyCraftAuthFailure, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { getStandaloneProfile, standaloneCompanySnapshot, updateStandaloneOrganization, validateStandaloneOrganizationProfile } from "@/lib/policycraft-organization-repository";
import { PolicyCraftOrganizationInputError, readPolicyCraftOrganizationLogo } from "@/lib/policycraft-organization-upload";
type RouteContext = { params: Promise<{ id: string }> };
function parseId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function unavailableMigration(error: unknown) { return policyCraftAuthFailure(error); }

export async function GET(request: Request, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && (!selector.valid || selector.organizationId !== id)) return NextResponse.json({ error: "Invalid organization selector." }, { status: 400 });
  const actor = await getPolicyCraftActorResult();
  if (!actor.actor) return actor.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.actor.role !== "admin" && actor.actor.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { auth, response } = await getPolicyCraftAuthResult({ organizationId: id, operation: "read" });
  if (!auth) return response || NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  try {
    const detail = await getStandaloneProfile(id);
    if (!detail) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    return NextResponse.json({ organization: detail.organization, company: standaloneCompanySnapshot(id, detail.profile), lockVersion: detail.lockVersion }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const migration = unavailableMigration(error);
    if (migration) return migration;
    console.error("PolicyCraft organization detail failed", error);
    return NextResponse.json({ error: "Could not load organization." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const invalid = policyCraftMutationFailure(request, "multipart");
  if (invalid) return invalid;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  const actor = await getPolicyCraftActorResult();
  if (!actor.actor) return actor.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.actor.role !== "admin" && actor.actor.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { auth, response } = await getPolicyCraftAuthResult({ organizationId: id, operation: "write" });
  if (!auth) return response || NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  try {
    const form = await request.formData();
    const rawProfile = form.get("profile");
    const versionValue = form.get("lockVersion");
    if (typeof rawProfile !== "string" || typeof versionValue !== "string" || !/^\d+$/.test(versionValue)) {
      return NextResponse.json({ error: "profile and a valid lockVersion are required." }, { status: 400 });
    }
    const lockVersion = Number(versionValue);
    if (!Number.isSafeInteger(lockVersion) || lockVersion < 1) return NextResponse.json({ error: "lockVersion is invalid." }, { status: 400 });
    const parsed = validateStandaloneOrganizationProfile(JSON.parse(rawProfile));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const logo = await readPolicyCraftOrganizationLogo(form, false);
    const result = await updateStandaloneOrganization(actor.actor, id, lockVersion, parsed.profile, logo);
    if (result === null) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    if (result === "conflict") return NextResponse.json({ code: "POLICYCRAFT_ORGANIZATION_CONFLICT", error: "This organization changed in another session. Refresh before saving." }, { status: 409 });
    return NextResponse.json({ organization: result.organization, company: standaloneCompanySnapshot(id, result.profile), lockVersion: result.lockVersion }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const migration = unavailableMigration(error);
    if (migration) return migration;
    if (error instanceof SyntaxError) return NextResponse.json({ error: "profile must contain valid JSON." }, { status: 400 });
    if (error instanceof PolicyCraftOrganizationInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "Organization access denied.") return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === "Administrator access is no longer active.") return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("PolicyCraft organization update failed", error);
    return NextResponse.json({ error: "Could not update organization." }, { status: 500 });
  }
}
