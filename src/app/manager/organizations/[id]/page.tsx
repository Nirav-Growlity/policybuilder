"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { normalizeStandaloneOrganization, StandaloneOrganizationEditor, type StandaloneOrganization } from "@/components/workspace/standalone-organization-editor";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { ApplicationButton } from "@/components/ui/app-primitives";
import styles from "@/components/workspace/standalone-organization-editor.module.css";

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
  return <ApplicationSurface data-pc-workspace="organization-editor" className={styles.surface}><div className={styles.page}><Link href="/manager" className={styles.backLink}><ArrowLeft size={14} aria-hidden="true" />Organizations & policies</Link>{loading ? <p className={styles.loading} role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading organization…</p> : error ? <div className={styles.error} role="alert" aria-live="polite"><p>{error}</p><ApplicationButton type="button" variant="outline" onClick={() => void load()} leadingIcon={<RefreshCw size={14} aria-hidden="true" />}>Retry</ApplicationButton></div> : null}</div></ApplicationSurface>;
}
