/**
 * Minimal, dependency-free XML reader for WordprocessingML parts.
 *
 * Word parts are machine-written and well formed, so a tokenizer over tags and
 * text is enough. It keeps namespace prefixes in element and attribute names
 * ("w:p", "w:val") because the WordprocessingML prefixes are stable in practice.
 */

export type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlChild[];
};

export type XmlChild = XmlNode | string;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXmlEntities(value: string): string {
  if (value.indexOf("&") === -1) return value;
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

const ATTR_PATTERN = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(source))) {
    attrs[match[1]] = decodeXmlEntities(match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/** Parses an XML document and returns a synthetic root whose children are the top-level nodes. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  const length = xml.length;
  let index = 0;

  while (index < length) {
    const open = xml.indexOf("<", index);
    if (open === -1) {
      pushText(stack[stack.length - 1], xml.slice(index));
      break;
    }
    if (open > index) pushText(stack[stack.length - 1], xml.slice(index, open));

    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      index = end === -1 ? length : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      const text = xml.slice(open + 9, end === -1 ? length : end);
      stack[stack.length - 1].children.push(text);
      index = end === -1 ? length : end + 3;
      continue;
    }
    if (xml[open + 1] === "?" || xml[open + 1] === "!") {
      const end = xml.indexOf(">", open + 1);
      index = end === -1 ? length : end + 1;
      continue;
    }

    const close = findTagEnd(xml, open + 1);
    const body = xml.slice(open + 1, close);
    index = close + 1;

    if (body[0] === "/") {
      const name = body.slice(1).trim();
      // Pop to the matching element; tolerate stray closers.
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].name === name) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const selfClosing = body.endsWith("/");
    const inner = selfClosing ? body.slice(0, -1) : body;
    const nameEnd = inner.search(/[\s]/);
    const name = nameEnd === -1 ? inner : inner.slice(0, nameEnd);
    const node: XmlNode = {
      name,
      attrs: nameEnd === -1 ? {} : parseAttrs(inner.slice(nameEnd)),
      children: [],
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root;
}

function findTagEnd(xml: string, from: number): number {
  let quote = "";
  for (let i = from; i < xml.length; i += 1) {
    const ch = xml[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return xml.length;
}

function pushText(parent: XmlNode, raw: string) {
  if (!raw) return;
  parent.children.push(decodeXmlEntities(raw));
}

export function isElement(child: XmlChild | undefined): child is XmlNode {
  return typeof child === "object" && child !== null;
}

export function childElements(node: XmlNode, name?: string): XmlNode[] {
  const result: XmlNode[] = [];
  for (const child of node.children) {
    if (isElement(child) && (!name || child.name === name)) result.push(child);
  }
  return result;
}

export function firstChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const child of node.children) {
    if (isElement(child) && child.name === name) return child;
  }
  return undefined;
}

/** Depth-first search for the first descendant with this name. */
export function findDescendant(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const child of node.children) {
    if (!isElement(child)) continue;
    if (child.name === name) return child;
    const nested = findDescendant(child, name);
    if (nested) return nested;
  }
  return undefined;
}

export function findDescendants(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node.children) {
    if (!isElement(child)) continue;
    if (child.name === name) out.push(child);
    findDescendants(child, name, out);
  }
  return out;
}

export function attr(node: XmlNode | undefined, name: string): string | undefined {
  return node?.attrs[name];
}

/** Reads `w:val` of a named child, e.g. `childVal(pPr, "w:pStyle")`. */
export function childVal(node: XmlNode | undefined, name: string): string | undefined {
  return firstChild(node, name)?.attrs["w:val"];
}

/** A WordprocessingML on/off property: present without val, or val not false/0/off. */
export function onOff(node: XmlNode | undefined, name: string): boolean | undefined {
  const prop = firstChild(node, name);
  if (!prop) return undefined;
  const val = prop.attrs["w:val"];
  return !(val === "0" || val === "false" || val === "off" || val === "none");
}
