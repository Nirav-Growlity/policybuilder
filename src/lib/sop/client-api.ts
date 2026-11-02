/**
 * Browser fetch helpers for the Documents (SOP manual) API. Every request
 * carries the organization selector, the same way the policy routes do.
 */
import type { CompanyMasterSnapshot } from "../policycraft-types";
import type { PolicyCraftAccess } from "../policycraft-access-types";
import { policyCraftScopedUrl } from "../policycraft-scope-utils";
import type { ManualSummary, StoredManual } from "../manual-repository";
import type { Sop, SopCover, SopManual } from "./types";

export type { ManualSummary, StoredManual };
export type StoredSopManual = StoredManual<SopManual>;
export type ManualView = "active" | "archived";

export class ManualApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ManualApiError";
  }
}

/** The manual changed in another session; reload before saving again. */
export class ManualConflictError extends ManualApiError {
  constructor() {
    super("This manual changed in another window. Reload it before continuing.", 409);
    this.name = "ManualConflictError";
  }
}

export function manualsUrl(path: string, orgId: number | null): string {
  return policyCraftScopedUrl(`/api/documents/manuals${path}`, orgId ?? undefined);
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  if (response.status === 409) throw new ManualConflictError();
  if (!response.ok) throw new ManualApiError(await readError(response, fallback), response.status);
  return response.json() as Promise<T>;
}

const jsonHeaders = { "Content-Type": "application/json" };

export async function fetchAccess(): Promise<PolicyCraftAccess> {
  const response = await fetch("/api/policycraft/access", { cache: "no-store" });
  return json<PolicyCraftAccess>(response, "Could not verify workspace access.");
}

export async function fetchCompanySnapshot(orgId: number): Promise<CompanyMasterSnapshot | null> {
  const response = await fetch(policyCraftScopedUrl("/api/policycraft/bootstrap", orgId), { cache: "no-store" });
  const body = await json<{ company?: CompanyMasterSnapshot }>(response, "Could not load organization details.");
  return body.company ?? null;
}

export async function listSopManuals(orgId: number, view: ManualView = "active"): Promise<ManualSummary[]> {
  const response = await fetch(manualsUrl(`?kind=sop&view=${view}`, orgId), { cache: "no-store" });
  const body = await json<{ manuals?: ManualSummary[] }>(response, "Could not load your documents.");
  return body.manuals ?? [];
}

/** Every document in the organization, SOP manuals and employee handbooks alike. */
/** A null organization lists every organization's documents (admins only). */
export async function listManuals(orgId: number | null, view: ManualView = "active"): Promise<ManualSummary[]> {
  const response = await fetch(manualsUrl(`?view=${view}`, orgId), { cache: "no-store" });
  const body = await json<{ manuals?: ManualSummary[] }>(response, "Could not load your documents.");
  return body.manuals ?? [];
}

/** Without an organization, the server resolves it from the manual. */
export async function getSopManual(orgId: number | null, id: string): Promise<StoredSopManual> {
  const response = await fetch(manualsUrl(`/${encodeURIComponent(id)}`, orgId), { cache: "no-store" });
  const body = await json<{ manual: StoredSopManual }>(response, response.status === 404 ? "This manual is unavailable in your workspace." : "Could not load this manual.");
  return body.manual;
}

export async function createSopManual(orgId: number, input: { title: string; manual: SopManual; stage?: string }): Promise<StoredSopManual> {
  const response = await fetch(manualsUrl("", orgId), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ kind: "sop", title: input.title, stage: input.stage ?? "write", manual: input.manual, orgId }),
  });
  const body = await json<{ manual: StoredSopManual }>(response, "Could not create the manual.");
  return body.manual;
}

export async function saveSopManual(orgId: number, id: string, input: { title: string; stage: string; manual: SopManual; lockVersion: number }, signal?: AbortSignal): Promise<StoredSopManual> {
  const response = await fetch(manualsUrl(`/${encodeURIComponent(id)}`, orgId), {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ ...input, orgId }),
    signal,
  });
  const body = await json<{ manual: StoredSopManual }>(response, "Could not save this manual.");
  return body.manual;
}

export async function setSopManualArchived(orgId: number, id: string, archived: boolean): Promise<void> {
  const response = await fetch(manualsUrl(`/${encodeURIComponent(id)}`, orgId), {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ archived }),
  });
  await json<unknown>(response, archived ? "Could not archive that manual." : "Could not restore that manual.");
}

export async function deleteSopManual(orgId: number, id: string): Promise<void> {
  const response = await fetch(manualsUrl(`/${encodeURIComponent(id)}`, orgId), { method: "DELETE" });
  await json<unknown>(response, response.status === 404 ? "That archived manual is no longer available." : "Could not delete that manual.");
}

/** Renders the edited (unsaved) manual; with `sopId` only that SOP's pages. */
export async function fetchManualPreview(orgId: number, id: string, manual: object, options: { sopId?: string; signal?: AbortSignal } = {}): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const response = await fetch(manualsUrl(`/${encodeURIComponent(id)}/preview`, orgId), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ manual, orgId, ...(options.sopId ? { sopId: options.sopId } : {}) }),
    signal: options.signal,
    cache: "no-store",
  });
  if (!response.ok) throw new ManualApiError(await readError(response, "The preview could not be laid out."), response.status);
  return { bytes: new Uint8Array(await response.arrayBuffer()), pageCount: Number(response.headers.get("X-Page-Count")) || 0 };
}

/** A route another branch adds; 404/405 means it has not landed yet. */
const isMissingRoute = (status: number) => status === 404 || status === 405 || status === 501;

export type ManualDownloadResult = { status: "downloaded"; fileName: string } | { status: "unavailable" };

function fileNameFrom(response: Response, fallback: string) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]) : fallback;
}

/** Downloads the saved manual. Callers save pending edits first. */
export async function downloadSopManual(orgId: number, id: string, format: "pdf" | "docx", title: string): Promise<ManualDownloadResult> {
  const response = await fetch(manualsUrl(`/${encodeURIComponent(id)}/${format}`, orgId), { cache: "no-store" });
  if (format === "docx" && isMissingRoute(response.status)) return { status: "unavailable" };
  if (!response.ok) throw new ManualApiError(await readError(response, `Could not prepare the ${format === "pdf" ? "PDF" : "Word file"}.`), response.status);
  const fallback = `${title.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-") || "SOP-Manual"}.${format}`;
  const fileName = fileNameFrom(response, fallback);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { status: "downloaded", fileName };
}

/**
 * Whether the import route is deployed. It only answers POST, so a GET to it
 * is 405 when it exists and 404 when it does not.
 */
export async function isImportAvailable(orgId: number): Promise<boolean> {
  try {
    const response = await fetch(manualsUrl("/availability-check/import", orgId), { cache: "no-store" });
    return response.status !== 404 && response.status !== 501;
  } catch {
    return false;
  }
}

export type ImportResult = { status: "imported"; manual?: SopManual; sops?: Sop[] } | { status: "unavailable" };

/** Reads an existing SOP manual (.docx) into the manual. */
export async function importSopDocx(orgId: number, id: string, file: File, signal?: AbortSignal): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(manualsUrl(`/${encodeURIComponent(id)}/import`, orgId), { method: "POST", body: form, signal });
  if (isMissingRoute(response.status)) return { status: "unavailable" };
  const body = await json<{ manual?: SopManual; sops?: Sop[] }>(response, "Could not read that document.");
  return { status: "imported", manual: body.manual, sops: body.sops };
}

export type AiCoverResult = { status: "generated"; cover: SopCover } | { status: "unavailable" };

export async function generateSopAiCover(orgId: number, id: string, manual: object, instruction?: string, signal?: AbortSignal): Promise<AiCoverResult> {
  const response = await fetch(manualsUrl(`/${encodeURIComponent(id)}/ai-cover`, orgId), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ manual, orgId, ...(instruction ? { instruction } : {}) }),
    signal,
  });
  if (isMissingRoute(response.status)) return { status: "unavailable" };
  const body = await json<{ cover?: SopCover }>(response, "Could not generate a cover.");
  if (!body.cover) throw new ManualApiError("The cover service returned no cover.", 502);
  return { status: "generated", cover: body.cover };
}

const COVER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Stores a cover photo in the organization's asset library; returns its asset id. */
export async function uploadCoverImage(orgId: number, file: File): Promise<string> {
  if (!COVER_TYPES.has(file.type)) throw new ManualApiError("Use a PNG, JPEG or WebP image.", 400);
  if (file.size > 10 * 1024 * 1024) throw new ManualApiError("Use an image smaller than 10 MB.", 400);
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(policyCraftScopedUrl("/api/policycraft/cover-assets", orgId), { method: "POST", body: form, cache: "no-store" });
  const body = await json<{ asset?: { id?: string } }>(response, "The image could not be uploaded.");
  if (!body.asset?.id) throw new ManualApiError("The image could not be uploaded.", 502);
  return body.asset.id;
}

/** Browser URL for an image stored as a cover asset id (or a data/http URL). */
export function coverAssetSrc(orgId: number, reference: string | undefined): string | undefined {
  if (!reference) return undefined;
  if (reference.startsWith("data:") || reference.startsWith("/") || /^https?:\/\//i.test(reference)) return reference;
  return policyCraftScopedUrl(`/api/policycraft/cover-assets/${encodeURIComponent(reference)}`, orgId);
}
