"use client";

import * as React from "react";
import { AlertCircle, CalendarClock, Check, ClipboardList, Clock3, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyType } from "@/lib/types";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import type { PolicyCraftManagerWork, PolicyCraftTask, PolicyCraftTaskProgress, PolicyCraftTaskStatus } from "@/lib/policycraft-task-types";
import { organizationSourceName } from "@/components/workspace/organization-source-label";
import styles from "./tasks.module.css";

export function TaskModal({ children, ...props }: React.ComponentProps<typeof Modal>) {
  return <Modal {...props}><div className={styles.dialogContent}>{children}</div></Modal>;
}

const fieldClass = "mt-1 block h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]";
const textareaClass = "mt-1 block min-h-24 w-full resize-y rounded-lg border border-[var(--color-line-2)] bg-white px-3 py-2.5 text-sm text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-55";

export function formatTaskDate(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...options }).format(date);
}

export function deadlineState(value: string, status: PolicyCraftTaskStatus): "overdue" | "today" | "upcoming" {
  if (status === "completed" || status === "cancelled") return "upcoming";
  const now = Date.now();
  const date = value.slice(0, 10);
  const due = new Date(`${date}T23:59:59.999+05:30`).getTime();
  if (Number.isFinite(due) && now > due) return "overdue";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return date === today ? "today" : "upcoming";
}

export function taskStatusLabel(status: PolicyCraftTaskStatus): string {
  return ({ assigned: "Assigned", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" })[status];
}

export function TaskStatus({ status, dueDate }: { status: PolicyCraftTaskStatus; dueDate?: string }) {
  const dueState = dueDate ? deadlineState(dueDate, status) : "upcoming";
  const overdue = dueState === "overdue";
  const colors = status === "completed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : status === "cancelled"
      ? "border-[var(--color-line)] bg-[var(--color-cream-2)] text-[var(--color-ink-2)]"
      : overdue
        ? "border-red-200 bg-red-50 text-red-900"
        : status === "in_progress"
          ? "border-[var(--color-forest)]/25 bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)]"
          : "border-sky-200 bg-sky-50 text-sky-900";
  const Icon = status === "completed" ? Check : overdue ? AlertCircle : status === "in_progress" ? Clock3 : ClipboardList;
  return <span className={`inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[11px] font-semibold ${colors}`}>
    <Icon size={13} aria-hidden="true" />{overdue ? "Overdue" : taskStatusLabel(status)}
  </span>;
}

export function TaskProgress({ progress, unavailableReason, savedAt, compact = false, showSavedAt = false }: {
  progress: PolicyCraftTaskProgress | null;
  unavailableReason?: string | null;
  savedAt?: string | null;
  compact?: boolean;
  showSavedAt?: boolean;
}) {
  if (!progress) return <div className="min-w-0 text-xs text-[var(--color-muted)]">{unavailableReason || "Waiting for the manager’s first save"}</div>;
  const value = Math.max(0, Math.min(100, progress.percentage));
  return <div className="min-w-0" aria-label={`Sections filled: ${progress.filledSections} of ${progress.totalSections}`}>
    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
      <span className="font-semibold tabular-nums text-[var(--color-ink)]">{compact ? `Sections filled · ${progress.filledSections} of ${progress.totalSections}` : `${progress.filledSections} of ${progress.totalSections} sections`}</span>
      <span className="font-semibold tabular-nums text-[var(--color-forest)]">{value}%</span>
    </div>
    <div role="progressbar" aria-label="Filled policy sections" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className={`overflow-hidden rounded-full bg-[var(--color-cream-2)] ${compact ? "h-1.5" : "h-2"}`}>
      <div className="h-full rounded-full bg-[var(--color-forest)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${value}%` }} />
    </div>
    {(!compact || showSavedAt) && (savedAt || progress.savedAt) ? <p className="mt-1.5 text-[10px] text-[var(--color-muted)]">Manager saved {formatTaskDate(savedAt || progress.savedAt, { dateStyle: "medium", timeStyle: "short" })}</p> : null}
    {unavailableReason ? <p className="mt-2 text-xs text-amber-900">Unavailable: {unavailableReason}</p> : null}
  </div>;
}

export type TaskFormDraft = {
  title: string;
  instructions: string;
  organizationId: string;
  managerId: string;
  policyType: PolicyType;
  dueDate: string;
};

const defaultDraft: TaskFormDraft = { title: "", instructions: "", organizationId: "", managerId: "", policyType: "environmental", dueDate: "" };

type TaskEditorModalProps = {
  open: boolean;
  task: PolicyCraftTask | null;
  organizations: PolicyCraftOrganization[];
  managers: PolicyCraftManagerSummary[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (draft: TaskFormDraft) => void;
};

export function TaskEditorModal(props: TaskEditorModalProps) {
  if (!props.open) return null;
  return <TaskEditorModalContent key={props.task?.id || "create"} {...props} />;
}

function TaskEditorModalContent({
  open, task, organizations, managers, saving, error, onClose, onSubmit,
}: TaskEditorModalProps) {
  const [draft, setDraft] = React.useState<TaskFormDraft>(() => task ? {
    title: task.title,
    instructions: task.instructions,
    organizationId: String(task.organization.id),
    managerId: task.manager.id,
    policyType: task.policyType,
    dueDate: task.dueDate.slice(0, 10),
  } : { ...defaultDraft, organizationId: String(organizations.find((item) => !item.deleted && !item.expired)?.id || "") });
  const [fieldError, setFieldError] = React.useState("");
  const organizationId = draft.organizationId;
  const eligibleManagers = managers.filter((manager) => {
    if (!organizationId) return false;
    return manager.status === "active" && manager.organizations.some((organization) => organization.id === Number(organizationId) && !organization.deleted && !organization.expired);
  });
  const linked = !!task?.documentId;
  const title = task ? (linked ? "Edit task" : "Edit assignment") : "Create task";

  function changeOrganization(value: string) {
    setDraft((current) => ({ ...current, organizationId: value, managerId: "" }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) { setFieldError("Enter a task title."); return; }
    if (!draft.organizationId) { setFieldError("Choose an organization."); return; }
    if ((!task || !linked) && (!draft.managerId || !eligibleManagers.some((manager) => manager.id === draft.managerId))) { setFieldError("Choose a manager assigned to this organization."); return; }
    if (!draft.dueDate) { setFieldError("Choose a deadline."); return; }
    setFieldError("");
    onSubmit({ ...draft, title: draft.title.trim(), instructions: draft.instructions.trim() });
  }

  return <TaskModal open={open} onClose={() => { if (!saving) onClose(); }} title={title} description={task ? "Update the assignment details and deadline." : "Assign a new policy to a manager in an organization they can access."} width={640} hideClose={saving}>
    <form onSubmit={submit}>
      {(error || fieldError) ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{fieldError || error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-[var(--color-ink-2)] sm:col-span-2">Task title<input name="title" autoComplete="off" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={180} required className={fieldClass} placeholder="Create an environmental policy…" /></label>
        <label className="block text-xs font-semibold text-[var(--color-ink-2)]">Organization<select aria-label="Organization" name="organizationId" value={draft.organizationId} onChange={(event) => changeOrganization(event.target.value)} disabled={linked} required className={fieldClass}><option value="">Choose organization</option>{organizations.filter((organization) => !organization.deleted && !organization.expired).map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organizationSourceName(organization)}</option>)}</select></label>
        <label className="block text-xs font-semibold text-[var(--color-ink-2)]">Policy type<select aria-label="Policy type" name="policyType" value={draft.policyType} onChange={(event) => setDraft({ ...draft, policyType: event.target.value as PolicyType })} disabled={linked} className={fieldClass}>{Object.entries(POLICY_PROFILES).map(([key, profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></label>
        {!task || !linked ? <label className="block text-xs font-semibold text-[var(--color-ink-2)] sm:col-span-2">Assign to<select aria-label="Assign to" name="managerId" value={draft.managerId} onChange={(event) => setDraft({ ...draft, managerId: event.target.value })} required className={fieldClass}><option value="">{eligibleManagers.length ? "Choose an assigned manager" : "No eligible managers"}</option>{eligibleManagers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name || manager.email} · {manager.email}</option>)}</select>{organizationId && !eligibleManagers.length ? <span className="mt-1 block font-normal text-amber-800">Assign a manager to this organization before creating the task.</span> : null}</label> : null}
        <label className="block text-xs font-semibold text-[var(--color-ink-2)] sm:col-span-2">Deadline <span className="font-normal">· end of day, India Standard Time</span><input type="date" name="dueDate" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} required className={fieldClass} /></label>
        <label className="block text-xs font-semibold text-[var(--color-ink-2)] sm:col-span-2">Instructions <span className="font-normal">· optional</span><textarea name="instructions" value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} maxLength={4000} className={textareaClass} placeholder="Add scope or delivery notes…" /></label>
      </div>
      <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <button type="button" onClick={onClose} disabled={saving} className={`${buttonClass} border border-[var(--color-line-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]`}>Cancel</button>
        <button type="submit" disabled={saving || ((!task || !linked) && (!draft.managerId || !eligibleManagers.some((manager) => manager.id === draft.managerId)))} className={`${buttonClass} bg-[var(--color-forest)] px-4 text-white hover:bg-[var(--color-forest-deep)]`}>{saving ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}{saving ? "Saving…" : task ? "Save changes" : "Create task"}</button>
      </div>
    </form>
  </TaskModal>;
}

export function DeadlineLabel({ value, status }: { value: string; status: PolicyCraftTaskStatus }) {
  const state = deadlineState(value, status);
  const date = value.slice(0, 10);
  return <span className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${state === "overdue" ? "font-semibold text-red-800" : "text-[var(--color-ink-2)]"}`}>
    {state === "overdue" ? <AlertCircle size={13} aria-hidden="true" /> : <CalendarClock size={13} aria-hidden="true" />}
    {formatTaskDate(`${date}T12:00:00+05:30`)}{state === "overdue" ? " · overdue" : ""}
  </span>;
}

export function ManagerWorkTitle({ item }: { item: PolicyCraftManagerWork }) {
  return <div className="min-w-0"><p className="break-words font-semibold text-[var(--color-ink)]">{item.title || "Untitled policy"}</p><p className="mt-1 text-xs font-normal text-[var(--color-ink-2)]">{POLICY_PROFILES[item.policyType]?.label || item.policyType}</p></div>;
}
