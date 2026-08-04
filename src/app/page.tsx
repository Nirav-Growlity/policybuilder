import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Globe2,
  ShieldCheck,
  FileText,
  Leaf,
  CheckCircle2,
  Building2,
  Award,
  BarChart3,
  ScrollText,
  Target,
  ListChecks,
  Users,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      {/* Top nav */}
      <header className="px-8 lg:px-14 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-forest)] to-[var(--color-forest-mid)] flex items-center justify-center shadow-[0_2px_8px_rgba(26,92,58,0.25)] group-hover:scale-105 transition-transform">
            <Leaf size={18} className="text-white" strokeWidth={2.2} />
          </div>
          <div>
            <div className="font-display text-[17px] font-semibold tracking-tight leading-none">PolicyCraft</div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-muted)] mt-1">Sustainability Suite</div>
          </div>
        </Link>
        <nav className="flex items-center gap-7 text-[13.5px] text-[var(--color-ink-2)]">
          <Link href="/templates" className="hover:text-[var(--color-forest)] transition-colors">Templates</Link>
          <a href="#how" className="hover:text-[var(--color-forest)] transition-colors">How it works</a>
          <a href="#standards" className="hover:text-[var(--color-forest)] transition-colors">Standards</a>
        </nav>
        <Link
          href="/builder"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[var(--color-ink)] text-[var(--color-cream)] text-[13px] font-medium hover:bg-[var(--color-forest-deep)] transition-colors"
        >
          Open builder <ArrowRight size={14} />
        </Link>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 60% at 20% 10%, rgba(26,92,58,0.10), transparent 60%), radial-gradient(50% 60% at 100% 0%, rgba(154,112,0,0.08), transparent 60%)",
          }}
        />
        <div className="max-w-7xl mx-auto px-8 lg:px-14 pt-16 lg:pt-24 pb-20 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-line-2)] bg-[var(--color-paper)]/70 backdrop-blur text-[11.5px] font-medium tracking-wide text-[var(--color-ink-2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-forest)] animate-pulse" />
              Environmental Policy · PoC
            </div>
            <h1 className="font-display text-[56px] lg:text-[80px] leading-[0.95] font-semibold tracking-[-0.03em] mt-6 text-[var(--color-ink)]">
              Author a <em className="text-[var(--color-forest)] not-italic">production-grade</em>
              <br /> environmental policy
              <br />
              <span className="text-[var(--color-muted)]">in under twenty minutes.</span>
            </h1>
            <p className="text-[17px] leading-[1.65] text-[var(--color-ink-2)] mt-7 max-w-xl">
              A guided, AI-assisted workbench for sustainability and EHS teams. Aligned with{" "}
              <span className="font-semibold text-[var(--color-ink)]">GRI, EcoVadis, BRSR, CSRD, ISO 14001</span> and the
              UN Sustainable Development Goals. Start from a curated template, drop in an existing .docx, or build from
              scratch.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/builder"
                className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-[var(--color-forest)] text-white text-[14.5px] font-semibold hover:bg-[var(--color-forest-deep)] transition-colors shadow-[0_8px_24px_rgba(26,92,58,0.25)]"
              >
                Start a new policy <ArrowRight size={16} />
              </Link>
              <Link
                href="/templates"
                className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-[var(--color-line-2)] bg-[var(--color-paper)] text-[var(--color-ink)] text-[14.5px] font-semibold hover:bg-[var(--color-cream-2)] transition-colors"
              >
                <FileText size={15} /> Browse templates
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-6 text-[12.5px] text-[var(--color-muted)]">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[var(--color-forest)]" /> Print-ready PDF
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[var(--color-forest)]" /> Editable Word
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[var(--color-forest)]" /> Auto SDG mapping
              </div>
            </div>
          </div>

          {/* Hero visual */}
          <div className="lg:col-span-5 animate-fade-up stagger-2">
            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-br from-[var(--color-forest-soft)] via-[var(--color-gold-soft)]/40 to-transparent rounded-[28px] blur-2xl opacity-60" />
              <div className="relative doc-card p-7 shadow-[var(--shadow-lift)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-forest)]" />
                    Live preview
                  </div>
                  <span className="font-mono text-[10.5px] text-[var(--color-muted)]">ASC-ENV-001 · Rev 01</span>
                </div>
                <h3 className="font-display text-[26px] font-semibold leading-tight mt-4 tracking-tight">
                  Environmental Policy
                </h3>
                <p className="text-[12.5px] text-[var(--color-muted)] mt-1">Acme Specialty Chemicals Pvt. Ltd.</p>
                <hr className="my-5 border-[var(--color-line)]" />
                <div className="space-y-3.5 text-[13px] leading-[1.65] text-[var(--color-ink-2)]">
                  <p>
                    <span className="font-display font-semibold text-[var(--color-forest-deep)]">Policy Declaration.</span>{" "}
                    Acme Specialty Chemicals affirms its commitment to protecting the environment, preventing pollution
                    and continually improving its environmental performance.
                  </p>
                  <div>
                    <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--color-forest)] mt-5 mb-2">
                      Key Focus Areas
                    </div>
                    <ul className="space-y-1.5 text-[12.5px]">
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--color-forest)] mt-0.5">▸</span> Energy Consumption & GHG Emissions
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--color-forest)] mt-0.5">▸</span> Water Stewardship
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--color-forest)] mt-0.5">▸</span> Waste Management & Circularity
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--color-forest)] mt-0.5">▸</span> Climate Risk & Emergency Preparedness
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-[var(--color-line)] flex items-center justify-between text-[11px] text-[var(--color-muted)] font-mono">
                  <span>Effective 15 Jan 2025</span>
                  <span>Next review 14 Jan 2027</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="editorial-rule max-w-6xl mx-auto" />

      {/* How it works */}
      <section id="how" className="max-w-7xl mx-auto px-8 lg:px-14 py-20">
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-forest)] mb-3">
              The workbench
            </div>
            <h2 className="font-display text-[40px] font-semibold leading-[1.05] tracking-tight">
              Eight steps. <br />
              <span className="text-[var(--color-muted)]">One publication-ready document.</span>
            </h2>
            <p className="text-[14px] text-[var(--color-ink-2)] mt-5 leading-[1.7] max-w-sm">
              Each step is informed by real environmental policy documents from leading manufacturing and
              pharmaceutical companies, distilled into opinionated defaults you can keep, edit or replace.
            </p>
          </div>
          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-4">
            {[
              { icon: Building2, title: "Company setup", desc: "Name, industry, site, document number, approver, dates." },
              { icon: ScrollText, title: "Declaration & scope", desc: "Preface, declaration and scope - with AI writing assist." },
              { icon: Target, title: "Key focus areas", desc: "Curated environmental topics you can edit or augment." },
              { icon: ListChecks, title: "Qualitative objectives", desc: "Per-focus-area commitment statements, AI-suggested." },
              { icon: BarChart3, title: "Quantitative targets", desc: "Measurable, time-bound targets with baselines and deadlines." },
              { icon: Globe2, title: "SDG alignment", desc: "Visual mapping to the 17 UN Sustainable Development Goals." },
              { icon: Users, title: "Responsibilities", desc: "Roles, duties, monitoring, and review mechanism." },
              { icon: FileText, title: "Preview & export", desc: "Live document preview, print-ready PDF and editable Word." },
            ].map(({ icon: I, title, desc }, i) => (
              <div
                key={title}
                className="doc-card p-5 hover:border-[var(--color-forest)]/40 hover:shadow-[var(--shadow-card)] transition-all duration-200"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)] flex items-center justify-center flex-shrink-0">
                    <I size={16} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-mono text-[var(--color-muted)]">Step {String(i + 1).padStart(2, "0")}</div>
                    <h3 className="font-display text-[15.5px] font-semibold mt-0.5">{title}</h3>
                    <p className="text-[12.5px] text-[var(--color-ink-2)] mt-1.5 leading-[1.6]">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="editorial-rule max-w-6xl mx-auto" />

      {/* Standards */}
      <section id="standards" className="max-w-7xl mx-auto px-8 lg:px-14 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-forest)] mb-3">
            Standards alignment
          </div>
          <h2 className="font-display text-[40px] font-semibold leading-[1.05] tracking-tight">
            Built to satisfy the frameworks your auditors care about.
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-[14.5px] text-[var(--color-ink-2)] font-medium">
          {["GRI", "EcoVadis", "CDP", "BRSR", "CSRD", "UNGC", "ISO 14001", "ISO 26000", "SA8000", "TCFD", "SBTi"].map(
            (s) => (
              <span key={s} className="font-display tracking-tight">
                {s}
              </span>
            )
          )}
        </div>
      </section>

      <div className="editorial-rule max-w-6xl mx-auto" />

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-8 lg:px-14 py-24 text-center">
        <Award className="mx-auto text-[var(--color-forest)]" size={36} strokeWidth={1.6} />
        <h2 className="font-display text-[48px] font-semibold leading-[1.05] tracking-tight mt-5">
          Ready when you are.
        </h2>
        <p className="text-[16px] text-[var(--color-ink-2)] mt-4 max-w-lg mx-auto leading-[1.65]">
          Open the builder, pick a template, or drop in an existing policy. We'll handle the structure, the AI, and
          the export.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <Link
            href="/builder"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-[var(--color-ink)] text-[var(--color-cream)] text-[14.5px] font-semibold hover:bg-[var(--color-forest-deep)] transition-colors"
          >
            Open the builder <ArrowRight size={16} />
          </Link>
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-[var(--color-line-2)] bg-[var(--color-paper)] text-[var(--color-ink)] text-[14.5px] font-semibold hover:bg-[var(--color-cream-2)] transition-colors"
          >
            <Sparkles size={15} /> Browse templates
          </Link>
        </div>
      </section>

      <footer className="border-t border-[var(--color-line)] py-8 text-center text-[12px] text-[var(--color-muted)]">
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck size={13} /> PolicyCraft PoC · Environmental Policy Builder
        </div>
      </footer>
    </main>
  );
}
