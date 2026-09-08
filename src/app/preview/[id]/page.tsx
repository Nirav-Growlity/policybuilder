import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { PdfPolicyPreview as PolicyPreview } from "@/components/policy/pdf-policy-preview";
import { getUniversalTemplate } from "@/lib/document-templates";
import { isPreviewPolicyType, templatePreviewPolicy } from "@/lib/sample-policies";
import { POLICY_PROFILES } from "@/lib/constants";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ policyType?: string }>;
}

export default async function PreviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { policyType } = await searchParams;
  const template = getUniversalTemplate(id);
  if (!template) notFound();
  const activeType = isPreviewPolicyType(policyType) ? policyType : "environmental";
  const policy = templatePreviewPolicy(template.id, activeType);

  return (
    <main className="min-h-screen bg-[#f3eee3]">
      <header className="sticky top-0 z-10 glass border-b border-[var(--color-line)] px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/templates" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">
            <ArrowLeft size={14} /> Templates
          </Link>
          <span className="text-[var(--color-line-2)]">/</span>
          <span className="text-[12.5px] text-[var(--color-ink)] font-medium truncate">{template.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-line-2)] bg-white p-1" role="tablist" aria-label="Sample policy type">
            {Object.values(POLICY_PROFILES).map((profile) => (
              <Link
                key={profile.id}
                href={`/preview/${template.id}?policyType=${profile.id}`}
                role="tab"
                aria-selected={activeType === profile.id}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${activeType === profile.id ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-ink-2)] hover:bg-black/5"}`}
              >
                {profile.short}
              </Link>
            ))}
          </div>
          <Link
            href={`/builder?visualTemplate=${template.id}&type=${activeType}`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] text-[var(--color-ink)] text-[12.5px] font-medium hover:bg-[var(--color-cream-2)] transition-colors"
          >
            <FileText size={13} /> Use template
          </Link>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 lg:px-10 py-10">
        <PolicyPreview policy={policy} />
      </div>
    </main>
  );
}
