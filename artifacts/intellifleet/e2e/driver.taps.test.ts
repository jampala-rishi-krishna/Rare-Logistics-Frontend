// Driver tap rule (SPEC 6.9): from Today loaded (after sign-in) to trip Closed, one trip with 3 stops (2 SO + 1 TO), a photo on
// every stop. Every tap is counted; typing, the camera shutter (file chooser), officer actions and Google Maps are not.
// BEFORE the 2026-10-15 polish the count was 19 (measured by this spec against the unchanged app, screenshots in
// e2e/screenshots/driver-before/). The polished app must not need more taps.
// Screenshots go to e2e/screenshots/<DRIVER_TAPS_DIR or "driver-taps">/. Run:
//   node --experimental-strip-types --no-warnings --test e2e/driver.taps.test.ts
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { launch, newContext, shot, startServer, stopServer, BASE } from "./harness.ts";
import type { Page } from "playwright";
import type { Browser } from "playwright";
import { installMocks } from "./mockApi.ts";
import { BATCH, bringToFront, installFlow, newFlow } from "./flowMock.ts";

export const TAPS_BEFORE = 19;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const DIR = process.env.DRIVER_TAPS_DIR || "driver-taps";
let browser: Browser;

before(async () => {
  await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  stopServer();
});

async function snap(page: Page, name: string, fullPage = true) {
  await page.waitForFunction(() => !document.querySelector("[data-testid=driver-toast]"), null, { timeout: 10_000 }).catch(() => undefined);
  await shot(page, `${DIR}/${name}`, fullPage);
}

describe("driver tap count (SPEC 6.9)", () => {
  it(`Today loaded -> Closed, 3 stops with photos, takes <= ${TAPS_BEFORE} taps`, async () => {
    const flow = newFlow();
    const context = await newContext(browser, 360, 780);
    const page = await context.newPage();
    const recorder = await installMocks(page, { session: null });
    await installFlow(page, flow);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const taps: string[] = [];
    const tap = async (selector: string, label: string) => {
      taps.push(label);
      await page.click(selector);
    };

    // Sign in (not counted: the rule starts at "Today loaded")
    await page.goto(`${BASE}/driver/login`);
    await page.waitForSelector("[data-testid=driver-login-submit]");
    await snap(page, "00-login");
    await page.fill("[data-testid=driver-login-identifier]", "09170000101");
    await page.fill("[data-testid=driver-login-password]", "correct horse battery");
    await page.click("[data-testid=driver-login-submit]");
    await page.waitForURL("**/driver/today");
    await page.waitForSelector("[data-testid=driver-card-action-acknowledge]");
    await snap(page, "01-today");

    await tap("[data-testid=driver-card-action-acknowledge]", "Today card: acknowledge");
    await page.waitForSelector(`[data-testid=driver-ack-trip-button-${BATCH}]`);
    await snap(page, "02-acknowledge-tab");
    await tap(`[data-testid=driver-ack-trip-button-${BATCH}]`, "Acknowledge tab: acknowledge all");
    await page.waitForSelector("[data-testid=driver-all-acked]");
    await tap("[data-testid=driver-nav-today]", "Today tab");
    await page.waitForSelector("[data-testid=driver-card-action-start]");
    await tap("[data-testid=driver-card-action-start]", "Today card: Start trip");
    await page.waitForSelector("[data-testid=driver-start-sheet]");
    await snap(page, "03-start-sheet", false);
    await tap("[data-testid=driver-start-sheet-confirm]", "Start sheet: confirm");
    await page.waitForURL(`**/driver/trip/${BATCH}`);

    const stops = ["SO-TEST-1001", "SO-TEST-1002", "TO-TEST-0003"];
    for (const [i, no] of stops.entries()) {
      await page.waitForSelector(`[data-testid=driver-current-stop][data-so="${no}"]`);
      await page.waitForSelector("[data-testid=driver-im-here]:not([disabled])");
      if (i === 0) await snap(page, "04-on-trip");
      await tap("[data-testid=driver-im-here]", `Check in (stop ${i + 1})`);
      await page.waitForSelector("[data-testid=driver-delivered]:not([disabled])");
      await tap("[data-testid=driver-delivered]", `Delivered (stop ${i + 1})`);
      await page.waitForSelector("[data-testid=driver-delivered-sheet]");
      if (i === 1) await page.fill("[data-testid=driver-invoice-input]", "000457"); // typing: not counted
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), tap("[data-testid=driver-photo-add]", `Take photo (stop ${i + 1})`)]);
      await chooser.setFiles({ name: "pod.png", mimeType: "image/png", buffer: PNG }); // camera shutter: not counted
      await page.waitForSelector("[data-testid=driver-photo-taken]");
      if (i === 0) await snap(page, "05-delivered-sheet-photo", false);
      await tap("[data-testid=driver-delivered-submit]", `Delivered submit (stop ${i + 1})`);
      await page.waitForSelector("[data-testid=driver-delivered-sheet]", { state: "detached" });
    }
    await page.waitForSelector("[data-testid=driver-end-trip]:not([disabled])");
    await tap("[data-testid=driver-end-trip]", "End trip");
    await page.waitForSelector("[data-testid=driver-end-sheet]");
    await snap(page, "06-end-sheet", false);
    await tap("[data-testid=driver-end-sheet-confirm]", "End sheet: confirm");
    await page.waitForSelector("[data-testid=driver-give-invoices]");
    await snap(page, "07-waiting-officer");

    // Officer validates (not counted); the screen picks it up on the next refresh.
    flow.trip = "closed";
    await bringToFront(page);
    await page.waitForSelector("[data-testid=driver-closed]", { timeout: 30_000 });
    await snap(page, "08-closed");

    assert.equal(flow.uploads, 3, "a photo on every stop (2 SO + 1 TO)");
    console.log(`\n[driver taps] Today loaded -> Closed: ${taps.length} (before: ${TAPS_BEFORE})\n  ${taps.map((t, i) => `${i + 1}. ${t}`).join("\n  ")}\n`);
    assert.ok(taps.length <= TAPS_BEFORE, `tap count ${taps.length} must not exceed ${TAPS_BEFORE}`);
    assert.deepEqual(errors, []);
    assert.deepEqual(recorder.unexpected, []);
    await context.close();
  });
});
