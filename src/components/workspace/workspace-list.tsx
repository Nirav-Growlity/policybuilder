"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { WS_EASE } from "./workspace-motion";
import styles from "./workspace-ui.module.css";

export const LIST_PAGE_SIZE = 12;

/**
 * Renders a long list in batches. `resetKey` should describe the query (view,
 * filters, search); when it changes the list starts again from the first batch.
 */
export function useProgressiveList<T>(items: readonly T[], resetKey: string, pageSize = LIST_PAGE_SIZE) {
  const [state, setState] = React.useState({ key: resetKey, count: pageSize });
  let count = state.count;
  if (state.key !== resetKey) {
    count = pageSize;
    setState({ key: resetKey, count: pageSize });
  }
  const visible = React.useMemo(() => items.slice(0, count), [items, count]);
  const showMore = React.useCallback(() => {
    React.startTransition(() => setState((current) => ({ ...current, count: current.count + pageSize })));
  }, [pageSize]);
  return { visible, shown: visible.length, total: items.length, hasMore: count < items.length, showMore };
}

/**
 * End-of-list control: loads the next batch automatically as it nears the
 * viewport and keeps a button for keyboard and screen-reader users.
 */
export function ListFooter({ shown, total, hasMore, onMore, noun }: { shown: number; total: number; hasMore: boolean; onMore: () => void; noun: string }) {
  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onMore();
    }, { rootMargin: "480px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, onMore, shown]);
  if (total <= shown && total <= LIST_PAGE_SIZE) return null;
  return (
    <div ref={sentinel} className={styles.listFooter}>
      <p aria-live="polite">Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}</p>
      {hasMore ? <button type="button" className={styles.listMore} onClick={onMore}><ChevronDown size={15} aria-hidden="true" />Show more</button> : null}
    </div>
  );
}

/**
 * Splits a list into fixed pages. `resetKey` describes the query (view,
 * filters, search); when it changes the list returns to page one. The page is
 * clamped, so archiving the last row on a page lands on the previous page.
 */
export function usePagination<T>(items: readonly T[], resetKey: string, pageSize = 10) {
  const [state, setState] = React.useState({ key: resetKey, page: 1 });
  let requested = state.page;
  if (state.key !== resetKey) {
    requested = 1;
    setState({ key: resetKey, page: 1 });
  }
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requested, pageCount);
  const visible = React.useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  const setPage = React.useCallback((next: number) => {
    React.startTransition(() => setState((current) => ({ ...current, page: next })));
  }, []);
  return { page, pageCount, pageSize, visible, total: items.length, setPage, first: items.length ? (page - 1) * pageSize + 1 : 0, last: Math.min(page * pageSize, items.length) };
}

/** Page numbers around the current page, with gaps marked as null. */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount));
  const sorted = [...pages].sort((left, right) => left - right);
  return sorted.flatMap((value, index) => index > 0 && value - sorted[index - 1] > 1 ? [null, value] : [value]);
}

/**
 * Page controls for a paginated list. Changing page brings the top of the list
 * back into view when it has scrolled above the viewport.
 */
export function Pagination({ page, pageCount, first, last, total, noun, onChange, anchorId }: {
  page: number;
  pageCount: number;
  first: number;
  last: number;
  total: number;
  noun: string;
  onChange: (page: number) => void;
  anchorId?: string;
}) {
  if (total === 0) return null;
  const go = (next: number) => {
    if (next < 1 || next > pageCount || next === page) return;
    onChange(next);
    const anchor = anchorId ? document.getElementById(anchorId) : null;
    if (anchor && anchor.getBoundingClientRect().top < 72) {
      window.scrollTo({ top: window.scrollY + anchor.getBoundingClientRect().top - 84, behavior: "smooth" });
    }
  };
  return (
    <nav className={styles.pagination} aria-label={`${noun} pages`}>
      <p className={styles.paginationSummary} aria-live="polite">Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} {noun}</p>
      {pageCount > 1 ? (
        <div className={styles.paginationPages}>
          <button type="button" className={styles.pageStep} onClick={() => go(page - 1)} disabled={page === 1} aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /><span>Previous</span></button>
          {pageWindow(page, pageCount).map((value, index) => value === null
            ? <span key={`gap-${index}`} className={styles.pageGap} aria-hidden="true">…</span>
            : <button key={value} type="button" className={clsx(styles.pageNumber, value === page && styles.pageNumberCurrent)} aria-current={value === page ? "page" : undefined} aria-label={`Page ${value}`} onClick={() => go(value)}>
                {value === page ? <motion.span layoutId={`${noun}-page-marker`} className={styles.pageMarker} transition={{ type: "spring", stiffness: 520, damping: 40 }} aria-hidden="true" /> : null}
                <span>{value}</span>
              </button>)}
          <button type="button" className={styles.pageStep} onClick={() => go(page + 1)} disabled={page === pageCount} aria-label="Next page"><span>Next</span><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      ) : null}
    </nav>
  );
}

/** Tracks a media query, so pages can render one layout instead of two. */
export function useMediaQuery(query: string, serverValue = true) {
  return React.useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/**
 * Shows a loading view only when loading is actually slow. For the first
 * moment it holds the space quietly (still announcing "Loading" to screen
 * readers), so data that arrives quickly lands inside the page's own entrance
 * instead of after a skeleton flash: the page loads once, not twice.
 */
export function DelayedLoading({ children, delay = 450, label = "Loading…", minHeight = 320 }: { children: React.ReactNode; delay?: number; label?: string; minHeight?: number }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  if (!visible) return <div className={styles.loadingHold} style={{ minHeight }} role="status" aria-live="polite" aria-busy="true"><span className={styles.visuallyHidden}>{label}</span></div>;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: WS_EASE }}>
      {children}
    </motion.div>
  );
}

/**
 * Keeps the current results on screen while a new view or filter loads, so the
 * page never collapses into a spinner and back. New results crossfade in.
 */
export function ListRegion({ busy, contentKey, className, children }: { busy: boolean; contentKey: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx(styles.listRegion, className)} aria-busy={busy || undefined} data-busy={busy || undefined}>
      <span className={styles.listProgress} aria-hidden="true" />
      <motion.div
        key={contentKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: WS_EASE }}
      >
        {children}
      </motion.div>
    </div>
  );
}
