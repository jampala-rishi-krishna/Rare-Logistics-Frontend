// Phase A (diagnose first): the 5 manager tasks on the PRE-REDESIGN Driver Overview at 1440x900, mocked API.
// Counting rule (SPEC 2.2): every click counts; typing 0; scrolling 0. Results are recorded in src/pages/overview/INVENTORY.md.
// This ran against the old UI (Live / Trips / Invoices & handover / Issues / Export + driver panel sub-tabs) on 2026-10-15,
// before that UI was replaced. It is kept for the record and skipped: the selectors it uses no longer exist.
//   node --experimental-strip-types --no-warnings --test e2e/overview.before.test.ts
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright";
import { launch, shot, startServer, stopServer, BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import * as ov from "./fixtures/overviewData.ts";

const SKIP = process.env.OVERVIEW_BEFORE !== "1" ? "pre-redesign UI was replaced; results recorded in src/pages/overview/INVENTORY.md (set OVERVIEW_BEFORE=1 on the old code to re-run)" : false;

let browser: Browser;
const clicks: Record<string, number> = {};

describe("BEFORE: 5 manager tasks on the old Driver Overview (1440x900)", { skip: SKIP }, () => {
  before(async () => {
    await startServer();
    browser = await launch();
  });
  after(async () => {
    console.log("CLICKS BEFORE", JSON.stringify(clicks));
    await browser?.close();
    stopServer();
  });

  async function open(tripTimeline: unknown = ov.tripTimeline): Promise<{ page: Page; click: (sel: string) => Promise<void>; count: () => number; close: () => Promise<void> }> {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "en-GB", timezoneId: "Asia/Manila" });
    const page = await context.newPage();
    await installMocks(page, { role: "admin", tripTimeline });
    await page.goto(`${BASE}/app/driver-overview`);
    await page.waitForSelector("[data-testid=live-list]", { timeout: 25_000 });
    await page.waitForTimeout(400);
    let n = 0;
    return {
      page,
      click: async (sel: string) => {
        n += 1;
        await page.click(sel);
        await page.waitForTimeout(250);
      },
      count: () => n,
      close: () => context.close(),
    };
  }

  it("task 1: where is every truck in its day now", async () => {
    const { page, count, close } = await open();
    // The board is the default view: but it lists PEOPLE (driver and helper of TRK-1001 are two rows; Alex's 2 trips are summed).
    const rows = await page.locator("[data-testid=live-list] li").count();
    assert.equal(rows, 5);
    await shot(page, "overview-before/task1-where-is-every-truck", false);
    clicks.task1 = count();
    await close();
  });

  it("task 2: who needs attention (no activity, failed/partial, problem reported, far check-in)", async () => {
    const { page, click, count, close } = await open();
    // stale: chip on the board (0 clicks). failed/partial per trip: Trips tab. problem: Issues tab. far check-in: only inside
    // each driver's per-SO timeline (driver row -> Sales Orders sub-tab), driver by driver.
    await click("[data-testid=tab-trips]");
    await page.waitForSelector("[data-testid=trips-table]");
    await click("[data-testid=tab-issues]");
    await page.waitForSelector("[data-testid=issue-IS-20261013-0005]");
    await click("[data-testid=tab-live]");
    for (const id of [101, 103, 104]) {
      await click(`[data-testid=live-row-${id}]`);
      await page.waitForSelector("[data-testid=panel-tab-orders]");
      await click("[data-testid=panel-tab-orders]");
      await page.waitForSelector("[data-testid^=timeline-so-]");
    }
    assert.match((await page.textContent("[data-testid=driver-panel]")) ?? "", /far from the address/);
    await shot(page, "overview-before/task2-who-needs-attention", false);
    clicks.task2 = count();
    await close();
  });

  it("task 3: which invoices haven't come back", async () => {
    const { page, click, count, close } = await open();
    await click("[data-testid=tab-handover]");
    await page.waitForSelector("[data-testid=handover-table]");
    await shot(page, "overview-before/task3-invoices-not-back", false);
    clicks.task3 = count();
    await close();
  });

  it("task 4: show me the proof for SO-TEST-3002 (photo, time, GPS, invoice)", async () => {
    const { page, click, count, close } = await open();
    await page.fill("[data-testid=top-search]", "SO-TEST-3002"); // typing = 0
    await click("[data-testid=live-row-103]");
    await page.waitForSelector("[data-testid=panel-tab-orders]");
    await click("[data-testid=panel-tab-orders]");
    await page.waitForSelector("[data-testid=timeline-so-SO-TEST-3002] [data-testid=timeline-photo]");
    const so = (await page.textContent("[data-testid=timeline-so-SO-TEST-3002]")) ?? "";
    assert.match(so, /Invoice\/DR no\.: 000457/);
    assert.match(so, /GPS/);
    await page.locator("[data-testid=timeline-so-SO-TEST-3002]").scrollIntoViewIfNeeded();
    await shot(page, "overview-before/task4-find-so-proof", false);
    await click("[data-testid=timeline-so-SO-TEST-3002] [data-testid=timeline-photo]");
    await page.waitForSelector("[data-testid=photo-lightbox]");
    await shot(page, "overview-before/task4-find-so-proof-photo", false);
    clicks.task4 = count();
    await close();
  });

  it("task 5: what happened on yesterday's / last week's trips", async () => {
    const { page, click, count, close } = await open();
    await click("[data-testid=tab-trips]"); // own date range, default last 7 days
    await page.waitForSelector("[data-testid=trips-table]");
    await click("[data-testid=trip-row-h-1]");
    await page.waitForSelector("[data-testid=trip-h-1]");
    await shot(page, "overview-before/task5-past-trips", false);
    clicks.task5 = count();
    await close();
  });

  it("main page + order_unassigned shows in the current timeline (recent activity and audit log)", async () => {
    const { page, click, close } = await open(ov.tripTimelineWithUnassign);
    await shot(page, "overview-before/main-page", false);
    await click("[data-testid=live-row-103]");
    await page.waitForSelector("[data-testid=activity-unassigned]");
    assert.match((await page.textContent("[data-testid=activity-unassigned]")) ?? "", /Unassigned by dispatch.*SO-TEST-3006/);
    await click("[data-testid=panel-tab-orders]");
    await click("text=/Show audit log/");
    await page.waitForSelector("text=Unassigned by dispatch - SO-TEST-3006 - was acknowledged - Test Dispatcher");
    await shot(page, "overview-before/unassign-event-in-timeline", false);
    await close();
  });
});
