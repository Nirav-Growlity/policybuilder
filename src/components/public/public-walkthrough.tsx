"use client";

import * as React from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BarChart3,
  FileText,
  Globe2,
  ListChecks,
  ScrollText,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./public-walkthrough.module.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Capability = { icon: LucideIcon; title: string; description: string };
type Phase = { id: string; title: string; summary: string; capabilities: Capability[] };

const phases: Phase[] = [
  {
    id: "structure",
    title: "Set the policy foundation",
    summary: "Start with a clear structure and a declaration that fits the organization.",
    capabilities: [
      { icon: FileText, title: "Document structure", description: "Customize and arrange policy sections." },
      { icon: ScrollText, title: "Declaration & scope", description: "Preface, declaration and scope - with AI writing assist." },
    ],
  },
  {
    id: "commitments",
    title: "Turn priorities into commitments",
    summary: "Choose relevant focus areas, define actions, set targets, and connect them to the SDGs.",
    capabilities: [
      { icon: Target, title: "Key focus areas", description: "Curated environmental topics you can edit or augment." },
      { icon: ListChecks, title: "Qualitative objectives", description: "Per-focus-area commitment statements, AI-suggested." },
      { icon: BarChart3, title: "Quantitative targets", description: "Measurable, time-bound targets with baselines and deadlines." },
      { icon: Globe2, title: "SDG alignment", description: "Visual mapping to the 17 UN Sustainable Development Goals." },
    ],
  },
  {
    id: "responsibility",
    title: "Assign ownership and prepare to publish",
    summary: "Give people clear responsibilities, then review the finished policy before export.",
    capabilities: [
      { icon: Users, title: "Responsibilities", description: "Roles, duties, monitoring, and review mechanism." },
      { icon: FileText, title: "Preview & export", description: "Live document preview, print-ready PDF and editable Word." },
    ],
  },
];

function PhaseDocument({ phase, compact = false }: { phase: Phase; compact?: boolean }) {
  return (
    <div className={`${styles.documentPreview} ${compact ? styles.documentPreviewCompact : ""}`}>
      <div className={styles.documentMasthead}>
        <span className={styles.documentSeal}><span /></span>
        <span>POLICYCRAFT · SAMPLE</span>
      </div>
      <div className={styles.documentDivider} />
      <p className={styles.documentEyebrow}>{phase.id === "structure" ? "POLICY FRAMEWORK" : phase.id === "commitments" ? "COMMITMENTS & TARGETS" : "GOVERNANCE & REVIEW"}</p>
      <h4 className={styles.documentTitle}>{phase.id === "structure" ? "Environmental Policy" : phase.id === "commitments" ? "Our Commitments" : "Roles & Review"}</h4>
      <p className={styles.documentLead}>{phase.id === "structure" ? "Purpose, scope, and policy declaration" : phase.id === "commitments" ? "Focus areas with measurable actions" : "Clear ownership and regular review"}</p>

      {phase.id === "structure" ? (
        <div className={styles.documentTextBlock}>
          <span />
          <span />
          <span className={styles.documentTextShort} />
        </div>
      ) : phase.id === "commitments" ? (
        <div className={styles.documentCommitments}>
          <div><span className={styles.documentIcon}><Target size={11} aria-hidden="true" /></span><span>Focus area</span><b>Energy and emissions</b></div>
          <div><span className={styles.documentIcon}><ListChecks size={11} aria-hidden="true" /></span><span>Objective</span><b>Improve operational efficiency</b></div>
          <div><span className={styles.documentIcon}><BarChart3 size={11} aria-hidden="true" /></span><span>Target</span><b>Track progress and review</b></div>
          <div><span className={styles.documentIcon}><Globe2 size={11} aria-hidden="true" /></span><span>SDG link</span><b>Responsible consumption</b></div>
        </div>
      ) : (
        <div className={styles.documentRoles}>
          <div><span>Board &amp; senior management</span><b>Approve policy and review progress</b></div>
          <div><span>Sustainability team</span><b>Coordinate targets and reporting</b></div>
          <div className={styles.reviewLine}><span>Review mechanism</span><b>Regular review and updates</b></div>
        </div>
      )}
      <div className={styles.documentFooter}><span>Environmental Policy</span><span>PolicyCraft</span></div>
    </div>
  );
}

function InlinePreview({ phase }: { phase: Phase }) {
  return (
    <div className={styles.inlinePreview} aria-hidden="true">
      <div className={styles.inlinePreviewLabel}><span>Policy preview</span><span>Phase {String(phases.indexOf(phase) + 1).padStart(2, "0")}</span></div>
      <PhaseDocument phase={phase} compact />
    </div>
  );
}

export function PublicWalkthrough() {
  const rootRef = React.useRef<HTMLElement>(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;

    const media = gsap.matchMedia();
    media.add({
      desktop: "(min-width: 1024px) and (min-height: 720px)",
      motionAllowed: "(prefers-reduced-motion: no-preference)",
    }, ({ conditions }) => {
      const noPreference = Boolean(conditions?.motionAllowed);
      if (!noPreference) return;

      const revealTargets = root.querySelectorAll<HTMLElement>("[data-walkthrough-reveal]");
      if (revealTargets.length) {
        ScrollTrigger.batch(revealTargets, {
          start: "top 88%",
          once: true,
          onEnter: (elements) => gsap.fromTo(elements,
            { autoAlpha: 0, y: 12 },
            { autoAlpha: 1, y: 0, duration: 0.38, stagger: 0.055, ease: "power2.out", overwrite: "auto" },
          ),
        });
      }

      if (!conditions?.desktop) return;

      const preview = root.querySelector<HTMLElement>("[data-desktop-preview]");
      const stage = root.querySelector<HTMLElement>("[data-desktop-preview-stage]");
      const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-phase-copy]"));
      const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-desktop-phase]"));
      const label = root.querySelector<HTMLElement>("[data-desktop-phase-label]");
      const index = root.querySelector<HTMLElement>("[data-desktop-phase-index]");
      if (!preview || !stage || !groups.length || !panels.length) return;

      const resetPhaseMetadata = () => {
        if (label) label.textContent = phases[0].title;
        if (index) index.textContent = "01 / 03";
        root.querySelectorAll<HTMLElement>("[data-phase-progress]").forEach((marker) => {
          marker.dataset.active = String(marker.dataset.phaseProgress === phases[0].id);
        });
      };

      stage.dataset.enhanced = "true";
      gsap.set(panels, { autoAlpha: 0 });
      gsap.set(panels[0], { autoAlpha: 1 });
      resetPhaseMetadata();

      const activate = (phaseId: string) => {
        const next = panels.find((panel) => panel.dataset.desktopPhase === phaseId);
        if (!next || next === panels.find((panel) => Number(gsap.getProperty(panel, "autoAlpha")) > 0.5)) return;
        gsap.set(next, { autoAlpha: 0 });
        gsap.to(panels, { autoAlpha: 0, duration: 0.2, overwrite: true });
        gsap.to(next, { autoAlpha: 1, duration: 0.28, overwrite: true });
        const phaseNumber = phases.findIndex((phase) => phase.id === phaseId) + 1;
        if (label) label.textContent = phases[phaseNumber - 1]?.title ?? "";
        if (index) index.textContent = `0${phaseNumber} / 03`;
        root.querySelectorAll<HTMLElement>("[data-phase-progress]").forEach((marker) => {
          marker.dataset.active = String(marker.dataset.phaseProgress === phaseId);
        });
      };

      const lastGroup = groups.at(-1);
      ScrollTrigger.create({
        trigger: groups[0],
        start: "top top+=112",
        endTrigger: lastGroup,
        end: "bottom bottom-=96",
        pin: preview,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      });

      groups.forEach((group) => {
        const phaseId = group.dataset.phaseCopy;
        if (!phaseId) return;
        ScrollTrigger.create({
          trigger: group,
          start: "top center",
          end: "bottom center",
          onEnter: () => activate(phaseId),
          onEnterBack: () => activate(phaseId),
        });
      });

      ScrollTrigger.refresh();
      return () => {
        delete stage.dataset.enhanced;
        resetPhaseMetadata();
      };
    }, root);

    return () => media.revert();
  }, { scope: rootRef });

  return (
    <section ref={rootRef} id="how" className={styles.walkthrough} aria-labelledby="walkthrough-heading">
      <div className={styles.walkthroughInner}>
        <header className={styles.walkthroughIntro} data-walkthrough-reveal>
          <h2 id="walkthrough-heading">Eight steps. One policy ready to review.</h2>
          <p>Build your policy from its structure through commitments, ownership, and export.</p>
        </header>

        <div className={styles.walkthroughGrid}>
          <div className={styles.phaseList}>
            {phases.map((phase, phaseIndex) => (
              <section key={phase.id} className={styles.phaseCopy} data-phase-copy={phase.id} aria-labelledby={`phase-${phase.id}`}>
                <div className={styles.phaseHeading} data-walkthrough-reveal>
                  <span className={styles.phaseNumber}>{String(phaseIndex + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 id={`phase-${phase.id}`}>{phase.title}</h3>
                    <p>{phase.summary}</p>
                  </div>
                </div>
                <ul className={styles.capabilityList}>
                  {phase.capabilities.map(({ icon: Icon, title, description }) => (
                    <li key={title} className={styles.capability} data-walkthrough-reveal>
                      <span className={styles.capabilityIcon}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
                      <div>
                        <h4>{title}</h4>
                        <p>{description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <InlinePreview phase={phase} />
              </section>
            ))}
          </div>

          <aside className={styles.desktopPreview} data-desktop-preview aria-hidden="true">
            <div className={styles.desktopPreviewHeader}>
              <span>Policy preview</span>
              <span data-desktop-phase-index>01 / 03</span>
            </div>
            <p className={styles.desktopPreviewTitle} data-desktop-phase-label>{phases[0].title}</p>
            <div className={styles.desktopPreviewStage} data-desktop-preview-stage>
              {phases.map((phase, index) => (
                <div
                  key={phase.id}
                  className={styles.desktopPhase}
                  data-desktop-phase={phase.id}
                  data-initial={index === 0 ? "true" : undefined}
                >
                  <PhaseDocument phase={phase} />
                </div>
              ))}
            </div>
            <div className={styles.phaseProgress}>
              {phases.map((phase, index) => <span key={phase.id} data-phase-progress={phase.id} data-active={index === 0 ? "true" : "false"} />)}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
