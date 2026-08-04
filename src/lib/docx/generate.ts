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
} from "docx";
import type { Policy } from "../types";
import { SDG_DATA, POLICY_TYPE_META } from "../constants";

const FOREST = "1a5c3a";
const CREAM = "f3eee3";
const LINE = "e5e1d3";
const INK = "1a1a1a";

export async function generateDocx(policy: Policy): Promise<Buffer> {
  const co = policy.company;
  const areas = policy.focusAreas.filter(Boolean);
  const qualEntries = Object.entries(policy.qualitative).filter(([, v]) => v && v.length);
  const quantEntries = policy.quantitative.filter((q) => q.targets && q.targets.some((t) => t.target));

  const children: (Paragraph | Table)[] = [];

  // Cover
  children.push(
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
          text: POLICY_TYPE_META.label,
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

  const tpl = policy.presentationTemplate || "standard";
  const isModern = policy.visualStyle === "modern";
  
  const SECTION_CONFIGS: Record<string, { id: string, label: string }[]> = {
    standard: [
      { id: "preface", label: "Preface" },
      { id: "declaration", label: "Policy Declaration" },
      { id: "scope", label: "Scope" },
      { id: "focus", label: "Key Focus Areas" },
      { id: "quantitative", label: "Quantitative Targets" },
      { id: "responsibilities", label: "Responsibilities" },
      { id: "monitoring", label: "Monitoring, Reporting & Transparency" },
      { id: "review", label: "Review Mechanism & Continuous Improvement" }
    ],
    executive: [
      { id: "preface", label: "Preface" },
      { id: "declaration", label: "Executive Declaration" },
      { id: "scope", label: "Scope" },
      { id: "quantitative", label: "Key Quantitative Targets" },
      { id: "sdg", label: "SDG Alignment" }
    ],
    comprehensive: [
      { id: "preface", label: "Executive Preface" },
      { id: "declaration", label: "Policy Declaration" },
      { id: "scope", label: "Scope of Application" },
      { id: "focus", label: "Material Focus Areas" },
      { id: "qualitative", label: "Detailed Qualitative Objectives" },
      { id: "quantitative", label: "Quantitative ESG Targets" },
      { id: "sdg", label: "United Nations SDG Alignment" },
      { id: "responsibilities", label: "Governance and Responsibilities" },
      { id: "monitoring", label: "Monitoring, Reporting & Transparency" },
      { id: "review", label: "Review Mechanism & Continuous Improvement" }
    ]
  };

  const sections = SECTION_CONFIGS[tpl].filter(s => {
    if (s.id === "preface" && !policy.declaration.preface) return false;
    if (s.id === "declaration" && !policy.declaration.declaration) return false;
    if (s.id === "scope" && !policy.declaration.scope) return false;
    if (s.id === "focus" && areas.length === 0) return false;
    if (s.id === "qualitative" && qualEntries.length === 0) return false;
    if (s.id === "quantitative" && quantEntries.length === 0) return false;
    if (s.id === "sdg" && policy.sdgs.length === 0) return false;
    if (s.id === "responsibilities" && policy.responsibilities.length === 0) return false;
    if (s.id === "monitoring" && !policy.monitoring) return false;
    if (s.id === "review" && !policy.reviewMechanism) return false;
    return true;
  });

  // Table of Contents
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("Table of Contents"));
  sections.forEach((s, i) => {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new InternalHyperlink({
            anchor: s.id,
            children: [
              new TextRun({ text: `${String(i + 1).padStart(2, "0")}. `, bold: true, color: FOREST, size: 24 }),
              new TextRun({ text: s.label, size: 24 }),
            ]
          })
        ],
      })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Render Sections
  sections.forEach((s) => {
    children.push(sectionTitle(s.label, s.id));
    
    switch (s.id) {
      case "preface":
        children.push(...bodyParagraphs(policy.declaration.preface));
        break;
      case "declaration":
        children.push(...bodyParagraphs(policy.declaration.declaration));
        break;
      case "scope":
        children.push(...bodyParagraphs(policy.declaration.scope));
        if (co.site) {
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [lightHeaderCell("Site", "50%"), lightHeaderCell("Address", "50%")] }),
                new TableRow({ children: [bodyCell(co.name, "50%", true), bodyCell(co.site, "50%")] }),
              ],
            })
          );
        }
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
              spacing: { before: 120, after: 60 },
              children: [new TextRun({ text: `${i + 1}. ${k}`, bold: true })],
            })
          );
          v.forEach((o) =>
            children.push(
              new Paragraph({
                spacing: { after: 60 },
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
                text: "Baseline year: FY 2022-23. All targets to be achieved by the stated deadline.",
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
                spacing: { before: 120, after: 60 },
                children: [
                  new TextRun({ text: q.area, bold: true, color: INK, size: 24 }),
                ],
              })
            );
            q.targets.filter(t => t.target).forEach((t) => {
              children.push(
                new Paragraph({
                  spacing: { after: 60 },
                  children: [
                    new TextRun({ text: `${t.target} (Baseline: ${t.baseline}, Deadline: ${t.deadline}).`, size: 22 }),
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
                headerCell("#", "6%"),
                headerCell("Focus Area", "26%"),
                headerCell("Target", "40%"),
                headerCell("Baseline", "14%"),
                headerCell("Deadline", "14%"),
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
                      bodyCell(ti === 0 ? String(qi + 1) : "", "6%", true),
                      bodyCell(ti === 0 ? q.area : "", "26%", true),
                      bodyCell(t.target, "40%"),
                      bodyCell(t.baseline, "14%"),
                      bodyCell(t.deadline, "14%"),
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
                spacing: { after: 80 },
                children: [
                  new TextRun({ text: r.role + " ", bold: true, size: 22 }),
                  new TextRun({ text: r.duty, size: 22 }),
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
        children.push(...bodyParagraphs(policy.monitoring));
        break;
      case "review":
        children.push(...bodyParagraphs(policy.reviewMechanism));
        break;
    }
  });

  children.push(spacer(120));
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Approved by: ", bold: true }),
        new TextRun({ text: co.approver || "_____________________" }),
      ],
    })
  );

  // Page break for acknowledgment form
  children.push(
    new Paragraph({ children: [new PageBreak()] })
  );

  // Acknowledgment form
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "Employee Acknowledgment Form", bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: `${POLICY_TYPE_META.label} · ${co.name}`, italics: true, size: 18, color: "666666" }),
      ],
    }),
    ...bodyParagraphs(
      `I hereby acknowledge that I have read and understood the ${POLICY_TYPE_META.label} of ${
        co.name || "[Company Name]"
      }. I am aware of the company's commitment to responsible practices as outlined in this policy and agree to uphold these standards in my daily work.`
    ),
    ...bodyParagraphs(
      "By signing below, I confirm my personal commitment to the values and obligations set forth in this policy."
    )
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

  const doc = new Document({
    creator: "PolicyCraft",
    title: `${POLICY_TYPE_META.label} - ${co.name || "Policy"}`,
    styles: {
      default: {
        document: { run: { font: "Georgia", size: 21, color: INK } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
        },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return buf as Buffer;
}

function sectionTitle(title: string, bookmarkId?: string): Paragraph {
  const titleChildren: any[] = [];
  if (bookmarkId) {
    titleChildren.push(new Bookmark({ id: bookmarkId, children: [] }));
  }
  titleChildren.push(
    new TextRun({
      text: title.toUpperCase(),
      bold: true,
      size: 20,
      font: "Arial",
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

function bodyParagraphs(text: string): Paragraph[] {
  if (!text) return [];
  const parts = text.split(/\r?\n+/).map((p) => p.trim()).filter(Boolean);
  return parts.map(
    (p) =>
      new Paragraph({
        spacing: { after: 120, line: 320 },
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: p, size: 21 })],
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
