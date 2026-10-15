import JSZip from "jszip";
import { SOFT_HYPHEN } from "../hyphenation";

const TEXT_NODE = /(<w:t(?: [^>]*)?>)([^<]*)<\/w:t>/g;

/**
 * Word prints a raw U+00AD as a visible hyphen. It only treats the native
 * <w:softHyphen/> run element as an optional break, so each soft hyphen the
 * render model inserted is split out of its text node into one.
 */
export async function convertSoftHyphens(docx: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docx);
  const documentPath = "word/document.xml";
  const xml = await zip.file(documentPath)?.async("string");
  if (!xml?.includes(SOFT_HYPHEN)) return docx;
  zip.file(documentPath, xml.replace(TEXT_NODE, (node, _open: string, text: string) => text.includes(SOFT_HYPHEN)
    ? text.split(SOFT_HYPHEN).map((part) => `<w:t xml:space="preserve">${part}</w:t>`).join("<w:softHyphen/>")
    : node));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
