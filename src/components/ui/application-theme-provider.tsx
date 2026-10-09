"use client";

import { ThemeProvider } from "next-themes";

export function ApplicationThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-pc-theme"
      storageKey="policycraft-application-theme"
      defaultTheme="system"
      enableSystem
      enableColorScheme={false}
    >
      {children}
    </ThemeProvider>
  );
}
