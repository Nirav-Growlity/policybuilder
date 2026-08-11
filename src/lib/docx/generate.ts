import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  InternalHyperlink,
  Bookmark,
  ImageRun,
  Header,
  Footer,
  PageNumber,
} from "docx";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCompanySites, type Policy } from "../types";
import { SDG_DATA, getPolicyProfile } from "../constants";
import { normalizePolicyQuantitative } from "../quantitative";
import { getEnabledSections, sectionHasContent } from "../sections";
import { DEFAULT_TYPOGRAPHY } from "../typography";

const FOREST = "1a5c3a";
const CREAM = "f3eee3";
const LINE = "e5e1d3";
const INK = "1a1a1a";
type Typography = NonNullable<Policy["typography"]>;

export async function generateDocx(inputPolicy: Policy): Promise<Buffer> {
  const policy = normalizePolicyQuantitative(inputPolicy);
  const profile = getPolicyProfile(policy.policyType);
  const co = policy.company;
  const logoImage = logoFromDataUrl(co.companyLogo);
  const logoAlignment = policy.logoPosition === "left" ? AlignmentType.LEFT : policy.logoPosition === "right" ? AlignmentType.RIGHT : AlignmentType.CENTER;
  const typography = policy.typography || DEFAULT_TYPOGRAPHY;
  const sites = getCompanySites(co);
  const areas = policy.focusAreas.filter(Boolean);
  const qualEntries = Object.entries(policy.qualitative).filter(([, v]) => v && v.length);
  const quantEntries = policy.quantitative.filter((q) => q.targets && q.targets.some((t) => t.target));

  const children: (Paragraph | Table)[] = [];

  // Cover
  children.push(
    ...(logoImage ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [new ImageRun({ data: logoImage.data, type: logoImage.type, transformation: { width: 180, height: 90 } })] })] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
      children: [
        new TextRun({
          text: "SUSTAINABILITY POLICY",
          bold: true,
          font: "Arial",
          size: 20,
          color: FOREST,
          characterSpacing: 60,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: profile.label,
          bold: true,
          font: "Georgia",
          color: INK,
          size: 64,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: co.name || "[Company Name]", size: 28, color: "666666" }),
      ],
    })
  );

  // Cover meta table
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell("Document No.", true),
            cell(co.docNum || "—", false, AlignmentType.CENTER),
            cell("Effective Date", true),
            cell(co.effectiveDate || "—", false, AlignmentType.CENTER),
          ],
        }),
        new TableRow({
          children: [
            cell("Revision No.", true),
            cell(co.revNum || "01", false, AlignmentType.CENTER),
            cell("Next Review", true),
            cell(co.reviewDate || "—", false, AlignmentType.CENTER),
          ],
        }),
      ],
    })
  );

  children.push(spacer(360));

  const isModern = policy.visualStyle === "modern";
  const sections = getEnabledSections(policy).filter((section) => section.kind === "preface" || sectionHasContent(policy, section));
  const sdgImages = policy.sdgDisplay === "tiles"
    ? new Map<number, Uint8Array>(await Promise.all(policy.sdgs.map(async (n) => [n, await readFile(path.join(process.cwd(), "public", "E SDG Icons PRINT", `E_SDG_PRINT-${String(n).padStart(2, "0")}.jpg`))] as [number, Uint8Array])))
    : new Map<number, Uint8Array>();

  // Table of Contents
  if (policy.showTableOfContents) {
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("Table of Contents", undefined, typography));
  sections.forEach((s, i) => {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new InternalHyperlink({
            anchor: s.id,
            children: [
              new TextRun({ text: `${String(i + 1).padStart(2, "0")}. `, bold: true, color: FOREST, size: 24 }),
              new TextRun({ text: s.title, size: 24 }),
            ]
          })
        ],
      })
    );
  });
  if (policy.showAcknowledgement) {
  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `${String(sections.length + 1).padStart(2, "0")}. `, bold: true, color: FOREST, size: 24 }),
        new TextRun({ text: "Employee Acknowledgement Form", size: 24 }),
      ],
    })
  );
  }
  
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Render Sections
  sections.forEach((s) => {
    children.push(sectionTitle(s.title, s.id, typography));
    
    switch (s.kind) {
      case "preface":
        children.push(...bodyParagraphs(policy.declaration.preface, typography));
        break;
      case "declaration":
        children.push(...bodyParagraphs(policy.declaration.declaration, typography));
        break;
      case "scope":
        children.push(...bodyParagraphs(policy.declaration.scope, typography));
        if (sites.length > 0) {
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [lightHeaderCell("Location / Unit", "25%"), lightHeaderCell("Address", "50%"), lightHeaderCell("Primary Function", "25%")] }),
                ...sites.map((site, index) => new TableRow({ children: [
                  bodyCell(site.location || co.name || `Site ${index + 1}`, "25%", true),
                  bodyCell(site.address, "50%"),
                  bodyCell(site.primaryFunction || "Operating Site", "25%"),
                ] })),
              ],
            })
          );
        }
        break;
      case "definitions":
        children.push(...bodyParagraphs(policy.definitions?.content || "", typography));
        break;
      case "framework":
        policy.standards.forEach((standard) => children.push(...bodyParagraphs(standard, typography)));
        break;
      case "focus":
        areas.forEach((a, i) =>
          children.push(
            new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({ text: `${String(i + 1).padStart(2, "0")}.  `, bold: true, color: FOREST }),
                new TextRun({ text: a, bold: true }),
              ],
            })
          )
        );
        break;
      case "qualitative":
        qualEntries.forEach(([k, v], i) => {
          children.push(
            new Paragraph({
              spacing: { before: 160, after: 80 },
              children: [new TextRun({ text: `${i + 1}. ${k}`, bold: true, size: Math.round(typography.subheadingSize * 2), font: typography.fontFamily })],
            })
          );
          v.forEach((o) =>
            children.push(
              new Paragraph({
                spacing: { after: 100, line: Math.round(240 * typography.lineSpacing) },
                indent: { left: 360 },
                children: [
                  new TextRun({ text: "▸  ", color: FOREST, bold: true }),
                  new TextRun({ text: o }),
                ],
              })
            )
          );
        });
             case "quantitative":
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: "Targets are either tracked against a defined period or reported annually as ongoing commitments.",
                italics: true,
                size: 18,
                color: "666666",
              }),
            ],
          })
        );
        if (isModern) {
          quantEntries.forEach((q) => {
            children.push(
              new Paragraph({
              spacing: { before: 160, after: 80 },
                children: [
                  new TextRun({ text: q.area, bold: true, color: INK, size: Math.round(typography.subheadingSize * 2), font: typography.fontFamily }),
                ],
              })
            );
            q.targets.filter(t => t.target).forEach((t) => {
              children.push(
                new Paragraph({
                  spacing: { after: 100, line: Math.round(240 * typography.lineSpacing) },
                  children: [
                    new TextRun({ text: t.reportingFrequency === "Annually" ? `${t.target} (Reported annually).` : `${t.target} (Baseline: ${t.baseline}, Deadline: ${t.deadline}).`, size: Math.round(typography.paragraphSize * 2), font: typography.fontFamily }),
                  ],
                })
              );
            });
          });
        } else {
          const targetRows = [
            new TableRow({
              tableHeader: true,
              children: [
                headerCell("#", "5%"),
                headerCell("Focus Area", "20%"),
                headerCell("Target", "35%"),
                headerCell("Baseline", "13%"),
                headerCell("Deadline", "13%"),
                headerCell("Reporting", "14%"),
              ],
            }),
          ];
          quantEntries.forEach((q, qi) => {
            q.targets
              .filter((t) => t.target)
              .forEach((t, ti) => {
                targetRows.push(
                  new TableRow({
                    children: [
                      bodyCell(ti === 0 ? String(qi + 1) : "", "5%", true),
                      bodyCell(ti === 0 ? q.area : "", "20%", true),
                      bodyCell(t.target, "35%"),
                      bodyCell(t.reportingFrequency === "Annually" ? "" : t.baseline, "13%"),
                      bodyCell(t.reportingFrequency === "Annually" ? "" : t.deadline, "13%"),
                      bodyCell(t.reportingFrequency || "Target period", "14%"),
                    ],
                  })
                );
              });
          });
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: targetRows,
            })
          );
        }
        break;
      case "sdg":
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "This policy aligns with the following UN Sustainable Development Goals:" }),
            ],
          })
        );
        policy.sdgs.forEach((n) => {
          const s = SDG_DATA.find((d) => d.n === n)!;
          if (policy.sdgDisplay === "tiles" && sdgImages.has(n)) {
            children.push(new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } },
              rows: [new TableRow({ children: [
                new TableCell({ width: { size: 16, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new ImageRun({ data: sdgImages.get(n)!, type: "jpg", transformation: { width: 58, height: 58 } })] })] }),
                new TableCell({ width: { size: 84, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: `SDG ${s.n}: ${s.label}`, bold: true, color: s.c, size: 20 })] })] }),
              ] })],
            }));
            return;
          }
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 10, type: WidthType.PERCENTAGE },
                      shading: { type: ShadingType.SOLID, color: s.c, fill: s.c },
                      children: [
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `SDG ${s.n}`, bold: true, color: "FFFFFF" })] })
                      ]
                    }),
                    new TableCell({
                      width: { size: 90, type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({ indent: { left: 100 }, children: [new TextRun({ text: s.label, bold: true, color: s.c, size: 20 })] })
                      ]
                    })
                  ]
                }),
                new TableRow({ children: [ new TableCell({ children: [new Paragraph({ text: "" })] }), new TableCell({ children: [] }) ] })
              ]
            })
          );
        });
        break;
      case "responsibilities":
        if (isModern) {
          policy.responsibilities.forEach((r) => {
            children.push(
              new Paragraph({
                spacing: { after: 100, line: Math.round(240 * typography.lineSpacing) },
                children: [
                  new TextRun({ text: r.role + " ", bold: true, size: Math.round(typography.subheadingSize * 2), font: typography.fontFamily }),
                  new TextRun({ text: r.duty, size: Math.round(typography.paragraphSize * 2), font: typography.fontFamily }),
                ],
              })
            );
          });
        } else {
          const respRows = [
            new TableRow({
              tableHeader: true,
              children: [lightHeaderCell("Role / Department", "30%"), lightHeaderCell("Responsibility", "70%")],
            }),
          ];
          policy.responsibilities.forEach((r) =>
            respRows.push(
              new TableRow({
                children: [bodyCell(r.role, "30%", true), bodyCell(r.duty, "70%")],
              })
            )
          );
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: respRows,
            })
          );
        }
        break;
      case "monitoring":
        children.push(...bodyParagraphs(policy.monitoring, typography));
        break;
      case "review":
        children.push(...bodyParagraphs(policy.reviewMechanism, typography));
        break;
      case "custom":
        (s.blocks || []).forEach((block) => {
          if (block.type === "paragraph") children.push(...bodyParagraphs(block.text, typography));
          else if (block.type === "table") {
            const columns = block.columns || [];
            if (columns.length) children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
              new TableRow({ tableHeader: true, children: columns.map((column) => lightHeaderCell(column, `${100 / columns.length}%`)) }),
              ...(block.rows || []).map((row) => new TableRow({ children: columns.map((_, index) => bodyCell(row[index] || "", `${100 / columns.length}%`)) })),
            ] }));
          }
          else block.text.split(/\r?\n+/).filter(Boolean).forEach((item, index) => children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: block.type === "bullets" ? "•  " : `${index + 1}.  `, color: FOREST, bold: true }), new TextRun({ text: item })] })));
        });
        break;
    }
  });

  children.push(spacer(120));
  if (policy.showAcknowledgement) children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Approved by: ", bold: true }),
        new TextRun({ text: co.approver || "_____________________" }),
      ],
    })
  );

  // Acknowledgment form
  if (policy.showAcknowledgement) children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "Employee Acknowledgement Form", bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: `${profile.label} · ${co.name}`, italics: true, size: 18, color: "666666" }),
      ],
    }),
    ...bodyParagraphs(
      `I hereby acknowledge that I have read and understood the ${profile.label} of ${
        co.name || "[Company Name]"
      }. I am aware of the company's commitment to responsible practices as outlined in this policy and agree to uphold these standards in my daily work.`
    , typography),
    ...bodyParagraphs(
      "By signing below, I confirm my personal commitment to the values and obligations set forth in this policy."
    , typography)
  );

  ["Employee Name", "Employee ID", "Department", "Date"].forEach((f) => {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 30 },
        children: [new TextRun({ text: f.toUpperCase(), size: 16, color: "666666", characterSpacing: 40, bold: true })],
      }),
      new Paragraph({
        border: { bottom: { color: "AAAAAA", space: 1, style: BorderStyle.SINGLE, size: 6 } },
        spacing: { after: 80 },
        children: [new TextRun({ text: " " })],
      })
    );
  });
  children.push(
    new Paragraph({
      spacing: { before: 240, after: 30 },
      children: [new TextRun({ text: "SIGNATURE", size: 16, color: "666666", characterSpacing: 40, bold: true })],
    }),
    new Paragraph({
      border: { bottom: { color: "AAAAAA", space: 1, style: BorderStyle.SINGLE, size: 6 } },
      spacing: { after: 100 },
      children: [new TextRun({ text: " " })],
    })
  );
  }

  const doc = new Document({
    creator: "PolicyCraft",
    title: `${profile.label} - ${co.name || "Policy"}`,
    styles: {
      default: {
        document: { run: { font: typography.fontFamily, size: Math.round(typography.paragraphSize * 2), color: INK } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
          titlePage: true,
        },
        headers: logoImage ? { default: new Header({ children: [new Paragraph({ alignment: logoAlignment, border: { bottom: { color: FOREST, space: 1, style: BorderStyle.SINGLE, size: 6 } }, children: [new ImageRun({ data: logoImage.data, type: logoImage.type, transformation: { width: 100, height: 50 } })] })] }) } : undefined,
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Page ", size: 16, color: "666666" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "666666" })] })] }) },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return buf as Buffer;
}

function logoFromDataUrl(source?: string): { data: Uint8Array; type: "png" | "jpg" } | null {
  const match = source?.match(/^data:image\/(png|jpeg|jpg);base64,([\s\S]+)$/i);
  if (!match) return null;
  return { data: Buffer.from(match[2], "base64"), type: match[1].toLowerCase() === "png" ? "png" : "jpg" };
}

function sectionTitle(title: string, bookmarkId?: string, typography: Typography = DEFAULT_TYPOGRAPHY): Paragraph {
  const titleChildren: any[] = [];
  if (bookmarkId) {
    titleChildren.push(new Bookmark({ id: bookmarkId, children: [] }));
  }
  titleChildren.push(
    new TextRun({
      text: title.toUpperCase(),
      bold: true,
      size: Math.round(typography.headingSize * 2),
      font: typography.fontFamily,
      color: FOREST,
      characterSpacing: 40,
    })
  );

  return new Paragraph({
    spacing: { before: 400, after: 200 },
    border: {
      bottom: { color: LINE, space: 10, style: BorderStyle.SINGLE, size: 6 },
    },
    children: titleChildren,
  });
}

function bodyParagraphs(text: string, typography: Typography = DEFAULT_TYPOGRAPHY): Paragraph[] {
  if (!text) return [];
  const parts = text.split(/\r?\n+/).map((p) => p.trim()).filter(Boolean);
  return parts.map(
    (p) =>
      new Paragraph({
        spacing: { after: 150, line: Math.round(240 * typography.lineSpacing) },
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: p, size: Math.round(typography.paragraphSize * 2), font: typography.fontFamily })],
      })
  );
}

function spacer(before: number): Paragraph {
  return new Paragraph({ spacing: { before } });
}

function cell(text: string, header: boolean, align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  return new TableCell({
    shading: header ? { type: ShadingType.SOLID, color: FOREST, fill: FOREST } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({ text, bold: header, color: header ? "FFFFFF" : "1a1a1a", size: 20 }),
        ],
      }),
    ],
  });
}

function headerCell(text: string, width: string) {
  return new TableCell({
    width: { size: parseFloat(width), type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: FOREST, fill: FOREST },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })],
      }),
    ],
  });
}

function bodyCell(text: string, width: string, bold = false) {
  return new TableCell({
    width: { size: parseFloat(width), type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 20 })],
      }),
    ],
  });
}

function lightHeaderCell(text: string, width?: string) {
  return new TableCell({
    width: width ? { size: parseFloat(width), type: WidthType.PERCENTAGE } : undefined,
    shading: { type: ShadingType.SOLID, color: CREAM, fill: CREAM },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: "444444", size: 20, font: "Arial" })],
      }),
    ],
  });
}
