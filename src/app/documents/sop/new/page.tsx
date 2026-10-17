import { Suspense } from "react";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import { NewManualWizard } from "@/components/documents/new-manual/new-manual-wizard";

export default function NewSopManualPage() {
  return (
    <Suspense fallback={<AppTransitionScreen title="Preparing a new SOP manual" />}>
      <NewManualWizard />
    </Suspense>
  );
}
