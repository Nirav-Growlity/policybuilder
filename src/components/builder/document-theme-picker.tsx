"use client";

import * as React from "react";
import { Check, Palette } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import {
  DOCUMENT_THEMES,
  documentThemeCssVariables,
  getDocumentThemePatch,
  getPolicyDocumentTheme,
  isDocumentThemeCustomized,
  type DocumentThemeDefinition,
} from "@/lib/document-themes";
import { getPolicyProfile } from "@/lib/constants";
import { useBuilder } from "@/lib/store";

export function DocumentThemePicker() {
  const { policy, updatePolicy } = useBuilder();
  const selectedTheme = getPolicyDocumentTheme(policy);
  const customized = isDocumentThemeCustomized(policy);
  const profile = getPolicyProfile(policy.policyType);

  return (
    <Panel
      title="Choose a document design"
      description="Each option changes the cover, contents, page structure, section layouts, data treatment, and running furniture."
      icon={<Palette size={17} strokeWidth={1.8} />}
      actions={
        <span className="rounded-full bg-[var(--color-forest-soft)] px-3 py-1 text-[10.5px] font-semibold text-[var(--color-forest)]">
          {selectedTheme.name}{customized ? " · Customized" : ""}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" role="radiogroup" aria-label="Document design">
        {DOCUMENT_THEMES.map((theme) => {
          const selected = selectedTheme.id === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => updatePolicy(() => getDocumentThemePatch(theme.id))}
              className={`group relative overflow-hidden rounded-[20px] border bg-white p-4 text-left outline-none transition-[transform,border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--color-forest)] focus-visible:ring-offset-2 motion-reduce:transition-none ${
                selected
                  ? "border-[var(--color-forest)] shadow-[0_16px_36px_rgba(26,92,58,.14)]"
                  : "border-[var(--color-line)] hover:-translate-y-0.5 hover:border-[var(--color-line-2)] hover:shadow-[0_14px_34px_rgba(35,52,42,.10)] motion-reduce:hover:translate-y-0"
              }`}
            >
              <ThemeContactSheet theme={theme} companyName={policy.company.name} policyLabel={profile.label} />
              <div className="mt-4 flex items-start justify-between gap-4 px-0.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[14px] font-semibold text-[var(--color-ink)]">{theme.name}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[.16em]" style={{ color: theme.colors.primary }}>
                      {theme.layout.archetype.replaceAll("-", " ")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-[1.5] text-[var(--color-muted)]">{theme.layout.bestFor}</p>
                </div>
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 motion-reduce:transition-none ${
                    selected
                      ? "scale-100 border-[var(--color-forest)] bg-[var(--color-forest)] text-white"
                      : "scale-90 border-[var(--color-line-2)] bg-white text-transparent group-hover:scale-100"
                  }`}
                  aria-hidden="true"
                >
                  <Check size={13} strokeWidth={2.6} />
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 px-0.5">
                {theme.layout.descriptors.map((descriptor) => (
                  <span key={descriptor} className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper-2)] px-2 py-1 text-[9px] font-semibold text-[var(--color-ink-2)]">
                    {descriptor}
                  </span>
                ))}
                <span className="ml-auto flex gap-1.5" aria-hidden="true">
                  {[theme.colors.primary, theme.colors.soft, theme.colors.paper, theme.colors.accent].map((color) => (
                    <span key={color} className="h-3 w-3 rounded-full border border-black/5" style={{ background: color }} />
                  ))}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-[11.5px] text-[var(--color-muted)]">
        Switching designs resets typography, logo position, data treatment, and SDG appearance to that design&apos;s defaults. Policy content and outline choices stay intact.
      </p>
    </Panel>
  );
}

function ThemeContactSheet({ theme, companyName, policyLabel }: { theme: DocumentThemeDefinition; companyName: string; policyLabel: string }) {
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
