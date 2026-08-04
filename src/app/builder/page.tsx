import { Suspense } from "react";
import { Toaster } from "@/components/ui/toast";
import { BuilderClient } from "./BuilderClient";

export default function BuilderPage() {
  return (
    <Toaster>
      <Suspense fallback={<div className="min-h-screen bg-[var(--color-cream)]" />}>
        <BuilderClient />
      </Suspense>
    </Toaster>
  );
}
