// Sample policies that exercise every document template and the design
// options around it. Shared by the theme QA export and the PDF engine parity check.
import { DOCUMENT_THEMES, getDocumentThemePatch } from "../lib/document-themes";
import { makeSamplePolicy } from "../lib/store";
import type { Policy } from "../lib/types";

export type PolicyQaCase = { name: string; label: string; policy: Policy };

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
          dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
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

  const bordered = withTheme("controlled-manual");
  bordered.documentThemeOverrides = { schemaVersion: 1, pageBorder: { enabled: true, scope: "all", widthPt: 1.5, insetMm: 8, color: "#26323D" } };

  return [
    { name: "logo-right", label: "Company logo, right aligned", policy: logoRight },
    { name: "ai-cover", label: "AI cover composition", policy: aiCover },
    { name: "toc-off", label: "Contents page off", policy: tocOff },
    { name: "acknowledgement-filled", label: "Acknowledgement with filled fields", policy: acknowledgement },
    { name: "page-border", label: "Page border on every page", policy: bordered },
  ];
}

export function qaPolicy(themeId: (typeof DOCUMENT_THEMES)[number]["id"], sample: "concise" | "regular" | "dense"): Policy {
  const policy = structuredClone(makeSamplePolicy());
  Object.assign(policy, getDocumentThemePatch(themeId), { documentTheme: themeId });
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
