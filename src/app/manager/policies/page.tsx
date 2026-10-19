import { Suspense } from "react";
import { ManagerPolicies } from "@/components/workspace/manager-policies";
import { WorkspaceRouteFallback } from "@/components/workspace/workspace-motion";

export default function ManagerPoliciesPage() {
  return (
    <Suspense fallback={<WorkspaceRouteFallback label="Loading policies…" />}>
      <ManagerPolicies />
    </Suspense>
  );
}
