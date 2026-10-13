"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { streamAI } from "@/lib/ai/client";
import { keepFinishedSentences, useGenerationStreams } from "@/lib/ai/use-generation-streams";
import { BookOpen, Flag, MapPin } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { getSection } from "@/lib/sections";
import { StepRoot, WritingField } from "./authoring-ui";

const SECTIONS: {
  key: "preface" | "declaration" | "scope";
  title: string;
  icon: React.ReactNode;
  hint: string;
}[] = [
  {
    key: "preface",
    title: "Preface",
    icon: <BookOpen size={17} strokeWidth={1.8} />,
    hint: "Mention your industry, your commitment, and the standards you align with.",
  },
  {
    key: "declaration",
    title: "Policy declaration",
    icon: <Flag size={17} strokeWidth={1.8} />,
    hint: "State clearly what the company commits to and how it will be achieved.",
  },
  {
    key: "scope",
    title: "Scope",
    icon: <MapPin size={17} strokeWidth={1.8} />,
    hint: "Mention all employees, contractors, suppliers, sites and operational activities.",
  },
];

export function StepDeclaration() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const streams = useGenerationStreams();

  const generate = async (key: "preface" | "declaration" | "scope", customPrompt?: string) => {
    const { reveal, signal } = streams.start(key);
    const name = key[0].toUpperCase() + key.slice(1);
    try {
      const existing = policy.declaration[key];
      const r = await streamAI({ type: key, policy, customPrompt, existingContent: existing }, {
        signal,
        onPartial: (partial) => reveal.set(partial.text ?? ""),
      });
      const text = signal.aborted ? keepFinishedSentences(r.text ?? "") : r.text;
      if (text) {
        await reveal.finish(text);
        updatePolicy((p) => ({ declaration: { ...p.declaration, [key]: text } }));
        push(signal.aborted ? `${name} stopped. Finished sentences were kept.` : `${name} generated`, signal.aborted ? "info" : "success");
      } else if (signal.aborted) {
        push(`${name} stopped before any text was written`, "info");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end(key, reveal);
    }
  };

  return (
    <StepRoot>
      {SECTIONS.filter((s) => getSection(policy, s.key)?.enabled).map((s) => {
        const value = policy.declaration[s.key];
        const isBusy = streams.busy(s.key);
        const configured = getSection(policy, s.key);
        return (
          <Panel
            key={s.key}
            title={configured?.title || s.title}
            icon={s.icon}
            actions={
              <AIActionButton
                label="AI Write"
                loading={isBusy}
                onGenerate={(prompt) => generate(s.key, prompt)}
                onStop={() => streams.stop(s.key)}
              />
            }
          >
            <WritingField
              value={value}
              label={configured?.title || s.title}
              busy={isBusy}
              stream={streams.reveal(s.key)}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                updatePolicy((p) => ({ declaration: { ...p.declaration, [s.key]: e.target.value } }))
              }
              placeholder={s.hint}
            />
          </Panel>
        );
      })}

      {getSection(policy, "definitions")?.enabled && (
        <Panel title={getSection(policy, "definitions")?.title || "Definition & Methodology"} icon={<BookOpen size={17} strokeWidth={1.8} />}>
          <WritingField
            value={policy.definitions?.content || ""}
            label={getSection(policy, "definitions")?.title || "Definition & Methodology"}
            onChange={(e) => updatePolicy((p) => ({ definitions: { title: p.definitions?.title || "Living Wage", content: e.target.value } }))}
          />
        </Panel>
      )}
    </StepRoot>
  );
}
