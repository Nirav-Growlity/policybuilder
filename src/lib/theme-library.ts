"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DOCUMENT_THEMES,
  LEGACY_DOCUMENT_THEME_UPGRADES,
  getFullThemeOverrides,
  getPolicyDocumentTheme,
  normalizeDocumentThemeOverrides,
  upgradeDocumentThemeId,
} from "./document-themes";
import { FONT_FAMILY_OPTIONS } from "./typography";
import type { DocumentTypography, Policy, SavedDocumentTheme } from "./types";

const THEME_LIBRARY_VERSION = 1;

type ThemeLibraryState = {
  themes: SavedDocumentTheme[];
  hydrated: boolean;
  saveTheme: (theme: SavedDocumentTheme) => void;
  deleteTheme: (id: string) => void;
  setHydrated: (hydrated: boolean) => void;
};

export function createSavedDocumentTheme(
  policy: Policy,
  name: string,
  existing?: SavedDocumentTheme,
): SavedDocumentTheme {
  const normalizedName = name.trim().slice(0, 60);
  const now = new Date().toISOString();
  return {
    schemaVersion: THEME_LIBRARY_VERSION,
    id: existing?.id || crypto.randomUUID(),
    name: normalizedName,
    baseThemeId: getPolicyDocumentTheme(policy).id,
    overrides: getFullThemeOverrides(policy, normalizedName),
    typography: { ...getPolicyDocumentTheme(policy).defaults.typography, ...policy.typography },
    visualStyle: policy.visualStyle || getPolicyDocumentTheme(policy).defaults.visualStyle,
    logoPosition: policy.logoPosition || getPolicyDocumentTheme(policy).defaults.logoPosition,
    sdgDisplay: policy.sdgDisplay || getPolicyDocumentTheme(policy).defaults.sdgDisplay,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function getSavedThemePatch(theme: SavedDocumentTheme): Partial<Policy> {
  return {
    documentTheme: theme.baseThemeId,
    documentThemeOverrides: {
      ...structuredClone(theme.overrides),
      schemaVersion: 1,
      customThemeName: theme.name,
    },
    typography: { ...theme.typography },
    visualStyle: theme.visualStyle,
    logoPosition: theme.logoPosition,
    sdgDisplay: theme.sdgDisplay,
  };
}

export function isSavedThemeNameAvailable(
  themes: SavedDocumentTheme[],
  name: string,
  exceptId?: string,
): boolean {
  const candidate = name.trim().toLocaleLowerCase();
  return candidate.length >= 1
    && candidate.length <= 60
    && !themes.some((theme) => theme.id !== exceptId && theme.name.toLocaleLowerCase() === candidate);
}

export function nextThemeCopyName(themes: SavedDocumentTheme[], name: string): string {
  const base = `${name.replace(/\s+copy(?: \d+)?$/i, "")} copy`.slice(0, 60);
  if (isSavedThemeNameAvailable(themes, base)) return base;
  let index = 2;
  while (!isSavedThemeNameAvailable(themes, `${base} ${index}`.slice(0, 60))) index += 1;
  return `${base} ${index}`.slice(0, 60);
}

export function normalizeSavedDocumentTheme(value: unknown): SavedDocumentTheme | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<SavedDocumentTheme>;
  if (raw.schemaVersion !== 1 || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  if (!isSavedThemeNameAvailable([], raw.name)) return null;
  const rawBaseThemeId = raw.baseThemeId as unknown as string | undefined;
  const validBaseIds = new Set<string>([
    ...DOCUMENT_THEMES.map((theme) => theme.id),
    ...Object.keys(LEGACY_DOCUMENT_THEME_UPGRADES),
  ]);
  if (!rawBaseThemeId || !validBaseIds.has(rawBaseThemeId)) return null;
  const baseThemeId = upgradeDocumentThemeId(rawBaseThemeId);
  const typography = normalizeTypography(raw.typography);
  if (!typography) return null;
  if (!raw.visualStyle || !["corporate", "modern"].includes(raw.visualStyle)) return null;
  if (!raw.logoPosition || !["left", "center", "right"].includes(raw.logoPosition)) return null;
  if (!raw.sdgDisplay || !["names", "tiles"].includes(raw.sdgDisplay)) return null;
  return {
    schemaVersion: 1,
    id: raw.id,
    name: raw.name.trim(),
    baseThemeId,
    overrides: normalizeDocumentThemeOverrides(raw.overrides),
    typography,
    visualStyle: raw.visualStyle,
    logoPosition: raw.logoPosition,
    sdgDisplay: raw.sdgDisplay,
    createdAt: raw.createdAt || new Date(0).toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date(0).toISOString(),
  };
}

function normalizeTypography(value: unknown): DocumentTypography | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DocumentTypography>;
  const fonts = FONT_FAMILY_OPTIONS as readonly string[];
  if (!fonts.includes(raw.fontFamily || "")) return null;
  if (raw.headingFontFamily && !fonts.includes(raw.headingFontFamily)) return null;
  if (!isNumberInRange(raw.headingSize, 10, 24)) return null;
  if (!isNumberInRange(raw.subheadingSize, 9, 20)) return null;
  if (!isNumberInRange(raw.paragraphSize, 8, 16)) return null;
  if (!isNumberInRange(raw.lineSpacing, 1.15, 2)) return null;
  return {
    fontFamily: raw.fontFamily!,
    headingFontFamily: raw.headingFontFamily || raw.fontFamily!,
    headingSize: raw.headingSize!,
    subheadingSize: raw.subheadingSize!,
    paragraphSize: raw.paragraphSize!,
    lineSpacing: raw.lineSpacing!,
  };
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export const useThemeLibrary = create<ThemeLibraryState>()(
  persist(
    (set) => ({
      themes: [],
      hydrated: false,
      saveTheme: (theme) => set((state) => ({
        themes: [...state.themes.filter((item) => item.id !== theme.id), structuredClone(theme)]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      })),
      deleteTheme: (id) => set((state) => ({ themes: state.themes.filter((theme) => theme.id !== id) })),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "policycraft-theme-library-v1",
      version: THEME_LIBRARY_VERSION,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return window.localStorage;
      }),
      partialize: (state) => ({ themes: state.themes }),
      merge: (persisted, current) => {
        const rawThemes = (persisted as { themes?: unknown[] } | undefined)?.themes || [];
        const themes = rawThemes.map(normalizeSavedDocumentTheme).filter((theme): theme is SavedDocumentTheme => Boolean(theme));
        return { ...current, themes };
      },
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
