"use client";

import * as React from "react";
import { getPolicyProfile } from "@/lib/constants";
import { useBuilder } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { preparePolicyForDocxExport } from "@/lib/docx/export-assets";
import { generateAndApplyAICover } from "@/components/builder/ai-cover-workflow";
import { policyCraftExportContext, policyCraftScopeKey, usePolicyCraftScope } from "@/lib/policycraft-client-scope";

export function usePolicyDownload() {
  const { policy, updatePolicy, includeAuthorSignature, authorSignatureDate } = useBuilder();
  const scope = usePolicyCraftScope((state) => state.scope);
  const { push } = useToast();
  const [exporting, setExporting] = React.useState<"pdf" | "docx" | null>(null);

  const download = async (kind: "pdf" | "docx") => {
    const capturedScope = scope;
    const capturedScopeKey = policyCraftScopeKey(capturedScope);
    setExporting(kind);
    try {
      const fileBase = (policy.company.name || "Policy").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      const url = kind === "pdf" ? "/api/export/pdf" : "/api/export/docx";
      let policyForExport = policy;
      if (!policy.aiCoverComposition) {
        try {
          const composition = await generateAndApplyAICover(policy, (next) => updatePolicy(() => ({ aiCoverComposition: next, activeCoverVariant: "ai" })), capturedScope);
          policyForExport = { ...policy, aiCoverComposition: composition, activeCoverVariant: "ai" };
        } catch (cause) {
          push(`${cause instanceof Error ? cause.message : "The AI cover could not be generated."} Exporting the current cover instead.`, "info");
        }
      }
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== capturedScopeKey) throw new Error("The workspace changed during export. Please retry.");
      const exportPolicy = kind === "docx" ? await preparePolicyForDocxExport(policyForExport, capturedScope) : policyForExport;
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== capturedScopeKey) throw new Error("The workspace changed during export. Please retry.");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: exportPolicy, includeAuthorSignature, authorSignatureDate, ...policyCraftExportContext(capturedScope) }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("Export returned an empty file");
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== capturedScopeKey) throw new Error("The workspace changed during export. Please retry.");
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `${getPolicyProfile(policy.policyType).exportName}_${fileBase}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      push(`${kind.toUpperCase()} download started`, "success");
    } catch {
      push(`${kind.toUpperCase()} export failed`, "error");
    } finally {
      setExporting(null);
    }
  };

  return { exporting, download };
}
