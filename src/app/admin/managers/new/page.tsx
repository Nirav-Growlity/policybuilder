"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Loader2, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import { OrganizationSourceLabel, organizationSourceName } from "@/components/workspace/organization-source-label";
import { AnimatedNumber, WorkspaceHero, WorkspaceSheet } from "@/components/workspace/workspace-motion";
import { ApplicationButton, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import styles from "./page.module.css";

type AdminManagersResponse = { managers: PolicyCraftManagerSummary[]; organizations: PolicyCraftOrganization[] };
type ExistingAccount = { id: string; name: string; email: string };
const managerFormSchema = z.object({ name: z.string(), email: z.string(), organizationIds: z.array(z.number()) });
type ManagerFormValues = z.infer<typeof managerFormSchema>;
type ExistingConfirmation = { account: ExistingAccount };
type ManagerSuccess =
  | { mode: "existing"; email: string }
  | { mode: "invited"; email: string; deliverySent: boolean };

export default function CreateManagerPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = React.useState<PolicyCraftOrganization[]>([]);
  const [organizationSearch, setOrganizationSearch] = React.useState("");
  const [existingConfirmation, setExistingConfirmation] = React.useState<ExistingConfirmation | null>(null);
  const [success, setSuccess] = React.useState<ManagerSuccess | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingError, setLoadingError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const { register, control, handleSubmit, setValue, getValues } = useForm<ManagerFormValues>({
    resolver: zodResolver(managerFormSchema),
    defaultValues: { name: "", email: "", organizationIds: [] },
  });
  const name = useWatch({ control, name: "name" }) || "";
  const email = useWatch({ control, name: "email" }) || "";
  const organizationIds = useWatch({ control, name: "organizationIds" }) || [];

  const loadOrganizations = React.useCallback(async () => {
    setLoading(true);
    setLoadingError("");
    try {
      const response = await fetch("/api/policycraft/admin/managers", { cache: "no-store" });
      if (response.status === 401) { router.replace("/login?next=%2Fadmin%2Fmanagers%2Fnew"); return; }
      if (!response.ok) throw new Error("Could not load organizations. Retry to try again.");
      const data = await response.json() as AdminManagersResponse;
      setOrganizations(data.organizations);
      const requestedOrganizationId = Number(new URLSearchParams(window.location.search).get("organizationId"));
      if (Number.isSafeInteger(requestedOrganizationId) && requestedOrganizationId > 0 && data.organizations.some((organization) => organization.id === requestedOrganizationId && !organization.deleted && !organization.expired)) {
        setValue("organizationIds", [...new Set([...getValues("organizationIds"), requestedOrganizationId])]);
      }
    } catch (cause) {
      setLoadingError(cause instanceof Error ? cause.message : "Could not load organizations.");
    } finally {
      setLoading(false);
    }
  }, [router, getValues, setValue]);

  React.useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      void loadOrganizations();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [loadOrganizations]);

  async function createManager(values: ManagerFormValues, confirmation?: ExistingConfirmation) {
    if (submitting || loading || loadingError || values.organizationIds.length === 0) return;
    setSubmitting(true);
    setError("");
    const requestValues = confirmation
      ? { name: confirmation.account.name, email: confirmation.account.email, organizationIds: values.organizationIds }
      : { name: values.name.trim(), email: values.email.trim(), organizationIds: values.organizationIds };
    try {
      const response = await fetch("/api/policycraft/admin/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...requestValues,
          ...(confirmation ? { linkExisting: true, confirmedExistingAccountId: confirmation.account.id } : {}),
        }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 409 && result?.code === "ACCOUNT_EXISTS" && result.existingAccount) {
        setExistingConfirmation({ account: result.existingAccount as ExistingAccount });
        return;
      }
      if (!response.ok) throw new Error(result?.error || "Could not add this manager.");
      setSuccess(result?.mode === "existing"
        ? { mode: "existing", email: result.manager?.email || confirmation?.account.email || requestValues.email }
        : { mode: "invited", email: result.manager?.email || requestValues.email, deliverySent: result.delivery?.sent !== false });
      setExistingConfirmation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this manager.");
    } finally {
      setSubmitting(false);
    }
  }

  function submitManager(event: React.FormEvent<HTMLFormElement>) {
    void handleSubmit((values) => createManager(values))(event);
  }

  const activeOrganizations = organizations.filter((organization) => !organization.deleted && !organization.expired);
  const visibleOrganizations = activeOrganizations.filter((organization) => `${organization.name} ${organization.code} ${organizationSourceName(organization)}`.toLowerCase().includes(organizationSearch.trim().toLowerCase()));
  const createDisabledReason = loading
    ? "Organizations are still loading."
    : loadingError
      ? "Reload the organizations before adding a manager."
      : !name.trim() || !email.trim()
        ? "Enter the manager’s name and work email to continue."
        : organizationIds.length === 0
          ? "Select at least 1 organization to enable manager access."
          : "";

  const granted = success?.mode === "existing";
  const deliverySent = success?.mode === "invited" && success.deliverySent;
  const heroBack = <nav aria-label="Breadcrumb"><Link href="/admin" className={styles.heroLink}><ArrowLeft size={15} aria-hidden="true" />Managers</Link></nav>;

  if (success) {
    return <ApplicationSurface data-pc-workspace="manager-create" className={styles.surface}>
      <section className={styles.page} aria-labelledby="manager-create-title">
        <WorkspaceHero titleId="manager-create-title" title={granted ? "Manager access granted" : deliverySent ? "Invitation sent" : "Invitation created"} actions={heroBack} />
        <WorkspaceSheet className={styles.sheet} role="status" aria-live="polite">
          <div className={styles.successBody}>
            <span className={`${styles.successIcon} ${granted || deliverySent ? styles.successOk : styles.successWarn}`}>{granted || deliverySent ? <Check size={20} aria-hidden="true" /> : <AlertTriangle size={20} aria-hidden="true" />}</span>
            <p className={styles.successText}>{granted
              ? `${success.email} can sign in with their existing ESG password. No invitation email was sent, and their account name and organization details stay unchanged.`
              : deliverySent
                ? `An invitation link was sent to ${success.email}. They will choose a password when they accept.`
                : `The invitation for ${success.email} is ready, but the email could not be delivered. Resend it from the Managers list after checking the address.`}</p>
            <div className={styles.successActions}>
              <Link href="/admin" className={styles.primaryLink}><ArrowLeft size={14} aria-hidden="true" />Back to managers</Link>
              <Link href="/admin/policies" className={styles.secondaryLink}>View policies</Link>
            </div>
          </div>
        </WorkspaceSheet>
      </section>
    </ApplicationSurface>;
  }

  return <ApplicationSurface data-pc-workspace="manager-create" className={styles.surface}>
    <section className={styles.page} aria-labelledby="manager-create-title">
      <WorkspaceHero titleId="manager-create-title" title="Add manager" description="Set up a manager account and choose which client organizations they can access." actions={heroBack} stats={loading && organizations.length === 0 ? undefined : [
        { label: "Organizations available", value: activeOrganizations.length },
        { label: "Selected", value: organizationIds.length },
      ]} />

      <WorkspaceSheet className={styles.sheet}>
        {loadingError ? <div className={styles.alert} role="alert" aria-live="polite"><p>{loadingError}</p><button type="button" onClick={() => void loadOrganizations()} className={styles.retry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : error ? <p className={styles.alert} role="alert" aria-live="polite">{error}</p> : null}

        {existingConfirmation ? <section className={styles.existingAccount} aria-labelledby="existing-account-title" aria-live="polite">
          <div className={styles.existingContent}>
            <AlertTriangle size={18} aria-hidden="true" />
            <div className={styles.existingBody}>
              <h2 id="existing-account-title">This email already has an ESG account</h2>
              <p className={styles.existingIdentity}>{existingConfirmation.account.name} · {existingConfirmation.account.email}</p>
              <p className={styles.existingText}>Granting access adds this existing account as a manager. They keep their current password, account name, and organization details. No invitation or new password email will be sent. This confirms the {organizationIds.length} organization{organizationIds.length === 1 ? "" : "s"} currently selected.</p>
              <div className={styles.existingActions}>
                <ApplicationButton type="button" variant="primary" size="lg" className={`${styles.ctaButton} ${styles.grantButton}`} onClick={() => void createManager(getValues(), existingConfirmation)} busy={submitting} busyLabel="Granting access…" leadingIcon={<ShieldCheck size={14} aria-hidden="true" />}>Grant manager access</ApplicationButton>
                <ApplicationButton type="button" variant="outline" size="lg" onClick={() => setExistingConfirmation(null)} disabled={submitting}>Use another email</ApplicationButton>
              </div>
            </div>
          </div>
        </section> : null}

        <form className={styles.form} onSubmit={submitManager} aria-busy={submitting}>
          <div className={styles.columns}>
            <div className={styles.main}>
              <section className={styles.section} aria-labelledby="manager-details-title">
                <div className={styles.sectionHeading}><h2 id="manager-details-title">Account details</h2><span>Step 1 of 2</span></div>
                <p className={styles.sectionText}>Enter the person’s name and work email.</p>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>Full name<ApplicationInput {...register("name", { required: true, minLength: 2, maxLength: 120 })} autoComplete="name" required minLength={2} maxLength={120} disabled={submitting} /></label>
                  <label className={styles.field}>Work email<ApplicationInput {...register("email", { required: true, maxLength: 254 })} type="email" autoComplete="email" spellCheck={false} required maxLength={254} disabled={submitting} onChange={(event) => { register("email").onChange(event); setExistingConfirmation(null); }} /></label>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="organization-access-title">
                <div className={styles.sectionHeading}><h2 id="organization-access-title">Organization access</h2><span>Step 2 of 2</span></div>
                <p className={styles.sectionText}>Choose the client organizations this manager can open. Their policies are shared with assigned users.</p>
                <label htmlFor="invite-org-search" className={styles.searchLabel}>Search organizations</label>
                <ApplicationInput id="invite-org-search" name="organizationSearch" autoComplete="off" type="search" value={organizationSearch} onChange={(event) => setOrganizationSearch(event.target.value)} disabled={submitting} placeholder="Search by name or code" />
                <fieldset className={styles.fieldset}>
                  <legend className={styles.visuallyHidden}>Assigned organizations</legend>
                  <div className={styles.organizationList} aria-busy={loading}>
                    {loading ? <p className={styles.listNotice} aria-live="polite"><Loader2 size={14} className={styles.spinner} aria-hidden="true" />Loading organizations…</p> : loadingError ? <p className={styles.listNotice}>Organizations could not be loaded. Retry above to continue.</p> : visibleOrganizations.map((organization) => <label key={organization.id} className={styles.organizationOption}>
                      <input type="checkbox" disabled={submitting} checked={organizationIds.includes(organization.id)} onChange={(event) => setValue("organizationIds", event.target.checked ? [...new Set([...organizationIds, organization.id])] : organizationIds.filter((id) => id !== organization.id), { shouldDirty: true })} className={styles.checkbox} />
                      <span className={styles.organizationName}>{organization.name}</span>
                      <OrganizationSourceLabel organization={organization} className={styles.organizationSource} />
                      <span className={styles.organizationCode}>{organization.code}</span>
                    </label>)}
                    {!loading && !loadingError && activeOrganizations.length === 0 ? <p className={styles.listNotice}>No active organizations are available to assign.</p> : null}
                    {!loading && !loadingError && activeOrganizations.length > 0 && visibleOrganizations.length === 0 ? <p className={styles.listNotice}>No organizations match your search.</p> : null}
                  </div>
                </fieldset>
              </section>
            </div>

            <aside className={styles.aside} aria-labelledby="manager-access-summary-title">
              <span className={styles.asideIcon}><ShieldCheck size={18} aria-hidden="true" /></span>
              <h2 id="manager-access-summary-title" className={styles.asideTitle}>Access summary</h2>
              <p className={styles.asideText}>The manager will be able to open the organizations selected here.</p>
              <div className={styles.summary} aria-live="polite" aria-atomic="true">
                <p className={styles.summaryLabel}>Organizations selected</p>
                <p className={styles.summaryValue}><AnimatedNumber value={organizationIds.length} /></p>
                <p className={styles.summaryUnit}>{organizationIds.length === 1 ? "organization" : "organizations"}</p>
              </div>
              <div className={styles.accountSetup}>
                <h3>Account setup</h3>
                {existingConfirmation ? <p>This person already has an ESG account. Granting access keeps their existing password and sends no invitation.</p> : <p>A new account receives an invitation to set a password. Existing accounts keep their current password and receive no invitation.</p>}
              </div>
              {!submitting && createDisabledReason ? <p className={styles.disabledReason}>{createDisabledReason}</p> : null}
            </aside>
          </div>

          <div className={styles.formFooter}>
            <p className={styles.footerStatus} aria-live="polite" aria-atomic="true">{organizationIds.length} organization{organizationIds.length === 1 ? "" : "s"} selected</p>
            <div className={styles.footerActions}>
              <Link href="/admin" className={styles.cancelLink}>Cancel</Link>
              <ApplicationButton type="submit" variant="primary" size="lg" className={`${styles.ctaButton} ${styles.submitButton}`} disabled={loading || Boolean(loadingError) || submitting || !name.trim() || !email.trim() || organizationIds.length === 0} busy={submitting} busyLabel="Adding manager…" leadingIcon={<UserPlus size={14} aria-hidden="true" />}>Add manager</ApplicationButton>
            </div>
          </div>
        </form>
      </WorkspaceSheet>
    </section>
  </ApplicationSurface>;
}
