import { Suspense } from "react";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import { HandbookBuilder } from "@/components/documents/handbook-builder/handbook-builder";

export default async function HandbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<AppTransitionScreen title="Opening your employee handbook" />}>
      <HandbookBuilder manualId={id} />
    </Suspense>
  );
}
