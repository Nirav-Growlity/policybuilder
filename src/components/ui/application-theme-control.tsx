"use client";

import { useSyncExternalStore } from "react";
import { ToggleGroup } from "radix-ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const subscribe = () => () => undefined;
const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ApplicationThemeControl() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup.Root
      type="single"
      value={mounted ? theme ?? "system" : ""}
      onValueChange={(value) => { if (value) setTheme(value); }}
      disabled={!mounted}
      aria-label="Appearance"
      className="pc-theme-control"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <ToggleGroup.Item key={value} value={value} aria-label={`${label} theme`} title={`${label} theme`} className="pc-theme-option pc-focus">
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
