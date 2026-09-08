"use client";

import { useBuilder } from "@/lib/store";
import { InfoBar } from "@/components/ui/panel";
import { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";
import { Check, AlertTriangle } from "lucide-react";

export function StepExport() {
  const { policy } = useBuilder();

  const co = policy.company;
  const areas = policy.focusAreas.filter(Boolean);
  const qualEntries = Object.entries(policy.qualitative).filter(([, v]) => v && v.length);
  const quantEntries = policy.quantitative.filter((q) => q.targets && q.targets.some((t) => t.target));

  const completeness = [
    !!co.name,
    !!policy.declaration.preface,
    !!policy.declaration.declaration,
    !!policy.declaration.scope,
    areas.length > 0,
    qualEntries.length > 0,
    quantEntries.length > 0,
    policy.sdgs.length > 0,
    policy.responsibilities.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <InfoBar variant={completeness >= 7 ? "info" : "warn"} icon={completeness >= 7 ? <Check size={16} /> : <AlertTriangle size={16} />}>
        <div>
          <strong>Policy completeness:</strong> {completeness} / 9 sections filled.
          {completeness < 7 ? " Consider filling more sections for a comprehensive policy." : " Your policy is ready to export. Use Design controls to customize its appearance."}
        </div>
      </InfoBar>

      <div className="bg-[#f3f4f2] p-3 lg:p-5">
        <div key={policy.documentTheme || "governance-manual"} className="min-h-0 flex-1 pr-1">
          <PdfPolicyPreview policy={policy} shareDownload />
        </div>
      </div>
    </div>
  );
}
