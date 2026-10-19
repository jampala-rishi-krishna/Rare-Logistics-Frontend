// Layout run of every screen / step of the simplified driver app at 360, 390 and 430 px (mocked API only, e2e/flowMock.ts):
//   - no horizontal scroll: document.scrollingElement.scrollWidth <= innerWidth
//   - scrolled to the bottom, the fixed bottom bar (4-tab nav or the trip action bar) does not cover the last content element
//   - no button whose text has the same colour as its background
//   - sheets: no sideways scroll, last control reachable
// Tap targets under 48 px are printed as a note (not a failure). Run:
//   node --experimental-strip-types --no-warnings --test e2e/driver.screens.test.ts
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright";
import { shot, coveredByFixedBottom, horizontalOverflow, invisibleText, launch, newContext, sheetProblems, smallTargets, startServer, stopServer, BASE } from "./harness.ts";
import { contrastViolations } from "./contrast.ts";
import { installMocks } from "./mockApi.ts";
import type { Scenario } from "./mockApi.ts";
import { BATCH, ackAll, ended, installFlow, newFlow, onTrip } from "./flowMock.ts";
import type { Flow } from "./flowMock.ts";

let browser: Browser;
before(async () => {
  await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  stopServer();
});

const WIDTHS = [360, 390, 430];

interface Screen {
  name: string;
  path: string;
  ready: string;
  flow: () => Flow;
  scenario?: Scenario;
  // open a sheet after the screen is ready: [button to tap, sheet test id, optional extra tap inside the sheet]
  sheet?: [string, string, string?];
}

const SCREENS: Screen[] = [
  { name: "sign-in", path: "/driver/login", ready: "[data-testid=driver-login-submit]", flow: newFlow, scenario: { session: null } },
  { name: "today", path: "/driver/today", ready: "[data-testid=driver-card-action-acknowledge]", flow: newFlow },
  { name: "today-on-trip", path: "/driver/today", ready: "[data-testid=driver-card-action-continue]", flow: () => onTrip(newFlow(), 1) },
  { name: "trip-1-acknowledge", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-ack-all]", flow: newFlow },
  { name: "trip-2-start", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-start-trip]", flow: () => ackAll(newFlow()) },
  { name: "trip-2b-start-sheet", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-start-trip]", flow: () => ackAll(newFlow()), sheet: ["[data-testid=driver-start-trip]", "driver-start-sheet"] },
  { name: "trip-3-arrive", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-im-here]", flow: () => onTrip(newFlow(), 0) },
  { name: "trip-4-at-stop", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-delivered]", flow: () => onTrip(newFlow(), 1, true) },
  { name: "trip-4b-delivered-sheet", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-delivered]", flow: () => onTrip(newFlow(), 0, true), sheet: ["[data-testid=driver-delivered]", "driver-delivered-sheet"] },
  { name: "trip-4c-delivered-sheet-TO", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-delivered]", flow: () => onTrip(newFlow(), 2, true), sheet: ["[data-testid=driver-delivered]", "driver-delivered-sheet"] },
  { name: "trip-4d-not-fully", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-delivered]", flow: () => onTrip(newFlow(), 0, true), sheet: ["[data-testid=driver-delivered]", "driver-delivered-sheet", "[data-testid=driver-not-fully]"] },
  { name: "trip-4e-problem-sheet", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-problem]", flow: () => onTrip(newFlow(), 0, true), sheet: ["[data-testid=driver-problem]", "driver-problem-sheet"] },
  { name: "trip-5-end", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-end-trip]", flow: () => onTrip(newFlow(), 3) },
  { name: "trip-5b-end-sheet", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-end-trip]", flow: () => onTrip(newFlow(), 3), sheet: ["[data-testid=driver-end-trip]", "driver-end-sheet"] },
  { name: "trip-6-waiting-officer", path: `/driver/trip/${BATCH}`, ready: "[data-testid=driver-give-invoices]", flow: () => ended(newFlow()) },
  {
    name: "trip-7-closed",
    path: `/driver/trip/${BATCH}`,
    ready: "[data-testid=driver-closed]",
    flow: () => {
      const f = ended(newFlow());
      f.trip = "closed";
      return f;
    },
  },
  { name: "history", path: "/driver/history", ready: "[data-testid=driver-trip-h-1]", flow: newFlow },
  { name: "profile", path: "/driver/profile", ready: "[data-testid=driver-profile-header]", flow: newFlow },
  { name: "acknowledge-tab", path: "/driver/acknowledge", ready: `[data-testid=driver-ack-trip-button-${BATCH}]`, flow: newFlow },
  { name: "acknowledge-tab-all-done", path: "/driver/acknowledge", ready: "[data-testid=driver-all-acked]", flow: () => ackAll(newFlow()) },
  { name: "alerts-page", path: "/driver/alerts", ready: "[data-testid=driver-alert-assigned]", flow: newFlow },
  { name: "today-delivered", path: "/driver/today", ready: "[data-testid=driver-card-delivered]", flow: () => ended(newFlow()) },
];

async function open(screen: Screen, width: number, lang: "en" | "tl" = "en"): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await newContext(browser, width);
  const page = await context.newPage();
  const recorder = await installMocks(page, screen.scenario ?? {});
  await installFlow(page, screen.flow());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript((lang) => localStorage.setItem("rgf.driver.lang", lang), lang);
  await page.goto(`${BASE}${screen.path}`);
  if (screen.name === "trip-3-arrive") {
    await page.locator("[data-testid=driver-deliver-this-next]").first().click();
  }
  await page.waitForSelector(screen.ready, { timeout: 20_000 });
  await page.waitForTimeout(300);
  return {
    page,
    close: async () => {
      assert.deepEqual(errors, [], `uncaught page errors on ${screen.name}`);
      assert.deepEqual(recorder.unexpected, [], `unexpected network on ${screen.name}`);
      await context.close();
    },
  };
}

const notes: string[] = [];
const results: string[] = [];

describe("driver screens at 360 / 390 / 430: no sideways scroll, nothing under the bottom bar", () => {
  for (const screen of SCREENS) {
    it(screen.name, async () => {
      const problems: string[] = [];
      for (const lang of ["en", "tl"] as const) for (const width of WIDTHS) {
        const { page, close } = await open(screen, width, lang);
        if (screen.sheet) {
          const [button, sheetId, inner] = screen.sheet;
          await page.click(button);
          await page.waitForSelector(`[data-testid=${sheetId}]`);
          if (inner) await page.click(inner);
          await page.waitForTimeout(250);
          for (const p of await sheetProblems(page, sheetId)) problems.push(`${width}px: ${p}`);
        } else {
          const hidden = await coveredByFixedBottom(page);
          if (hidden) problems.push(`${width}px: ${hidden}`);
        }
        const overflow = await horizontalOverflow(page);
        if (overflow > 0) problems.push(`${width}px: horizontal scroll by ${overflow}px`);
        const invisible = await invisibleText(page);
        if (invisible.length) problems.push(`${width}px: text same colour as its background: ${invisible.join("; ")}`);
        const small = await smallTargets(page);
        if (small.length) notes.push(`${screen.name} @${width}: ${small.slice(0, 5).join("; ")}`);
        const contrast = await contrastViolations(page, screen.sheet ? `[data-testid=${screen.sheet[1]}]` : "[data-testid^=driver-]");
        if (contrast.length) problems.push(`${lang}/${width}px contrast: ${JSON.stringify(contrast)}`);
        if (width === 360) {
          if (screen.sheet) await page.locator(`[data-testid=${screen.sheet[1]}] > div > div:last-child`).evaluate(el => { el.scrollTop = 0; });
          await shot(page, `driver-after/${lang}/${screen.name}`, !screen.sheet);
        }
        await close();
      }
      results.push(`${screen.name}: ${problems.length ? "FAIL" : "ok"} at ${WIDTHS.join("/")}`);
      assert.deepEqual(problems, [], `${screen.name}: ${problems.join(" | ")}`);
    });
  }
  after(() => {
    console.log(`\n[layout] ${results.join("\n[layout] ")}`);
    if (notes.length) console.log(`\n[note] tap targets under 48 px:\n  ${notes.join("\n  ")}`);
  });
});

describe("old driver URLs redirect to the new screens", () => {
  const cases: Array<[string, string]> = [
    [`/driver/assignment/${BATCH}`, `/driver/trip/${BATCH}`],
    [`/driver/assignment/${BATCH}/checkout/so-1`, `/driver/trip/${BATCH}`],
    [`/driver/assignment/${BATCH}/handover`, `/driver/trip/${BATCH}`],
    ["/driver/trips", "/driver/history"],
    [`/driver/issues/new?batch=${BATCH}`, `/driver/trip/${BATCH}`],
    ["/driver/issues", "/driver/today"],
  ];
  it("every legacy path lands on a live screen", async () => {
    const context = await newContext(browser, 360);
    const page = await context.newPage();
    const recorder = await installMocks(page, {});
    await installFlow(page, newFlow());
    for (const [from, to] of cases) {
      await page.goto(`${BASE}${from}`);
      await page.waitForURL((u) => u.pathname === to.split("?")[0], { timeout: 15_000 });
    }
    assert.deepEqual(recorder.unexpected, []);
    await context.close();
  });
});
