"use client";

import * as React from "react";
import { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";
import type { Policy } from "@/lib/types";

// PdfPolicyPreview asks the server for a fresh render whenever its policy input
// changes. Holding the input back until typing pauses keeps the live preview
// from requesting a render on every keystroke. Typst renders in about 0.3 s, so
// it waits as long as the SOP preview; Chromium's 2-6 s prints wait longer.
export const LIVE_PREVIEW_DEBOUNCE_MS = process.env.POLICY_PDF_ENGINE === "typst" ? 500 : 800;

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type DebouncedPolicyPreviewProps = {
  policy: Policy;
  includeAuthorSignature: boolean;
  authorSignatureDate: string | null;
  signatureUpdatedAt: string | null;
};

// Same signature inputs that StepExport passes to PdfPolicyPreview. The
// wrapper exists so the live preview and the Design preview never mount
// StepExport, which generates an AI cover on mount.
export function DebouncedPolicyPreview({ policy, includeAuthorSignature, authorSignatureDate, signatureUpdatedAt }: DebouncedPolicyPreviewProps) {
  const input = React.useMemo<DebouncedPolicyPreviewProps>(
    () => ({ policy, includeAuthorSignature, authorSignatureDate, signatureUpdatedAt }),
    [policy, includeAuthorSignature, authorSignatureDate, signatureUpdatedAt],
  );
  const settled = useDebouncedValue(input, LIVE_PREVIEW_DEBOUNCE_MS);
  return (
    <PdfPolicyPreview
      policy={settled.policy}
      includeAuthorSignature={settled.includeAuthorSignature}
      authorSignatureDate={settled.authorSignatureDate ?? ""}
      signatureUpdatedAt={settled.signatureUpdatedAt}
      surface="pane"
    />
  );
}
