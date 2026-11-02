"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Image as ImageIcon, LayoutTemplate, Rows3, X } from "lucide-react";
import { EASE_OUT, Group, Segmented, SPRING, SwitchRow } from "@/components/builder/design-studio/controls";
import studio from "@/components/builder/design-studio/design-studio.module.css";
import inspector from "@/components/builder/design-inspector.module.css";
import shell from "@/components/builder/shell.module.css";
import { useToast } from "@/components/ui/toast";
import { policyCraftScopedUrl } from "@/lib/policycraft-scope-utils";
import { coverAssetSrc, generateSopAiCover } from "@/lib/sop/client-api";
import { getSopDesign } from "@/lib/sop/design/templates";
import { useSopBuilder } from "@/lib/sop/store";
import type { CoverLibraryItem } from "@/lib/types";
import type { SopCover, SopGrouping, SopManual, SopThemeOptions } from "@/lib/sop/types";
import { CoverChooser, SopTemplatePicker, ThemeOptionRows, type CoverChoiceState } from "../design/sop-design-controls";
import { SopBuilderContext, useSopBuilderActions } from "./builder-context";
import { SopPdfPreview } from "./sop-pdf-preview";
import styles from "./builder.module.css";

const SECTIONS = [
  { id: "template", label: "Template" },
  { id: "brand", label: "Brand" },
  { id: "layout", label: "Layout" },
  { id: "cover", label: "Cover" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Where an AI cover is read from and written to; defaults to the open SOP manual. */
export type AiCoverTarget = { orgId: number; manualId: string; getManual: () => object | null; applyCover: (cover: SopCover) => void };

/** The AI cover request the wizard leaves for the builder (`?cover=ai`), and Design's regenerate. */
export function useAiCover(target?: AiCoverTarget) {
  const actions = React.useContext(SopBuilderContext);
  const { push } = useToast();
  const [state, setState] = React.useState<CoverChoiceState>({ status: "idle" });
  const orgId = target?.orgId ?? actions?.orgId ?? 0;
  const manualId = target?.manualId ?? actions?.manualId ?? "";
  const getManual = target?.getManual;
  const applyCover = target?.applyCover;
  const generate = React.useCallback(async () => {
    const manual = getManual ? getManual() : useSopBuilder.getState().manual;
    if (!manual || !orgId || !manualId) return;
    setState({ status: "busy", label: "Creating cover artwork" });
    try {
      const result = await generateSopAiCover(orgId, manualId, manual);
      if (result.status === "unavailable") { setState({ status: "unavailable" }); return; }
      if (applyCover) applyCover(result.cover);
      else useSopBuilder.getState().setManual((current) => ({ ...current, cover: result.cover }));
      setState({ status: "idle" });
      push("AI cover applied.", "success");
    } catch (cause) {
      setState({ status: "error", message: cause instanceof Error ? cause.message : "Could not generate a cover." });
    }
  }, [applyCover, getManual, manualId, orgId, push]);
  return { state, generate };
}

function CoverLibrary({ orgId, cover, onChange }: { orgId: number; cover: SopCover; onChange: (cover: SopCover) => void }) {
  const [items, setItems] = React.useState<CoverLibraryItem[] | null>(null);
  React.useEffect(() => {
    let active = true;
    void fetch(policyCraftScopedUrl("/api/policycraft/cover-templates?source=ai", orgId), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { templates: [] }))
      .then((body: { templates?: CoverLibraryItem[] }) => { if (active) setItems((body.templates ?? []).filter((item) => item.previewAssetId || item.composition.background.assetId)); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [orgId, cover.libraryTemplateId]);
  if (!items?.length) return <p className={studio.muted}>{items === null ? "Loading saved covers…" : "Covers you generate are saved here for reuse."}</p>;
  return (
    <ul className={studio.coverGrid}>
      {items.slice(0, 12).map((item) => {
        const selected = cover.libraryTemplateId === item.id;
        return (
          <li key={item.id} className={studio.coverCard} data-cover-selected={selected}>
            <button type="button" className={studio.coverThumb} aria-pressed={selected} aria-label={`Use ${item.name}`} onClick={() => onChange({ variant: "ai", composition: item.composition, libraryTemplateId: item.id })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverAssetSrc(orgId, item.previewAssetId || item.composition.background.assetId)} alt="" className="h-full w-full object-contain" loading="lazy" />
            </button>
            <span className={studio.coverDate}>{item.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The parts of a manual Design edits; SOP manuals and handbooks both have them. */
export type DesignableManual = Pick<SopManual, "theme" | "themeOptions" | "cover" | "company">;
type DesignUpdater = (updater: (manual: DesignableManual) => DesignableManual) => void;

function SectionStage({ section, aiCover, manual, setManual, orgId, layout, kind }: { kind: "sop" | "handbook"; section: SectionId; aiCover: ReturnType<typeof useAiCover>; manual: DesignableManual; setManual: DesignUpdater; orgId: number; layout: React.ReactNode }) {
  const setOptions = (patch: Partial<SopThemeOptions>) => setManual((current) => ({ ...current, themeOptions: { ...current.themeOptions, ...patch } }));
  const setCover = (cover: SopCover) => setManual((current) => ({ ...current, cover }));
  if (section === "template") {
    return (
      <>
        <div className={studio.sectionHead}><h2 className={studio.sectionTitle}>Template</h2></div>
        <SopTemplatePicker kind={kind} value={manual.theme} onChange={(theme) => setManual((current) => ({ ...current, theme }))} />
      </>
    );
  }
  if (section === "brand") {
    return (
      <>
        <div className={studio.sectionHead}><h2 className={studio.sectionTitle}>Brand</h2></div>
        <Group><ThemeOptionRows theme={manual.theme} options={manual.themeOptions} logoPalette={manual.company.logoPalette} onChange={setOptions} /></Group>
      </>
    );
  }
  if (section === "layout") {
    return (
      <>
        <div className={studio.sectionHead}><h2 className={studio.sectionTitle}>Layout</h2></div>
        {layout}
      </>
    );
  }
  return (
    <>
      <div className={studio.sectionHead}><h2 className={studio.sectionTitle}>Cover</h2></div>
      <Group title="Cover in use">
        <CoverChooser orgId={orgId} cover={manual.cover} onChange={setCover} onGenerateAi={() => void aiCover.generate()} aiLabel={manual.cover.composition ? "Regenerate AI cover" : "Generate AI cover"} aiState={aiCover.state} />
      </Group>
      <Group title="Saved AI covers">
        <CoverLibrary orgId={orgId} cover={manual.cover} onChange={setCover} />
      </Group>
    </>
  );
}

/** Design's Layout panel for an SOP manual: chapter grouping and the SOP header card. */
function SopLayoutPanel() {
  const manual = useSopBuilder((state) => state.manual!);
  const setManual = useSopBuilder((state) => state.setManual);
  const setOptions = (patch: Partial<SopThemeOptions>) => setManual((current) => ({ ...current, themeOptions: { ...current.themeOptions, ...patch } }));
  const design = getSopDesign(manual.theme);
  return (
    <>
        <Group title="Group SOPs by">
          <Segmented<SopGrouping> label="Group SOPs by" value={manual.grouping} onChange={(grouping) => setManual((current) => ({ ...current, grouping }))} options={[{ value: "pillar", label: "ESG pillar" }, { value: "department", label: "Department" }, { value: "none", label: "None" }]} />
          <p className={studio.muted}>{manual.grouping === "pillar" ? "Environmental, Social and Governance chapters, in that order." : manual.grouping === "department" ? "One chapter per department, in outline order." : "One list of SOPs in outline order."}</p>
        </Group>
        <Group title="SOP pages">
          <SwitchRow label="SOP header card" hint={design.sopOpener === "header-card" ? "Always shown by this template." : "Code, owner, version and dates in a card above each SOP."} checked={manual.themeOptions.showSopHeaderCard || design.sopOpener === "header-card"} onChange={(showSopHeaderCard) => setOptions({ showSopHeaderCard })} />
        </Group>
    </>
  );
}

/** Design mode for an SOP manual: the shared studio with the SOP layout options, beside the whole manual. */
export function DesignMode({ mobile, onClose, aiCover }: { mobile: boolean; onClose: () => void; aiCover: ReturnType<typeof useAiCover> }) {
  const manual = useSopBuilder((state) => state.manual!);
  const setManual = useSopBuilder((state) => state.setManual);
  const { orgId, manualId } = useSopBuilderActions();
  return (
    <ManualDesignStudio
      mobile={mobile}
      onClose={onClose}
      aiCover={aiCover}
      orgId={orgId}
      manual={manual}
      setManual={setManual as unknown as DesignUpdater}
      layout={<SopLayoutPanel />}
      label="Manual"
      preview={<SopPdfPreview orgId={orgId} manualId={manualId} manual={manual} debounceMs={800} />}
    />
  );
}

/**
 * Design mode: the policy design inspector's frame with template, brand,
 * layout and cover settings, beside the whole document. Shared by SOP
 * manuals and employee handbooks.
 */
export function ManualDesignStudio({ mobile, onClose, aiCover, orgId, manual, setManual, layout, preview, label, kind = "sop" }: {
  mobile: boolean;
  onClose: () => void;
  aiCover: ReturnType<typeof useAiCover>;
  orgId: number;
  kind?: "sop" | "handbook";
  manual: DesignableManual;
  setManual: DesignUpdater;
  layout: React.ReactNode;
  preview: React.ReactNode;
  /** "Manual" or "Handbook", for headings. */
  label: string;
}) {
  const [section, setSection] = React.useState<SectionId>("template");
  const [direction, setDirection] = React.useState(1);
  const tabs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const select = (next: SectionId, focus = false) => {
    const from = SECTIONS.findIndex((item) => item.id === section);
    const to = SECTIONS.findIndex((item) => item.id === next);
    setDirection(to >= from ? 1 : -1);
    setSection(next);
    if (focus) requestAnimationFrame(() => tabs.current[to]?.focus());
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = SECTIONS.findIndex((item) => item.id === section);
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    select(SECTIONS[(index + delta + SECTIONS.length) % SECTIONS.length].id, true);
  };
  const Glyph = { template: LayoutTemplate, brand: null, layout: Rows3, cover: ImageIcon } as const;

  return (
    <div className={shell.designLayout}>
      <h1 className="sr-only">{label} design</h1>
      <div className={inspector.inspector}>
        <button type="button" aria-label="Close design controls" onClick={onClose} className={inspector.scrim} />
        <aside id="design-inspector" role={mobile ? "dialog" : undefined} aria-modal={mobile || undefined} aria-label={`${label} design`} className={inspector.frame}>
          <nav className={inspector.rail} aria-label="Design sections">
            <div role="tablist" aria-orientation="vertical" aria-label="Design sections" onKeyDown={onKeyDown} className={inspector.railList}>
              {SECTIONS.map((item, index) => {
                const selected = item.id === section;
                const Icon = Glyph[item.id];
                return (
                  <button key={item.id} ref={(element) => { tabs.current[index] = element; }} type="button" role="tab" id={`sop-design-tab-${item.id}`} aria-controls="sop-design-section" aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => select(item.id)} className={inspector.railItem}>
                    {selected ? <motion.span layoutId="sop-design-rail-marker" transition={SPRING} className={inspector.railMarker} /> : null}
                    <span className={inspector.railGlyph}>
                      {Icon ? <Icon size={19} strokeWidth={1.7} aria-hidden="true" /> : <span className={inspector.brandGlyph} aria-hidden="true"><span style={{ backgroundColor: getSopDesign(manual.theme).palette.primary }} /><span style={{ backgroundColor: getSopDesign(manual.theme).palette.accent }} /></span>}
                    </span>
                    <span className={inspector.railLabel}>{item.label}</span>
                  </button>
                );
              })}
            </div>
            {mobile ? <button type="button" aria-label="Close design controls" onClick={onClose} className={inspector.close}><X size={18} aria-hidden="true" /></button> : null}
          </nav>
          <div className={inspector.stage}>
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div key={section} custom={direction} variants={{ enter: (dir: number) => ({ opacity: 0, y: dir * 14 }), center: { opacity: 1, y: 0 }, exit: (dir: number) => ({ opacity: 0, y: dir * -10 }) }} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2, ease: EASE_OUT }} id="sop-design-section" role="tabpanel" aria-labelledby={`sop-design-tab-${section}`} className={inspector.panel}>
                <div data-studio-scroll className={inspector.scroll} data-lenis-prevent="">
                  <SectionStage kind={kind} section={section} aiCover={aiCover} manual={manual} setManual={setManual} orgId={orgId} layout={layout} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>
      <section aria-label={`${label} preview`} className={shell.designPreview}>
        <div className={shell.paneHeader}><h2 className={shell.paneTitle}>{label} preview</h2><span className={styles.paneNote}>Whole {label.toLowerCase()}, as it will download</span></div>
        <div className={shell.designPreviewBody}>
          {preview}
        </div>
      </section>
    </div>
  );
}

