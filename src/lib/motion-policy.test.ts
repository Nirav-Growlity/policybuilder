import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Animations play on every machine. Windows reports prefers-reduced-motion
// whenever "Animation effects" is off (Remote Desktop, VMs, performance mode),
// so gating motion on it left those machines with no animation at all.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirs = ["app", "components", "lib"];
const gates: [RegExp, string][] = [
  [/prefers-reduced-motion/, "a prefers-reduced-motion media query"],
  [/\buseReducedMotion\b/, "Motion's useReducedMotion hook"],
  [/reducedMotion=["']user["']/, "MotionConfig reducedMotion=\"user\""],
  [/\bmotion-(?:reduce|safe):/, "a Tailwind motion-reduce/motion-safe variant"],
];

test("source never gates animation on the OS reduce-motion setting", () => {
  const violations: string[] = [];
  for (const dir of sourceDirs) {
    for (const entry of readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })) {
      if (!/\.(?:css|tsx?|mjs)$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      const file = path.join(dir, entry);
      const source = readFileSync(path.join(root, file), "utf8");
      for (const [pattern, description] of gates) {
        if (pattern.test(source)) violations.push(`${file}: ${description}`);
      }
    }
  }
  assert.deepEqual(violations, [], "animations must not depend on prefers-reduced-motion");
});
