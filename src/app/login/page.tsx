"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Leaf, Loader2, LockKeyhole } from "lucide-react";
import { signIn } from "@/lib/auth-client";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await signIn.email({ email: email.trim(), password });
    if (result.error) {
      setError(result.error.message || "Email or password is incorrect.");
      setSubmitting(false);
      return;
    }
    router.replace(safeNext(searchParams.get("next")));
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[var(--color-cream)] px-6 py-12 text-[var(--color-ink)]">
      <div className="mx-auto flex min-h-[75vh] max-w-md items-center justify-center">
        <section className="w-full rounded-3xl border border-[var(--color-line)] bg-white p-8 shadow-[var(--shadow-lift)]">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-forest)] text-white">
              <Leaf size={20} />
            </div>
            <div>
              <div className="font-display text-lg font-semibold">PolicyCraft</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Sustainability Suite</div>
            </div>
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">Use your existing ESG account. The ESG application does not need to be running.</p>
          <form className="mt-7 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-medium">
              Email
              <input className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm outline-none focus:border-[var(--color-forest)]" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm outline-none focus:border-[var(--color-forest)]" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-forest-deep)] disabled:cursor-wait disabled:opacity-70" type="submit" disabled={submitting}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting ? <ArrowRight size={16} /> : null}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

