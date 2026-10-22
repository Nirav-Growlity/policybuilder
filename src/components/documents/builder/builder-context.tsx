"use client";

import * as React from "react";

export type BuilderMode = "write" | "design" | "review";

/** Actions the builder container owns (saving, AI generation) for the chrome and editors below it. */
export type SopBuilderActions = {
  orgId: number;
  manualId: string;
  workspaceHref: string;
  /** Writes these SOPs with AI (and the front matter when asked), four at a time. */
  generate(sopIds: string[], options?: { includeFrontMatter?: boolean }): void;
  /** Retries one SOP whose generation failed or never started. */
  retry(sopId: string): void;
  /** Stops every SOP being written. */
  cancelGeneration(): void;
  /** Saves pending edits now; rejects when the save cannot land. */
  flush(): Promise<void>;
  /** Opens the company and manual details dialog. */
  openDetails(): void;
  setMode(mode: BuilderMode): void;
};

export const SopBuilderContext = React.createContext<SopBuilderActions | null>(null);

export function useSopBuilderActions(): SopBuilderActions {
  const context = React.useContext(SopBuilderContext);
  if (!context) throw new Error("useSopBuilderActions must be used inside the SOP builder");
  return context;
}
