"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { PdfPages } from "@/components/policy/pdf-policy-preview";
import { PdfRenderLoader } from "@/components/policy/pdf-render-loader";
import previewStyles from "@/components/policy/pdf-policy-preview.module.css";
import { fetchManualPreview } from "@/lib/sop/client-api";
import type { SopManual } from "@/lib/sop/types";

type ViewState = { pageNumber: number; zoom: string; viewMode: "continuous" | "paged" };
type Rendered = { id: number; key: string; bytes: Uint8Array; pageCount: number };

/** The current SOP renders on its own in about 200 ms; wait for typing to pause first. */
export const SOP_PREVIEW_DEBOUNCE_MS = 500;

/**
 * Live PDF of the manual as edited (not yet saved): only one SOP's pages when
 * `sopId` is given, else the whole manual. The last good render stays on
 * screen while the next one is laid out, and pages paint lazily as they scroll in.
 */
export function SopPdfPreview({ orgId, manualId, manual, sopId, surface = "pane", debounceMs = SOP_PREVIEW_DEBOUNCE_MS }: {
  orgId: number;
  manualId: string;
  manual: SopManual;
  sopId?: string;
  surface?: "card" | "pane";
  debounceMs?: number;
}) {
  const key = React.useMemo(() => JSON.stringify({ sopId: sopId ?? null, manual }), [manual, sopId]);
  const [settledKey, setSettledKey] = React.useState(key);
  const [shown, setShown] = React.useState<Rendered | null>(null);
  const [pending, setPending] = React.useState<Rendered | null>(null);
  const [failure, setFailure] = React.useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [view, setView] = React.useState<ViewState>({ pageNumber: 1, zoom: "fit", viewMode: "continuous" });
  const nextId = React.useRef(1);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettledKey(key), shown ? debounceMs : 0);
    return () => window.clearTimeout(timer);
    // The first render goes out at once; later edits wait for a pause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, debounceMs]);

  // A different SOP starts at its first page.
  const [seenSop, setSeenSop] = React.useState(sopId);
  if (seenSop !== sopId) { setSeenSop(sopId); setView((current) => ({ ...current, pageNumber: 1 })); }

  React.useEffect(() => {
    if (shown?.key === settledKey && retry === 0) return;
    const controller = new AbortController();
    const requestKey = settledKey;
    const { manual: requested, sopId: requestedSop } = JSON.parse(requestKey) as { manual: SopManual; sopId: string | null };
    void fetchManualPreview(orgId, manualId, requested, { sopId: requestedSop ?? undefined, signal: controller.signal })
      .then(({ bytes, pageCount }) => {
        if (controller.signal.aborted) return;
        setPending({ id: nextId.current++, key: requestKey, bytes, pageCount });
        setFailure(null);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setFailure({ key: requestKey, message: cause instanceof Error ? cause.message : "Preview unavailable." });
      });
    return () => controller.abort();
    // `shown` is read only to skip a request that is already on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualId, orgId, retry, settledKey]);

  const updating = (pending !== null && pending.id !== shown?.id) || (settledKey !== shown?.key && !failure) || key !== settledKey;
  const results = [shown, pending].filter((item, index, list): item is Rendered => item !== null && list.findIndex((other) => other?.id === item.id) === index);
  const promote = (result: Rendered) => {
    if (pending?.id === result.id) { setShown(result); setPending(null); setRetry(0); }
  };

  return (
    <div className={`pdf-preview ${previewStyles.preview}`} data-surface={surface} aria-label={sopId ? "Preview of this SOP" : "Preview of the manual"} aria-busy={updating}>
      <p className="sr-only" role="status" aria-live="polite">{failure ? `Preview failed. ${failure.message}` : updating ? "Updating preview." : "Preview up to date."}</p>
      <div className="relative">
        {results.map((result) => {
          const visible = result.id === (shown?.id ?? null);
          return (
            <div key={result.id} className={visible ? "relative" : "invisible pointer-events-none absolute inset-x-0 top-0"} aria-hidden={!visible} inert={!visible}>
              <PdfPages
                bytes={result.bytes}
                view={view}
                onViewChange={setView}
                interactive={visible}
                status={failure ? "failed" : updating ? "updating" : "ready"}
                failureMessage={failure ? `${failure.message}${shown ? " Showing the previous version." : ""}` : null}
                onRetry={() => { setFailure(null); setRetry((value) => value + 1); }}
                onRendered={() => promote(result)}
                onError={() => setFailure({ key: result.key, message: "Could not display this PDF." })}
              />
            </div>
          );
        })}
        {!shown ? (
          <div className={previewStyles.loaderStage}>
            <PdfRenderLoader updating={false} still={Boolean(failure)} />
            {failure ? (
              <div className="-mt-4 flex flex-col items-center gap-3 px-6 pb-10 text-center">
                <p className="max-w-sm text-[12px] text-[var(--pc-error)]">{failure.message}</p>
                <button type="button" className={previewStyles.retryButton} onClick={() => { setFailure(null); setRetry((value) => value + 1); }}><RotateCw size={14} aria-hidden="true" />Retry preview</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
