import { coverDesign } from "@/lib/cover-designs";
import type { CSSProperties, ReactNode } from "react";
import { documentThemeCssVariables } from "@/lib/document-themes";
import { fontFaceCssFor } from "@/lib/document-fonts";
import { CoverArt, type CoverMotifScene } from "@/components/policy/cover-art";
import {
  buildDocumentRenderModel,
  getRunningHeaderBrand,
  type DocumentRenderModel,
  type DocumentRenderSection,
} from "@/lib/document-render-model";
import type { Policy, RichTextBlock } from "@/lib/types";
import { getCoverBindingValue, getCoverTextPresentation } from "@/lib/cover-composition";
import { formatQuantitativeTargetSentence, groupQuantitativeTargets, type QuantitativeTargetGroup } from "@/lib/quantitative";

export function PolicyPreview({ policy, customCoverPng }: { policy: Policy; customCoverPng?: string }) {
  const model = buildDocumentRenderModel(policy);
  const { theme, typography } = model;
  const style = previewDocumentStyle(theme, typography);

  return (
    <article
      style={style}
      data-collection={theme.collection}
      data-document-theme={theme.id}
      data-document-template={theme.id}
      data-layout-family={theme.layout.layoutId}
      data-cover-layout={theme.layout.cover}
      data-cover-scene={theme.layout.cover}
      data-toc-layout={theme.layout.toc}
      data-contents-scene={theme.layout.toc}
      data-page-frame={theme.layout.pageFrame}
      data-page-zones={theme.layout.pageFrame}
      data-data-layout={theme.layout.dataLayout}
      data-control-treatment={theme.layout.controlTreatment}
      data-professional-variant={theme.layout.professionalVariant || ""}
      data-theme-density={theme.density}
      data-composition-fingerprint={theme.compositionFingerprint}
      className="policy-preview-document mx-auto max-w-4xl overflow-hidden bg-[var(--doc-paper)] text-[var(--doc-ink)] shadow-[0_18px_50px_rgba(42,50,42,.14)]"
    >
      <style>{`${fontFaceCssFor(coverFontFamilies(model))}${previewStyles}`}</style>
      <PolicyCover model={model} policy={policy} customCoverPng={customCoverPng} />
      {policy.showTableOfContents && <PolicyToc model={model} />}
      <RunningHeader model={model} policy={policy} />
      <main className={`policy-main ${theme.collection === "professional" ? `professional-main professional-main-${theme.layout.professionalVariant || "corporate"}` : ""}`}>
        {model.featureImage?.placement === "section" && <FeatureImage image={model.featureImage} className="policy-section-feature" />}
        {model.sections.map((section) => (
          <PolicySection key={section.id} section={section} model={model} policy={policy} />
        ))}
      </main>
      <PolicyFooter model={model} />
      {model.acknowledgement && <Acknowledgement model={model} />}
    </article>
  );
}

/**
 * The cover-only version of the document preview. It deliberately uses the
 * same theme variables and cover component as the complete preview so the
 * inline editor never invents a second visual language for page one.
 */
export function PolicyCoverPreview({ policy, customCoverPng, showElements = true }: { policy: Policy; customCoverPng?: string; showElements?: boolean }) {
  const model = buildDocumentRenderModel(policy);
  const { theme, typography } = model;
  return (
    <article
      style={previewDocumentStyle(theme, typography)}
      data-collection={theme.collection}
      data-document-theme={theme.id}
      data-document-template={theme.id}
      data-cover-layout={theme.layout.cover}
      data-cover-scene={theme.layout.cover}
      data-professional-variant={theme.layout.professionalVariant || ""}
      className="policy-preview-document cover-preview-only overflow-hidden bg-[var(--doc-paper)] text-[var(--doc-ink)]"
    >
      <style>{`${fontFaceCssFor(coverFontFamilies(model))}${previewStyles}`}</style>
      <PolicyCover model={model} policy={policy} customCoverPng={customCoverPng} showElements={showElements} />
    </article>
  );
}

function previewDocumentStyle(theme: ReturnType<typeof buildDocumentRenderModel>["theme"], typography: ReturnType<typeof buildDocumentRenderModel>["typography"]) {
  return {
    ...documentThemeCssVariables(theme),
    background: "var(--doc-page-background)",
    "--policy-font": JSON.stringify(typography.fontFamily),
    "--policy-heading-font": JSON.stringify(typography.headingFontFamily || typography.fontFamily),
    "--policy-heading-size": `${typography.headingSize}pt`,
    "--policy-subheading-size": `${typography.subheadingSize}pt`,
    "--policy-paragraph-size": `${typography.paragraphSize}pt`,
    "--policy-line-height": String(typography.lineSpacing),
  } as CSSProperties;
}

function coverFontFamilies(model: DocumentRenderModel): string[] {
  return [
    model.typography.fontFamily,
    model.typography.headingFontFamily || "",
    ...(model.cover.composition?.elements
      .filter((element) => element.type === "text")
      .map((element) => element.fontFamily) || []),
  ];
}

export function PolicyCover({ model, policy, customCoverPng, showElements = true }: { model: DocumentRenderModel; policy: Policy; customCoverPng?: string; showElements?: boolean }) {
  if (model.cover.composition) return customCoverPng ? <section className="policy-cover policy-custom-cover" data-cover-mode="custom"><img src={customCoverPng} alt="Custom cover" className="policy-custom-cover-rendered" /></section> : <CustomCover model={model} policy={policy} showElements={showElements} />;
  const { theme } = model;
  const brand = getRunningHeaderBrand(policy.company);
  const cover = { ...model.cover, companyName: brand.kind === "logo" ? "" : model.cover.companyName };
  const scene = theme.layout.cover;
  const logoAlign = policy.logoPosition === "right" ? "flex-end" : policy.logoPosition === "center" ? "center" : "flex-start";
  const logo = brand.kind === "logo" ? <img src={brand.source} alt="Company logo" className="policy-cover-logo object-contain" /> : null;
  const feature = model.featureImage?.placement === "cover" ? <FeatureImage image={model.featureImage} className={`policy-cover-feature feature-${theme.layout.imageTreatment}`} /> : null;
  const motifColors = {
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    soft: theme.colors.soft,
    line: theme.colors.line,
    paper: theme.colors.paper,
    ink: theme.colors.ink,
  };
  const art = <CoverArt scene={scene as CoverMotifScene} colors={motifColors} className="cover-motif" />;
  const kicker = "";
  const meta = cover.metadata;

  if (theme.collection === "professional") return <ProfessionalCover model={model} feature={feature} />;
  switch (scene) {
    case "civic-plain":
      return (
        <header className="policy-cover cover-civic-plain">
          {feature}
          <div className="civic-rule" aria-hidden="true" />
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker"><span />{kicker}<span /></div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          {art}
          <div className="civic-colophon">{meta.map((item) => <MetaPair key={item.label} label={item.label} value={item.value} />)}</div>
        </header>
      );
    case "signal-split":
      return (
        <header className="policy-cover cover-signal-split">
          {feature}
          <div className="signal-body">
            {logo && <div className="mb-auto flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="policy-cover-company">{cover.companyName}</p>
            <MetadataStrip metadata={meta} className="signal-meta" />
          </div>
          <div className="signal-panel" aria-hidden="true">{art}</div>
        </header>
      );
    case "open-broad":
      return (
        <header className="policy-cover cover-open-broad">
          {feature}
          <div className="open-band" aria-hidden="true" />
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          {art}
          <MetadataStrip metadata={meta} className="open-meta" />
        </header>
      );
    case "swiss-poster":
      return (
        <header className="policy-cover cover-swiss-poster">
          {feature}
          <div className="swiss-rail" aria-hidden="true"><span>Grid · 01</span></div>
          <div className="swiss-body">
            {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            {art}
            <p className="policy-cover-company">{cover.companyName}</p>
            <MetadataStrip metadata={meta} className="swiss-meta" />
          </div>
        </header>
      );
    case "ledger-rail":
      return (
        <header className="policy-cover cover-ledger-rail">
          {feature}
          <aside className="ledger-rail-side"><span>Executive ledger</span><b>01</b><small>Board edition</small></aside>
          <div className="ledger-rail-body">
            {logo && <div className="mb-auto flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="policy-cover-company">{cover.companyName}</p>
            {art}
            <MetadataStrip metadata={meta} className="ledger-rail-meta" />
          </div>
        </header>
      );
    case "decision-stamp":
      return (
        <header className="policy-cover cover-decision-stamp">
          {feature}
          <div className="decision-frame">
            {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            {art}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="policy-cover-company">{cover.companyName}</p>
            <MetadataStrip metadata={meta} className="decision-meta" />
          </div>
        </header>
      );
    case "routing-slip":
      return (
        <header className="policy-cover cover-routing-slip">
          {feature}
          <div className="routing-masthead">Memorandum</div>
          <div className="routing-slip-grid">
            <span>To · Leadership</span><span>From · {cover.companyName}</span>
            <span>Date · {meta[1]?.value || "-"}</span><span>Subject · {cover.policyLabel}</span>
          </div>
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          {art}
          <MetadataStrip metadata={meta} className="routing-meta" />
        </header>
      );
    case "seal-medallion":
      return (
        <header className="policy-cover cover-seal-medallion">
          {feature}
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="seal-art" aria-hidden="true">{art}</div>
          <div className="policy-cover-kicker"><span />{kicker}<span /></div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          <div className="seal-colophon">{meta.map((item) => <MetaPair key={item.label} label={item.label} value={item.value} />)}</div>
        </header>
      );
    case "clause-code":
      return (
        <header className="policy-cover cover-clause-code">
          {feature}
          <div className="clause-numbers" aria-hidden="true"><span>§1</span><span>§2</span><span>§3</span><b>§4</b></div>
          <div className="clause-body">
            {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="policy-cover-company">{cover.companyName}</p>
            {art}
            <MetadataStrip metadata={meta} className="clause-meta" />
          </div>
        </header>
      );
    case "exhibit-file":
      return (
        <header className="policy-cover cover-exhibit-file">
          {feature}
          <div className="exhibit-tabs" aria-hidden="true"><span>A</span><span>B</span><span>C</span></div>
          <div className="exhibit-body">
            {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="policy-cover-company">{cover.companyName}</p>
            {art}
            <MetadataStrip metadata={meta} className="exhibit-meta" />
          </div>
        </header>
      );
    case "gazette-masthead":
      return (
        <header className="policy-cover cover-gazette-masthead">
          {feature}
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="gazette-crest" aria-hidden="true">{art}</div>
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          <div className="gazette-colophon">{meta.map((item) => <MetaPair key={item.label} label={item.label} value={item.value} />)}</div>
        </header>
      );
    case "colonnade-rule":
      return (
        <header className="policy-cover cover-colonnade-rule">
          {feature}
          <div className="colonnade-cornice" aria-hidden="true" />
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <div className="colonnade-columns">
            <p>{cover.companyName} · {meta[0]?.label} {meta[0]?.value}</p>
            <p>{meta[2]?.label} {meta[2]?.value} · {meta[1]?.label} {meta[1]?.value}</p>
          </div>
          {art}
          <MetadataStrip metadata={meta} className="colonnade-meta" />
        </header>
      );
    case "indenture-margin":
      return (
        <header className="policy-cover cover-indenture-margin">
          {feature}
          <div className="indenture-body">
            {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="policy-cover-company">{cover.companyName}</p>
            {art}
            <MetadataStrip metadata={meta} className="indenture-meta" />
          </div>
          <aside className="indenture-margin-col" aria-hidden="true"><span>¶1</span><span>¶2</span><span>¶3</span></aside>
        </header>
      );
    case "chapterhouse-drop":
      return (
        <header className="policy-cover cover-chapterhouse-drop">
          {feature}
          <div className="chapter-top">
            <div className="chapter-drop" aria-hidden="true">{art}</div>
            <div className="chapter-head">
              {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
              <div className="policy-cover-kicker">{kicker}</div>
              <h1>{cover.policyLabel}</h1>
              <p className="policy-cover-company">{cover.companyName}</p>
            </div>
          </div>
          <MetadataStrip metadata={meta} className="chapter-meta" />
        </header>
      );
    case "broadsheet-columns":
      return (
        <header className="policy-cover cover-broadsheet-columns">
          {feature}
          <div className="broadsheet-masthead"><span>{cover.companyName}</span><b>Policy Broadsheet</b><span>{meta[1]?.value || ""}</span></div>
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          {art}
          <MetadataStrip metadata={meta} className="broadsheet-meta" />
        </header>
      );
    case "fieldbook-grid":
      return (
        <header className="policy-cover cover-fieldbook-grid">
          {feature}
          <div className="fieldbook-card">
            {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="policy-cover-company">{cover.companyName}</p>
            <div className="fieldbook-plot" aria-hidden="true">{art}<span className="fieldbook-pin">Survey · 01</span></div>
            <MetadataStrip metadata={meta} className="fieldbook-meta" />
          </div>
        </header>
      );
    case "canopy-band":
      return (
        <header className="policy-cover cover-canopy-band">
          {feature}
          <div className="canopy-art" aria-hidden="true">{art}</div>
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          <MetadataStrip metadata={meta} className="canopy-meta" />
        </header>
      );
    case "summit-target":
      return (
        <header className="policy-cover cover-summit-target">
          {feature}
          <div className="summit-art" aria-hidden="true">{art}</div>
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          <MetadataStrip metadata={meta} className="summit-meta" />
        </header>
      );
    case "commons-card":
      return (
        <header className="policy-cover cover-commons-card">
          {feature}
          <div className="commons-card-body">
            {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="policy-cover-company">{cover.companyName}</p>
            {art}
            <MetadataStrip metadata={meta} className="commons-meta" />
          </div>
        </header>
      );
    case "scoreboard-tiles":
      return (
        <header className="policy-cover cover-scoreboard-tiles">
          {feature}
          <div className="scoreboard-grid" aria-hidden="true">
            {[["01", "Coverage"], ["02", "Targets"], ["03", "Owners"], ["04", "Review"]].map(([n, label]) => (
              <div key={n} className="scoreboard-tile"><b>{n}</b><span>{label}</span></div>
            ))}
          </div>
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          <MetadataStrip metadata={meta} className="scoreboard-meta" />
        </header>
      );
    case "tape-ledger":
      return (
        <header className="policy-cover cover-tape-ledger">
          {feature}
          <div className="tape-strip" aria-hidden="true" />
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          {art}
          <MetadataStrip metadata={meta} className="tape-meta" />
        </header>
      );
    case "dial-review":
      return (
        <header className="policy-cover cover-dial-review">
          {feature}
          <div className="dial-top">
            <div className="dial-head">
              {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
              <div className="policy-cover-kicker">{kicker}</div>
              <h1>{cover.policyLabel}</h1>
              <p className="policy-cover-company">{cover.companyName}</p>
            </div>
            <div className="dial-art" aria-hidden="true">{art}</div>
          </div>
          <MetadataStrip metadata={meta} className="dial-meta" />
        </header>
      );
    case "proceedings-abstract":
      return (
        <header className="policy-cover cover-proceedings-abstract">
          {feature}
          <div className="proceedings-box">
            {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
            <div className="policy-cover-kicker">{kicker}</div>
            <h1>{cover.policyLabel}</h1>
            <p className="proceedings-keywords">Keywords · {cover.companyName} · {meta[0]?.value || ""}</p>
            {art}
          </div>
          <MetadataStrip metadata={meta} className="proceedings-meta" />
        </header>
      );
    case "blueprint-spec":
      return (
        <header className="policy-cover cover-blueprint-spec">
          {feature}
          <div className="blueprint-tag">Spec · {meta[0]?.value || "STD-01"}</div>
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          <div className="blueprint-art" aria-hidden="true">{art}</div>
          <MetadataStrip metadata={meta} className="blueprint-meta" />
        </header>
      );
    case "docket-matrix":
    default:
      return (
        <header className="policy-cover cover-docket-matrix">
          {feature}
          <div className="docket-grid" aria-hidden="true">
            <div className="docket-cell"><b>F-01</b></div>
            <div className="docket-cell"><b>SRC</b></div>
            <div className="docket-cell"><b>F-02</b></div>
            <div className="docket-cell docket-art">{art}</div>
          </div>
          {logo && <div className="flex" style={{ justifyContent: logoAlign }}>{logo}</div>}
          <div className="policy-cover-kicker">{kicker}</div>
          <h1>{cover.policyLabel}</h1>
          <p className="policy-cover-company">{cover.companyName}</p>
          <MetadataStrip metadata={meta} className="docket-meta" />
        </header>
      );
  }
}

function CustomCover({ model, policy, showElements = true }: { model: DocumentRenderModel; policy: Policy; showElements?: boolean }) {
  const composition = model.cover.composition!;
  return <section className="policy-cover policy-custom-cover" style={{ backgroundColor: composition.background.color }} data-cover-mode="custom">
    <CoverCompositionElements composition={composition} policy={policy} showElements={showElements} />
  </section>;
}

/* eslint-disable @next/next/no-img-element */
function CoverCompositionElements({ composition, policy, showElements }: { composition: NonNullable<DocumentRenderModel["cover"]["composition"]>; policy: Policy; showElements: boolean }) {
  const background = composition.background.assetId;
  return <>
    {background ? <img src={background.startsWith("data:") ? background : `/api/policycraft/cover-assets/${encodeURIComponent(background)}`} alt="" className="policy-custom-cover-background" style={{ objectPosition: `${composition.background.focalPoint.x}% ${composition.background.focalPoint.y}%`, objectFit: composition.background.fit }} /> : null}
    {composition.elements.filter((element) => element.visible && (showElements || element.type !== "text")).sort((a, b) => a.zIndex - b.zIndex).map((element) => {
      const style: CSSProperties = { left: `${(element.x / 210) * 100}%`, top: `${(element.y / 297) * 100}%`, width: `${(element.width / 210) * 100}%`, height: `${(element.height / 297) * 100}%`, opacity: element.opacity, zIndex: element.zIndex, transform: `rotate(${element.rotation}deg)` };
      if (element.type === "text") {
        const text = element.content.kind === "binding" ? getCoverBindingValue(policy, element.content.binding) : element.content.text;
        const presentation = getCoverTextPresentation(element, composition.sourceTemplateId);
        const responsivePointSize = (pointSize: number) => `${pointSize * (25.4 / 72) / 210 * 100}cqw`;
        return <div key={element.id} className="policy-custom-cover-text" style={{ ...style, color: presentation.color, fontFamily: element.fontFamily, fontSize: responsivePointSize(presentation.fontSize), fontWeight: presentation.bold ? 700 : 400, fontStyle: element.italic ? "italic" : "normal", textDecoration: element.underline ? "underline" : "none", textAlign: element.align, lineHeight: element.lineHeight, letterSpacing: responsivePointSize(presentation.letterSpacing), textShadow: presentation.textShadow }}>{text}</div>;
      }
      const rawSource = element.type === "logo" ? element.assetId || policy.company.companyLogo : element.assetId;
      const source = rawSource?.startsWith("data:") ? rawSource : rawSource ? `/api/policycraft/cover-assets/${encodeURIComponent(rawSource)}` : undefined;
      const imageStyle = composition.sourceTemplateId === "ai-generated" && element.id === "ai-cover-metadata-rule"
        ? { ...style, filter: "drop-shadow(0 1px 3px rgba(0,0,0,.8)) brightness(1.7)" }
        : style;
      return <div key={element.id} className="policy-custom-cover-image" style={imageStyle}>{source ? <img src={source} alt={element.altText} style={{ objectFit: element.fit, objectPosition: `${element.focalPoint.x}% ${element.focalPoint.y}%` }} /> : null}</div>;
    })}
  </>;
}
/* eslint-enable @next/next/no-img-element */

function ProfessionalCover({ model, feature }: { model: DocumentRenderModel; feature: ReactNode }) {
  const { cover, theme } = model;
  const design = coverDesign(theme.layout.cover);
  const style = { "--cover-title-size": `${design.titlePt}pt`, "--cover-space": `${design.spaceMm}mm`, "--cover-columns": design.columns, textAlign: design.align } as CSSProperties;
  return <header className="policy-cover editorial-policy-cover" data-cover-rule={design.rule} style={style}>
    <div className="cover-publisher">{cover.companyName}</div>
    <div className="cover-heading"><h1>{cover.policyLabel}</h1></div>
    {feature}
    <MetadataStrip metadata={cover.metadata} className="cover-register" />
  </header>;
}

function FeatureImage({ image, className }: { image: NonNullable<DocumentRenderModel["featureImage"]>; className: string }) {
  return (
    <figure className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.dataUrl} alt={image.altText} style={{ objectPosition: `${image.focalPosition.x}% ${image.focalPosition.y}%` }} />
    </figure>
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
  if (model.theme.collection === "professional") return <section className={`policy-toc professional-toc professional-toc-${model.theme.layout.professionalVariant || "corporate"}`}><h2>Contents</h2><ol>{entries.map(entry => <li key={entry.id}><a href={`#${entry.id}`}><span>{String(entry.index).padStart(2, "0")}</span>{entry.title}</a></li>)}</ol></section>;

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
  const logoPosition = policy.logoPosition || model.theme.defaults.logoPosition;
  const brand = getRunningHeaderBrand(policy.company);
  return (
    <div data-logo-position={logoPosition} data-logo-scale={model.theme.logoScale} className={`policy-running-header running-${layout} ${model.theme.collection === "professional" ? `professional-running-${model.theme.layout.professionalVariant || "corporate"}` : ""}`}>
      <div className={`policy-running-header-brand logo-position-${logoPosition}`}>
        {brand.kind === "logo" ? <img src={brand.source} alt="Company logo" className="object-contain" /> : <span>{brand.text}</span>}
      </div>
      <b className={`running-header-label logo-position-${logoPosition}`}>{model.cover.policyLabel}</b>
    </div>
  );
}

function PolicySection({ section, model, policy }: { section: DocumentRenderSection; model: DocumentRenderModel; policy: Policy }) {
  const frame = model.theme.layout.pageFrame;
  const opener = model.theme.layout.sectionOpener;
  const number = String(section.index).padStart(2, "0");
  const content = <SectionContent section={section} model={model} policy={policy} />;

  if (frame === "numbered-rail") {
    return <section id={section.id} className={`policy-section ${model.theme.collection === "professional" ? `professional-section professional-section-${model.theme.layout.professionalVariant || "corporate"}` : ""} frame-numbered-rail density-${section.density}`}><aside><b>{number}</b><span>{section.kind}</span></aside><div className="policy-section-body"><SectionHeading section={section} opener={opener} />{content}</div></section>;
  }
  if (frame === "modular-grid") {
    return <section id={section.id} className={`policy-section ${model.theme.collection === "professional" ? `professional-section professional-section-${model.theme.layout.professionalVariant || "corporate"}` : ""} frame-modular-grid density-${section.density}`}><SectionHeading section={section} opener={opener} /><div className="policy-section-body">{content}</div></section>;
  }
  if (frame === "editorial-margin") {
    return <section id={section.id} className={`policy-section ${model.theme.collection === "professional" ? `professional-section professional-section-${model.theme.layout.professionalVariant || "corporate"}` : ""} frame-editorial-margin density-${section.density}`}><aside><b>{number}</b><span>{section.kind}</span></aside><div className="policy-section-body"><SectionHeading section={section} opener={opener} />{content}</div></section>;
  }
  return <section id={section.id} className={`policy-section ${model.theme.collection === "professional" ? `professional-section professional-section-${model.theme.layout.professionalVariant || "corporate"}` : ""} frame-single-folio density-${section.density}`}><SectionHeading section={section} opener={opener} /><div className="policy-section-body">{content}</div></section>;
}

function SectionHeading({ section, opener }: { section: DocumentRenderSection; opener?: string }) {
  return <header className={`policy-section-heading heading-${opener || "default"}`}><span>{String(section.index).padStart(2, "0")}</span><h2>{section.title}</h2><i /></header>;
}

function SectionContent({ section, model, policy }: { section: DocumentRenderSection; model: DocumentRenderModel; policy: Policy }) {
  const { content, recipe } = section;
  const recipeClass = `recipe-${recipe}`;
  switch (content.type) {
    case "narrative": return <div className={recipeClass}><Paras text={content.text} />{content.sites?.length ? <SiteTable sites={content.sites} /> : null}</div>;
    case "focus": return <FocusAreas areas={content.areas} recipe={recipe} density={section.density} />;
    case "qualitative": return <QualitativeGroups groups={content.groups} recipe={recipe} density={section.density} />;
    case "quantitative": return <QuantitativeTargets areas={content.areas} model={model} density={section.density} />;
    case "sdg": return <SdgGoals goals={content.goals} model={model} policy={policy} />;
    case "responsibilities": return <Responsibilities entries={content.entries} model={model} density={section.density} />;
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

function QuantitativeTargets({ areas, model, density }: { areas: Policy["quantitative"]; model: DocumentRenderModel; density: string }) {
  const groups = groupQuantitativeTargets(areas);
  const useModernTreatment = model.dataTreatment === "clean-bullets";
  const useBands = useModernTreatment && model.theme.layout.dataLayout === "target-bands" && density !== "dense";
  const useJournalEntries = useModernTreatment && model.theme.layout.dataLayout === "quiet-rules" && density !== "dense";
  if (useBands) {
    return <div className="policy-target-bands">{groups.map((group, index) => <div key={`${group.area}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><section><h3>{group.area}</h3><TargetDescription targets={group.targets} /></section></div>)}</div>;
  }
  if (useJournalEntries) {
    return <div className="policy-journal-targets">{groups.map((group, index) => <div key={`${group.area}-${index}`}><b>{group.area}</b><TargetDescription targets={group.targets} /></div>)}</div>;
  }
  if (useModernTreatment) {
    return <div className="policy-modern-targets">{groups.map((group, index) => <div key={`${group.area}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><section><h3>{group.area}</h3><TargetDescription targets={group.targets} /></section></div>)}</div>;
  }
  return <QuantitativeTable groups={groups} />;
}

function TargetDescription({ targets }: { targets: QuantitativeTargetGroup["targets"] }) {
  return <ul className="policy-target-list">{targets.map((target, index) => <li key={`${target.target}-${index}`}>{formatQuantitativeTargetSentence(target)}</li>)}</ul>;
}

function QuantitativeTable({ groups }: { groups: QuantitativeTargetGroup[] }) {
  return <div className="policy-table-wrap"><table className="policy-table" data-target-table="true"><colgroup><col className="policy-target-index-column" /><col className="policy-target-area-column" /><col /></colgroup><thead><tr><th>#</th><th>Focus Area</th><th>Targets</th></tr></thead><tbody>{groups.map((group, index) => <tr key={`${group.area}-${index}`}><td>{String(index + 1).padStart(2, "0")}</td><td>{group.area}</td><td><TargetDescription targets={group.targets} /></td></tr>)}</tbody></table></div>;
}

function SdgGoals({ goals, model, policy }: { goals: { number: number; label: string; color: string }[]; model: DocumentRenderModel; policy: Policy }) {
  if (policy.sdgDisplay === "tiles") {
    return <div className={`policy-sdg-tiles ${model.theme.layout.dataLayout === "target-bands" ? "sdg-atlas-mosaic" : ""}`}>{goals.map((goal) => <div key={goal.number} className="policy-sdg-tile"><img src={`/E%20SDG%20Icons%20WEB/E-WEB-Goal-${String(goal.number).padStart(2, "0")}.png`} alt={`UN Sustainable Development Goal ${goal.number}: ${goal.label}`} /><span>{goal.label}</span></div>)}</div>;
  }
  return <div className="policy-sdg-names">{goals.map((goal) => <div key={goal.number} style={{ borderColor: goal.color }}><b style={{ background: goal.color }}>SDG {goal.number}</b><span>{goal.label}</span></div>)}</div>;
}

function Responsibilities({ entries, model, density }: { entries: Policy["responsibilities"]; model: DocumentRenderModel; density: string }) {
  if (model.dataTreatment === "formal-tables") return <PolicyTable headers={["Role / Department", "Responsibility"]} rows={entries.map((entry) => [entry.role, entry.duty])} />;
  return <div className={`policy-responsibility-list responsibility-${model.theme.layout.pageFrame} density-${density}`}>{entries.map((entry, index) => <div key={`${entry.role}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><section><h3>{entry.role}</h3><p>{entry.duty}</p></section></div>)}</div>;
}

function SiteTable({ sites }: { sites: NonNullable<Extract<DocumentRenderSection["content"], { type: "narrative" }>["sites"]> }) {
  return <PolicyTable headers={["Location / Unit", "Address", "Primary Function"]} rows={sites.map((site, index) => [site.location || `Site ${index + 1}`, site.address, site.primaryFunction || "Operating Site"])} />;
}

function RevisionTable({ entries }: { entries: NonNullable<Policy["revisionHistory"]> }) {
  return <PolicyTable headers={["Revision No.", "Date", "Description of Change"]} rows={entries.map((entry) => [entry.revisionNo, entry.date, entry.description])} />;
}

function PolicyTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="policy-table-wrap"><table className="policy-table" data-target-table={headers.includes("Target") || undefined}><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] || ""}</td>)}</tr>)}</tbody></table></div>;
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
  const reviewer = model.footer.reviewerDesignations.join(", ");
  return <footer className={`policy-footer footer-${layout} ${model.theme.collection === "professional" ? `professional-footer-${model.theme.layout.professionalVariant || "corporate"}` : ""}`}><span><b>Document No.</b>{model.footer.documentNumber}</span><span><b>Review</b>{[model.footer.reviewDate, reviewer].filter(Boolean).join(" · ")}</span><span><b>Page</b>—</span></footer>;
}

function Acknowledgement({ model }: { model: DocumentRenderModel }) {
  const acknowledgement = model.acknowledgement!;
  return <section className={`policy-acknowledgement acknowledgement-${model.theme.layout.acknowledgement}`}><span className="ack-kicker">Acknowledgement · Final page</span><h2>{acknowledgement.title}</h2><p>{acknowledgement.statement}</p><div className="ack-fields">{acknowledgement.fields.map((field) => <div key={field} className={field === "Signature" ? "ack-signature" : ""}><span>{field}</span><i /></div>)}</div></section>;
}

const previewStyles = `
  .cover-preview-only { width:100%; height:100%; max-width:none; box-shadow:none; }
  .cover-preview-only > .policy-cover { min-height:100% !important; height:100% !important; box-sizing:border-box; }
  @keyframes documentThemeIn { from { opacity: .72; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .policy-preview-document { animation: documentThemeIn 220ms ease-out both; font-family: var(--policy-font), Arial, sans-serif; font-size: var(--policy-paragraph-size); line-height: var(--policy-line-height); }
  .policy-preview-document *, .policy-preview-document *::before, .policy-preview-document *::after { box-sizing: border-box; }
  .policy-preview-document h1, .policy-preview-document h2, .policy-preview-document h3 { font-family: var(--policy-heading-font), Georgia, serif; }
  .policy-preview-document h1 { margin: 0; font-size: calc(var(--policy-heading-size) * 2.65); line-height: 1.04; }
  .policy-preview-document h2 { margin: 0; font-size: var(--policy-heading-size); line-height: 1.14; }
  .policy-preview-document h3 { margin: 0; font-size: var(--policy-subheading-size); line-height: 1.2; }
  .policy-preview-document p { margin: 0 0 12px; text-align: justify; }
  .policy-cover { position: relative; min-height: 510px; overflow: hidden; }
  .policy-cover > :not(.policy-cover-feature) { z-index: 1; }
  .policy-cover-feature { position: absolute; inset: 0; z-index: 0; margin: 0; pointer-events: none; }
  .policy-cover-feature img { width: 100%; height: 100%; object-fit: cover; opacity: .22; filter: saturate(.72); }
  .policy-cover-feature::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, var(--doc-paper) 10%, color-mix(in srgb, var(--doc-paper) 58%, transparent) 54%, transparent); }
  .policy-cover-feature.feature-full-bleed-cover img { opacity: .42; }
  .policy-cover-feature.feature-section-led img { opacity: .17; }
  .policy-section-feature { margin: 0; height: 250px; overflow: hidden; border-block: 1px solid var(--doc-line); }
  .policy-section-feature img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .policy-custom-cover { min-height: 842px; height: 842px; page-break-after: always; background: var(--doc-paper); container-type: inline-size; }
  .policy-custom-cover-background { position: absolute; inset: 0; width: 100%; height: 100%; }
  .policy-custom-cover-text, .policy-custom-cover-image { position: absolute; overflow: hidden; }
  .policy-custom-cover-text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .policy-custom-cover-image img { display: block; width: 100%; height: 100%; }
  .policy-custom-cover-rendered { display:block; width:100%; height:100%; object-fit:cover; }
  .policy-cover-logo { width: auto; max-width: var(--doc-running-logo-width); max-height: var(--doc-logo-height); object-fit: contain; transition: max-height 180ms ease; }
  .policy-cover-kicker { display: none !important; color: var(--doc-primary); font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
  .policy-cover h1 { max-width: 100%; text-wrap: balance; overflow-wrap: anywhere; }
  .policy-cover-company { margin: 13px 0 0; color: var(--doc-muted); font-size: 14px; }
  .policy-meta-pair { min-width: 0; }
  .policy-meta-pair span { display: block; color: var(--doc-muted); font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .policy-meta-pair b { display: block; margin-top: 3px; color: var(--doc-ink); font-size: 10px; overflow-wrap: anywhere; }
  .policy-metadata-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }

  /* Canonical cover scenes. Each scene owns its geometry; only atomic
     primitives (kicker, title, meta pairs, motif) are shared. */
  .cover-motif { display: block; }
  .cover-motif svg { display: block; height: auto; max-width: 100%; }

  .cover-civic-plain { display: flex; min-height: 580px; flex-direction: column; align-items: center; justify-content: center; padding: 70px 80px; text-align: center; background: var(--doc-paper); }
  .civic-rule { width: 120px; height: 3px; background: var(--doc-primary); }
  .cover-civic-plain .policy-cover-kicker { display: flex; align-items: center; gap: 14px; margin-top: 26px; }
  .cover-civic-plain .policy-cover-kicker span { width: 48px; height: 1px; background: var(--doc-accent); }
  .cover-civic-plain h1 { max-width: 600px; margin-top: 24px; }
  .cover-civic-plain .cover-motif { width: 220px; margin-top: 30px; }
  .civic-colophon { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 44px; border-top: 1px solid var(--doc-primary); padding-top: 16px; text-align: left; }

  .cover-signal-split { display: grid; grid-template-columns: 58% 42%; min-height: 560px; padding: 0; }
  .signal-body { display: flex; min-width: 0; flex-direction: column; border-right: 3px solid var(--doc-accent); padding: 56px 44px 44px 60px; background: var(--doc-paper); }
  .signal-body h1 { margin-top: 22px; font-weight: 650; letter-spacing: -.03em; }
  .signal-meta { margin-top: auto; border-top: 2px solid var(--doc-primary); padding-top: 14px; }
  .signal-panel { position: relative; overflow: hidden; background: var(--doc-soft); }
  .signal-panel .cover-motif { position: absolute; left: 12%; top: 24%; width: 76%; }

  .cover-open-broad { justify-content: flex-start; padding: 0 60px 52px; background: var(--doc-paper); }
  .open-band { height: 10px; margin: 0 -60px 40px; background: var(--doc-primary); }
  .cover-open-broad h1 { max-width: 760px; margin-top: 20px; font-size: calc(var(--policy-heading-size) * 3); line-height: 1.08; }
  .cover-open-broad .cover-motif { width: 220px; margin-top: 26px; }
  .open-meta { max-width: 760px; margin-top: 30px; border-top: 4px solid var(--doc-primary); padding-top: 16px; }

  .cover-swiss-poster { display: grid; grid-template-columns: 96px 1fr; min-height: 580px; padding: 0; background: var(--doc-paper); }
  .swiss-rail { display: flex; align-items: flex-end; justify-content: center; background: var(--doc-ink); padding-bottom: 48px; }
  .swiss-rail span { color: #fff; font-size: 10px; font-weight: 800; letter-spacing: .3em; text-transform: uppercase; writing-mode: vertical-rl; }
  .swiss-body { display: flex; min-width: 0; flex-direction: column; justify-content: flex-end; padding: 56px 60px 48px 48px; }
  .cover-swiss-poster h1 { margin-top: 18px; font-size: calc(var(--policy-heading-size) * 3.2); font-weight: 900; text-transform: uppercase; letter-spacing: -.04em; }
  .cover-swiss-poster .cover-motif { width: 120px; margin-top: 26px; }
  .swiss-meta { margin-top: 24px; border-top: 3px solid var(--doc-accent); padding-top: 14px; }

  .cover-ledger-rail { display: grid; grid-template-columns: 150px 1fr; min-height: 560px; padding: 0; }
  .ledger-rail-side { display: flex; flex-direction: column; padding: 44px 30px; background: var(--doc-primary); color: var(--doc-on-primary); }
  .ledger-rail-side span { font-size: 9px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; writing-mode: vertical-rl; }
  .ledger-rail-side b { margin: auto 0; font-size: 44px; font-weight: 500; line-height: 1; }
  .ledger-rail-side small { font-size: 8px; letter-spacing: .14em; text-transform: uppercase; }
  .ledger-rail-body { display: flex; min-width: 0; flex-direction: column; padding: 48px 52px 40px; background: var(--doc-paper); }
  .ledger-rail-body h1 { margin-top: 22px; }
  .ledger-rail-body .cover-motif { width: 120px; margin-top: 22px; }
  .ledger-rail-meta { margin-top: auto; border-top: 2px solid var(--doc-primary); padding-top: 14px; }

  .cover-decision-stamp { align-items: center; justify-content: center; padding: 64px; background: var(--doc-paper); }
  .decision-frame { width: min(100%, 620px); border: 3px double var(--doc-primary); outline: 1px solid var(--doc-accent); outline-offset: 7px; padding: 44px 52px; text-align: center; }
  .decision-frame .cover-motif { width: 150px; margin: 0 auto 22px; }
  .decision-frame h1 { margin-top: 18px; }
  .decision-meta { margin-top: 26px; border-top: 1px solid var(--doc-line); padding-top: 14px; text-align: left; }

  .cover-routing-slip { padding: 0 60px 52px; background: var(--doc-paper); }
  .routing-masthead { margin: 48px 0 0; border-bottom: 3px solid var(--doc-ink); padding-bottom: 10px; font-size: 30px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
  .routing-slip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-top: 18px; border: 1px solid var(--doc-line); padding: 14px 18px; font-family: "IBM Plex Mono", monospace; font-size: 9px; }
  .cover-routing-slip h1 { margin-top: 30px; }
  .cover-routing-slip .cover-motif { width: 220px; margin-top: 24px; }
  .routing-meta { margin-top: 26px; border-top: 2px solid var(--doc-ink); padding-top: 14px; }

  .cover-seal-medallion { align-items: center; justify-content: center; padding: 64px 70px; text-align: center; background: var(--doc-paper); }
  .seal-art .cover-motif { width: 148px; margin: 0 auto 26px; }
  .cover-seal-medallion .policy-cover-kicker { display: flex; align-items: center; gap: 14px; }
  .cover-seal-medallion .policy-cover-kicker span { width: 48px; height: 1px; background: var(--doc-accent); }
  .cover-seal-medallion h1 { margin-top: 22px; font-weight: 500; }
  .seal-colophon { display: grid; grid-template-columns: repeat(2, minmax(0, 220px)); justify-content: center; gap: 12px 32px; margin-top: 36px; border-top: 1px solid var(--doc-accent); padding-top: 18px; text-align: left; }

  .cover-clause-code { display: grid; grid-template-columns: 110px 1fr; min-height: 560px; padding: 56px 60px; background: var(--doc-paper); }
  .clause-numbers { display: flex; flex-direction: column; gap: 26px; color: var(--doc-primary); font-size: 15px; font-weight: 800; }
  .clause-numbers b { color: var(--doc-accent); }
  .clause-body { min-width: 0; border: 2px solid var(--doc-primary); padding: 34px 38px; }
  .clause-body h1 { margin-top: 18px; }
  .clause-body .cover-motif { width: 160px; margin-top: 22px; }
  .clause-meta { margin-top: 24px; border-top: 1px solid var(--doc-line); padding-top: 14px; }

  .cover-exhibit-file { padding: 56px 60px; background: var(--doc-soft); }
  .exhibit-tabs { display: flex; gap: 6px; }
  .exhibit-tabs span { min-width: 64px; padding: 8px 0; text-align: center; font-size: 11px; font-weight: 800; }
  .exhibit-tabs span:nth-child(1) { background: var(--doc-primary); color: var(--doc-on-primary); }
  .exhibit-tabs span:nth-child(2) { background: var(--doc-accent); color: #fff; }
  .exhibit-tabs span:nth-child(3) { background: var(--doc-paper); border: 1px solid var(--doc-line); color: var(--doc-muted); }
  .exhibit-body { border: 1px solid var(--doc-line); border-top: 0; background: var(--doc-paper); padding: 34px 40px 30px; }
  .exhibit-body h1 { margin-top: 18px; }
  .exhibit-body .cover-motif { width: 200px; margin-top: 22px; }
  .exhibit-meta { margin-top: 22px; border-top: 2px solid var(--doc-primary); padding-top: 14px; }

  .cover-gazette-masthead { align-items: center; justify-content: center; padding: 60px 70px; text-align: center; background: var(--doc-paper); }
  .gazette-crest .cover-motif { width: 104px; margin: 0 auto 24px; }
  .cover-gazette-masthead h1 { margin-top: 20px; }
  .gazette-colophon { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 38px; border-top: 3px double var(--doc-primary); border-bottom: 1px solid var(--doc-primary); padding-block: 16px; text-align: left; }

  .cover-colonnade-rule { padding: 0 60px 52px; background: var(--doc-paper); }
  .colonnade-cornice { height: 12px; margin: 0 -60px 44px; background: var(--doc-primary); }
  .cover-colonnade-rule h1 { margin-top: 20px; }
  .colonnade-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 26px; }
  .colonnade-columns p { border-left: 1px solid var(--doc-line); padding-left: 18px; text-align: left; font-size: 11px; }
  .cover-colonnade-rule .cover-motif { width: 200px; margin-top: 28px; }
  .colonnade-meta { margin-top: 26px; border-top: 2px solid var(--doc-primary); padding-top: 14px; }

  .cover-indenture-margin { display: grid; grid-template-columns: 1fr 130px; min-height: 560px; padding: 56px 0 48px 60px; background: var(--doc-paper); }
  .indenture-body { min-width: 0; padding-right: 48px; }
  .indenture-body h1 { margin-top: 20px; }
  .indenture-body .cover-motif { width: 160px; margin-top: 24px; }
  .indenture-meta { margin-top: 26px; border-top: 1px solid var(--doc-line); padding-top: 14px; }
  .indenture-margin-col { display: flex; flex-direction: column; gap: 34px; border-left: 2px solid var(--doc-accent); padding: 12px 0 0 20px; color: var(--doc-accent); font-size: 13px; font-weight: 800; }

  .cover-chapterhouse-drop { justify-content: flex-end; padding: 56px 64px; background: var(--doc-paper); }
  .chapter-top { display: grid; grid-template-columns: 130px 1fr; gap: 34px; align-items: start; }
  .chapter-drop .cover-motif { width: 120px; }
  .cover-chapterhouse-drop h1 { margin-top: 18px; font-weight: 500; }
  .chapter-meta { margin-top: 34px; border-top: 2px solid var(--doc-accent); padding-top: 16px; }

  .cover-broadsheet-columns { padding: 48px 56px; background: var(--doc-paper); }
  .broadsheet-masthead { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; background: var(--doc-ink); color: #fff; padding: 12px 22px; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; }
  .broadsheet-masthead b { font-size: 15px; letter-spacing: .04em; }
  .cover-broadsheet-columns h1 { margin-top: 26px; }
  .cover-broadsheet-columns .cover-motif { width: 220px; margin-top: 24px; }
  .broadsheet-meta { margin-top: 26px; border-top: 3px solid var(--doc-ink); padding-top: 14px; }

  .cover-fieldbook-grid { padding: 52px 56px; background-color: var(--doc-paper); background-image: linear-gradient(var(--doc-line) 1px, transparent 1px), linear-gradient(90deg, var(--doc-line) 1px, transparent 1px); background-size: 22px 22px; }
  .fieldbook-card { border: 1px solid var(--doc-line); background: var(--doc-paper); box-shadow: 0 14px 30px rgba(30,40,30,.10); padding: 36px 42px; }
  .fieldbook-card h1 { margin-top: 18px; }
  .fieldbook-plot { position: relative; margin-top: 22px; }
  .fieldbook-plot .cover-motif { width: 200px; }
  .fieldbook-pin { position: absolute; left: 216px; top: 6px; color: var(--doc-accent); font-family: "Caveat", cursive; font-size: 21px; font-weight: 600; transform: rotate(-4deg); }
  .fieldbook-meta { margin-top: 24px; border-top: 2px solid var(--doc-primary); padding-top: 14px; }

  .cover-canopy-band { padding: 56px 64px; background: var(--doc-paper); }
  .canopy-art .cover-motif { width: 100%; max-width: 560px; }
  .cover-canopy-band h1 { margin-top: 28px; }
  .canopy-meta { margin-top: 26px; border-top: 2px solid var(--doc-primary); padding-top: 14px; }

  .cover-summit-target { align-items: center; padding: 60px 70px; text-align: center; background: var(--doc-paper); }
  .summit-art .cover-motif { width: 140px; margin: 0 auto 26px; }
  .cover-summit-target h1 { margin-top: 18px; }
  .summit-meta { width: min(100%, 560px); margin-top: 30px; border-top: 2px solid var(--doc-accent); padding-top: 16px; text-align: left; }

  .cover-commons-card { padding: 52px 56px; background: var(--doc-soft); }
  .commons-card-body { border-radius: 20px; background: var(--doc-paper); box-shadow: 0 16px 36px rgba(30,45,40,.10); padding: 40px 46px; }
  .commons-card-body h1 { margin-top: 18px; }
  .commons-card-body .cover-motif { width: 200px; margin-top: 22px; }
  .commons-meta { margin-top: 24px; border-top: 1px solid var(--doc-line); padding-top: 14px; }

  .cover-scoreboard-tiles { padding: 52px 56px; background: var(--doc-paper); font-variant-numeric: tabular-nums; }
  .scoreboard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 30px; }
  .scoreboard-tile { padding: 14px 16px; }
  .scoreboard-tile:nth-child(1) { background: var(--doc-primary); color: var(--doc-on-primary); }
  .scoreboard-tile:nth-child(2), .scoreboard-tile:nth-child(3) { background: var(--doc-soft); }
  .scoreboard-tile:nth-child(4) { background: var(--doc-accent); color: #fff; }
  .scoreboard-tile b { display: block; font-size: 24px; font-weight: 700; }
  .scoreboard-tile span { font-size: 8px; letter-spacing: .12em; text-transform: uppercase; }
  .cover-scoreboard-tiles h1 { margin-top: 18px; }
  .scoreboard-meta { margin-top: 24px; border-top: 2px solid var(--doc-primary); padding-top: 14px; }

  .cover-tape-ledger { padding: 0 60px 50px; background: var(--doc-paper); font-variant-numeric: tabular-nums; }
  .tape-strip { height: 16px; margin: 0 -60px 44px; background: var(--doc-ink); }
  .cover-tape-ledger h1 { margin-top: 18px; font-family: var(--policy-font); }
  .cover-tape-ledger .cover-motif { width: 220px; margin-top: 24px; }
  .tape-meta { margin-top: 26px; }
  .tape-meta .policy-meta-pair { border-top: 1px solid var(--doc-line); padding-top: 8px; }
  .tape-meta .policy-meta-pair:nth-child(even) { background: var(--doc-soft); }

  .cover-dial-review { justify-content: flex-end; padding: 56px 60px; background: var(--doc-paper); }
  .dial-top { display: grid; grid-template-columns: 1fr 210px; gap: 30px; align-items: center; }
  .dial-art .cover-motif { width: 200px; }
  .cover-dial-review h1 { margin-top: 18px; }
  .dial-meta { margin-top: 32px; border-top: 2px solid var(--doc-primary); padding-top: 14px; }

  .cover-proceedings-abstract { padding: 56px 64px; background: var(--doc-paper); }
  .proceedings-box { border: 2px solid var(--doc-primary); padding: 34px 40px; }
  .proceedings-box h1 { margin-top: 18px; }
  .proceedings-keywords { margin-top: 20px; font-family: "IBM Plex Mono", monospace; font-size: 9px; color: var(--doc-muted); text-align: left; }
  .proceedings-box .cover-motif { width: 200px; margin-top: 20px; }
  .proceedings-meta { margin-top: 28px; border-top: 1px solid var(--doc-line); padding-top: 14px; }

  .cover-blueprint-spec { padding: 52px 56px; background: var(--doc-primary); color: var(--doc-on-primary); }
  .blueprint-tag { align-self: flex-start; border: 1px solid var(--doc-on-primary); padding: 6px 12px; font-family: "IBM Plex Mono", monospace; font-size: 9px; letter-spacing: .14em; }
  .cover-blueprint-spec .policy-cover-kicker { color: var(--doc-accent); }
  .cover-blueprint-spec h1 { margin-top: 22px; color: var(--doc-on-primary); font-family: var(--policy-heading-font); }
  .cover-blueprint-spec .policy-cover-company { color: var(--doc-on-primary); opacity: .82; }
  .blueprint-art .cover-motif { width: 190px; margin-top: 28px; }
  .blueprint-meta { margin-top: 30px; border-top: 1px solid var(--doc-on-primary); padding-top: 14px; }
  .blueprint-meta .policy-meta-pair span { color: var(--doc-on-primary); opacity: .72; }
  .blueprint-meta .policy-meta-pair b { color: var(--doc-on-primary); }

  .cover-docket-matrix { padding: 52px 56px; background: var(--doc-paper); }
  .docket-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 30px; }
  .docket-cell { display: grid; min-height: 92px; place-items: center; background: var(--doc-soft); font-size: 12px; font-weight: 800; letter-spacing: .1em; }
  .docket-cell:first-child { background: var(--doc-primary); color: var(--doc-on-primary); }
  .docket-cell.docket-art { background: var(--doc-paper); border: 2px solid var(--doc-primary); padding: 10px; }
  .docket-cell.docket-art .cover-motif { width: 150px; }
  .cover-docket-matrix h1 { margin-top: 18px; }
  .docket-meta { margin-top: 24px; border-top: 2px solid var(--doc-primary); padding-top: 14px; }

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

  .policy-running-header { display: grid; grid-template-columns: 1fr auto 1fr; min-height: 58px; align-items: center; margin: 0 50px 14px; border-bottom: 1px solid var(--doc-line); color: var(--doc-muted); font-size: 8px; letter-spacing: .1em; text-transform: uppercase; }
  .policy-running-header-brand { display: flex; min-width: 0; align-items: center; }
  .policy-running-header-brand.logo-position-left { grid-column: 1; justify-content: flex-start; }
  .policy-running-header-brand.logo-position-center { grid-column: 2; justify-content: center; }
  .policy-running-header-brand.logo-position-right { grid-column: 3; justify-content: flex-end; }
  .policy-running-header b { grid-column: 3; justify-self: end; color: var(--doc-primary); font-size: 8px; }
  .policy-running-header b.logo-position-right { grid-column: 1; justify-self: start; }
  .running-breadcrumb-bar { margin: 0; padding: 0 48px; border: 0; background: var(--doc-primary); color: var(--doc-on-primary); }
  .running-breadcrumb-bar b { color: var(--doc-on-primary); }
  .running-edge-folio { border-bottom: 4px solid var(--doc-primary); }
  .running-outer-folio { margin-inline: 64px; border-color: var(--doc-accent); font-style: italic; text-transform: none; }

  .policy-main { padding: calc(44px * var(--doc-density-factor)) calc(50px * var(--doc-density-factor)) calc(52px * var(--doc-density-factor)); }
  .policy-section { scroll-margin-top: 24px; }
  .policy-section + .policy-section { margin-top: calc(45px * var(--doc-density-factor)); }
  .policy-section-heading { display: flex; align-items: center; gap: 13px; margin-bottom: 20px; }
  .policy-section-heading > span { color: var(--doc-primary); font-size: 9px; font-weight: 800; letter-spacing: .12em; }
  .policy-section-heading > i { height: 1px; flex: 1; background: var(--doc-line); }
  .heading-agenda-label > span { background: var(--doc-primary); color: var(--doc-on-primary); padding: 3px 8px; }
  .heading-memo-rule { border-top: 2px solid var(--doc-ink); padding-top: 10px; }
  .heading-clause-number > span { border: 1px solid var(--doc-primary); padding: 2px 7px; }
  .heading-spec-ordinal > span { font-family: var(--policy-font); background: var(--doc-soft); padding: 3px 8px; }
  .heading-finding-band { background: var(--doc-soft); padding: 10px 12px; }
  .heading-statement-band > h2 { background: var(--doc-primary); color: var(--doc-on-primary); padding: 6px 12px; }
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
  .policy-table[data-target-table="true"] { table-layout: fixed; }
  .policy-table[data-target-table="true"] .policy-target-index-column { width: 12%; }
  .policy-table[data-target-table="true"] .policy-target-area-column { width: 25%; }
  .policy-table[data-target-table="true"] th:first-child, .policy-table[data-target-table="true"] td:first-child { white-space: nowrap; text-align: center; }
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
  .policy-target-bands > div { display: grid; grid-template-columns: 52px minmax(0,1fr); align-items: stretch; background: var(--doc-soft); }
  .policy-target-bands > div > b { display: grid; place-items: center; color: var(--doc-primary); font-size: 20px; font-weight: 500; }
  .policy-target-bands > div > section { padding: 13px 15px; border-inline: 1px solid var(--doc-line); }
  .policy-journal-targets > div { display: grid; grid-template-columns: 150px 1fr; border-top: 1px solid var(--doc-line); padding: 14px 0; }
  .policy-journal-targets b { color: var(--doc-accent); font-family: var(--policy-heading-font); }
  .policy-modern-targets { display: grid; gap: 9px; }
  .policy-modern-targets > div { display: grid; grid-template-columns: 42px 1fr; border-top: 1px solid var(--doc-line); padding-top: 10px; }
  .policy-modern-targets > div > b { color: var(--doc-primary); }
  .policy-target-list { margin: 6px 0 0; padding-left: 20px; text-align: left; }
  .policy-target-list > li { margin: 5px 0; }

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
  .policy-footer { display: grid; grid-template-columns: 1fr 1.5fr 1fr; align-items: center; gap: 18px; border-top: 1px solid var(--doc-primary); padding: 18px 50px; color: var(--doc-muted); font-size: 8px; }
  .policy-footer > span { min-width: 0; overflow-wrap: anywhere; }
  .policy-footer > span:nth-child(2) { text-align: center; }
  .policy-footer > span:last-child { text-align: right; }
  .policy-footer b { display: block; margin-bottom: 2px; color: var(--doc-primary); font-size: .9em; letter-spacing: .08em; text-transform: uppercase; }
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

  @media screen and (max-width: 720px) {
    .policy-cover { min-height: 430px; }
    .cover-civic-plain, .cover-seal-medallion, .cover-gazette-masthead, .cover-summit-target { padding: 48px 34px; }
    .civic-colophon, .gazette-colophon, .seal-colophon { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .cover-signal-split, .cover-ledger-rail, .cover-swiss-poster, .cover-clause-code, .cover-indenture-margin { grid-template-columns: 30% 70%; }
    .signal-body, .ledger-rail-body { padding: 32px 26px; }
    .swiss-body { padding: 36px 28px; }
    .cover-routing-slip, .cover-tape-ledger { padding-inline: 30px; }
    .routing-slip-grid { grid-template-columns: 1fr; }
    .cover-fieldbook-grid, .cover-commons-card, .cover-scoreboard-tiles, .cover-docket-matrix, .cover-blueprint-spec, .cover-broadsheet-columns, .cover-canopy-band, .cover-chapterhouse-drop, .cover-dial-review, .cover-proceedings-abstract, .cover-exhibit-file, .cover-decision-stamp, .cover-colonnade-rule { padding: 40px 30px; }
    .scoreboard-grid { grid-template-columns: repeat(2, 1fr); }
    .chapter-top, .dial-top { grid-template-columns: 1fr; }
    .fieldbook-pin { display: none; }
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
    .policy-footer { grid-template-columns: 1fr; gap: 8px; padding-inline: 28px; }
    .policy-footer > span:nth-child(2), .policy-footer > span:last-child { text-align: left; }
  }
  @media (prefers-reduced-motion: reduce) { .policy-preview-document { animation: none; } }

  [data-collection="professional"] .professional-cover { min-height: 230mm; display: flex; flex-direction: column; padding: 0; background: transparent; overflow: visible; }
  [data-collection="professional"] .sample-cover-art { display: block; width: 42mm; max-height: 24mm; margin: 4mm 0 6mm; }
  [data-collection="professional"] .professional-cover-editorial .sample-cover-art, [data-collection="professional"] .professional-cover-institutional .sample-cover-art { margin-inline: auto; }
  [data-collection="professional"] .professional-cover-governance .sample-cover-art { width: 46mm; margin-left: auto; }
  [data-collection="professional"] .professional-brand { font-size: 12pt; font-weight: 600; color: var(--doc-primary); min-height: 22mm; }
  [data-collection="professional"] .professional-title { margin-top: 38mm; margin-bottom: 16mm; }
  [data-collection="professional"] .professional-rule { width: 22mm; height: 2px; background: var(--doc-primary); margin-bottom: 10mm; }
  [data-collection="professional"] .professional-title h1 { font-size: 34pt; line-height: 1.15; font-weight: 600; letter-spacing: -.025em; max-width: 145mm; overflow-wrap: anywhere; color: var(--doc-primary); }
  [data-collection="professional"] .professional-title p { margin-top: 8mm; color: var(--doc-muted); font-size: 13pt; text-align: inherit; }
  [data-collection="professional"] .professional-meta { margin-top: auto; display: grid; grid-template-columns: repeat(2,1fr); gap: 7mm; border-top: 1px solid var(--doc-line); padding-top: 7mm; }
  [data-collection="professional"] .professional-meta span { font-size: 8pt; color: var(--doc-muted); text-transform: uppercase; letter-spacing: .07em; display: block; }
  [data-collection="professional"] .professional-meta strong { font-size: 10pt; font-weight: 500; }
  [data-collection="professional"] .professional-institutional-classic-v1 { text-align: center; }
  [data-collection="professional"] .professional-institutional-classic-v1 .professional-rule { margin-inline: auto; }
  [data-collection="professional"] .professional-institutional-classic-v1 h1 { margin-inline: auto; }
  [data-collection="professional"] .professional-executive-editorial-v1 .professional-title { margin-top: 48mm; border-left: 1px solid var(--doc-line); padding-left: 9mm; }
  [data-collection="professional"] .professional-governance-manual-v1 .professional-title { border-top: 3px solid var(--doc-primary); padding-top: 12mm; }
  [data-collection="professional"] .professional-governance-manual-v1 .professional-rule { display: none; }
  [data-collection="professional"] .professional-modern-minimal-v1 .professional-title { margin-top: 18mm; }
  [data-collection="professional"] .professional-modern-minimal-v1 h1 { font-size: 28pt; }
  [data-collection="professional"] .professional-sustainability-report-v1 .professional-title { margin-top: 26mm; }
  [data-collection="professional"] .policy-cover-feature { position: static; width: 100%; height: 52mm; object-fit: cover; margin-bottom: 10mm; opacity: 1; }
  [data-collection="professional"] .policy-main { padding: 0; }
  [data-collection="professional"] .policy-toc { padding: 0; background: transparent; border: none; }
  .professional-toc h2 { margin-bottom: 12mm; }
  .professional-toc ol { list-style: none; padding: 0; }
  .professional-toc li { border-bottom: 1px solid var(--doc-line); padding: 4mm 0; }
  .professional-toc a { text-decoration: none; color: var(--doc-ink); display: flex; gap: 6mm; }
  .professional-toc a span { color: var(--doc-muted); font-variant-numeric: tabular-nums; }
  [data-collection="professional"] .policy-section { padding: 0; margin-bottom: calc(9mm * var(--doc-density-factor)); border: 0; background: transparent; }
  [data-collection="professional"] .policy-section-heading { margin-bottom: 5mm; padding-bottom: 3mm; border-bottom: 1px solid var(--doc-line); }
  [data-collection="professional"] p { text-align: left; }
  [data-collection="professional"] .policy-table { font-size: 10.5pt; }
  [data-collection="professional"] .policy-table th { font-weight: 600; }
  [data-collection="professional"] .policy-table td { padding: 3mm; }
  [data-collection="professional"] .policy-table[data-target-table] th,
  [data-collection="professional"] .policy-table[data-target-table] td { padding: 2mm 1.5mm; vertical-align: top; }
  [data-collection="professional"] .policy-table[data-target-table] th:nth-child(1) { width: 5%; }
  [data-collection="professional"] .policy-table[data-target-table] th:nth-child(2) { width: 17%; }
  [data-collection="professional"] .policy-table[data-target-table] th:nth-child(3) { width: 39%; }
  [data-collection="professional"] .policy-table[data-target-table] th:nth-child(4),
  [data-collection="professional"] .policy-table[data-target-table] th:nth-child(5) { width: 12%; }
  [data-collection="professional"] .policy-table[data-target-table] th:nth-child(6) { width: 15%; }
  [data-collection="professional"] .policy-focus-list, [data-collection="professional"] .policy-objective-groups { display: block; }
  [data-collection="professional"] .policy-focus-item { border: none; border-bottom: 1px solid var(--doc-line); }
  [data-collection="professional"] .policy-focus-item b { background: transparent; color: var(--doc-primary); }
  [data-collection="professional"] .policy-acknowledgement { padding: 0; border: 0; background: transparent; }
  [data-collection="professional"] .policy-section aside span { display: none; }
  [data-collection="professional"] .policy-section aside b { font-size: 18pt; }

  [data-collection="professional"] .policy-section-heading { justify-content: flex-start; text-align: left; border-top: none; padding: 0 0 3mm; }
  [data-collection="professional"] .policy-section-heading h2 { text-transform: none; letter-spacing: -.01em; font-weight: 600; order: 1; }
  [data-collection="professional"] .policy-section-heading > span { order: 0; }
  [data-collection="professional"] .policy-section-heading > i { display: none; }
  [data-collection="professional"] .policy-section-body > div > p:first-child::first-letter { float: none; margin: 0; font-size: inherit; line-height: inherit; font-family: inherit; color: inherit; }

  [data-professional-variant="corporate"] .professional-cover-corporate { padding: 20mm 22mm 15mm; }
  [data-professional-variant="corporate"] .professional-main { padding-inline: 22mm; }
  [data-professional-variant="corporate"] .professional-toc { padding: 16mm 22mm 12mm; }
  [data-professional-variant="corporate"] .professional-section-heading { border-bottom-color: var(--doc-primary); }

  [data-professional-variant="editorial"] .professional-cover-editorial { padding: 16mm 18mm 14mm; }
  [data-professional-variant="editorial"] .professional-editorial-masthead { display: flex; justify-content: space-between; padding-bottom: 5mm; border-bottom: 1px solid var(--doc-line); color: var(--doc-muted); font-size: 8pt; text-transform: uppercase; letter-spacing: .1em; }
  [data-professional-variant="editorial"] .professional-editorial-grid { display: grid; grid-template-columns: 18mm 1fr; gap: 8mm; margin-top: 42mm; }
  [data-professional-variant="editorial"] .professional-editorial-index { color: var(--doc-accent); font-family: var(--policy-heading-font); font-size: 24pt; }
  [data-professional-variant="editorial"] .professional-title { margin: 0; }
  [data-professional-variant="editorial"] .professional-main { padding-inline: 18mm; }
  [data-professional-variant="editorial"] .professional-toc { padding: 18mm; }
  [data-professional-variant="editorial"] .professional-toc li { padding-block: 6mm; }
  [data-professional-variant="editorial"] .professional-section-heading { border-bottom: 0; padding-bottom: 4mm; }
  [data-professional-variant="editorial"] .professional-section-heading h2 { font-style: italic; font-weight: 500; }
  [data-professional-variant="editorial"] .policy-table { border: 0; font-size: 10pt; }
  [data-professional-variant="editorial"] .policy-table th { background: transparent; color: var(--doc-primary); border-top: 1px solid var(--doc-primary); border-bottom: 1px solid var(--doc-line); font-family: var(--policy-heading-font); font-weight: 500; }
  [data-professional-variant="editorial"] .professional-running-editorial { border-bottom-color: var(--doc-accent); }

  [data-professional-variant="governance"] .professional-cover-governance { padding: 18mm 18mm 14mm; }
  [data-professional-variant="governance"] .professional-governance-head { display: grid; grid-template-columns: minmax(0, 1fr) 48mm; gap: 12mm; margin-top: 36mm; padding-top: 10mm; border-top: 3px solid var(--doc-primary); }
  [data-professional-variant="governance"] .professional-governance-head h1 { margin-top: 5mm; }
  [data-professional-variant="governance"] .professional-control-box { align-self: start; border: 1px solid var(--doc-line); padding: 5mm; }
  [data-professional-variant="governance"] .professional-control-box > span { display: block; margin-bottom: 4mm; color: var(--doc-primary); font-size: 8pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  [data-professional-variant="governance"] .professional-control-box .policy-meta-pair + .policy-meta-pair { margin-top: 3mm; }
  [data-professional-variant="governance"] .professional-main { padding-inline: 18mm; }
  [data-professional-variant="governance"] .professional-toc { padding: 16mm 18mm 12mm; border-left: 3px solid var(--doc-primary); }
  [data-professional-variant="governance"] .professional-section-heading { border-top: 2px solid var(--doc-primary); padding-top: 3mm; }
  [data-professional-variant="governance"] .policy-table th { background: var(--doc-primary); color: var(--doc-on-primary); }

  [data-professional-variant="minimal"] .professional-cover-minimal { padding: 14mm 20mm 12mm; }
  [data-professional-variant="minimal"] .professional-minimal-label { display: flex; justify-content: space-between; border-bottom: 1px solid var(--doc-line); padding-bottom: 4mm; color: var(--doc-muted); font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; }
  [data-professional-variant="minimal"] .professional-cover-minimal .professional-title { margin-top: 28mm; }
  [data-professional-variant="minimal"] .professional-cover-minimal .professional-title h1 { font-size: 29pt; font-weight: 500; }
  [data-professional-variant="minimal"] .professional-main { max-width: 165mm; margin-inline: auto; }
  [data-professional-variant="minimal"] .professional-toc { max-width: 165mm; margin-inline: auto; padding: 12mm 0; }
  [data-professional-variant="minimal"] .professional-section-heading { padding-bottom: 2mm; }
  [data-professional-variant="minimal"] .professional-section-heading h2 { font-weight: 500; }
  [data-professional-variant="minimal"] .policy-table { border: 0; font-size: 9.5pt; }
  [data-professional-variant="minimal"] .policy-table th { background: transparent; color: var(--doc-ink); border-bottom: 2px solid var(--doc-ink); font-weight: 600; }
  [data-professional-variant="minimal"] .policy-table td { padding-block: 2mm; }
  [data-professional-variant="minimal"] .professional-running-minimal { border-bottom-color: var(--doc-ink); }

  [data-professional-variant="sustainability"] .professional-cover-sustainability { padding: 0 20mm 14mm; }
  [data-professional-variant="sustainability"] .professional-sustainability-band { height: 12mm; margin-inline: -20mm; background: var(--doc-primary); }
  [data-professional-variant="sustainability"] .professional-sustainability-content { min-height: 172mm; padding-top: 14mm; }
  [data-professional-variant="sustainability"] .professional-sustainability-content .professional-title { margin-top: 34mm; }
  [data-professional-variant="sustainability"] .professional-main { padding-inline: 20mm; }
  [data-professional-variant="sustainability"] .professional-toc { padding: 14mm 20mm; border-top: 4px solid var(--doc-primary); }
  [data-professional-variant="sustainability"] .professional-section-heading { padding: 4mm 5mm; border: 0; border-left: 3mm solid var(--doc-primary); background: var(--doc-soft); }
  [data-professional-variant="sustainability"] .professional-focus-item { background: var(--doc-soft); }
  [data-professional-variant="sustainability"] .policy-table th { background: var(--doc-primary); color: var(--doc-on-primary); }
  [data-professional-variant="sustainability"] .professional-running-sustainability { border-bottom: 2px solid var(--doc-primary); }

  [data-professional-variant="institutional"] .professional-cover-institutional { padding: 16mm 20mm 14mm; text-align: center; }
  [data-professional-variant="institutional"] .professional-institutional-frame { min-height: 202mm; display: flex; flex-direction: column; border: 1px solid var(--doc-primary); outline: 1px solid var(--doc-line); outline-offset: -5mm; padding: 12mm; }
  [data-professional-variant="institutional"] .professional-institutional-frame .professional-brand { justify-content: center !important; }
  [data-professional-variant="institutional"] .professional-institutional-frame .professional-title { margin-top: 46mm; }
  [data-professional-variant="institutional"] .professional-institutional-frame .professional-rule { margin-inline: auto; }
  [data-professional-variant="institutional"] .professional-institutional-frame .professional-title h1 { margin-inline: auto; font-family: var(--policy-heading-font); font-weight: 500; }
  [data-professional-variant="institutional"] .professional-main { padding-inline: 24mm; }
  [data-professional-variant="institutional"] .professional-toc { padding: 16mm 24mm 12mm; text-align: center; }
  [data-professional-variant="institutional"] .professional-toc h2 { font-family: var(--policy-heading-font); font-weight: 500; }
  [data-professional-variant="institutional"] .professional-section-heading { justify-content: center; border-block: 1px solid var(--doc-primary); padding-block: 3mm; }
  [data-professional-variant="institutional"] .professional-section-heading h2 { font-family: var(--policy-heading-font); font-weight: 500; }
  [data-professional-variant="institutional"] .professional-footer-institutional { justify-content: center; }
  [data-professional-variant="institutional"] .policy-table { border: 0; }
  [data-professional-variant="institutional"] .policy-table th { background: transparent; color: var(--doc-primary); border-block: 2px double var(--doc-primary); font-family: var(--policy-heading-font); font-weight: 500; text-align: center; }
  [data-professional-variant="institutional"] .policy-table td { text-align: center; }
  [data-professional-variant="institutional"] .professional-running-institutional { justify-content: normal; border-bottom-style: double; }

  /* The project samples are office documents: keep the universal catalog quiet,
     paper-led, and easy to print. Variant classes only tune alignment and rules. */
  [data-collection="professional"] .professional-cover {
    min-height: 230mm; padding: 18mm 20mm 14mm !important; background: var(--doc-paper);
    border-top: 2px solid var(--doc-primary); overflow: visible;
  }
  [data-collection="professional"] .professional-cover-feature { display: none; }
  [data-collection="professional"] .professional-brand { min-height: auto; margin-bottom: 32mm; color: var(--doc-ink); font-size: 10.5pt; font-weight: 600; }
  [data-collection="professional"] .professional-title { margin: 0 0 20mm !important; padding: 0 !important; border: 0 !important; max-width: 165mm; }
  [data-collection="professional"] .professional-kicker { display: block; margin-bottom: 5mm; color: var(--doc-muted); font-size: 8pt; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
  [data-collection="professional"] .professional-title h1 { max-width: 165mm; color: var(--doc-ink); font-size: 24pt; font-weight: 600; line-height: 1.15; letter-spacing: 0; }
  [data-collection="professional"] .professional-title p { margin-top: 5mm; color: var(--doc-muted); font-size: 11pt; }
  [data-collection="professional"] .professional-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 10mm; margin-top: auto; padding-top: 5mm; border-top: 1px solid var(--doc-line); }
  [data-collection="professional"] .professional-meta .policy-meta-pair { padding: 2mm 0; }
  [data-collection="professional"] .professional-meta span { display: block; color: var(--doc-muted); font-size: 7.5pt; letter-spacing: .06em; text-transform: uppercase; }
  [data-collection="professional"] .professional-meta strong { color: var(--doc-ink); font-size: 9.5pt; font-weight: 500; }
  [data-collection="professional"] .professional-cover-institutional { text-align: center; }
  [data-collection="professional"] .professional-cover-institutional .professional-title { max-width: 165mm; margin-inline: auto !important; }
  [data-collection="professional"] .professional-cover-institutional .professional-meta { text-align: left; }
  [data-collection="professional"] .professional-cover-governance .professional-title { max-width: 165mm; }
  [data-collection="professional"] .professional-cover-sustainability { border-top-width: 4px; }
  [data-collection="professional"] .professional-cover-sustainability .professional-brand { margin-bottom: 32mm; }
  [data-collection="professional"] .professional-cover-editorial .professional-brand { padding-bottom: 3mm; border-bottom: 1px solid var(--doc-line); }
  [data-collection="professional"] .professional-cover-minimal .professional-brand { margin-bottom: 32mm; }
  [data-collection="professional"] .professional-toc { max-width: none; margin: 0; padding: 12mm 0 !important; border: 0 !important; background: transparent; }
  [data-collection="professional"] .professional-toc h2 { margin-bottom: 7mm; color: var(--doc-ink); font-size: 17pt; font-weight: 600; }
  [data-collection="professional"] .professional-toc li { padding: 3mm 0; border-bottom: 1px solid var(--doc-line); }
  [data-collection="professional"] .professional-toc a { gap: 5mm; color: var(--doc-ink); font-size: 10.5pt; }
  [data-collection="professional"] .professional-toc a span { color: var(--doc-muted); font-variant-numeric: tabular-nums; }
  [data-collection="professional"] .policy-main { max-width: none; padding-inline: 20mm !important; }
  [data-collection="professional"] .policy-section,
  [data-collection="professional"] .policy-section.frame-numbered-rail,
  [data-collection="professional"] .policy-section.frame-modular-grid,
  [data-collection="professional"] .policy-section.frame-editorial-margin,
  [data-collection="professional"] .policy-section.frame-single-folio { display: block !important; grid-template-columns: none !important; padding: 0 !important; margin-bottom: 9mm; border: 0; background: transparent; }
  [data-collection="professional"] .policy-section > aside { display: none; }
  /* The source pages use a full text column inside normal page margins. The
     legacy frame classes carried narrow editorial max-widths, which created
     an extra white gutter on both sides of every professional section. */
  [data-collection="professional"] .policy-section,
  [data-collection="professional"] .professional-section,
  [data-collection="professional"] .frame-single-folio,
  [data-collection="professional"] .frame-editorial-margin { max-width: none !important; margin-inline: 0 !important; }
  [data-collection="professional"] .policy-section-heading { display: flex; align-items: baseline; gap: 4mm; margin-bottom: 5mm; padding: 0 0 2.5mm !important; border: 0 !important; border-bottom: 1px solid var(--doc-primary) !important; background: transparent !important; }
  [data-collection="professional"] .policy-section-heading > span { color: var(--doc-muted); font-size: 9pt; }
  [data-collection="professional"] .policy-section-heading > span { background: transparent !important; border: 0 !important; padding: 0 !important; }
  [data-collection="professional"] .policy-section-heading h2 { background: transparent !important; color: var(--doc-primary); padding: 0 !important; font-size: 15pt; font-weight: 600; }
  [data-collection="professional"] .policy-section-body { min-width: 0; }
  [data-collection="professional"] .policy-focus-item { display: flex; gap: 4mm; padding: 2.5mm 0; border-bottom: 1px solid var(--doc-line); background: transparent !important; }
  [data-collection="professional"] .policy-focus-item b { min-width: 8mm; color: var(--doc-muted); background: transparent; }
  [data-collection="professional"] .policy-objective-groups > section { margin-bottom: 6mm; padding: 3mm 0 !important; border: 0; border-top: 1px solid var(--doc-line); background: transparent !important; }
  [data-collection="professional"] .policy-objective-groups header { display: flex; gap: 4mm; margin-bottom: 2mm; }
  [data-collection="professional"] .policy-table { border-collapse: collapse; border: 1px solid var(--doc-line); font-size: 9.5pt; }
  [data-collection="professional"] .policy-table th { padding: 2.5mm 2mm; background: var(--doc-soft) !important; color: var(--doc-ink) !important; border: 1px solid var(--doc-line); font-weight: 600; }
  [data-collection="professional"] .policy-table td { padding: 2.5mm 2mm; border: 1px solid var(--doc-line); vertical-align: top; }
  [data-collection="professional"] .policy-target-list { margin: 0; padding-left: 5mm; }
  [data-collection="professional"] .policy-target-list > li { margin: 1.5mm 0; }
  [data-collection="professional"] .policy-acknowledgement { padding: 0; border: 0; background: transparent; }
  [data-collection="professional"] .policy-acknowledgement.acknowledgement-legal-form {
    padding: 10mm 12mm 9mm;
    border: 1px solid var(--doc-primary);
    outline: 0;
    box-shadow: inset 0 0 0 1px var(--doc-line);
    background: var(--doc-paper);
  }
  [data-collection="professional"] .policy-footer { display: grid; grid-template-columns: 1fr 1.5fr 1fr; gap: 8mm; padding: 4mm 20mm; border-top: 1px solid var(--doc-line); background: var(--doc-paper); color: var(--doc-muted); font-size: 8pt; }

  /* Covers use real document content, typographic hierarchy and quiet rules. */
  [data-collection="professional"] .editorial-policy-cover { min-height: 230mm; box-sizing: border-box; display: flex; flex-direction: column; padding: 10mm 8mm 8mm; border: 0; background: transparent; }
  .editorial-policy-cover .cover-publisher { font-family: var(--policy-font); font-size: 12pt; line-height: 1.5; font-weight: 600; color: var(--doc-ink); overflow-wrap: anywhere; }
  .editorial-policy-cover .cover-heading { margin-top: var(--cover-space); margin-bottom: 16mm; }
  .editorial-policy-cover .cover-heading h1 { margin: 0; padding: 0; max-width: 100%; font-family: var(--policy-heading-font); font-size: var(--cover-title-size); line-height: 1.16; letter-spacing: -.025em; font-weight: 500; color: var(--doc-primary); overflow-wrap: anywhere; }
  .editorial-policy-cover[data-cover-rule="top"] .cover-heading { border-top: 1px solid var(--doc-primary); padding-top: 9mm; }
  .editorial-policy-cover[data-cover-rule="bottom"] .cover-heading { border-bottom: 1px solid var(--doc-primary); padding-bottom: 10mm; }
  .editorial-policy-cover .cover-register { margin-top: auto; display: grid; grid-template-columns: repeat(var(--cover-columns), minmax(0, 1fr)); gap: 0 12mm; padding: 5mm 0 0; border: 0; border-top: 1px solid var(--doc-line); background: transparent; text-align: left; }
  .editorial-policy-cover .cover-register .policy-meta-pair { display: grid; grid-template-columns: 1fr; gap: 1.5mm; padding: 3mm 0; border: 0; background: transparent; min-width: 0; }
  .editorial-policy-cover .cover-register span { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: var(--doc-muted); }
  .editorial-policy-cover .cover-register b { font-size: 10pt; font-weight: 500; color: var(--doc-ink); overflow-wrap: anywhere; }
  .editorial-policy-cover .policy-cover-feature { margin: 0 0 10mm; max-height: 45mm; }

  [data-collection="professional"][data-toc-layout="rail-index"] .professional-toc { border-left: 3px solid var(--doc-primary) !important; padding-left: 10mm !important; }
  [data-collection="professional"][data-toc-layout="tile-index"] .professional-toc ol { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; }
  [data-collection="professional"][data-toc-layout="tile-index"] .professional-toc li { border: 1px solid var(--doc-line); padding: 5mm; background: var(--doc-soft); }
  [data-collection="professional"][data-page-frame="numbered-rail"] .policy-section { display: grid !important; grid-template-columns: 18mm minmax(0, 1fr) !important; gap: 7mm; }
  [data-collection="professional"][data-page-frame="numbered-rail"] .policy-section > aside { display: block; }
  [data-collection="professional"][data-page-frame="numbered-rail"] .policy-section > aside b { color: var(--doc-primary); }
  [data-collection="professional"][data-page-frame="editorial-margin"] .policy-section { display: grid !important; grid-template-columns: 18mm minmax(0, 1fr) !important; gap: 7mm; }
  [data-collection="professional"][data-page-frame="editorial-margin"] .policy-section > aside { display: block; }
  [data-collection="professional"][data-page-frame="editorial-margin"] .policy-section > aside b { color: var(--doc-accent); font-family: var(--policy-heading-font); }
  [data-collection="professional"][data-page-frame="modular-grid"] .policy-section { padding: 5mm !important; border: 1px solid var(--doc-line); background: var(--doc-soft); }

  /* Text roles stay independent of decorative brand colors. */
  .policy-preview-document { color: var(--doc-ink); }
  [data-collection="professional"] .policy-table th { color: var(--doc-subheading) !important; }
  .policy-preview-document h1, .policy-preview-document h2 { color: var(--doc-primary-dark) !important; }
  .policy-preview-document h3, .policy-preview-document h4 { color: var(--doc-subheading) !important; }
  .editorial-policy-cover .cover-publisher, .editorial-policy-cover .cover-register b { color: var(--doc-muted); }
  .policy-preview-document .professional-toc a { color: var(--doc-primary-dark); }
`;
