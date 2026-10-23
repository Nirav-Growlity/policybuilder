import { Suspense } from "react";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import { NewHandbookWizard } from "@/components/documents/new-handbook/new-handbook-wizard";

export default function NewEmployeeHandbookPage() {
  return (
    <Suspense fallback={<AppTransitionScreen title="Preparing a new employee handbook" />}>
      <NewHandbookWizard />
    </Suspense>
  );
}
