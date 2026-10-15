import * as React from "react";
import { ManagerTaskWorkspace } from "@/components/tasks/manager-task-workspace";
import { WorkspaceRouteFallback } from "@/components/workspace/workspace-motion";

export default function ManagerTasksPage() {
  return <React.Suspense fallback={<WorkspaceRouteFallback label="Loading assigned tasks" />}><ManagerTaskWorkspace /></React.Suspense>;
}
