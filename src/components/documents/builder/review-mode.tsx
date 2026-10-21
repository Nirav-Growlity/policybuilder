"use client";

import * as React from "react";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { useSopBuilder } from "@/lib/sop/store";
import { readinessChecks, revealSection, type ReadinessTarget } from "../manual-helpers";
import { useSopBuilderActions } from "./builder-context";
import { PlaceholdersDialog } from "./placeholders-dialog";
import { SopPdfPreview } from "./sop-pdf-preview";
import styles from "./builder.module.css";

/** Review & export: what still needs attention, each with a way to fix it, beside the full manual. */
export function ReviewMode() {
  const manual = useSopBuilder((state) => state.manual!);
  const select = useSopBuilder((state) => state.select);
  const { orgId, manualId, openDetails, setMode } = useSopBuilderActions();
  const checks = readinessChecks(manual);
  const open = checks.filter((check) => !check.ok);
  const [placeholdersOpen, setPlaceholdersOpen] = React.useState(false);

  const fix = (target: ReadinessTarget, text?: string) => {
    if (target.kind === "details") { openDetails(); return; }
    if (target.kind === "design") { setMode("design"); return; }
    if (target.kind === "placeholders") { setPlaceholdersOpen(true); return; }
    select(target.kind === "sop" ? { kind: "sop", sopId: target.sopId } : { kind: target.kind });
    setMode("write");
    if (target.kind === "sop" && target.sectionId) revealSection(target.sectionId, text);
  };

  return (
    <div className={styles.review}>
      <section className={styles.readiness} aria-labelledby="readiness-title">
        <div className={styles.readinessHead}>
          <h2 id="readiness-title" className={styles.readinessTitle}>{open.length ? `${open.length} ${open.length === 1 ? "thing" : "things"} to check` : "Ready to export"}</h2>
          <p className={styles.readinessText}>{open.length ? "You can export at any time; these keep the manual audit-ready." : "Every check passes. Download the PDF or Word file above."}</p>
        </div>
        <ul className={styles.checks}>
          {checks.map((check) => (
            <li key={check.id} className={styles.check} data-ok={check.ok || undefined}>
              {check.ok ? <CheckCircle2 size={18} className={styles.checkOk} aria-hidden="true" /> : <AlertCircle size={18} className={styles.checkOpen} aria-hidden="true" />}
              <div className={styles.checkText}>
                <span className={styles.checkLabel}>{check.label}<span className="sr-only">{check.ok ? ", done" : ", needs attention"}</span></span>
                <span className={styles.checkDetail}>{check.detail}</span>
              </div>
              {!check.ok && check.fix ? <button type="button" className={styles.checkFix} onClick={() => fix(check.fix!)}>Fix<ArrowRight size={13} aria-hidden="true" /></button> : null}
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.reviewPreview} aria-label="Full manual preview">
        <SopPdfPreview orgId={orgId} manualId={manualId} manual={manual} surface="card" debounceMs={800} />
      </section>
      <PlaceholdersDialog open={placeholdersOpen} onClose={() => setPlaceholdersOpen(false)} onGoTo={fix} />
    </div>
  );
}
