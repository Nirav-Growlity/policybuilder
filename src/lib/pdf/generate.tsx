import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Font,
} from "@react-pdf/renderer";
import { getCompanySites, type Policy } from "../types";
import { SDG_DATA, POLICY_TYPE_META } from "../constants";
import * as React from "react";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    lineHeight: 1.55,
    color: "#1a1a1a",
  },
  cover: {
    alignItems: "center",
    paddingVertical: 50,
    borderBottom: "2 solid #1a5c3a",
    marginBottom: 24,
  },
  coverLabel: {
    fontSize: 9,
    letterSpacing: 3,
    color: "#1a5c3a",
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: "#0e1a14",
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 12,
    color: "#555",
    marginBottom: 20,
  },
  metaTable: {
    width: "100%",
    borderTop: "1 solid #1a5c3a",
    borderLeft: "1 solid #1a5c3a",
  },
  metaRow: {
    flexDirection: "row",
  },
  metaLabel: {
    width: "25%",
    backgroundColor: "#1a5c3a",
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    padding: 6,
    borderRight: "1 solid #1a5c3a",
    borderBottom: "1 solid #1a5c3a",
  },
  metaValue: {
    width: "25%",
    fontSize: 9.5,
    padding: 6,
    borderRight: "1 solid #1a5c3a",
    borderBottom: "1 solid #1a5c3a",
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1a5c3a",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: "1 solid #c8e8d8",
  },
  paragraph: {
    fontSize: 10.5,
    lineHeight: 1.7,
    marginBottom: 8,
    textAlign: "justify",
  },
  bullet: {
    fontSize: 10.5,
    lineHeight: 1.6,
    marginBottom: 4,
    marginLeft: 12,
    flexDirection: "row",
  },
  bulletDot: { width: 10, color: "#1a5c3a" },
  bulletText: { flex: 1 },
  numbered: {
    flexDirection: "row",
    marginBottom: 6,
  },
  num: { width: 22, fontFamily: "Helvetica-Bold", color: "#1a5c3a" },
  numText: { flex: 1, fontSize: 10.5, lineHeight: 1.6 },
  table: {
    width: "100%",
    borderTop: "1 solid #c8e8d8",
    borderLeft: "1 solid #c8e8d8",
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1a5c3a",
    color: "#fff",
  },
  th: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    padding: 6,
    borderRight: "1 solid #1a5c3a",
    borderBottom: "1 solid #1a5c3a",
    color: "#fff",
  },
  tr: { flexDirection: "row", borderBottom: "1 solid #e5e1d3" },
  td: {
    fontSize: 9.5,
    padding: 5,
    borderRight: "1 solid #e5e1d3",
  },
  siteTable: {
    width: "100%",
    borderTop: "1 solid #c8e8d8",
    borderLeft: "1 solid #c8e8d8",
    marginTop: 6,
  },
  sdgRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  sdgChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 9.5,
    marginRight: 4,
    marginBottom: 4,
  },
  sdgDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 5,
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    padding: 2,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8.5,
    color: "#888",
    paddingTop: 8,
    borderTop: "1.5 solid #1a5c3a",
  },
  approverLine: {
    marginTop: 16,
    fontSize: 10.5,
  },
  ackBox: {
    marginTop: 30,
    padding: 18,
    border: "1 solid #c8e8d8",
    borderRadius: 6,
  },
  ackTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 12,
  },
  ackGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
  },
  ackField: {
    width: "50%",
    paddingRight: 12,
    marginBottom: 14,
  },
  ackLabel: {
    fontSize: 8.5,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  ackLine: { borderBottom: "1 solid #aaa", height: 22 },
  ackSignature: { borderBottom: "1 solid #aaa", height: 36, marginTop: 6 },
});

export async function generatePdf(policy: Policy): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <PdfBody policy={policy} />
      </Page>
    </Document>
  );
  const blob = await pdf(doc).toBuffer();
  return blob as unknown as Buffer;
}

function PdfBody({ policy }: { policy: Policy }) {
  const co = policy.company;
  const sites = getCompanySites(co);
  const tpl = policy.presentationTemplate || "standard";
  const isModern = policy.visualStyle === "modern";

  const areas = policy.focusAreas.filter(Boolean);
  const qualEntries = Object.entries(policy.qualitative).filter(([, v]) => v && v.length);
  const quantEntries = policy.quantitative.filter((q) => q.targets && q.targets.some((t) => t.target));

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

  const renderSectionContent = (id: string, title: string) => {
    switch (id) {
      case "preface":
        return (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.paragraph}>{policy.declaration.preface}</Text>
          </View>
        );
      case "declaration":
        return (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.paragraph}>{policy.declaration.declaration}</Text>
          </View>
        );
      case "scope":
        return (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.paragraph}>{policy.declaration.scope}</Text>
            {sites.length > 0 && (
              <View style={styles.siteTable}>
                <View style={[styles.tr, { backgroundColor: "#f3eee3" }]}>
                  <Text style={[styles.td, { fontFamily: "Helvetica-Bold", width: "25%" }]}>Location</Text>
                  <Text style={[styles.td, { fontFamily: "Helvetica-Bold", width: "50%" }]}>Address</Text>
                  <Text style={[styles.td, { fontFamily: "Helvetica-Bold", width: "25%" }]}>Primary Function</Text>
                </View>
                {sites.map((st, i) => (
                  <View key={i} style={styles.tr}>
                    <Text style={[styles.td, { width: "25%", fontFamily: "Helvetica-Bold" }]}>{st.location || co.name || `Site ${i + 1}`}</Text>
                    <Text style={[styles.td, { width: "50%" }]}>{st.address}</Text>
                    <Text style={[styles.td, { width: "25%" }]}>{st.primaryFunction || "Operating Site"}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      case "focus":
        return (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {areas.map((a, i) => (
              <View key={i} style={styles.numbered}>
                <Text style={styles.num}>{String(i + 1).padStart(2, "0")}.</Text>
                <Text style={styles.numText}>{a}</Text>
              </View>
            ))}
          </View>
        );
      case "qualitative":
        return (
          <View>
            <Text style={styles.sectionTitle} wrap={false}>{title}</Text>
            {qualEntries.map(([k, v], i) => (
              <View key={k} wrap={false}>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 8, marginBottom: 3 }}>
                  {i + 1}. {k}
                </Text>
                {v.map((o, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>▸</Text>
                    <Text style={styles.bulletText}>{o}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      case "quantitative":
        return (
          <View>
            <Text style={styles.sectionTitle} wrap={false}>{title}</Text>
            <Text style={{ fontSize: 9, color: "#666", marginBottom: 6 }} wrap={false}>
              Baseline year: FY 2022-23. All targets to be achieved by the stated deadline.
            </Text>
            {isModern ? (
              <View>
                {quantEntries.map((q, qi) => (
                  <View key={qi} style={{ marginBottom: 10 }}>
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5, color: "#1a5c3a", marginBottom: 4 }}>
                      {qi + 1}. {q.area}
                    </Text>
                    {q.targets.filter(t => t.target).map((t, ti) => (
                      <View key={ti} style={[styles.bullet, { marginBottom: 3, marginLeft: 10 }]}>
                        <Text style={styles.bulletDot}>▸</Text>
                        <Text style={[styles.bulletText, { fontSize: 10 }]}>
                          <Text style={{ fontFamily: "Helvetica-Bold" }}>Target: </Text>{t.target}
                          <Text style={{ color: "#666", fontSize: 9 }}> (Baseline: {t.baseline} | Deadline: {t.deadline})</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeader} wrap={false}>
                  <Text style={[styles.th, { width: "6%" }]}>#</Text>
                  <Text style={[styles.th, { width: "26%" }]}>Focus Area</Text>
                  <Text style={[styles.th, { width: "40%" }]}>Target</Text>
                  <Text style={[styles.th, { width: "14%" }]}>Baseline</Text>
                  <Text style={[styles.th, { width: "14%" }]}>Deadline</Text>
                </View>
                {quantEntries.flatMap((q, qi) =>
                  q.targets
                    .filter((t) => t.target)
                    .map((t, ti) => (
                      <View key={`${qi}-${ti}`} style={styles.tr} wrap={false}>
                        <Text style={[styles.td, { width: "6%", fontFamily: "Helvetica-Bold" }]}>
                          {ti === 0 ? qi + 1 : ""}
                        </Text>
                        <Text style={[styles.td, { width: "26%", fontFamily: "Helvetica-Bold" }]}>
                          {ti === 0 ? q.area : ""}
                        </Text>
                        <Text style={[styles.td, { width: "40%" }]}>{t.target}</Text>
                        <Text style={[styles.td, { width: "14%" }]}>{t.baseline}</Text>
                        <Text style={[styles.td, { width: "14%" }]}>{t.deadline}</Text>
                      </View>
                    ))
                )}
              </View>
            )}
          </View>
        );
      case "sdg":
        return (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.paragraph}>
              This policy aligns with the following United Nations Sustainable Development Goals:
            </Text>
            <View style={styles.sdgRow}>
              {policy.sdgs.map((n) => {
                const s = SDG_DATA.find((d) => d.n === n)!;
                return (
                  <View key={n} style={[styles.sdgChip, { backgroundColor: `${s.c}20` }]}>
                    <View style={[styles.sdgDot, { backgroundColor: s.c }]}>
                      <Text>{s.n}</Text>
                    </View>
                    <Text style={{ color: s.c, fontFamily: "Helvetica-Bold" }}>SDG {s.n}: {s.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      case "responsibilities":
        return (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {isModern ? (
              <View>
                {policy.responsibilities.map((r, i) => (
                  <View key={i} style={{ marginBottom: 6 }}>
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: "#1a5c3a", marginBottom: 2 }}>{r.role}</Text>
                    <Text style={{ fontSize: 10, lineHeight: 1.4, color: "#333" }}>{r.duty}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.table}>
                <View style={[styles.tr, { backgroundColor: "#f3eee3" }]}>
                  <Text style={[styles.td, { width: "30%", fontFamily: "Helvetica-Bold" }]}>Role / Department</Text>
                  <Text style={[styles.td, { fontFamily: "Helvetica-Bold" }]}>Responsibility</Text>
                </View>
                {policy.responsibilities.map((r, i) => (
                  <View key={i} style={styles.tr}>
                    <Text style={[styles.td, { width: "30%", fontFamily: "Helvetica-Bold" }]}>{r.role}</Text>
                    <Text style={styles.td}>{r.duty}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      case "monitoring":
        return (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.paragraph}>{policy.monitoring}</Text>
          </View>
        );
      case "review":
        return (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.paragraph}>{policy.reviewMechanism}</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View>
      {/* Cover */}
      <View style={styles.cover}>
        <Text style={styles.coverLabel}>SUSTAINABILITY POLICY</Text>
        <Text style={styles.coverTitle}>{POLICY_TYPE_META.label}</Text>
        <Text style={styles.coverSubtitle}>{co.name || "[Company Name]"}</Text>
        <View style={styles.metaTable}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Document No.</Text>
            <Text style={styles.metaValue}>{co.docNum || "—"}</Text>
            <Text style={styles.metaLabel}>Effective Date</Text>
            <Text style={styles.metaValue}>{co.effectiveDate || "—"}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Revision No.</Text>
            <Text style={styles.metaValue}>{co.revNum || "01"}</Text>
            <Text style={styles.metaLabel}>Next Review</Text>
            <Text style={styles.metaValue}>{co.reviewDate || "—"}</Text>
          </View>
        </View>
      </View>

      {/* Table of Contents */}
      <View break style={{ marginBottom: 30 }}>
        <Text style={styles.sectionTitle}>Table of Contents</Text>
        <View style={{ marginTop: 10 }}>
          {sections.map((s, i) => (
            <View key={s.id} style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Text style={{ width: 30, fontFamily: 'Helvetica-Bold', color: '#1a5c3a' }}>{String(i + 1).padStart(2, "0")}.</Text>
              <Text style={{ flex: 1, fontFamily: 'Helvetica' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Content Sections */}
      {sections.map((s) => (
        <React.Fragment key={s.id}>
          {renderSectionContent(s.id, s.label)}
        </React.Fragment>
      ))}

      <Text style={styles.approverLine} wrap={false}>
        <Text style={{ fontFamily: "Helvetica-Bold" }}>Approved by: </Text>
        {co.approver || "_____________________"}
      </Text>

      {/* Acknowledgment form */}
      <View style={styles.ackBox} break>
        <Text style={styles.ackTitle}>Employee Acknowledgment Form</Text>
        <Text style={{ fontSize: 9.5, lineHeight: 1.65 }}>
          I hereby acknowledge that I have read and understood the <Text style={{ fontFamily: "Helvetica-Bold" }}>{POLICY_TYPE_META.label}</Text> of {co.name || "[Company Name]"}. I am aware of the company's commitment to responsible practices as outlined in this policy and agree to uphold these standards in my daily work. By signing below, I confirm my personal commitment to the values and obligations set forth in this policy.
        </Text>
        <View style={styles.ackGrid}>
          {["Employee Name", "Employee ID", "Department", "Date"].map((f) => (
            <View key={f} style={styles.ackField}>
              <Text style={styles.ackLabel}>{f}</Text>
              <View style={styles.ackLine} />
            </View>
          ))}
        </View>
        <View>
          <Text style={styles.ackLabel}>Signature</Text>
          <View style={styles.ackSignature} />
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer} fixed>
        <Text>Effective Date: {co.effectiveDate || "—"}</Text>
        <Text>Next Review: {co.reviewDate || "—"}</Text>
        <Text>Revision: {co.revNum || "01"}</Text>
      </Text>
    </View>
  );
}
