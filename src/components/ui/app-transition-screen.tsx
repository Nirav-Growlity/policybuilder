"use client";

import "@fontsource-variable/instrument-sans/wdth.css";
import * as React from "react";
import { createPortal } from "react-dom";
import { Shield } from "lucide-react";
import styles from "./app-transition-screen.module.css";

type AppTransitionScreenProps = {
  /** What is happening, in a few words: "Opening your workspace". */
  title: string;
  /** Optional second line naming what is being checked or saved. */
  detail?: string;
  /** Cover the current page (sign-in, sign-out) instead of filling the page's own slot. */
  overlay?: boolean;
};

const LINES = [62, 100, 88, 94, 54];

/**
 * Full-screen handoff shown while a session or workspace is being prepared. A policy page
 * writes itself on the workspace's ruled background, following the light or dark theme.
 */
export function AppTransitionScreen({ title, detail, overlay = false }: AppTransitionScreenProps) {
  const mounted = React.useSyncExternalStore(() => () => undefined, () => true, () => false);
  const screen = <div className={styles.screen} data-overlay={overlay || undefined} aria-busy="true">
    <div className={styles.rules} aria-hidden="true" />
    <div className={styles.stack} role="status" aria-live="polite">
      <div className={styles.page} aria-hidden="true">
        <span className={styles.mark}><Shield size={13} strokeWidth={2.2} /></span>
        {LINES.map((width, index) => <span key={index} className={index === 0 ? `${styles.line} ${styles.lineHeading}` : styles.line} style={{ "--line-width": `${width}%`, "--line-index": index } as React.CSSProperties} />)}
      </div>
      <p className={styles.title}>{title}</p>
      {detail ? <p className={styles.detail}>{detail}</p> : null}
    </div>
  </div>;
  if (!overlay) return screen;
  return mounted ? createPortal(screen, document.body) : null;
}
