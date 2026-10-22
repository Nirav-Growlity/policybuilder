// Sample policies that exercise every document template and the design
// options around it. Shared by the theme QA export and the PDF engine parity check.
import { DOCUMENT_THEMES, getDocumentThemePatch } from "../lib/document-themes";
import { normalizePolicyStructure } from "../lib/sections";
import { makeSamplePolicy } from "../lib/store";
import type { AuthorApprovalRenderData } from "../lib/document-render-model";
import type { Policy } from "../lib/types";

export type PolicyQaCase = { name: string; label: string; policy: Policy; authorApproval?: AuthorApprovalRenderData };

/** A 240 × 80 px pen stroke, standing in for an author signature. */
const SIGNATURE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAABQCAMAAAAQlwhOAAAC01BMVEVMaXEAAFUzM2YfH18AAAAdKlscKloAAH8dKlsdKloTJ2IbKVscKVscKlocKlscKlseLVocKVsaKF0cKlocKlokJEgZM2YbK1oeLVocKlodKVodKVodKVsVKlUdKlscKloaKFkcKVodKFwdKVsdKloAPz8eKlsdKVoXLlwcKVsdKVoZJlkqKlUdKVocKlsdKVsXLlwdKlseKFscKlscKVodKlsdKlodK1kkJFseK1odKlocKVodKFwdKFseKVscKVocKlkcKVobKVkdKlkdKlscKVodKlsfL18dKVscKlwdKVocKVscKFsdKlscKVscKloeKlocKlscKlscKVscKlwdKVkcK1sYJFUdKVsiIlUdKVscKlUcKVsbK1wdKVsdKVsbK1wdKVoeKVodKVsdKVgcKVoeKVodKVocKVocKlocHFUcKlocKlsdKVsdKlscKFkdKlocKVsdKlsZKl0fKl8bKVkcKVodKlobLVsdKlseKlodKlodK1cfK10dKVocKlsdKVodKVocKlocKVobK1sdKVsdKlocKVwdKlsbLFgcKlsbKVodKVscJV4dKVoaK1ccKVoeKlocKlsdK1sfJ1cgKVofKVgdKlodKVscKlscKVocKlohLFgdKlodKlscKVocKlwdKlscKVsdKlodKlsdKlsdKlocKVocJ1oaKF0bKFscKlscKlodKVsaJ1scKlocKVsdJ1gcKFscKVodKVodKlodKVodKVsdKVodKVscKlscKlsdKVocKVscKVocKlwdKlocKVscKFsdKVscKVscK1kcKlkcKlscKlocKlocKlseKFsdKVscKVocKVsdLF0cKlodKlseJlwdKlsdKlseK1weKFocKVseKVofLFkdKVsaKlobKVweKlscKlocKFwcKFkcKVobK1ocKVsbKlocKlodKlodKlsdKlscKlseKlwcKlsdKlocKVocKlseKFsdKlvztNu8AAAA8HRSTlMAAwUIAfzxAv79DVz5+H2RItcT9+YHCkERzeH0uAy23jnvXvvsBCr1Fu6sFAbKWYwL2hmWmNLyTQ470z5FcEN2NuclPOvLnBCkSKaZZLWfhWbwosNhaTUVmg89EnUvyb5Tv0TiK7ldnnyhCYTge8A/r7L2HhhKseQcwXed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";
const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** Every template at three content lengths, plus custom colours and a cover feature image. */
export function themeQaCases(): PolicyQaCase[] {
  const cases: PolicyQaCase[] = DOCUMENT_THEMES.flatMap((theme) =>
    (["concise", "regular", "dense"] as const).map((sample) => ({
      name: `${theme.id}-${sample}`,
      label: `${theme.name} / ${sample}`,
      policy: qaPolicy(theme.id, sample),
    })),
  );
  cases.push(
    {
      name: "custom-solid",
      label: "Custom solid",
      policy: {
        ...makeSamplePolicy(),
        documentTheme: "executive-brief",
        documentThemeOverrides: {
          schemaVersion: 1,
          customThemeName: "Custom solid",
          colors: { primary: "#5B315E", accent: "#C99859", paper: "#FFF9F3" },
          background: { kind: "solid", color: "#FFF9F3" },
          density: "compact",
          logoScale: "small",
        },
      },
    },
    {
      name: "custom-gradient",
      label: "Custom gradient",
      policy: {
        ...makeSamplePolicy(),
        documentTheme: "sustainability-charter",
        documentThemeOverrides: {
          schemaVersion: 1,
          customThemeName: "Custom gradient",
          colors: { primary: "#245B50", accent: "#C7794B", paper: "#FDFBF7" },
          background: { kind: "gradient", from: "#FDFBF7", to: "#E1F0EA", direction: "diagonal" },
          density: "spacious",
          logoScale: "large",
        },
      },
    },
    {
      name: "feature-image-cover",
      label: "Feature image cover",
      policy: {
        ...makeSamplePolicy(),
        documentTheme: "people-charter",
        featureImage: {
          dataUrl: ONE_PIXEL_PNG,
          mimeType: "image/png",
          altText: "Abstract editorial feature image",
          placement: "cover",
          focalPosition: { x: 50, y: 50 },
          width: 1,
          height: 1,
        },
      },
    },
  );
  return cases;
}

/** Options the theme QA set leaves at their defaults: logo, AI cover, contents off, filled acknowledgement, page border. */
export function extraParityCases(): PolicyQaCase[] {
  const logo = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" rx="8" fill="#126845"/><circle cx="40" cy="40" r="22" fill="#F2C14E"/><rect x="78" y="28" width="140" height="24" rx="4" fill="#FFFFFF"/></svg>');
  const artwork = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1456"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0F3D33"/><stop offset="1" stop-color="#3E8E6F"/></linearGradient></defs><rect width="1024" height="1456" fill="url(#g)"/><circle cx="780" cy="360" r="220" fill="#F2C14E" opacity=".55"/></svg>');
  const withTheme = (themeId: (typeof DOCUMENT_THEMES)[number]["id"]) => qaPolicy(themeId, "regular");

  const logoRight = withTheme("governance-register");
  logoRight.company.companyLogo = logo;
  logoRight.logoPosition = "right";

  const aiCover = withTheme("standard-pack");
  aiCover.activeCoverVariant = "ai";
  aiCover.aiCoverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "ai-generated",
    background: { color: "#FFFFFF", assetId: artwork, fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{
      id: "policy-title", type: "text", x: 20, y: 150, width: 170, height: 60, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false,
      content: { kind: "binding", binding: "policyTitle" }, fontFamily: "Arial", fontSize: 36, color: "#FFFFFF",
      bold: true, italic: false, underline: false, align: "left", lineHeight: 1.16, letterSpacing: 0,
    }],
  };

  const tocOff = withTheme("operations-guide");
  tocOff.showTableOfContents = false;

  const acknowledgement = withTheme("people-charter");
  acknowledgement.showAcknowledgement = true;
  acknowledgement.employeeAcknowledgement = { employeeName: "Asha Raman", employeeId: "E-10422", department: "Operations", date: "2026-10-19" };
  const signed = withTheme("standard-pack");
  signed.showAcknowledgement = true;

  const bordered = withTheme("controlled-manual");
  bordered.documentThemeOverrides = { schemaVersion: 1, pageBorder: { enabled: true, scope: "all", widthPt: 1.5, insetMm: 8, color: "#26323D" } };

  // The modern data treatments outside the framed templates, journal-style targets,
  // custom blocks, bullet markers and a section feature image.
  const modern = withTheme("standard-pack");
  modern.visualStyle = "modern";
  modern.sdgDisplay = "tiles";

  const journal = withTheme("operations-guide");
  journal.visualStyle = "modern";

  const custom = normalizePolicyStructure(withTheme("governance-register"));
  custom.listFormatting = { outline: "bullet", focusAreas: "bullet", qualitativeGroups: "bullet", qualitativeItems: "number", quantitativeGroups: "bullet", quantitativeItems: "number", responsibilities: "bullet" };
  custom.featureImage = { dataUrl: ONE_PIXEL_PNG, mimeType: "image/png", altText: "Section artwork", placement: "section", focalPosition: { x: 50, y: 30 }, width: 1, height: 1 };
  custom.sections!.push({
    id: "qa-custom", kind: "custom", title: "Measurement Methodology", enabled: true,
    blocks: [
      { id: "qa-p", type: "paragraph", text: "Indicators are measured monthly at each site and consolidated quarterly.\nData owners confirm completeness before the quarterly review." },
      { id: "qa-b", type: "bullets", text: "Energy meters are calibrated annually\nWater withdrawal is read from utility invoices\nWaste is weighed at the gate" },
      { id: "qa-n", type: "numbered", text: "Collect site data\nReview anomalies\nApprove the consolidated report" },
      { id: "qa-t", type: "table", text: "", columns: ["Indicator", "Unit", "Frequency", "Owner"], rows: [["Electricity use", "MWh", "Monthly", "Site Engineering"], ["Scope 1 emissions", "tCO2e", "Quarterly", "EHS Manager"], ["Hazardous waste", "t", "Monthly", "Plant Head"]] },
    ],
  });

  return [
    { name: "modern-single-folio", label: "Modern treatments, plain frame", policy: modern },
    { name: "modern-journal", label: "Modern treatments, journal targets", policy: journal },
    { name: "custom-blocks", label: "Custom blocks, bullets, section image", policy: custom },
    { name: "logo-right", label: "Company logo, right aligned", policy: logoRight },
    { name: "ai-cover", label: "AI cover composition", policy: aiCover },
    { name: "toc-off", label: "Contents page off", policy: tocOff },
    { name: "acknowledgement-filled", label: "Acknowledgement with filled fields", policy: acknowledgement },
    { name: "acknowledgement-signed", label: "Acknowledgement signed by the author", policy: signed, authorApproval: { displayName: "Priya Shah", date: "2026-10-20", signatureDataUrl: SIGNATURE_PNG } },
    { name: "page-border", label: "Page border on every page", policy: bordered },
  ];
}

export function qaPolicy(themeId: (typeof DOCUMENT_THEMES)[number]["id"], sample: "concise" | "regular" | "dense"): Policy {
  const policy = structuredClone(makeSamplePolicy());
  Object.assign(policy, getDocumentThemePatch(themeId), { documentTheme: themeId });
  // New policies start with both on (lib/initial-policy.ts); the sample has them off.
  policy.showTableOfContents = true;
  policy.showAcknowledgement = true;
  policy.company.name = sample === "dense" ? "Long-form Example Holdings, Manufacturing and Infrastructure Services Company Limited" : policy.company.name;
  if (sample === "concise") {
    policy.declaration.preface = "A concise statement of policy purpose and intent.";
    policy.qualitative = Object.fromEntries(Object.entries(policy.qualitative).slice(0, 2).map(([area, items]) => [area, items.slice(0, 1)]));
    policy.quantitative = policy.quantitative.slice(0, 1).map((area) => ({ ...area, targets: area.targets.slice(0, 1) }));
    policy.responsibilities = policy.responsibilities.slice(0, 2);
  }
  if (sample === "dense") {
    policy.declaration.preface = `${policy.declaration.preface}\n\n${policy.declaration.preface}\n\n${policy.declaration.preface}`;
    policy.declaration.scope = `${policy.declaration.scope}\n\n${policy.declaration.scope}`;
    policy.qualitative = Object.fromEntries(Object.entries(policy.qualitative).map(([area, items]) => [area, [...items, ...items]]));
    policy.responsibilities = [...policy.responsibilities, ...policy.responsibilities.map((entry) => ({ ...entry, role: `${entry.role} — Supporting function` }))];
  }
  return policy;
}

const STEP_CUSTOM_BLOCKS: NonNullable<Policy["sections"]>[number]["blocks"] = [
  { id: "step-p", type: "paragraph", text: "Indicators are measured monthly at each site and consolidated quarterly.\nData owners confirm completeness before the quarterly review." },
  { id: "step-b", type: "bullets", text: "Energy meters are calibrated annually\nWater withdrawal is read from utility invoices\nWaste is weighed at the gate" },
  { id: "step-n", type: "numbered", text: "Collect site data\nReview anomalies\nApprove the consolidated report" },
  { id: "step-t", type: "table", text: "", columns: ["Indicator", "Unit", "Frequency", "Owner"], rows: [["Electricity use", "MWh", "Monthly", "Site Engineering"], ["Scope 1 emissions", "tCO2e", "Quarterly", "EHS Manager"]] },
];

/**
 * The policy built up one element at a time, per template: the cover, then the
 * contents, then each section on its own after the (required) preface, then
 * the acknowledgement. One element per case keeps a discrepancy where it
 * starts instead of shifting every later page.
 */
export function stepCases(): PolicyQaCase[] {
  return DOCUMENT_THEMES.flatMap((theme) => {
    const base = () => {
      const policy = normalizePolicyStructure(qaPolicy(theme.id, "regular"));
      policy.showTableOfContents = false;
      policy.showAcknowledgement = false;
      policy.sections = policy.sections!.map((section) => ({ ...section, enabled: section.kind === "preface" }));
      return policy;
    };
    const step = (index: number, name: string, label: string, edit: (policy: Policy) => void): PolicyQaCase => {
      const policy = base();
      edit(policy);
      return { name: `${theme.id}-s${String(index).padStart(2, "0")}-${name}`, label: `${theme.name} / ${label}`, policy };
    };
    const kinds = base().sections!.filter((section) => section.kind !== "preface").map((section) => section.kind);
    return [
      step(0, "cover", "cover and preface", () => undefined),
      step(1, "toc", "contents", (policy) => { policy.showTableOfContents = true; }),
      ...kinds.map((kind, index) => step(index + 2, kind, kind, (policy) => {
        policy.sections = policy.sections!.map((section) => section.kind === kind ? { ...section, enabled: true } : section);
      })),
      step(kinds.length + 2, "custom", "custom blocks", (policy) => {
        policy.sections!.push({ id: "step-custom", kind: "custom", title: "Measurement Methodology", enabled: true, blocks: STEP_CUSTOM_BLOCKS });
      }),
      step(kinds.length + 3, "acknowledgement", "acknowledgement", (policy) => { policy.showAcknowledgement = true; }),
    ];
  });
}
