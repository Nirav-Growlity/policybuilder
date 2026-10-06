import * as React from "react";
import { ManagerTaskWorkspace } from "@/components/tasks/manager-task-workspace";

export default function ManagerTasksPage() {
  return <React.Suspense fallback={<div className="min-h-48" role="status" aria-label="Loading assigned tasks" aria-busy="true" />}><ManagerTaskWorkspace /></React.Suspense>;
}
