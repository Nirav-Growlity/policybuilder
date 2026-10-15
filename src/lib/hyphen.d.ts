declare module "hyphen/en-us" {
  export function hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number; html?: boolean; exceptions?: string[] }): string;
}
