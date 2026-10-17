import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import type { SopRenderModel } from "../sop/render-types";
import { sopFontFiles } from "./fonts";
import { compileSopManual, type CompiledManual, type ManualAsset } from "./compile";

export type { CompiledManual, ManualAsset };

const root = process.cwd();
let compiler: NodeCompiler | null = null;
let template: string | null = null;
let compilesSinceEvict = 0;

function getCompiler() {
  compiler ??= NodeCompiler.create({
    workspace: join(root, ".typst-workspace"),
    fontArgs: [{ fontPaths: sopFontFiles(root) }],
  });
  return compiler;
}

function getTemplate() {
  template ??= readFileSync(join(root, "lib", "typst", "sop", "manual.typ"), "utf8");
  return template;
}

const cache = new Map<string, CompiledManual>();
const CACHE_LIMIT = 8;

/**
 * Renders a manual to PDF with the warm, shared Typst compiler. Identical
 * models (same content, same assets) are served from a small LRU.
 */
export function renderSopManual(model: SopRenderModel, assets: ManualAsset[] = []): CompiledManual {
  const key = createHash("sha1")
    .update(JSON.stringify(model))
    .update(assets.map((asset) => `${asset.path}:${asset.content.length}`).join("|"))
    .digest("hex");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const result = compileSopManual(getCompiler(), getTemplate(), model, assets, join(root, ".typst-workspace"));
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  if (++compilesSinceEvict >= 20) {
    getCompiler().evictCache(30);
    compilesSinceEvict = 0;
  }
  return result;
}
