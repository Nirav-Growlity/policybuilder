/**
 * Reads a JSON document that is still being written, such as a model response
 * arriving token by token. Complete values parse normally; an unfinished
 * string keeps the characters received so far; a key, number or literal that
 * has not finished arriving is left out. Returns undefined until a value starts.
 */
export function parsePartialJson(input: string): unknown {
  let i = 0;
  const INCOMPLETE = Symbol("incomplete");

  const skipSpace = () => { while (i < input.length && /\s/.test(input[i])) i++; };

  const readString = (): { value: string; closed: boolean } => {
    i++; // opening quote
    let value = "";
    while (i < input.length) {
      const ch = input[i];
      if (ch === '"') { i++; return { value, closed: true }; }
      if (ch !== "\\") { value += ch; i++; continue; }
      const next = input[i + 1];
      if (next === undefined) { i = input.length; break; }
      if (next === "u") {
        const hex = input.slice(i + 2, i + 6);
        if (hex.length < 4) { i = input.length; break; }
        value += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      const escapes: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
      value += escapes[next] ?? next;
      i += 2;
    }
    return { value, closed: false };
  };

  const readValue = (): unknown => {
    skipSpace();
    if (i >= input.length) return INCOMPLETE;
    const ch = input[i];
    if (ch === '"') return readString().value;
    if (ch === "{") {
      i++;
      const object: Record<string, unknown> = {};
      for (;;) {
        skipSpace();
        if (i >= input.length) return object;
        if (input[i] === "}") { i++; return object; }
        if (input[i] === ",") { i++; continue; }
        if (input[i] !== '"') return object;
        const key = readString();
        if (!key.closed) return object;
        skipSpace();
        if (input[i] !== ":") return object;
        i++;
        const value = readValue();
        if (value === INCOMPLETE) return object;
        object[key.value] = value;
      }
    }
    if (ch === "[") {
      i++;
      const array: unknown[] = [];
      for (;;) {
        skipSpace();
        if (i >= input.length) return array;
        if (input[i] === "]") { i++; return array; }
        if (input[i] === ",") { i++; continue; }
        const value = readValue();
        if (value === INCOMPLETE) return array;
        array.push(value);
      }
    }
    const literal = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(input.slice(i));
    if (!literal) return INCOMPLETE;
    // A literal that touches the end of the input may still be growing.
    if (i + literal[0].length >= input.length) { i = input.length; return INCOMPLETE; }
    i += literal[0].length;
    return JSON.parse(literal[0]);
  };

  const value = readValue();
  return value === INCOMPLETE ? undefined : value;
}
