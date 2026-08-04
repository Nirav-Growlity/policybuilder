"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar, Badge } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { callAI } from "@/lib/ai/client";
import { Info, Plus, Sparkles, Target, Trash2, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function StepFocus() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [newArea, setNewArea] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const add = () => {
    const v = newArea.trim();
    if (!v) return;
    updatePolicy((p) => ({ focusAreas: [...p.focusAreas, v] }));
    setNewArea("");
  };

  const remove = (i: number) => {
    updatePolicy((p) => ({ focusAreas: p.focusAreas.filter((_, idx) => idx !== i) }));
  };

  const update = (i: number, v: string) => {
    updatePolicy((p) => ({ focusAreas: p.focusAreas.map((x, idx) => (idx === i ? v : x)) }));
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await callAI({ type: "focus", policy });
      if (r.areas) {
        updatePolicy((p) => ({ focusAreas: r.areas! }));
        push("Focus areas suggested", "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <InfoBar icon={<Info size={16} />}>
        The core topics your policy covers. Add custom focus areas relevant to your business or use the AI suggestion
        to start from a curated set.
      </InfoBar>

      <Panel
        title="Key focus areas"
        description="The thematic chapters of your environmental policy."
        icon={<Target size={17} strokeWidth={1.8} />}
        actions={
          <>
            <Badge variant="muted">{policy.focusAreas.length} areas</Badge>
            <Button variant="ai" size="sm" icon={<Wand2 size={13} />} loading={busy} onClick={generate}>
              AI Suggest
            </Button>
          </>
        }
      >
        <ol className="space-y-2.5">
          {policy.focusAreas.map((area, i) => (
            <li
              key={i}
              className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--color-cream-2)]/60 border border-[var(--color-line)] hover:border-[var(--color-line-2)] transition-colors"
            >
              <div className="w-7 h-7 rounded-md bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)] flex items-center justify-center text-[12px] font-semibold flex-shrink-0 font-mono">
                {String(i + 1).padStart(2, "0")}
              </div>
              <Input
                value={area}
                onChange={(e) => update(i, e.target.value)}
                className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] px-2.5 -mx-2.5"
              />
              <button
                onClick={() => remove(i)}
                className="text-[var(--color-muted)] hover:text-[#9b2929] hover:bg-[#fdecec] p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                aria-label="Remove"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>

        <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--color-line)]">
          <Input
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Type a new focus area and press Enter..."
            className="border-dashed"
          />
          <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={add}>
            Add
          </Button>
        </div>
      </Panel>
    </div>
  );
}
