import * as React from "react";
import { AdminTaskWorkspace } from "@/components/tasks/admin-task-workspace";
import { WorkspaceRouteFallback } from "@/components/workspace/workspace-motion";

export default function AdminTasksPage() {
  return <React.Suspense fallback={<WorkspaceRouteFallback label="Loading admin tasks" />}><AdminTaskWorkspace /></React.Suspense>;
}
