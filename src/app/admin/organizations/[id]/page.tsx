"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizationSectionNavigation } from "@/components/workspace/organization-section-navigation";
import { normalizeStandaloneOrganization, StandaloneOrganizationEditor, StandaloneOrganizationStatus, type StandaloneOrganization } from "@/components/workspace/standalone-organization-editor";

export default function EditOrganizationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const organizationId = Number(params.id);
  const [organization, setOrganization] = React.useState<StandaloneOrganization | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const requestGeneration = React.useRef(0);
  const load = React.useCallback(async () => {
    const generation = ++requestGeneration.current;
    if (!Number.isSafeInteger(organizationId) || organizationId < 1) { setError("Choose a valid organization."); setLoading(false); return; }
    setOrganization(null); setLoading(true); setError("");
    try {
      const response = await fetch(`/api/policycraft/organizations/${organizationId}`, { cache: "no-store" });
      if (generation !== requestGeneration.current) return;
      if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent(`/admin/organizations/${organizationId}`)}`); return; }
      const result = await response.json().catch(() => null);
      if (generation !== requestGeneration.current) return;
      if (!response.ok || !result?.organization) throw new Error(result?.error || "Could not load this organization.");
      setOrganization(normalizeStandaloneOrganization(result));
    } catch (cause) { if (generation === requestGeneration.current) setError(cause instanceof Error ? cause.message : "Could not load this organization."); }
    finally { if (generation === requestGeneration.current) setLoading(false); }
  }, [organizationId, router]);
  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => { window.clearTimeout(timer); requestGeneration.current += 1; }; }, [load]);

  if (organization?.id === organizationId) return <StandaloneOrganizationEditor key={`${organization.id}:${organization.lockVersion}`} organizationId={organization.id} initial={organization} backHref="/admin/organizations/policycraft" navigation={<OrganizationSectionNavigation />} />;
  return <StandaloneOrganizationStatus backHref="/admin/organizations/policycraft" backLabel="PolicyCraft organizations" navigation={<OrganizationSectionNavigation />} loading={loading} error={error} onRetry={() => void load()} />;
}
