"use client";
import * as React from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Files, Image as ImageIcon, LayoutTemplate, Rows3, X } from "lucide-react";
import { getPolicyDocumentTheme, getResolvedTypography } from "@/lib/document-themes";
import { useBuilder } from "@/lib/store";
import { TemplateSection } from "./design-studio/template-section";
import { BrandSection, LayoutSection, PagesSection, TextSection } from "./design-studio/style-sections";
import { CoverSection } from "./design-studio/cover-section";
import { EASE_OUT, SPRING } from "./design-studio/controls";
import styles from "./design-inspector.module.css";

gsap.registerPlugin(useGSAP);

const SECTIONS = [
  { id: "template", label: "Template" },
  { id: "brand", label: "Brand" },
  { id: "text", label: "Text" },
  { id: "layout", label: "Layout" },
  { id: "cover", label: "Cover" },
  { id: "pages", label: "Pages" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];
const STORAGE_KEY = "pc-design-section";

function readStoredSection(): SectionId {
  if (typeof window === "undefined") return "template";
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (SECTIONS.some((section) => section.id === stored)) return stored as SectionId;
  } catch {}
  return "template";
}

export function DesignInspector({ open, mobile, onClose }: { open: boolean; mobile: boolean; onClose: () => void }) {
  // Design mode only opens after a client-side click, so reading storage here cannot cause a hydration mismatch.
  const [section, setSection] = React.useState<SectionId>(readStoredSection);
  const [direction, setDirection] = React.useState(1);
  const panel = React.useRef<HTMLElement>(null);
  const railRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const select = (next: SectionId, focus = false) => {
    const from = SECTIONS.findIndex((item) => item.id === section);
    const to = SECTIONS.findIndex((item) => item.id === next);
    setDirection(to >= from ? 1 : -1);
    setSection(next);
    try { window.sessionStorage.setItem(STORAGE_KEY, next); } catch {}
    if (focus) requestAnimationFrame(() => tabRefs.current[to]?.focus());
  };

  const onRailKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = SECTIONS.findIndex((item) => item.id === section);
    let next: number | undefined;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % SECTIONS.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index - 1 + SECTIONS.length) % SECTIONS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SECTIONS.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    select(SECTIONS[next].id, true);
  };

  // One entrance moment: the rail settles in when the panel opens.
  useGSAP(() => {
    if (!open) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-rail-item]", { x: -10, autoAlpha: 0, duration: 0.42, ease: "power3.out", stagger: 0.045, clearProps: "all" });
    });
    return () => media.revert();
  }, { scope: railRef, dependencies: [open] });

  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    if (mobile) panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape" && !(mobile && event.key === "Tab")) return;
      const visibleModals = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
        .filter((dialog) => dialog.getClientRects().length > 0 && dialog.getAttribute("aria-hidden") !== "true" && !dialog.closest("[inert]"));
      const topModal = visibleModals.at(-1);
      if (topModal && topModal !== panel.current) return;
      const targetElement = event.target instanceof Element ? event.target : null;
      const targetDialog = targetElement?.closest<HTMLElement>('[role="dialog"]');
      if (targetDialog && !panel.current?.contains(targetDialog)) return;
      if (targetElement?.closest("[data-pc-color-picker]")) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (mobile && event.key === "Tab") {
        const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,a[href],[tabindex="0"]') || []).filter((element) => element.getClientRects().length);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (mobile) previous?.focus(); };
  }, [mobile, open, onClose]);

  if (!open) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.inspector}>
        <button type="button" aria-label="Close design controls" onClick={onClose} className={styles.scrim} />
        <aside ref={panel} tabIndex={-1} id="design-inspector" role={mobile ? "dialog" : undefined} aria-modal={mobile || undefined} aria-label="Document design" className={styles.frame}>
          <nav className={styles.rail} aria-label="Design sections">
            <div ref={railRef} role="tablist" aria-orientation="vertical" aria-label="Design sections" onKeyDown={onRailKeyDown} className={styles.railList}>
              {SECTIONS.map((item, index) => {
                const selected = item.id === section;
                return (
                  <button
                    key={item.id}
                    ref={(element) => { tabRefs.current[index] = element; }}
                    type="button"
                    role="tab"
                    data-rail-item
                    id={`design-tab-${item.id}`}
                    aria-controls="design-section"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(item.id)}
                    className={styles.railItem}
                  >
                    {selected ? <motion.span layoutId="design-rail-marker" transition={SPRING} className={styles.railMarker} /> : null}
                    <span className={styles.railGlyph}><RailGlyph id={item.id} /></span>
                    <span className={styles.railLabel}>{item.label}</span>
                  </button>
                );
              })}
            </div>
            {mobile ? <button type="button" aria-label="Close design controls" onClick={onClose} className={styles.close}><X size={18} aria-hidden="true" /></button> : null}
          </nav>

          <div className={styles.stage}>
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={section}
                custom={direction}
                variants={{
                  enter: (dir: number) => ({ opacity: 0, y: dir * 14 }),
                  center: { opacity: 1, y: 0 },
                  exit: (dir: number) => ({ opacity: 0, y: dir * -10 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: EASE_OUT }}
                id="design-section"
                role="tabpanel"
                aria-labelledby={`design-tab-${section}`}
                className={styles.panel}
              >
                <SectionStage section={section} />
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </MotionConfig>
  );
}

/** Scrollable section body; staggers its groups in as the section opens. */
function SectionStage({ section }: { section: SectionId }) {
  const scope = React.useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-reveal]", { y: 10, autoAlpha: 0, duration: 0.4, ease: "power3.out", stagger: 0.04, delay: 0.05, clearProps: "opacity,visibility,transform" });
    });
    return () => media.revert();
  }, { scope });
  return (
    <div ref={scope} data-studio-scroll className={styles.scroll}>
      {section === "template" ? <TemplateSection />
        : section === "brand" ? <BrandSection />
        : section === "text" ? <TextSection />
        : section === "layout" ? <LayoutSection />
        : section === "cover" ? <CoverSection />
        : <PagesSection />}
    </div>
  );
}

/** Rail icons for Brand and Text mirror the document's current colors and heading font. */
function RailGlyph({ id }: { id: SectionId }) {
  const policy = useBuilder((state) => state.policy);
  if (id === "brand") {
    const colors = getPolicyDocumentTheme(policy).colors;
    return (
      <span className={styles.brandGlyph} aria-hidden="true">
        <motion.span animate={{ backgroundColor: colors.primary }} transition={{ duration: 0.35 }} />
        <motion.span animate={{ backgroundColor: colors.accent }} transition={{ duration: 0.35, delay: 0.05 }} />
      </span>
    );
  }
  if (id === "text") {
    const typography = getResolvedTypography(policy);
    return (
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={typography.headingFontFamily || typography.fontFamily} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={SPRING} className={styles.textGlyph} style={{ fontFamily: typography.headingFontFamily || typography.fontFamily }} aria-hidden="true">
          Aa
        </motion.span>
      </AnimatePresence>
    );
  }
  const Icon = id === "template" ? LayoutTemplate : id === "layout" ? Rows3 : id === "cover" ? ImageIcon : Files;
  return <Icon size={19} strokeWidth={1.7} aria-hidden="true" />;
}
