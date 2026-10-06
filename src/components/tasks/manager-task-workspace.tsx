"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarClock, ClipboardList, Loader2, RefreshCw, Search } from "lucide-react";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { organizationSourceName } from "@/components/workspace/organization-source-label";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyCraftTask, PolicyCraftTaskStatus } from "@/lib/policycraft-task-types";
import { deadlineState, DeadlineLabel, TaskProgress, TaskStatus } from "./task-ui";
import styles from "./tasks.module.css";

type Filters = { orgId: string; type: string; status: string; q: string };
const input = "h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]";
const action = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-55";

function readFilters(params: URLSearchParams): Filters {
  return { orgId: params.get("orgId") || "all", type: params.get("type") || "all", status: params.get("status") || "all", q: params.get("q") || "" };
}

function terminal(status: PolicyCraftTaskStatus) { return status === "completed" || status === "cancelled"; }

export function ManagerTaskWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const filters = readFilters(new URLSearchParams(query));
  const { access } = usePolicyCraftWorkspace();
  const [work, setWork] = React.useState<PolicyCraftTask[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingTask, setLoadingTask] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const requestRef = React.useRef(0);

  const load = React.useCallback(async (quiet = false) => {
    const request = ++requestRef.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/policycraft/tasks", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (request !== requestRef.current) return;
      if (response.status === 401) { router.replace("/login?next=%2Fmanager%2Ftasks"); return; }
      if (!response.ok) throw new Error(body?.error || "Could not load your assigned tasks.");
      setWork(Array.isArray(body?.tasks) ? body.tasks : []);
      setLoaded(true);
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "Could not load your tasks. Retry to continue.");
    } finally { if (request === requestRef.current) setLoading(false); }
  }, [router]);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  React.useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  function updateFilters(updates: Partial<Filters>, history: "push" | "replace" = "push") {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key); else params.set(key, value);
    }
    const next = params.toString();
    const href = `/manager/tasks${next ? `?${next}` : ""}`;
    if (history === "push") router.push(href, { scroll: false }); else router.replace(href, { scroll: false });
  }

  async function startTask(task: PolicyCraftTask) {
    if (loadingTask) return;
    setLoadingTask(task.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/policycraft/tasks/${encodeURIComponent(task.id)}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const body = await response.json().catch(() => null);
      if (response.status === 401) { router.replace("/login?next=%2Fmanager%2Ftasks"); return; }
      if (!response.ok) throw new Error(body?.error || "Could not start this task. Retry to continue.");
      router.push(`/builder?draft=${encodeURIComponent(body.documentId)}&orgId=${body.organizationId}&taskId=${encodeURIComponent(task.id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start this task."); }
    finally { setLoadingTask(""); }
  }

  const activeOrganizations = access.organizations.filter((organization) => !organization.deleted && !organization.expired);
  const normalizedQuery = filters.q.trim().toLocaleLowerCase();
  const tasks = work.filter((task) => {
    if (filters.orgId !== "all" && String(task.organization.id) !== filters.orgId) return false;
    if (filters.type !== "all" && task.policyType !== filters.type) return false;
    if (filters.status !== "all" && task.status !== filters.status) return false;
    return !normalizedQuery || `${task.title} ${task.organization.name}`.toLocaleLowerCase().includes(normalizedQuery);
  }).sort((left, right) => {
    if (terminal(left.status) !== terminal(right.status)) return terminal(left.status) ? 1 : -1;
    return Date.parse(left.dueDate) - Date.parse(right.dueDate);
  });
  const counts = {
    active: work.filter((task) => !terminal(task.status)).length,
    inProgress: work.filter((task) => task.status === "in_progress").length,
    overdue: work.filter((task) => deadlineState(task.dueDate, task.status) === "overdue").length,
    completed: work.filter((task) => task.status === "completed").length,
  };
  const hasFilters = filters.orgId !== "all" || filters.type !== "all" || filters.status !== "all" || !!filters.q.trim();

  function clearFilters() {
    updateFilters({ orgId: "all", type: "all", status: "all", q: "" });
  }

  return <div className={`${styles.workspace} min-w-0`}>
    <header className={`${styles.header} flex flex-col justify-between gap-4 border-b border-[var(--color-line)] pb-5 sm:flex-row sm:items-end`}>
      <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-forest)]">Manager workspace</p><h1 className="mt-1 text-3xl font-semibold text-pretty">My tasks</h1><p className="mt-1 text-sm text-[var(--color-ink-2)]">Start an assignment or continue the policy you’re working on.</p></div>
      <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-muted)]"><CalendarClock size={14} aria-hidden="true"/>Deadlines use India Standard Time</p>
    </header>

    <dl className={`${styles.summary} mt-5`} aria-label="Task summary">
      {([ ["Active", "active"], ["In progress", "inProgress"], ["Overdue", "overdue"], ["Completed", "completed"] ] as const).map(([label, key]) => <div key={key}><dt>{label}</dt><dd className={key === "overdue" && counts.overdue > 0 ? "text-red-800" : undefined}>{loaded ? counts[key] : loading ? <span className="animate-pulse" aria-label="Loading">…</span> : <span><span aria-hidden="true">-</span><span className="sr-only">Unavailable</span></span>}</dd></div>)}
    </dl>

    <div className={`${styles.filters} mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(160px,220px)_minmax(160px,220px)_minmax(150px,200px)]`}>
      <label className="text-[11px] font-semibold text-[var(--color-ink-2)]"><span>Search</span><span className="relative block"><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"/><input name="q" autoComplete="off" aria-label="Search tasks" value={filters.q} onChange={(event) => updateFilters({ q: event.target.value }, "replace")} placeholder="Task or organization…" className={`${input} pl-9`}/></span></label>
      <label className="text-[11px] font-semibold text-[var(--color-ink-2)]">Organization<select name="orgId" value={filters.orgId} onChange={(event) => updateFilters({ orgId: event.target.value })} className={`${input} mt-1`}><option value="all">All organizations</option>{activeOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organizationSourceName(organization)}</option>)}</select></label>
      <label className="text-[11px] font-semibold text-[var(--color-ink-2)]">Policy type<select name="type" value={filters.type} onChange={(event) => updateFilters({ type: event.target.value })} className={`${input} mt-1`}><option value="all">All policy types</option>{Object.entries(POLICY_PROFILES).map(([type, profile]) => <option key={type} value={type}>{profile.label}</option>)}</select></label>
      <label className="text-[11px] font-semibold text-[var(--color-ink-2)]">Status<select name="status" value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })} className={`${input} mt-1`}><option value="all">All tasks</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
    </div>
    {error ? <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"><span>{error}</span><button type="button" onClick={() => void load()} className="inline-flex min-h-9 items-center gap-2 rounded-md px-3 font-semibold text-red-900 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><RefreshCw size={14} aria-hidden="true"/>Retry</button></div> : null}
    {notice ? <p role="status" aria-live="polite" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
    <section className={`${styles.results} mt-5`} aria-labelledby="manager-task-results-heading">
      <h2 id="manager-task-results-heading" className="sr-only">Task results</h2>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2" aria-live="polite"><p className="text-xs font-medium text-[var(--color-ink-2)]">{loading && !loaded ? "Loading tasks…" : !loaded && error ? "Task data unavailable" : `Showing ${tasks.length} of ${work.length} tasks`}</p>{hasFilters && loaded ? <button type="button" onClick={clearFilters} className="min-h-9 px-2 text-xs font-semibold text-[var(--color-forest)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Clear filters</button> : null}</div>
      <div aria-busy={loading && !loaded}>
        {loading && !loaded ? <div className="grid min-h-52 place-items-center" role="status" aria-live="polite"><span className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"><Loader2 size={16} className="animate-spin" aria-hidden="true"/>Loading tasks…</span></div> : !loaded && error ? <div className={`${styles.empty} mt-7`}><ClipboardList size={24} aria-hidden="true"/><h2 className="mt-3 text-lg font-semibold">Tasks unavailable</h2><p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-ink-2)]">Use Retry above to load your assigned tasks.</p></div> : tasks.length ? <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-white"><div className="hidden overflow-x-auto lg:block"><table className={`${styles.table} w-full table-fixed border-collapse text-left text-sm`}><colgroup><col className="w-[30%]"/><col className="w-[16%]"/><col className="w-[22%]"/><col className="w-[16%]"/><col className="w-[16%]"/></colgroup><thead className="border-b border-[var(--color-line)] bg-[var(--color-cream-2)]/70 text-[10px] uppercase tracking-wide text-[var(--color-muted)]"><tr>{["Task / policy", "Deadline", "Your progress", "Status", "Action"].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--color-line)]">{tasks.map((task) => <tr key={task.id} className="align-top"><th scope="row" className="px-4 py-4 text-left"><p className="break-words font-semibold">{task.title}</p><p className="mt-1 text-xs text-[var(--color-ink-2)]">{POLICY_PROFILES[task.policyType]?.label || task.policyType} · {task.organization.name} · {organizationSourceName(task.organization)}</p>{task.instructions ? <p className="mt-2 line-clamp-2 text-xs font-normal text-[var(--color-muted)]">{task.instructions}</p> : null}</th><td className="px-4 py-4"><DeadlineLabel value={task.dueDate} status={task.status}/></td><td className="px-4 py-4"><TaskProgress progress={task.progress} unavailableReason={task.unavailableReason} compact showSavedAt/></td><td className="px-4 py-4"><TaskStatus status={task.status} dueDate={task.dueDate}/></td><td className="px-4 py-4"><TaskAction task={task} loading={loadingTask === task.id} onStart={() => void startTask(task)}/></td></tr>)}</tbody></table></div><div className={`${styles.mobileRows} divide-y divide-[var(--color-line)] lg:hidden`}>{tasks.map((task) => <article key={task.id} className="min-w-0 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words font-semibold">{task.title}</h2><p className="mt-1 text-xs text-[var(--color-ink-2)]">{POLICY_PROFILES[task.policyType]?.label || task.policyType} · {task.organization.name} · {organizationSourceName(task.organization)}</p></div><TaskStatus status={task.status} dueDate={task.dueDate}/></div>{task.instructions ? <p className="mt-2 text-xs leading-5 text-[var(--color-ink-2)]">{task.instructions}</p> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Deadline</p><DeadlineLabel value={task.dueDate} status={task.status}/></div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Progress</p><TaskProgress progress={task.progress} unavailableReason={task.unavailableReason}/></div></div><TaskAction task={task} loading={loadingTask === task.id} onStart={() => void startTask(task)}/></article>)}</div></div> : <div className={`${styles.empty} mt-7 border-y border-[var(--color-line)] py-14 text-center`}><ClipboardList size={24} className="mx-auto text-[var(--color-muted)]" aria-hidden="true"/><h2 className="mt-3 text-lg font-semibold">{hasFilters ? "No tasks match these filters" : work.length ? "No tasks found" : "No tasks assigned yet"}</h2><p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-ink-2)]">{hasFilters ? "Clear a filter to see your assigned policy work." : "Tasks assigned to you will appear here."}</p>{hasFilters ? <button type="button" onClick={clearFilters} className="mt-4 min-h-10 px-3 text-sm font-semibold text-[var(--color-forest)] underline-offset-2 hover:underline">Clear filters</button> : null}</div>}
      </div>
    </section>
  </div>;
}

function TaskAction({ task, loading, onStart }: { task: PolicyCraftTask; loading: boolean; onStart: () => void }) {
  if (task.status === "assigned" && task.available) return <button type="button" onClick={onStart} disabled={loading} className={`${action} mt-2`}>{loading ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/> : <ArrowRight size={14} aria-hidden="true"/>}{loading ? "Starting…" : "Start task"}</button>;
  if (task.status === "assigned") return <p className="mt-2 max-w-xs text-xs text-[var(--color-muted)]">Unavailable</p>;
  if (task.status === "in_progress" && task.documentId && task.available) return <Link href={`/builder?draft=${encodeURIComponent(task.documentId)}&orgId=${task.organization.id}&taskId=${encodeURIComponent(task.id)}`} className={`${action} mt-2`}>Resume<ArrowRight size={14} aria-hidden="true"/></Link>;
  if (task.status === "completed") return <span className="mt-2 block text-xs font-medium text-emerald-900">Completed {task.completedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(task.completedAt)) : ""}</span>;
  return <span className="mt-2 block max-w-44 text-xs text-[var(--color-muted)]">{task.status === "cancelled" ? "Cancelled" : "Unavailable"}</span>;
}
