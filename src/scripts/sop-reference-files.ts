import fs from "fs";
import path from "path";

/** Reference SOP manual folders, relative to the repository's parent checkout. */
export const SOP_REFERENCE_FOLDERS = [
  "SOP",
  path.join("SOP Manual  Employee Handbook", "SOP MANUAL"),
  path.join("Employee Handbook - SOP Manual", "SOP"),
];

/**
 * Finds the folder that holds the reference manuals: `SOP_REFERENCE_ROOT`, or
 * the nearest ancestor of this file that contains an `SOP` folder (works from
 * the main checkout and from `.claude/worktrees/*`).
 */
export function findSopReferenceRoot(): string | undefined {
  const fromEnv = process.env.SOP_REFERENCE_ROOT;
  if (fromEnv && fs.existsSync(path.join(fromEnv, "SOP"))) return fromEnv;
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(dir, "SOP")) && fs.statSync(path.join(dir, "SOP")).isDirectory()) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Every SOP manual .docx in the reference folders (employee handbooks excluded). */
export function listSopReferenceFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.docx$/i.test(entry.name) && !entry.name.startsWith("~$") && !/handbook/i.test(entry.name)) files.push(full);
    }
  };
  for (const folder of SOP_REFERENCE_FOLDERS) {
    const dir = path.join(root, folder);
    if (fs.existsSync(dir)) walk(dir);
  }
  return files;
}
