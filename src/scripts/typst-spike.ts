// Throwaway benchmark: can Typst lay out a ~100-page SOP manual fast enough?
// Run: npx tsx scripts/typst-spike.ts
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const LOREM =
  "The site team records every waste stream at the point of generation, segregates it into the designated colour-coded bins and hands it over only to authorised recyclers. Supervisors verify the log each shift and escalate deviations to the EHS lead within one working day.";

function para(n: number) {
  return Array.from({ length: n }, () => LOREM).join(" ");
}

const pillars = ["Environmental", "Social", "Governance"] as const;
const sops = Array.from({ length: Number(process.env.SOPS ?? 14) }, (_, i) => ({
  code: `ACME/SOP/${String(i + 1).padStart(3, "0")}`,
  title: `Standard Operating Procedure ${i + 1}: Waste Segregation and Disposal`,
  pillar: pillars[i % 3],
  department: ["EHS", "HR", "Procurement", "IT"][i % 4],
  purpose: para(2),
  scope: para(2),
  definitions: Array.from({ length: 6 }, (_, j) => ({ term: `Term ${j + 1}`, definition: para(1) })),
  roles: Array.from({ length: 5 }, (_, j) => ({ role: `Role ${j + 1}`, text: para(1) })),
  steps: Array.from({ length: 8 }, (_, j) => ({ heading: `Step heading ${j + 1}`, body: para(3), responsible: "Shift supervisor" })),
  kpis: Array.from({ length: 5 }, (_, j) => ({ indicator: `Indicator ${j + 1}`, target: "â‰¥ 95%", frequency: "Monthly", owner: "EHS lead" })),
  records: Array.from({ length: 4 }, (_, j) => ({ record: `Record ${j + 1}`, owner: "EHS", retention: "3 years" })),
  review: para(2),
}));

const data = {
  company: "Acme Industries Pvt Ltd",
  docNo: "ACME/SOP/01",
  revision: "01",
  effective: "17 Oct 2026",
  intro: para(6),
  sops,
};

const MAIN = String.raw`
#let data = json("/data.json")
#set page(paper: "a4", margin: (top: 30mm, bottom: 22mm, x: 20mm),
  header: context {
    set text(8pt)
    table(columns: (1fr, auto, auto, auto), stroke: 0.4pt + luma(160), inset: 4pt,
      [*#data.company* \ SOP Manual], [Doc No \ #data.docNo], [Rev \ #data.revision],
      [Page #counter(page).display() of #counter(page).final().first()])
  },
  footer: context align(center, text(8pt, fill: luma(110))[Prepared by: EHS Manager #h(2em) Approved by: Managing Director]))
#set text(font: ("Inter", "Libertinus Serif"), size: 10pt, lang: "en")
#set par(justify: true, leading: 0.6em)
#set heading(numbering: "1.1")
#show heading.where(level: 1): it => { pagebreak(weak: true); block(fill: rgb("#1f4d3a"), inset: 10pt, width: 100%, text(fill: white, size: 15pt, it)) }

#align(center + horizon, text(26pt, weight: "bold")[#data.company \ SOP Manual])
#pagebreak()
#outline(depth: 2)
#pagebreak()
= Introduction
#data.intro

#for s in data.sops [
  = #s.title
  #table(columns: (auto, 1fr, auto, 1fr), stroke: 0.4pt, inset: 5pt,
    [*SOP No.*], s.code, [*Department*], s.department,
    [*Pillar*], s.pillar, [*Version*], [1.0])
  == Purpose
  #s.purpose
  == Scope
  #s.scope
  == Definitions
  #table(columns: (30%, 70%), stroke: 0.4pt, inset: 5pt, table.header([*Term*], [*Definition*]),
    ..s.definitions.map(d => (d.term, d.definition)).flatten())
  == Roles and Responsibilities
  #table(columns: (30%, 70%), stroke: 0.4pt, inset: 5pt, table.header([*Role*], [*Responsibilities*]),
    ..s.roles.map(r => (r.role, r.text)).flatten())
  == Procedure
  #for (i, st) in s.steps.enumerate() [
    *#(i + 1). #st.heading* #h(1fr) _Responsible: #(st.responsible)_ \
    #st.body
  ]
  == Monitoring and KPIs
  #table(columns: 4, stroke: 0.4pt, inset: 5pt, table.header([*Indicator*], [*Target*], [*Frequency*], [*Owner*]),
    ..s.kpis.map(k => (k.indicator, k.target, k.frequency, k.owner)).flatten())
  == Records
  #table(columns: 3, stroke: 0.4pt, inset: 5pt, table.header([*Record*], [*Owner*], [*Retention*]),
    ..s.records.map(r => (r.record, r.owner, r.retention)).flatten())
  == Review
  #s.review
]
`;

const root = resolve(".");
const fontDir = join(root, "public", "fonts");
const t0 = performance.now();
const compiler = NodeCompiler.create({ workspace: root, fontArgs: [{ fontPaths: [join(fontDir, "inter-400.ttf"), join(fontDir, "source-serif-4-400.ttf")] }] });
const tCreate = performance.now() - t0;

function run(label: string, mutate?: (d: typeof data) => void) {
  if (mutate) mutate(data);
  compiler.mapShadow(join(root, "data.json"), Buffer.from(JSON.stringify(data)));
  const a = performance.now();
  const res = compiler.compile({ mainFileContent: MAIN });
  const err = res.takeError();
  if (err) {
    console.error(compiler.fetchDiagnostics(err));
    throw new Error("compile failed");
  }
  const doc = res.result!;
  const b = performance.now();
  const pdf = compiler.pdf(doc);
  const c = performance.now();
  const svg = compiler.svg(doc);
  const d = performance.now();
  const pages = (svg.match(/class="typst-page"/g) ?? []).length;
  console.log(
    `${label}: compile ${(b - a).toFixed(0)}ms, pdf ${(c - b).toFixed(0)}ms, svg ${(d - c).toFixed(0)}ms (${(svg.length / 1e6).toFixed(1)}MB, ${pages} page groups), pdf ${(pdf.length / 1e6).toFixed(2)}MB`,
  );
  return { pdf, svg };
}

console.log(`create ${tCreate.toFixed(0)}ms`);
const cold = run("cold");
run("warm (no change)");
run("warm (edit SOP 7 purpose)", (d) => { d.sops[6].purpose += " Edited."; });
run("warm (edit SOP 1 adds text)", (d) => { d.sops[0].scope += " " + para(4); });

mkdirSync(join(root, ".scratch"), { recursive: true });
writeFileSync(join(root, ".scratch", "typst-spike.pdf"), cold.pdf);
writeFileSync(join(root, ".scratch", "typst-spike.svg"), cold.svg.slice(0, 4000));
const one = data.sops[3]; data.sops = [one]; run("single SOP preview"); data.sops = [one]; run("single SOP preview warm", (d) => { d.sops[0].review += " x"; });
const q = compiler.query({ mainFileContent: MAIN }, { selector: "heading.where(level: 1)", field: "location" });
console.log("query sample:", JSON.stringify(q).slice(0, 200));
