"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, ClipboardList, Clock3, History, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Search, UserRoundCog, X } from "lucide-react";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyCraftManagerSummary } from "@/lib/policycraft-access-types";
import type { PolicyCraftManagerWork, PolicyCraftTask, PolicyCraftTaskCollection, PolicyCraftTaskEvent, PolicyCraftTaskStatus } from "@/lib/policycraft-task-types";
import { organizationSourceName } from "@/components/workspace/organization-source-label";
import { DeadlineLabel, formatTaskDate, ManagerWorkTitle, TaskEditorModal, TaskFormDraft, TaskModal, TaskProgress, TaskStatus } from "./task-ui";
import styles from "./tasks.module.css";

type Tab = "tasks" | "work";
type Filters = { tab?: Tab; orgId?: string; managerId?: string; status?: string; type?: string; q?: string };
const button = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]";
const input = "h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]";
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

function TaskHistory({ taskId, expanded }: { taskId: string; expanded: boolean }) {
  const [events, setEvents] = React.useState<PolicyCraftTaskEvent[] | null>(null);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    if (!expanded || events) return;
    let active = true;
    void fetch(`/api/policycraft/admin/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || "Could not load task history.");
        if (active) setEvents(Array.isArray(body?.events) ? body.events : []);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load task history."); });
    return () => { active = false; };
  }, [attempt, expanded, events, taskId]);
  if (!expanded) return null;
  return <div className="mt-3 border-t border-[var(--color-line)] pt-3">
    {!events && !error ? <p className="flex items-center gap-2 text-xs text-[var(--color-muted)]" role="status"><Loader2 size={13} className="animate-spin" aria-hidden="true" />Loading history…</p> : null}
    {error ? <p role="alert" className="text-xs text-red-800">{error} <button type="button" onClick={() => { setEvents(null); setError(""); setAttempt((value) => value + 1); }} className="font-semibold underline">Retry</button></p> : null}
    {events ? events.length ? <ol className="space-y-2">{events.map((event) => <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"><span className="font-semibold text-[var(--color-ink)]">{event.actor.name || event.actor.role}</span><span className="text-[var(--color-ink-2)]">{event.eventType.replaceAll("_", " ")}</span><time className="text-[var(--color-muted)]">{formatTaskDate(event.createdAt, { dateStyle: "medium", timeStyle: "short" })}</time></li>)}</ol> : <p className="text-xs text-[var(--color-muted)]">No task history yet.</p> : null}
  </div>;
}

export function AdminTaskWorkspace() {
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

  return <div className={`${styles.workspace} min-w-0`}>
    <header className={`${styles.header} flex flex-col justify-between gap-4 border-b border-[var(--color-line)] pb-5 sm:flex-row sm:items-end`}>
      <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-forest)]">Administration</p><h1 className="mt-1 text-3xl font-semibold text-pretty">Tasks & manager work</h1><p className="mt-1 text-sm text-[var(--color-ink-2)]">Assign policy work and review each manager’s latest saved progress.</p></div>
      {filters.tab === "tasks" ? <button type="button" onClick={() => { setMutationError(""); setModalTask("create"); }} className={`${button} min-h-11 bg-[var(--color-forest)] px-4 text-sm text-white hover:bg-[var(--color-forest-deep)]`}><Plus size={15} aria-hidden="true" />Create task</button> : null}
    </header>

    <dl className={`${styles.summary} mt-5`} aria-label="Task summary">
      {([ ["Active", "active"], ["In progress", "inProgress"], ["Overdue", "overdue"], ["Completed", "completed"] ] as const).map(([label, key]) => <div key={key}><dt>{label}</dt><dd className={key === "overdue" && counts.overdue > 0 ? "text-red-800" : undefined}>{loaded ? counts[key] : loading ? <span className="animate-pulse" aria-label="Loading">…</span> : <span><span aria-hidden="true">-</span><span className="sr-only">Unavailable</span></span>}</dd></div>)}
    </dl>

    <div className={`${styles.tabs} mt-5 flex flex-wrap items-center gap-2 border-b border-[var(--color-line)]`} role="tablist" aria-label="Admin task views">
      {([{ id: "tasks", label: "Tasks", count: collection.tasks.length }, { id: "work", label: "Manager work", count: collection.managerWork.length }] as const).map((tab, index) => <button key={tab.id} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={`admin-task-tab-${tab.id}`} aria-controls="admin-task-panel" aria-selected={filters.tab === tab.id} tabIndex={filters.tab === tab.id ? 0 : -1} onKeyDown={(event) => moveTab(event, index)} onClick={() => updateFilters({ tab: tab.id }, "push")} className={`inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)] ${filters.tab === tab.id ? "border-[var(--color-forest)] text-[var(--color-forest-deep)]" : "border-transparent text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"}`}>{tab.label}<span className="min-w-5 rounded bg-[var(--color-cream-2)] px-1.5 py-0.5 text-center text-[10px] tabular-nums text-[var(--color-ink-2)]">{tab.count}</span></button>)}</div>

    <div className={`${styles.filters} mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(140px,200px))]`}>
      <label className="relative flex min-w-0 items-center gap-2 text-[11px] font-semibold text-[var(--color-ink-2)]"><span>Search</span><span className="relative min-w-0 flex-1"><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"/><input aria-label="Search task and manager work" autoComplete="off" name="q" value={filters.q} onChange={(event) => updateFilters({ q: event.target.value }, "replace")} placeholder="Title or manager…" className={`${input} pl-9`}/></span></label>
      <label className="text-[11px] font-semibold text-[var(--color-ink-2)]">Organization<select name="orgId" value={filters.orgId} onChange={(event) => updateFilters({ orgId: event.target.value })} className={`${input} mt-1`}><option value="all">All organizations</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {organizationSourceName(item)}</option>)}</select></label>
      <label className="text-[11px] font-semibold text-[var(--color-ink-2)]">Manager<select name="managerId" value={filters.managerId} onChange={(event) => updateFilters({ managerId: event.target.value })} className={`${input} mt-1`}><option value="all">All managers</option>{managerSummaries.filter((manager) => manager.status === "active").map((manager) => <option key={manager.id} value={manager.id}>{manager.name || manager.email}</option>)}</select></label>
      {filters.tab === "tasks" ? <label className="text-[11px] font-semibold text-[var(--color-ink-2)]">Status<select name="status" value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })} className={`${input} mt-1`}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label> : <div className="flex items-end"><p className="pb-2 text-xs text-[var(--color-muted)]">Progress reflects the manager’s latest successful save.</p></div>}
      <label className="text-[11px] font-semibold text-[var(--color-ink-2)]">Policy type<select name="type" value={filters.type} onChange={(event) => updateFilters({ type: event.target.value })} className={`${input} mt-1`}><option value="all">All policy types</option>{Object.entries(POLICY_PROFILES).map(([type, profile]) => <option key={type} value={type}>{profile.label}</option>)}</select></label>
    </div>

    {error ? <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"><span>{error}</span><button type="button" onClick={() => void load()} className={`${button} text-red-900 hover:bg-red-100`}><RefreshCw size={14} aria-hidden="true"/>Retry</button></div> : null}
    {notice ? <p role="status" aria-live="polite" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
    {mutationError && !modalTask && !confirmTask ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{mutationError}</p> : null}

    <section className={`${styles.results} mt-5`} aria-labelledby="admin-task-results-heading">
      <h2 id="admin-task-results-heading" className="sr-only">{filters.tab === "tasks" ? "Task results" : "Manager work results"}</h2>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2" aria-live="polite"><p className="text-xs font-medium text-[var(--color-ink-2)]">{loading && !loaded ? "Loading task progress…" : !loaded && error ? "Task data unavailable" : `Showing ${visibleCount} of ${totalCount} ${filters.tab === "tasks" ? "tasks" : "policies"}`}</p>{hasFilters && loaded ? <button type="button" onClick={clearFilters} className="min-h-9 px-2 text-xs font-semibold text-[var(--color-forest)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Clear filters</button> : null}</div>
      <div id="admin-task-panel" role="tabpanel" aria-labelledby={`admin-task-tab-${filters.tab}`} aria-busy={loading && !loaded} tabIndex={0}>
        {loading && !loaded ? <div className="grid min-h-52 place-items-center" role="status" aria-live="polite"><span className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"><Loader2 size={16} className="animate-spin" aria-hidden="true"/>Loading task progress…</span></div> : !loaded && error ? <div className={`${styles.empty} mt-7`}><ClipboardList size={22} aria-hidden="true"/><h2 className="mt-3 text-lg font-semibold">{filters.tab === "tasks" ? "Tasks unavailable" : "Manager work unavailable"}</h2><p className="mt-1 text-sm text-[var(--color-ink-2)]">Use Retry above to load task data.</p></div> : filters.tab === "tasks" ? <TaskTable tasks={tasks} hasTasks={collection.tasks.length > 0} hasFilters={hasFilters} onEdit={(task) => { setMutationError(""); setModalTask(task); }} onReassign={(task) => { setMutationError(""); setReassignTarget(task); }} onStateChange={(task, action) => { setMutationError(""); setConfirmTask({ task, action }); }} onHistory={(id) => setExpandedHistory((current) => current === id ? "" : id)} expandedHistory={expandedHistory} /> : <ManagerWorkTable work={managerWork} hasWork={collection.managerWork.length > 0} hasFilters={hasFilters} />}
      </div>
    </section>

    <TaskEditorModal open={modalTask === "create" || (typeof modalTask === "object" && modalTask !== null)} task={typeof modalTask === "object" && modalTask !== null ? modalTask : null} organizations={organizations} managers={managerSummaries} saving={mutating} error={mutationError} onClose={() => { setModalTask(null); setMutationError(""); }} onSubmit={(draft) => void submitEditor(draft)} />
    <ReassignModal key={reassignTarget?.id || "closed"} task={reassignTarget} managers={managerSummaries} onClose={() => { setReassignTarget(null); setMutationError(""); }} onSubmit={(draft) => void submitEditor(draft)} saving={mutating} error={mutationError} />
    <TaskModal open={!!confirmTask} onClose={() => { if (!mutating) setConfirmTask(null); }} title={confirmTask?.action === "cancel" ? "Cancel this task?" : "Reopen this task?"} description={confirmTask?.action === "cancel" ? "The manager will no longer be able to start or continue this task." : "The task will return to the manager’s assigned list."} width={460} hideClose={mutating}>
      {mutationError ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{mutationError}</p> : null}
      <p className="break-words text-sm font-semibold">{confirmTask?.task.title}</p><div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" disabled={mutating} onClick={() => setConfirmTask(null)} className={`${button} border border-[var(--color-line-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]`}>Keep task</button><button type="button" disabled={mutating} onClick={() => confirmTask && void changeTask(confirmTask.task, confirmTask.action)} className={`${button} ${confirmTask?.action === "cancel" ? "bg-red-700 text-white hover:bg-red-800" : "bg-[var(--color-forest)] text-white hover:bg-[var(--color-forest-deep)]"}`}>{mutating ? <Loader2 size={14} className="animate-spin" aria-hidden="true"/> : confirmTask?.action === "cancel" ? <X size={14} aria-hidden="true"/> : <RotateCcw size={14} aria-hidden="true"/>}{mutating ? "Saving…" : confirmTask?.action === "cancel" ? "Cancel task" : "Reopen task"}</button></div>
    </TaskModal>
  </div>;

}

function taskStatusIsTerminal(status: PolicyCraftTaskStatus): boolean { return status === "completed" || status === "cancelled"; }
function isOverdue(task: PolicyCraftTask): boolean { return !taskStatusIsTerminal(task.status) && new Date(`${task.dueDate.slice(0, 10)}T23:59:59.999+05:30`).getTime() < Date.now(); }
function managerWorkKey(item: PolicyCraftManagerWork): string { return `${item.manager.id}:${item.documentId}`; }
function managerWorkSavedAt(item: PolicyCraftManagerWork): string | null { return item.progress?.savedAt || null; }

function ReassignModal({ task, managers, onClose, onSubmit, saving, error }: {
  task: PolicyCraftTask | null; managers: PolicyCraftManagerSummary[]; onClose: () => void; onSubmit: (draft: TaskFormDraft) => void; saving: boolean; error: string;
}) {
  const eligible = managers.filter((manager) => manager.status === "active" && manager.organizations.some((organization) => organization.id === task?.organization.id && !organization.deleted && !organization.expired));
  const [managerId, setManagerId] = React.useState(task?.manager.id || "");
  return <TaskModal open={!!task} onClose={() => { if (!saving) onClose(); }} title="Reassign task" description="Choose a manager who already has access to this organization." width={500} hideClose={saving}>
    {task ? <form onSubmit={(event) => { event.preventDefault(); const manager = eligible.find((item) => item.id === managerId); if (task && manager) onSubmit({ title: task.title, instructions: task.instructions, organizationId: String(task.organization.id), managerId, policyType: task.policyType, dueDate: task.dueDate.slice(0, 10) }); }}>
      <p className="text-sm font-semibold">{task.title}</p><p className="mt-1 text-xs text-[var(--color-muted)]">{task.organization.name} · {organizationSourceName(task.organization)}</p>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p> : null}
      <label className="mt-5 block text-xs font-semibold text-[var(--color-ink-2)]">Manager<select aria-label="Manager" name="managerId" value={managerId} onChange={(event) => setManagerId(event.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]">{eligible.map((manager) => <option key={manager.id} value={manager.id}>{manager.name || manager.email} · {manager.email}</option>)}</select>{!eligible.length ? <span className="mt-1 block font-normal text-amber-800">No active managers are assigned to this organization.</span> : null}</label>
      <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" disabled={saving} onClick={onClose} className={`${button} border border-[var(--color-line-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]`}>Cancel</button><button type="submit" disabled={saving || !eligible.length || managerId === task.manager.id} className={`${button} bg-[var(--color-forest)] px-4 text-white hover:bg-[var(--color-forest-deep)]`}>{saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true"/> : <UserRoundCog size={14} aria-hidden="true"/>}{saving ? "Saving…" : "Reassign task"}</button></div>
    </form> : null}
  </TaskModal>;
}

function TaskTable({ tasks, hasTasks, hasFilters, onEdit, onReassign, onStateChange, onHistory, expandedHistory }: {
  tasks: PolicyCraftTask[]; hasTasks: boolean; hasFilters: boolean; onEdit: (task: PolicyCraftTask) => void; onReassign: (task: PolicyCraftTask) => void; onStateChange: (task: PolicyCraftTask, action: "cancel" | "reopen") => void; onHistory: (id: string) => void; expandedHistory: string;
}) {
  if (!tasks.length) return <div className={`${styles.empty} mt-7 border-y border-[var(--color-line)] py-14 text-center`}><ClipboardList size={22} className="mx-auto text-[var(--color-muted)]" aria-hidden="true"/><h2 className="mt-3 text-lg font-semibold">{hasFilters ? "No tasks match these filters" : hasTasks ? "No tasks found" : "No tasks yet"}</h2><p className="mt-1 text-sm text-[var(--color-ink-2)]">{hasFilters ? "Clear a filter to view assigned work." : "Create a task to assign policy work to a manager."}</p></div>;
  return <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-white">
    <div className="hidden overflow-x-auto xl:block"><table className={`${styles.table} w-full table-fixed border-collapse text-left text-sm`}><colgroup><col className="w-[24%]"/><col className="w-[16%]"/><col className="w-[16%]"/><col className="w-[19%]"/><col className="w-[13%]"/><col className="w-[12%]"/></colgroup><thead className="border-b border-[var(--color-line)] bg-[var(--color-cream-2)]/70 text-[10px] uppercase tracking-wide text-[var(--color-muted)]"><tr>{["Task / policy", "Organization", "Manager", "Manager progress", "Deadline", "Status & actions"].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--color-line)]">{tasks.map((task) => <tr key={task.id} className="align-top"><th scope="row" className="px-4 py-4 text-left"><p className="break-words font-semibold text-[var(--color-ink)]">{task.title}</p><p className="mt-1 text-xs text-[var(--color-ink-2)]">{POLICY_PROFILES[task.policyType]?.label || task.policyType}</p><HistoryButton expanded={expandedHistory === task.id} onClick={() => onHistory(task.id)}/><TaskHistory taskId={task.id} expanded={expandedHistory === task.id}/></th><td className="px-4 py-4"><span className="break-words text-sm">{task.organization.name}</span><span className="mt-1 block text-[10px] text-[var(--color-muted)]">{organizationSourceName(task.organization)}</span></td><td className="px-4 py-4"><span className="block break-words text-sm font-medium">{task.manager.name || "Manager"}</span><span className="mt-0.5 block break-all text-[11px] text-[var(--color-muted)]">{task.manager.email}</span></td><td className="px-4 py-4"><TaskProgress progress={task.progress} unavailableReason={task.unavailableReason} compact/>{task.progress ? <p className="mt-1 text-[10px] text-[var(--color-muted)]">Saved {formatTaskDate(task.progress.savedAt, { dateStyle: "medium", timeStyle: "short" })}</p> : null}</td><td className="px-4 py-4"><DeadlineLabel value={task.dueDate} status={task.status}/></td><td className="px-4 py-4"><TaskStatus status={task.status} dueDate={task.dueDate}/><TaskActions task={task} onEdit={onEdit} onReassign={onReassign} onStateChange={onStateChange}/></td></tr>)}</tbody></table></div>
    <div className={`${styles.mobileRows} divide-y divide-[var(--color-line)] xl:hidden`}>{tasks.map((task) => <article key={task.id} className="min-w-0 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words font-semibold text-[var(--color-ink)]">{task.title}</h2><p className="mt-1 text-xs text-[var(--color-ink-2)]">{POLICY_PROFILES[task.policyType]?.label || task.policyType} · {task.organization.name} · {organizationSourceName(task.organization)}</p></div><TaskStatus status={task.status} dueDate={task.dueDate}/></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Manager</p><p className="break-words text-sm font-medium">{task.manager.name || task.manager.email}</p></div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Deadline</p><DeadlineLabel value={task.dueDate} status={task.status}/></div><div className="sm:col-span-2"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Manager progress</p><TaskProgress progress={task.progress} unavailableReason={task.unavailableReason}/></div></div><HistoryButton expanded={expandedHistory === task.id} onClick={() => onHistory(task.id)}/><TaskHistory taskId={task.id} expanded={expandedHistory === task.id}/><TaskActions task={task} onEdit={onEdit} onReassign={onReassign} onStateChange={onStateChange}/></article>)}</div>
  </div>;
}

function HistoryButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} aria-expanded={expanded} className="mt-2 inline-flex min-h-8 items-center gap-1.5 text-[11px] font-semibold text-[var(--color-forest)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]"><History size={12} aria-hidden="true"/>{expanded ? "Hide history" : "History"}</button>; }

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
  if (!work.length) return <div className={`${styles.empty} mt-7 border-y border-[var(--color-line)] py-14 text-center`}><Clock3 size={22} className="mx-auto text-[var(--color-muted)]" aria-hidden="true"/><h2 className="mt-3 text-lg font-semibold">{hasFilters ? "No policies match these filters" : hasWork ? "No manager-saved policies found" : "No manager-saved policies yet"}</h2><p className="mt-1 text-sm text-[var(--color-ink-2)]">{hasFilters ? "Clear a filter to view manager work." : "Manager work appears here after a manager saves a policy."}</p></div>;
  return <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-white"><div className="hidden overflow-x-auto lg:block"><table className={`${styles.table} w-full table-fixed border-collapse text-left text-sm`}><colgroup><col className="w-[26%]"/><col className="w-[18%]"/><col className="w-[17%]"/><col className="w-[23%]"/><col className="w-[16%]"/></colgroup><thead className="border-b border-[var(--color-line)] bg-[var(--color-cream-2)]/70 text-[10px] uppercase tracking-wide text-[var(--color-muted)]"><tr>{["Policy", "Organization", "Manager", "Manager progress", "Last manager save"].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--color-line)]">{work.map((item) => <tr key={managerWorkKey(item)}><th scope="row" className="px-4 py-4"><ManagerWorkTitle item={item}/>{item.available ? <Link href={`/builder?draft=${encodeURIComponent(item.documentId)}&orgId=${item.organization.id}`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-[11px] font-semibold text-[var(--color-forest)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]">Open policy<ArrowUpRight size={12} aria-hidden="true"/></Link> : <p className="mt-2 text-[11px] text-[var(--color-muted)]">{item.unavailableReason || "Policy unavailable"}</p>}</th><td className="break-words px-4 py-4">{item.organization.name}</td><td className="px-4 py-4"><span className="block break-words font-medium">{item.manager.name}</span><span className="mt-0.5 block break-all text-[11px] text-[var(--color-muted)]">{item.manager.email}</span></td><td className="px-4 py-4"><TaskProgress progress={item.progress} unavailableReason={item.unavailableReason} compact/></td><td className="px-4 py-4 text-xs tabular-nums text-[var(--color-ink-2)]">{managerWorkSavedAt(item) ? formatTaskDate(managerWorkSavedAt(item)!, { dateStyle: "medium", timeStyle: "short" }) : "No manager save yet"}</td></tr>)}</tbody></table></div><div className={`${styles.mobileRows} divide-y divide-[var(--color-line)] lg:hidden`}>{work.map((item) => <article key={managerWorkKey(item)} className="min-w-0 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><ManagerWorkTitle item={item}/><p className="shrink-0 text-[11px] text-[var(--color-muted)]">{managerWorkSavedAt(item) ? `Saved ${formatTaskDate(managerWorkSavedAt(item)!, { dateStyle: "medium", timeStyle: "short" })}` : "No manager save yet"}</p></div><p className="mt-2 text-xs text-[var(--color-ink-2)]">{item.organization.name} · {item.manager.name}</p><div className="mt-4"><TaskProgress progress={item.progress} unavailableReason={item.unavailableReason} compact/></div>{item.available ? <Link href={`/builder?draft=${encodeURIComponent(item.documentId)}&orgId=${item.organization.id}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-[var(--color-forest)]">Open policy<ArrowUpRight size={13} aria-hidden="true"/></Link> : <p className="mt-2 text-xs text-[var(--color-muted)]">{item.unavailableReason || "Policy unavailable"}</p>}</article>)}</div></div>;
}
