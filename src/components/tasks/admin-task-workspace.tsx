"use client";

import { DelayedLoading } from "@/components/workspace/workspace-list";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ClipboardList, Clock3, History, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Search, UserRoundCog, X } from "lucide-react";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyCraftManagerSummary } from "@/lib/policycraft-access-types";
import type { PolicyCraftManagerWork, PolicyCraftTask, PolicyCraftTaskCollection, PolicyCraftTaskEvent, PolicyCraftTaskStatus } from "@/lib/policycraft-task-types";
import { organizationSelectOptions, organizationSourceName } from "@/components/workspace/organization-source-label";
import { SelectionPill, useRecordMotion, WorkspaceHero, WorkspaceSheet } from "@/components/workspace/workspace-motion";
import { ApplicationButton, ApplicationField, ApplicationInput } from "@/components/ui/app-primitives";
import { SelectMenu } from "@/components/ui/select-menu";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { DeadlineLabel, formatTaskDate, ManagerWorkTitle, TaskEditorModal, TaskFormDraft, TaskModal, TaskProgress, TaskStatus } from "./task-ui";
import styles from "./tasks.module.css";

type Tab = "tasks" | "work";
type Filters = { tab?: Tab; orgId?: string; managerId?: string; status?: string; type?: string; q?: string };
const button = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pc-brand)]";
const statuses: { id: string; label: string }[] = [{ id: "all", label: "All statuses" }, { id: "assigned", label: "Assigned" }, { id: "in_progress", label: "In progress" }, { id: "completed", label: "Completed" }, { id: "cancelled", label: "Cancelled" }, { id: "overdue", label: "Overdue" }];

function readFilters(params: URLSearchParams): Filters {
  const tab = params.get("tab");
  return {
    tab: tab === "work" ? "work" : "tasks",
    orgId: params.get("orgId") || "all",
    managerId: params.get("managerId") || "all",
    status: params.get("status") || "all",
    type: params.get("type") || "all",
    q: params.get("q") || "",
  };
}

function accentStyle(policyType: keyof typeof POLICY_PROFILES): React.CSSProperties {
  return { "--ws-type": POLICY_PROFILES[policyType]?.accent } as React.CSSProperties;
}

function TaskHistory({ taskId, expanded, loadKey }: { taskId: string; expanded: boolean; loadKey: number }) {
  const [attempt, setAttempt] = React.useState(0);
  const requestKey = `${loadKey}:${attempt}`;
  const [result, setResult] = React.useState<{ requestKey: string; events: PolicyCraftTaskEvent[] | null; error: string } | null>(null);
  const events = result?.requestKey === requestKey ? result.events : null;
  const error = result?.requestKey === requestKey ? result.error : "";
  React.useEffect(() => {
    if (!expanded) return;
    let active = true;
    void fetch(`/api/policycraft/admin/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || "Could not load task history.");
        if (active) setResult({ requestKey, events: Array.isArray(body?.events) ? body.events : [], error: "" });
      })
      .catch((cause) => { if (active) setResult({ requestKey, events: null, error: cause instanceof Error ? cause.message : "Could not load task history." }); });
    return () => { active = false; };
  }, [attempt, expanded, requestKey, taskId]);
  return <div className={`${styles.historyExpand} ${expanded ? styles.historyExpanded : ""}`} aria-hidden={!expanded} inert={!expanded}>
    <div className={styles.historyInner}><div className="mt-3 border-t border-[var(--color-line)] pt-3">
    {!events && !error ? <p className="flex items-center gap-2 text-xs text-[var(--color-muted)]" role="status"><Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading history…</p> : null}
    {error ? <p role="alert" className="text-xs text-red-800">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)} className="font-semibold underline">Retry</button></p> : null}
    {events ? events.length ? <ol className="space-y-2">{events.map((event) => <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"><span className="font-semibold text-[var(--color-ink)]">{event.actor.name || event.actor.role}</span><span className="text-[var(--color-ink-2)]">{event.eventType.replaceAll("_", " ")}</span><time className="text-[var(--color-muted)]">{formatTaskDate(event.createdAt, { dateStyle: "medium", timeStyle: "short" })}</time></li>)}</ol> : <p className="text-xs text-[var(--color-muted)]">No task history yet.</p> : null}
    </div></div>
  </div>;
}

export function AdminTaskWorkspace() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const filters = readFilters(new URLSearchParams(query));
  const { access } = usePolicyCraftWorkspace();
  const organizations = access.organizations.filter((item) => !item.deleted && !item.expired);
  const [collection, setCollection] = React.useState<PolicyCraftTaskCollection>({ tasks: [], managers: [], managerWork: [] });
  const [managerSummaries, setManagerSummaries] = React.useState<PolicyCraftManagerSummary[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [modalTask, setModalTask] = React.useState<PolicyCraftTask | null | "create">(null);
  const [reassignTarget, setReassignTarget] = React.useState<PolicyCraftTask | null>(null);
  const [mutationError, setMutationError] = React.useState("");
  const [mutating, setMutating] = React.useState(false);
  const [confirmTask, setConfirmTask] = React.useState<{ task: PolicyCraftTask; action: "cancel" | "reopen" } | null>(null);
  const [expandedHistory, setExpandedHistory] = React.useState("");
  const [historyLoadKey, setHistoryLoadKey] = React.useState(0);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const timerRef = React.useRef<number | null>(null);
  const requestRef = React.useRef(0);

  const load = React.useCallback(async (quiet = false) => {
    const request = ++requestRef.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [tasksResponse, managerResponse] = await Promise.all([
        fetch("/api/policycraft/admin/tasks", { cache: "no-store" }),
        fetch("/api/policycraft/admin/managers", { cache: "no-store" }),
      ]);
      const [taskBody, managerBody] = await Promise.all([tasksResponse.json().catch(() => null), managerResponse.json().catch(() => null)]);
      if (request !== requestRef.current) return;
      if (tasksResponse.status === 401 || managerResponse.status === 401) { router.replace("/login?next=%2Fadmin%2Ftasks"); return; }
      if (!tasksResponse.ok) throw new Error(taskBody?.error || "Could not load task progress.");
      if (!managerResponse.ok) throw new Error(managerBody?.error || "Could not load manager assignments.");
      setCollection({ tasks: taskBody?.tasks || [], managers: taskBody?.managers || [], managerWork: taskBody?.managerWork || [] });
      setManagerSummaries(managerBody?.managers || []);
      setLoaded(true);
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "Could not load tasks. Retry to continue.");
    } finally { if (request === requestRef.current) setLoading(false); }
  }, [router]);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  React.useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    timerRef.current = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  function updateFilters(updates: Filters, history: "push" | "replace" = "push") {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || (key === "tab" && value === "tasks")) params.delete(key);
      else params.set(key, value);
    }
    const next = params.toString();
    const href = `/admin/tasks${next ? `?${next}` : ""}`;
    if (history === "push") router.push(href, { scroll: false }); else router.replace(href, { scroll: false });
  }

  const normalizedQuery = filters.q?.trim().toLocaleLowerCase() || "";
  const tasks = collection.tasks.filter((task) => {
    if (filters.orgId !== "all" && String(task.organization.id) !== filters.orgId) return false;
    if (filters.managerId !== "all" && task.manager.id !== filters.managerId) return false;
    if (filters.status === "overdue" && taskStatusIsTerminal(task.status)) return false;
    if (filters.status !== "all" && filters.status !== "overdue" && task.status !== filters.status) return false;
    if (filters.status === "overdue" && !isOverdue(task)) return false;
    if (filters.type !== "all" && task.policyType !== filters.type) return false;
    const text = `${task.title} ${task.organization.name} ${task.manager.name} ${task.manager.email}`.toLocaleLowerCase();
    return !normalizedQuery || text.includes(normalizedQuery);
  });
  const managerWork = collection.managerWork.filter((item) => {
    if (filters.orgId !== "all" && String(item.organization.id) !== filters.orgId) return false;
    if (filters.managerId !== "all" && item.manager.id !== filters.managerId) return false;
    if (filters.type !== "all" && item.policyType !== filters.type) return false;
    const text = `${item.title} ${item.organization.name} ${item.manager.name} ${item.manager.email}`.toLocaleLowerCase();
    return !normalizedQuery || text.includes(normalizedQuery);
  }).sort((a, b) => Date.parse(b.progress?.savedAt || "") - Date.parse(a.progress?.savedAt || ""));
  const counts = {
    active: collection.tasks.filter((task) => task.status === "assigned" || task.status === "in_progress").length,
    inProgress: collection.tasks.filter((task) => task.status === "in_progress").length,
    overdue: collection.tasks.filter(isOverdue).length,
    completed: collection.tasks.filter((task) => task.status === "completed").length,
  };
  const hasFilters = filters.orgId !== "all" || filters.managerId !== "all" || filters.status !== "all" || filters.type !== "all" || !!filters.q?.trim();
  const visibleCount = filters.tab === "tasks" ? tasks.length : managerWork.length;
  const totalCount = filters.tab === "tasks" ? collection.tasks.length : collection.managerWork.length;
  const statValue = (value: number) => (loaded ? value : loading ? null : "–");

  function clearFilters() {
    updateFilters({ orgId: "all", managerId: "all", status: "all", type: "all", q: "" });
  }

  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % 2 : event.key === "ArrowLeft" ? (index + 1) % 2 : event.key === "Home" ? 0 : event.key === "End" ? 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const tab = nextIndex === 0 ? "tasks" : "work";
    updateFilters({ tab }, "push");
    tabRefs.current[nextIndex]?.focus();
  }

  async function submitEditor(draft: TaskFormDraft) {
    setMutating(true); setMutationError(""); setNotice("");
    const isReassign = !!reassignTarget;
    const task = typeof modalTask === "object" && modalTask !== null ? modalTask : null;
    const targetTask = reassignTarget || task;
    try {
      const response = targetTask ? await fetch(`/api/policycraft/admin/tasks/${encodeURIComponent(targetTask.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isReassign
          ? { version: targetTask.version, action: "reassign", managerId: draft.managerId }
          : { version: targetTask.version, action: "edit", title: draft.title, instructions: draft.instructions, dueDate: draft.dueDate, ...(targetTask.documentId ? {} : { policyType: draft.policyType, organizationId: Number(draft.organizationId), managerId: draft.managerId }) }),
      }) : await fetch("/api/policycraft/admin/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: Number(draft.organizationId), managerId: draft.managerId, title: draft.title, instructions: draft.instructions, policyType: draft.policyType, dueDate: draft.dueDate }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not save this task.");
      setModalTask(null); setReassignTarget(null);
      setNotice(isReassign ? "Task reassigned." : task ? "Task updated." : "Task assigned.");
      await load(true);
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : "Could not save this task."); }
    finally { setMutating(false); }
  }

  async function changeTask(task: PolicyCraftTask, action: "cancel" | "reopen") {
    setMutating(true); setMutationError("");
    try {
      const response = await fetch(`/api/policycraft/admin/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: task.version, action }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `Could not ${action} this task.`);
      setConfirmTask(null); setNotice(action === "cancel" ? "Task cancelled." : "Task reopened."); await load(true);
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : `Could not ${action} this task.`); }
    finally { setMutating(false); }
  }

  return <ApplicationSurface data-pc-workspace="tasks" className={`${styles.workspace} min-w-0`}>
    <WorkspaceHero
      titleId="admin-tasks-title"
      title="Tasks & manager work"
      description="Assign policy work and review each manager’s latest saved progress."
      stats={[
        { label: "Active", value: statValue(counts.active) },
        { label: "In progress", value: statValue(counts.inProgress) },
        { label: "Overdue", value: statValue(counts.overdue) },
        { label: "Completed", value: statValue(counts.completed) },
      ]}
      actions={filters.tab === "tasks" ? <button type="button" className={styles.heroCta} onClick={() => { setMutationError(""); setModalTask("create"); }}><Plus size={16} aria-hidden="true" />Create task</button> : undefined}
    />

    <WorkspaceSheet as="section" aria-label="Task register">
      <div className={styles.toolbar}>
        <div className={styles.segments} role="tablist" aria-label="Admin task views">
          {([{ id: "tasks", label: "Tasks", count: collection.tasks.length }, { id: "work", label: "Manager work", count: collection.managerWork.length }] as const).map((tab, index) => {
            const selected = filters.tab === tab.id;
            return <button key={tab.id} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={`admin-task-tab-${tab.id}`} aria-controls="admin-task-panel" aria-selected={selected} tabIndex={selected ? 0 : -1} onKeyDown={(event) => moveTab(event, index)} onClick={() => updateFilters({ tab: tab.id }, "push")} className={`${styles.segment} ${selected ? styles.segmentSelected : ""}`}>
              {selected ? <SelectionPill layoutId="admin-task-tab" /> : null}
              {tab.label}<span className={styles.segmentCount}>{tab.count}</span>
            </button>;
          })}
        </div>
      </div>

      <div className={`${styles.filterBand} ${styles.filterBandWide}`}>
        <label className={`${styles.fieldLabel} ${styles.searchField}`}><span>Search</span><span className={styles.searchControl}><Search size={15} aria-hidden="true" className={styles.searchIcon}/><ApplicationInput aria-label="Search task and manager work" autoComplete="off" name="q" value={filters.q} onChange={(event) => updateFilters({ q: event.target.value }, "replace")} placeholder="Title or manager…" size="compact"/></span></label>
        <label className={styles.fieldLabel}>Organization<SelectMenu name="orgId" value={filters.orgId ?? "all"} onValueChange={(orgId) => updateFilters({ orgId })} options={[{ value: "all", label: "All organizations" }, ...organizationSelectOptions(organizations)]} searchPlaceholder="Search organizations…" /></label>
        <label className={styles.fieldLabel}>Manager<SelectMenu name="managerId" value={filters.managerId ?? "all"} onValueChange={(managerId) => updateFilters({ managerId })} options={[{ value: "all", label: "All managers" }, ...managerSummaries.filter((manager) => manager.status === "active").map((manager) => ({ value: manager.id, label: manager.name || manager.email, description: manager.name ? manager.email : undefined }))]} searchPlaceholder="Search managers…" /></label>
        {filters.tab === "tasks" ? <label className={styles.fieldLabel}>Status<SelectMenu name="status" value={filters.status ?? "all"} onValueChange={(status) => updateFilters({ status })} options={statuses.map((status) => ({ value: status.id, label: status.label }))} /></label> : <p className={styles.bandNote}>Progress reflects the manager’s latest successful save.</p>}
        <label className={styles.fieldLabel}>Policy type<SelectMenu name="type" value={filters.type ?? "all"} onValueChange={(type) => updateFilters({ type })} options={[{ value: "all", label: "All policy types" }, ...Object.entries(POLICY_PROFILES).map(([type, profile]) => ({ value: type, label: profile.label }))]} /></label>
      </div>

      <div className={styles.messages}>
        {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"><span>{error}</span><button type="button" onClick={() => void load()} className={`${button} text-red-900 hover:bg-red-100`}><RefreshCw size={14} aria-hidden="true"/>Retry</button></div> : null}
        {notice ? <p role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
        {mutationError && !modalTask && !confirmTask ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{mutationError}</p> : null}
      </div>

      <section className={styles.results} aria-labelledby="admin-task-results-heading">
        <h2 id="admin-task-results-heading" className="sr-only">{filters.tab === "tasks" ? "Task results" : "Manager work results"}</h2>
        <div className={styles.resultsBar} aria-live="polite"><p className={styles.resultsCount}>{loading && !loaded ? "Loading task progress…" : !loaded && error ? "Task data unavailable" : `Showing ${visibleCount} of ${totalCount} ${filters.tab === "tasks" ? "tasks" : "policies"}`}</p>{hasFilters && loaded ? <button type="button" onClick={clearFilters} className={styles.clearFilters}>Clear filters</button> : null}</div>
        <div id="admin-task-panel" className={styles.panelBody} role="tabpanel" aria-labelledby={`admin-task-tab-${filters.tab}`} aria-busy={loading && !loaded} tabIndex={0}>
          <motion.div key={filters.tab} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}>
            {loading && !loaded ? <DelayedLoading label="Loading task progress…"><div className={styles.loadingBlock} role="status" aria-live="polite"><span className={styles.loadingLine}><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/>Loading task progress…</span><RecordSkeleton /></div></DelayedLoading> : !loaded && error ? <div className={styles.empty}><span className={styles.emptyIcon} aria-hidden="true"><ClipboardList size={22}/></span><h2>{filters.tab === "tasks" ? "Tasks unavailable" : "Manager work unavailable"}</h2><p>Use Retry above to load task data.</p></div> : filters.tab === "tasks" ? <TaskTable tasks={tasks} hasTasks={collection.tasks.length > 0} hasFilters={hasFilters} onEdit={(task) => { setMutationError(""); setModalTask(task); }} onReassign={(task) => { setMutationError(""); setReassignTarget(task); }} onStateChange={(task, action) => { setMutationError(""); setConfirmTask({ task, action }); }} onHistory={(id) => { const opening = expandedHistory !== id; setExpandedHistory(opening ? id : ""); if (opening) setHistoryLoadKey((value) => value + 1); }} expandedHistory={expandedHistory} historyLoadKey={historyLoadKey} /> : <ManagerWorkTable work={managerWork} hasWork={collection.managerWork.length > 0} hasFilters={hasFilters} />}
          </motion.div>
        </div>
      </section>
    </WorkspaceSheet>

    <TaskEditorModal open={modalTask === "create" || (typeof modalTask === "object" && modalTask !== null)} task={typeof modalTask === "object" && modalTask !== null ? modalTask : null} organizations={organizations} managers={managerSummaries} saving={mutating} error={mutationError} onClose={() => { setModalTask(null); setMutationError(""); }} onSubmit={(draft) => void submitEditor(draft)} />
    <ReassignModal key={reassignTarget?.id || "closed"} task={reassignTarget} managers={managerSummaries} onClose={() => { setReassignTarget(null); setMutationError(""); }} onSubmit={(draft) => void submitEditor(draft)} saving={mutating} error={mutationError} />
    <TaskModal open={!!confirmTask} onClose={() => { if (!mutating) setConfirmTask(null); }} title={confirmTask?.action === "cancel" ? "Cancel this task?" : "Reopen this task?"} description={confirmTask?.action === "cancel" ? "The manager will no longer be able to start or continue this task." : "The task will return to the manager’s assigned list."} width={460} hideClose={mutating}>
      {mutationError ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{mutationError}</p> : null}
      <p className="break-words text-sm font-semibold">{confirmTask?.task.title}</p><div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><ApplicationButton type="button" disabled={mutating} onClick={() => setConfirmTask(null)} variant="outline">Keep task</ApplicationButton><ApplicationButton type="button" disabled={mutating} onClick={() => confirmTask && void changeTask(confirmTask.task, confirmTask.action)} variant={confirmTask?.action === "cancel" ? "danger" : "primary"} busy={mutating} busyLabel="Saving…" className="min-w-36" leadingIcon={confirmTask?.action === "cancel" ? <X size={14} aria-hidden="true"/> : <RotateCcw size={14} aria-hidden="true"/>}>{confirmTask?.action === "cancel" ? "Cancel task" : "Reopen task"}</ApplicationButton></div>
    </TaskModal>
  </ApplicationSurface>;

}

function taskStatusIsTerminal(status: PolicyCraftTaskStatus): boolean { return status === "completed" || status === "cancelled"; }
function isOverdue(task: PolicyCraftTask): boolean { return !taskStatusIsTerminal(task.status) && new Date(`${task.dueDate.slice(0, 10)}T23:59:59.999+05:30`).getTime() < Date.now(); }
function managerWorkKey(item: PolicyCraftManagerWork): string { return `${item.manager.id}:${item.documentId}`; }
function managerWorkSavedAt(item: PolicyCraftManagerWork): string | null { return item.progress?.savedAt || null; }

function ReassignModal({ task, managers, onClose, onSubmit, saving, error }: {
  task: PolicyCraftTask | null; managers: PolicyCraftManagerSummary[]; onClose: () => void; onSubmit: (draft: TaskFormDraft) => void; saving: boolean; error: string;
}) {
  const taskOrganizationId = task?.organization.id;
  const eligible = React.useMemo(() => managers.filter((manager) => manager.status === "active" && manager.organizations.some((organization) => organization.id === taskOrganizationId && !organization.deleted && !organization.expired)), [managers, taskOrganizationId]);
  const managerSchema = React.useMemo(() => z.object({ managerId: z.string().min(1, "Choose a manager assigned to this organization.") }).superRefine(({ managerId }, context) => {
    if (!eligible.some((manager) => manager.id === managerId)) context.addIssue({ code: "custom", path: ["managerId"], message: "Choose a manager assigned to this organization." });
  }), [eligible]);
  const form = useForm<{ managerId: string }>({ defaultValues: { managerId: task?.manager.id || "" }, resolver: zodResolver(managerSchema), mode: "onSubmit", reValidateMode: "onSubmit" });
  const managerId = useWatch({ control: form.control, name: "managerId" });
  return <TaskModal open={!!task} onClose={() => { if (!saving) onClose(); }} title="Reassign task" description="Choose a manager who already has access to this organization." width={500} hideClose={saving}>
    {task ? <form onSubmit={form.handleSubmit(({ managerId: selectedManagerId }) => { const manager = eligible.find((item) => item.id === selectedManagerId); if (task && manager) onSubmit({ title: task.title, instructions: task.instructions, organizationId: String(task.organization.id), managerId: selectedManagerId, policyType: task.policyType, dueDate: task.dueDate.slice(0, 10) }); })}>
      <p className="text-sm font-semibold">{task.title}</p><p className="mt-1 text-xs text-[var(--color-muted)]">{task.organization.name} · {organizationSourceName(task.organization)}</p>
      {error ? <p role="alert" aria-live="polite" className={`${styles.errorMessage} mt-4`}>{error}</p> : null}
      <ApplicationField id="reassign-manager" label="Manager" error={form.formState.errors.managerId?.message} hint={!eligible.length ? "No active managers are assigned to this organization." : undefined} className="mt-5"><SelectMenu value={managerId} onValueChange={(next) => form.setValue("managerId", next, { shouldDirty: true })} options={eligible.map((manager) => ({ value: manager.id, label: manager.name || manager.email, description: manager.name ? manager.email : undefined }))} placeholder="Choose a manager" searchPlaceholder="Search managers…" className="mt-1" /></ApplicationField>
      <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><ApplicationButton type="button" disabled={saving} onClick={onClose} variant="outline">Cancel</ApplicationButton><ApplicationButton type="submit" disabled={saving || !eligible.length || managerId === task.manager.id} busy={saving} busyLabel="Saving…" variant="primary" className="min-w-36" leadingIcon={<UserRoundCog size={14} aria-hidden="true"/>}>Reassign task</ApplicationButton></div>
    </form> : null}
  </TaskModal>;
}

function TaskTable({ tasks, hasTasks, hasFilters, onEdit, onReassign, onStateChange, onHistory, expandedHistory, historyLoadKey }: {
  tasks: PolicyCraftTask[]; hasTasks: boolean; hasFilters: boolean; onEdit: (task: PolicyCraftTask) => void; onReassign: (task: PolicyCraftTask) => void; onStateChange: (task: PolicyCraftTask, action: "cancel" | "reopen") => void; onHistory: (id: string) => void; expandedHistory: string; historyLoadKey: number;
}) {
  const recordMotion = useRecordMotion();
  if (!tasks.length) return <div className={styles.empty}><span className={styles.emptyIcon} aria-hidden="true"><ClipboardList size={22}/></span><h2>{hasFilters ? "No tasks match these filters" : hasTasks ? "No tasks found" : "No tasks yet"}</h2><p>{hasFilters ? "Clear a filter to view assigned work." : "Create a task to assign policy work to a manager."}</p></div>;
  return <div className={styles.recordList}>
    <div className={`${styles.tableScroll} hidden xl:block`}><table className={styles.table}><colgroup><col className="w-[24%]"/><col className="w-[16%]"/><col className="w-[16%]"/><col className="w-[19%]"/><col className="w-[13%]"/><col className="w-[12%]"/></colgroup><thead><tr>{["Task / policy", "Organization", "Manager", "Manager progress", "Deadline", "Status & actions"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody><AnimatePresence initial={false}>{tasks.map((task, index) => <motion.tr key={task.id} data-ws-row="" className={styles.row} style={accentStyle(task.policyType)} {...recordMotion(index)}><th scope="row"><p className={styles.rowTitle}>{task.title}</p><p className={styles.rowMeta}>{POLICY_PROFILES[task.policyType]?.label || task.policyType}</p><HistoryButton expanded={expandedHistory === task.id} onClick={() => onHistory(task.id)}/><TaskHistory taskId={task.id} expanded={expandedHistory === task.id} loadKey={historyLoadKey}/></th><td><span className="break-words text-sm">{task.organization.name}</span><span className="mt-1 block text-[10px] text-[var(--color-muted)]">{organizationSourceName(task.organization)}</span></td><td><span className="block break-words text-sm font-medium">{task.manager.name || "Manager"}</span><span className="mt-0.5 block break-all text-[11px] text-[var(--color-muted)]">{task.manager.email}</span></td><td><TaskProgress progress={task.progress} unavailableReason={task.unavailableReason} compact/>{task.progress ? <p className="mt-1 text-[10px] text-[var(--color-muted)]">Saved {formatTaskDate(task.progress.savedAt, { dateStyle: "medium", timeStyle: "short" })}</p> : null}</td><td><DeadlineLabel value={task.dueDate} status={task.status}/></td><td><TaskStatus status={task.status} dueDate={task.dueDate}/><TaskActions task={task} onEdit={onEdit} onReassign={onReassign} onStateChange={onStateChange}/></td></motion.tr>)}</AnimatePresence></tbody></table></div>
    <div className={`${styles.mobileRows} xl:hidden`}><AnimatePresence initial={false}>{tasks.map((task, index) => <motion.article key={task.id} data-ws-row="" className={styles.mobileRow} style={accentStyle(task.policyType)} {...recordMotion(index)}><div className={styles.mobileHead}><div className="min-w-0 flex-1"><h2 className={styles.rowTitle}>{task.title}</h2><p className={styles.rowMeta}>{POLICY_PROFILES[task.policyType]?.label || task.policyType} · {task.organization.name} · {organizationSourceName(task.organization)}</p></div><TaskStatus status={task.status} dueDate={task.dueDate}/></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className={styles.fieldKicker}>Manager</p><p className="break-words text-sm font-medium">{task.manager.name || task.manager.email}</p></div><div><p className={styles.fieldKicker}>Deadline</p><DeadlineLabel value={task.dueDate} status={task.status}/></div><div className="sm:col-span-2"><p className={styles.fieldKicker}>Manager progress</p><TaskProgress progress={task.progress} unavailableReason={task.unavailableReason}/></div></div><HistoryButton expanded={expandedHistory === task.id} onClick={() => onHistory(task.id)}/><TaskHistory taskId={task.id} expanded={expandedHistory === task.id} loadKey={historyLoadKey}/><TaskActions task={task} onEdit={onEdit} onReassign={onReassign} onStateChange={onStateChange}/></motion.article>)}</AnimatePresence></div>
  </div>;
}

function HistoryButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} aria-expanded={expanded} className={styles.historyButton}><History size={12} aria-hidden="true"/>{expanded ? "Hide history" : "History"}</button>; }

function TaskActions({ task, onEdit, onReassign, onStateChange }: { task: PolicyCraftTask; onEdit: (task: PolicyCraftTask) => void; onReassign: (task: PolicyCraftTask) => void; onStateChange: (task: PolicyCraftTask, action: "cancel" | "reopen") => void }) {
  const iconButton = "inline-flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] sm:size-9";
  return <div className="mt-2 flex flex-nowrap gap-1">
    <button type="button" onClick={() => onEdit(task)} title={`Edit ${task.title}`} aria-label={`Edit ${task.title}`} className={`${iconButton} border-[var(--color-line-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]`}><Pencil size={14} aria-hidden="true"/></button>
    <button type="button" onClick={() => onReassign(task)} title={`Reassign ${task.title}`} aria-label={`Reassign ${task.title}`} disabled={task.status === "cancelled"} className={`${iconButton} border-[var(--color-line-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] disabled:opacity-50`}><UserRoundCog size={14} aria-hidden="true"/></button>
    {task.status === "cancelled" || task.status === "completed"
      ? <button type="button" onClick={() => onStateChange(task, "reopen")} title={`Reopen ${task.title}`} aria-label={`Reopen ${task.title}`} className={`${iconButton} border-[var(--color-line-2)] text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)]`}><RotateCcw size={14} aria-hidden="true"/></button>
      : <button type="button" onClick={() => onStateChange(task, "cancel")} title={`Cancel ${task.title}`} aria-label={`Cancel ${task.title}`} className={`${iconButton} border-red-200 text-red-800 hover:bg-red-50`}><X size={14} aria-hidden="true"/></button>}
  </div>;
}

function ManagerWorkTable({ work, hasWork, hasFilters }: { work: PolicyCraftManagerWork[]; hasWork: boolean; hasFilters: boolean }) {
  const recordMotion = useRecordMotion();
  if (!work.length) return <div className={styles.empty}><span className={styles.emptyIcon} aria-hidden="true"><Clock3 size={22}/></span><h2>{hasFilters ? "No policies match these filters" : hasWork ? "No manager-saved policies found" : "No manager-saved policies yet"}</h2><p>{hasFilters ? "Clear a filter to view manager work." : "Manager work appears here after a manager saves a policy."}</p></div>;
  return <div className={styles.recordList}><div className={`${styles.tableScroll} hidden lg:block`}><table className={styles.table}><colgroup><col className="w-[26%]"/><col className="w-[18%]"/><col className="w-[17%]"/><col className="w-[23%]"/><col className="w-[16%]"/></colgroup><thead><tr>{["Policy", "Organization", "Manager", "Manager progress", "Last manager save"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody><AnimatePresence initial={false}>{work.map((item, index) => <motion.tr key={managerWorkKey(item)} data-ws-row="" className={styles.row} style={accentStyle(item.policyType)} {...recordMotion(index)}><th scope="row"><ManagerWorkTitle item={item}/>{item.available ? <Link href={`/builder?draft=${encodeURIComponent(item.documentId)}&orgId=${item.organization.id}`} className={styles.openLink}>Open policy<ArrowUpRight size={12} aria-hidden="true"/></Link> : <p className="mt-2 text-[11px] text-[var(--color-muted)]">{item.unavailableReason || "Policy unavailable"}</p>}</th><td className="break-words">{item.organization.name}</td><td><span className="block break-words font-medium">{item.manager.name}</span><span className="mt-0.5 block break-all text-[11px] text-[var(--color-muted)]">{item.manager.email}</span></td><td><TaskProgress progress={item.progress} unavailableReason={item.unavailableReason} compact/></td><td className="text-xs tabular-nums text-[var(--color-ink-2)]">{managerWorkSavedAt(item) ? formatTaskDate(managerWorkSavedAt(item)!, { dateStyle: "medium", timeStyle: "short" }) : "No manager save yet"}</td></motion.tr>)}</AnimatePresence></tbody></table></div><div className={`${styles.mobileRows} lg:hidden`}><AnimatePresence initial={false}>{work.map((item, index) => <motion.article key={managerWorkKey(item)} data-ws-row="" className={styles.mobileRow} style={accentStyle(item.policyType)} {...recordMotion(index)}><div className={styles.mobileHead}><ManagerWorkTitle item={item}/><p className="shrink-0 text-[11px] text-[var(--color-muted)]">{managerWorkSavedAt(item) ? `Saved ${formatTaskDate(managerWorkSavedAt(item)!, { dateStyle: "medium", timeStyle: "short" })}` : "No manager save yet"}</p></div><p className="mt-2 text-xs text-[var(--color-ink-2)]">{item.organization.name} · {item.manager.name}</p><div className="mt-4"><TaskProgress progress={item.progress} unavailableReason={item.unavailableReason} compact/></div>{item.available ? <Link href={`/builder?draft=${encodeURIComponent(item.documentId)}&orgId=${item.organization.id}`} className={styles.openLink}>Open policy<ArrowUpRight size={13} aria-hidden="true"/></Link> : <p className="mt-2 text-xs text-[var(--color-muted)]">{item.unavailableReason || "Policy unavailable"}</p>}</motion.article>)}</AnimatePresence></div></div>;
}
