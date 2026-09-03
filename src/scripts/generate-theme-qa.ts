import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DOCUMENT_THEMES, getDocumentThemePatch } from "../lib/document-themes";
import { generateDocx } from "../lib/docx/generate";
import { generatePdf } from "../lib/pdf/generate";
import { makeSamplePolicy } from "../lib/store";
import type { Policy } from "../lib/types";

async function main() {
  const outputDirectory = resolve(process.argv[2] || ".theme-qa");
  await mkdir(outputDirectory, { recursive: true });

  const cases: { name: string; label: string; policy: Policy }[] = DOCUMENT_THEMES.flatMap((theme) =>
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
        documentTheme: "sustainability-report",
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
        documentTheme: "editorial-report",
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

  for (const item of cases) {
    const baseName = item.name;
    const policy = item.policy;
    const [docx, pdf] = await Promise.all([generateDocx(policy), generatePdf(policy)]);

    if (docx.subarray(0, 2).toString() !== "PK") throw new Error(`${item.label} did not produce a valid DOCX package`);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${item.label} did not produce a valid PDF`);

    await Promise.all([
      writeFile(resolve(outputDirectory, `${baseName}.docx`), docx),
      writeFile(resolve(outputDirectory, `${baseName}.pdf`), pdf),
    ]);
    console.log(`Generated ${item.label}`);
  }

  console.log(`Theme QA exports are in ${outputDirectory}`);
}

function qaPolicy(themeId: (typeof DOCUMENT_THEMES)[number]["id"], sample: "concise" | "regular" | "dense"): Policy {
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

void main();
