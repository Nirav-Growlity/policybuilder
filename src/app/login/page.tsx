"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Leaf } from "lucide-react";
import { LoginScene } from "@/components/auth/login-scene";
import { ApplicationSurface } from "@/components/ui/application-surface";
import styles from "./page.module.css";

// Hard loads and shared links land here. From the home page the sheet opens in place instead.
export default function LoginPage() {
  return (
    <ApplicationSurface className={styles.surface}>
      <a className={styles.skipLink} href="#login-main">Skip to sign in</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="PolicyCraft home">
            <span className={styles.brandMark}><Leaf size={17} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className={styles.brandText}><strong>PolicyCraft</strong><small>Sustainability Suite</small></span>
          </Link>
          <Link href="/" className={styles.backLink}><ArrowLeft size={14} aria-hidden="true" />Back to home</Link>
        </div>
      </header>
      <main id="login-main" aria-label="Sign in">
        <React.Suspense fallback={null}>
          <LoginScene variant="page" />
        </React.Suspense>
      </main>
    </ApplicationSurface>
  );
}
