"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, List, ListOrdered } from "lucide-react";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  getPolicyColorResetPatch,
  getPolicyDocumentTheme,
  getResolvedTypography,
  LOGO_SCALE_MAX,
  LOGO_SCALE_MIN,
  logoScalePercent,
  normalizeDocumentThemeOverrides,
  normalizeHexColor,
  themeBackgroundCss,
} from "@/lib/document-themes";
import { resolvePolicyListFormatting } from "@/lib/list-formatting";
import { getSection } from "@/lib/sections";
import { useBuilder } from "@/lib/store";
import { FONT_FAMILY_OPTIONS } from "@/lib/typography";
import type { DocumentThemePalette, ListMarkerStyle, PageBorder, Policy, PolicyListFormatting, ThemeBackground } from "@/lib/types";
import { ColorField, Disclosure, EASE_OUT, Group, Notice, Row, Segmented, Slider, Stepper, SwitchRow, TextButton } from "./controls";
import styles from "./design-studio.module.css";

type Overrides = ReturnType<typeof normalizeDocumentThemeOverrides>;

function useThemeOverrides() {
  const { updatePolicy } = useBuilder();
  return React.useCallback((transform: (current: Overrides) => Overrides) => {
    updatePolicy((current) => {
      const overrides = transform(normalizeDocumentThemeOverrides(current.templateBrandOverrides ?? current.documentThemeOverrides));
      return { documentThemeOverrides: overrides, templateBrandOverrides: overrides };
    });
  }, [updatePolicy]);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div data-reveal className={styles.sectionHead}><h2 className={styles.sectionTitle}>{children}</h2></div>;
}

/* ───────────────────────────── Brand ───────────────────────────── */

const KEY_COLORS: { key: keyof DocumentThemePalette; label: string; hint: string }[] = [
  { key: "primary", label: "Brand", hint: "Headings, title bands and section numbers" },
  { key: "ink", label: "Body text", hint: "Paragraphs, lists and tables" },
  { key: "accent", label: "Highlight", hint: "Decorative details and emphasis" },
];

const MORE_COLORS: { key: keyof DocumentThemePalette; label: string; hint: string }[] = [
  { key: "soft", label: "Shading", hint: "Soft fill behind content and tables" },
  { key: "muted", label: "Captions", hint: "Labels, captions and document details" },
  { key: "line", label: "Lines", hint: "Table borders and dividers" },
  { key: "paper", label: "Panels", hint: "Paper-colored panels in the design" },
  { key: "onPrimary", label: "Text on brand", hint: "Text placed over the brand color" },
];

export function BrandSection() {
  const { policy, updatePolicy } = useBuilder();
  const updateOverrides = useThemeOverrides();
  const resolved = getPolicyDocumentTheme(policy);
  const [invalid, setInvalid] = React.useState<Set<string>>(new Set());
  const [resetKey, setResetKey] = React.useState(0);
  const logo = policy.company.companyLogo;
  const source = policy.brandColorSource || "logo";
  const logoColorsMissing = Boolean(logo) && source !== "template" && !policy.company.logoPalette;

  const setValidity = (key: string, valid: boolean) => setInvalid((current) => {
    const next = new Set(current);
    if (valid) next.delete(key); else next.add(key);
    return next;
  });

  const resetColors = (nextSource: NonNullable<Policy["brandColorSource"]> = source) => {
    updatePolicy((current) => ({ ...getPolicyColorResetPatch(current), brandColorSource: nextSource }));
    setInvalid(new Set());
    setResetKey((key) => key + 1);
  };

  const setColor = (key: keyof DocumentThemePalette, color: string) => updateOverrides((current) => {
    // Brand, heading and subheading colors move together so headings stay on-brand.
    const linked = key === "primary" || key === "primaryDark" || key === "subheading";
    return { ...current, colors: { ...current.colors, ...(linked ? { primary: color, primaryDark: color, subheading: color } : { [key]: color }) } };
  });

  const backgroundBase = resolved.background.kind === "solid" ? resolved.background.color : resolved.background.from;
  const warnings = [
    contrastRatio(resolved.colors.ink, backgroundBase) < 4.5 ? "Body text is hard to read on this page color." : "",
    contrastRatio(resolved.colors.onPrimary, resolved.colors.primary) < 4.5 ? "Text on the brand color is hard to read." : "",
  ].filter(Boolean);

  return (
    <>
      <SectionTitle>Brand</SectionTitle>

      <Group title="Logo">
        {logo ? (
          <>
            <div className={styles.logoStage} data-align={policy.logoPosition || resolved.defaults.logoPosition}>
              <motion.img
                layout
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                src={logo}
                alt="Company logo"
                className={styles.logoImage}
                style={{ height: `${Math.round(28 * logoScalePercent(resolved.logoScale) / 100)}px` }}
              />
            </div>
            <Row label="Position">
              <Segmented
                label="Logo position"
                value={policy.logoPosition || resolved.defaults.logoPosition}
                onChange={(logoPosition) => updatePolicy(() => ({ logoPosition: logoPosition as Policy["logoPosition"] }))}
                options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
              />
            </Row>
            <Slider label="Size" value={logoScalePercent(resolved.logoScale)} min={LOGO_SCALE_MIN} max={LOGO_SCALE_MAX} format={(value) => `${value}%`} onChange={(logoScale) => updateOverrides((current) => ({ ...current, logoScale }))} />
          </>
        ) : (
          <p className={styles.muted}>Add a company logo in company details to place it here and pull colors from it.</p>
        )}
      </Group>

      <Group title="Colors" action={<TextButton onClick={() => resetColors()}>Reset</TextButton>}>
        <Segmented
          label="Color source"
          value={logo ? source : "template"}
          onChange={(next) => resetColors(next as NonNullable<Policy["brandColorSource"]>)}
          options={[{ value: "logo", label: "From logo", disabled: !logo }, { value: "template", label: "From template" }]}
        />
        {logoColorsMissing ? <Notice tone="warning">No usable colors found in the logo, so template colors are used.</Notice> : null}
        <div className={styles.keyColors}>
          {KEY_COLORS.map((field) => (
            <ColorField key={`${field.key}-${resetKey}`} id={field.key} size="large" label={field.label} hint={field.hint} value={resolved.colors[field.key]} onValidityChange={setValidity} onChange={(color) => setColor(field.key, color)} />
          ))}
        </div>
        <AnimatePresence>
          {warnings.map((warning) => <Notice key={warning} tone="warning">{warning}</Notice>)}
        </AnimatePresence>
        {invalid.size ? <Notice tone="error">Fix the highlighted HEX values.</Notice> : null}
      </Group>

      <Disclosure title="More colors" summary={<SwatchStrip colors={MORE_COLORS.map((field) => resolved.colors[field.key])} />}>
        <div className={styles.colorGrid}>
          {MORE_COLORS.map((field) => (
            <ColorField key={`${field.key}-${resetKey}`} id={field.key} label={field.label} hint={field.hint} value={resolved.colors[field.key]} onValidityChange={setValidity} onChange={(color) => setColor(field.key, color)} />
          ))}
        </div>
      </Disclosure>

      <Disclosure title="Page background" summary={<span className={styles.bgChip} style={{ background: themeBackgroundCss(resolved.background) }} />}>
        <BackgroundEditor background={resolved.background} onChange={(background) => updateOverrides((current) => ({ ...current, background }))} />
      </Disclosure>
    </>
  );
}

function SwatchStrip({ colors }: { colors: string[] }) {
  return <span className={styles.swatchStrip} aria-hidden="true">{colors.map((color, index) => <span key={index} style={{ background: color }} />)}</span>;
}

function BackgroundEditor({ background, onChange }: { background: ThemeBackground; onChange: (background: ThemeBackground) => void }) {
  const base = background.kind === "solid" ? background.color : background.from;
  const end = background.kind === "gradient" ? background.to : base;
  return (
    <div className={styles.stack}>
      <Segmented
        label="Background style"
        value={background.kind}
        onChange={(kind) => onChange(kind === "solid" ? { kind, color: base } : { kind: "gradient", from: base, to: end, direction: "diagonal" })}
        options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]}
      />
      <div className={styles.colorGrid}>
        <ColorField id="background-from" label={background.kind === "solid" ? "Page color" : "Start"} value={base} onChange={(color) => onChange(background.kind === "solid" ? { kind: "solid", color } : { ...background, from: color })} />
        <AnimatePresence>
          {background.kind === "gradient" ? (
            <motion.div key="to" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18, ease: EASE_OUT }}>
              <ColorField id="background-to" label="End" value={background.to} onChange={(color) => onChange({ ...background, to: color })} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {background.kind === "gradient" ? (
        <Row label="Direction">
          <Segmented
            label="Gradient direction"
            size="small"
            value={background.direction}
            onChange={(direction) => onChange({ ...background, direction })}
            options={[{ value: "vertical", label: "Down" }, { value: "horizontal", label: "Across" }, { value: "diagonal", label: "Diagonal" }]}
          />
        </Row>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── Text ───────────────────────────── */

const LINE_SPACING = [1.15, 1.25, 1.35, 1.4, 1.5, 1.75, 2] as const;
const FONT_OPTIONS = FONT_FAMILY_OPTIONS.map((font) => ({ value: font, label: font }));

export function TextSection() {
  const { policy, updatePolicy } = useBuilder();
  const typography = getResolvedTypography(policy);
  const resolved = getPolicyDocumentTheme(policy);
  const set = (patch: Partial<typeof typography>) => updatePolicy(() => ({ typography: { ...typography, ...patch } }));
  const headingFont = typography.headingFontFamily || typography.fontFamily;

  return (
    <>
      <SectionTitle>Text</SectionTitle>

      <div data-reveal className={styles.specimen} style={{ background: resolved.colors.paper }} aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p key={`h-${headingFont}`} initial={{ opacity: 0, y: 6, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(3px)" }} transition={{ duration: 0.24, ease: EASE_OUT }} className={styles.specimenHeading} style={{ fontFamily: headingFont, color: resolved.colors.primaryDark, fontSize: `${Math.min(26, typography.headingSize * 1.25)}px` }}>
            Policy declaration
          </motion.p>
        </AnimatePresence>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p key={`b-${typography.fontFamily}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: EASE_OUT, delay: 0.04 }} className={styles.specimenBody} style={{ fontFamily: typography.fontFamily, color: resolved.colors.ink, fontSize: `${Math.min(15, typography.paragraphSize * 1.15)}px`, lineHeight: typography.lineSpacing }}>
            We commit to reducing our environmental impact across every site we operate.
          </motion.p>
        </AnimatePresence>
      </div>

      <Group title="Fonts">
        <Row label="Headings" stacked>
          <SelectMenu aria-label="Heading font" value={headingFont} options={FONT_OPTIONS} onValueChange={(value) => set({ headingFontFamily: value })} />
        </Row>
        <Row label="Body" stacked>
          <SelectMenu aria-label="Body font" value={typography.fontFamily} options={FONT_OPTIONS} onValueChange={(value) => set({ fontFamily: value })} />
        </Row>
      </Group>

      <Group title="Sizes">
        <Row label="Headings"><Stepper label="Heading size" value={typography.headingSize} min={10} max={24} unit="pt" onChange={(headingSize) => set({ headingSize })} /></Row>
        <Row label="Subheadings"><Stepper label="Subheading size" value={typography.subheadingSize} min={9} max={20} step={0.5} unit="pt" onChange={(subheadingSize) => set({ subheadingSize })} /></Row>
        <Row label="Body"><Stepper label="Body size" value={typography.paragraphSize} min={8} max={16} step={0.5} unit="pt" onChange={(paragraphSize) => set({ paragraphSize })} /></Row>
        <Row label="Line spacing"><Stepper label="Line spacing" value={typography.lineSpacing} values={LINE_SPACING} onChange={(lineSpacing) => set({ lineSpacing })} /></Row>
      </Group>
    </>
  );
}

/* ───────────────────────────── Layout ───────────────────────────── */

const LIST_ROWS: { key: keyof PolicyListFormatting; label: string }[] = [
  { key: "outline", label: "Sections" },
  { key: "focusAreas", label: "Focus areas" },
  { key: "qualitativeGroups", label: "Objective groups" },
  { key: "qualitativeItems", label: "Objectives" },
  { key: "quantitativeGroups", label: "Target groups" },
  { key: "quantitativeItems", label: "Targets" },
  { key: "responsibilities", label: "Responsibilities" },
];

export function LayoutSection() {
  const { policy, updatePolicy } = useBuilder();
  const updateOverrides = useThemeOverrides();
  const resolved = getPolicyDocumentTheme(policy);
  const border = resolved.pageBorder;
  const lists = resolvePolicyListFormatting(policy);
  const updateBorder = (patch: Partial<PageBorder>) => updatePolicy((current) => {
    const overrides = normalizeDocumentThemeOverrides({ ...(current.templateBrandOverrides ?? current.documentThemeOverrides), pageBorder: { ...getPolicyDocumentTheme(current).pageBorder, ...patch } });
    return { templateBrandOverrides: overrides, documentThemeOverrides: overrides };
  });
  const bulletCount = LIST_ROWS.filter((row) => lists[row.key] === "bullet").length;

  return (
    <>
      <SectionTitle>Layout</SectionTitle>

      <Group title="Content">
        <Row label="Targets and roles" stacked>
          <Segmented label="Show targets and roles as" value={policy.visualStyle || resolved.defaults.visualStyle} onChange={(visualStyle) => updatePolicy(() => ({ visualStyle: visualStyle as Policy["visualStyle"] }))} options={[{ value: "corporate", label: "Tables" }, { value: "modern", label: "Lists" }]} />
        </Row>
        <Row label="Spacing" stacked>
          <Segmented label="Document spacing" value={resolved.density} onChange={(density) => updateOverrides((current) => ({ ...current, density }))} options={[{ value: "compact", label: "Compact" }, { value: "balanced", label: "Balanced" }, { value: "spacious", label: "Spacious" }]} />
        </Row>
        <Row label="Text alignment">
          <Segmented
            label="Text alignment"
            iconOnly
            value={resolved.textAlignment}
            onChange={(textAlignment) => updateOverrides((current) => ({ ...current, textAlignment }))}
            options={[
              { value: "left", label: "Align left", icon: <AlignLeft size={15} aria-hidden="true" /> },
              { value: "center", label: "Center", icon: <AlignCenter size={15} aria-hidden="true" /> },
              { value: "right", label: "Align right", icon: <AlignRight size={15} aria-hidden="true" /> },
              { value: "justify", label: "Justify", icon: <AlignJustify size={15} aria-hidden="true" /> },
            ]}
          />
        </Row>
      </Group>

      <Group title="Page border">
        <SwitchRow label="Show a border" checked={border.enabled} onChange={(enabled) => updateBorder({ enabled })} />
        <AnimatePresence initial={false}>
          {border.enabled ? (
            <motion.div key="border" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: { duration: 0.26, ease: EASE_OUT }, opacity: { duration: 0.18 } }} className={styles.clip}>
              <div className={styles.stack}>
                <Slider label="Thickness" value={border.widthPt} min={0.5} max={6} step={0.5} format={(value) => `${value} pt`} onChange={(widthPt) => updateBorder({ widthPt })} />
                <Slider label="Distance from edge" value={border.insetMm} min={5} max={20} format={(value) => `${value} mm`} onChange={(insetMm) => updateBorder({ insetMm })} />
                <div className={styles.borderColor}>
                  <ColorField id="border-color" label="Color" value={border.color || resolved.colors.primary} onChange={(color) => updateBorder({ color })} />
                  {border.color ? <TextButton onClick={() => updateBorder({ color: undefined })}>Use brand color</TextButton> : null}
                </div>
                <Row label="Pages" stacked>
                  <SelectMenu aria-label="Pages with a border" value={border.scope} onValueChange={(scope) => updateBorder({ scope: scope as PageBorder["scope"] })} options={[{ value: "all-except-cover", label: "All except the cover" }, { value: "all", label: "All pages" }, { value: "cover", label: "Cover only" }]} />
                </Row>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Group>

      <Disclosure title="List markers" summary={<span className={styles.disclosureCount}>{bulletCount} bulleted, {LIST_ROWS.length - bulletCount} numbered</span>}>
        <div className={styles.listRows}>
          {LIST_ROWS.map((row) => (
            <Row key={row.key} label={row.label}>
              <Segmented<ListMarkerStyle>
                label={`${row.label} markers`}
                iconOnly
                size="small"
                value={lists[row.key] ?? "bullet"}
                onChange={(value) => updatePolicy((current) => ({ listFormatting: { ...current.listFormatting, [row.key]: value } }))}
                options={[
                  { value: "bullet", label: "Bullets", icon: <List size={14} aria-hidden="true" /> },
                  { value: "number", label: "Numbers", icon: <ListOrdered size={14} aria-hidden="true" /> },
                ]}
              />
            </Row>
          ))}
        </div>
      </Disclosure>
    </>
  );
}

/* ───────────────────────────── Pages ───────────────────────────── */

export function PagesSection() {
  const { policy, updatePolicy } = useBuilder();
  const resolved = getPolicyDocumentTheme(policy);
  return (
    <>
      <SectionTitle>Pages</SectionTitle>
      <Group title="Include">
        <SwitchRow label="Table of contents" checked={policy.showTableOfContents !== false} onChange={(showTableOfContents) => updatePolicy(() => ({ showTableOfContents }))} />
        <SwitchRow label="Employee acknowledgement" hint="Sign-off form at the end" checked={policy.showAcknowledgement !== false} onChange={(showAcknowledgement) => updatePolicy(() => ({ showAcknowledgement }))} />
        <SwitchRow
          label="Revision history"
          checked={getSection(policy, "revision")?.enabled !== false}
          onChange={(enabled) => updatePolicy((current) => ({ showRevisionHistory: enabled, sections: (current.sections || []).map((section) => section.kind === "revision" ? { ...section, enabled } : section) }))}
        />
      </Group>
      <Group title="SDG goals">
        <Segmented label="Show SDG goals as" value={policy.sdgDisplay || resolved.defaults.sdgDisplay} onChange={(sdgDisplay) => updatePolicy(() => ({ sdgDisplay: sdgDisplay as Policy["sdgDisplay"] }))} options={[{ value: "tiles", label: "Goal tiles" }, { value: "names", label: "Names only" }]} />
      </Group>
    </>
  );
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
