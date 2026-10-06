import * as React from "react";
import { AdminTaskWorkspace } from "@/components/tasks/admin-task-workspace";

export default function AdminTasksPage() {
  return <React.Suspense fallback={<div className="min-h-48" role="status" aria-label="Loading admin tasks" aria-busy="true" />}><AdminTaskWorkspace /></React.Suspense>;
}
