"use client";
import { create } from "zustand";
import type { Policy } from "./types";

export const policyPreviewKey = (policy: Policy) => JSON.stringify(policy);
export const usePdfPreviewState = create<{ key: string; blob: Blob | null; set: (key: string, blob: Blob) => void }>(set => ({
  key: "", blob: null, set: (key, blob) => set({ key, blob }),
}));
