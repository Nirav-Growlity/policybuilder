"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Eraser, PenLine, Trash2, Type, Upload } from "lucide-react";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";

type SignatureRecord = { dataUrl: string; updatedAt: string };
type SignatureMode = "draw" | "type" | "upload";

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function responseMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return fallback;
}

export function SignatureMaker() {
  const { policy, includeAuthorSignature, authorSignatureChoiceMade, authorSignatureDate, setAuthorSignatureApplied, setAuthorSignatureUpdatedAt } = useBuilder();
  const [signature, setSignature] = React.useState<SignatureRecord | null>(null);
  const [mode, setMode] = React.useState<SignatureMode>("draw");
  const [typedName, setTypedName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const previousSignature = React.useRef<SignatureRecord | null>(null);
  const drawing = React.useRef(false);
  const canApply = policy.showAcknowledgement !== false && signature !== null;

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

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    return { context, x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const p = point(event);
    if (!p) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    p.context.beginPath(); p.context.moveTo(p.x, p.y);
  };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = point(event);
    if (!p) return;
    p.context.lineTo(p.x, p.y); p.context.stroke();
  };
  const stopDrawing = () => { drawing.current = false; };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const makeTypedImage = (): string => {
    const canvas = document.createElement("canvas");
    canvas.width = 900; canvas.height = 200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create the signature image.");
    context.fillStyle = "#17211b";
    context.font = 'italic 76px "Segoe Script", "Brush Script MT", cursive';
    context.textBaseline = "middle";
    context.fillText(typedName.trim(), 24, 100, 850);
    return canvas.toDataURL("image/png");
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0) !== true) {
      setError("Draw your signature before saving."); return;
    }
    void save(canvas.toDataURL("image/png"));
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
          <canvas ref={canvasRef} width={720} height={160} aria-label="Draw your signature here" aria-describedby="signature-draw-help" className="h-28 w-full touch-none rounded-md border border-dashed border-[var(--color-line-2)] bg-[#fffefa]" style={{ touchAction: "none" }} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} />
          <div className="mt-2 flex justify-between"><button type="button" onClick={clearCanvas} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--color-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Eraser size={13} aria-hidden="true" />Clear</button><button type="button" disabled={saving} onClick={saveDrawn} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-forest)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">{saving ? "Saving…" : <><Check size={14} aria-hidden="true" />Save signature</>}</button></div>
        </div> : mode === "type" ? <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (typedName.trim()) void save(makeTypedImage()); }}>
          <label className="sr-only" htmlFor="signature-typed-name">Type your signature</label><input id="signature-typed-name" name="signature" value={typedName} onChange={(event) => setTypedName(event.target.value)} placeholder="Type your name…" autoComplete="name" className="min-w-0 flex-1 rounded-md border border-[var(--color-line-2)] px-3 py-2 text-[13px] text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]" />
          <button type="submit" disabled={saving || !typedName.trim()} className="rounded-md bg-[var(--color-forest)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">{saving ? "Saving…" : "Save signature"}</button>
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
