import type { PolicyType, StandardSectionKind } from "./types";
import type { PolicyCraftOrganization } from "./policycraft-access-types";

export type PolicyCraftTaskStatus = "assigned" | "in_progress" | "completed" | "cancelled";
export type PolicyCraftTaskAction = "edit" | "reassign" | "cancel" | "reopen";

export type PolicyCraftTaskProgressSection = {
  id: string;
  title: string;
  kind: StandardSectionKind | "custom";
  filled: boolean;
};

export type PolicyCraftTaskProgress = {
  percentage: number;
  filledSections: number;
  totalSections: number;
  sections: PolicyCraftTaskProgressSection[];
  savedAt: string;
  documentVersion: number;
};

export type PolicyCraftTaskManager = { id: string; name: string; email: string };

export type PolicyCraftTask = {
  id: string;
  title: string;
  instructions: string;
  policyType: PolicyType;
  organization: PolicyCraftOrganization;
  manager: PolicyCraftTaskManager;
  dueDate: string;
  status: PolicyCraftTaskStatus;
  version: number;
  documentId: string | null;
  documentVersion: number | null;
  progress: PolicyCraftTaskProgress | null;
  available: boolean;
  unavailableReason: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type PolicyCraftManagerWork = {
  documentId: string;
  title: string;
  policyType: PolicyType;
  organization: PolicyCraftOrganization;
  manager: PolicyCraftTaskManager;
  progress: PolicyCraftTaskProgress | null;
  available: boolean;
  unavailableReason: string | null;
};

export type PolicyCraftTaskEvent = {
  id: string;
  taskId: string;
  eventType: string;
  actor: { id: string; name: string; role: "admin" | "manager" };
  details: Record<string, unknown>;
  createdAt: string;
};

export type PolicyCraftTaskCollection = {
  tasks: PolicyCraftTask[];
  managers: PolicyCraftTaskManager[];
  managerWork: PolicyCraftManagerWork[];
};

export type PolicyCraftManagerWorkCollection = { work: PolicyCraftManagerWork[] };
export type PolicyCraftManagerTaskCollection = { tasks: PolicyCraftTask[] };
