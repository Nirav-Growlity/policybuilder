"use client";

import { DelayedLoading } from "@/components/workspace/workspace-list";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CalendarClock, ClipboardList, Loader2, RefreshCw, Search } from "lucide-react";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { organizationSelectOptions, organizationSourceName } from "@/components/workspace/organization-source-label";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyCraftTask, PolicyCraftTaskStatus } from "@/lib/policycraft-task-types";
import { ApplicationButton, ApplicationInput } from "@/components/ui/app-primitives";
import { SelectMenu } from "@/components/ui/select-menu";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { useRecordMotion, WorkspaceHero, WorkspaceSheet } from "@/components/workspace/workspace-motion";
import { deadlineState, DeadlineLabel, TaskProgress, TaskStatus } from "./task-ui";
import styles from "./tasks.module.css";

type Filters = { orgId: string; type: string; status: string; q: string };
const button = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pc-brand)]";

function readFilters(params: URLSearchParams): Filters {
  return { orgId: params.get("orgId") || "all", type: params.get("type") || "all", status: params.get("status") || "all", q: params.get("q") || "" };
}

function terminal(status: PolicyCraftTaskStatus) { return status === "completed" || status === "cancelled"; }

function accentStyle(policyType: keyof typeof POLICY_PROFILES): React.CSSProperties {
  return { "--ws-type": POLICY_PROFILES[policyType]?.accent } as React.CSSProperties;
}

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
  const statValue = (value: number) => (loaded ? value : loading ? null : "–");

  function clearFilters() {
    updateFilters({ orgId: "all", type: "all", status: "all", q: "" });
  }

  return <ApplicationSurface data-pc-workspace="tasks" className={`${styles.workspace} min-w-0`}>
    <WorkspaceHero
      titleId="manager-tasks-title"
      title="My tasks"
      description="Start an assignment or continue the policy you’re working on."
      stats={[
        { label: "Active", value: statValue(counts.active) },
        { label: "In progress", value: statValue(counts.inProgress) },
        { label: "Overdue", value: statValue(counts.overdue) },
        { label: "Completed", value: statValue(counts.completed) },
      ]}
    >
      <p className={styles.heroNote}><CalendarClock size={14} aria-hidden="true"/>Deadlines use India Standard Time</p>
    </WorkspaceHero>

    <WorkspaceSheet as="section" aria-label="Assigned tasks">
      <div className={styles.filterBand}>
        <label className={`${styles.fieldLabel} ${styles.searchField}`}><span>Search</span><span className={styles.searchControl}><Search size={15} aria-hidden="true" className={styles.searchIcon}/><ApplicationInput aria-label="Search tasks" autoComplete="off" name="q" value={filters.q} onChange={(event) => updateFilters({ q: event.target.value }, "replace")} placeholder="Task or organization…" size="compact"/></span></label>
        <label className={styles.fieldLabel}>Organization<SelectMenu name="orgId" value={filters.orgId} onValueChange={(orgId) => updateFilters({ orgId })} options={[{ value: "all", label: "All organizations" }, ...organizationSelectOptions(activeOrganizations)]} searchPlaceholder="Search organizations…" /></label>
        <label className={styles.fieldLabel}>Policy type<SelectMenu name="type" value={filters.type} onValueChange={(type) => updateFilters({ type })} options={[{ value: "all", label: "All policy types" }, ...Object.entries(POLICY_PROFILES).map(([type, profile]) => ({ value: type, label: profile.label }))]} /></label>
        <label className={styles.fieldLabel}>Status<SelectMenu name="status" value={filters.status} onValueChange={(status) => updateFilters({ status })} options={[{ value: "all", label: "All tasks" }, { value: "assigned", label: "Assigned" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]} /></label>
      </div>

      <div className={styles.messages}>
        {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"><span>{error}</span><button type="button" onClick={() => void load()} className={`${button} text-red-900 hover:bg-red-100`}><RefreshCw size={14} aria-hidden="true"/>Retry</button></div> : null}
        {notice ? <p role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
      </div>

      <section className={styles.results} aria-labelledby="manager-task-results-heading">
        <h2 id="manager-task-results-heading" className="sr-only">Task results</h2>
        <div className={styles.resultsBar} aria-live="polite"><p className={styles.resultsCount}>{loading && !loaded ? "Loading tasks…" : !loaded && error ? "Task data unavailable" : `Showing ${tasks.length} of ${work.length} tasks`}</p>{hasFilters && loaded ? <button type="button" onClick={clearFilters} className={styles.clearFilters}>Clear filters</button> : null}</div>
        <div className={styles.panelBody} aria-busy={loading && !loaded}>
          {loading && !loaded ? <DelayedLoading label="Loading tasks…"><div className={styles.loadingBlock} role="status" aria-live="polite"><span className={styles.loadingLine}><Loader2 size={16} className="animate-spin" aria-hidden="true"/>Loading tasks…</span><RecordSkeleton /></div></DelayedLoading> : !loaded && error ? <div className={styles.empty}><span className={styles.emptyIcon} aria-hidden="true"><ClipboardList size={22}/></span><h2>Tasks unavailable</h2><p>Use Retry above to load your assigned tasks.</p></div> : tasks.length ? <TaskList tasks={tasks} loadingTask={loadingTask} onStart={(task) => void startTask(task)}/> : <div className={styles.empty}><span className={styles.emptyIcon} aria-hidden="true"><ClipboardList size={22}/></span><h2>{hasFilters ? "No tasks match these filters" : work.length ? "No tasks found" : "No tasks assigned yet"}</h2><p>{hasFilters ? "Clear a filter to see your assigned policy work." : "Tasks assigned to you will appear here."}</p>{hasFilters ? <button type="button" onClick={clearFilters} className={styles.clearFilters}>Clear filters</button> : null}</div>}
        </div>
      </section>
    </WorkspaceSheet>
  </ApplicationSurface>;
}

function TaskList({ tasks, loadingTask, onStart }: { tasks: PolicyCraftTask[]; loadingTask: string; onStart: (task: PolicyCraftTask) => void }) {
  const recordMotion = useRecordMotion();
  return <div className={styles.recordList}>
    <div className={`${styles.tableScroll} hidden lg:block`}><table className={styles.table}><colgroup><col className="w-[30%]"/><col className="w-[16%]"/><col className="w-[22%]"/><col className="w-[16%]"/><col className="w-[16%]"/></colgroup><thead><tr>{["Task / policy", "Deadline", "Your progress", "Status", "Action"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody><AnimatePresence initial={false}>{tasks.map((task, index) => <motion.tr key={task.id} data-ws-row="" className={styles.row} style={accentStyle(task.policyType)} {...recordMotion(index)}><th scope="row"><p className={styles.rowTitle}>{task.title}</p><p className={styles.rowMeta}>{POLICY_PROFILES[task.policyType]?.label || task.policyType} · {task.organization.name} · {organizationSourceName(task.organization)}</p>{task.instructions ? <p className="mt-2 line-clamp-2 text-xs font-normal text-[var(--color-muted)]">{task.instructions}</p> : null}</th><td><DeadlineLabel value={task.dueDate} status={task.status}/></td><td><TaskProgress progress={task.progress} unavailableReason={task.unavailableReason} compact showSavedAt/></td><td><TaskStatus status={task.status} dueDate={task.dueDate}/></td><td><TaskAction task={task} loading={loadingTask === task.id} onStart={() => onStart(task)}/></td></motion.tr>)}</AnimatePresence></tbody></table></div>
    <div className={`${styles.mobileRows} lg:hidden`}><AnimatePresence initial={false}>{tasks.map((task, index) => <motion.article key={task.id} data-ws-row="" className={styles.mobileRow} style={accentStyle(task.policyType)} {...recordMotion(index)}><div className={styles.mobileHead}><div className="min-w-0 flex-1"><h2 className={styles.rowTitle}>{task.title}</h2><p className={styles.rowMeta}>{POLICY_PROFILES[task.policyType]?.label || task.policyType} · {task.organization.name} · {organizationSourceName(task.organization)}</p></div><TaskStatus status={task.status} dueDate={task.dueDate}/></div>{task.instructions ? <p className="mt-2 text-xs leading-5 text-[var(--color-ink-2)]">{task.instructions}</p> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className={styles.fieldKicker}>Deadline</p><DeadlineLabel value={task.dueDate} status={task.status}/></div><div><p className={styles.fieldKicker}>Progress</p><TaskProgress progress={task.progress} unavailableReason={task.unavailableReason}/></div></div><TaskAction task={task} loading={loadingTask === task.id} onStart={() => onStart(task)}/></motion.article>)}</AnimatePresence></div>
  </div>;
}

function TaskAction({ task, loading, onStart }: { task: PolicyCraftTask; loading: boolean; onStart: () => void }) {
  if (task.status === "assigned" && task.available) return <ApplicationButton type="button" onClick={onStart} busy={loading} busyLabel="Starting…" variant="primary" className={`${styles.taskAction} mt-2`} leadingIcon={<ArrowRight size={14} aria-hidden="true"/>}>Start task</ApplicationButton>;
  if (task.status === "assigned") return <p className="mt-2 max-w-xs text-xs text-[var(--color-muted)]">Unavailable</p>;
  if (task.status === "in_progress" && task.documentId && task.available) return <Link href={`/builder?draft=${encodeURIComponent(task.documentId)}&orgId=${task.organization.id}&taskId=${encodeURIComponent(task.id)}`} className={styles.resumeLink}>Resume<ArrowRight size={14} aria-hidden="true"/></Link>;
  if (task.status === "completed") return <span className="mt-2 block text-xs font-medium text-emerald-900">Completed {task.completedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(task.completedAt)) : ""}</span>;
  return <span className="mt-2 block max-w-44 text-xs text-[var(--color-muted)]">{task.status === "cancelled" ? "Cancelled" : "Unavailable"}</span>;
}
