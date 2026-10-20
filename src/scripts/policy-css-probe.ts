// Reports the computed CSS of each policy content element, per QA case, as
// Chromium prints it. The Typst template is ported from these numbers instead
// of re-deriving the cascade by hand.
//
// Run: npx tsx scripts/policy-css-probe.ts [case,...] > out.txt
// Needs Chrome or Edge installed.
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { createElement } from "react";
import { chromium } from "playwright-core";
import { PolicyPreview } from "../components/policy/policy-preview";
import { createPrintDocument } from "../lib/pdf/print-document";
import { normalizePolicyQuantitative } from "../lib/quantitative";
import { extraParityCases, stepCases, themeQaCases } from "./policy-qa-cases";

const SELECTORS = [
  ".policy-cover-simplified", ".policy-cover-simplified h1", ".policy-cover h1",
  ".policy-section", ".policy-section + .policy-section", ".policy-section-heading", ".policy-section-heading > span", ".policy-section-heading h2", ".policy-section-heading > i",
  ".policy-section > aside", ".policy-section > aside b", ".policy-section-body", ".policy-section-body p",
  ".policy-table-wrap", ".policy-table", ".policy-table th", ".policy-table td:first-child", ".policy-table td:last-child",
  "[data-target-table] th:first-child", "[data-target-table] td:first-child", "[data-target-table] td:nth-child(2)", "[data-target-table] .policy-target-list", "[data-target-table] .policy-target-list li",
  ".policy-focus-list", ".policy-focus-item", ".policy-focus-item b", ".policy-focus-item span",
  ".policy-objective-groups", ".policy-objective-groups > section", ".policy-objective-groups header", ".policy-objective-groups header b", ".policy-objective-groups h3", ".policy-objective-groups :is(ul,ol)", ".policy-objective-groups li",
  ".policy-target-bands", ".policy-target-bands > div", ".policy-target-bands > div > b", ".policy-target-bands > div > section", ".policy-target-bands h3",
  ".policy-journal-targets > div", ".policy-journal-targets > div > b",
  ".policy-modern-targets", ".policy-modern-targets > div", ".policy-modern-targets > div > b", ".policy-modern-targets h3",
  ".policy-target-list", ".policy-target-list > li",
  ".policy-sdg-tiles", ".policy-sdg-tile", ".policy-sdg-tile img", ".policy-sdg-tile span", ".policy-sdg-names", ".policy-sdg-names > div", ".policy-sdg-names b", ".policy-sdg-names span",
  ".policy-responsibility-list", ".policy-responsibility-list > div", ".policy-responsibility-list > div > b", ".policy-responsibility-list h3", ".policy-responsibility-list p",
  ".policy-custom-blocks > p", ".policy-custom-blocks ul", ".policy-custom-blocks ol", ".policy-custom-blocks li", ".policy-section-feature",
  ".sdg-atlas-mosaic", ".sdg-atlas-mosaic .policy-sdg-tile", ".sdg-atlas-mosaic .policy-sdg-tile img", ".sdg-atlas-mosaic .policy-sdg-tile span",
];

const PROPS = ["display", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textTransform", "textAlign", "color", "backgroundColor",
  "marginTop", "marginBottom", "marginLeft", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderTopColor", "borderBottomWidth", "borderBottomColor", "borderLeftWidth", "borderLeftColor", "borderRightWidth",
  "gap", "gridTemplateColumns", "width", "maxWidth", "minHeight", "height", "listStyleType", "textWrap", "verticalAlign", "justifyContent", "alignItems"] as const;

async function main() {
  const only = process.argv[2]?.split(",");
  const cases = [...themeQaCases(), ...extraParityCases(), ...stepCases()].filter((item) => !only || only.includes(item.name));
  const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => existsSync(file));
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.emulateMedia({ media: "print" });
  // Lay out at the printable width, as page.pdf() does.
  await page.setViewportSize({ width: Math.round(166 / 25.4 * 96), height: 1200 });
  for (const item of cases) {
    const policy = normalizePolicyQuantitative(item.policy);
    const markup = renderToStaticMarkup(createElement(PolicyPreview, { policy }));
    await page.setContent(createPrintDocument(markup, policy), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(({ selectors, props }) => {
      const out: Record<string, Record<string, string>> = {};
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) continue;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const values: Record<string, string> = {};
        for (const prop of props) {
          let value = String(style[prop as keyof CSSStyleDeclaration] ?? "");
          if (!value || ["0px", "none", "normal", "auto", "rgba(0, 0, 0, 0)", "baseline", "start", "flex-start"].includes(value)) continue;
          // A border colour only matters where that border has a width.
          const side = /^border(Top|Bottom|Left|Right)Color$/.exec(prop)?.[1];
          if (side && style[`border${side}Width` as "borderTopWidth"] === "0px") continue;
          if (prop === "listStyleType" && style.display !== "list-item") continue;
          if (prop === "width" || prop === "height") continue;
          if (prop === "fontFamily") value = value.split(",")[0];
          values[prop] = value;
        }
        values.box = `${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`;
        // Position inside its section, so engines can be compared box by box.
        const section = element.closest(".policy-section")?.getBoundingClientRect();
        if (section) values.at = `${(rect.left - section.left).toFixed(1)},${(rect.top - section.top).toFixed(1)}`;
        out[selector] = values;
      }
      return out;
    }, { selectors: SELECTORS, props: [...PROPS] });
    // Column widths decide table wrapping, so every table reports them as fractions.
    const tables = await page.evaluate(() => [...document.querySelectorAll(".policy-table")].map((table) => {
      const width = table.getBoundingClientRect().width;
      const heads = [...table.querySelectorAll("thead th")];
      return `${heads.map((th) => th.textContent).join(" | ")}  ->  ${heads.map((th) => (th.getBoundingClientRect().width / width).toFixed(4)).join(" ")}`;
    }));
    console.log(`##### ${item.name}`);
    for (const line of [...new Set(tables)]) console.log(`TABLE ${line}`);
    for (const [selector, values] of Object.entries(report)) {
      console.log(`${selector}  ${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("; ")}`);
    }
  }
  await browser.close();
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
