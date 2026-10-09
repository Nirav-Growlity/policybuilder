"use client";

export function AICoverGenerationLoader() {
  return (
    <div data-ai-cover-loader role="region" style={{ fontFamily: "var(--pc-font)" }} className="absolute inset-0 z-20 flex min-h-full w-full flex-col items-center justify-center overflow-auto bg-[var(--pc-page)] px-6 py-8 text-center text-[var(--pc-text)]" aria-label="AI cover generation in progress" aria-busy="true">
      <svg className="cover-loader-illustration relative z-10" width="330" height="285" viewBox="0 0 220 190" role="presentation" aria-hidden="true">
        <rect x="66" y="20" width="100" height="137" rx="7" fill="var(--pc-inset)" stroke="var(--pc-divider)" />
        <g data-ai-cover-page className="cover-loader-page">
          <rect x="58" y="16" width="100" height="140" rx="7" fill="var(--pc-panel)" stroke="var(--pc-control)" />
          <rect x="65" y="23" width="86" height="72" rx="5" fill="var(--pc-selection)" />
          <circle cx="131" cy="46" r="20" fill="var(--pc-ai)" opacity=".7" />
          <path d="M65 88c18-29 35-24 50-14 11 7 21 7 36-5v26H65z" fill="var(--pc-primary)" opacity=".82" />
          <rect x="68" y="103" width="22" height="3" rx="1.5" fill="var(--pc-control)" />
          <rect className="cover-loader-rule cover-loader-rule--one" x="68" y="112" width="64" height="5" rx="2.5" fill="var(--pc-text)" />
          <rect className="cover-loader-rule cover-loader-rule--two" x="68" y="121" width="49" height="3" rx="1.5" fill="var(--pc-muted)" />
          <path d="M68 132h80" stroke="var(--pc-divider)" />
          <rect className="cover-loader-rule cover-loader-rule--three" x="68" y="138" width="56" height="3" rx="1.5" fill="var(--pc-muted)" />
          <rect className="cover-loader-rule cover-loader-rule--four" x="68" y="145" width="43" height="3" rx="1.5" fill="var(--pc-muted)" />
        </g>
      </svg>
      <div className="relative z-10 mt-2" role="status" aria-live="polite">
        <p className="text-[13px] font-semibold uppercase tracking-[.12em] text-[var(--pc-muted)]">PolicyCraft · Cover studio</p>
        <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[var(--pc-text)]">Creating your AI cover</h2>
        <p className="mt-2 text-[14px] text-[var(--pc-muted)]">Laying out your policy details and artwork.</p>
      </div>
      <style>{`
        @keyframes coverLoaderLineReveal {
          0% { opacity: .25; transform: scaleX(.16); }
          18%, 100% { opacity: 1; transform: scaleX(1); }
        }
        .cover-loader-illustration { display: block; width: min(330px, 72vw); height: auto; overflow: visible; }
        .cover-loader-rule { transform-box: fill-box; transform-origin: left center; animation-duration: 2.4s; animation-timing-function: cubic-bezier(.2,.7,.2,1); animation-iteration-count: 2; animation-fill-mode: both; }
        .cover-loader-rule--one { animation-name: coverLoaderLineRevealOne; }
        .cover-loader-rule--two { animation-name: coverLoaderLineRevealTwo; }
        .cover-loader-rule--three { animation-name: coverLoaderLineRevealThree; }
        .cover-loader-rule--four { animation-name: coverLoaderLineRevealFour; }
        @keyframes coverLoaderLineRevealOne { 0%, 4% { opacity: .25; transform: scaleX(.16); } 18%, 100% { opacity: 1; transform: scaleX(1); } }
        @keyframes coverLoaderLineRevealTwo { 0%, 8% { opacity: .25; transform: scaleX(.16); } 22%, 100% { opacity: 1; transform: scaleX(1); } }
        @keyframes coverLoaderLineRevealThree { 0%, 12% { opacity: .25; transform: scaleX(.16); } 26%, 100% { opacity: 1; transform: scaleX(1); } }
        @keyframes coverLoaderLineRevealFour { 0%, 16% { opacity: .25; transform: scaleX(.16); } 30%, 100% { opacity: 1; transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) {
          .cover-loader-rule { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
