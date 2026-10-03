import { NextResponse } from "next/server";
import { getPolicyCraftActorResult, isPolicyCraftSameOriginRequest, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import {
  deletePolicyCraftUserSignature,
  getPolicyCraftUserSignature,
  InvalidSignatureError,
  normalizePolicyCraftSignature,
  savePolicyCraftUserSignature,
} from "@/lib/policycraft-signature-repository";

const MAX_REQUEST_BYTES = 1_500_000;

export const runtime = "nodejs";

function privateJson(data: unknown, status = 200) {
  const response = NextResponse.json(data, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function isSignatureTableMissing(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ER_NO_SUCH_TABLE";
}

function storageUnavailable() {
  return privateJson({ error: "Signature storage is not configured yet. Please contact your administrator." }, 503);
}

async function readJsonWithinLimit(request: Request): Promise<unknown | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return null;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export async function GET() {
  const { actor, response } = await getPolicyCraftActorResult();
  if (!actor) return response || privateJson({ error: "Unauthorized" }, 401);

  try {
    const signature = await getPolicyCraftUserSignature(actor.user.id);
    return privateJson({
      userId: actor.user.id,
      signature: signature
        ? { dataUrl: `data:image/png;base64,${signature.bytes.toString("base64")}`, updatedAt: signature.updatedAt }
        : null,
    });
  } catch (error) {
    if (isSignatureTableMissing(error)) return storageUnavailable();
    throw error;
  }
}

export async function PUT(request: Request) {
  const { actor, response } = await getPolicyCraftActorResult();
  if (!actor) return response || privateJson({ error: "Unauthorized" }, 401);
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;

  const body = await readJsonWithinLimit(request);
  if (!body || typeof body !== "object" || !("dataUrl" in body)) {
    return privateJson({ error: "A valid PNG signature dataUrl is required." }, 400);
  }

  try {
    const bytes = await normalizePolicyCraftSignature(body.dataUrl);
    await savePolicyCraftUserSignature(actor.user.id, bytes);
    const signature = await getPolicyCraftUserSignature(actor.user.id);
    if (!signature) throw new Error("Saved signature could not be loaded");
    return privateJson({
      userId: actor.user.id,
      signature: { dataUrl: `data:image/png;base64,${signature.bytes.toString("base64")}`, updatedAt: signature.updatedAt },
    });
  } catch (error) {
    if (error instanceof InvalidSignatureError) {
      return privateJson({ error: error.message }, 400);
    }
    if (isSignatureTableMissing(error)) return storageUnavailable();
    console.error("PolicyCraft signature save failed", error);
    return privateJson({ error: "Could not save the signature." }, 500);
  }
}

export async function DELETE(request: Request) {
  const { actor, response } = await getPolicyCraftActorResult();
  if (!actor) return response || privateJson({ error: "Unauthorized" }, 401);
  if (!isPolicyCraftSameOriginRequest(request)) return privateJson({ error: "A trusted same-origin request is required." }, 403);

  try {
    await deletePolicyCraftUserSignature(actor.user.id);
    return privateJson({ signature: null });
  } catch (error) {
    if (isSignatureTableMissing(error)) return storageUnavailable();
    throw error;
  }
}
