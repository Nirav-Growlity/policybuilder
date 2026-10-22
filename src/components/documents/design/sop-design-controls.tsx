"use client";

import * as React from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Check, ImagePlus, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { ColorField, Row, Segmented, SPRING } from "@/components/builder/design-studio/controls";
import studio from "@/components/builder/design-studio/design-studio.module.css";
import { SelectMenu } from "@/components/ui/select-menu";
import { SOP_DESIGNS, SOP_FONT_PAIRS } from "@/lib/sop/design/templates";
import { coverAssetSrc, uploadCoverImage } from "@/lib/sop/client-api";
import type { LogoColorPalette } from "@/lib/types";
import type { SopCover, SopPageSize, SopTemplateId, SopThemeOptions } from "@/lib/sop/types";
import styles from "./sop-design.module.css";

/** Cover and first SOP page of a template, side by side like the policy contact sheet. */
export function SopTemplateSheet({ templateId, compact = false }: { templateId: SopTemplateId; compact?: boolean }) {
  const design = SOP_DESIGNS.find((item) => item.id === templateId) ?? SOP_DESIGNS[0];
  return (
    <div className={clsx(styles.sheet, compact && styles.sheetCompact)} aria-hidden="true" data-template-preview={templateId}>
      {(["cover", "body"] as const).map((page) => (
        <span key={page} className={styles.sheetPage} style={{ background: design.palette.paper }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/sop-templates/${templateId}/${page}.webp`} alt="" loading="lazy" draggable={false} />
        </span>
      ))}
    </div>
  );
}

/** The five SOP templates as selectable cards. `layout="grid"` for the wizard, "list" for the Design panel. */
export function SopTemplatePicker({ value, onChange, layout = "list" }: { value: SopTemplateId; onChange: (value: SopTemplateId) => void; layout?: "list" | "grid" }) {
  return (
    <LayoutGroup id={`sop-templates-${layout}`}>
      <ul className={clsx(studio.templateList, layout === "grid" && styles.templateGrid)}>
        {SOP_DESIGNS.map((design) => {
          const selected = design.id === value;
          return (
            <li key={design.id} data-reveal>
              <button type="button" aria-pressed={selected} onClick={() => onChange(design.id)} className={studio.templateCard}>
                {selected ? <motion.span layoutId="sop-template-in-use" transition={SPRING} className={studio.templateRing} aria-hidden="true" /> : null}
                <SopTemplateSheet templateId={design.id} compact />
                <span className={studio.templateMeta}>
                  <span className={studio.templateName}>{design.name}</span>
                  <span className={studio.templateKind}>{design.descriptors.join(", ")}</span>
                </span>
                <AnimatePresence>
                  {selected ? (
                    <motion.span key="in-use" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING} className={studio.inUse}>
                      <Check size={12} strokeWidth={3} aria-hidden="true" /> In use
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </button>
            </li>
          );
        })}
      </ul>
    </LayoutGroup>
  );
}

const ACCENT_PRESETS = ["#183A5A", "#2D685A", "#244B59", "#3B3F8C", "#7A3E2B", "#26323D"] as const;
const HEX = /^#[0-9a-f]{6}$/i;

/** Template colours, the company's brand colours (from its logo), or one chosen colour. */
export function AccentPicker({ value, onChange, logoPalette, templateId }: { value: string; onChange: (value: string) => void; logoPalette?: LogoColorPalette; templateId: SopTemplateId }) {
  const design = SOP_DESIGNS.find((item) => item.id === templateId) ?? SOP_DESIGNS[0];
  const custom = HEX.test(value) ? value.toUpperCase() : "";
  const swatch = (key: string, label: string, color: string, selected: boolean, onSelect: () => void, disabled = false) => (
    <button key={key} type="button" role="radio" aria-checked={selected} aria-label={label} title={label} disabled={disabled} onClick={onSelect} className={styles.swatch} data-selected={selected || undefined}>
      <span style={{ background: color }} />
      {selected ? <Check size={13} strokeWidth={3} aria-hidden="true" className={styles.swatchCheck} /> : null}
    </button>
  );
  return (
    <div className={styles.accent}>
      <div role="radiogroup" aria-label="Accent colour" className={styles.swatches}>
        {swatch("template", `Template colours (${design.name})`, design.palette.primary, value === "", () => onChange(""))}
        {logoPalette ? swatch("brand", "Brand colours from your logo", logoPalette.primary, value === "brand", () => onChange("brand")) : null}
        {ACCENT_PRESETS.filter((color) => color !== design.palette.primary).map((color) => swatch(color, `Accent ${color}`, color, custom === color, () => onChange(color)))}
      </div>
      <p className={styles.accentHint}>{value === "" ? "Template colours" : value === "brand" ? "Brand colours from your logo" : `Custom accent ${custom}`}</p>
      <ColorField id="sop-accent" label="Custom colour" value={custom || design.palette.primary} onChange={(color) => onChange(color)} />
    </div>
  );
}

export function FontPairSelect({ value, onChange, templateId }: { value: string; onChange: (value: string) => void; templateId: SopTemplateId }) {
  const design = SOP_DESIGNS.find((item) => item.id === templateId) ?? SOP_DESIGNS[0];
  const templatePair = SOP_FONT_PAIRS.find((pair) => pair.id === design.fontPair);
  return (
    <SelectMenu
      size="compact"
      value={value}
      onValueChange={onChange}
      aria-label="Font pair"
      options={[
        { value: "", label: `Template fonts${templatePair ? ` (${templatePair.heading} and ${templatePair.body})` : ""}` },
        ...SOP_FONT_PAIRS.map((pair) => ({ value: pair.id, label: pair.label })),
      ]}
    />
  );
}

export function PageSizeControl({ value, onChange }: { value: SopPageSize; onChange: (value: SopPageSize) => void }) {
  return <Segmented label="Page size" value={value} onChange={onChange} options={[{ value: "A4", label: "A4" }, { value: "Letter", label: "US Letter" }]} />;
}

/** The look settings shared by the wizard's Look step and the builder's Design mode. */
export function ThemeOptionRows({ theme, options, logoPalette, onChange }: { theme: SopTemplateId; options: SopThemeOptions; logoPalette?: LogoColorPalette; onChange: (patch: Partial<SopThemeOptions>) => void }) {
  return (
    <>
      <Row label="Accent colour" hint="Headings, banners and table headers" stacked>
        <AccentPicker value={options.accent} onChange={(accent) => onChange({ accent })} logoPalette={logoPalette} templateId={theme} />
      </Row>
      <Row label="Fonts" stacked>
        <FontPairSelect value={options.fontPair} onChange={(fontPair) => onChange({ fontPair })} templateId={theme} />
      </Row>
      <Row label="Page size">
        <PageSizeControl value={options.pageSize} onChange={(pageSize) => onChange({ pageSize })} />
      </Row>
    </>
  );
}

export type CoverChoiceState = { status: "idle" } | { status: "busy"; label: string } | { status: "error"; message: string } | { status: "unavailable" };

/**
 * Template cover, an uploaded photo, or an AI cover. Upload works before the
 * manual exists (the photo goes to the organization's asset library); the AI
 * cover is generated by the caller.
 */
export function CoverChooser({ orgId, cover, onChange, onGenerateAi, aiLabel = "Generate AI cover", aiState = { status: "idle" }, aiNote }: {
  orgId: number;
  cover: SopCover;
  onChange: (cover: SopCover) => void;
  onGenerateAi?: () => void;
  aiLabel?: string;
  aiState?: CoverChoiceState;
  /** Explains when the AI cover is made, e.g. "after the manual is created". */
  aiNote?: string;
}) {
  const [upload, setUpload] = React.useState<CoverChoiceState>({ status: "idle" });
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const uploadedSrc = cover.variant === "upload" ? coverAssetSrc(orgId, cover.imageUrl) : undefined;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUpload({ status: "busy", label: "Uploading photo…" });
    try {
      const assetId = await uploadCoverImage(orgId, file);
      onChange({ variant: "upload", imageUrl: assetId });
      setUpload({ status: "idle" });
    } catch (cause) {
      setUpload({ status: "error", message: cause instanceof Error ? cause.message : "The photo could not be uploaded." });
    }
  }

  return (
    <div className={studio.stack}>
      <Segmented
        label="Cover"
        value={cover.variant}
        onChange={(variant) => onChange(variant === "template" ? { variant: "template" } : { ...cover, variant })}
        options={[
          { value: "template", label: "Template" },
          { value: "upload", label: "Photo" },
          { value: "ai", label: "AI cover" },
        ]}
      />
      <AnimatePresence mode="wait" initial={false}>
        {cover.variant === "template" ? (
          <motion.p key="template" className={studio.muted} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            The cover designed for the template, with your logo, title and document control.
          </motion.p>
        ) : cover.variant === "upload" ? (
          <motion.div key="upload" className={studio.stack} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {uploadedSrc ? (
              <div className={styles.coverPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadedSrc} alt="Uploaded cover photo" />
                <button type="button" className={styles.coverRemove} onClick={() => onChange({ variant: "template" })} aria-label="Remove cover photo"><Trash2 size={14} aria-hidden="true" /></button>
              </div>
            ) : null}
            <label
              className={studio.dropzone}
              data-dragging={dragging || undefined}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFile(event.dataTransfer.files?.[0]); }}
            >
              {upload.status === "busy" ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={20} aria-hidden="true" />}
              <span className={studio.dropTitle}>{upload.status === "busy" ? upload.label : uploadedSrc ? "Replace photo" : "Upload a cover photo"}</span>
              <span className={studio.dropHint}>PNG, JPEG or WebP, up to 10 MB. Drop it here or browse.</span>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            {upload.status === "error" ? <p role="alert" className={styles.error}>{upload.message}</p> : null}
          </motion.div>
        ) : (
          <motion.div key="ai" className={studio.stack} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {cover.composition?.background.assetId ? (
              <div className={styles.coverPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverAssetSrc(orgId, cover.composition.background.assetId)} alt="AI cover artwork" />
              </div>
            ) : null}
            {aiState.status === "unavailable" ? (
              <p className={styles.soon}><Sparkles size={15} aria-hidden="true" />AI covers for SOP manuals are almost here. The template cover is used until then.</p>
            ) : (
              <>
                <p className={studio.muted}>{aiNote ?? "Artwork drawn for your company and industry, with your title and logo set on top."}</p>
                {onGenerateAi ? (
                  <button type="button" className={studio.buttonSecondaryWide} onClick={onGenerateAi} disabled={aiState.status === "busy"}>
                    {aiState.status === "busy" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : cover.composition ? <RefreshCw size={15} aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
                    {aiState.status === "busy" ? aiState.label : aiLabel}
                  </button>
                ) : null}
                {aiState.status === "error" ? <p role="alert" className={styles.error}>{aiState.message}</p> : null}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
