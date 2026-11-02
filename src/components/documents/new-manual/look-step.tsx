"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { Group } from "@/components/builder/design-studio/controls";
import studio from "@/components/builder/design-studio/design-studio.module.css";
import type { LogoColorPalette } from "@/lib/types";
import type { SopCover, SopTemplateId, SopThemeOptions } from "@/lib/sop/types";
import { CoverChooser, SopTemplatePicker, ThemeOptionRows } from "../design/sop-design-controls";
import { selectionSummary } from "../manual-helpers";
import { WizardHeading } from "./wizard-chrome";
import styles from "./wizard.module.css";

export function LookStep({ orgId, theme, options, cover, logoPalette, sopCount, creating, onTheme, onOptions, onCover, onBack, onCreate, summary, kind = "sop", backLabel = "Back to choose SOPs", createLabel = "Create manual", creatingLabel = "Creating manual…", aiCoverNote = "The AI cover is drawn right after the manual is created, while your SOPs are being written." }: {
  orgId: number;
  theme: SopTemplateId;
  options: SopThemeOptions;
  cover: SopCover;
  logoPalette?: LogoColorPalette;
  sopCount: number;
  creating: boolean;
  onTheme: (theme: SopTemplateId) => void;
  onOptions: (patch: Partial<SopThemeOptions>) => void;
  onCover: (cover: SopCover) => void;
  onBack: () => void;
  onCreate: () => void;
  /** Overrides the "N SOPs selected" line; handbooks pass their own. */
  summary?: string;
  kind?: "sop" | "handbook";
  backLabel?: string;
  createLabel?: string;
  creatingLabel?: string;
  aiCoverNote?: string;
}) {
  const selection = summary ?? selectionSummary(sopCount);
  return (
    <section className="px-5 pb-32 pt-8 lg:px-8 lg:pt-10">
      <div className="mx-auto w-full max-w-6xl">
        <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[13px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--pc-text)]">
          <ArrowLeft size={14} aria-hidden="true" /> {backLabel}
        </button>
        <div className="mt-4">
          <WizardHeading title="Choose a look and cover." description="Optional. Every template lays out the same content, so you can switch any time in Design without losing a word." />
        </div>
        <div className={styles.lookLayout}>
          <section aria-label="Templates">
            <SopTemplatePicker value={theme} onChange={onTheme} layout="grid" kind={kind} />
          </section>
          <aside className={styles.lookPanel} aria-label="Colours, fonts and cover">
            <Group title="Colours and type">
              <ThemeOptionRows theme={theme} options={options} logoPalette={logoPalette} onChange={onOptions} />
            </Group>
            <Group title="Cover">
              <CoverChooser orgId={orgId} cover={cover} onChange={onCover} aiNote={aiCoverNote} />
            </Group>
            <p className={studio.muted}>{selection}</p>
          </aside>
        </div>
      </div>
      <div className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerSummary}><strong>{selection}</strong><span>You can change the template, colours and cover in Design.</span></p>
          <div className={styles.footerActions}>
            <button type="button" className={styles.secondaryButton} onClick={onBack}>Back</button>
            <button type="button" className={styles.primaryButton} onClick={onCreate} disabled={creating} aria-busy={creating || undefined}>
              {creating ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {creating ? creatingLabel : createLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
