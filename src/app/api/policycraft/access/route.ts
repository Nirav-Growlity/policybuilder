import type { RowDataPacket } from "mysql2";
import { policyCraftPool } from "@/lib/db";
import { listPolicyCraftOrganizations } from "@/lib/policycraft-access-repository";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";
import { getPolicyCraftActorResult, resolvePolicyCraftOrganization } from "@/lib/policycraft-auth";

export async function GET() {
  const result = await getPolicyCraftActorResult();
  if (result.response) return result.response;
  if (!result.actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const actor = result.actor;
  let organizations: PolicyCraftAccess["organizations"] = [];

  if (actor.role === "admin") {
    organizations = await listPolicyCraftOrganizations();
  } else if (actor.role === "manager") {
    const [rows] = await policyCraftPool.execute<(RowDataPacket & { org_id: number })[]>(
      `SELECT m.org_id FROM policycraft_manager_organizations m
        INNER JOIN organizations o ON o.id = m.org_id
       WHERE m.manager_user_id = ? AND m.active = 1 AND o.is_deleted = 0
         AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_TIMESTAMP(3))
       ORDER BY o.company_name ASC, o.id ASC`,
      [Number(actor.user.id)],
    );
    organizations = (await Promise.all(rows.map(({ org_id }) => resolvePolicyCraftOrganization(actor, { organizationId: org_id, operation: "read" }))))
      .filter((organization): organization is NonNullable<typeof organization> => organization !== null);
  } else if (actor.homeOrganizationId) {
    const organization = await resolvePolicyCraftOrganization(actor, { operation: "read" });
    if (organization) organizations = [organization];
  }

  return Response.json({
    actor: { id: actor.user.id, name: actor.user.name, email: actor.user.email, role: actor.role },
    organizations,
    homeHref: actor.role === "admin" ? "/admin" : actor.role === "manager" ? "/manager" : "/dashboard",
  } satisfies PolicyCraftAccess, { headers: { "Cache-Control": "private, no-store" } });
}
