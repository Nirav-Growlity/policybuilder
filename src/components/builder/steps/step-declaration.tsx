"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar } from "@/components/ui/panel";
import { Field, Textarea } from "@/components/ui/input";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { BookOpen, Flag, MapPin, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { clsx } from "clsx";

const SECTIONS: {
  key: "preface" | "declaration" | "scope";
  title: string;
  desc: string;
  icon: React.ReactNode;
  hint: string;
}[] = [
  {
    key: "preface",
    title: "Preface",
    desc: "Company background, commitment, and values (3-4 sentences).",
    icon: <BookOpen size={17} strokeWidth={1.8} />,
    hint: "Mention your industry, your commitment, and the standards you align with.",
  },
  {
    key: "declaration",
    title: "Policy declaration",
    desc: "Core commitment statement of this policy (2-3 sentences).",
    icon: <Flag size={17} strokeWidth={1.8} />,
    hint: "State clearly what the company commits to and how it will be achieved.",
  },
  {
    key: "scope",
    title: "Scope",
    desc: "Who and what this policy covers — employees, contractors, sites, activities.",
    icon: <MapPin size={17} strokeWidth={1.8} />,
    hint: "Mention all employees, contractors, suppliers, sites and operational activities.",
  },
];

export function StepDeclaration() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});

  const generate = async (key: "preface" | "declaration" | "scope", customPrompt?: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const existing = policy.declaration[key];
      const r = await callAI({ type: key, policy, customPrompt, existingContent: existing });
      if (r.text) {
        updatePolicy((p) => ({ declaration: { ...p.declaration, [key]: r.text! } }));
        push(`${key[0].toUpperCase() + key.slice(1)} generated`, "success");
      }
    } catch (e) {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const generateAll = async () => {
    setBusy({ preface: true, declaration: true, scope: true });
    try {
      const [p, d, s] = await Promise.all([
        callAI({ type: "preface", policy }),
        callAI({ type: "declaration", policy }),
        callAI({ type: "scope", policy }),
      ]);
      updatePolicy((cur) => ({
        declaration: {
          preface: p.text ?? cur.declaration.preface,
          declaration: d.text ?? cur.declaration.declaration,
          scope: s.text ?? cur.declaration.scope,
        },
      }));
      push("All sections generated", "success");
    } catch (e) {
      push("AI generation failed", "error");
    } finally {
      setBusy({});
    }
  };

  return (
    <div className="space-y-6">
      <InfoBar icon={<Sparkles size={16} className="text-[var(--color-forest)]" />}>
        Click <span className="font-semibold">AI Write</span> on each section for a tailored draft, or use{" "}
        <span className="font-semibold">AI Generate All</span> in the top bar to fill the three sections at once.
      </InfoBar>

      {SECTIONS.map((s) => {
        const value = policy.declaration[s.key];
        const isBusy = busy[s.key];
        return (
          <Panel
            key={s.key}
            title={s.title}
            description={s.desc}
            icon={s.icon}
            actions={
              <AIActionButton
                label="AI Write"
                loading={isBusy}
                onGenerate={(prompt) => generate(s.key, prompt)}
              />
            }
          >
            <Field hint={s.hint}>
              <Textarea
                value={value}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  updatePolicy((p) => ({ declaration: { ...p.declaration, [s.key]: e.target.value } }))
                }
                placeholder={s.hint}
                rows={Math.max(8, (value || "").split("\n").length * 3 + 2)}
                className={clsx(isBusy && "opacity-60")}
              />
            </Field>
          </Panel>
        );
      })}

      {policy.policyType === "living-wage" && (
        <Panel title={policy.definitions?.title || "Definition & Methodology"} description="Define the living-wage benchmark, covered remuneration and review approach." icon={<BookOpen size={17} strokeWidth={1.8} />}>
          <Field hint="State how the company defines a living wage, determines the benchmark, and reviews it over time.">
            <Textarea value={policy.definitions?.content || ""} onChange={(e) => updatePolicy((p) => ({ definitions: { title: p.definitions?.title || "Living Wage", content: e.target.value } }))} rows={9} />
          </Field>
        </Panel>
      )}
    </div>
  );
}
