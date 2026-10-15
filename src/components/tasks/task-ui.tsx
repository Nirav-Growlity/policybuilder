"use client";

import * as React from "react";
import { AlertCircle, CalendarClock, Check, ClipboardList, Clock3 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { ApplicationButton, ApplicationField, ApplicationInput, ApplicationStatus } from "@/components/ui/app-primitives";
import { SelectMenu } from "@/components/ui/select-menu";
import { DatePicker } from "@/components/ui/calendar";
import { useApplicationSurface } from "@/components/ui/application-surface";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyType } from "@/lib/types";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import type { PolicyCraftManagerWork, PolicyCraftTask, PolicyCraftTaskProgress, PolicyCraftTaskStatus } from "@/lib/policycraft-task-types";
import { organizationSelectOptions } from "@/components/workspace/organization-source-label";
import styles from "./tasks.module.css";

export function TaskModal({ children, ...props }: React.ComponentProps<typeof Modal>) {
  return <Modal {...props}><div className={styles.dialogContent}>{children}</div></Modal>;
}

const fieldClass = "mt-1 block w-full";

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
  const applicationSurface = useApplicationSurface();
  const dueState = dueDate ? deadlineState(dueDate, status) : "upcoming";
  const overdue = dueState === "overdue";
  const Icon = status === "completed" ? Check : overdue ? AlertCircle : status === "in_progress" ? Clock3 : ClipboardList;
  const label = overdue ? "Overdue" : taskStatusLabel(status);
  if (!applicationSurface) {
    const colors = status === "completed"
      ? "text-emerald-800"
      : status === "cancelled"
        ? "text-[var(--color-muted)]"
        : overdue
          ? "text-red-800"
          : status === "in_progress"
            ? "text-[var(--color-forest-deep)]"
            : "text-[var(--color-ink-2)]";
    return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold ${colors}`}><Icon size={14} aria-hidden="true" />{label}</span>;
  }
  const tone = overdue ? "error" : status === "completed" ? "success" : status === "in_progress" ? "info" : "neutral";
  return <ApplicationStatus tone={tone} icon={<Icon size={14} aria-hidden="true" />} className={styles.taskStatus}>{label}</ApplicationStatus>;
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
  policyType: PolicyType | "";
  dueDate: string;
};

const defaultDraft: TaskFormDraft = { title: "", instructions: "", organizationId: "", managerId: "", policyType: "", dueDate: "" };

const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title.").max(180),
  instructions: z.string().trim().max(4000),
  organizationId: z.string().min(1, "Choose an organization."),
  managerId: z.string(),
  policyType: z.union([z.literal(""), z.enum(["environmental", "labour-human-rights", "living-wage", "ethics", "sustainable-procurement"])]).refine((value) => value !== "", "Choose a policy type."),
  dueDate: z.string().min(1, "Choose a deadline."),
});

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
  const linked = !!task?.documentId;
  const resolver = React.useMemo(() => zodResolver(taskFormSchema.superRefine((draft, context) => {
    const managerIsEligible = managers.some((manager) => manager.id === draft.managerId && manager.status === "active" && manager.organizations.some((organization) => organization.id === Number(draft.organizationId) && !organization.deleted && !organization.expired));
    if ((!task || !linked) && !managerIsEligible) {
      context.addIssue({ code: "custom", path: ["managerId"], message: "Choose a manager assigned to this organization." });
    }
  })), [linked, managers, task]);
  const form = useForm<TaskFormDraft>({
    defaultValues: task ? {
      title: task.title,
      instructions: task.instructions,
      organizationId: String(task.organization.id),
      managerId: task.manager.id,
      policyType: task.policyType,
      dueDate: task.dueDate.slice(0, 10),
    } : { ...defaultDraft },
    resolver,
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  });
  const organizationId = useWatch({ control: form.control, name: "organizationId" });
  const managerId = useWatch({ control: form.control, name: "managerId" });
  const dueDate = useWatch({ control: form.control, name: "dueDate" });
  const policyType = useWatch({ control: form.control, name: "policyType" });
  const eligibleManagers = managers.filter((manager) => {
    if (!organizationId) return false;
    return manager.status === "active" && manager.organizations.some((organization) => organization.id === Number(organizationId) && !organization.deleted && !organization.expired);
  });
  const title = task ? (linked ? "Edit task" : "Edit assignment") : "Create task";

  function changeOrganization(value: string) {
    form.setValue("organizationId", value, { shouldDirty: true });
    form.setValue("managerId", "", { shouldDirty: true });
  }

  return <TaskModal open={open} onClose={() => { if (!saving) onClose(); }} title={title} description={task ? "Update the assignment details and deadline." : "Assign a new policy to a manager in an organization they can access."} width={640} hideClose={saving}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {(error || Object.keys(form.formState.errors).length > 0) ? <p role="alert" aria-live="polite" className={`${styles.errorMessage} mb-4`}>{error || Object.values(form.formState.errors)[0]?.message}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <ApplicationField id="task-title" label="Task title" required error={form.formState.errors.title?.message} className="sm:col-span-2"><ApplicationInput {...form.register("title")} autoComplete="off" maxLength={180} required placeholder="Create an environmental policy…" size="operational" /></ApplicationField>
        <ApplicationField id="task-organization" label="Organization" required error={form.formState.errors.organizationId?.message}><SelectMenu value={organizationId} onValueChange={changeOrganization} options={organizationSelectOptions(organizations.filter((organization) => !organization.deleted && !organization.expired))} disabled={linked} required placeholder="Choose organization" searchPlaceholder="Search organizations…" className={fieldClass} /></ApplicationField>
        <ApplicationField id="task-policy-type" label="Policy type" required error={form.formState.errors.policyType?.message}><SelectMenu value={policyType} onValueChange={(next) => form.setValue("policyType", next as TaskFormDraft["policyType"], { shouldDirty: true })} options={Object.entries(POLICY_PROFILES).map(([key, profile]) => ({ value: key, label: profile.label }))} disabled={linked} required placeholder="Choose policy" className={fieldClass} /></ApplicationField>
        {!task || !linked ? <ApplicationField id="task-manager" label="Assign to" required error={form.formState.errors.managerId?.message} hint={organizationId && !eligibleManagers.length ? "Assign a manager to this organization before creating the task." : undefined} className="sm:col-span-2"><SelectMenu value={managerId} onValueChange={(next) => form.setValue("managerId", next, { shouldDirty: true })} options={eligibleManagers.map((manager) => ({ value: manager.id, label: manager.name || manager.email, description: manager.name ? manager.email : undefined }))} disabled={!eligibleManagers.length} required placeholder={eligibleManagers.length ? "Choose an assigned manager" : "No eligible managers"} searchPlaceholder="Search managers…" className={fieldClass} /></ApplicationField> : null}
        <ApplicationField id="task-deadline" label={<>Deadline <span className="font-normal">· end of day, India Standard Time</span></>} required error={form.formState.errors.dueDate?.message} className="sm:col-span-2"><DatePicker id="task-deadline" value={dueDate} onChange={(date) => form.setValue("dueDate", date, { shouldDirty: true })} hasError={!!form.formState.errors.dueDate} placeholder="Choose a deadline" className={fieldClass} /></ApplicationField>
        <ApplicationField id="task-instructions" label={<>Instructions <span className="font-normal">· optional</span></>} error={form.formState.errors.instructions?.message} className="sm:col-span-2"><textarea {...form.register("instructions")} maxLength={4000} className={styles.textarea} placeholder="Add scope or delivery notes…" /></ApplicationField>
      </div>
      <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <ApplicationButton type="button" onClick={onClose} disabled={saving} variant="outline" size="md" className="sm:min-w-28">Cancel</ApplicationButton>
        <ApplicationButton type="submit" disabled={saving || ((!task || !linked) && (!managerId || !eligibleManagers.some((manager) => manager.id === managerId)))} busy={saving} busyLabel="Saving…" variant="primary" size="md" className="min-w-36" leadingIcon={<Check size={15} aria-hidden="true" />}>{task ? "Save changes" : "Create task"}</ApplicationButton>
      </div>
    </form>
  </TaskModal>;
}

export function DeadlineLabel({ value, status }: { value: string; status: PolicyCraftTaskStatus }) {
  const state = deadlineState(value, status);
  const date = value.slice(0, 10);
  return <span data-deadline={state} className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${state === "overdue" ? "font-semibold text-red-800" : "text-[var(--color-ink-2)]"}`}>
    {state === "overdue" ? <AlertCircle size={13} aria-hidden="true" /> : <CalendarClock size={13} aria-hidden="true" />}
    {formatTaskDate(`${date}T12:00:00+05:30`)}{state === "overdue" ? " · overdue" : ""}
  </span>;
}

export function ManagerWorkTitle({ item }: { item: PolicyCraftManagerWork }) {
  return <div className="min-w-0"><p className="break-words font-semibold text-[var(--color-ink)]">{item.title || "Untitled policy"}</p><p className="mt-1 flex items-center gap-2 text-xs font-normal text-[var(--color-ink-2)]">{POLICY_PROFILES[item.policyType]?.label || item.policyType}</p></div>;
}
