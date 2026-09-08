// Source-derived cover motifs shared by the eight canonical document themes.
// Every motif is drawn from SVG primitives (no third-party artwork, no text,
// no remote assets) so it renders in the browser, headless-Chrome PDF export,
// and Word's native SVG handling via lib/docx svgParagraph().
export type MotifColors = {
  primary: string;
  accent: string;
  soft: string;
  line: string;
  paper: string;
  ink: string;
};

export type CoverMotifScene =
  | "sample-quiet-title" | "sample-control-grid" | "sample-table-ledger"
  | "sample-editorial-image" | "sample-framework-map" | "sample-compact-strip"
  | "sample-heritage-crest" | "sample-operating-tabs"
  | "civic-plain" | "signal-split" | "open-broad" | "swiss-poster"
  | "ledger-rail" | "decision-stamp" | "routing-slip"
  | "seal-medallion" | "clause-code" | "exhibit-file"
  | "gazette-masthead" | "colonnade-rule" | "indenture-margin"
  | "chapterhouse-drop" | "broadsheet-columns" | "fieldbook-grid"
  | "canopy-band" | "summit-target" | "commons-card"
  | "scoreboard-tiles" | "tape-ledger" | "dial-review"
  | "proceedings-abstract" | "blueprint-spec" | "docket-matrix";

const open = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true">`;

const SCENES: Record<CoverMotifScene, (c: MotifColors) => string> = {
  "sample-quiet-title": (c) => `${open(240, 70)}<rect x="0" y="0" width="240" height="70" fill="${c.paper}"/><rect x="0" y="8" width="240" height="2" fill="${c.primary}"/><rect x="0" y="60" width="88" height="4" fill="${c.accent}"/><circle cx="210" cy="35" r="18" fill="${c.soft}" stroke="${c.primary}" stroke-width="2"/><path d="M202 35 l6 6 11-13" fill="none" stroke="${c.primary}" stroke-width="3"/></svg>`,
  "sample-control-grid": (c) => `${open(220, 120)}<rect x="0" y="0" width="220" height="120" fill="${c.paper}" stroke="${c.primary}" stroke-width="3"/><path d="M0 32 H220 M0 64 H220 M0 96 H220 M74 0 V120 M148 0 V120" stroke="${c.line}" stroke-width="2"/><rect x="0" y="0" width="74" height="32" fill="${c.primary}"/><rect x="148" y="64" width="72" height="32" fill="${c.accent}"/><circle cx="37" cy="16" r="7" fill="${c.paper}"/></svg>`,
  "sample-table-ledger": (c) => `${open(240, 96)}<rect x="0" y="0" width="240" height="96" fill="${c.paper}" stroke="${c.primary}" stroke-width="3"/><rect x="0" y="0" width="240" height="18" fill="${c.primary}"/><path d="M0 38 H240 M0 58 H240 M0 78 H240 M72 18 V96 M156 18 V96" stroke="${c.line}" stroke-width="2"/><rect x="12" y="25" width="42" height="6" fill="${c.accent}"/><rect x="168" y="25" width="54" height="6" fill="${c.primary}"/></svg>`,
  "sample-editorial-image": (c) => `${open(220, 120)}<rect x="0" y="0" width="220" height="120" fill="${c.soft}"/><circle cx="170" cy="30" r="20" fill="${c.accent}" opacity=".8"/><path d="M0 96 L54 48 L98 78 L144 42 L220 94 V120 H0 Z" fill="${c.primary}" opacity=".82"/><rect x="14" y="14" width="92" height="5" fill="${c.ink}"/><rect x="14" y="26" width="64" height="4" fill="${c.line}"/></svg>`,
  "sample-framework-map": (c) => `${open(240, 110)}<rect x="0" y="0" width="240" height="110" fill="${c.paper}"/><path d="M40 55 H200 M120 20 V90" stroke="${c.line}" stroke-width="3"/><circle cx="40" cy="55" r="18" fill="${c.primary}"/><circle cx="120" cy="20" r="18" fill="${c.soft}" stroke="${c.primary}" stroke-width="2"/><circle cx="120" cy="90" r="18" fill="${c.accent}"/><circle cx="200" cy="55" r="18" fill="${c.soft}" stroke="${c.primary}" stroke-width="2"/></svg>`,
  "sample-compact-strip": (c) => `${open(240, 58)}<rect x="0" y="0" width="240" height="58" fill="${c.primary}"/><rect x="12" y="12" width="48" height="34" fill="${c.accent}"/><rect x="74" y="16" width="88" height="5" fill="${c.paper}"/><rect x="74" y="29" width="132" height="4" fill="${c.soft}"/><rect x="216" y="14" width="10" height="30" fill="${c.paper}"/></svg>`,
  "sample-heritage-crest": (c) => `${open(130, 140)}<path d="M65 8 L112 24 V68 C112 104 88 124 65 134 C42 124 18 104 18 68 V24 Z" fill="${c.soft}" stroke="${c.primary}" stroke-width="4"/><path d="M65 28 L92 38 V66 C92 88 78 101 65 108 C52 101 38 88 38 66 V38 Z" fill="${c.paper}" stroke="${c.accent}" stroke-width="2"/><path d="M48 68 L60 80 L83 54" fill="none" stroke="${c.primary}" stroke-width="6"/></svg>`,
  "sample-operating-tabs": (c) => `${open(240, 100)}<rect x="0" y="18" width="240" height="82" fill="${c.paper}" stroke="${c.line}" stroke-width="2"/><rect x="14" y="0" width="58" height="28" fill="${c.primary}"/><rect x="78" y="8" width="58" height="20" fill="${c.soft}" stroke="${c.line}"/><rect x="142" y="8" width="58" height="20" fill="${c.accent}"/><rect x="16" y="44" width="186" height="5" fill="${c.line}"/><rect x="16" y="60" width="142" height="5" fill="${c.line}"/><rect x="16" y="76" width="174" height="5" fill="${c.primary}"/></svg>`,
  "civic-plain": (c) =>
    `${open(220, 28)}<rect x="0" y="13" width="176" height="2" fill="${c.primary}"/><rect x="188" y="7" width="14" height="14" transform="rotate(45 195 14)" fill="${c.accent}"/><rect x="208" y="13" width="12" height="2" fill="${c.line}"/></svg>`,
  "signal-split": (c) =>
    `${open(200, 120)}<polygon points="0,120 120,0 200,0 200,120" fill="${c.soft}"/><polygon points="0,120 120,0 132,0 12,120" fill="${c.primary}"/><rect x="0" y="104" width="72" height="8" fill="${c.accent}"/></svg>`,
  "open-broad": (c) =>
    `${open(220, 72)}<rect x="0" y="0" width="220" height="14" fill="${c.primary}"/><rect x="0" y="24" width="168" height="10" fill="${c.line}"/><rect x="0" y="44" width="196" height="10" fill="${c.line}"/><rect x="0" y="62" width="60" height="10" fill="${c.accent}"/></svg>`,
  "swiss-poster": (c) =>
    `${open(120, 120)}<rect x="0" y="0" width="52" height="52" fill="${c.ink}"/><rect x="60" y="0" width="52" height="52" fill="${c.primary}"/><rect x="0" y="60" width="52" height="52" fill="${c.line}"/><rect x="60" y="60" width="52" height="52" fill="${c.accent}"/></svg>`,
  "ledger-rail": (c) =>
    `${open(120, 160)}<rect x="0" y="0" width="30" height="160" fill="${c.primary}"/><rect x="44" y="14" width="76" height="3" fill="${c.line}"/><rect x="44" y="34" width="60" height="3" fill="${c.line}"/><rect x="44" y="54" width="70" height="3" fill="${c.accent}"/><rect x="44" y="88" width="76" height="3" fill="${c.line}"/><rect x="44" y="108" width="52" height="3" fill="${c.line}"/><rect x="44" y="128" width="64" height="3" fill="${c.line}"/></svg>`,
  "decision-stamp": (c) =>
    `${open(180, 120)}<rect x="8" y="8" width="164" height="104" fill="none" stroke="${c.primary}" stroke-width="6"/><rect x="22" y="22" width="136" height="76" fill="none" stroke="${c.accent}" stroke-width="2" stroke-dasharray="7 5"/><polygon points="90,44 97,63 117,63 101,75 107,94 90,82 73,94 79,75 63,63 83,63" fill="${c.accent}"/></svg>`,
  "routing-slip": (c) =>
    `${open(220, 96)}<rect x="0" y="0" width="84" height="40" fill="${c.soft}" stroke="${c.line}"/><rect x="136" y="0" width="84" height="40" fill="${c.soft}" stroke="${c.line}"/><rect x="68" y="56" width="84" height="40" fill="${c.primary}"/><line x1="84" y1="20" x2="118" y2="20" stroke="${c.accent}" stroke-width="3"/><polygon points="118,13 132,20 118,27" fill="${c.accent}"/><line x1="136" y1="20" x2="102" y2="76" stroke="${c.accent}" stroke-width="3"/><polygon points="110,66 102,76 92,70" fill="${c.accent}"/></svg>`,
  "seal-medallion": (c) =>
    `${open(140, 140)}<circle cx="70" cy="70" r="62" fill="none" stroke="${c.primary}" stroke-width="6"/><circle cx="70" cy="70" r="50" fill="none" stroke="${c.accent}" stroke-width="2"/><circle cx="70" cy="70" r="34" fill="${c.soft}"/><polyline points="54,70 65,81 88,58" fill="none" stroke="${c.primary}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "clause-code": (c) =>
    `${open(160, 120)}<rect x="0" y="0" width="10" height="120" fill="${c.primary}"/><rect x="26" y="12" width="8" height="26" fill="${c.accent}"/><rect x="26" y="48" width="8" height="26" fill="${c.primary}"/><rect x="26" y="84" width="8" height="26" fill="${c.primary}"/><rect x="48" y="12" width="112" height="3" fill="${c.line}"/><rect x="48" y="26" width="88" height="3" fill="${c.line}"/><rect x="48" y="48" width="112" height="3" fill="${c.line}"/><rect x="48" y="62" width="96" height="3" fill="${c.line}"/><rect x="48" y="84" width="104" height="3" fill="${c.line}"/><rect x="48" y="98" width="72" height="3" fill="${c.line}"/></svg>`,
  "exhibit-file": (c) =>
    `${open(200, 110)}<rect x="40" y="18" width="150" height="84" fill="${c.paper}" stroke="${c.line}" stroke-width="2"/><rect x="10" y="34" width="150" height="68" fill="${c.paper}" stroke="${c.line}" stroke-width="2"/><rect x="10" y="8" width="52" height="26" fill="${c.primary}"/><rect x="68" y="14" width="52" height="26" fill="${c.accent}"/><rect x="126" y="20" width="52" height="26" fill="${c.soft}" stroke="${c.line}" stroke-width="2"/><rect x="24" y="52" width="120" height="4" fill="${c.line}"/><rect x="24" y="64" width="96" height="4" fill="${c.line}"/><rect x="24" y="76" width="108" height="4" fill="${c.line}"/></svg>`,
  "gazette-masthead": (c) =>
    `${open(120, 140)}<path d="M60 6 L108 24 V68 C108 102 86 122 60 134 C34 122 12 102 12 68 V24 Z" fill="none" stroke="${c.primary}" stroke-width="6"/><path d="M60 20 L94 32 V66 C94 92 78 106 60 116 C42 106 26 92 26 66 V32 Z" fill="${c.soft}"/><rect x="46" y="52" width="28" height="34" fill="${c.primary}"/><polygon points="60,30 66,46 60,42 54,46" fill="${c.accent}"/><rect x="0" y="0" width="120" height="2" fill="${c.accent}"/></svg>`,
  "colonnade-rule": (c) =>
    `${open(200, 90)}<rect x="0" y="0" width="200" height="8" fill="${c.primary}"/><rect x="30" y="20" width="3" height="70" fill="${c.line}"/><rect x="98" y="20" width="3" height="70" fill="${c.primary}"/><rect x="166" y="20" width="3" height="70" fill="${c.line}"/><rect x="0" y="86" width="200" height="4" fill="${c.accent}"/></svg>`,
  "indenture-margin": (c) =>
    `${open(160, 140)}<line x1="44" y1="0" x2="44" y2="140" stroke="${c.accent}" stroke-width="2"/><rect x="12" y="12" width="20" height="12" fill="${c.primary}"/><rect x="12" y="52" width="20" height="12" fill="${c.primary}"/><rect x="12" y="92" width="20" height="12" fill="${c.accent}"/><rect x="58" y="12" width="102" height="4" fill="${c.line}"/><rect x="58" y="24" width="80" height="4" fill="${c.line}"/><rect x="58" y="52" width="102" height="4" fill="${c.line}"/><rect x="58" y="64" width="88" height="4" fill="${c.line}"/><rect x="58" y="92" width="96" height="4" fill="${c.line}"/><rect x="58" y="104" width="70" height="4" fill="${c.line}"/></svg>`,
  "chapterhouse-drop": (c) =>
    `${open(120, 120)}<rect x="0" y="0" width="56" height="64" fill="${c.primary}"/><rect x="68" y="6" width="52" height="5" fill="${c.line}"/><rect x="68" y="20" width="52" height="5" fill="${c.line}"/><rect x="0" y="76" width="120" height="5" fill="${c.line}"/><rect x="0" y="90" width="96" height="5" fill="${c.line}"/><rect x="0" y="104" width="120" height="5" fill="${c.accent}"/></svg>`,
  "broadsheet-columns": (c) =>
    `${open(220, 110)}<rect x="0" y="0" width="220" height="22" fill="${c.ink}"/><rect x="0" y="32" width="68" height="78" fill="none" stroke="${c.line}" stroke-width="2"/><rect x="76" y="32" width="68" height="78" fill="none" stroke="${c.line}" stroke-width="2"/><rect x="152" y="32" width="68" height="78" fill="none" stroke="${c.line}" stroke-width="2"/><rect x="8" y="40" width="52" height="6" fill="${c.primary}"/><rect x="84" y="40" width="52" height="6" fill="${c.primary}"/><rect x="160" y="40" width="52" height="6" fill="${c.accent}"/><rect x="8" y="54" width="52" height="3" fill="${c.line}"/><rect x="8" y="62" width="44" height="3" fill="${c.line}"/><rect x="84" y="54" width="52" height="3" fill="${c.line}"/><rect x="84" y="62" width="44" height="3" fill="${c.line}"/><rect x="160" y="54" width="52" height="3" fill="${c.line}"/><rect x="160" y="62" width="44" height="3" fill="${c.line}"/></svg>`,
  "fieldbook-grid": (c) =>
    `${open(160, 120)}<defs><pattern id="fbg" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0 H0 V16" fill="none" stroke="${c.line}" stroke-width="1"/></pattern></defs><rect x="0" y="0" width="160" height="120" fill="url(#fbg)"/><rect x="0" y="0" width="160" height="120" fill="none" stroke="${c.primary}" stroke-width="3"/><circle cx="118" cy="36" r="7" fill="${c.accent}"/><circle cx="118" cy="36" r="12" fill="none" stroke="${c.accent}" stroke-width="2"/><polyline points="20,96 60,64 92,80 140,40" fill="none" stroke="${c.primary}" stroke-width="3" stroke-linecap="round"/></svg>`,
  "canopy-band": (c) =>
    `${open(220, 84)}<line x1="10" y1="78" x2="10" y2="30" stroke="${c.primary}" stroke-width="4" stroke-linecap="round"/><ellipse cx="42" cy="46" rx="30" ry="15" transform="rotate(-24 42 46)" fill="${c.soft}" stroke="${c.primary}" stroke-width="2"/><ellipse cx="96" cy="34" rx="34" ry="16" transform="rotate(-12 96 34)" fill="${c.soft}" stroke="${c.primary}" stroke-width="2"/><ellipse cx="156" cy="44" rx="30" ry="15" transform="rotate(-20 156 44)" fill="${c.accent}" opacity="0.85"/><ellipse cx="198" cy="30" rx="20" ry="11" transform="rotate(-14 198 30)" fill="${c.soft}" stroke="${c.primary}" stroke-width="2"/><rect x="0" y="80" width="220" height="4" fill="${c.primary}"/></svg>`,
  "summit-target": (c) =>
    `${open(140, 140)}<circle cx="70" cy="70" r="60" fill="none" stroke="${c.line}" stroke-width="4"/><circle cx="70" cy="70" r="42" fill="none" stroke="${c.primary}" stroke-width="5"/><circle cx="70" cy="70" r="24" fill="none" stroke="${c.accent}" stroke-width="5"/><circle cx="70" cy="70" r="8" fill="${c.primary}"/><line x1="70" y1="0" x2="70" y2="18" stroke="${c.accent}" stroke-width="4"/><line x1="70" y1="122" x2="70" y2="140" stroke="${c.accent}" stroke-width="4"/></svg>`,
  "commons-card": (c) =>
    `${open(200, 110)}<rect x="10" y="10" width="180" height="90" rx="16" fill="${c.paper}" stroke="${c.line}" stroke-width="2"/><circle cx="60" cy="48" r="14" fill="${c.soft}" stroke="${c.primary}" stroke-width="2"/><circle cx="100" cy="44" r="17" fill="${c.primary}"/><circle cx="140" cy="48" r="14" fill="${c.soft}" stroke="${c.primary}" stroke-width="2"/><rect x="44" y="72" width="112" height="5" fill="${c.accent}"/><rect x="60" y="84" width="80" height="4" fill="${c.line}"/></svg>`,
  "scoreboard-tiles": (c) =>
    `${open(200, 120)}<rect x="0" y="0" width="94" height="54" fill="${c.primary}"/><rect x="106" y="0" width="94" height="54" fill="${c.soft}" stroke="${c.line}" stroke-width="2"/><rect x="0" y="66" width="94" height="54" fill="${c.soft}" stroke="${c.line}" stroke-width="2"/><rect x="106" y="66" width="94" height="54" fill="${c.accent}"/><rect x="14" y="34" width="66" height="7" fill="${c.paper}"/><rect x="120" y="34" width="50" height="7" fill="${c.primary}"/><rect x="14" y="100" width="50" height="7" fill="${c.primary}"/><rect x="120" y="100" width="66" height="7" fill="${c.paper}"/></svg>`,
  "tape-ledger": (c) =>
    `${open(220, 100)}${[0, 1, 2, 3, 4].map((r) => `<rect x="0" y="${r * 20}" width="220" height="10" fill="${r % 2 ? c.soft : c.paper}" stroke="${c.line}" stroke-width="1"/>`).join("")}<rect x="0" y="0" width="220" height="14" fill="${c.ink}"/><rect x="14" y="30" width="40" height="5" fill="${c.primary}"/><rect x="150" y="30" width="56" height="5" fill="${c.accent}"/><rect x="14" y="70" width="52" height="5" fill="${c.primary}"/><rect x="150" y="70" width="44" height="5" fill="${c.primary}"/></svg>`,
  "dial-review": (c) =>
    `${open(160, 100)}<path d="M14 88 A66 66 0 0 1 146 88" fill="none" stroke="${c.line}" stroke-width="8" stroke-linecap="round"/><path d="M14 88 A66 66 0 0 1 96 24" fill="none" stroke="${c.primary}" stroke-width="8" stroke-linecap="round"/><line x1="80" y1="88" x2="112" y2="44" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/><circle cx="80" cy="88" r="9" fill="${c.primary}"/><rect x="8" y="94" width="12" height="4" fill="${c.primary}"/><rect x="74" y="94" width="12" height="4" fill="${c.line}"/><rect x="140" y="94" width="12" height="4" fill="${c.line}"/></svg>`,
  "proceedings-abstract": (c) =>
    `${open(200, 120)}<rect x="0" y="0" width="200" height="120" fill="none" stroke="${c.primary}" stroke-width="4"/><rect x="14" y="12" width="90" height="12" fill="${c.primary}"/><rect x="14" y="34" width="172" height="4" fill="${c.line}"/><rect x="14" y="46" width="172" height="4" fill="${c.line}"/><rect x="14" y="58" width="140" height="4" fill="${c.line}"/><rect x="14" y="78" width="70" height="4" fill="${c.accent}"/><rect x="14" y="90" width="120" height="4" fill="${c.line}"/><rect x="14" y="102" width="96" height="4" fill="${c.line}"/></svg>`,
  "blueprint-spec": (c) =>
    `${open(160, 120)}<defs><pattern id="bps" width="15" height="15" patternUnits="userSpaceOnUse"><path d="M15 0 H0 V15" fill="none" stroke="${c.line}" stroke-width="1" opacity="0.7"/></pattern></defs><rect x="0" y="0" width="160" height="120" fill="${c.primary}"/><rect x="0" y="0" width="160" height="120" fill="url(#bps)"/><circle cx="80" cy="60" r="30" fill="none" stroke="${c.paper}" stroke-width="3"/><line x1="80" y1="18" x2="80" y2="102" stroke="${c.paper}" stroke-width="2"/><line x1="38" y1="60" x2="122" y2="60" stroke="${c.paper}" stroke-width="2"/><circle cx="80" cy="60" r="5" fill="${c.accent}"/><rect x="8" y="8" width="34" height="10" fill="${c.accent}"/></svg>`,
  "docket-matrix": (c) =>
    `${open(180, 120)}<rect x="0" y="0" width="86" height="54" fill="${c.primary}"/><rect x="94" y="0" width="86" height="54" fill="${c.soft}" stroke="${c.line}" stroke-width="2"/><rect x="0" y="62" width="86" height="54" fill="${c.soft}" stroke="${c.line}" stroke-width="2"/><rect x="94" y="62" width="86" height="54" fill="${c.paper}" stroke="${c.primary}" stroke-width="3"/><circle cx="24" cy="27" r="9" fill="${c.paper}"/><circle cx="137" cy="27" r="9" fill="${c.accent}"/><circle cx="43" cy="89" r="9" fill="${c.primary}"/><rect x="112" y="82" width="50" height="6" fill="${c.line}"/><rect x="112" y="94" width="38" height="6" fill="${c.accent}"/></svg>`,
};

const DEFAULTS: MotifColors = {
  primary: "#33413B",
  accent: "#8A6C3A",
  soft: "#EFF2F0",
  line: "#D9DFDC",
  paper: "#FFFFFF",
  ink: "#17201C",
};

export function motifSvg(scene: CoverMotifScene, colors: Partial<MotifColors> = {}): string {
  const merged = { ...DEFAULTS, ...colors };
  const builder = SCENES[scene];
  if (!builder) throw new Error(`Unknown cover motif scene: ${scene}`);
  return builder(merged);
}

export function isCoverMotifScene(value: string): value is CoverMotifScene {
  return value in SCENES;
}

// Keep the legacy export stable for callers that use it as the original
// artwork inventory; sample-derived scenes remain addressable by their theme.
export const COVER_MOTIF_SCENES = Object.keys(SCENES).filter((scene) => !scene.startsWith("sample-")) as CoverMotifScene[];
