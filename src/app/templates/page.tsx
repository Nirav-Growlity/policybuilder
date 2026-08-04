import Link from "next/link";
import { Leaf, ArrowRight, Building2, FileText, Sparkles } from "lucide-react";
import { promises as fs } from "node:fs";
import path from "node:path";

interface TemplateMeta {
  id: string;
  name: string;
  industry: string;
  summary: string;
  tagline: string;
}

async function getTemplates(): Promise<TemplateMeta[]> {
  try {
    const dir = path.join(process.cwd(), "data", "seed-policies");
    const files = await fs.readdir(dir);
    const items = await Promise.all(
      files.filter((f) => f.endsWith(".json")).map(async (f) => {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const data = JSON.parse(raw);
        return {
          id: data.id,
          name: data.name,
          industry: data.industry,
          summary: data.summary,
          tagline: data.tagline,
        } as TemplateMeta;
      })
    );
    return items;
  } catch {
    return [];
  }
}

export default async function TemplatesPage() {
  const templates = await getTemplates();
  return (
    <main className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
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
        <Link
          href="/builder"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[var(--color-ink)] text-[var(--color-cream)] text-[13px] font-medium hover:bg-[var(--color-forest-deep)] transition-colors"
        >
          Open builder <ArrowRight size={14} />
        </Link>
      </header>

      <section className="max-w-7xl mx-auto px-8 lg:px-14 pt-12 pb-8">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-forest)] mb-3">
          Curated templates
        </div>
        <h1 className="font-display text-[48px] lg:text-[64px] font-semibold leading-[0.98] tracking-[-0.025em]">
          Start from a real-world policy.
        </h1>
        <p className="text-[16px] text-[var(--color-ink-2)] mt-5 max-w-2xl leading-[1.65]">
          Hand-curated environmental policies from leading manufacturing and pharmaceutical companies. Pick a
          template, edit in the builder, export to PDF or Word.
        </p>
      </section>

      <section className="max-w-7xl mx-auto px-8 lg:px-14 py-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((t) => (
            <TemplateCard key={t.id} t={t} />
          ))}
        </div>
      </section>
    </main>
  );
}

function TemplateCard({ t }: { t: TemplateMeta }) {
  return (
    <Link
      href={`/builder?template=${t.id}`}
      className="group relative block doc-card p-7 hover:border-[var(--color-forest)]/40 hover:shadow-[var(--shadow-lift)] transition-all duration-300"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
          <Building2 size={18} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--color-muted)]">{t.tagline}</div>
          <h3 className="font-display text-[20px] font-semibold leading-tight mt-0.5">{t.name}</h3>
        </div>
      </div>
      <p className="text-[12.5px] text-[var(--color-ink-2)] leading-[1.65] mb-5 line-clamp-3">{t.summary}</p>
      <div className="flex items-center justify-between pt-4 border-t border-[var(--color-line)]">
        <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-muted)]">
          <FileText size={12} /> {t.industry}
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-forest)] group-hover:gap-2 transition-all">
          Use template <ArrowRight size={13} />
        </span>
      </div>
    </Link>
  );
}
