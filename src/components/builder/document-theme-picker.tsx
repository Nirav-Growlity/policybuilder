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
import { useBuilder } from "@/lib/store";

export function DocumentThemePicker() {
  const { policy, setStep } = useBuilder();
  const selectedTheme = getPolicyDocumentTheme(policy);
  const customized = isDocumentThemeCustomized(policy);
  const profile = getPolicyProfile(policy.policyType);

  return (
    <Panel
      title="Document design"
      description="Choose and customize the visual system beside the full document preview."
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
          <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--color-muted)]">Selected theme</div>
          <div className="mt-1 font-display text-[23px] font-semibold text-[var(--color-ink)]">
            {selectedTheme.customThemeName || selectedTheme.name}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-muted)]">{selectedTheme.layout.bestFor}</p>
          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {[selectedTheme.colors.primary, selectedTheme.colors.soft, selectedTheme.colors.paper, selectedTheme.colors.accent].map((color) => (
              <span key={color} className="h-3 flex-1 rounded-full border border-black/5" style={{ background: color }} />
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

export function ThemeContactSheet({ theme, companyName, policyLabel }: { theme: DocumentThemeDefinition; companyName: string; policyLabel: string }) {
  const style = {
    ...documentThemeCssVariables(theme),
    fontFamily: theme.defaults.typography.fontFamily,
  } as React.CSSProperties;

  return (
    <div
      style={style}
      data-theme-preview={theme.id}
      className="relative grid aspect-[16/8.7] grid-cols-[1.28fr_.72fr] gap-2 overflow-hidden rounded-2xl border border-black/5 bg-[#e9e7e1] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.75)]"
      aria-hidden="true"
    >
      <MiniCover theme={theme} companyName={companyName || "Company name"} policyLabel={policyLabel} />
      <div className="grid min-w-0 grid-rows-2 gap-2">
        <MiniToc theme={theme} />
        <MiniContent theme={theme} />
      </div>
    </div>
  );
}

function MiniPage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[5px] bg-[var(--doc-paper)] shadow-[0_5px_14px_rgba(25,32,28,.13)] ${className}`}>
      {children}
    </div>
  );
}

function MiniCover({ theme, companyName, policyLabel }: { theme: DocumentThemeDefinition; companyName: string; policyLabel: string }) {
  const cover = theme.layout.cover;
  if (cover === "dossier-split") {
    return (
      <MiniPage className="grid grid-cols-[35%_65%]">
        <div className="relative bg-[var(--doc-primary)] p-[12%] text-[var(--doc-on-primary)]">
          <div className="h-2 w-7 border-y border-white/60" />
          <div className="absolute bottom-[12%] left-[18%] text-[5px] font-bold tracking-[.18em] [writing-mode:vertical-rl]">POLICY DOSSIER</div>
        </div>
        <div className="flex flex-col px-[11%] py-[12%]">
          <div className="text-[4px] font-bold uppercase tracking-[.22em] text-[var(--doc-accent)]">Executive edition</div>
          <div className="mt-auto line-clamp-3 text-[12px] font-bold leading-[1.02] text-[var(--doc-ink)]" style={{ fontFamily: theme.defaults.typography.headingFontFamily }}>{policyLabel}</div>
          <div className="mt-[8%] truncate text-[4.5px] text-[var(--doc-muted)]">{companyName}</div>
          <div className="mt-[10%] grid grid-cols-2 gap-x-2 border-t border-[var(--doc-primary)] pt-2 text-[3.5px] text-[var(--doc-muted)]"><span>DOC 001</span><span>REV 01</span></div>
        </div>
      </MiniPage>
    );
  }

  if (cover === "atlas-modular") {
    return (
      <MiniPage className="grid grid-cols-2 grid-rows-[1fr_.72fr]">
        <div className="relative col-span-2 bg-[var(--doc-soft)] px-[9%] py-[8%]">
          <div className="absolute -right-[5%] -top-[12%] aspect-square h-[58%] rounded-full border-[8px] border-[var(--doc-primary)] opacity-80" />
          <div className="relative text-[4px] font-bold uppercase tracking-[.25em] text-[var(--doc-primary)]">Impact atlas</div>
          <div className="relative mt-[10%] max-w-[70%] line-clamp-3 text-[13px] font-bold leading-[.98] text-[var(--doc-ink)]">{policyLabel}</div>
        </div>
        <div className="bg-[var(--doc-primary)] p-[14%] text-[4px] font-semibold uppercase tracking-[.16em] text-[var(--doc-on-primary)]">Policy<br />01</div>
        <div className="flex flex-col justify-end p-[12%] text-[4px] text-[var(--doc-muted)]"><span className="truncate font-semibold text-[var(--doc-ink)]">{companyName}</span><span className="mt-1">2026 · REV 01</span></div>
      </MiniPage>
    );
  }

  if (cover === "journal-editorial") {
    return (
      <MiniPage className="p-[9%]">
        <div className="absolute right-[8%] top-[7%] h-[38%] w-[46%] opacity-55">
          {[0, 1, 2, 3].map((ring) => <span key={ring} className="absolute rounded-[50%] border border-[var(--doc-accent)]" style={{ inset: `${ring * 10}% ${ring * 3}%` }} />)}
        </div>
        <div className="h-[2px] w-[34%] bg-[var(--doc-accent)]" />
        <div className="absolute inset-x-[10%] bottom-[12%]">
          <div className="text-[4px] font-bold uppercase tracking-[.24em] text-[var(--doc-accent)]">Field journal · policy</div>
          <div className="mt-[6%] max-w-[86%] line-clamp-3 text-[14px] font-bold leading-[.96] text-[var(--doc-ink)]" style={{ fontFamily: theme.defaults.typography.headingFontFamily }}>{policyLabel}</div>
          <div className="mt-[8%] flex items-end justify-between border-t border-[var(--doc-line)] pt-2 text-[4px] text-[var(--doc-muted)]"><span className="max-w-[70%] truncate">{companyName}</span><span>01</span></div>
        </div>
      </MiniPage>
    );
  }

  return (
    <MiniPage className="p-[7%]">
      <div className="absolute inset-[5%] border border-[var(--doc-primary)]" />
      <div className="absolute inset-[7%] border border-[var(--doc-line)]" />
      <div className="relative flex h-full flex-col items-center justify-center px-[9%] text-center">
        <div className="flex items-center gap-2 text-[4px] font-bold uppercase tracking-[.24em] text-[var(--doc-primary)]"><span className="h-px w-5 bg-[var(--doc-accent)]" />Charter<span className="h-px w-5 bg-[var(--doc-accent)]" /></div>
        <div className="mt-[12%] line-clamp-3 text-[13px] font-bold leading-[1.02] text-[var(--doc-ink)]" style={{ fontFamily: theme.defaults.typography.headingFontFamily }}>{policyLabel}</div>
        <div className="mt-[8%] max-w-full truncate text-[4.5px] text-[var(--doc-muted)]">{companyName}</div>
        <div className="absolute inset-x-[15%] bottom-[12%] border-t border-[var(--doc-primary)] pt-2 text-[3.5px] uppercase tracking-[.18em] text-[var(--doc-primary)]">Established policy · Revision 01</div>
      </div>
    </MiniPage>
  );
}

function MiniToc({ theme }: { theme: DocumentThemeDefinition }) {
  const toc = theme.layout.toc;
  const rows = ["Declaration", "Scope", "Targets", "Responsibilities"];
  if (toc === "rail-index") {
    return <MiniPage className="grid grid-cols-[24%_76%]"><div className="bg-[var(--doc-primary)] p-2 text-[5px] font-bold text-[var(--doc-on-primary)]">INDEX</div><div className="space-y-1.5 p-2">{rows.map((row, index) => <div key={row} className="flex gap-1 text-[3.5px]"><b className="text-[var(--doc-accent)]">0{index + 1}</b><span className="truncate">{row}</span></div>)}</div></MiniPage>;
  }
  if (toc === "tile-index") {
    return <MiniPage className="grid grid-cols-2 gap-1 p-2">{rows.map((row, index) => <div key={row} className="flex flex-col justify-between bg-[var(--doc-soft)] p-1.5 text-[3.5px]"><b className="text-[6px] text-[var(--doc-primary)]">0{index + 1}</b><span className="truncate">{row}</span></div>)}</MiniPage>;
  }
  if (toc === "editorial-index") {
    return <MiniPage className="grid grid-cols-2 gap-x-2 p-2.5">{rows.map((row, index) => <div key={row} className="border-t border-[var(--doc-line)] py-1 text-[3.5px]"><b className="mr-1 text-[7px] text-[var(--doc-accent)]">{index + 1}</b>{row}</div>)}</MiniPage>;
  }
  return <MiniPage className="p-2.5"><div className="mb-2 text-[5px] font-bold uppercase tracking-[.14em] text-[var(--doc-primary)]">Contents</div>{rows.map((row, index) => <div key={row} className="mb-1 flex items-end text-[3.5px]"><b className="mr-1 text-[var(--doc-primary)]">0{index + 1}</b><span>{row}</span><span className="mx-1 mb-[2px] flex-1 border-b border-dotted border-[var(--doc-muted)]" /><span>{index + 2}</span></div>)}</MiniPage>;
}

function MiniContent({ theme }: { theme: DocumentThemeDefinition }) {
  const frame = theme.layout.pageFrame;
  if (frame === "numbered-rail") {
    return <MiniPage className="grid grid-cols-[24%_76%]"><div className="bg-[var(--doc-primary)] p-2 text-[var(--doc-on-primary)]"><b className="text-[9px]">04</b><div className="mt-1 text-[3px] uppercase tracking-[.14em]">Targets</div></div><div className="p-2"><div className="mb-1.5 text-[4px] font-bold">Quantitative targets</div>{[72, 90, 58, 84].map((width, index) => <div key={index} className="mb-1 h-1 bg-[var(--doc-soft)]" style={{ width: `${width}%` }} />)}</div></MiniPage>;
  }
  if (frame === "modular-grid") {
    return <MiniPage className="p-2"><div className="mb-1.5 flex items-center justify-between bg-[var(--doc-primary)] p-1.5 text-[3.5px] font-bold uppercase tracking-[.12em] text-[var(--doc-on-primary)]"><span>Targets</span><span>05</span></div><div className="space-y-1">{["Energy", "Water", "Waste"].map((item, index) => <div key={item} className="grid grid-cols-[22%_1fr] gap-1 bg-[var(--doc-soft)] p-1"><b className="text-[4px] text-[var(--doc-primary)]">0{index + 1}</b><span className="text-[3.5px]">{item}<span className="mt-1 block h-1 w-[75%] bg-[var(--doc-line)]" /></span></div>)}</div></MiniPage>;
  }
  if (frame === "editorial-margin") {
    return <MiniPage className="grid grid-cols-[23%_77%] p-2.5"><div className="text-[13px] font-bold text-[var(--doc-accent)]" style={{ fontFamily: theme.defaults.typography.headingFontFamily }}>07</div><div><div className="border-t border-[var(--doc-accent)] pt-1 text-[4.5px] font-bold">Responsibilities</div><div className="mt-2 h-1 w-full bg-[var(--doc-line)]" /><div className="mt-1 h-1 w-[82%] bg-[var(--doc-line)]" /><div className="mt-2 border-t border-[var(--doc-line)] pt-1 text-[3px] italic text-[var(--doc-muted)]">Editorial role entries</div></div></MiniPage>;
  }
  return <MiniPage className="p-2.5"><div className="text-center text-[4.5px] font-bold uppercase tracking-[.14em] text-[var(--doc-primary)]">Policy declaration</div><div className="mx-auto mt-1 h-px w-[42%] bg-[var(--doc-accent)]" /><div className="mt-2 space-y-1">{[100, 92, 78].map((width) => <div key={width} className="h-1 bg-[var(--doc-line)]" style={{ width: `${width}%` }} />)}</div><div className="mt-2 grid grid-cols-[18%_82%] border border-[var(--doc-primary)] text-[3px]"><b className="bg-[var(--doc-primary)] p-1 text-[var(--doc-on-primary)]">01</b><span className="p-1">Commitment statement</span></div></MiniPage>;
}
