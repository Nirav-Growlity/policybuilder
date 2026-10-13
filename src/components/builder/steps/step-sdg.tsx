"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { SDG_DATA } from "@/lib/constants";
import { Panel, Badge } from "@/components/ui/panel";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { Check, Globe2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/ui/toast";
import { StepRoot, authoring as ui } from "./authoring-ui";

// Text colour on a filled goal tile: dark ink on light goal colours, white otherwise.
function inkOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#0b1220" : "#ffffff";
}

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
        updatePolicy(() => ({ sdgs: r.sdgs!.filter((n) => n >= 1 && n <= 17).sort((a, b) => a - b) }));
        push("SDGs suggested", "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepRoot>
      <Panel
        title="UN Sustainable Development Goals alignment"
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
        <div className={ui.goals}>
          {SDG_DATA.map((s) => {
            const sel = policy.sdgs.includes(s.n);
            return (
              <motion.button
                type="button"
                key={s.n}
                onClick={() => toggle(s.n)}
                aria-pressed={sel}
                aria-label={`SDG ${s.n}: ${s.label}`}
                className={ui.goal}
                style={{ "--goal": s.c, "--goal-ink": inkOn(s.c) } as React.CSSProperties}
                whileTap={{ scale: 0.96 }}
              >
                <span className={ui.goalNumber}>{s.n}</span>
                <span className={ui.goalLabel}>{s.label}</span>
                <AnimatePresence initial={false}>
                  {sel && (
                    <motion.span
                      key="mark"
                      className={ui.goalMark}
                      aria-hidden="true"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 520, damping: 28 }}
                    >
                      <Check size={13} strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {policy.sdgs.length > 0 && (
          <>
            <hr className={ui.divider} />
            <div className={ui.groupHead}>
              <h4 className={ui.groupTitle}>Selected goals</h4>
              <span className={ui.groupCount}>{policy.sdgs.length} of {SDG_DATA.length}</span>
            </div>
            <div className={ui.chips}>
              <AnimatePresence initial={false}>
                {policy.sdgs.map((n) => {
                  const s = SDG_DATA.find((d) => d.n === n)!;
                  return (
                    <motion.span
                      key={n}
                      layout="position"
                      className={ui.chip}
                      style={{ "--goal": s.c, "--goal-ink": inkOn(s.c) } as React.CSSProperties}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.18 }}
                    >
                      <span className={ui.chipNumber}>{s.n}</span>
                      {s.label}
                      <button type="button" onClick={() => toggle(n)} className={ui.chipRemove} aria-label={`Remove SDG ${s.n}: ${s.label}`}>
                        <X size={13} />
                      </button>
                    </motion.span>
                  );
                })}
              </AnimatePresence>
            </div>
          </>
        )}
      </Panel>
    </StepRoot>
  );
}
