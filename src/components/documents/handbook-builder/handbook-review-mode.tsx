"use client";

import * as React from "react";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { useHandbookBuilder } from "@/lib/handbook/store";
import { handbookReadinessChecks, type HandbookTarget } from "@/components/documents/handbook-helpers";
import { revealSection } from "@/components/documents/manual-helpers";
import { SopPdfPreview } from "@/components/documents/builder/sop-pdf-preview";
import styles from "@/components/documents/builder/builder.module.css";
import { useHandbookBuilderActions } from "./handbook-builder-context";
import { HandbookPlaceholdersDialog } from "./handbook-placeholders-dialog";

/** Review & export: what still needs attention, each with a way to fix it, beside the full handbook. */
export function HandbookReviewMode() {
  const manual = useHandbookBuilder((state) => state.manual!);
  const select = useHandbookBuilder((state) => state.select);
  const { orgId, manualId, openDetails, setMode } = useHandbookBuilderActions();
  const checks = handbookReadinessChecks(manual);
  const open = checks.filter((check) => !check.ok);
  const [placeholdersOpen, setPlaceholdersOpen] = React.useState(false);

  const fix = (target: HandbookTarget, text?: string) => {
    if (target.kind === "details") { openDetails(); return; }
    if (target.kind === "design") { setMode("design"); return; }
    if (target.kind === "placeholders") { setPlaceholdersOpen(true); return; }
    select(target.kind === "chapter" ? { kind: "chapter", chapterId: target.chapterId } : { kind: target.kind });
    setMode("write");
    if (target.kind === "chapter" && target.sectionId) revealSection(target.sectionId, text);
  };

  return (
    <div className={styles.review}>
      <section className={styles.readiness} aria-labelledby="readiness-title">
        <div className={styles.readinessHead}>
          <h2 id="readiness-title" className={styles.readinessTitle}>{open.length ? `${open.length} ${open.length === 1 ? "thing" : "things"} to check` : "Ready to export"}</h2>
          <p className={styles.readinessText}>{open.length ? "You can export at any time; these keep the handbook accurate for every employee." : "Every check passes. Download the PDF or Word file above."}</p>
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
      <section className={styles.reviewPreview} aria-label="Full handbook preview">
        <SopPdfPreview orgId={orgId} manualId={manualId} manual={manual} surface="card" debounceMs={800} itemLabel="chapter" documentLabel="handbook" />
      </section>
      <HandbookPlaceholdersDialog open={placeholdersOpen} onClose={() => setPlaceholdersOpen(false)} onGoTo={fix} />
    </div>
  );
}
