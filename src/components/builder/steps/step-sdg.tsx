"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { SDG_DATA } from "@/lib/constants";
import { Panel, InfoBar, Badge } from "@/components/ui/panel";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { Globe2, Sparkles, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { clsx } from "clsx";

export function StepSDG() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState(false);

  const toggle = (n: number) => {
    updatePolicy((p) => {
      const set = new Set(p.sdgs);
      if (set.has(n)) set.delete(n);
      else set.add(n);
      return { sdgs: Array.from(set).sort((a, b) => a - b) };
    });
  };

  const generate = async (customPrompt?: string) => {
    setBusy(true);
    try {
      const r = await callAI({ type: "sdg", policy, customPrompt });
      if (r.sdgs) {
        updatePolicy((p) => ({ sdgs: r.sdgs!.filter((n) => n >= 1 && n <= 17).sort((a, b) => a - b) }));
        push("SDGs suggested", "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <InfoBar icon={<Sparkles size={16} className="text-[var(--color-forest)]" />}>
        Click the goals your policy contributes to, or use AI Suggest to infer from your focus areas.
      </InfoBar>

      <Panel
        title="UN Sustainable Development Goals alignment"
        description="Selected goals are shown as colored chips in the published document."
        icon={<Globe2 size={17} strokeWidth={1.8} />}
        actions={
          <>
            <Badge variant="muted">{policy.sdgs.length} selected</Badge>
            <AIActionButton
              label="AI Suggest"
              loading={busy}
              onGenerate={generate}
            />
          </>
        }
      >
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          {SDG_DATA.map((s) => {
            const sel = policy.sdgs.includes(s.n);
            return (
              <button
                key={s.n}
                onClick={() => toggle(s.n)}
                className={clsx(
                  "relative p-3 rounded-lg text-left transition-all duration-200 group",
                  sel
                    ? "shadow-[var(--shadow-card)] ring-2 ring-offset-2 ring-offset-[var(--color-paper)]"
                    : "opacity-55 hover:opacity-90"
                )}
                style={{
                  background: `${s.c}14`,
                  color: s.c,
                  // @ts-ignore
                  "--tw-ring-color": s.c,
                }}
              >
                <div className="text-[20px] font-display font-bold leading-none">{s.n}</div>
                <div className="text-[10.5px] mt-1.5 leading-tight font-medium line-clamp-2">{s.label}</div>
                {sel && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: s.c }}>
                    <X size={9} className="text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {policy.sdgs.length > 0 && (
          <div className="mt-6 pt-5 border-t border-[var(--color-line)]">
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--color-ink-2)] mb-3">
              Selected ({policy.sdgs.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {policy.sdgs.map((n) => {
                const s = SDG_DATA.find((d) => d.n === n)!;
                return (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold border"
                    style={{ background: `${s.c}15`, color: s.c, borderColor: `${s.c}40` }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: s.c }}
                    >
                      {s.n}
                    </span>
                    SDG {s.n}: {s.label}
                    <button onClick={() => toggle(n)} className="ml-1 opacity-60 hover:opacity-100">
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
