/**
 * Waits for the page's motion to finish before a layout check or screenshot.
 *
 * The app animates on every machine and ignores prefers-reduced-motion, so
 * emulating `reducedMotion: "reduce"` no longer freezes it. Some motion also
 * runs in JavaScript (Motion springs, GSAP) where Playwright's
 * `animations: "disabled"` cannot reach. This waits until no finite Web
 * Animation is running and no visible element has moved for a few frames.
 * Decorative layers (`aria-hidden`) are ignored because some loop forever.
 */
export async function settleMotion(page, { timeout = 4000, stableFrames = 5 } = {}) {
  await page.evaluate(async ({ timeout, stableFrames }) => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const moving = () => document.getAnimations().some((animation) =>
      animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity);
    const layout = () => Array.from(document.querySelectorAll('body *:not([aria-hidden="true"], [aria-hidden="true"] *)'), (element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return `${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`;
    }).join(";");
    const deadline = performance.now() + timeout;
    let previous = "";
    let still = 0;
    while (still < stableFrames && performance.now() < deadline) {
      await nextFrame();
      const current = layout();
      still = !moving() && current === previous ? still + 1 : 0;
      previous = current;
    }
  }, { timeout, stableFrames });
}
