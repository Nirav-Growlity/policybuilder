"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FileText, Target, Users, type LucideIcon } from "lucide-react";
import styles from "./public-walkthrough.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type StageId = "structure" | "commitments" | "accountability";
type Stage = {
  id: StageId;
  label: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  capabilities: string[];
};

const stages: Stage[] = [
  {
    id: "structure",
    label: "Structure",
    title: "Start with a clear foundation.",
    summary: "Set the purpose, define the scope, and arrange the sections your policy needs.",
    icon: FileText,
    capabilities: ["Organize a useful document structure", "Write a purpose and scope that fit your organization"],
  },
  {
    id: "commitments",
    label: "Commitments",
    title: "Make priorities specific.",
    summary: "Turn relevant focus areas into practical objectives and measurable targets.",
    icon: Target,
    capabilities: ["Add focus areas, objectives, and targets", "Connect commitments to relevant UN goals"],
  },
  {
    id: "accountability",
    label: "Accountability",
    title: "Give the work an owner.",
    summary: "Assign responsibilities, decide how progress will be reviewed, and prepare the document to share.",
    icon: Users,
    capabilities: ["Set responsibilities and a review mechanism", "Check the finished policy, then export PDF or Word"],
  },
];

function PolicyArtifact({ stage }: { stage: StageId }) {
  const fragmentContainer = {
    initial: {},
    animate: { transition: { staggerChildren: 0.075, delayChildren: 0.025 } },
  };
  const fragment = {
    initial: { opacity: 0, y: 7 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const } },
  };
  return (
    <div className={styles.artifact} aria-label="Sample policy content">
      <div className={styles.artifactMasthead}>
        <div className={styles.artifactIdentity}>
          <span className={styles.artifactMark} aria-hidden="true" />
          <span>POLICYCRAFT</span>
        </div>
        <span className={styles.artifactSample}>SAMPLE · ENVIRONMENTAL POLICY</span>
      </div>

      {stage === "structure" ? (
        <motion.div className={styles.structureArtifact} variants={fragmentContainer} initial="initial" animate="animate">
          <motion.div className={styles.artifactIntro} variants={fragment}>
            <p className={styles.artifactEyebrow}>PURPOSE &amp; SCOPE</p>
            <h3>A policy with a clear place to begin.</h3>
            <p>We will set responsibilities, actions, and review methods that fit our organization.</p>
            <div className={styles.scopeNote}><span>APPLIES TO</span><b>Our operations and the people who deliver them</b></div>
          </motion.div>
          <motion.div className={styles.outlineArtifact} variants={fragment}>
            <p className={styles.artifactEyebrow}>DOCUMENT OUTLINE</p>
            <ol>
              <li><span>01</span><b>Policy declaration</b></li>
              <li><span>02</span><b>Energy &amp; emissions</b></li>
              <li><span>03</span><b>Resource stewardship</b></li>
              <li><span>04</span><b>Roles &amp; review</b></li>
            </ol>
          </motion.div>
        </motion.div>
      ) : stage === "commitments" ? (
        <motion.div className={styles.commitmentArtifact} variants={fragmentContainer} initial="initial" animate="animate">
          <motion.div variants={fragment}>
            <p className={styles.artifactEyebrow}>FOCUS AREA&nbsp; / &nbsp;ENERGY &amp; EMISSIONS</p>
            <h3>Improve energy efficiency across our operations.</h3>
            <p className={styles.commitmentLead}>Choose actions for each operating site, record a baseline, and review progress against a time-bound target.</p>
          </motion.div>
          <motion.div className={styles.measurementRow} variants={fragment}>
            <div><span>OBJECTIVE</span><b>Reduce energy use through planned operational improvements</b></div>
            <div><span>MEASUREMENT</span><b>Baseline, target, owner, and review date</b></div>
          </motion.div>
          <motion.div className={styles.goalRow} variants={fragment}><span>RELATED UN GOALS</span><span><b>07</b> Clean energy</span><span><b>12</b> Responsible use</span><span><b>13</b> Climate action</span></motion.div>
        </motion.div>
      ) : (
        <motion.div className={styles.accountabilityArtifact} variants={fragmentContainer} initial="initial" animate="animate">
          <motion.div variants={fragment}>
            <p className={styles.artifactEyebrow}>OWNERSHIP &amp; REVIEW</p>
            <h3>Make it clear who carries the work forward.</h3>
          </motion.div>
          <motion.div className={styles.roleRows} variants={fragment}>
            <div><span>Board &amp; senior management</span><b>Approve the policy and review progress</b></div>
            <div><span>Sustainability team</span><b>Coordinate actions, targets, and reporting</b></div>
          </motion.div>
          <motion.div className={styles.reviewFooter} variants={fragment}><span>REVIEW MECHANISM</span><b>Set a review owner and cadence that work for your organization.</b></motion.div>
          <motion.div className={styles.exportRow} aria-label="Available export formats" variants={fragment}><span>READY TO REVIEW</span><b>PDF</b><b>Word</b></motion.div>
        </motion.div>
      )}

      <div className={styles.artifactFooter}><span>POLICY DRAFT</span><span>Preview updates with each step</span><span>01</span></div>
    </div>
  );
}

export function PublicWalkthrough() {
  const rootRef = React.useRef<HTMLElement>(null);
  const storyRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const storyTriggerRef = React.useRef<ScrollTrigger | null>(null);
  const [activeStage, setActiveStage] = React.useState<StageId>("structure");
  const stageIndex = stages.findIndex((stage) => stage.id === activeStage);
  const selectedStage = stages[stageIndex] ?? stages[0];

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const intro = root.querySelectorAll<HTMLElement>("[data-walkthrough-enter]");
    gsap.fromTo(intro, { autoAlpha: 0, y: 14 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.62,
      stagger: 0.08,
      ease: "power2.out",
      scrollTrigger: { trigger: root, start: "top 84%", once: true },
    });
    const desktop = gsap.matchMedia();
    desktop.add("(min-width: 1024px) and (min-height: 640px)", () => {
      const story = storyRef.current;
      if (!story || story.offsetHeight > window.innerHeight - 48) return;

      let lastStageIndex = -1;
      const trigger = ScrollTrigger.create({
        id: "policycraft-public-walkthrough",
        trigger: story,
        start: "center center",
        end: () => `+=${Math.max(window.innerHeight * 1.5, 1120)}`,
        pin: story,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const nextIndex = Math.round(self.progress * (stages.length - 1));
          if (nextIndex === lastStageIndex) return;
          lastStageIndex = nextIndex;
          setActiveStage(stages[nextIndex].id);
        },
      });
      storyTriggerRef.current = trigger;
      return () => {
        trigger.kill();
        if (storyTriggerRef.current === trigger) storyTriggerRef.current = null;
      };
    }, root);
    return () => desktop.revert();
  }, { scope: rootRef });

  function activateTab(index: number) {
    const nextIndex = (index + stages.length) % stages.length;
    const nextStage = stages[nextIndex];
    const storyTrigger = storyTriggerRef.current;
    if (storyTrigger) {
      const progress = nextIndex / (stages.length - 1);
      const top = storyTrigger.start + (storyTrigger.end - storyTrigger.start) * progress;
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      setActiveStage(nextStage.id);
    }
    tabRefs.current[nextIndex]?.focus();
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      activateTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      activateTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      activateTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      activateTab(stages.length - 1);
    }
  }

  return (
    <section ref={rootRef} id="how" className={styles.walkthrough} aria-labelledby="walkthrough-heading">
      <div className={styles.walkthroughInner}>
        <header className={styles.walkthroughIntro} data-walkthrough-enter>
          <div>
            <p className={styles.walkthroughEyebrow}>A GUIDED WORKFLOW</p>
            <h2 id="walkthrough-heading">See your policy take shape.</h2>
          </div>
          <p>Move from a clear outline to commitments with owners, targets, and a review plan.</p>
        </header>

        <div className={styles.storyScene} ref={storyRef}>
        <div className={styles.stepTabs} role="tablist" aria-label="Policy building steps" data-walkthrough-enter>
          {stages.map((stage, index) => {
            const selected = stage.id === activeStage;
            return (
              <button
                key={stage.id}
                ref={(element) => { tabRefs.current[index] = element; }}
                id={`policy-step-${stage.id}`}
                className={styles.stepTab}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`policy-stage-${stage.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => activateTab(index)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span>{stage.label}</span>
                {selected && <motion.span className={styles.activeTabMark} layoutId="active-policy-step" transition={{ duration: 0.24 }} aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <div className={styles.stageEnter} data-walkthrough-enter>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selectedStage.id}
            id={`policy-stage-${selectedStage.id}`}
            className={styles.assemblyCanvas}
            role="tabpanel"
            aria-labelledby={`policy-step-${selectedStage.id}`}
            tabIndex={0}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className={styles.stageBrief}>
              <div className={styles.stageStepIcon}><selectedStage.icon size={18} strokeWidth={1.7} aria-hidden="true" /></div>
              <p className={styles.stageIndex}>STEP {String(stageIndex + 1).padStart(2, "0")} / 03</p>
              <h3>{selectedStage.title}</h3>
              <p className={styles.stageSummary}>{selectedStage.summary}</p>
              <ul className={styles.capabilityList}>
                {selectedStage.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
              </ul>
            </div>

            <div className={styles.artifactStage}>
              <PolicyArtifact stage={selectedStage.id} />
            </div>
          </motion.div>
        </AnimatePresence>
        </div>
        </div>
      </div>
    </section>
  );
}
