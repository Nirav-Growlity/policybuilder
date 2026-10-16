"use client";

// Adapted from React Bits SplitText (https://reactbits.dev/text-animations/split-text, TS-CSS variant).
// Trimmed to the view/load entrance; the tag keeps the layout its own stylesheet gives it, "\n" in
// `text` becomes a line break, and extra props (id, data-*, tabIndex) land on the tag.
// Like the rest of the home page, it plays regardless of the OS reduce-motion setting.

import * as React from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText as GSAPSplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, GSAPSplitText, useGSAP);

export type SplitTextEffect = "rise" | "fade" | "blur";

type SplitTag = "h1" | "h2" | "h3" | "p" | "span";

export type SplitTextProps = Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  text: string;
  tag?: SplitTag;
  splitType?: "chars" | "words" | "lines";
  effect?: SplitTextEffect;
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  /** Gap between pieces, in milliseconds. */
  delay?: number;
  duration?: number;
  ease?: string;
  /** Seconds before the first piece moves. */
  startDelay?: number;
  threshold?: number;
  rootMargin?: string;
  staggerFrom?: "start" | "center" | "end" | "edges" | "random";
  trigger?: "view" | "load";
  onLetterAnimationComplete?: () => void;
};

type Look = { from: gsap.TweenVars; to: gsap.TweenVars; ease: string };

const fontsAreLoaded = () => typeof document !== "undefined" && (!document.fonts || document.fonts.status === "loaded");

function getEffect(effect: SplitTextEffect, em: number): Look {
  if (effect === "fade") return { from: { opacity: 0 }, to: { opacity: 1 }, ease: "power2.inOut" };
  if (effect === "blur") return { from: { opacity: 0, filter: `blur(${Math.round(em * 1.4) / 10}px)` }, to: { opacity: 1, filter: "blur(0px)" }, ease: "power2.out" };
  return { from: { opacity: 0, y: em * 0.6 }, to: { opacity: 1, y: 0 }, ease: "power3.out" };
}

export function SplitText({
  text,
  tag = "p",
  splitType = "words",
  effect = "rise",
  from,
  to,
  delay = 50,
  duration = 1.1,
  ease,
  startDelay = 0,
  threshold = 0.1,
  rootMargin = "-60px",
  staggerFrom = "start",
  trigger = "view",
  onLetterAnimationComplete,
  style,
  ...props
}: SplitTextProps) {
  const ref = React.useRef<HTMLElement>(null);
  const completedTextRef = React.useRef<string | null>(null);
  const onCompleteRef = React.useRef(onLetterAnimationComplete);
  const [fontsLoaded, setFontsLoaded] = React.useState(fontsAreLoaded);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    onCompleteRef.current = onLetterAnimationComplete;
  });

  React.useEffect(() => {
    if (fontsLoaded) return undefined;
    let active = true;
    void document.fonts.ready.then(() => { if (active) setFontsLoaded(true); });
    return () => { active = false; };
  }, [fontsLoaded]);

  useGSAP(() => {
    const el = ref.current;
    if (!el || !text || !fontsLoaded) return;

    const finish = () => {
      if (completedTextRef.current === text) return;
      completedTextRef.current = text;
      onCompleteRef.current?.();
    };

    const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin);
    const marginValue = marginMatch ? parseFloat(marginMatch[1]) : 0;
    const marginUnit = marginMatch ? marginMatch[2] || "px" : "px";
    const sign = marginValue === 0 ? "" : marginValue < 0 ? `-=${Math.abs(marginValue)}${marginUnit}` : `+=${marginValue}${marginUnit}`;
    const start = `top ${(1 - threshold) * 100}%${sign}`;

    const em = parseFloat(getComputedStyle(el).fontSize) || 16;
    const custom = from !== undefined || to !== undefined;
    const look = getEffect(effect, em);
    const fromVars: gsap.TweenVars = custom ? { opacity: 0, y: 40, ...from } : look.from;
    const toVars: gsap.TweenVars = custom ? { opacity: 1, y: 0, ...to } : look.to;
    const easing = ease || look.ease;
    const revealed = completedTextRef.current === text;

    const splitInstance = new GSAPSplitText(el, {
      type: splitType,
      smartWrap: true,
      autoSplit: splitType === "lines",
      linesClass: "split-line",
      wordsClass: "split-word",
      charsClass: "split-char",
      reduceWhiteSpace: false,
      // The tag carries its own aria-label (line breaks read as spaces), so GSAP adds no aria attributes.
      aria: "none",
      onSplit: (self: GSAPSplitText) => {
        if (revealed) return undefined;
        const pieces = [self[splitType], self.chars, self.words, self.lines].find((list) => list.length) || [];
        return gsap.timeline({
          delay: startDelay,
          scrollTrigger: trigger === "load" ? undefined : { trigger: el, start, once: true, fastScrollEnd: true },
          onComplete: finish,
        })
          .fromTo(pieces, { ...fromVars, willChange: "transform, opacity" }, {
            ...toVars,
            duration,
            ease: easing,
            stagger: gsap.utils.distribute({ each: delay / 1000, from: staggerFrom }),
            immediateRender: true,
          })
          // Pieces rest without transforms or compositor layers, so the settled text stays crisp.
          .set(pieces, { clearProps: "transform,filter,willChange" });
      },
    });
    setReady(true);

    return () => {
      ScrollTrigger.getAll().forEach((st) => { if (st.trigger === el) st.kill(); });
      splitInstance.revert();
    };
  }, {
    dependencies: [text, delay, duration, ease, startDelay, splitType, JSON.stringify(from), JSON.stringify(to), threshold, rootMargin, staggerFrom, effect, trigger, fontsLoaded],
    scope: ref,
    revertOnUpdate: true,
  });

  const lines = text.split("\n");
  return React.createElement(
    tag,
    { key: text, ref, "aria-label": lines.map((line) => line.trim()).join(" "), ...props, style: { ...style, visibility: ready ? undefined : "hidden" } },
    lines.map((line, index) => <React.Fragment key={index}>{index > 0 ? <br /> : null}{line}</React.Fragment>),
  );
}
