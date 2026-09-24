"use client";

export function AICoverGenerationLoader() {
  return (
    <div className="absolute inset-0 z-20 flex min-h-full w-full flex-col items-center justify-center overflow-hidden bg-[#f4f7f3] px-6 py-10 text-center" aria-label="AI cover generation in progress" aria-busy="true">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[min(72vh,680px)] w-[min(72vh,680px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(45,138,94,.13)_0%,rgba(45,138,94,0)_70%)]" />
      <svg className="cover-loader-illustration relative z-10" width="330" height="285" viewBox="0 0 220 190" role="presentation" aria-hidden="true">
        <defs>
          <radialGradient id="cover-loader-aura"><stop stopColor="#dceade" stopOpacity=".9" /><stop offset="1" stopColor="#f4f7f3" stopOpacity="0" /></radialGradient>
          <linearGradient id="cover-loader-artwork" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#103822" /><stop offset="1" stopColor="#2d8a5e" /></linearGradient>
          <linearGradient id="cover-loader-gloss"><stop stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <clipPath id="cover-loader-art-clip"><rect x="67" y="29" width="86" height="65" rx="4" /></clipPath>
        </defs>
        <ellipse cx="110" cy="94" rx="94" ry="88" fill="url(#cover-loader-aura)" className="cover-loader-halo" />
        <ellipse cx="112" cy="164" rx="48" ry="6" fill="#183d2b" opacity=".1" />
        <g className="cover-loader-back"><rect x="66" y="20" width="100" height="137" rx="7" fill="#e8eee7" stroke="#d8e2d8" /><path d="M79 139h42" stroke="#d2ddd3" strokeWidth="2" strokeLinecap="round" /></g>
        <g className="cover-loader-page">
          <rect x="58" y="16" width="100" height="140" rx="7" fill="#fff" stroke="#dce5dc" />
          <rect x="65" y="23" width="86" height="72" rx="5" fill="url(#cover-loader-artwork)" />
          <g clipPath="url(#cover-loader-art-clip)">
            <circle cx="139" cy="43" r="29" fill="none" stroke="#fff" strokeOpacity=".22" />
            <circle cx="139" cy="43" r="21" fill="#c6a85a" />
            <path d="M61 90c18-29 35-24 50-14 11 7 21 7 45-5v29H61z" fill="#4a966d" />
            <path d="M70 82h22" stroke="#fff" strokeOpacity=".72" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M70 87h38" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <path className="cover-loader-sweep" d="M78 22h15l-31 75H47z" fill="url(#cover-loader-gloss)" />
          </g>
          <rect x="68" y="103" width="22" height="3" rx="1.5" fill="#c6a85a" />
          <rect className="cover-loader-rule" x="68" y="112" width="64" height="5" rx="2.5" fill="#244c38" />
          <rect className="cover-loader-rule" x="68" y="121" width="49" height="3" rx="1.5" fill="#dce5dd" style={{ animationDelay: "140ms" }} />
          <path d="M68 132h80" stroke="#edf0eb" />
          <rect className="cover-loader-rule" x="68" y="138" width="56" height="3" rx="1.5" fill="#dce5dd" style={{ animationDelay: "280ms" }} />
          <rect className="cover-loader-rule" x="68" y="145" width="43" height="3" rx="1.5" fill="#dce5dd" style={{ animationDelay: "420ms" }} />
        </g>
        <path className="cover-loader-glint" d="M171 34v8m-4-4h8" stroke="#a77b16" strokeWidth="1.5" strokeLinecap="round" />
        <circle className="cover-loader-glint cover-loader-glint-late" cx="45" cy="132" r="2" fill="#2d8a5e" />
      </svg>
      <div className="relative z-10 mt-1" role="status" aria-live="polite">
        <p className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--color-forest)]"><span className="cover-loader-status-dot h-1.5 w-1.5 rounded-full bg-[var(--color-forest-mid)]" />PolicyCraft · Cover studio</p>
        <h2 className="mt-2 font-display text-[24px] font-semibold leading-tight text-[var(--color-ink)] sm:text-[28px]">Creating your AI cover</h2>
        <p className="mt-2 text-[13px] text-[var(--color-muted)]">Laying out your policy details and artwork.</p>
      </div>
      <style>{`
        @keyframes policyCoverFloat { 0%, 100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-5px) rotate(1deg); } }
        @keyframes policyCoverGlow { 0%, 100% { opacity: .55; transform: scale(.94); } 50% { opacity: .95; transform: scale(1.06); } }
        @keyframes policyCoverSweep { 0%, 18% { transform: translateX(0) skewX(-18deg); opacity: 0; } 26% { opacity: 1; } 54%, 100% { transform: translateX(155px) skewX(-18deg); opacity: 0; } }
        @keyframes policyCoverRule { 0%, 12% { transform: scaleX(.15); opacity: .35; } 38%, 100% { transform: scaleX(1); opacity: 1; } }
        @keyframes policyCoverGlint { 0%, 22%, 100% { opacity: .25; transform: scale(.7); } 38%, 58% { opacity: 1; transform: scale(1.2); } }
        @keyframes policyCoverDot { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
        .cover-loader-illustration { display: block; width: min(330px, 72vw); height: auto; overflow: visible; }
        .cover-loader-page { transform-box: fill-box; transform-origin: center; animation: policyCoverFloat 4.8s ease-in-out infinite; }
        .cover-loader-back { transform-box: fill-box; transform-origin: center; animation: policyCoverFloat 4.8s ease-in-out infinite reverse; }
        .cover-loader-halo { transform-box: fill-box; transform-origin: center; animation: policyCoverGlow 4.8s ease-in-out infinite; }
        .cover-loader-sweep { transform-box: fill-box; transform-origin: center; animation: policyCoverSweep 3.6s ease-in-out infinite; }
        .cover-loader-rule { transform-box: fill-box; transform-origin: left center; animation: policyCoverRule 2.8s cubic-bezier(.2,.7,.2,1) infinite; }
        .cover-loader-glint { transform-box: fill-box; transform-origin: center; animation: policyCoverGlint 2.8s ease-in-out infinite; }
        .cover-loader-glint-late { animation-delay: .8s; }
        .cover-loader-status-dot { animation: policyCoverDot 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .cover-loader-page, .cover-loader-back, .cover-loader-halo, .cover-loader-sweep, .cover-loader-rule, .cover-loader-glint, .cover-loader-status-dot { animation: none; } }
      `}</style>
    </div>
  );
}
