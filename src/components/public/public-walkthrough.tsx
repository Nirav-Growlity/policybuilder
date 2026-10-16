"use client";

import * as React from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLenis } from "lenis/react";
import { Check, FileText } from "lucide-react";
import { SplitText } from "@/components/react-bits/split-text";
import styles from "./public-walkthrough.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type StageId = "structure" | "commitments" | "accountability";
type Stage = { id: StageId; label: string; summary: string };

const stages: Stage[] = [
  { id: "structure", label: "Structure", summary: "Outline the sections your policy needs." },
  { id: "commitments", label: "Commitments", summary: "Set targets you can measure." },
  { id: "accountability", label: "Accountability", summary: "Give every section an owner, then export." },
];

// Scroll progress (0–1) through the story at which each step's part of the draft is finished.
// Choosing a step scrolls to its point; the highlighted step follows the same thresholds.
const STEP_POINTS = [0.2, 0.5, 0.96];
const stepAt = (progress: number) => (progress < 0.22 ? 0 : progress < 0.56 ? 1 : 2);

type Section = { id: string; title: string; owner: { initials: string; name: string } };
const SECTIONS: Section[] = [
  { id: "purpose", title: "Purpose and scope", owner: { initials: "BD", name: "Board" } },
  { id: "energy", title: "Energy and emissions", owner: { initials: "OP", name: "Operations" } },
  { id: "resources", title: "Resource use", owner: { initials: "ST", name: "Sustainability team" } },
  { id: "review", title: "Roles and review", owner: { initials: "BD", name: "Board" } },
];

const SDG_GOALS = [
  { goal: 7, name: "Affordable and clean energy" },
  { goal: 13, name: "Climate action" },
];

// The draft the reader watches fill in. It starts empty at 0%: the outline arrives, the energy section gains a
// measurable target, then every section gets an owner and the draft is ready to export.
function PolicyDraft() {
  return (
    <div className={styles.sheet} data-draft-sheet>
      <div className={styles.sheetHeader}>
        <span className={styles.sheetIcon}><FileText size={16} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className={styles.sheetTitle}>Environmental policy</span>
        <span className={styles.sheetStatus}>
          <span className={styles.statusLabels}>
            <span data-draft-status="draft">Draft</span>
            <span data-draft-status="ready">Ready</span>
          </span>
          <span className={styles.statusPercent}><span data-draft-percent>0</span>%</span>
        </span>
      </div>
      <div className={styles.progressTrack} aria-hidden="true"><span data-draft-bar /></div>

      <ol className={styles.sections}>
        {SECTIONS.map((section) => (
          <li key={section.id} className={styles.sectionRow} data-draft-row={section.id}>
            <span className={styles.sectionHighlight} data-draft-highlight={section.id} />
            <div className={styles.sectionLine}>
              <span className={styles.sectionState}>
                <Check size={12} strokeWidth={2.6} aria-hidden="true" data-draft-check />
              </span>
              <span className={styles.sectionTitle}>{section.title}</span>
              <span className={styles.owner} data-draft-owner aria-label={`Owner: ${section.owner.name}`} title={section.owner.name}>
                {section.owner.initials}
              </span>
            </div>
            {section.id === "energy" ? (
              <div className={styles.targetBody} data-draft-body>
                <div className={styles.target} data-draft-target>
                  <p className={styles.targetFigure}><span aria-hidden="true">−</span><span data-draft-figure>15</span>%</p>
                  <p className={styles.targetLabel}>energy per site by 2028</p>
                  <ul className={styles.goals} aria-label="Related UN Sustainable Development Goals">
                    {SDG_GOALS.map((item) => (
                      <li key={item.goal} data-draft-goal><Image src={`/sdg/goal-${item.goal}.png`} alt={`UN goal ${item.goal}: ${item.name}`} width={36} height={36} /></li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className={styles.sheetFooter}>
        <span className={styles.exportFile} data-draft-file>PDF</span>
        <span className={styles.exportFile} data-draft-file>Word</span>
      </div>
    </div>
  );
}

export function PublicWalkthrough() {
  const rootRef = React.useRef<HTMLElement>(null);
  const storyRef = React.useRef<HTMLDivElement>(null);
  const stepsRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const storyTriggerRef = React.useRef<ScrollTrigger | null>(null);
  const lenis = useLenis();
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeStage = stages[activeIndex];

  useGSAP(() => {
    const root = rootRef.current;
    const story = storyRef.current;
    const steps = stepsRef.current;
    const sheet = root?.querySelector<HTMLElement>("[data-draft-sheet]");
    if (!root || !story || !steps || !sheet) return;
    const q = (selector: string) => gsap.utils.toArray<HTMLElement>(selector, sheet);
    const one = (selector: string) => sheet.querySelector<HTMLElement>(selector);

    gsap.fromTo(root.querySelectorAll("[data-walkthrough-enter]"), { autoAlpha: 0, y: 22 }, {
      autoAlpha: 1,
      y: 0,
      duration: 1,
      stagger: 0.09,
      ease: "expo.out",
      clearProps: "transform",
      scrollTrigger: { trigger: root, start: "top 80%", once: true },
    });

    // Builds the draft's scroll timeline. Each layout below gets a fresh one: when the layout changes (a resize
    // across the breakpoint), reverting the old trigger also reverts and kills the timeline it drove.
    const createBuild = () => {
      // Numbers that count with scroll, in either direction.
      const percentText = one("[data-draft-percent]");
      const figureText = one("[data-draft-figure]");
      const percent = { value: 0 };
      const figure = { value: 0 };
      const writePercent = () => { if (percentText) percentText.textContent = String(Math.round(percent.value)); };
      const writeFigure = () => { if (figureText) figureText.textContent = String(Math.round(figure.value)); };

      // Every piece gets its own tween at its own offset: a staggered tween inside a scrubbed timeline only puts
      // its first target in the starting state.
      const build = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
      const fill = (from: number, to: number, at: number, duration: number) => {
        build
          .fromTo(percent, { value: from }, { value: to, duration, ease: "none", onUpdate: writePercent, immediateRender: from === 0 }, at)
          .fromTo(q("[data-draft-bar]"), { scaleX: from / 100 }, { scaleX: to / 100, duration, ease: "none", immediateRender: from === 0 }, at);
      };
      const rows = q("[data-draft-row]");
      const highlight = (id: string) => one(`[data-draft-highlight='${id}']`);

      // Step one: the outline arrives row by row.
      rows.forEach((row, index) => build.fromTo(row, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.06 }, 0.02 + index * 0.04));
      fill(0, 33, 0.02, 0.18);

      // Step two: the energy section opens on a measurable target.
      build
        .fromTo(highlight("energy"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.04 }, 0.23)
        .fromTo(q("[data-draft-body]"), { height: 0 }, { height: "auto", duration: 0.14, ease: "power2.inOut" }, 0.25)
        .fromTo(q("[data-draft-target]"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.08 }, 0.3)
        .fromTo(figure, { value: 0 }, { value: 15, duration: 0.14, ease: "power1.out", onUpdate: writeFigure }, 0.31);
      q("[data-draft-goal]").forEach((goal, index) => build.fromTo(goal, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.06, ease: "back.out(2)" }, 0.38 + index * 0.04));
      fill(33, 66, 0.3, 0.16);
      build.to(highlight("energy"), { autoAlpha: 0, duration: 0.04 }, 0.52);

      // Step three: each section gets its owner and is checked off, then the draft is ready to export.
      rows.forEach((row, index) => {
        const at = 0.58 + index * 0.05;
        build
          .fromTo(row.querySelector("[data-draft-owner]"), { autoAlpha: 0, x: 14, scale: 0.8 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.06, ease: "back.out(1.8)" }, at)
          .fromTo(row.querySelector("[data-draft-check]"), { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.05 }, at + 0.02)
          .fromTo(row.querySelector("[data-draft-check]")?.parentElement ?? row, { "--state-fill": 0 }, { "--state-fill": 1, duration: 0.05 }, at + 0.02);
      });
      fill(66, 100, 0.58, 0.24);
      build
        .to(q("[data-draft-status='draft']"), { autoAlpha: 0, y: -8, duration: 0.04 }, 0.84)
        .fromTo(q("[data-draft-status='ready']"), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.04 }, 0.85);
      q("[data-draft-file]").forEach((file, index) => build.fromTo(file, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.06 }, 0.86 + index * 0.03));
      build.set({}, {}, 1);
      return build;
    };

    // The sheet keeps its finished height from the start, so filling it in never moves the page below it.
    // The collapsed target reports its natural height through scrollHeight.
    const reserveHeight = () => {
      sheet.style.minHeight = "";
      const hidden = q("[data-draft-body]").reduce((sum, body) => sum + Math.max(0, body.scrollHeight - body.clientHeight), 0);
      sheet.style.minHeight = `${Math.ceil(sheet.offsetHeight + hidden)}px`;
    };
    reserveHeight();
    ScrollTrigger.addEventListener("refreshInit", reserveHeight);

    let lastIndex = 0;
    const follow = (progress: number) => {
      steps.style.setProperty("--walkthrough-progress", progress.toFixed(4));
      const nextIndex = stepAt(progress);
      if (nextIndex === lastIndex) return;
      lastIndex = nextIndex;
      setActiveIndex(nextIndex);
    };

    const media = gsap.matchMedia();
    media.add({ pinned: "(min-width: 1024px) and (min-height: 640px)", free: "not all and (min-width: 1024px) and (min-height: 640px)" }, (context) => {
      // On wide screens the story holds still while the draft fills in; elsewhere the draft fills as it scrolls past.
      const pinned = Boolean(context.conditions?.pinned) && story.offsetHeight <= window.innerHeight - 48;
      const build = createBuild();
      const trigger = ScrollTrigger.create({
        id: "policycraft-public-walkthrough",
        trigger: pinned ? story : sheet,
        start: pinned ? "center center" : "top 75%",
        end: pinned ? () => `+=${Math.max(window.innerHeight * 1.7, 1250)}` : "bottom 40%",
        pin: pinned ? story : false,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        animation: build,
        scrub: 0.6,
        onUpdate: (self) => follow(self.progress),
      });
      storyTriggerRef.current = trigger;
      return () => {
        trigger.kill();
        if (storyTriggerRef.current === trigger) storyTriggerRef.current = null;
      };
    });
    return () => {
      media.revert();
      ScrollTrigger.removeEventListener("refreshInit", reserveHeight);
      sheet.style.minHeight = "";
    };
  }, { scope: rootRef });

  function activateTab(index: number) {
    const nextIndex = (index + stages.length) % stages.length;
    const trigger = storyTriggerRef.current;
    if (trigger) {
      const top = trigger.start + (trigger.end - trigger.start) * STEP_POINTS[nextIndex];
      // Native smooth scrolling would fight the page's Lenis instance, so the jump goes through it.
      if (lenis) lenis.scrollTo(top, { duration: 1.2 });
      else window.scrollTo({ top });
    } else {
      setActiveIndex(nextIndex);
    }
    tabRefs.current[nextIndex]?.focus();
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: stages.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    activateTab(target);
  }

  return (
    <section ref={rootRef} id="how" className={styles.walkthrough} data-home-tone aria-labelledby="walkthrough-heading">
      <div className={styles.walkthroughInner}>
        <div className={styles.storyScene} ref={storyRef}>
          {/* The title is part of the pinned story, so it stays in view while the draft fills in. */}
          <div className={styles.storyAside}>
          <header className={styles.walkthroughIntro} data-walkthrough-enter>
            <SplitText tag="h2" id="walkthrough-heading" text="See your policy take shape." />
            <p>From empty draft to owned, measurable commitments in three steps.</p>
          </header>
          <div className={styles.steps} ref={stepsRef} role="tablist" aria-label="Policy building steps" aria-orientation="vertical" data-walkthrough-enter>
            {stages.map((stage, index) => {
              const selected = index === activeIndex;
              return (
                <button
                  key={stage.id}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  id={`policy-step-${stage.id}`}
                  className={styles.step}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="policy-draft-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => activateTab(index)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  <span className={styles.stepLabel}>{stage.label}</span>
                  <span className={styles.stepSummary}><span>{stage.summary}</span></span>
                </button>
              );
            })}
          </div>
          </div>

          <div
            className={styles.draftStage}
            id="policy-draft-panel"
            role="tabpanel"
            aria-labelledby={`policy-step-${activeStage.id}`}
            data-walkthrough-enter
          >
            <p className={styles.compactSummary}>{activeStage.summary}</p>
            <PolicyDraft />
          </div>
        </div>
      </div>
    </section>
  );
}
