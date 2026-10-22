import { Suspense } from "react";
import { DocumentsHub } from "@/components/documents/documents-hub";
import { WorkspaceRouteFallback } from "@/components/workspace/workspace-motion";

export default function DocumentsPage() {
  return (
    <Suspense fallback={<WorkspaceRouteFallback label="Loading documents…" />}>
      <DocumentsHub />
    </Suspense>
  );
}
