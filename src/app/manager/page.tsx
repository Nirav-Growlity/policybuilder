import { redirect } from "next/navigation";
import { ManagerOrganizations } from "@/components/workspace/manager-organizations";

/** Links from before Organizations and Policies were split carry an orgId; those belong to Policies. */
export default async function ManagerOrganizationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId } = await searchParams;
  if (typeof orgId === "string" && orgId) redirect(`/manager/policies?orgId=${encodeURIComponent(orgId)}`);
  return <ManagerOrganizations />;
}
