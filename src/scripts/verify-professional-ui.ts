import { chromium } from "playwright-core";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { templatePreviewPolicy } from "../lib/sample-policies";

async function main() {
  const out = ".theme-qa/templates/ui"; await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.POLICY_PDF_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = [];
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (String(args[0]).endsWith("/api/export/pdf") && response.ok) {
          const border = JSON.parse(String(args[1]?.body)).policy?.templateBrandOverrides?.pageBorder;
          if (border?.widthPt === 3 && border?.insetMm === 14 && border?.scope === "cover") {
            (window as unknown as { qaPdf: number[] }).qaPdf = Array.from(new Uint8Array(await response.clone().arrayBuffer()));
          }
        }
        return response;
      };
    });
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(policy => localStorage.setItem("policycraft-builder-v1", JSON.stringify({ state: { policy, step: "export", importedPolicy: null }, version: 0 })), templatePreviewPolicy("standard-pack", "sustainable-procurement"));
    await page.goto("http://localhost:3000/builder?type=sustainable-procurement", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "Download PDF", exact: true }).waitFor({ timeout: 60000 });
    await page.locator('.pdf-preview[aria-busy="false"]').waitFor({ timeout: 60000 });
    await page.locator("canvas[aria-label]").first().waitFor({ timeout: 60000 });
    if (!(await page.locator("#builder-workflow").isVisible())) throw new Error("Workflow rail is hidden on the export screen.");
    if (await page.locator("canvas[aria-label]").count() < 2) throw new Error("Continuous PDF preview did not render all pages.");
    await page.getByRole("button", { name: "Single page", exact: true }).click();
    if (await page.locator("canvas[aria-label]").count() !== 1) throw new Error("Single-page PDF view did not collapse to one page.");
    await page.getByRole("button", { name: "Continuous scroll", exact: true }).click();
    if (await page.locator("canvas[aria-label]").count() < 2) throw new Error("Continuous PDF view did not restore all pages.");
    await page.screenshot({ path: `${out}/desktop-templates.png` });
    await page.locator("#inspector-tab-design").click();
    await page.getByRole("tab", { name: "design", exact: true }).last().click();
    await page.getByLabel("Show page border").check();
    await page.getByLabel("Border thickness").fill("3");
    await page.getByLabel("Border inset").fill("14");
    await page.getByLabel("Border pages").selectOption("cover");
    await page.locator('.pdf-preview[aria-busy="false"]').waitFor({ timeout: 60000 });
    await page.screenshot({ path: `${out}/desktop-border.png` });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    await (await downloadPromise).saveAs(`${out}/downloaded-preview.pdf`);
    const displayedBytes = Buffer.from(await page.evaluate(() => (window as unknown as { qaPdf: number[] }).qaPdf));
    if (!(await readFile(`${out}/downloaded-preview.pdf`)).equals(displayedBytes)) throw new Error("Downloaded PDF differs from the displayed response.");
    const text = (await page.locator(".textLayer").allInnerTexts()).join(" ");
    if (!text.includes("Procurement")) throw new Error("Selectable PDF text is missing.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Close controls", exact: true }).click();
    await page.getByRole("button", { name: "Design controls", exact: true }).click();
    await page.screenshot({ path: `${out}/mobile-inspector.png` });
    await page.keyboard.press("Escape");
    if (await page.locator("#design-inspector").count()) throw new Error("Escape did not dismiss the inspector.");
    await page.getByRole("button", { name: "Workflow", exact: true }).click();
    if (!(await page.getByRole("button", { name: "Hide workflow", exact: true }).isVisible())) throw new Error("Workflow drawer did not open on mobile.");
    await page.keyboard.press("Escape");
    if (!(await page.getByRole("button", { name: "Workflow", exact: true }).isVisible())) throw new Error("Escape did not dismiss the workflow drawer.");
    await page.screenshot({ path: `${out}/mobile-preview.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error("Mobile workspace overflows horizontally.");
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.getByRole("button", { name: "Design controls", exact: true }).click();
    await page.locator("#inspector-tab-design").click();
    await page.getByRole("tab", { name: "design", exact: true }).last().click();
    await page.route("**/api/export/pdf", route => route.fulfill({ status: 503, body: "QA simulated failure" }));
    await page.getByLabel("Border thickness").fill("6");
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor({ timeout: 60000 });
    if (await page.getByRole("button", { name: "Download PDF", exact: true }).isEnabled()) throw new Error("Outdated download is enabled after preview failure.");
    await page.unroute("**/api/export/pdf");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.locator('.pdf-preview[aria-busy="false"]').waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "Design controls", exact: true }).click();
    await page.screenshot({ path: `${out}/tablet-inspector.png` });
    errors.splice(0, errors.length, ...errors.filter(error => !error.includes("503")));
    await writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("Desktop and mobile inspector, borders, download and selectable PDF text verified.");
  } finally { await browser.close(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
