import { notFound } from "next/navigation";
import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { Leaf, ArrowLeft, Download, FileText, BookOpen } from "lucide-react";
import { PolicyPreview } from "@/components/policy/policy-preview";
import type { Policy } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getPolicyById(id: string): Promise<Policy | null> {
  try {
    const dir = path.join(process.cwd(), "data", "seed-policies");
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(dir, f), "utf-8");
      const data = JSON.parse(raw);
      if (data.id === id) {
        return data.policy as Policy;
      }
    }
  } catch (e) {
    console.error("preview load failed", e);
  }
  return null;
}

export default async function PreviewPage({ params }: PageProps) {
  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) notFound();

  return (
    <main className="min-h-screen bg-[#f3eee3]">
      <header className="sticky top-0 z-10 glass border-b border-[var(--color-line)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/templates" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">
            <ArrowLeft size={14} /> Templates
          </Link>
          <span className="text-[var(--color-line-2)]">/</span>
          <span className="text-[12.5px] text-[var(--color-ink)] font-medium truncate">{policy.company.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/builder?template=${id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] text-[var(--color-ink)] text-[12.5px] font-medium hover:bg-[var(--color-cream-2)] transition-colors"
          >
            <FileText size={13} /> Open in builder
          </Link>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 lg:px-10 py-10">
        <PolicyPreview policy={policy} />
      </div>
    </main>
  );
}
