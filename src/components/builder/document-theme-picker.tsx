"use client";

import * as React from "react";
import { ArrowRight, Palette } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import {
  documentThemeCssVariables,
  getPolicyDocumentTheme,
  isDocumentThemeCustomized,
  type DocumentThemeDefinition,
} from "@/lib/document-themes";
import { getPolicyProfile } from "@/lib/constants";
import { motifSvg } from "@/lib/cover-motifs";
import { useBuilder } from "@/lib/store";

export function DocumentThemePicker() {
  const { policy, setStep } = useBuilder();
  const selectedTheme = getPolicyDocumentTheme(policy);
  const customized = isDocumentThemeCustomized(policy);
  const profile = getPolicyProfile(policy.policyType);

  return (
    <Panel
      title="Template & Brand"
      description="Switch the visual template (composition only) beside the full document preview. Brand stays separate."
      icon={<Palette size={17} strokeWidth={1.8} />}
      actions={
        <span className="rounded-full bg-[var(--color-forest-soft)] px-3 py-1 text-[10.5px] font-semibold text-[var(--color-forest)]">
          {selectedTheme.name}{customized ? " · Customized" : ""}
        </span>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
        <ThemeContactSheet theme={selectedTheme} companyName={policy.company.name} policyLabel={profile.label} />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--color-muted)]">Selected template</div>
          <div className="mt-1 font-display text-[23px] font-semibold text-[var(--color-ink)]">
            {selectedTheme.customThemeName || selectedTheme.name}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-muted)]">{selectedTheme.layout.bestFor}</p>
          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {[selectedTheme.colors.primary, selectedTheme.colors.soft, selectedTheme.colors.paper, selectedTheme.colors.accent].map((color, index) => (
              <span key={index} className="h-3 flex-1 rounded-full border border-black/5" style={{ background: color }} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep("export")}
            className="mt-5 inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--color-forest)] transition-[gap] hover:gap-3"
          >
            Edit design in Preview <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </Panel>
  );
}

export function ThemeContactSheet({ theme, companyName, policyLabel, compact = false }: { theme: DocumentThemeDefinition; companyName: string; policyLabel: string; compact?: boolean }) {
  const style = {
    ...documentThemeCssVariables(theme),
    fontFamily: theme.defaults.typography.fontFamily,
  } as React.CSSProperties;

  return (
    <div
      style={style}
      data-theme-preview={theme.id}
      data-template-cover={theme.layout.cover}
      data-template-toc={theme.layout.toc}
      data-template-frame={theme.layout.pageFrame}
      className={`relative grid grid-cols-[1.28fr_.72fr] overflow-hidden border border-black/5 bg-[#e9e7e1] shadow-[inset_0_1px_0_rgba(255,255,255,.75)] ${compact ? "aspect-[16/8.7] gap-1.5 rounded-lg p-2" : "aspect-[16/8.7] gap-2 rounded-2xl p-2.5"}`}
      aria-hidden="true"
    >
      <MiniCover theme={theme} companyName={companyName || "Company name"} policyLabel={policyLabel} compact={compact} />
      <div className="grid min-w-0 grid-rows-2 gap-2">
        <MiniToc theme={theme} compact={compact} />
        <MiniContent theme={theme} compact={compact} />
      </div>
    </div>
  );
}

function MiniPage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`relative overflow-hidden rounded-[5px] bg-[var(--doc-paper)] shadow-[0_5px_14px_rgba(25,32,28,.13)] ${className}`}>{children}</div>;
}

function MiniCover({ theme, companyName, policyLabel, compact }: { theme: DocumentThemeDefinition; companyName: string; policyLabel: string; compact: boolean }) {
  const title = compact ? "text-[10px]" : "text-[12px]";
  return <MiniPage className="flex flex-col p-[7%]">
    <div className="h-[38%] w-full shrink-0 overflow-hidden [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: motifSvg(theme.layout.motif, theme.colors) }} />
    <div className="mt-auto line-clamp-2 font-bold leading-[1.02] text-[var(--doc-ink)]" style={{ fontFamily: theme.defaults.typography.headingFontFamily }}>
      <span className={title}>{policyLabel}</span>
    </div>
    <div className="mt-[5%] max-w-full truncate text-[4.5px] text-[var(--doc-muted)]">{companyName}</div>
    <div className="mt-[6%] border-t border-[var(--doc-primary)] pt-1.5 text-[3.5px] uppercase tracking-[.18em] text-[var(--doc-primary)]">Revision 01</div>
  </MiniPage>;
}

function MiniToc({ theme, compact }: { theme: DocumentThemeDefinition; compact: boolean }) {
  const rows = ["Declaration", "Scope", "Targets", "Responsibilities"];
  const toc = theme.layout.toc;
  if (toc === "rail-index") return <MiniPage className="grid grid-cols-[24%_76%]"><div className="bg-[var(--doc-primary)] p-2 text-[5px] font-bold text-[var(--doc-on-primary)]">INDEX</div><div className="space-y-1.5 p-2">{rows.map((row, index) => <div key={row} className="flex gap-1 text-[3.5px]"><b className="text-[var(--doc-accent)]">0{index + 1}</b><span className="truncate">{row}</span></div>)}</div></MiniPage>;
  if (toc === "tile-index") return <MiniPage className="grid grid-cols-2 gap-1 p-2">{rows.map((row, index) => <div key={row} className="flex flex-col justify-between bg-[var(--doc-soft)] p-1.5 text-[3.5px]"><b className="text-[6px] text-[var(--doc-primary)]">0{index + 1}</b><span className="truncate">{row}</span></div>)}</MiniPage>;
  if (toc === "editorial-index") return <MiniPage className="grid grid-cols-2 gap-x-2 p-2.5">{rows.map((row, index) => <div key={row} className="border-t border-[var(--doc-line)] py-1 text-[3.5px]"><b className="mr-1 text-[7px] text-[var(--doc-accent)]">{index + 1}</b>{row}</div>)}</MiniPage>;
  return <MiniPage className={`p-2.5 ${compact ? "text-[.9em]" : ""}`}><div className="mb-2 text-[5px] font-bold uppercase tracking-[.14em] text-[var(--doc-primary)]">Contents</div>{rows.map((row, index) => <div key={row} className="mb-1 flex items-end text-[3.5px]"><b className="mr-1 text-[var(--doc-primary)]">0{index + 1}</b><span>{row}</span><span className="mx-1 mb-[2px] flex-1 border-b border-dotted border-[var(--doc-muted)]" /><span>{index + 2}</span></div>)}</MiniPage>;
}

function MiniContent({ theme, compact }: { theme: DocumentThemeDefinition; compact: boolean }) {
  const frame = theme.layout.pageFrame;
  if (frame === "numbered-rail") return <MiniPage className="grid grid-cols-[24%_76%]"><div className="bg-[var(--doc-primary)] p-2 text-[var(--doc-on-primary)]"><b className="text-[9px]">04</b><div className="mt-1 text-[3px] uppercase tracking-[.14em]">Targets</div></div><div className="p-2"><div className="mb-1.5 text-[4px] font-bold">Quantitative targets</div>{[72, 90, 58, 84].map((width, index) => <div key={index} className="mb-1 h-1 bg-[var(--doc-soft)]" style={{ width: `${width}%` }} />)}</div></MiniPage>;
  if (frame === "modular-grid") return <MiniPage className="p-2"><div className="mb-1.5 flex items-center justify-between bg-[var(--doc-primary)] p-1.5 text-[3.5px] font-bold uppercase tracking-[.12em] text-[var(--doc-on-primary)]"><span>Targets</span><span>05</span></div><div className="space-y-1">{["Energy", "Water", "Waste"].map((item, index) => <div key={item} className="grid grid-cols-[22%_1fr] gap-1 bg-[var(--doc-soft)] p-1"><b className="text-[4px] text-[var(--doc-primary)]">0{index + 1}</b><span className="text-[3.5px]">{item}<span className="mt-1 block h-1 w-[75%] bg-[var(--doc-line)]" /></span></div>)}</div></MiniPage>;
  if (frame === "editorial-margin") return <MiniPage className="grid grid-cols-[23%_77%] p-2.5"><div className="text-[13px] font-bold text-[var(--doc-accent)]" style={{ fontFamily: theme.defaults.typography.headingFontFamily }}>07</div><div><div className="border-t border-[var(--doc-accent)] pt-1 text-[4.5px] font-bold">Responsibilities</div><div className="mt-2 h-1 w-full bg-[var(--doc-line)]" /><div className="mt-1 h-1 w-[82%] bg-[var(--doc-line)]" /><div className="mt-2 border-t border-[var(--doc-line)] pt-1 text-[3px] italic text-[var(--doc-muted)]">Editorial role entries</div></div></MiniPage>;
  return <MiniPage className={`p-2.5 ${compact ? "text-[.9em]" : ""}`}><div className="text-center text-[4.5px] font-bold uppercase tracking-[.14em] text-[var(--doc-primary)]">Policy declaration</div><div className="mx-auto mt-1 h-px w-[42%] bg-[var(--doc-accent)]" /><div className="mt-2 space-y-1">{[100, 92, 78].map((width) => <div key={width} className="h-1 bg-[var(--doc-line)]" style={{ width: `${width}%` }} />)}</div><div className="mt-2 grid grid-cols-[18%_82%] border border-[var(--doc-primary)] text-[3px]"><b className="bg-[var(--doc-primary)] p-1 text-[var(--doc-on-primary)]">01</b><span className="p-1">Commitment statement</span></div></MiniPage>;
}
