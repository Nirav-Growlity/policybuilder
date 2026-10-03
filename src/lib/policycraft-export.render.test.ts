import assert from "node:assert/strict";
import test from "node:test";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import JSZip from "jszip";
import sharp from "sharp";
import { initialPolicy } from "./store";
import { prepareAuthorizedPolicyExport, type PolicyExportPorts } from "./policycraft-export";
import { generateDocx } from "./docx/generate";
import { generatePdf } from "./pdf/generate";

const actor = { user: { id: "7", name: "Current editor", email: "editor@example.com" } };

test("authorized private cover artwork and current actor signature reach PDF preview and both exports", async () => {
  const artworkPng = await sharp(Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="450"><rect width="320" height="450" fill="#146B5A"/><circle cx="160" cy="225" r="90" fill="#F5B642"/></svg>',
  )).png().toBuffer();
  const signaturePng = await sharp(Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70"><path d="M8 55 C40 4 62 68 95 30 S150 52 226 10" fill="none" stroke="#173F4B" stroke-width="5"/></svg>',
  )).png().toBuffer();
  const artworkDataUrl = `data:image/png;base64,${artworkPng.toString("base64")}`;
  const policy = initialPolicy("environmental");
  policy.showAcknowledgement = true;
  policy.coverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "custom",
    background: { color: "#FFFFFF", assetId: "private-cover-artwork", fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [],
  };

  let resolvedOrganizationId: number | undefined;
  let signatureUserId: string | undefined;
  const ports: PolicyExportPorts<typeof actor> = {
    actor: async () => actor,
    organization: async () => ({ organization: { id: 23 } }),
    assets: async (input, organizationId) => {
      resolvedOrganizationId = organizationId;
      return {
        ...input,
        coverComposition: {
          ...input.coverComposition!,
          background: { ...input.coverComposition!.background, assetId: artworkDataUrl },
        },
      };
    },
    signature: async (userId) => {
      signatureUserId = userId;
      return { bytes: signaturePng };
    },
  };

  const prepared = await prepareAuthorizedPolicyExport({
    policy,
    orgId: 23,
    includeAuthorSignature: true,
    authorSignatureDate: "2026-10-01",
    createdByUserId: "99",
  }, ports);
  assert.equal(resolvedOrganizationId, 23);
  assert.equal(signatureUserId, actor.user.id);
  assert.equal(prepared.policy.coverComposition?.background.assetId, artworkDataUrl);
  assert.equal(prepared.authorApproval?.displayName, actor.user.name);

  const pdfBytes = await generatePdf(prepared.policy, prepared.authorApproval, prepared.cacheScope);
  assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
  const pdfImageDimensions: Array<[number, number]> = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const operatorList = await page.getOperatorList();
      for (let index = 0; index < operatorList.fnArray.length; index++) {
        if (operatorList.fnArray[index] === OPS.paintImageXObject) {
          const args = operatorList.argsArray[index];
          if (typeof args?.[1] === "number" && typeof args[2] === "number") {
            pdfImageDimensions.push([args[1], args[2]]);
          }
        }
      }
    }
    assert.ok(pdfImageDimensions.some(([width, height]) => width === 240 && height === 70), "PDF should embed the injected current actor signature image");
    assert.ok(pdfImageDimensions.some(([width, height]) => width >= 700 && height >= 1000), "PDF should embed the resolved full-page private cover artwork");
  } finally {
    await pdf.destroy();
  }

  const docx = await JSZip.loadAsync(await generateDocx(prepared.policy, prepared.authorApproval));
  const documentXml = await docx.file("word/document.xml")!.async("string");
  assert.match(documentXml, />SIGNATURE</, "Word package should retain the acknowledgement signature field");
  const mediaFiles = Object.values(docx.files).filter((file) => !file.dir && /^word\/media\//.test(file.name));
  const mediaBytes = await Promise.all(mediaFiles.map((file) => file.async("nodebuffer")));
  assert.ok(mediaBytes.some((bytes) => bytes.equals(signaturePng)), "Word package should embed the injected current actor signature bytes");
  const mediaMetadata = await Promise.all(mediaBytes.map((bytes) => sharp(bytes).metadata()));
  assert.ok(mediaMetadata.some(({ width, height }) => width === 2480 && height === 3508), "Word package should embed the resolved full-page private cover artwork");
});
