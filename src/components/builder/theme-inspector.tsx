"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  Eye,
  Palette,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { PageBorderControls } from "./page-border-controls";
import { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";
import { ThemeContactSheet } from "./document-theme-picker";
import {
  DOCUMENT_THEMES,
  getDocumentTemplatePatch,
  getDocumentThemePatch,
  getFullThemeOverrides,
  getPolicyColorResetPatch,
  normalizeDocumentThemeOverrides,
  getPolicyDocumentTheme,
  getResolvedTypography,
  LOGO_SCALE_MAX,
  LOGO_SCALE_MIN,
  logoScalePercent,
  normalizeHexColor,
  themeBackgroundCss,
  type DocumentThemeDefinition,
} from "@/lib/document-themes";
import { getPolicyProfile } from "@/lib/constants";
import { useBuilder } from "@/lib/store";
import {
  createSavedDocumentTheme,
  getSavedThemePatch,
  isSavedThemeNameAvailable,
  nextThemeCopyName,
  useThemeLibrary,
} from "@/lib/theme-library";
import { FONT_FAMILY_OPTIONS } from "@/lib/typography";
import type {
  DocumentThemePalette,
  Policy,
  SavedDocumentTheme,
  ThemeBackground,
} from "@/lib/types";

type EditorTab = "colors" | "fonts" | "design" | "images";
type GalleryTab = "public" | "mine";
type DesignSnapshot = Pick<Policy, "documentTemplate" | "documentTheme" | "documentThemeOverrides" | "templateBrandOverrides" | "typography" | "visualStyle" | "logoPosition" | "sdgDisplay" | "featureImage" | "brandColorSource">;

const COLOR_FIELDS: { key: keyof DocumentThemePalette; label: string; description: string }[] = [
  { key: "primary", label: "Main brand color", description: "Title bands, section numbers, headings and key details." },
  { key: "soft", label: "Section background", description: "Soft shading behind content and tables." },
  { key: "accent", label: "Highlights", description: "Decorative details and emphasis." },
  { key: "primaryDark", label: "Heading color", description: "Document titles and section headings." },
  { key: "subheading", label: "Subheading color", description: "Subsections, topic headings and role titles." },
  { key: "ink", label: "Body text", description: "Paragraphs, bullet points, numbered lists and table content." },
  { key: "muted", label: "Supporting text", description: "Labels, captions and document details." },
  { key: "line", label: "Borders & dividers", description: "Table borders and separating lines." },
  { key: "paper", label: "Content background", description: "Paper-colored panels within the design." },
  { key: "onPrimary", label: "Text on brand color", description: "Text placed over the main brand color." },
];

export function ThemeInspector({ designOnly = false }: { designOnly?: boolean }) {
  const { policy, updatePolicy } = useBuilder();
  const { themes, saveTheme, deleteTheme } = useThemeLibrary();
  const [view, setView] = React.useState<"gallery" | "editor">(designOnly ? "editor" : "gallery");
  const [galleryTab, setGalleryTab] = React.useState<GalleryTab>("public");
  const [editorTab, setEditorTab] = React.useState<EditorTab>("colors");
  const [search, setSearch] = React.useState("");
  const [familyFilter, setFamilyFilter] = React.useState("all");
  const [intentFilter, setIntentFilter] = React.useState("all");
  const [densityFilter, setDensityFilter] = React.useState("all");
  const [imageFilter, setImageFilter] = React.useState("all");
  const [previewTheme, setPreviewTheme] = React.useState<DocumentThemeDefinition | null>(null);
  const [themeName, setThemeName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | undefined>();
  const [baseline, setBaseline] = React.useState<DesignSnapshot | null>(null);
  const [error, setError] = React.useState("");
  const [colorResetKey, setColorResetKey] = React.useState(0);
  const [openColor, setOpenColor] = React.useState<keyof DocumentThemePalette | null>(null);
  const [invalidColors, setInvalidColors] = React.useState<Set<string>>(new Set());
  const resolved = getPolicyDocumentTheme(policy);
  const typography = getResolvedTypography(policy);
  const profile = getPolicyProfile(policy.policyType);
  const query = search.trim().toLocaleLowerCase();

  const rememberCurrentDesign = () => setBaseline({
    brandColorSource: policy.brandColorSource,
    documentTemplate: policy.documentTemplate,
    documentTheme: policy.documentTheme,
    documentThemeOverrides: policy.documentThemeOverrides ? structuredClone(policy.documentThemeOverrides) : undefined,
    templateBrandOverrides: policy.templateBrandOverrides ? structuredClone(policy.templateBrandOverrides) : undefined,
    typography: policy.typography ? { ...policy.typography } : undefined,
    visualStyle: policy.visualStyle,
    logoPosition: policy.logoPosition,
    sdgDisplay: policy.sdgDisplay,
    featureImage: policy.featureImage ? structuredClone(policy.featureImage) : undefined,
  });

  const beginNew = () => {
    rememberCurrentDesign();
    setEditingId(undefined);
    setThemeName("");
    setError("");
    setInvalidColors(new Set());
    updatePolicy((current) => ({ documentThemeOverrides: getFullThemeOverrides(current), templateBrandOverrides: getFullThemeOverrides(current) }));
    setEditorTab("colors");
    setView("editor");
  };

  const beginEdit = (saved: SavedDocumentTheme) => {
    rememberCurrentDesign();
    setEditingId(saved.id);
    setThemeName(saved.name);
    setError("");
    setInvalidColors(new Set());
    updatePolicy(() => getSavedThemePatch(saved));
    setEditorTab("colors");
    setView("editor");
  };

  const cancelEdit = () => {
    if (baseline) updatePolicy(() => baseline);
    setBaseline(null);
    setError("");
    setInvalidColors(new Set());
    setView("gallery");
  };

  const commitTheme = () => {
    const normalizedName = themeName.trim();
    if (!isSavedThemeNameAvailable(themes, normalizedName, editingId)) {
      setError(!normalizedName ? "Enter a theme name." : "Use a unique name between 1 and 60 characters.");
      return;
    }
    if (invalidColors.size) {
      setError("Correct the invalid HEX colors before saving.");
      return;
    }
    const existing = themes.find((theme) => theme.id === editingId);
    const saved = createSavedDocumentTheme(useBuilder.getState().policy, normalizedName, existing);
    saveTheme(saved);
    updatePolicy(() => getSavedThemePatch(saved));
    setGalleryTab("mine");
    setBaseline(null);
    setError("");
    setView("gallery");
  };

  const applyPublic = (id: Policy["documentTemplate"]) => {
    if (!id) return;
    // Template switching changes composition only; branding is preserved unless reset explicitly.
    updatePolicy((current) => getDocumentTemplatePatch(id as NonNullable<Policy["documentTemplate"]>, current));
  };

  const resetToDefaults = () => {
    const currentId = getPolicyDocumentTheme(policy).id;
    updatePolicy(() => getDocumentThemePatch(currentId));
  };

  const applySaved = (saved: SavedDocumentTheme) => updatePolicy(() => getSavedThemePatch(saved));

  const duplicateSaved = (saved: SavedDocumentTheme) => {
    const name = nextThemeCopyName(themes, saved.name);
    const now = new Date().toISOString();
    saveTheme({ ...structuredClone(saved), id: crypto.randomUUID(), name, overrides: { ...saved.overrides, customThemeName: name }, createdAt: now, updatedAt: now });
  };

  const renameSaved = (saved: SavedDocumentTheme) => {
    const proposed = window.prompt("Rename theme", saved.name)?.trim();
    if (!proposed) return;
    if (!isSavedThemeNameAvailable(themes, proposed, saved.id)) {
      window.alert("Theme names must be unique and between 1 and 60 characters.");
      return;
    }
    saveTheme({ ...saved, name: proposed, overrides: { ...saved.overrides, customThemeName: proposed }, updatedAt: new Date().toISOString() });
  };

  const updateOverrides = (transform: (current: ReturnType<typeof getFullThemeOverrides>) => ReturnType<typeof getFullThemeOverrides>) => {
    updatePolicy((current) => {
      const overrides = transform(normalizeDocumentThemeOverrides(current.templateBrandOverrides ?? current.documentThemeOverrides));
      return { documentThemeOverrides: overrides, templateBrandOverrides: overrides };
    });
  };

  const resetColors = (source = policy.brandColorSource || "logo") => {
    updatePolicy((current) => ({ ...getPolicyColorResetPatch(current), brandColorSource: source }));
    setInvalidColors(new Set());
    setColorResetKey((key) => key + 1);
  };

  const setColorValidity = (key: string, valid: boolean) => setInvalidColors((current) => {
    const next = new Set(current);
    if (valid) next.delete(key); else next.add(key);
    return next;
  });

  const filteredPublic = DOCUMENT_THEMES.filter((theme) => {
    if (familyFilter !== "all" && theme.family !== familyFilter && theme.universalFamily !== familyFilter) return false;
    if (intentFilter !== "all" && theme.intent !== intentFilter) return false;
    if (densityFilter !== "all" && theme.defaults.density !== densityFilter) return false;
    if (imageFilter !== "all") {
      if (imageFilter === "none" && theme.imageSupport.length !== 0) return false;
      if (imageFilter !== "none" && !theme.imageSupport.includes(imageFilter as "cover" | "section")) return false;
    }
    return !query || [theme.name, theme.description, theme.family, theme.universalFamily, theme.intent, theme.layout.bestFor, ...theme.layout.descriptors, ...theme.tags].join(" ").toLocaleLowerCase().includes(query);
  });
  const filteredMine = themes.filter((theme) => !query || theme.name.toLocaleLowerCase().includes(query));
  const backgroundBase = resolved.background.kind === "solid" ? resolved.background.color : resolved.background.from;
  const contrastWarnings = [
    contrastRatio(resolved.colors.ink, backgroundBase) < 4.5 ? "Body text has low contrast against the page." : "",
    contrastRatio(resolved.colors.onPrimary, resolved.colors.primary) < 4.5 ? "Text on the main brand color has low contrast." : "",
  ].filter(Boolean);

  if (view === "editor" || designOnly) {
    return (
      <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
        <div className="border-b border-[var(--color-line)] px-4 py-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={cancelEdit} className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-cream-2)]" aria-label="Cancel theme editing"><ArrowLeft size={15} /></button>
            <input
              value={themeName}
              maxLength={60}
              onChange={(event) => { setThemeName(event.target.value); setError(""); }}
              placeholder="Enter theme name"
              aria-label="Theme name"
              className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-[13px] outline-none focus:border-[var(--color-forest)]"
            />
          </div>
          <div className="mt-3 grid grid-cols-4 rounded-xl bg-[var(--color-cream-2)] p-1" role="tablist" aria-label="Theme settings">
            {(["colors", "fonts", "design", "images"] as EditorTab[]).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={editorTab === tab} onClick={() => setEditorTab(tab)} className={`rounded-lg px-1 py-2 text-[13px] font-semibold capitalize transition-colors ${editorTab === tab ? "bg-white text-[var(--color-forest)] shadow-sm" : "text-[var(--color-muted)]"}`}>{tab}</button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible px-4 py-5 scrollbar-thin">
          {editorTab === "colors" && (
            <div>
              <InspectorHeading title="Colors" description="Start with logo or template colors, then edit any color below. Changes apply to the document." />
              <ChoiceGroup label="Color source" options={[{ value: "logo", label: "Logo colors" }, { value: "template", label: "Template theme" }]} value={policy.brandColorSource || "logo"} onChange={(brandColorSource) => resetColors(brandColorSource as NonNullable<Policy["brandColorSource"]>)} />
              {!policy.company.companyLogo && <p className="mt-3 rounded-lg bg-[var(--color-cream-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-muted)]">Upload a company logo to suggest document colors automatically. You can edit them here.</p>}
              {policy.company.companyLogo && policy.brandColorSource !== "template" && !policy.company.logoPalette && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">The logo is saved, but no usable colors were detected. The template palette is being used until another logo is uploaded.</p>}
              <button type="button" onClick={() => resetColors()} className="mt-3 text-[12px] font-semibold text-[var(--color-forest)] underline underline-offset-2">{policy.brandColorSource !== "template" && policy.company.logoPalette ? "Reset to logo colors" : "Reset to template colors"}</button>
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">Reset restores these colors only. The uploaded logo image stays unchanged.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {COLOR_FIELDS.map((field) => (
                  <ColorControl
                    key={`${field.key}-${colorResetKey}`}
                    id={field.key}
                    label={field.label}
                    description={field.description}
                    value={resolved.colors[field.key]}
                    open={openColor === field.key}
                    onOpenChange={(open) => setOpenColor(open ? field.key : null)}
                    onValidityChange={setColorValidity}
                    onChange={(color) => updateOverrides((current) => {
                      const linkedHeadingColor = field.key === "primary" || field.key === "primaryDark" || field.key === "subheading";
                      return { ...current, colors: { ...current.colors, ...(linkedHeadingColor ? { primary: color, primaryDark: color, subheading: color } : { [field.key]: color }) } };
                    })}
                  />
                ))}
              </div>
              <BackgroundEditor background={resolved.background} onChange={(background) => updateOverrides((current) => ({ ...current, background }))} />
              {contrastWarnings.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900">{contrastWarnings.join(" ")}</div>}
            </div>
          )}

          {editorTab === "fonts" && (
            <div>
              <InspectorHeading title="Fonts" description="Use fonts that remain dependable in Word and PDF." />
              <div className="mt-4 space-y-4 text-[13px]">
                <SelectField label="Heading font" value={typography.headingFontFamily || typography.fontFamily} options={FONT_FAMILY_OPTIONS} onChange={(value) => updatePolicy(() => ({ typography: { ...typography, headingFontFamily: value } }))} />
                <SelectField label="Body font" value={typography.fontFamily} options={FONT_FAMILY_OPTIONS} onChange={(value) => updatePolicy(() => ({ typography: { ...typography, fontFamily: value } }))} />
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Heading size" value={typography.headingSize} min={10} max={24} step={1} onChange={(value) => updatePolicy(() => ({ typography: { ...typography, headingSize: value } }))} />
                  <NumberField label="Subheading" value={typography.subheadingSize} min={9} max={20} step={.5} onChange={(value) => updatePolicy(() => ({ typography: { ...typography, subheadingSize: value } }))} />
                  <NumberField label="Body size" value={typography.paragraphSize} min={8} max={16} step={.5} onChange={(value) => updatePolicy(() => ({ typography: { ...typography, paragraphSize: value } }))} />
                  <SelectField label="Line spacing" value={String(typography.lineSpacing)} options={["1.15", "1.25", "1.35", "1.4", "1.5", "1.75", "2"]} onChange={(value) => updatePolicy(() => ({ typography: { ...typography, lineSpacing: Number(value) } }))} />
                </div>
              </div>
            </div>
          )}

          {editorTab === "design" && (
            <div>
              <PageBorderControls />
              <InspectorHeading title="Design" description="Choose the structural language and document rhythm. Brand is kept unless reset." />
              <ThemeBaseSelect value={resolved.id} onChange={(id) => updatePolicy(() => getDocumentTemplatePatch(id as NonNullable<Policy["documentTemplate"]>, useBuilder.getState().policy))} />
              <ChoiceGroup label="Data treatment" options={[{ value: "corporate", label: "Formal tables" }, { value: "modern", label: "Clean lists" }]} value={policy.visualStyle || resolved.defaults.visualStyle} onChange={(visualStyle) => updatePolicy(() => ({ visualStyle: visualStyle as Policy["visualStyle"] }))} />
              <ChoiceGroup label="Document spacing" options={[{ value: "compact", label: "Compact" }, { value: "balanced", label: "Balanced" }, { value: "spacious", label: "Spacious" }]} value={resolved.density} onChange={(density) => updateOverrides((current) => ({ ...current, density: density as typeof resolved.density }))} />
            </div>
          )}

          {editorTab === "images" && (
            <div>
              <InspectorHeading title="Images" description="Control the logo and policy imagery treatment." />
              <ChoiceGroup label="Logo alignment" options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} value={policy.logoPosition || resolved.defaults.logoPosition} onChange={(logoPosition) => updatePolicy(() => ({ logoPosition: logoPosition as Policy["logoPosition"] }))} />
              <label className="mt-5 block text-[13px] font-semibold text-[var(--color-ink-2)]">Logo scale <output className="float-right font-mono text-[12px] text-[var(--color-muted)]">{logoScalePercent(resolved.logoScale)}%</output><input aria-label="Logo scale" type="range" min={LOGO_SCALE_MIN} max={LOGO_SCALE_MAX} step={1} value={logoScalePercent(resolved.logoScale)} onChange={(event) => updateOverrides((current) => ({ ...current, logoScale: Number(event.currentTarget.value) }))} className="mt-3 w-full accent-[var(--color-forest)]" /><span className="mt-1 flex justify-between text-[11px] font-normal text-[var(--color-muted)]"><span>{LOGO_SCALE_MIN}%</span><span>Medium</span><span>{LOGO_SCALE_MAX}%</span></span></label>
              <ChoiceGroup label="SDG appearance" options={[{ value: "tiles", label: "Goal tiles" }, { value: "names", label: "Names only" }]} value={policy.sdgDisplay || resolved.defaults.sdgDisplay} onChange={(sdgDisplay) => updatePolicy(() => ({ sdgDisplay: sdgDisplay as Policy["sdgDisplay"] }))} />
              <section className="mt-6 border-t border-[var(--color-line)] pt-5">
                <div className="text-[13px] font-semibold">Feature image</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">Optional PNG, JPEG, or WebP. Uploads are resized before they are stored with the policy.</p>
                {policy.featureImage ? (
                  <div className="mt-3">
                    <div className="relative h-28 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-cream-2)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={policy.featureImage.dataUrl} alt={policy.featureImage.altText || "Feature preview"} className="h-full w-full object-cover" style={{ objectPosition: `${policy.featureImage.focalPosition.x}% ${policy.featureImage.focalPosition.y}%` }} />
                    </div>
                    {!resolved.imageSupport.includes(policy.featureImage.placement) && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[13px] leading-relaxed text-amber-900">This theme does not display the selected placement. The image remains saved and will reappear in a compatible theme.</p>}
                    <ChoiceGroup label="Placement" columns={2} options={[{ value: "cover", label: "Cover" }, { value: "section", label: "Section opener" }]} value={policy.featureImage.placement} onChange={(placement) => updatePolicy((current) => ({ featureImage: current.featureImage ? { ...current.featureImage, placement: placement as "cover" | "section" } : undefined }))} />
                    <label className="mt-4 block text-[13px] font-semibold">Alternative text<input value={policy.featureImage.altText} onChange={(event) => updatePolicy((current) => ({ featureImage: current.featureImage ? { ...current.featureImage, altText: event.target.value.slice(0, 180) } : undefined }))} placeholder="Describe the image" maxLength={180} className="mt-1 h-9 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-2 text-[13px] outline-none focus:border-[var(--color-forest)]" /></label>
                    <div className="mt-4 grid grid-cols-2 gap-3"><RangeField label="Horizontal focus" value={policy.featureImage.focalPosition.x} onChange={(x) => updatePolicy((current) => ({ featureImage: current.featureImage ? { ...current.featureImage, focalPosition: { ...current.featureImage.focalPosition, x } } : undefined }))} /><RangeField label="Vertical focus" value={policy.featureImage.focalPosition.y} onChange={(y) => updatePolicy((current) => ({ featureImage: current.featureImage ? { ...current.featureImage, focalPosition: { ...current.featureImage.focalPosition, y } } : undefined }))} /></div>
                    <button type="button" onClick={() => updatePolicy(() => ({ featureImage: undefined }))} className="mt-4 text-[13px] font-semibold text-red-700">Remove feature image</button>
                  </div>
                ) : (
                  <label className="mt-3 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-line-2)] bg-white text-[13px] font-semibold text-[var(--color-ink-2)] hover:border-[var(--color-forest)]"><Upload size={14} /> Upload feature image<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const featureImage = await resizeFeatureImage(file); updatePolicy(() => ({ featureImage })); setError(""); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Could not process that image."); } event.currentTarget.value = ""; }} /></label>
                )}
              </section>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--color-line)] p-4">
          {error && <p className="mb-3 text-[13px] font-medium text-red-700" role="alert">{error}</p>}
          <div className="grid grid-cols-[.72fr_1.28fr] gap-2">
            <button type="button" onClick={cancelEdit} className="h-10 rounded-xl border border-[var(--color-line-2)] text-[13px] font-semibold text-[var(--color-ink-2)]">Cancel</button>
            <button type="button" onClick={commitTheme} className="h-10 rounded-xl bg-[var(--color-forest)] text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(26,92,58,.2)]">{editingId ? "Update template" : "Save to My Templates"}</button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="overflow-hidden bg-white">
      <div className="border-b border-[var(--color-line)] px-4 py-4">
        <div className="flex items-center gap-2"><Palette size={16} className="text-[var(--color-forest)]" /><h2 className="font-display text-[17px] font-semibold">Template &amp; Brand</h2></div>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">Choose a layout for your policy. Preview it with your content before applying.</p>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-[var(--color-line-2)] bg-white px-3 focus-within:border-[var(--color-forest)]">
          <Search size={14} className="text-[var(--color-muted)]" />
          <span className="sr-only">Search templates</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
        </label>
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-[var(--color-cream-2)] p-1" role="tablist" aria-label="Template library">
          <button type="button" role="tab" aria-selected={galleryTab === "public"} onClick={() => setGalleryTab("public")} className={`rounded-lg py-2 text-[13px] font-semibold ${galleryTab === "public" ? "bg-white text-[var(--color-forest)] shadow-sm" : "text-[var(--color-muted)]"}`}>Public Templates</button>
          <button type="button" role="tab" aria-selected={galleryTab === "mine"} onClick={() => setGalleryTab("mine")} className={`rounded-lg py-2 text-[13px] font-semibold ${galleryTab === "mine" ? "bg-white text-[var(--color-forest)] shadow-sm" : "text-[var(--color-muted)]"}`}>My Templates · {themes.length}</button>
        </div>
        {galleryTab === "public" && <div className="mt-3 grid grid-cols-2 gap-2"><CompactSelect label="Family" value={familyFilter} onChange={setFamilyFilter} options={["all", ...new Set(DOCUMENT_THEMES.map((theme) => theme.universalFamily))]} /><CompactSelect label="Intent" value={intentFilter} onChange={setIntentFilter} options={["all", ...new Set(DOCUMENT_THEMES.map((theme) => theme.intent))]} /><CompactSelect label="Density" value={densityFilter} onChange={setDensityFilter} options={["all", "compact", "balanced", "spacious"]} /><CompactSelect label="Image" value={imageFilter} onChange={setImageFilter} options={["all", "none", "cover", "section"]} /></div>}
        <button type="button" onClick={resetToDefaults} className="mt-3 h-9 w-full rounded-lg border border-[var(--color-line-2)] text-[13px] font-semibold text-[var(--color-ink-2)] hover:border-[var(--color-forest)]">Reset to template defaults</button>
      </div>

      <div className="p-3">
        {galleryTab === "public" ? (
          filteredPublic.length ? <div className="space-y-4" aria-label="Public templates">
            {[...new Set(filteredPublic.map((theme) => theme.family))].map((family) => <section key={family}><div className="mb-2 flex items-center justify-between border-b border-[var(--color-line)] pb-1.5"><h3 className="text-[13px] font-bold uppercase tracking-[.15em] text-[var(--color-muted)]">{family}</h3><span className="text-[13px] text-[var(--color-muted)]">{filteredPublic.filter((theme) => theme.family === family).length}</span></div><div className="space-y-3">{filteredPublic.filter((theme) => theme.family === family).map((theme) => {
              // A custom palette/typography still belongs to the selected base
              // template. Keep the active marker tied to the template ID so a
              // user can see which layout was applied after switching.
              const selected = resolved.id === theme.id;
              return <article key={theme.id} className={`rounded-xl border p-2 transition-[border-color,box-shadow,transform] motion-reduce:transition-none ${selected ? "border-[var(--color-forest)] shadow-[0_8px_20px_rgba(26,92,58,.11)]" : "border-[var(--color-line)] hover:-translate-y-0.5 hover:border-[var(--color-line-2)] motion-reduce:hover:translate-y-0"}`}>
                <ThemeContactSheet theme={theme} companyName={policy.company.name} policyLabel={profile.label} policyType={policy.policyType} compact />
                <div className="mt-2 flex items-start gap-1.5"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="truncate text-[12px] font-semibold">{theme.name}</span>{selected && <Check size={12} className="shrink-0 text-[var(--color-forest)]" />}</div><div className="mt-0.5 text-[11px] capitalize text-[var(--color-muted)]">{theme.intent.replace("-", " ")} · {theme.defaults.density}</div></div><button type="button" onClick={() => setPreviewTheme(theme)} className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-line)] px-1.5 text-[11px] font-semibold"><Eye size={10} /> Preview</button><button type="button" onClick={() => applyPublic(theme.id)} className="h-7 rounded-md bg-[var(--color-forest)] px-2 text-[11px] font-semibold text-white">{selected ? "Applied" : "Apply"}</button></div>
              </article>;
            })}</div></section>)}
          </div> : <div className="px-5 py-10 text-center"><div className="text-[13px] font-semibold">No matching templates</div><p className="mt-1 text-[13px] text-[var(--color-muted)]">Try another family, intent, density, image, or search.</p></div>
        ) : filteredMine.length ? (
          <div className="space-y-2">
            {filteredMine.map((saved) => {
              const selected = policy.documentThemeOverrides?.customThemeName === saved.name;
              const base = DOCUMENT_THEMES.find((theme) => theme.id === saved.baseThemeId)!;
              const colors = { ...base.colors, ...saved.overrides.colors };
              return (
                <div key={saved.id} className={`rounded-xl border p-3 ${selected ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)]/25" : "border-[var(--color-line)]"}`}>
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => applySaved(saved)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold">{saved.name}</span>{selected && <Check size={12} className="text-[var(--color-forest)]" />}</div>
                      <div className="mt-1 text-[13px] text-[var(--color-muted)]">Based on {base.name}</div>
                      <div className="mt-3 flex gap-1">{[colors.primary, colors.soft, colors.paper, colors.accent].map((color, index) => <span key={`${color}-${index}`} className="h-2 flex-1 rounded-full border border-black/5" style={{ background: color }} />)}</div>
                    </button>
                    <div className="flex gap-0.5">
                      <IconButton label="Edit theme" onClick={() => beginEdit(saved)}><Edit3 size={12} /></IconButton>
                      <IconButton label="Duplicate theme" onClick={() => duplicateSaved(saved)}><Copy size={12} /></IconButton>
                      <IconButton label="Rename theme" onClick={() => renameSaved(saved)}><span className="text-[13px] font-bold">Aa</span></IconButton>
                      <IconButton label="Delete theme" onClick={() => { if (window.confirm(`Delete “${saved.name}”? Existing policies will keep their design.`)) deleteTheme(saved.id); }} danger><Trash2 size={12} /></IconButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-10 text-center"><div className="text-[13px] font-semibold">{query ? "No matching templates" : "No custom templates yet"}</div><p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">{query ? "Try a different search." : "Create one from the design currently on the page."}</p></div>
        )}
      </div>
      <div className="border-t border-[var(--color-line)] p-3">
        <button type="button" onClick={beginNew} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-forest)] text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(26,92,58,.2)]"><Plus size={15} /> New custom theme</button>
      </div>
      {previewTheme && <div className="fixed inset-0 z-50 grid place-items-center bg-[#122018]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${previewTheme.name} preview`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewTheme(null); }}><div className="w-full max-w-4xl bg-[var(--color-paper)] p-4 shadow-2xl sm:p-6"><div className="mb-4 flex items-start justify-between"><div><div className="text-[13px] font-bold uppercase tracking-[.15em] text-[var(--color-forest)]">{previewTheme.family} · {previewTheme.intent.replace("-", " ")}</div><h3 className="mt-1 font-display text-[27px] font-semibold">{previewTheme.name}</h3><p className="mt-1 max-w-2xl text-[13px] text-[var(--color-muted)]">{previewTheme.description}</p></div><button type="button" onClick={() => setPreviewTheme(null)} aria-label="Close theme preview" className="grid h-8 w-8 place-items-center text-[var(--color-muted)]"><X size={17} /></button></div><div className="max-h-[65vh] overflow-auto scrollbar-thin"><PdfPolicyPreview policy={{ ...policy, ...getDocumentTemplatePatch(previewTheme.id, policy) }} /></div><div className="mt-4 flex items-center justify-between"><p className="text-[13px] text-[var(--color-muted)]">{previewTheme.previewRecipe}</p><button type="button" onClick={() => { applyPublic(previewTheme.id); setPreviewTheme(null); }} className="h-10 bg-[var(--color-forest)] px-5 py-2.5 text-[13px] font-semibold text-white">Apply template</button></div></div></div>}
    </aside>
  );
}

function InspectorHeading({ title, description }: { title: string; description: string }) {
  return <div><h3 className="text-[14px] font-semibold">{title}</h3><p className="mt-1 text-[13px] text-[var(--color-muted)]">{description}</p></div>;
}

function ColorControl({ id, label, description, value, open, onOpenChange, onChange, onValidityChange }: { id: string; label: string; description: string; value: string; open: boolean; onOpenChange: (open: boolean) => void; onChange: (value: string) => void; onValidityChange: (id: string, valid: boolean) => void }) {
  const [edit, setEdit] = React.useState({ source: value, draft: value });
  const draft = edit.source === value ? edit.draft : value;
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const [pickerPosition, setPickerPosition] = React.useState<{ left: number; top: number } | null>(null);
  const valid = Boolean(normalizeHexColor(draft));
  const commit = (next: string) => {
    setEdit({ source: normalizeHexColor(next) || value, draft: next });
    const normalized = normalizeHexColor(next);
    onValidityChange(id, Boolean(normalized));
    if (normalized) onChange(normalized);
  };
  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const anchor = anchorRef.current;
      const picker = pickerRef.current;
      if (!anchor) return;
      const anchorBox = anchor.getBoundingClientRect();
      const pickerBox = picker?.getBoundingClientRect();
      const width = pickerBox?.width || 170;
      const height = pickerBox?.height || 205;
      const scrollContainer = anchor.closest<HTMLElement>(".overflow-y-auto");
      const availableBottom = Math.min(window.innerHeight - 8, scrollContainer?.getBoundingClientRect().bottom || window.innerHeight) - 8;
      const top = anchorBox.bottom + height <= availableBottom
        ? anchorBox.bottom + 6
        : Math.max(8, anchorBox.top - height - 6);
      const left = Math.min(Math.max(8, anchorBox.left), window.innerWidth - width - 8);
      setPickerPosition({ left, top });
    };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); };
  }, [open]);
  React.useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || anchorRef.current?.contains(target) || pickerRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open, onOpenChange]);
  return (
    <div className="relative">
      <label className="block text-[13px] font-semibold text-[var(--color-ink-2)]">{label}</label>
      <p className="mt-1 min-h-8 text-[11px] leading-4 text-[var(--color-muted)]">{description}</p>
      <div className={`mt-1 flex h-9 items-center rounded-lg border bg-white px-2 ${valid ? "border-[var(--color-line-2)]" : "border-red-400"}`}>
        <button ref={anchorRef} type="button" onClick={() => { setPickerPosition(null); onOpenChange(!open); }} aria-label={`Open ${label} color picker`} className="mr-2 h-5 w-5 rounded-md border border-black/10" style={{ background: value }} />
        <HexColorInput color={draft} onChange={commit} prefixed aria-label={`${label} HEX color`} className="min-w-0 flex-1 bg-transparent font-mono text-[13px] uppercase outline-none" />
      </div>
      {open && <div ref={pickerRef} className="fixed z-50 rounded-xl border border-[var(--color-line)] bg-white p-2 shadow-xl" style={pickerPosition ? { left: pickerPosition.left, top: pickerPosition.top } : { left: 0, top: 0, visibility: "hidden" }}><HexColorPicker color={value} onChange={commit} /><button type="button" onClick={() => onOpenChange(false)} className="mt-2 w-full rounded-lg bg-[var(--color-cream-2)] py-1.5 text-[13px] font-semibold">Done</button></div>}
    </div>
  );
}

function BackgroundEditor({ background, onChange }: { background: ThemeBackground; onChange: (background: ThemeBackground) => void }) {
  const baseColor = background.kind === "solid" ? background.color : background.from;
  const endColor = background.kind === "gradient" ? background.to : baseColor;
  return (
    <section className="mt-6 border-t border-[var(--color-line)] pt-5">
      <div className="flex items-center justify-between"><span className="text-[13px] font-semibold">Page background</span><span className="h-5 w-12 rounded-full border border-black/5" style={{ background: themeBackgroundCss(background) }} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["solid", "gradient"] as const).map((kind) => <button type="button" key={kind} onClick={() => onChange(kind === "solid" ? { kind, color: baseColor } : { kind, from: baseColor, to: endColor, direction: "diagonal" })} className={`rounded-lg border py-2 text-[13px] font-semibold capitalize ${background.kind === kind ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)] text-[var(--color-forest)]" : "border-[var(--color-line)]"}`}>{kind}</button>)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <NativeColor label={background.kind === "solid" ? "Page color" : "Start color"} value={baseColor} onChange={(color) => onChange(background.kind === "solid" ? { kind: "solid", color } : { ...background, from: color })} />
        {background.kind === "gradient" && <NativeColor label="End color" value={background.to} onChange={(color) => onChange({ ...background, to: color })} />}
      </div>
      {background.kind === "gradient" && <ChoiceGroup label="Direction" options={[{ value: "vertical", label: "Vertical" }, { value: "horizontal", label: "Horizontal" }, { value: "diagonal", label: "Diagonal" }]} value={background.direction} onChange={(direction) => onChange({ ...background, direction: direction as "vertical" | "horizontal" | "diagonal" })} />}
    </section>
  );
}

function NativeColor({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return <label className="text-[13px] font-semibold text-[var(--color-ink-2)]">{label}<span className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-[var(--color-line-2)] bg-white px-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" /><span className="font-mono text-[13px]">{value}</span></span></label>;
}

function ChoiceGroup({ label, options, value, onChange, columns = 3 }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; columns?: 2 | 3 }) {
  return <section className="mt-6"><div className="mb-2 text-[13px] font-semibold">{label}</div><div className={`grid gap-2 ${columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>{options.map((option) => <button type="button" key={option.value} onClick={() => onChange(option.value)} className={`min-h-10 rounded-lg border px-2 py-2 text-[13px] font-semibold leading-tight ${value === option.value ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)] text-[var(--color-forest)]" : "border-[var(--color-line)] text-[var(--color-ink-2)]"}`}>{option.label}</button>)}</div></section>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="block font-semibold text-[var(--color-ink-2)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-2 text-[13px] outline-none focus:border-[var(--color-forest)]">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function ThemeBaseSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="mt-5 block text-[13px] font-semibold">Base template<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-2 text-[13px] outline-none focus:border-[var(--color-forest)]">{[...new Set(DOCUMENT_THEMES.map((theme) => theme.universalFamily))].map((family) => <optgroup key={family} label={family}>{DOCUMENT_THEMES.filter((theme) => theme.universalFamily === family).map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup>)}</select></label>;
}

function CompactSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="text-[8px] font-bold uppercase tracking-[.1em] text-[var(--color-muted)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-2 text-[13px] font-semibold normal-case tracking-normal text-[var(--color-ink)] outline-none"><option value="all">All</option>{options.filter((option) => option !== "all").map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="block font-semibold text-[var(--color-ink-2)]">{label}<input type="number" value={value} min={min} max={max} step={step} onChange={(event) => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next))); }} className="mt-1 h-9 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-2 text-[13px] outline-none focus:border-[var(--color-forest)]" /></label>;
}

function RangeField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-[13px] font-semibold text-[var(--color-ink-2)]">{label}<input type="range" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-[var(--color-forest)]" /></label>;
}

function IconButton({ label, onClick, danger = false, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${danger ? "text-red-600 hover:bg-red-50" : "text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-ink)]"}`}>{children}</button>;
}

function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return 1;
    const channels = [1, 3, 5].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

async function resizeFeatureImage(file: File): Promise<NonNullable<Policy["featureImage"]>> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Feature images must be smaller than 8 MB.");
  const source = await fileToDataUrl(file);
  const image = await loadBrowserImage(source);
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable in this browser.");
  context.drawImage(image, 0, 0, width, height);
  const mimeType = file.type === "image/png" ? "image/png" as const : "image/jpeg" as const;
  const dataUrl = canvas.toDataURL(mimeType, mimeType === "image/jpeg" ? .84 : undefined);
  if (dataUrl.length > 4_000_000) throw new Error("The resized image is still too large. Choose a smaller image.");
  return { dataUrl, mimeType, width, height, placement: "cover", focalPosition: { x: 50, y: 50 }, altText: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 180) };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read that image.")); reader.readAsDataURL(file); });
}

function loadBrowserImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("The selected image could not be decoded.")); image.src = source; });
}
