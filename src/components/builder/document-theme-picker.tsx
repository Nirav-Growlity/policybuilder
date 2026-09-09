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
import { coverDesign } from "@/lib/cover-designs";
import { PREVIEW_POLICY_TYPES } from "@/lib/sample-policies";
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
        <ThemeContactSheet theme={selectedTheme} companyName={policy.company.name} policyLabel={profile.label} policyType={policy.policyType} />
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

export function ThemeContactSheet({
  theme,
  companyName,
  policyLabel,
  compact = false,
  policyType = "environmental",
}: {
  theme: DocumentThemeDefinition;
  companyName: string;
  policyLabel: string;
  compact?: boolean;
  policyType?: string;
}) {
  const [coverError, setCoverError] = React.useState(false);
  const [bodyError, setBodyError] = React.useState(false);

  const resolvedType = (policyType && (PREVIEW_POLICY_TYPES as readonly string[]).includes(policyType))
    ? policyType
    : "environmental";

  const coverSrc = `/template-previews/${theme.id}/${resolvedType}-cover.png`;
  const bodySrc = `/template-previews/${theme.id}/${resolvedType}-body.png`;

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
      className={`relative flex items-center justify-center overflow-hidden border border-black/5 bg-[#eceae4] shadow-[inset_0_1px_0_rgba(255,255,255,.75)] ${
        compact ? "aspect-[16/8.7] gap-2 rounded-xl p-2" : "aspect-[16/8.7] gap-3 rounded-2xl p-2.5"
      }`}
      aria-hidden="true"
    >
      {/* Cover page preview */}
      <div className="relative h-full aspect-[210/297] shrink-0 overflow-hidden rounded-[3px] bg-white shadow-[0_3px_10px_rgba(25,32,28,.12),0_1px_2px_rgba(25,32,28,.08)] ring-1 ring-black/5">
        {coverError ? (
          <MiniCover theme={theme} companyName={companyName || "Company name"} policyLabel={policyLabel} compact={compact} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc}
            alt={`${theme.name} cover`}
            className="h-full w-full object-cover object-top select-none pointer-events-none"
            loading="lazy"
            onError={() => setCoverError(true)}
          />
        )}
      </div>

      {/* Body / Inside page preview */}
      <div className="relative h-full aspect-[210/297] shrink-0 overflow-hidden rounded-[3px] bg-white shadow-[0_3px_10px_rgba(25,32,28,.12),0_1px_2px_rgba(25,32,28,.08)] ring-1 ring-black/5">
        {bodyError ? (
          <MiniContent theme={theme} compact={compact} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bodySrc}
            alt={`${theme.name} body`}
            className="h-full w-full object-cover object-top select-none pointer-events-none"
            loading="lazy"
            onError={() => setBodyError(true)}
          />
        )}
      </div>
    </div>
  );
}

function MiniPage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`relative h-full w-full overflow-hidden rounded-[3px] bg-[var(--doc-paper)] ${className}`}>{children}</div>;
}

function MiniCover({ theme, companyName, policyLabel, compact }: { theme: DocumentThemeDefinition; companyName: string; policyLabel: string; compact: boolean }) {
  const design = coverDesign(theme.layout.cover);
  return (
    <MiniPage className="flex flex-col p-[7%] justify-between">
      <div className="text-[4px] font-semibold truncate text-[var(--doc-ink)]">
        {companyName || "Company name"}
      </div>
      <div
        className={`my-auto ${
          design.rule === "top"
            ? "border-t border-[var(--doc-primary)] pt-1"
            : design.rule === "bottom"
            ? "border-b border-[var(--doc-primary)] pb-1"
            : ""
        }`}
        style={{ textAlign: design.align }}
      >
        <div
          className={`font-bold line-clamp-2 leading-[1.1] text-[var(--doc-primary)] ${compact ? "text-[8px]" : "text-[10px]"}`}
          style={{ fontFamily: theme.defaults.typography.headingFontFamily }}
        >
          {policyLabel}
        </div>
      </div>
      <div className="border-t border-[var(--doc-line)] pt-1 grid grid-cols-2 gap-x-1 gap-y-0.5 text-[3px] text-[var(--doc-muted)]">
        <div>DOC: <span className="font-semibold text-[var(--doc-ink)]">ASC-001</span></div>
        <div>REV: <span className="font-semibold text-[var(--doc-ink)]">01</span></div>
      </div>
    </MiniPage>
  );
}

function MiniContent({ theme, compact }: { theme: DocumentThemeDefinition; compact: boolean }) {
  const frame = theme.layout.pageFrame;
  if (frame === "numbered-rail") {
    return (
      <MiniPage className="grid grid-cols-[22%_78%] h-full">
        <div className="bg-[var(--doc-primary)] p-1.5 text-[var(--doc-on-primary)] flex flex-col justify-between">
          <b className="text-[7px]">01</b>
          <div className="text-[2.5px] uppercase tracking-wider opacity-80">Section</div>
        </div>
        <div className="p-2 space-y-1">
          <div className="text-[4px] font-bold text-[var(--doc-primary)]">01 Preface</div>
          <div className="space-y-0.5">
            {[90, 85, 95, 70].map((w, i) => (
              <div key={i} className="h-0.5 bg-[var(--doc-line)] rounded-full" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="mt-1.5 text-[4px] font-bold text-[var(--doc-primary)]">02 Declaration</div>
          <div className="space-y-0.5">
            {[92, 80, 88].map((w, i) => (
              <div key={i} className="h-0.5 bg-[var(--doc-line)] rounded-full" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </MiniPage>
    );
  }
  if (frame === "modular-grid") {
    return (
      <MiniPage className="p-1.5 space-y-1 h-full">
        <div className="bg-[var(--doc-soft)] border border-[var(--doc-line)] rounded p-1">
          <div className="text-[3.5px] font-bold text-[var(--doc-primary)] mb-0.5">01 Preface</div>
          <div className="space-y-0.5">
            <div className="h-0.5 bg-[var(--doc-line)] w-[90%]" />
            <div className="h-0.5 bg-[var(--doc-line)] w-[75%]" />
          </div>
        </div>
        <div className="bg-[var(--doc-soft)] border border-[var(--doc-line)] rounded p-1">
          <div className="text-[3.5px] font-bold text-[var(--doc-primary)] mb-0.5">02 Policy Declaration</div>
          <div className="space-y-0.5">
            <div className="h-0.5 bg-[var(--doc-line)] w-[85%]" />
            <div className="h-0.5 bg-[var(--doc-line)] w-[60%]" />
          </div>
        </div>
      </MiniPage>
    );
  }
  if (frame === "editorial-margin") {
    return (
      <MiniPage className="grid grid-cols-[20%_80%] p-2 h-full">
        <div className="text-[10px] font-bold text-[var(--doc-accent)]" style={{ fontFamily: theme.defaults.typography.headingFontFamily }}>
          01
        </div>
        <div>
          <div className="text-[4px] font-bold text-[var(--doc-primary)] mb-1">01 Preface</div>
          <div className="space-y-0.5">
            {[90, 85, 95, 70].map((w, i) => (
              <div key={i} className="h-0.5 bg-[var(--doc-line)] rounded-full" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </MiniPage>
    );
  }
  return (
    <MiniPage className="p-2 space-y-1.5 h-full">
      <div className="border-b border-[var(--doc-line)] pb-1">
        <div className="text-[4px] font-bold text-[var(--doc-primary)]">01 Preface</div>
        <div className="mt-1 space-y-0.5">
          {[95, 88, 92].map((w, i) => (
            <div key={i} className="h-0.5 bg-[var(--doc-line)] rounded-full" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      <div>
        <div className="text-[4px] font-bold text-[var(--doc-primary)]">02 Declaration</div>
        <div className="mt-1 space-y-0.5">
          {[90, 82, 85].map((w, i) => (
            <div key={i} className="h-0.5 bg-[var(--doc-line)] rounded-full" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </MiniPage>
  );
}
