"use client";

import * as React from "react";
import Image from "next/image";
import { useBuilder } from "@/lib/store";
import { SDG_DATA } from "@/lib/constants";
import { Panel, Badge } from "@/components/ui/panel";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { streamAI } from "@/lib/ai/client";
import { ITEM_BREAK, useGenerationStreams } from "@/lib/ai/use-generation-streams";
import { useRevealText } from "@/components/ui/ai-stream";
import { Check, Globe2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/ui/toast";
import { StepRoot, authoring as ui } from "./authoring-ui";

// The official UN goal icons, also used by the document preview.
const sdgIcon = (goal: number) => `/E SDG Icons WEB/E-WEB-Goal-${String(goal).padStart(2, "0")}.png`;

const isGoal = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 17;
// Suggested goals stream through a paced reveal as two-digit codes, so they light up one at a time
// at an even rhythm (about one every 200ms) however quickly the model names them.
const GOAL_PACE = { charsPerSecond: 15, catchUpMs: Infinity };
const encodeGoals = (goals: unknown[] = []) => goals.filter(isGoal).map((n) => String(n).padStart(2, "0")).join(ITEM_BREAK);
const decodeGoals = (text: string) => text.split(ITEM_BREAK).filter((code) => code.length === 2).map(Number);

export function StepSDG() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const streams = useGenerationStreams();
  const reveal = streams.reveal("sdg");
  const streamed = useRevealText(reveal);
  const suggesting = Boolean(reveal);
  // While goals stream in they replace the current selection on screen; the policy changes once at the end.
  const goals = suggesting ? decodeGoals(streamed) : policy.sdgs;

  const toggle = (n: number) => {
    updatePolicy((p) => {
      const set = new Set(p.sdgs);
      if (set.has(n)) set.delete(n);
      else set.add(n);
      return { sdgs: Array.from(set).sort((a, b) => a - b) };
    });
  };

  const generate = async (customPrompt?: string) => {
    const { reveal, signal } = streams.start("sdg", GOAL_PACE);
    try {
      const r = await streamAI({ type: "sdg", policy, customPrompt }, {
        signal,
        onPartial: (partial) => reveal.set(encodeGoals(partial.sdgs)),
      });
      const sdgs = Array.from(new Set((r.sdgs ?? []).filter(isGoal)));
      if (sdgs.length) {
        await reveal.finish(encodeGoals(sdgs));
        updatePolicy(() => ({ sdgs: [...sdgs].sort((a, b) => a - b) }));
        push(signal.aborted ? `Stopped with ${sdgs.length} goal${sdgs.length === 1 ? "" : "s"} suggested` : "SDGs suggested", signal.aborted ? "info" : "success");
      } else if (signal.aborted) {
        push("Stopped before any goals were suggested", "info");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end("sdg", reveal);
    }
  };

  return (
    <StepRoot>
      <Panel
        title="UN Sustainable Development Goals alignment"
        icon={<Globe2 size={17} strokeWidth={1.8} />}
        actions={
          <>
            <Badge variant="muted">{goals.length} selected</Badge>
            <AIActionButton
              label="AI Suggest"
              loading={suggesting}
              onGenerate={generate}
              onStop={() => streams.stop("sdg")}
            />
          </>
        }
      >
        <div className={ui.goals} data-scanning={suggesting || undefined} aria-busy={suggesting || undefined}>
          {SDG_DATA.map((s, index) => {
            const sel = goals.includes(s.n);
            return (
              <motion.button
                type="button"
                key={s.n}
                onClick={() => toggle(s.n)}
                disabled={suggesting}
                aria-pressed={sel}
                aria-label={`SDG ${s.n}: ${s.label}`}
                className={ui.goal}
                data-picked={(suggesting && sel) || undefined}
                style={{ "--n": index } as React.CSSProperties}
                whileTap={{ scale: 0.96 }}
              >
                <Image src={sdgIcon(s.n)} alt="" width={1500} height={1500} sizes="(max-width: 640px) 30vw, 150px" className={ui.goalIcon} />
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
                      <Check size={14} strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {goals.length > 0 && (
          <>
            <hr className={ui.divider} />
            <div className={ui.groupHead}>
              <h4 className={ui.groupTitle}>Selected goals</h4>
              <span className={ui.groupCount}>{goals.length} of {SDG_DATA.length}</span>
            </div>
            <div className={ui.chips}>
              <AnimatePresence initial={false}>
                {goals.map((n) => {
                  const s = SDG_DATA.find((d) => d.n === n)!;
                  return (
                    <motion.span
                      key={n}
                      layout="position"
                      className={ui.chip}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Image src={sdgIcon(s.n)} alt="" width={1500} height={1500} sizes="28px" className={ui.chipIcon} />
                      <span>SDG {s.n}: {s.label}</span>
                      <button type="button" onClick={() => toggle(n)} disabled={suggesting} className={ui.chipRemove} aria-label={`Remove SDG ${s.n}: ${s.label}`}>
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
