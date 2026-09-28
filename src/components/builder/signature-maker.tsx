"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Eraser, PenLine, Redo2, Trash2, Type, Undo2, Upload } from "lucide-react";
import SignaturePad, { type PointGroup } from "signature_pad";
import { useBuilder } from "@/lib/store";
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
  const { policy, includeAuthorSignature, authorSignatureChoiceMade, authorSignatureDate, setAuthorSignatureApplied, setAuthorSignatureUpdatedAt } = useBuilder();
  const [signature, setSignature] = React.useState<SignatureRecord | null>(null);
  const [mode, setMode] = React.useState<SignatureMode>("draw");
  const [typedName, setTypedName] = React.useState("");
  const [typedStyle, setTypedStyle] = React.useState<TypedSignatureStyle>("allura");
  const [typedPreviewResult, setTypedPreviewResult] = React.useState<{ key: string; artwork?: TypedSignatureArtwork; status: "ready" | "error" } | null>(null);
  const [fontStatus, setFontStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [loading, setLoading] = React.useState(true);
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
  const canApply = policy.showAcknowledgement !== false && signature !== null;
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
    void fetch("/api/policycraft/signatures/me", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseMessage(body, "Could not load your saved signature."));
        setSignature(body?.signature ?? null);
        setAuthorSignatureUpdatedAt(body?.signature?.updatedAt ? `${body.userId}:${body.signature.updatedAt}` : null);
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load your saved signature."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [setAuthorSignatureUpdatedAt]);

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
    const replacing = previousSignature.current !== null;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/policycraft/signatures/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "Could not save your signature."));
      setSignature(body?.signature ?? { dataUrl, updatedAt: new Date().toISOString() });
      previousSignature.current = null;
      setAuthorSignatureUpdatedAt(`${body?.userId ?? "current"}:${body?.signature?.updatedAt ?? new Date().toISOString()}`);
      if (replacing) {
        setAuthorSignatureApplied(includeAuthorSignature, includeAuthorSignature ? localDate() : null, "system");
      } else {
        setAuthorSignatureApplied(true, localDate(), "automatic");
      }
    } catch (cause) {
      if (previousSignature.current) {
        setSignature(previousSignature.current);
        previousSignature.current = null;
      }
      setError(cause instanceof Error ? cause.message : "Could not save your signature.");
    } finally { setSaving(false); }
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
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/policycraft/signatures/me", { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "Could not delete your saved signature."));
      setSignature(null); setConfirmDelete(false); setAuthorSignatureApplied(false, null, "system"); setAuthorSignatureUpdatedAt(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete your saved signature."); }
    finally { setSaving(false); }
  };
  const toggleApply = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAuthorSignatureApplied(event.target.checked, event.target.checked ? localDate() : null, "user");
  };

  return (
    <Panel
      title="Policy author signature"
      description="Save one personal mark, then choose whether to include it on this policy."
      icon={<PenLine size={17} strokeWidth={1.8} aria-hidden="true" />}
    >

      {loading ? <p className="mt-4 text-[12px] text-[var(--color-muted)]" role="status">Loading saved signature…</p> : signature ? <div className="mt-4 flex flex-wrap items-center gap-3">
        <Image src={signature.dataUrl} alt="Your saved signature" width={220} height={56} unoptimized className="h-14 max-w-[220px] rounded border border-[var(--color-line)] object-contain p-2" />
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { previousSignature.current = signature; setSignature(null); setAuthorSignatureApplied(false, null, "system"); setError(""); }} className="rounded-md border border-[var(--color-line-2)] px-3 py-2 text-[12px] font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Replace</button>{confirmDelete ? <><span className="self-center text-[11px] text-red-800">Delete this saved signature?</span><button type="button" disabled={saving} onClick={() => void remove()} className="rounded-md bg-red-700 px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">Confirm delete</button><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-[var(--color-line-2)] px-3 py-2 text-[12px] font-medium text-[var(--color-ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Cancel</button></> : <button type="button" disabled={saving} onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-[12px] font-medium text-red-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"><Trash2 size={14} aria-hidden="true" />Delete</button>}</div>
      </div> : <>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Signature input method">
          {(["draw", "type", "upload"] as const).map((choice) => <button key={choice} type="button" aria-pressed={mode === choice} onClick={() => { setMode(choice); setError(""); }} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] ${mode === choice ? "bg-[var(--color-forest)] text-white" : "border border-[var(--color-line-2)] text-[var(--color-ink-2)]"}`}>
            {choice === "draw" ? <PenLine size={14} aria-hidden="true" /> : choice === "type" ? <Type size={14} aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}{choice[0].toUpperCase() + choice.slice(1)}
          </button>)}
        </div>
        {mode === "draw" ? <div className="mt-3">
          <p id="signature-draw-help" className="mb-2 text-[11px] text-[var(--color-muted)]">Draw with your pointer or touch. You can also choose Type for keyboard input.</p>
          <canvas ref={canvasRef} aria-label="Draw your signature here" aria-describedby="signature-draw-help" className="h-60 w-full touch-none rounded-md border border-dashed border-[var(--color-line-2)] bg-[#fffefa] sm:h-72" style={{ touchAction: "none" }} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="flex gap-1"><button type="button" aria-label="Undo last stroke" disabled={historyIndex < 0 || saving} onClick={undo} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Undo2 size={13} aria-hidden="true" />Undo</button><button type="button" aria-label="Redo stroke" disabled={historyIndex >= historyLength - 1 || saving} onClick={redo} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Redo2 size={13} aria-hidden="true" />Redo</button><button type="button" disabled={historyIndex < 0 || saving} onClick={clearCanvas} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Eraser size={13} aria-hidden="true" />Clear</button></div><button type="button" disabled={saving} onClick={saveDrawn} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-forest)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">{saving ? "Saving…" : <><Check size={14} aria-hidden="true" />Save signature</>}</button></div>
        </div> : mode === "type" ? <form className="mt-3" onSubmit={(event) => { event.preventDefault(); void saveTyped(); }}>
          <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-ink-2)]" htmlFor="signature-typed-name">Your name</label>
          <input id="signature-typed-name" name="signature" value={typedName} onChange={(event) => { setTypedName(event.target.value); setError(""); }} placeholder="Type your name…" autoComplete="name" maxLength={80} className="w-full rounded-md border border-[var(--color-line-2)] px-3 py-2 text-[13px] text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]" />
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-[11px] font-medium text-[var(--color-ink-2)]">Choose a signature style</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Typed signature style">
              {(Object.entries(TYPED_SIGNATURE_STYLES) as [TypedSignatureStyle, typeof selectedTypedStyle][]).map(([style, option]) => <label key={style} className={`flex min-w-0 cursor-pointer flex-col rounded-md border px-2.5 py-2 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-forest)] ${typedStyle === style ? "border-[var(--color-forest)] bg-[var(--color-cream-2)]" : "border-[var(--color-line-2)] hover:bg-[var(--color-cream-2)]"}`}>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-ink-2)]"><input type="radio" name="typed-signature-style" value={style} checked={typedStyle === style} onChange={() => { setTypedStyle(style); setError(""); }} className="accent-[var(--color-forest)]" />{option.label}</span>
                <span className="mt-1 min-h-14 overflow-x-auto py-2 whitespace-nowrap text-[24px] leading-[1.5] text-[var(--color-ink)]" style={{ fontFamily: `"${option.family}", cursive`, fontWeight: option.weight }} aria-hidden="true">{typedName.trim() || "Your name"}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{option.description}</span>
              </label>)}
            </div>
          </fieldset>
          <div className="mt-3 rounded-md border border-[var(--color-line)] bg-[#fffefa] px-3 py-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">Preview</p>
            <div className="flex min-h-28 items-center overflow-x-auto" aria-live="polite" aria-label="Signature preview">
              {typedPreview ? <Image
                src={typedPreview.dataUrl}
                alt={typedName.trim() || "Your name"}
                width={Math.ceil(typedPreview.width * selectedTypedStyle.previewSize / selectedTypedStyle.size)}
                height={Math.ceil(typedPreview.height * selectedTypedStyle.previewSize / selectedTypedStyle.size)}
                unoptimized
                className="block max-w-none shrink-0"
              /> : <span className="text-[11px] text-[var(--color-muted)]" role="status">{typedPreviewStatus === "error" ? "Couldn’t render the signature preview. Choose another style and try again." : "Preparing signature preview…"}</span>}
            </div>
          </div>
          <p className="mt-1.5 min-h-4 text-[10px] text-[var(--color-muted)]" role="status" aria-live="polite">{fontStatus === "loading" ? "Loading signature style…" : fontStatus === "error" ? "This font could not be loaded. Try another style." : ""}</p>
          <div className="mt-2 flex justify-end"><button type="submit" disabled={saving || !typedName.trim() || fontStatus !== "ready" || typedPreviewStatus !== "ready"} className="rounded-md bg-[var(--color-forest)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">{saving ? "Saving…" : "Save signature"}</button></div>
        </form> : <div className="mt-3"><label htmlFor="signature-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--color-line-2)] px-3 py-2 text-[12px] font-medium text-[var(--color-ink-2)]"><Upload size={14} aria-hidden="true" />Choose image</label><input id="signature-upload" type="file" accept="image/*" className="sr-only" onChange={(event) => upload(event.target.files?.[0])} /></div>}
      </>}

      {error ? <p className="mt-3 text-[12px] text-red-800" role="alert" aria-live="polite">{error}</p> : null}
      {!loading && <div className="mt-4 border-t border-[var(--color-line)] pt-4">
        <label className={`flex items-start gap-2.5 text-[12px] ${canApply ? "text-[var(--color-ink-2)]" : "text-[var(--color-muted)]"}`}>
          <input type="checkbox" className="mt-0.5 accent-[var(--color-forest)]" checked={includeAuthorSignature} disabled={!canApply} onChange={toggleApply} />
          <span><span className="font-medium">Add my signature to this policy</span><span className="mt-0.5 block text-[11px] leading-4">{policy.showAcknowledgement === false ? "Enable the acknowledgement page to apply your signature." : !signature ? "Save a signature before applying it." : includeAuthorSignature && authorSignatureDate ? `Applies to this document · ${authorSignatureDate}` : "Your mark appears in the existing Signature field."}</span></span>
        </label>
        <p className="mt-2 text-[10px] leading-4 text-[var(--color-muted)]">This is a visual signature mark and does not verify identity.</p>
      </div>}
    </Panel>
  );
}
