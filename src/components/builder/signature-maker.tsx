"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Eraser, PenLine, Redo2, Trash2, Type, Undo2, Upload } from "lucide-react";
import SignaturePad, { type PointGroup } from "signature_pad";
import { useBuilder } from "@/lib/store";
import type { PolicyCraftWorkspaceScope } from "@/lib/policycraft-access-types";
import { isCurrentPolicyCraftSignatureScope, policyCraftSignatureScopeKey, policyCraftSignatureUrl } from "@/lib/policycraft-signature-scope";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { Panel } from "@/components/ui/panel";
import { cloneSignaturePointGroups, recordSignatureHistoryEntry } from "./signature-history";

type SignatureRecord = { dataUrl: string; updatedAt: string };
type SignatureMode = "draw" | "type" | "upload";
type TypedSignatureStyle = "allura" | "natural" | "caveat" | "pacifico" | "mrDeHaviland";
type TypedSignatureStyleOption = { label: string; description: string; family: string; weight: number; size: number; previewSize: number };
type TypedSignatureArtwork = { dataUrl: string; width: number; height: number };

const TYPED_SIGNATURE_STYLES: Record<TypedSignatureStyle, TypedSignatureStyleOption> = {
  allura: { label: "Allura", description: "Elegant", family: "Allura", weight: 400, size: 110, previewSize: 44 },
  natural: { label: "Natural", description: "Neat handwriting", family: "Bad Script", weight: 400, size: 100, previewSize: 38 },
  caveat: { label: "Caveat", description: "Handwritten", family: "Caveat", weight: 600, size: 104, previewSize: 46 },
  pacifico: { label: "Pacifico", description: "Bold brush", family: "Pacifico", weight: 400, size: 86, previewSize: 38 },
  mrDeHaviland: { label: "Mr De Haviland", description: "Dramatic flourish", family: "Mr De Haviland", weight: 400, size: 140, previewSize: 52 },
};

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function responseMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return fallback;
}

async function createTypedSignatureArtwork(name: string, style: TypedSignatureStyleOption): Promise<TypedSignatureArtwork> {
  const fontSpec = `${style.weight} ${style.size}px "${style.family}"`;
  const loadedFaces = await document.fonts.load(fontSpec, "Signature");
  if (!loadedFaces.length || !document.fonts.check(fontSpec, "Signature")) throw new Error("That signature style could not be loaded. Choose another style or try again.");
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("Your browser could not create the signature image.");
  measureContext.font = fontSpec;
  const metrics = measureContext.measureText(name);
  const horizontalPadding = Math.max(12, Math.ceil(style.size * 0.18));
  const verticalPadding = Math.max(12, Math.ceil(style.size * 0.18));
  const inkWidth = Math.max(1, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight);
  const inkHeight = Math.max(1, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
  const logicalWidth = inkWidth + horizontalPadding * 2;
  const logicalHeight = inkHeight + verticalPadding * 2;
  const pixelRatio = Math.min(2, 2400 / logicalWidth, 600 / logicalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(logicalWidth * pixelRatio);
  canvas.height = Math.ceil(logicalHeight * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not create the signature image.");
  context.scale(pixelRatio, pixelRatio);
  context.font = fontSpec;
  context.fillStyle = "#17211b";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(name, horizontalPadding + metrics.actualBoundingBoxLeft, verticalPadding + metrics.actualBoundingBoxAscent);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width / pixelRatio, height: canvas.height / pixelRatio };
}

export function SignatureMaker() {
  const scope = usePolicyCraftScope((state) => state.scope);
  const scopeKey = policyCraftSignatureScopeKey(scope);
  return <SignatureMakerForScope key={scopeKey ?? "unscoped"} scope={scope} scopeKey={scopeKey} />;
}

function SignatureMakerForScope({ scope, scopeKey }: { scope: PolicyCraftWorkspaceScope | null; scopeKey: string | null }) {
  const { policy, includeAuthorSignature, authorSignatureChoiceMade, authorSignatureDate, setAuthorSignatureApplied, setAuthorSignatureUpdatedAt } = useBuilder();
  const [signature, setSignature] = React.useState<SignatureRecord | null>(null);
  const [loadedScopeKey, setLoadedScopeKey] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<SignatureMode>("draw");
  const [typedName, setTypedName] = React.useState("");
  const [typedStyle, setTypedStyle] = React.useState<TypedSignatureStyle>("allura");
  const [typedPreviewResult, setTypedPreviewResult] = React.useState<{ key: string; artwork?: TypedSignatureArtwork; status: "ready" | "error" } | null>(null);
  const [fontStatus, setFontStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const loading = scopeKey !== null && loadedScopeKey !== scopeKey;
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const [historyLength, setHistoryLength] = React.useState(0);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const signaturePadRef = React.useRef<SignaturePad | null>(null);
  const historyRef = React.useRef<PointGroup[][]>([]);
  const historyCursorRef = React.useRef(-1);
  const previousSignature = React.useRef<SignatureRecord | null>(null);
  const canApply = scopeKey !== null && !loading && policy.showAcknowledgement !== false && signature !== null;
  const canSave = scopeKey !== null;
  const selectedTypedStyle = TYPED_SIGNATURE_STYLES[typedStyle];
  const fontSpec = `${selectedTypedStyle.weight} ${selectedTypedStyle.size}px "${selectedTypedStyle.family}"`;
  const previewName = typedName.trim() || "Your name";
  const typedPreviewKey = `${typedStyle}\u0000${previewName}`;
  const typedPreview = typedPreviewResult?.key === typedPreviewKey ? typedPreviewResult.artwork : null;
  const typedPreviewStatus = typedPreviewResult?.key === typedPreviewKey ? typedPreviewResult.status : "loading";

  React.useEffect(() => {
    if (policy.showAcknowledgement === false && includeAuthorSignature) {
      setAuthorSignatureApplied(false, null, "system");
    } else if (canApply && !authorSignatureChoiceMade && !includeAuthorSignature) {
      setAuthorSignatureApplied(true, localDate(), "automatic");
    }
  }, [authorSignatureChoiceMade, canApply, includeAuthorSignature, policy.showAcknowledgement, setAuthorSignatureApplied, signature]);

  React.useEffect(() => {
    const controller = new AbortController();
    const signatureUrl = policyCraftSignatureUrl(scope);
    if (!signatureUrl || !scopeKey) return () => controller.abort();
    void fetch(signatureUrl, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseMessage(body, "Could not load your saved signature."));
        if (controller.signal.aborted || !isCurrentPolicyCraftSignatureScope(scopeKey, usePolicyCraftScope.getState().scope)) return;
        setSignature(body?.signature ?? null);
        setAuthorSignatureUpdatedAt(body?.signature?.updatedAt ? `${body.userId}:${body.signature.updatedAt}` : null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted && isCurrentPolicyCraftSignatureScope(scopeKey, usePolicyCraftScope.getState().scope)) setError(cause instanceof Error ? cause.message : "Could not load your saved signature.");
      })
      .finally(() => {
        if (!controller.signal.aborted && isCurrentPolicyCraftSignatureScope(scopeKey, usePolicyCraftScope.getState().scope)) setLoadedScopeKey(scopeKey);
      });
    return () => controller.abort();
  }, [scope, scopeKey, setAuthorSignatureUpdatedAt]);

  React.useEffect(() => {
    if (loading || mode !== "draw" || signature) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current = [];
    historyCursorRef.current = -1;
    setHistoryLength(0);
    setHistoryIndex(-1);
    const pad = new SignaturePad(canvas, {
      minWidth: 0.65,
      maxWidth: 2.8,
      throttle: 8,
      velocityFilterWeight: 0.7,
      penColor: "#17211b",
      backgroundColor: "rgba(0,0,0,0)",
    });
    signaturePadRef.current = pad;
    let previousWidth = 0;
    let previousHeight = 0;
    const recordStroke = () => {
      if (pad.isEmpty()) return;
      const next = recordSignatureHistoryEntry(historyRef.current, historyCursorRef.current, pad.toData());
      historyRef.current = next.history;
      historyCursorRef.current = next.cursor;
      setHistoryLength(next.history.length);
      setHistoryIndex(historyCursorRef.current);
    };
    pad.addEventListener("endStroke", recordStroke);
    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const scaleX = previousWidth ? width / previousWidth : 1;
      const scaleY = previousHeight ? height / previousHeight : 1;
      const strokeScale = Math.min(scaleX, scaleY);
      const resizeStrokeData = (groups: PointGroup[]) => groups.map((group) => ({
        ...group,
        dotSize: group.dotSize * strokeScale,
        minWidth: group.minWidth * strokeScale,
        maxWidth: group.maxWidth * strokeScale,
        points: group.points.map((point) => ({ ...point, x: point.x * scaleX, y: point.y * scaleY })),
      }));
      const data = resizeStrokeData(pad.toData());
      historyRef.current = historyRef.current.map(resizeStrokeData);
      pad.off();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      pad.on();
      if (data.length) pad.fromData(data);
      previousWidth = width;
      previousHeight = height;
    };
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", resizeCanvas);
    resizeCanvas();
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("orientationchange", resizeCanvas);
      pad.removeEventListener("endStroke", recordStroke);
      pad.off();
      signaturePadRef.current = null;
      historyRef.current = [];
      historyCursorRef.current = -1;
    };
  }, [loading, mode, signature]);

  React.useEffect(() => {
    if (mode !== "type") return;
    let current = true;
    void Promise.resolve().then(async () => {
      if (!current) return;
      setFontStatus("loading");
      const loadedFaces = await document.fonts.load(fontSpec, "Signature");
      if (current) setFontStatus(loadedFaces.length > 0 && document.fonts.check(fontSpec, "Signature") ? "ready" : "error");
    }).catch(() => { if (current) setFontStatus("error"); });
    return () => { current = false; };
  }, [fontSpec, mode]);

  React.useEffect(() => {
    if (mode !== "type") return;
    let current = true;
    void createTypedSignatureArtwork(previewName, selectedTypedStyle)
      .then((artwork) => {
        if (!current) return;
        setTypedPreviewResult({ key: typedPreviewKey, artwork, status: "ready" });
      })
      .catch(() => {
        if (!current) return;
        setTypedPreviewResult({ key: typedPreviewKey, status: "error" });
      });
    return () => { current = false; };
  }, [mode, previewName, selectedTypedStyle, typedPreviewKey]);

  const undo = () => {
    if (historyCursorRef.current < 0) return;
    const nextIndex = historyCursorRef.current - 1;
    const pad = signaturePadRef.current;
    if (nextIndex < 0) pad?.clear();
    else if (pad) pad.fromData(cloneSignaturePointGroups(historyRef.current[nextIndex]));
    historyCursorRef.current = nextIndex;
    setHistoryIndex(nextIndex);
  };
  const redo = () => {
    const nextIndex = historyCursorRef.current + 1;
    const strokes = historyRef.current[nextIndex];
    if (!strokes) return;
    signaturePadRef.current?.fromData(cloneSignaturePointGroups(strokes));
    historyCursorRef.current = nextIndex;
    setHistoryIndex(nextIndex);
  };
  const clearCanvas = () => {
    signaturePadRef.current?.clear();
    historyRef.current = [];
    historyCursorRef.current = -1;
    setHistoryLength(0);
    setHistoryIndex(-1);
  };

  const saveTyped = async () => {
    if (!typedName.trim() || typedPreviewStatus !== "ready") return;
    const preview = typedPreviewResult?.key === typedPreviewKey ? typedPreviewResult.artwork : null;
    if (!preview) return;
    setError("");
    setFontStatus("loading");
    try {
      await save(preview.dataUrl);
      setFontStatus("ready");
    } catch (cause) {
      setFontStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not prepare the typed signature.");
    }
  };
  const save = async (dataUrl: string) => {
    const expectedScopeKey = scopeKey;
    const signatureUrl = policyCraftSignatureUrl(scope);
    if (!signatureUrl || !expectedScopeKey || !isCurrentPolicyCraftSignatureScope(expectedScopeKey, usePolicyCraftScope.getState().scope)) {
      setError("Save this policy draft before saving its signature.");
      return;
    }
    const replacing = previousSignature.current !== null;
    setSaving(true); setError("");
    try {
      const response = await fetch(signatureUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "Could not save your signature."));
      if (!isCurrentPolicyCraftSignatureScope(expectedScopeKey, usePolicyCraftScope.getState().scope)) return;
      setSignature(body?.signature ?? { dataUrl, updatedAt: new Date().toISOString() });
      previousSignature.current = null;
      setAuthorSignatureUpdatedAt(`${body?.userId ?? "current"}:${body?.signature?.updatedAt ?? new Date().toISOString()}`);
      if (replacing) {
        setAuthorSignatureApplied(includeAuthorSignature, includeAuthorSignature ? localDate() : null, "system");
      } else {
        setAuthorSignatureApplied(true, localDate(), "automatic");
      }
    } catch (cause) {
      if (!isCurrentPolicyCraftSignatureScope(expectedScopeKey, usePolicyCraftScope.getState().scope)) return;
      if (previousSignature.current) {
        setSignature(previousSignature.current);
        previousSignature.current = null;
      }
      setError(cause instanceof Error ? cause.message : "Could not save your signature.");
    } finally { if (isCurrentPolicyCraftSignatureScope(expectedScopeKey, usePolicyCraftScope.getState().scope)) setSaving(false); }
  };
  const saveDrawn = () => {
    const pad = signaturePadRef.current;
    if (!pad || pad.isEmpty()) {
      setError("Draw your signature before saving."); return;
    }
    void save(pad.toDataURL("image/png"));
  };
  const upload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file for your signature."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Choose an image smaller than 2 MB."); return; }
    setError("");
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 2400 / image.naturalWidth, 900 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) { setError("Your browser could not prepare that image."); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      void save(canvas.toDataURL("image/png"));
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); setError("That image could not be opened. Choose a PNG, JPEG, or WebP image."); };
    image.src = objectUrl;
  };
  const remove = async () => {
    const expectedScopeKey = scopeKey;
    const signatureUrl = policyCraftSignatureUrl(scope);
    if (!signatureUrl || !expectedScopeKey || !isCurrentPolicyCraftSignatureScope(expectedScopeKey, usePolicyCraftScope.getState().scope)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(signatureUrl, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "Could not delete your saved signature."));
      if (!isCurrentPolicyCraftSignatureScope(expectedScopeKey, usePolicyCraftScope.getState().scope)) return;
      setSignature(null); setConfirmDelete(false); setAuthorSignatureApplied(false, null, "system"); setAuthorSignatureUpdatedAt(null);
    } catch (cause) { if (isCurrentPolicyCraftSignatureScope(expectedScopeKey, usePolicyCraftScope.getState().scope)) setError(cause instanceof Error ? cause.message : "Could not delete your saved signature."); }
    finally { if (isCurrentPolicyCraftSignatureScope(expectedScopeKey, usePolicyCraftScope.getState().scope)) setSaving(false); }
  };
  const toggleApply = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAuthorSignatureApplied(event.target.checked, event.target.checked ? localDate() : null, "user");
  };

  return (
    <Panel
      title="Policy author signature"
      description="Save a signature for this organization and policy. It won’t appear on other policies."
      icon={<PenLine size={17} strokeWidth={1.8} aria-hidden="true" />}
    >
      <div className="mt-4 space-y-5" data-signature-maker>
        {!scopeKey ? <p className="text-[13px] text-[var(--color-muted)]" role="status">Save this draft before adding a signature. Each policy keeps its own signature.</p> : loading ? <p className="text-[13px] text-[var(--color-muted)]" role="status">Loading saved signature…</p> : <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.85fr)]">
          <section aria-labelledby="signature-create-heading" className="min-w-0" data-signature-workspace>
            <div className="mb-3">
              <h4 id="signature-create-heading" className="text-[13px] font-semibold text-[var(--color-ink)]">Create a signature</h4>
              <p className="mt-1 text-[14px] leading-5 text-[var(--color-muted)]">Choose how to add your mark to this policy.</p>
            </div>
            {!signature ? <>
              <div className="flex flex-wrap gap-2 border-b border-[var(--color-line)] pb-3" role="group" aria-label="Signature input method">
                {(["draw", "type", "upload"] as const).map((choice) => <button key={choice} type="button" aria-pressed={mode === choice} onClick={() => { setMode(choice); setError(""); }} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] ${mode === choice ? "bg-[var(--color-blue-bg)] text-[var(--color-blue-ink)]" : "text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]"}`}>
                  {choice === "draw" ? <PenLine size={15} aria-hidden="true" /> : choice === "type" ? <Type size={15} aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}{choice[0].toUpperCase() + choice.slice(1)}
                </button>)}
              </div>
              {mode === "draw" ? <div className="mt-4">
                <p id="signature-draw-help" className="mb-2 text-[14px] text-[var(--color-muted)]">Draw with your pointer or touch. You can also choose Type for keyboard input.</p>
                <canvas ref={canvasRef} aria-label="Draw your signature here" aria-describedby="signature-draw-help" data-signature-preview className="h-60 w-full touch-none rounded-lg border border-dashed border-[var(--color-line-2)] bg-white sm:h-72" style={{ touchAction: "none" }} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    <button type="button" aria-label="Undo last stroke" disabled={historyIndex < 0 || saving} onClick={undo} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-[var(--color-ink-2)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:bg-[var(--color-cream-2)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Undo2 size={14} aria-hidden="true" />Undo</button>
                    <button type="button" aria-label="Redo stroke" disabled={historyIndex >= historyLength - 1 || saving} onClick={redo} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-[var(--color-ink-2)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:bg-[var(--color-cream-2)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Redo2 size={14} aria-hidden="true" />Redo</button>
                    <button type="button" disabled={historyIndex < 0 || saving} onClick={clearCanvas} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-[var(--color-ink-2)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:bg-[var(--color-cream-2)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Eraser size={14} aria-hidden="true" />Clear</button>
                  </div>
                  <button type="button" disabled={saving || !canSave} onClick={saveDrawn} className="inline-flex min-h-10 min-w-[148px] items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-[13px] font-semibold text-[var(--pc-primary-text)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:brightness-95 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">{saving ? "Saving…" : <><Check size={15} aria-hidden="true" />Save signature</>}</button>
                </div>
              </div> : mode === "type" ? <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void saveTyped(); }}>
                <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-ink-2)]" htmlFor="signature-typed-name">Your name</label>
                <input id="signature-typed-name" name="signature" value={typedName} onChange={(event) => { setTypedName(event.target.value); setError(""); }} placeholder="Type your name…" autoComplete="name" maxLength={80} className="h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] px-3.5 text-[13px] text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]" />
                <fieldset className="mt-4">
                  <legend className="mb-2 text-[13px] font-medium text-[var(--color-ink-2)]">Choose a signature style</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Typed signature style">
                    {(Object.entries(TYPED_SIGNATURE_STYLES) as [TypedSignatureStyle, typeof selectedTypedStyle][]).map(([style, option]) => <label key={style} className={`flex min-w-0 cursor-pointer flex-col rounded-lg border p-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-forest)] ${typedStyle === style ? "border-[var(--color-blue-ink)] bg-[var(--color-blue-bg)]" : "border-[var(--color-line)] hover:bg-[var(--color-cream-2)]"}`}>
                      <span className="flex min-h-5 items-center gap-2 text-[13px] font-medium text-[var(--color-ink-2)]"><input type="radio" name="typed-signature-style" value={style} checked={typedStyle === style} onChange={() => { setTypedStyle(style); setError(""); }} className="accent-[var(--color-forest)]" />{option.label}</span>
                      <span className="mt-2 min-h-14 overflow-x-auto py-2 whitespace-nowrap text-[24px] leading-[1.5] text-[var(--color-ink)]" style={{ fontFamily: `"${option.family}", cursive`, fontWeight: option.weight }} aria-hidden="true">{typedName.trim() || "Your name"}</span>
                      <span className="text-[11px] text-[var(--color-muted)]">{option.description}</span>
                    </label>)}
                  </div>
                </fieldset>
                <div className="mt-4 rounded-lg border border-[var(--color-line)] bg-white px-4 py-3.5" data-signature-preview>
                  <p className="mb-2 text-[12px] font-medium text-[#475569]">Preview</p>
                  <div className="flex min-h-36 items-center overflow-x-auto" aria-live="polite" aria-label="Signature preview">
                    {typedPreview ? <Image
                      src={typedPreview.dataUrl}
                      alt={typedName.trim() || "Your name"}
                      width={Math.ceil(typedPreview.width * selectedTypedStyle.previewSize / selectedTypedStyle.size)}
                      height={Math.ceil(typedPreview.height * selectedTypedStyle.previewSize / selectedTypedStyle.size)}
                      unoptimized
                      className="block max-w-none shrink-0"
                    /> : <span className="text-[12px] text-[#475569]" role="status">{typedPreviewStatus === "error" ? "Couldn’t render the signature preview. Choose another style and try again." : "Preparing signature preview…"}</span>}
                  </div>
                </div>
                <p className="mt-2 min-h-5 text-[11px] text-[var(--color-muted)]" role="status" aria-live="polite">{fontStatus === "loading" ? "Loading signature style…" : fontStatus === "error" ? "This font could not be loaded. Try another style." : ""}</p>
                <div className="mt-2 flex justify-end"><button type="submit" disabled={saving || !canSave || !typedName.trim() || fontStatus !== "ready" || typedPreviewStatus !== "ready"} className="min-h-10 min-w-[148px] rounded-lg bg-[var(--color-forest)] px-4 text-[13px] font-semibold text-[var(--pc-primary-text)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:brightness-95 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">{saving ? "Saving…" : "Save signature"}</button></div>
              </form> : <div className="mt-4">
                <p className="mb-3 text-[14px] text-[var(--color-muted)]">Upload a clear image of your signature. It will be saved as a PNG.</p>
                <label htmlFor="signature-upload" className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-line-2)] px-4 text-[13px] font-medium text-[var(--color-ink-2)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-forest)] ${canSave ? "cursor-pointer hover:bg-[var(--color-cream-2)]" : "cursor-not-allowed opacity-50"}`}><Upload size={15} aria-hidden="true" />Choose image<input id="signature-upload" name="signature-upload" type="file" accept="image/*" disabled={!canSave} className="sr-only" onChange={(event) => upload(event.target.files?.[0])} /></label>
                <p className="mt-3 text-[11px] text-[var(--color-muted)]">PNG, JPEG, or WebP · up to 2 MB</p>
              </div>}
            </> : <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-cream)] p-4">
              <p className="text-[13px] font-medium text-[var(--color-ink)]">Your signature is saved for this policy.</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">Use Replace in the saved library to create a new mark.</p>
            </div>}
          </section>

          <section aria-labelledby="signature-library-heading" className="min-w-0 rounded-xl border border-[var(--color-line)] p-4 sm:p-5" data-signature-library>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 id="signature-library-heading" className="text-[13px] font-semibold text-[var(--color-ink)]">Saved signature</h4>
                <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">This mark is saved for this organization and policy.</p>
              </div>
              <span className={`shrink-0 text-[12px] font-semibold ${signature ? "text-[var(--color-blue-ink)]" : "text-[var(--color-muted)]"}`}>{signature ? "Saved" : "Empty"}</span>
            </div>
            {signature ? <>
              <div className="mt-4 flex min-h-40 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-white px-4 py-5" data-signature-preview>
                <Image src={signature.dataUrl} alt="Your saved signature" width={520} height={160} unoptimized className="block h-32 w-full max-w-[520px] object-contain sm:h-36" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" disabled={saving} onClick={() => { previousSignature.current = signature; setSignature(null); setAuthorSignatureApplied(false, null, "system"); setError(""); }} className="min-h-10 rounded-lg border border-[var(--color-line-2)] px-3.5 text-[13px] font-medium text-[var(--color-ink-2)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:bg-[var(--color-cream-2)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Replace</button>
                {confirmDelete ? <>
                  <span className="text-[12px] text-[var(--color-danger)]" role="status">Delete this saved signature?</span>
                  <button type="button" disabled={saving} onClick={() => void remove()} className="min-h-10 rounded-lg bg-[var(--color-danger)] px-3.5 text-[13px] font-medium text-[var(--pc-error-text)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:brightness-95 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]">Confirm delete</button>
                  <button type="button" disabled={saving} onClick={() => setConfirmDelete(false)} className="min-h-10 rounded-lg border border-[var(--color-line-2)] px-3.5 text-[13px] font-medium text-[var(--color-ink-2)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:bg-[var(--color-cream-2)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Cancel</button>
                </> : <button type="button" disabled={saving} onClick={() => setConfirmDelete(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-danger)] px-3.5 text-[13px] font-medium text-[var(--color-danger)] transition-[color,background-color,transform] duration-150 active:scale-[0.98] hover:bg-[var(--color-cream-2)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"><Trash2 size={15} aria-hidden="true" />Delete</button>}
              </div>
            </> : <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-line-2)] bg-[var(--color-cream)] px-5 py-6 text-center">
              <PenLine size={20} className="text-[var(--color-muted)]" aria-hidden="true" />
              <p className="mt-2 text-[12px] font-medium text-[var(--color-ink-2)]">No saved signature yet</p>
              <p className="mt-1 max-w-[260px] text-[12px] leading-5 text-[var(--color-muted)]">Choose Draw, Type, or Upload to add a reusable mark to this policy.</p>
            </div>}
          </section>
        </div>}

        {error ? <p className="text-[13px] text-[var(--color-danger)]" role="alert" aria-live="polite">{error}</p> : null}
        {!loading && <div className="border-t border-[var(--color-line)] pt-4">
          <label className={`flex min-h-11 items-start gap-3 rounded-lg px-2 py-2 text-[13px] ${canApply ? "text-[var(--color-ink-2)]" : "text-[var(--color-muted)]"}`}>
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-forest)]" checked={canApply && includeAuthorSignature} disabled={!canApply} onChange={toggleApply} />
            <span className="min-w-0"><span className="font-medium">Add my signature to this policy</span><span className="mt-1 block text-[12px] leading-5">{policy.showAcknowledgement === false ? "Enable the acknowledgement page to apply your signature." : !signature ? "Save a signature before applying it." : includeAuthorSignature && authorSignatureDate ? `Applies to this document · ${authorSignatureDate}` : "Your mark appears in the existing Signature field."}</span></span>
          </label>
          <p className="mt-1 pl-2 text-[11px] leading-5 text-[var(--color-muted)]">This is a visual signature mark and does not verify identity.</p>
        </div>}
      </div>
    </Panel>
  );
}
