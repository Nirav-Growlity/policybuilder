import { Suspense } from "react";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import { SopBuilder } from "@/components/documents/builder/sop-builder";

export default async function SopManualPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<AppTransitionScreen title="Opening your SOP manual" />}>
      <SopBuilder manualId={id} />
    </Suspense>
  );
}
