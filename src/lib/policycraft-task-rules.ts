import type { PolicyCraftTaskStatus } from "./policycraft-task-types";

export function parsePolicyCraftTaskDeadline(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  if (calendarDay.getUTCFullYear() !== year || calendarDay.getUTCMonth() !== month - 1 || calendarDay.getUTCDate() !== day) return null;
  return new Date(Date.UTC(year, month - 1, day, 18, 29, 59, 999));
}

export function policyCraftTaskUnavailableReason(input: {
  organizationDeleted: boolean;
  organizationExpired: boolean;
  managerActive: boolean;
  organizationAssigned: boolean;
}): string | null {
  if (!input.managerActive) return "The assigned manager is disabled.";
  if (!input.organizationAssigned) return "The manager is no longer assigned to this organization.";
  if (input.organizationDeleted) return "The organization is deleted.";
  if (input.organizationExpired) return "The organization has expired.";
  return null;
}

export function isPolicyCraftTaskStatus(value: unknown): value is PolicyCraftTaskStatus {
  return value === "assigned" || value === "in_progress" || value === "completed" || value === "cancelled";
}

export function isPolicyCraftTaskAction(value: unknown): value is "edit" | "reassign" | "cancel" | "reopen" {
  return value === "edit" || value === "reassign" || value === "cancel" || value === "reopen";
}
