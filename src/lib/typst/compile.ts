import { join } from "node:path";
import type { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import type { SopRenderModel } from "../sop/render-types";

/** A file the template reads (logo, cover image), mapped into the virtual workspace. */
export type ManualAsset = { path: string; content: Buffer };

/** `anchorPages` maps each heading label (render-model anchor) to its physical page. */
export type CompiledManual = { pdf: Buffer; pageCount: number; anchorPages: Record<string, number>; svg?: string };

export class TypstCompileError extends Error {
  constructor(readonly diagnostics: unknown) {
    super("The document could not be laid out.");
    this.name = "TypstCompileError";
  }
}

/**
 * Lays out `template` with `model` at /model.json and `assets` beside it. All
 * inputs are shadow files, so nothing is read from or written to disk.
 */
export function compileTypstDocument(compiler: NodeCompiler, template: string, model: unknown, assets: ManualAsset[], workspace: string) {
  compiler.resetShadow();
  compiler.mapShadow(join(workspace, "model.json"), Buffer.from(JSON.stringify(model)));
  for (const asset of assets) compiler.mapShadow(join(workspace, asset.path), asset.content);
  const result = compiler.compile({ mainFileContent: template });
  const error = result.takeError();
  if (error) throw new TypstCompileError(compiler.fetchDiagnostics(error));
  return result.result!;
}

/** Pure compile step, shared by the server engine and offline scripts. */
export function compileSopManual(
  compiler: NodeCompiler,
  template: string,
  model: SopRenderModel,
  assets: ManualAsset[],
  workspace: string,
  options: { svg?: boolean } = {},
): CompiledManual {
  const document = compileTypstDocument(compiler, template, model, assets, workspace);
  const pdf = compiler.pdf(document);
  const pages = compiler.query(document, { selector: "<sop-page-count>", field: "value" }) as number[] | undefined;
  const anchors = compiler.query(document, { selector: "<sop-anchor-pages>", field: "value" }) as Array<Array<[string, number]>> | undefined;
  return {
    pdf,
    pageCount: pages?.[0] ?? countPdfPages(pdf),
    anchorPages: Object.fromEntries(anchors?.[0] ?? []),
    ...(options.svg ? { svg: compiler.svg(document) } : {}),
  };
}

function countPdfPages(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
