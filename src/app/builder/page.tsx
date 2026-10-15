import { Suspense } from "react";
import { BuilderClient } from "./BuilderClient";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";

export default function BuilderPage() {
  return (
    <Suspense fallback={<AppTransitionScreen title="Opening the policy builder" />}>
      <BuilderClient />
    </Suspense>
  );
}
