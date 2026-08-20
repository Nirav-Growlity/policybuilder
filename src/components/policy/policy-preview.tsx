"use client";

import type { CSSProperties } from "react";
import { documentThemeCssVariables } from "@/lib/document-themes";
import {
  buildDocumentRenderModel,
  type DocumentRenderModel,
  type DocumentRenderSection,
} from "@/lib/document-render-model";
import type { Policy, RichTextBlock } from "@/lib/types";

export function PolicyPreview({ policy }: { policy: Policy }) {
  const model = buildDocumentRenderModel(policy);
  const { theme, typography } = model;
  const style = {
    ...documentThemeCssVariables(theme),
    "--policy-font": typography.fontFamily,
    "--policy-heading-font": typography.headingFontFamily || typography.fontFamily,
    "--policy-heading-size": `${typography.headingSize}px`,
    "--policy-subheading-size": `${typography.subheadingSize}px`,
    "--policy-paragraph-size": `${typography.paragraphSize}px`,
    "--policy-line-height": String(typography.lineSpacing),
  } as CSSProperties;

  return (
    <article
      style={style}
      data-document-theme={theme.id}
      data-cover-layout={theme.layout.cover}
      data-toc-layout={theme.layout.toc}
      data-page-frame={theme.layout.pageFrame}
      data-data-layout={theme.layout.dataLayout}
      className="policy-preview-document mx-auto max-w-4xl overflow-hidden bg-[var(--doc-paper)] text-[var(--doc-ink)] shadow-[0_18px_50px_rgba(42,50,42,.14)]"
    >
      <style>{previewStyles}</style>
      <PolicyCover model={model} policy={policy} />
      {policy.showTableOfContents && <PolicyToc model={model} />}
      <RunningHeader model={model} policy={policy} />
      <main className="policy-main">
        {model.sections.map((section) => (
          <PolicySection key={section.id} section={section} model={model} policy={policy} />
        ))}
      </main>
      <PolicyFooter model={model} />
      {model.acknowledgement && <Acknowledgement model={model} />}
    </article>
  );
}

function PolicyCover({ model, policy }: { model: DocumentRenderModel; policy: Policy }) {
  const { cover, theme } = model;
  const logoAlign = policy.logoPosition === "right" ? "flex-end" : policy.logoPosition === "center" ? "center" : "flex-start";
  const logo = cover.logo ? <img src={cover.logo} alt={`${cover.companyName} logo`} className="policy-cover-logo max-w-full object-contain" /> : null;

  if (theme.layout.cover === "dossier-split") {
    return (
      <header className="policy-cover cover-dossier-split">
        <div className="dossier-masthead">
          <div className="dossier-mark"><span /><span /><span /></div>
          <div className="dossier-vertical-label">Policy dossier</div>
          <div className="dossier-edition">Executive<br />Edition</div>
        </div>
        <div className="dossier-cover-body">
          {logo && <div className="mb-auto flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">Sustainability governance</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          <MetadataStrip metadata={cover.metadata} className="dossier-cover-meta" />
        </div>
      </header>
    );
  }

  if (theme.layout.cover === "atlas-modular") {
    return (
      <header className="policy-cover cover-atlas-modular">
        <div className="atlas-cover-title">
          <div className="atlas-orbit" aria-hidden="true"><span /><span /></div>
          <div className="policy-cover-kicker">Impact atlas · Policy 01</div>
          <h1>{cover.policyLabel}</h1>
        </div>
        <div className="atlas-cover-index">
          <span>Policy</span><b>01</b><small>Living commitments</small>
        </div>
        <div className="atlas-cover-company">
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <p className="policy-cover-company">{cover.companyName}</p>
          <MetadataStrip metadata={cover.metadata} className="atlas-cover-meta" />
        </div>
      </header>
    );
  }

  if (theme.layout.cover === "journal-editorial") {
    return (
      <header className="policy-cover cover-journal-editorial">
        <div className="journal-rule" />
        <div className="journal-contours" aria-hidden="true">{[0, 1, 2, 3, 4].map((ring) => <span key={ring} />)}</div>
        {logo && <div className="journal-logo flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
        <div className="journal-title-block">
          <div className="policy-cover-kicker">Field journal · Sustainability policy</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
        </div>
        <aside className="journal-cover-meta">
          {cover.metadata.map((item) => <MetaPair key={item.label} label={item.label} value={item.value} />)}
        </aside>
      </header>
    );
  }

  return (
    <header className="policy-cover cover-charter-frame">
      <div className="charter-frame-outer" aria-hidden="true" />
      <div className="charter-frame-inner" aria-hidden="true" />
      <div className="charter-botanical" aria-hidden="true"><span /><span /><span /></div>
      <div className="charter-cover-content">
        {logo && <div className="mb-9 flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
        <div className="policy-cover-kicker"><span />Sustainability charter<span /></div>
        <h1>{cover.policyLabel}</h1>
        <p className="policy-cover-company">{cover.companyName}</p>
      </div>
      <div className="charter-colophon">
        {cover.metadata.map((item) => <MetaPair key={item.label} label={item.label} value={item.value} />)}
      </div>
    </header>
  );
}

function MetadataStrip({ metadata, className = "" }: { metadata: DocumentRenderModel["cover"]["metadata"]; className?: string }) {
  return <div className={`policy-metadata-strip ${className}`}>{metadata.map((item) => <MetaPair key={item.label} label={item.label} value={item.value} />)}</div>;
}

function MetaPair({ label, value }: { label: string; value: string }) {
  return <div className="policy-meta-pair"><span>{label}</span><b>{value}</b></div>;
}

function PolicyToc({ model }: { model: DocumentRenderModel }) {
  const entries = model.acknowledgement
    ? [...model.tocEntries, { id: "acknowledgement", index: model.tocEntries.length + 1, title: model.acknowledgement.title }]
    : model.tocEntries;
  const layout = model.theme.layout.toc;

  if (layout === "rail-index") {
    return (
      <section className="policy-toc toc-rail-index">
        <aside><span>Document</span><b>INDEX</b><small>{String(entries.length).padStart(2, "0")} sections</small></aside>
        <div className="toc-rail-list"><h2>Contents</h2>{entries.map((entry) => <TocLink key={entry.id} entry={entry} mode="rail" />)}</div>
      </section>
    );
  }

  if (layout === "tile-index") {
    return (
      <section className="policy-toc toc-tile-index">
        <div className="toc-title-row"><span>Navigate the policy</span><h2>Contents</h2></div>
        <div className="toc-tile-grid">{entries.map((entry) => <TocLink key={entry.id} entry={entry} mode="tile" />)}</div>
      </section>
    );
  }

  if (layout === "editorial-index") {
    return (
      <section className="policy-toc toc-editorial-index">
        <header><span>Index</span><h2>Inside this policy</h2></header>
        <div className="toc-editorial-columns">{entries.map((entry) => <TocLink key={entry.id} entry={entry} mode="editorial" />)}</div>
      </section>
    );
  }

  return (
    <section className="policy-toc toc-dotted-leaders">
      <div className="charter-ornament"><span /><b>Contents</b><span /></div>
      <ol>{entries.map((entry) => <TocLink key={entry.id} entry={entry} mode="leaders" />)}</ol>
    </section>
  );
}

function TocLink({ entry, mode }: { entry: { id: string; index: number; title: string }; mode: "leaders" | "rail" | "tile" | "editorial" }) {
  const number = String(entry.index).padStart(2, "0");
  if (mode === "leaders") return <li><b>{number}</b><span>{entry.title}</span><i /><small>{entry.index + 1}</small></li>;
  if (mode === "tile") return <div className="toc-tile"><b>{number}</b><span>{entry.title}</span><small>Section</small></div>;
  if (mode === "editorial") return <div className="toc-editorial-item"><b>{number}</b><span>{entry.title}</span></div>;
  return <div className="toc-rail-item"><b>{number}</b><span>{entry.title}</span><small>{entry.index + 1}</small></div>;
}

function RunningHeader({ model, policy }: { model: DocumentRenderModel; policy: Policy }) {
  const layout = model.theme.layout.runningFurniture;
  const logoAlign = policy.logoPosition === "right" ? "ml-auto" : policy.logoPosition === "center" ? "mx-auto" : "";
  return (
    <div className={`policy-running-header running-${layout}`}>
      {model.cover.logo && <img src={model.cover.logo} alt="Company logo" className={`max-h-9 max-w-[130px] object-contain ${logoAlign}`} />}
      <span>{model.cover.companyName}</span>
      <b>{layout === "breadcrumb-bar" ? "Policy / Governance / Current" : model.theme.name}</b>
    </div>
  );
}

function PolicySection({ section, model, policy }: { section: DocumentRenderSection; model: DocumentRenderModel; policy: Policy }) {
  const frame = model.theme.layout.pageFrame;
  const number = String(section.index).padStart(2, "0");
  const content = <SectionContent section={section} model={model} policy={policy} />;

  if (frame === "numbered-rail") {
    return <section id={section.id} className={`policy-section frame-numbered-rail density-${section.density}`}><aside><b>{number}</b><span>{section.kind}</span></aside><div className="policy-section-body"><SectionHeading section={section} />{content}</div></section>;
  }
  if (frame === "modular-grid") {
    return <section id={section.id} className={`policy-section frame-modular-grid density-${section.density}`}><SectionHeading section={section} /><div className="policy-section-body">{content}</div></section>;
  }
  if (frame === "editorial-margin") {
    return <section id={section.id} className={`policy-section frame-editorial-margin density-${section.density}`}><aside><b>{number}</b><span>{section.kind}</span></aside><div className="policy-section-body"><SectionHeading section={section} />{content}</div></section>;
  }
  return <section id={section.id} className={`policy-section frame-single-folio density-${section.density}`}><SectionHeading section={section} /><div className="policy-section-body">{content}</div></section>;
}

function SectionHeading({ section }: { section: DocumentRenderSection }) {
  return <header className="policy-section-heading"><span>{String(section.index).padStart(2, "0")}</span><h2>{section.title}</h2><i /></header>;
}

function SectionContent({ section, model, policy }: { section: DocumentRenderSection; model: DocumentRenderModel; policy: Policy }) {
  const { content, recipe } = section;
  const recipeClass = `recipe-${recipe}`;
  switch (content.type) {
    case "narrative": return <div className={recipeClass}><Paras text={content.text} />{content.sites?.length ? <SiteTable sites={content.sites} /> : null}</div>;
    case "focus": return <FocusAreas areas={content.areas} recipe={recipe} density={section.density} />;
    case "qualitative": return <QualitativeGroups groups={content.groups} recipe={recipe} density={section.density} />;
    case "quantitative": return <QuantitativeTargets areas={content.areas} model={model} policy={policy} density={section.density} />;
    case "sdg": return <SdgGoals goals={content.goals} model={model} policy={policy} />;
    case "responsibilities": return <Responsibilities entries={content.entries} model={model} policy={policy} density={section.density} />;
    case "revision": return <RevisionTable entries={content.entries} />;
    case "custom": return <Blocks blocks={content.blocks} recipe={recipe} />;
  }
}

function Paras({ text }: { text: string }) {
  return <>{text.split(/\r?\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>;
}

function FocusAreas({ areas, recipe, density }: { areas: string[]; recipe: string; density: string }) {
  return <div className={`policy-focus-list recipe-${recipe} density-${density}`}>{areas.map((area, index) => <div key={`${area}-${index}`} className="policy-focus-item"><b>{String(index + 1).padStart(2, "0")}</b><span>{area}</span></div>)}</div>;
}

function QualitativeGroups({ groups, recipe, density }: { groups: { area: string; items: string[] }[]; recipe: string; density: string }) {
  return <div className={`policy-objective-groups recipe-${recipe} density-${density}`}>{groups.map((group, index) => <section key={`${group.area}-${index}`}><header><b>{String(index + 1).padStart(2, "0")}</b><h3>{group.area}</h3></header><ul>{group.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul></section>)}</div>;
}

function QuantitativeTargets({ areas, model, policy, density }: { areas: Policy["quantitative"]; model: DocumentRenderModel; policy: Policy; density: string }) {
  const targets = areas.flatMap((area) => area.targets.filter((target) => target.target).map((target) => ({ ...target, area: area.area })));
  const useBands = model.theme.layout.dataLayout === "target-bands" && policy.visualStyle !== "corporate" && density !== "dense";
  const useJournalEntries = model.theme.layout.dataLayout === "quiet-rules" && policy.visualStyle !== "corporate" && density !== "dense";
  if (useBands) {
    return <div className="policy-target-bands">{targets.map((target, index) => <div key={`${target.area}-${target.target}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><section><h3>{target.area}</h3><p>{target.target}</p></section><aside><span>{target.reportingFrequency === "Annually" ? "Reported annually" : target.deadline || "Target period"}</span><small>{target.reportingFrequency === "Annually" ? "Ongoing" : target.baseline || "No baseline"}</small></aside></div>)}</div>;
  }
  if (useJournalEntries) {
    return <div className="policy-journal-targets">{targets.map((target, index) => <div key={`${target.area}-${target.target}-${index}`}><b>{target.area}</b><p>{target.target}</p><span>{target.reportingFrequency === "Annually" ? "Reported annually" : `Baseline ${target.baseline || "-"} · Due ${target.deadline || "-"}`}</span></div>)}</div>;
  }
  return <PolicyTable headers={["#", "Focus Area", "Target", "Baseline", "Deadline", "Reporting"]} rows={targets.map((target, index) => [String(index + 1), target.area, target.target, target.reportingFrequency === "Annually" ? "-" : target.baseline, target.reportingFrequency === "Annually" ? "-" : target.deadline, target.reportingFrequency || "Target period"])} />;
}

function SdgGoals({ goals, model, policy }: { goals: { number: number; label: string; color: string }[]; model: DocumentRenderModel; policy: Policy }) {
  if (policy.sdgDisplay === "tiles") {
    return <div className={`policy-sdg-tiles ${model.theme.layout.dataLayout === "target-bands" ? "sdg-atlas-mosaic" : ""}`}>{goals.map((goal) => <div key={goal.number} className="policy-sdg-tile"><img src={`/E%20SDG%20Icons%20WEB/E-WEB-Goal-${String(goal.number).padStart(2, "0")}.png`} alt={`UN Sustainable Development Goal ${goal.number}: ${goal.label}`} /><span>{goal.label}</span></div>)}</div>;
  }
  return <div className="policy-sdg-names">{goals.map((goal) => <div key={goal.number} style={{ borderColor: goal.color }}><b style={{ background: goal.color }}>SDG {goal.number}</b><span>{goal.label}</span></div>)}</div>;
}

function Responsibilities({ entries, model, policy, density }: { entries: Policy["responsibilities"]; model: DocumentRenderModel; policy: Policy; density: string }) {
  if (model.theme.layout.dataLayout === "formal-grid" && policy.visualStyle === "corporate") return <PolicyTable headers={["Role / Department", "Responsibility"]} rows={entries.map((entry) => [entry.role, entry.duty])} />;
  return <div className={`policy-responsibility-list responsibility-${model.theme.layout.pageFrame} density-${density}`}>{entries.map((entry, index) => <div key={`${entry.role}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><section><h3>{entry.role}</h3><p>{entry.duty}</p></section></div>)}</div>;
}

function SiteTable({ sites }: { sites: NonNullable<Extract<DocumentRenderSection["content"], { type: "narrative" }>["sites"]> }) {
  return <PolicyTable headers={["Location / Unit", "Address", "Primary Function"]} rows={sites.map((site, index) => [site.location || `Site ${index + 1}`, site.address, site.primaryFunction || "Operating Site"])} />;
}

function RevisionTable({ entries }: { entries: NonNullable<Policy["revisionHistory"]> }) {
  return <PolicyTable headers={["Revision No.", "Date", "Description of Change"]} rows={entries.map((entry) => [entry.revisionNo, entry.date, entry.description])} />;
}

function PolicyTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="policy-table-wrap"><table className="policy-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] || ""}</td>)}</tr>)}</tbody></table></div>;
}

function Blocks({ blocks, recipe }: { blocks: RichTextBlock[]; recipe: string }) {
  return <div className={`policy-custom-blocks recipe-${recipe}`}>{blocks.map((block) => {
    if (block.type === "paragraph") return <Paras key={block.id} text={block.text} />;
    if (block.type === "table") return <PolicyTable key={block.id} headers={block.columns || []} rows={block.rows || []} />;
    const Tag = block.type === "bullets" ? "ul" : "ol";
    return <Tag key={block.id}>{block.text.split(/\r?\n+/).filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</Tag>;
  })}</div>;
}

function PolicyFooter({ model }: { model: DocumentRenderModel }) {
  const layout = model.theme.layout.runningFurniture;
  return <footer className={`policy-footer footer-${layout}`}><span>Effective {model.footer.effectiveDate}</span><span>Approved by {model.footer.approver}</span><span>Revision {model.footer.revision}</span><b>PolicyCraft · 01</b></footer>;
}

function Acknowledgement({ model }: { model: DocumentRenderModel }) {
  const acknowledgement = model.acknowledgement!;
  return <section className={`policy-acknowledgement acknowledgement-${model.theme.layout.acknowledgement}`}><span className="ack-kicker">Acknowledgement · Final page</span><h2>{acknowledgement.title}</h2><p>{acknowledgement.statement}</p><div className="ack-fields">{acknowledgement.fields.map((field) => <div key={field} className={field === "Signature" ? "ack-signature" : ""}><span>{field}</span><i /></div>)}</div></section>;
}

const previewStyles = `
  @keyframes documentThemeIn { from { opacity: .72; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .policy-preview-document { animation: documentThemeIn 220ms ease-out both; font-family: var(--policy-font), Arial, sans-serif; font-size: var(--policy-paragraph-size); line-height: var(--policy-line-height); }
  .policy-preview-document *, .policy-preview-document *::before, .policy-preview-document *::after { box-sizing: border-box; }
  .policy-preview-document h1, .policy-preview-document h2, .policy-preview-document h3 { font-family: var(--policy-heading-font), Georgia, serif; }
  .policy-preview-document h1 { margin: 0; font-size: calc(var(--policy-heading-size) * 2.65); line-height: 1.04; }
  .policy-preview-document h2 { margin: 0; font-size: var(--policy-heading-size); line-height: 1.14; }
  .policy-preview-document h3 { margin: 0; font-size: var(--policy-subheading-size); line-height: 1.2; }
  .policy-preview-document p { margin: 0 0 12px; text-align: justify; }
  .policy-cover { position: relative; min-height: 510px; overflow: hidden; }
  .policy-cover-logo { width: auto; height: 72px; }
  .policy-cover-kicker { color: var(--doc-primary); font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
  .policy-cover-company { margin: 13px 0 0; color: var(--doc-muted); font-size: 14px; }
  .policy-meta-pair { min-width: 0; }
  .policy-meta-pair span { display: block; color: var(--doc-muted); font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .policy-meta-pair b { display: block; margin-top: 3px; color: var(--doc-ink); font-size: 10px; overflow-wrap: anywhere; }
  .policy-metadata-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }

  .cover-charter-frame { display: flex; min-height: 580px; flex-direction: column; align-items: center; justify-content: center; padding: 82px 86px 74px; text-align: center; }
  .charter-frame-outer, .charter-frame-inner { position: absolute; pointer-events: none; }
  .charter-frame-outer { inset: 24px; border: 1px solid var(--doc-primary); }
  .charter-frame-inner { inset: 33px; border: 1px solid var(--doc-line); }
  .charter-botanical { position: absolute; left: 50%; top: 63px; display: flex; transform: translateX(-50%); gap: 2px; }
  .charter-botanical span { width: 14px; height: 24px; border: 1px solid var(--doc-accent); border-radius: 100% 0 100% 0; transform: rotate(-28deg); }
  .charter-botanical span:nth-child(2) { height: 29px; transform: rotate(0); }
  .charter-botanical span:nth-child(3) { transform: rotate(28deg) scaleX(-1); }
  .charter-cover-content { position: relative; width: min(100%, 610px); }
  .cover-charter-frame .policy-cover-kicker { display: flex; align-items: center; justify-content: center; gap: 14px; }
  .cover-charter-frame .policy-cover-kicker span { width: 48px; height: 1px; background: var(--doc-accent); }
  .cover-charter-frame h1 { margin-top: 34px; }
  .charter-colophon { position: absolute; inset-inline: 82px; bottom: 64px; display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--doc-primary); padding-top: 16px; text-align: left; }

  .cover-dossier-split { display: grid; grid-template-columns: 35% 65%; min-height: 545px; }
  .dossier-masthead { position: relative; display: flex; flex-direction: column; padding: 44px 36px; background: var(--doc-primary); color: var(--doc-on-primary); }
  .dossier-mark { display: flex; gap: 5px; }
  .dossier-mark span { width: 26px; height: 2px; background: var(--doc-on-primary); opacity: .75; }
  .dossier-vertical-label { position: absolute; left: 35px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: 800; letter-spacing: .28em; text-transform: uppercase; writing-mode: vertical-rl; }
  .dossier-edition { margin-top: auto; color: color-mix(in srgb, var(--doc-on-primary) 74%, transparent); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
  .dossier-cover-body { display: flex; min-width: 0; flex-direction: column; padding: 44px 50px 38px; background: linear-gradient(135deg, var(--doc-paper), var(--doc-soft)); text-align: left; }
  .dossier-cover-body h1 { max-width: 520px; margin-top: 25px; }
  .dossier-cover-meta { margin-top: 38px; border-top: 2px solid var(--doc-primary); }
  .dossier-cover-meta .policy-meta-pair { padding: 12px 8px 0 0; }

  .cover-atlas-modular { display: grid; min-height: 550px; grid-template-columns: 31% 69%; grid-template-rows: 64% 36%; }
  .atlas-cover-title { position: relative; grid-column: 1 / 3; overflow: hidden; padding: 54px 58px; background: var(--doc-soft); }
  .atlas-cover-title h1 { position: relative; z-index: 1; max-width: 70%; margin-top: 40px; }
  .atlas-orbit { position: absolute; right: -25px; top: -55px; width: 310px; height: 310px; border: 42px solid var(--doc-primary); border-radius: 50%; opacity: .9; }
  .atlas-orbit span:first-child { position: absolute; inset: 38px; border: 2px solid var(--doc-accent); border-radius: 50%; }
  .atlas-orbit span:last-child { position: absolute; left: -44px; bottom: 18px; width: 70px; height: 70px; background: var(--doc-accent); }
  .atlas-cover-index { display: flex; flex-direction: column; justify-content: space-between; padding: 28px; background: var(--doc-primary); color: var(--doc-on-primary); text-transform: uppercase; }
  .atlas-cover-index span { font-size: 10px; font-weight: 800; letter-spacing: .18em; }
  .atlas-cover-index b { font-size: 47px; font-weight: 500; line-height: 1; }
  .atlas-cover-index small { font-size: 8px; letter-spacing: .12em; }
  .atlas-cover-company { display: flex; min-width: 0; flex-direction: column; justify-content: flex-end; padding: 25px 34px; }
  .atlas-cover-company .policy-cover-company { color: var(--doc-ink); font-weight: 700; }
  .atlas-cover-meta { margin-top: 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 16px; }

  .cover-journal-editorial { min-height: 580px; padding: 48px 54px; }
  .journal-rule { width: 170px; height: 4px; background: var(--doc-accent); }
  .journal-contours { position: absolute; right: 42px; top: 34px; width: 320px; height: 230px; opacity: .45; }
  .journal-contours span { position: absolute; border: 1px solid var(--doc-accent); border-radius: 48% 52% 45% 55%; }
  .journal-contours span:nth-child(1) { inset: 0; transform: rotate(7deg); }
  .journal-contours span:nth-child(2) { inset: 20px 12px; transform: rotate(-5deg); }
  .journal-contours span:nth-child(3) { inset: 43px 31px; transform: rotate(9deg); }
  .journal-contours span:nth-child(4) { inset: 69px 57px; transform: rotate(-8deg); }
  .journal-contours span:nth-child(5) { inset: 94px 86px; }
  .journal-logo { position: absolute; right: 54px; bottom: 49px; width: 180px; }
  .journal-title-block { position: absolute; left: 54px; bottom: 56px; width: 57%; border-bottom: 1px solid var(--doc-line); padding-bottom: 22px; text-align: left; }
  .journal-title-block h1 { margin-top: 24px; }
  .journal-cover-meta { position: absolute; right: 54px; top: 285px; width: 180px; border-top: 1px solid var(--doc-accent); padding-top: 11px; }
  .journal-cover-meta .policy-meta-pair { margin-bottom: 10px; }

  .policy-toc { border-block: 1px solid var(--doc-line); }
  .toc-dotted-leaders { padding: 58px 90px 64px; }
  .charter-ornament { display: flex; align-items: center; justify-content: center; gap: 16px; color: var(--doc-primary); font-family: var(--policy-heading-font); font-size: var(--policy-heading-size); }
  .charter-ornament span { width: 54px; height: 1px; background: var(--doc-accent); }
  .toc-dotted-leaders ol { margin: 32px auto 0; max-width: 620px; padding: 0; list-style: none; }
  .toc-dotted-leaders li { display: flex; align-items: end; gap: 9px; margin: 11px 0; font-size: 11px; }
  .toc-dotted-leaders li b { color: var(--doc-primary); }
  .toc-dotted-leaders li i { margin-bottom: 4px; flex: 1; border-bottom: 1px dotted var(--doc-muted); }
  .toc-dotted-leaders li small { color: var(--doc-muted); }
  .toc-rail-index { display: grid; min-height: 390px; grid-template-columns: 28% 72%; }
  .toc-rail-index > aside { display: flex; flex-direction: column; padding: 43px 36px; background: var(--doc-primary); color: var(--doc-on-primary); }
  .toc-rail-index > aside span, .toc-rail-index > aside small { font-size: 9px; letter-spacing: .16em; text-transform: uppercase; }
  .toc-rail-index > aside b { margin: auto 0; font-size: 27px; letter-spacing: .08em; }
  .toc-rail-list { padding: 42px 48px; }
  .toc-rail-list h2 { margin-bottom: 24px; }
  .toc-rail-item { display: grid; grid-template-columns: 32px 1fr 24px; gap: 8px; border-top: 1px solid var(--doc-line); padding: 9px 0; font-size: 10px; }
  .toc-rail-item b { color: var(--doc-accent); }
  .toc-rail-item small { color: var(--doc-muted); text-align: right; }
  .toc-tile-index { padding: 48px 50px 55px; background: color-mix(in srgb, var(--doc-paper) 75%, var(--doc-soft)); }
  .toc-title-row { display: flex; align-items: end; justify-content: space-between; margin-bottom: 24px; }
  .toc-title-row > span { color: var(--doc-primary); font-size: 9px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
  .toc-tile-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .toc-tile { display: grid; min-height: 72px; grid-template-columns: 42px 1fr; grid-template-rows: 1fr auto; background: var(--doc-paper); padding: 13px; box-shadow: 0 2px 8px rgba(20,50,45,.05); }
  .toc-tile b { grid-row: 1 / 3; color: var(--doc-primary); font-size: 20px; font-weight: 500; }
  .toc-tile span { align-self: end; font-size: 10px; font-weight: 700; }
  .toc-tile small { color: var(--doc-muted); font-size: 7px; letter-spacing: .12em; text-transform: uppercase; }
  .toc-editorial-index { padding: 62px 68px; }
  .toc-editorial-index header { display: grid; grid-template-columns: 25% 75%; border-top: 3px solid var(--doc-accent); padding-top: 15px; }
  .toc-editorial-index header span { color: var(--doc-accent); font-size: 9px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
  .toc-editorial-columns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 34px; margin-top: 36px; }
  .toc-editorial-item { display: grid; grid-template-columns: 42px 1fr; align-items: baseline; border-top: 1px solid var(--doc-line); padding: 13px 0; }
  .toc-editorial-item b { color: var(--doc-accent); font-family: var(--policy-heading-font); font-size: 22px; font-weight: 400; }
  .toc-editorial-item span { font-size: 10px; }

  .policy-running-header { display: flex; min-height: 58px; align-items: center; gap: 14px; margin: 0 50px; border-bottom: 1px solid var(--doc-line); color: var(--doc-muted); font-size: 8px; letter-spacing: .1em; text-transform: uppercase; }
  .policy-running-header b { margin-left: auto; color: var(--doc-primary); font-size: 8px; }
  .running-breadcrumb-bar { margin: 0; padding: 0 48px; border: 0; background: var(--doc-primary); color: var(--doc-on-primary); }
  .running-breadcrumb-bar b { color: var(--doc-on-primary); }
  .running-edge-folio { border-bottom: 4px solid var(--doc-primary); }
  .running-outer-folio { margin-inline: 64px; border-color: var(--doc-accent); font-style: italic; text-transform: none; }

  .policy-main { padding: 44px 50px 52px; }
  .policy-section { scroll-margin-top: 24px; }
  .policy-section + .policy-section { margin-top: 45px; }
  .policy-section-heading { display: flex; align-items: center; gap: 13px; margin-bottom: 20px; }
  .policy-section-heading > span { color: var(--doc-primary); font-size: 9px; font-weight: 800; letter-spacing: .12em; }
  .policy-section-heading > i { height: 1px; flex: 1; background: var(--doc-line); }
  .frame-single-folio { max-width: 680px; margin-inline: auto; }
  .frame-single-folio .policy-section-heading { justify-content: center; text-align: center; }
  .frame-single-folio .policy-section-heading > i { max-width: 100px; background: var(--doc-accent); }
  .frame-single-folio .policy-section-heading > span { order: 2; }
  .frame-single-folio .policy-section-heading h2 { order: 1; text-transform: uppercase; letter-spacing: .1em; }
  .frame-single-folio .policy-section-heading > i { order: 3; }
  .frame-numbered-rail { display: grid; grid-template-columns: 106px minmax(0, 1fr); margin-inline: -50px; }
  .frame-numbered-rail + .frame-numbered-rail { margin-top: 0; border-top: 1px solid var(--doc-line); }
  .frame-numbered-rail > aside { display: flex; min-height: 190px; flex-direction: column; padding: 28px 22px; background: var(--doc-primary); color: var(--doc-on-primary); }
  .frame-numbered-rail > aside b { font-size: 29px; font-weight: 500; }
  .frame-numbered-rail > aside span { margin-top: auto; font-size: 8px; letter-spacing: .16em; text-transform: uppercase; writing-mode: vertical-rl; }
  .frame-numbered-rail > .policy-section-body { min-width: 0; padding: 30px 50px 36px 38px; }
  .frame-numbered-rail .policy-section-heading > span { display: none; }
  .frame-numbered-rail .policy-section-heading > i { height: 2px; background: var(--doc-primary); }
  .frame-modular-grid { margin-inline: -8px; padding: 8px; }
  .frame-modular-grid + .frame-modular-grid { margin-top: 22px; }
  .frame-modular-grid .policy-section-heading { margin: 0 0 14px; padding: 16px 18px; background: var(--doc-primary); color: var(--doc-on-primary); }
  .frame-modular-grid .policy-section-heading > span { color: var(--doc-on-primary); }
  .frame-modular-grid .policy-section-heading > i { background: color-mix(in srgb, var(--doc-on-primary) 40%, transparent); }
  .frame-editorial-margin { display: grid; max-width: 720px; grid-template-columns: 122px minmax(0, 1fr); margin-inline: auto; }
  .frame-editorial-margin > aside { padding-top: 4px; color: var(--doc-accent); }
  .frame-editorial-margin > aside b { display: block; font-family: var(--policy-heading-font); font-size: 46px; font-weight: 400; line-height: 1; }
  .frame-editorial-margin > aside span { display: block; margin-top: 10px; color: var(--doc-muted); font-size: 8px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
  .frame-editorial-margin .policy-section-heading { border-top: 2px solid var(--doc-accent); padding-top: 10px; }
  .frame-editorial-margin .policy-section-heading > span { display: none; }
  .frame-editorial-margin .policy-section-heading > i { display: none; }
  .frame-editorial-margin .policy-section-body > div > p:first-child::first-letter { float: left; margin: 1px 8px 0 0; color: var(--doc-accent); font-family: var(--policy-heading-font); font-size: 39px; line-height: .85; }

  .policy-table-wrap { margin-top: 17px; overflow-x: auto; }
  .policy-table { width: 100%; border-collapse: collapse; border: 1px solid var(--doc-line); font-size: calc(var(--policy-paragraph-size) * .83); line-height: 1.35; }
  .policy-table th, .policy-table td { border-right: 1px solid var(--doc-line); border-bottom: 1px solid var(--doc-line); padding: 9px; text-align: left; vertical-align: middle; }
  .policy-table th { background: var(--doc-primary); color: var(--doc-on-primary); font-weight: 800; }
  [data-data-layout="compact-ledger"] .policy-table { border-inline: 0; font-size: calc(var(--policy-paragraph-size) * .78); }
  [data-data-layout="compact-ledger"] .policy-table th { border-bottom: 2px solid var(--doc-primary); background: var(--doc-soft); color: var(--doc-primary-dark); }
  [data-data-layout="compact-ledger"] .policy-table th, [data-data-layout="compact-ledger"] .policy-table td { padding: 7px 8px; }
  [data-data-layout="target-bands"] .policy-table tbody tr:nth-child(even) { background: var(--doc-soft); }
  [data-data-layout="quiet-rules"] .policy-table { border-inline: 0; }
  [data-data-layout="quiet-rules"] .policy-table th { border-top: 1px solid var(--doc-accent); border-bottom: 1px solid var(--doc-accent); background: transparent; color: var(--doc-primary-dark); }
  [data-data-layout="quiet-rules"] .policy-table th, [data-data-layout="quiet-rules"] .policy-table td { border-right: 0; }

  .policy-focus-list { display: grid; gap: 8px; }
  .policy-focus-item { display: grid; grid-template-columns: 48px 1fr; align-items: center; border: 1px solid var(--doc-line); }
  .policy-focus-item b { align-self: stretch; display: grid; place-items: center; background: var(--doc-primary); color: var(--doc-on-primary); }
  .policy-focus-item span { padding: 10px 13px; }
  .recipe-dossier-columns.policy-focus-list, .recipe-atlas-modules.policy-focus-list { grid-template-columns: repeat(2, 1fr); }
  .recipe-dossier-columns .policy-focus-item { grid-template-columns: 38px 1fr; border: 0; border-bottom: 1px solid var(--doc-line); }
  .recipe-dossier-columns .policy-focus-item b { background: transparent; color: var(--doc-accent); }
  .recipe-atlas-modules .policy-focus-item { min-height: 82px; grid-template-columns: 54px 1fr; border: 0; background: var(--doc-soft); }
  .recipe-atlas-modules .policy-focus-item b { background: transparent; color: var(--doc-primary); font-size: 22px; font-weight: 500; }
  .recipe-journal-entries .policy-focus-item { grid-template-columns: 56px 1fr; border: 0; border-top: 1px solid var(--doc-line); }
  .recipe-journal-entries .policy-focus-item b { background: transparent; color: var(--doc-accent); font-family: var(--policy-heading-font); font-size: 20px; font-weight: 400; }
  .density-dense.recipe-dossier-columns.policy-focus-list, .density-dense.recipe-atlas-modules.policy-focus-list { grid-template-columns: 1fr; }

  .policy-objective-groups { display: grid; gap: 17px; }
  .policy-objective-groups > section { border-top: 1px solid var(--doc-line); padding-top: 10px; }
  .policy-objective-groups header { display: flex; align-items: baseline; gap: 10px; }
  .policy-objective-groups header b { color: var(--doc-primary); font-size: 9px; }
  .policy-objective-groups ul { margin: 9px 0 0; padding-left: 19px; }
  .policy-objective-groups li { margin: 5px 0; }
  .recipe-dossier-columns.policy-objective-groups, .recipe-atlas-modules.policy-objective-groups { grid-template-columns: repeat(2, 1fr); }
  .recipe-dossier-columns.policy-objective-groups > section { padding: 12px 14px; border: 1px solid var(--doc-line); border-top: 3px solid var(--doc-primary); }
  .recipe-atlas-modules.policy-objective-groups > section { border: 0; background: var(--doc-soft); padding: 16px; }
  .recipe-atlas-modules.policy-objective-groups header b { font-size: 20px; font-weight: 500; }
  .recipe-journal-entries.policy-objective-groups header b { color: var(--doc-accent); font-family: var(--policy-heading-font); font-size: 20px; font-weight: 400; }
  .density-dense.recipe-dossier-columns.policy-objective-groups, .density-dense.recipe-atlas-modules.policy-objective-groups { grid-template-columns: 1fr; }

  .policy-target-bands { display: grid; gap: 8px; }
  .policy-target-bands > div { display: grid; grid-template-columns: 52px minmax(0,1fr) 130px; align-items: stretch; background: var(--doc-soft); }
  .policy-target-bands > div > b { display: grid; place-items: center; color: var(--doc-primary); font-size: 20px; font-weight: 500; }
  .policy-target-bands > div > section { padding: 13px 15px; border-inline: 1px solid var(--doc-line); }
  .policy-target-bands > div > section p { margin: 6px 0 0; text-align: left; }
  .policy-target-bands > div > aside { display: flex; flex-direction: column; justify-content: center; padding: 10px 13px; }
  .policy-target-bands > div > aside span { font-size: 9px; font-weight: 800; }
  .policy-target-bands > div > aside small { margin-top: 4px; color: var(--doc-muted); font-size: 8px; }
  .policy-journal-targets > div { display: grid; grid-template-columns: 150px 1fr; border-top: 1px solid var(--doc-line); padding: 14px 0; }
  .policy-journal-targets b { color: var(--doc-accent); font-family: var(--policy-heading-font); }
  .policy-journal-targets p { margin: 0; text-align: left; }
  .policy-journal-targets span { grid-column: 2; margin-top: 4px; color: var(--doc-muted); font-size: 9px; font-style: italic; }

  .policy-responsibility-list { display: grid; gap: 9px; }
  .policy-responsibility-list > div { display: grid; grid-template-columns: 42px 1fr; border-top: 1px solid var(--doc-line); padding-top: 10px; }
  .policy-responsibility-list > div > b { color: var(--doc-primary); }
  .policy-responsibility-list section p { margin: 5px 0 0; text-align: left; }
  .responsibility-numbered-rail, .responsibility-modular-grid { grid-template-columns: repeat(2, 1fr); }
  .responsibility-numbered-rail > div { border: 1px solid var(--doc-line); padding: 12px; }
  .responsibility-modular-grid > div { min-height: 115px; border: 0; background: var(--doc-soft); padding: 15px; }
  .responsibility-editorial-margin > div { grid-template-columns: 56px 1fr; }
  .responsibility-editorial-margin > div > b { color: var(--doc-accent); font-family: var(--policy-heading-font); font-size: 20px; font-weight: 400; }
  .policy-responsibility-list.density-dense { grid-template-columns: 1fr; }

  .policy-sdg-tiles { display: flex; flex-wrap: wrap; gap: 10px; }
  .policy-sdg-tile { width: 100px; overflow: hidden; background: var(--doc-paper); }
  .policy-sdg-tile img { display: block; width: 100px; height: 100px; object-fit: cover; }
  .policy-sdg-tile span { display: none; }
  .sdg-atlas-mosaic { display: grid; grid-template-columns: repeat(4, 1fr); }
  .sdg-atlas-mosaic .policy-sdg-tile { position: relative; width: auto; background: var(--doc-soft); }
  .sdg-atlas-mosaic .policy-sdg-tile img { width: 100%; height: auto; }
  .sdg-atlas-mosaic .policy-sdg-tile span { display: block; padding: 7px; font-size: 8px; font-weight: 700; }
  .policy-sdg-names { display: grid; gap: 7px; }
  .policy-sdg-names > div { display: grid; grid-template-columns: 80px 1fr; align-items: stretch; border: 1px solid; }
  .policy-sdg-names b { padding: 8px; color: white; font-size: 9px; }
  .policy-sdg-names span { padding: 8px 11px; }

  .policy-custom-blocks > p { margin-bottom: 12px; }
  .policy-custom-blocks ul, .policy-custom-blocks ol { margin: 12px 0; padding-left: 20px; }
  .policy-custom-blocks li { margin: 5px 0; }
  .policy-footer { display: flex; align-items: center; gap: 18px; border-top: 1px solid var(--doc-primary); padding: 18px 50px; color: var(--doc-muted); font-size: 8px; }
  .policy-footer b { margin-left: auto; color: var(--doc-primary); }
  .footer-breadcrumb-bar { background: var(--doc-primary); color: var(--doc-on-primary); }
  .footer-breadcrumb-bar b { color: var(--doc-on-primary); }
  .footer-edge-folio { border-color: var(--doc-line); }
  .footer-outer-folio { margin-inline: 64px; padding-inline: 0; border-color: var(--doc-accent); font-style: italic; }

  .policy-acknowledgement { margin-top: 0; border-top: 1px dashed var(--doc-line); padding: 50px 64px 60px; background: var(--doc-soft); }
  .policy-acknowledgement .ack-kicker { color: var(--doc-primary); font-size: 8px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
  .policy-acknowledgement h2 { margin-top: 14px; }
  .policy-acknowledgement > p { max-width: 650px; margin-top: 18px; text-align: left; }
  .ack-fields { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px 34px; margin-top: 32px; }
  .ack-fields > div span { color: var(--doc-muted); font-size: 8px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .ack-fields i { display: block; height: 31px; border-bottom: 1px solid var(--doc-muted); }
  .ack-fields .ack-signature { grid-column: 1 / 3; }
  .acknowledgement-legal-form { margin: 26px; border: 1px solid var(--doc-primary); outline: 1px solid var(--doc-line); outline-offset: -9px; background: var(--doc-paper); text-align: center; }
  .acknowledgement-legal-form > p { margin-inline: auto; text-align: center; }
  .acknowledgement-approval-block { border: 0; border-left: 110px solid var(--doc-primary); background: var(--doc-paper); }
  .acknowledgement-signature-panel { border-top: 8px solid var(--doc-primary); }
  .acknowledgement-signature-panel .ack-fields > div { background: var(--doc-paper); padding: 12px; }
  .acknowledgement-affidavit { margin-inline: 64px; padding-inline: 0; border-top: 3px solid var(--doc-accent); background: var(--doc-paper); }
  .acknowledgement-affidavit h2 { font-size: calc(var(--policy-heading-size) * 1.4); font-style: italic; }

  @media (max-width: 720px) {
    .policy-cover { min-height: 430px; }
    .cover-charter-frame { padding: 62px 44px; }
    .charter-colophon { inset-inline: 48px; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .cover-dossier-split { grid-template-columns: 28% 72%; }
    .dossier-cover-body { padding: 32px 28px; }
    .atlas-cover-title { padding: 38px 32px; }
    .atlas-cover-title h1 { max-width: 82%; }
    .journal-title-block { width: 68%; }
    .journal-cover-meta { display: none; }
    .policy-main { padding: 34px 28px; }
    .frame-numbered-rail { grid-template-columns: 78px minmax(0, 1fr); margin-inline: -28px; }
    .frame-numbered-rail > .policy-section-body { padding: 28px; }
    .frame-editorial-margin { grid-template-columns: 78px minmax(0, 1fr); }
    .toc-dotted-leaders, .toc-editorial-index, .toc-tile-index { padding-inline: 34px; }
    .toc-rail-index { grid-template-columns: 24% 76%; }
    .toc-rail-list { padding: 32px 25px; }
    .policy-metadata-strip { grid-template-columns: repeat(2, 1fr); }
    .recipe-dossier-columns.policy-focus-list, .recipe-atlas-modules.policy-focus-list, .recipe-dossier-columns.policy-objective-groups, .recipe-atlas-modules.policy-objective-groups, .responsibility-numbered-rail, .responsibility-modular-grid, .sdg-atlas-mosaic { grid-template-columns: 1fr; }
    .policy-target-bands > div { grid-template-columns: 42px 1fr; }
    .policy-target-bands > div > aside { grid-column: 2; border-top: 1px solid var(--doc-line); }
    .policy-footer { flex-wrap: wrap; padding-inline: 28px; }
  }
  @media (prefers-reduced-motion: reduce) { .policy-preview-document { animation: none; } }
`;
