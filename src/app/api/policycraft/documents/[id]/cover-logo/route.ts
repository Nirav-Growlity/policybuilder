import { NextResponse } from "next/server";
import { getPolicyCraftAuthResult, parsePolicyCraftOrganizationSelector } from "@/lib/policycraft-auth";
import { getDocumentCoverLogo } from "@/lib/policycraft-repository";
import { COVER_THUMBNAIL_HEADERS, coverThumbnail } from "@/lib/cover-thumbnail";

// Serves a document's embedded logo to list thumbnails. The URL carries a content
// hash (`v`), so the browser can keep it while the logo is unchanged.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const selector = parsePolicyCraftOrganizationSelector(searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const { auth, response } = await getPolicyCraftAuthResult({ documentId: id, ...(selector.provided ? { organizationId: selector.organizationId } : {}), operation: "read" });
  if (!auth) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const logo = await getDocumentCoverLogo(auth.organization.id, id);
  if (!logo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const thumbnail = searchParams.get("thumb") === "1" ? await coverThumbnail(logo.content) : null;
  if (thumbnail) return new NextResponse(new Uint8Array(thumbnail), { headers: { ...COVER_THUMBNAIL_HEADERS, "Cache-Control": "private, max-age=86400, immutable" } });
  return new NextResponse(new Uint8Array(logo.content), {
    headers: {
      "Content-Type": logo.mimeType,
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
