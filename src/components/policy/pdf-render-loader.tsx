type PdfRenderLoaderProps = { updating?: boolean; still?: boolean };

export function PdfRenderLoader({ updating = false, still = false }: PdfRenderLoaderProps) {
  return <div className="pdf-render-loader flex flex-col items-center justify-center px-6 py-10 text-center" data-still={still || undefined}>
    <svg className="h-[clamp(230px,30vw,320px)] w-[clamp(230px,30vw,320px)]" viewBox="0 0 160 166" fill="none" aria-hidden="true">
      <ellipse cx="80" cy="151" rx="48" ry="6" fill="#153d29" opacity=".08" />
      <g className="pdf-render-back-page">
        <rect x="42" y="18" width="88" height="123" rx="6" fill="#e7eee7" stroke="#d3e0d5" />
        <path d="M55 114h39M55 122h56" stroke="#c6d5c9" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="pdf-render-front-page">
        <rect x="30" y="13" width="88" height="123" rx="6" fill="white" stroke="#cfded2" strokeWidth="1.5" />
        <rect x="43" y="31" width="30" height="5" rx="2.5" fill="#174b32" />
        <rect className="pdf-render-line" x="43" y="49" width="61" height="4" rx="2" fill="#a5bbaa" />
        <rect className="pdf-render-line pdf-render-line-two" x="43" y="59" width="49" height="4" rx="2" fill="#d0dcd1" />
        <path d="M43 75h62" stroke="#e2eae2" strokeWidth="1.5" />
        <rect className="pdf-render-line pdf-render-line-three" x="43" y="86" width="61" height="4" rx="2" fill="#a5bbaa" />
        <rect className="pdf-render-line pdf-render-line-four" x="43" y="96" width="53" height="4" rx="2" fill="#d0dcd1" />
        <rect className="pdf-render-line pdf-render-line-five" x="43" y="106" width="58" height="4" rx="2" fill="#d0dcd1" />
        <rect className="pdf-render-line pdf-render-line-six" x="43" y="116" width="37" height="4" rx="2" fill="#d0dcd1" />
        <path className="pdf-render-sweep" d="M29 32l35-19h20L29 100z" fill="url(#pdf-render-sweep-gradient)" />
      </g>
      <defs><linearGradient id="pdf-render-sweep-gradient" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#8bbb9a" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
    </svg>
    <div className="mt-1">
      <p className="font-display text-[20px] font-semibold text-[var(--color-ink)] sm:text-[22px]">{still ? "Preview unavailable" : updating ? "Updating document preview" : "Rendering your document"}</p>
      <p className="mt-1 text-[13px] text-[var(--color-muted)]">{still ? "Use Retry preview to try again." : "Assembling your pages for preview."}</p>
    </div>
    <style>{`
      @keyframes pdfRenderFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
      @keyframes pdfRenderLine { 0%, 12% { transform: scaleX(.32); opacity: .42 } 48%, 100% { transform: scaleX(1); opacity: 1 } }
      @keyframes pdfRenderSweep { 0%, 20% { transform: translateX(-36px); opacity: 0 } 30% { opacity: 1 } 65%, 100% { transform: translateX(105px); opacity: 0 } }
      .pdf-render-loader:not([data-still]) .pdf-render-front-page { transform-box: fill-box; transform-origin: center; animation: pdfRenderFloat 4s ease-in-out .18s infinite backwards; }
      .pdf-render-loader:not([data-still]) .pdf-render-back-page { transform-box: fill-box; transform-origin: center; animation: pdfRenderFloat 4s ease-in-out .18s infinite reverse backwards; }
      .pdf-render-loader:not([data-still]) .pdf-render-line { transform-box: fill-box; transform-origin: left center; animation: pdfRenderLine 2.8s cubic-bezier(.2,.7,.2,1) .18s infinite backwards; }
      .pdf-render-loader:not([data-still]) .pdf-render-line-two { animation-delay: .32s; }
      .pdf-render-loader:not([data-still]) .pdf-render-line-three { animation-delay: .46s; }
      .pdf-render-loader:not([data-still]) .pdf-render-line-four { animation-delay: .6s; }
      .pdf-render-loader:not([data-still]) .pdf-render-line-five { animation-delay: .74s; }
      .pdf-render-loader:not([data-still]) .pdf-render-line-six { animation-delay: .88s; }
      .pdf-render-loader:not([data-still]) .pdf-render-sweep { transform-box: fill-box; transform-origin: center; animation: pdfRenderSweep 3.4s ease-in-out .18s infinite backwards; }
      @media (prefers-reduced-motion: reduce) { .pdf-render-loader :is(.pdf-render-front-page, .pdf-render-back-page, .pdf-render-line, .pdf-render-sweep) { animation: none !important; } .pdf-render-sweep { opacity: 0; } }
    `}</style>
  </div>;
}
