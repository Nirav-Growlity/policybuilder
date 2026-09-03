import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { PolicyPreview } from "@/components/policy/policy-preview";
import { getStarterTemplate } from "@/lib/starter-templates";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PreviewPage({ params }: PageProps) {
  const { id } = await params;
  const starter = getStarterTemplate(id);
  if (!starter) notFound();
  const policy = starter.policy;

  return (
    <main className="min-h-screen bg-[#f3eee3]">
      <header className="sticky top-0 z-10 glass border-b border-[var(--color-line)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/templates" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">
            <ArrowLeft size={14} /> Templates
          </Link>
          <span className="text-[var(--color-line-2)]">/</span>
          <span className="text-[12.5px] text-[var(--color-ink)] font-medium truncate">{starter.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/builder?template=${id}&type=${starter.policyType}`}
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
