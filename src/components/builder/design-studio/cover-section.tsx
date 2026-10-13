"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, PenLine, Trash2 } from "lucide-react";
import { AICoverWorkflow } from "../ai-cover-workflow";
import { AICoverLibraryPanel } from "../ai-cover-library";
import { getPolicyDocumentTheme } from "@/lib/document-themes";
import { useBuilder } from "@/lib/store";
import type { Policy } from "@/lib/types";
import { EASE_OUT, Group, Notice, Row, Segmented, Slider } from "./controls";
import styles from "./design-studio.module.css";

export function CoverSection() {
  const { policy, updatePolicy, setStep, requestCoverEdit } = useBuilder();
  const active = policy.activeCoverVariant === "ai" ? "ai" : "manual";

  return (
    <>
      <div data-reveal className={styles.sectionHead}><h2 className={styles.sectionTitle}>Cover</h2></div>

      <Group title="Cover in use">
        <Segmented
          label="Cover in use"
          value={active}
          onChange={(activeCoverVariant) => updatePolicy(() => ({ activeCoverVariant }))}
          options={[{ value: "manual", label: "Standard" }, { value: "ai", label: "AI cover", disabled: !policy.aiCoverComposition }]}
        />
        <button
          type="button"
          onClick={() => { requestCoverEdit(active, active === "ai" ? policy.aiCoverComposition : undefined); setStep("export"); }}
          className={styles.buttonSecondaryWide}
        >
          <PenLine size={15} aria-hidden="true" /> Edit this cover
        </button>
      </Group>

      <Group title="AI covers">
        <AICoverWorkflow policy={policy} onApply={(composition) => updatePolicy(() => ({ aiCoverComposition: composition, activeCoverVariant: "ai" }))} />
        <AICoverLibraryPanel />
      </Group>

      <FeatureImage />
    </>
  );
}

function FeatureImage() {
  const { policy, updatePolicy } = useBuilder();
  const resolved = getPolicyDocumentTheme(policy);
  const [error, setError] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const image = policy.featureImage;

  const accept = async (file: File | undefined) => {
    if (!file) return;
    try {
      const featureImage = await resizeFeatureImage(file);
      updatePolicy(() => ({ featureImage }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That image could not be used.");
    }
  };

  const patch = (next: Partial<NonNullable<Policy["featureImage"]>>) => updatePolicy((current) => ({ featureImage: current.featureImage ? { ...current.featureImage, ...next } : undefined }));

  return (
    <Group title="Feature image">
      <AnimatePresence mode="wait" initial={false}>
        {image ? (
          <motion.div key="image" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.22, ease: EASE_OUT }} className={styles.stack}>
            <div className={styles.featurePreview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt={image.altText || "Feature image"} style={{ objectPosition: `${image.focalPosition.x}% ${image.focalPosition.y}%` }} />
              <motion.span className={styles.focalDot} animate={{ left: `${image.focalPosition.x}%`, top: `${image.focalPosition.y}%` }} transition={{ type: "spring", stiffness: 420, damping: 30 }} aria-hidden="true" />
            </div>
            {!resolved.imageSupport.includes(image.placement) ? <Notice tone="warning">This template doesn&apos;t show an image there. It stays saved for templates that do.</Notice> : null}
            <Row label="Show on">
              <Segmented label="Image placement" size="small" value={image.placement} onChange={(placement) => patch({ placement })} options={[{ value: "cover", label: "Cover" }, { value: "section", label: "Section opener" }]} />
            </Row>
            <Slider label="Focus left to right" value={image.focalPosition.x} min={0} max={100} format={(value) => `${value}%`} onChange={(x) => patch({ focalPosition: { ...image.focalPosition, x } })} />
            <Slider label="Focus top to bottom" value={image.focalPosition.y} min={0} max={100} format={(value) => `${value}%`} onChange={(y) => patch({ focalPosition: { ...image.focalPosition, y } })} />
            <Row label="Description" stacked htmlFor="feature-alt">
              <input id="feature-alt" value={image.altText} maxLength={180} onChange={(event) => patch({ altText: event.target.value.slice(0, 180) })} placeholder="What the image shows" className={styles.textInput} />
            </Row>
            <button type="button" onClick={() => updatePolicy(() => ({ featureImage: undefined }))} className={styles.buttonDangerQuiet}><Trash2 size={14} aria-hidden="true" /> Remove image</button>
          </motion.div>
        ) : (
          <motion.label
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.dropzone}
            data-dragging={dragging || undefined}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void accept(event.dataTransfer.files?.[0]); }}
          >
            <motion.span animate={{ y: dragging ? -3 : 0, scale: dragging ? 1.08 : 1 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}><ImagePlus size={20} aria-hidden="true" /></motion.span>
            <span className={styles.dropTitle}>Add an image</span>
            <span className={styles.dropHint}>PNG, JPEG or WebP, up to 8 MB</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void accept(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </motion.label>
        )}
      </AnimatePresence>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Group>
  );
}

async function resizeFeatureImage(file: File): Promise<NonNullable<Policy["featureImage"]>> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Images must be smaller than 8 MB.");
  const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read that image.")); reader.readAsDataURL(file); });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("The selected image could not be decoded.")); element.src = source; });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable in this browser.");
  context.drawImage(image, 0, 0, width, height);
  const mimeType = file.type === "image/png" ? "image/png" as const : "image/jpeg" as const;
  const dataUrl = canvas.toDataURL(mimeType, mimeType === "image/jpeg" ? .84 : undefined);
  if (dataUrl.length > 4_000_000) throw new Error("The resized image is still too large. Choose a smaller image.");
  return { dataUrl, mimeType, width, height, placement: "cover", focalPosition: { x: 50, y: 50 }, altText: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 180) };
}
