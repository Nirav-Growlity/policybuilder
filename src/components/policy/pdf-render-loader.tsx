import styles from "@/components/policy/pdf-render-loader.module.css";

type PdfRenderLoaderProps = { updating?: boolean; still?: boolean };

export function PdfRenderLoader({ updating = false, still = false }: PdfRenderLoaderProps) {
  return <div className={`${styles.loader} flex flex-col items-center justify-center px-6 py-10 text-center`} data-still={still || undefined}>
    <svg className={styles.stack} viewBox="0 0 160 166" fill="none" aria-hidden="true">
      <ellipse cx="80" cy="151" rx="48" ry="6" fill="#0f172a" opacity=".08" />
      <g className={styles.backPage}>
        <rect x="42" y="18" width="88" height="123" rx="6" fill="#f1f5f9" stroke="#cbd5e1" />
        <path d="M55 114h39M55 122h56" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className={styles.frontPage}>
        <rect x="30" y="13" width="88" height="123" rx="6" fill="white" stroke="#cbd5e1" strokeWidth="1.5" />
        <rect x="43" y="31" width="30" height="5" rx="2.5" fill="var(--pc-brand)" />
        <rect x="43" y="49" width="61" height="4" rx="2" fill="#94a3b8" />
        <rect x="43" y="59" width="49" height="4" rx="2" fill="#cbd5e1" />
        <path d="M43 75h62" stroke="#e2e8f0" strokeWidth="1.5" />
        <rect x="43" y="86" width="61" height="4" rx="2" fill="#94a3b8" />
        <rect x="43" y="96" width="53" height="4" rx="2" fill="#cbd5e1" />
        <rect x="43" y="106" width="58" height="4" rx="2" fill="#cbd5e1" />
        <rect x="43" y="116" width="37" height="4" rx="2" fill="#cbd5e1" />
      </g>
    </svg>
    <div className="mt-1">
      <p className="text-[20px] font-semibold text-[var(--pc-text)] sm:text-[22px]">{still ? "Preview unavailable" : updating ? "Updating document preview" : "Rendering your document"}</p>
      <p className="mt-1 text-[13px] text-[var(--pc-muted)]">{still ? "Use Retry preview to try again." : "Assembling your pages for preview."}</p>
    </div>
  </div>;
}
