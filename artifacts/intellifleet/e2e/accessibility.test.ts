// Real axe-core checks, against local pages with all API requests mocked.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "playwright";
import { startServer, stopServer, launch, BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";

let browser: Browser;
before(async () => { await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); stopServer(); });

async function check(page: Page, scope: string, label: string) {
  const result = await new AxeBuilder({ page }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  assert.deepEqual(result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })), [], label);
}

test("Overview WCAG/axe: list, drawer and outstanding work across desktop and mobile widths", async () => {
  for (const width of [1440, 1280, 1024, 390]) {
    for (const mode of ["list", "drawer", "invoices", "issues"]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "Asia/Manila" });
    const page = await context.newPage();
    await installMocks(page, { role: "admin" });
    const query = mode === "drawer" ? "?trip=b-3" : mode === "list" ? "" : `?tab=${mode}`;
    await page.goto(`${BASE}/app/driver-overview${query}`);
    const scope = mode === "drawer" ? '[role="dialog"]' : '[data-testid="driver-overview"]';
    await page.locator(scope).waitFor();
    await page.waitForTimeout(500);
    await check(page, scope, `Overview ${mode} ${width}`);
    await context.close();
    }
  }
});

test("Driver WCAG/axe: English and Tagalog at 360, 390 and 430", async () => {
  for (const width of [360, 390, 430]) {
    for (const language of ["en", "tl"]) {
      const context = await browser.newContext({ viewport: { width, height: 780 }, timezoneId: "Asia/Manila" });
      const page = await context.newPage();
      await installMocks(page);
      await page.addInitScript((lang) => localStorage.setItem("rgf.driver.lang", lang), language);
      for (const [path, ready] of [["today", "driver-today"], ["profile", "driver-profile"], ["trip/b-3", "driver-trip-header"]]) {
        await page.goto(`${BASE}/driver/${path}`);
        await page.getByTestId(ready).waitFor();
        await check(page, "body", `Driver ${path} ${width} ${language}`);
      }
      await context.close();
    }
  }
});
