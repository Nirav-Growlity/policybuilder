"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { normalizeStandaloneOrganization, StandaloneOrganizationEditor, StandaloneOrganizationStatus, type StandaloneOrganization } from "@/components/workspace/standalone-organization-editor";

export default function ManagerEditOrganizationPage() {
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
      if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent(`/manager/organizations/${organizationId}`)}`); return; }
      const result = await response.json().catch(() => null);
      if (generation !== requestGeneration.current) return;
      if (!response.ok || !result?.organization || result.organization.source !== "standalone") throw new Error(result?.error || "This organization profile is not available for editing.");
      setOrganization(normalizeStandaloneOrganization(result));
    } catch (cause) { if (generation === requestGeneration.current) setError(cause instanceof Error ? cause.message : "Could not load this organization."); }
    finally { if (generation === requestGeneration.current) setLoading(false); }
  }, [organizationId, router]);
  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => { window.clearTimeout(timer); requestGeneration.current += 1; }; }, [load]);

  if (organization?.id === organizationId) return <StandaloneOrganizationEditor key={`${organization.id}:${organization.lockVersion}`} organizationId={organization.id} initial={organization} backHref={`/manager?orgId=${organization.id}`} />;
  return <StandaloneOrganizationStatus backHref="/manager" backLabel="Organizations & policies" loading={loading} error={error} onRetry={() => void load()} />;
}
