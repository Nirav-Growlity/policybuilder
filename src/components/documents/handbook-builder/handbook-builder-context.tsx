"use client";

import * as React from "react";
import type { BuilderMode } from "../builder/builder-context";

/** Actions the handbook builder container owns (saving, AI generation) for the chrome and editors below it. */
export type HandbookBuilderActions = {
  orgId: number;
  manualId: string;
  workspaceHref: string;
  /** Writes these chapters with AI (and the front matter when asked), four at a time. */
  generate(chapterIds: string[], options?: { includeFrontMatter?: boolean }): void;
  /** Retries one chapter whose generation failed or never started. */
  retry(chapterId: string): void;
  /** Stops every chapter being written. */
  cancelGeneration(): void;
  /** Saves pending edits now; rejects when the save cannot land. */
  flush(): Promise<void>;
  /** Opens the company and handbook details dialog. */
  openDetails(): void;
  setMode(mode: BuilderMode): void;
};

export const HandbookBuilderContext = React.createContext<HandbookBuilderActions | null>(null);

export function useHandbookBuilderActions(): HandbookBuilderActions {
  const context = React.useContext(HandbookBuilderContext);
  if (!context) throw new Error("useHandbookBuilderActions must be used inside the handbook builder");
  return context;
}
