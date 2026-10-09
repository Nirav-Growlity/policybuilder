import { Suspense } from "react";
import { BuilderClient } from "./BuilderClient";

export default function BuilderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-cream)]" />}>
      <BuilderClient />
    </Suspense>
  );
}
