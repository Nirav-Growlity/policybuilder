"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { normalizeStandaloneOrganization, StandaloneOrganizationEditor, type StandaloneOrganization } from "@/components/workspace/standalone-organization-editor";

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

  if (organization?.id === organizationId) return <StandaloneOrganizationEditor key={`${organization.id}:${organization.lockVersion}`} organizationId={organization.id} initial={organization} />;
  return <div className="mx-auto max-w-3xl"><Link href="/admin/organizations" className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-forest)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><ArrowLeft size={14} aria-hidden="true" />Organizations</Link>{loading ? <p className="mt-8 flex items-center gap-3 text-sm text-[var(--color-muted)]" aria-live="polite"><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading organization…</p> : error ? <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md px-2 font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-800"><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : null}</div>;
}
