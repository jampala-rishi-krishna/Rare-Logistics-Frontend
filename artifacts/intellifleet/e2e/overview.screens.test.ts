// Mocked-API UI run of the rebuilt Driver Overview at 1440px (and a narrower desktop width). Run:
//   node --experimental-strip-types --no-warnings --test e2e/overview.screens.test.ts
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright";
import { horizontalOverflow, invisibleText, launch, newContext, shot, startServer, stopServer, BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import type { Recorder, Scenario } from "./mockApi.ts";

let browser: Browser;
before(async () => {
  await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  stopServer();
});

async function open(path: string, ready: string, scenario: Scenario = { role: "admin" }, width = 1440, height = 900): Promise<{ page: Page; recorder: Recorder; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: "en-GB", timezoneId: "Asia/Manila", acceptDownloads: true });
  const page = await context.newPage();
  const recorder = await installMocks(page, { role: "admin", ...scenario });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  await page.waitForSelector(ready, { timeout: 25_000 });
  await page.waitForTimeout(500);
  return {
    page,
    recorder,
    close: async () => {
      assert.deepEqual(errors, [], "uncaught page errors");
      assert.deepEqual(recorder.unexpected.filter((u) => !u.includes("ws://")), [], "unexpected network");
      await context.close();
    },
  };
}

const OVERVIEW = "/app/driver-overview";
const READY = "[data-testid=kpi-strip]";

describe("Driver Overview at 1440", () => {
  it("Live: KPI strip, driver list, empty detail panel (no map)", async () => {
    const { page, close } = await open(OVERVIEW, "[data-testid=live-list]");
    await shot(page, "overview-1-live");
    const kpi = async (id: string) => (await page.textContent(`[data-testid=kpi-${id}]`))?.trim().match(/^\d+/)?.[0];
    assert.equal(await kpi("drivers-active"), "4");
    assert.equal(await kpi("drivers-on-trip"), "1");
    assert.equal(await kpi("sos-assigned"), "17");
    assert.equal(await kpi("sos-delivered"), "5");
    assert.equal(await kpi("sos-failed"), "1");
    assert.equal(await kpi("trips-pending-handover"), "2");
    assert.equal(await kpi("invoices-outstanding"), "5");
    assert.equal(await kpi("issues-open"), "2");
    const strip = (await page.textContent("[data-testid=kpi-strip]")) ?? "";
    assert.match(strip, /2,264 kg\+/); // a partial total is never shown as complete
    assert.match(strip, /1 line without weight/);
    assert.equal(await page.locator("[data-testid=live-list] li").count(), 5);
    assert.equal(await page.locator(".leaflet-container, [data-testid=live-map]").count(), 0, "the Overview has no map");
    assert.doesNotMatch((await page.textContent("[data-testid=driver-overview]")) ?? "", /Live map/);
    assert.equal(await page.locator("[data-testid=tab-settings], [data-testid=tab-map]").count(), 0, "no Settings or Map tab in the Overview");
    const tabs = (await page.locator("[role=tab]").allTextContents()).map((t) => t.replace(/\d+$/, "").trim());
    assert.deepEqual(tabs, ["Live", "Trips", "Invoices & handover", "Issues", "Export CSV"]);
    assert.equal(await page.locator("[data-testid=panel-empty]").count(), 1);
    assert.equal(await horizontalOverflow(page), 0);
    assert.deepEqual(await invisibleText(page), []);
    await close();
  });

  it("Live: Alex has TWO trips and the row says 0 of 6 (the number his own app shows)", async () => {
    const { page, close } = await open(OVERVIEW, "[data-testid=live-list]");
    const row = (await page.textContent("[data-testid=live-row-101]")) ?? "";
    assert.match(row, /0 of 6 SOs done/);
    assert.match(row, /2 trips/);
    assert.match(row, /2 acknowledged/);
    const casey = (await page.textContent("[data-testid=live-row-103]")) ?? "";
    assert.match(casey, /On trip/);
    assert.match(casey, /3 of 5 SOs done/);
    assert.match(casey, /No update for/); // no action for longer than the stale threshold
    assert.match(casey, /354 kg\+/);
    await close();
  });

  it("selecting a driver opens the panel with the per-SO timeline: arrived, departed, GPS, distance, invoice, outcome, time at site", async () => {
    const { page, close } = await open(OVERVIEW, "[data-testid=live-list]");
    await page.click("[data-testid=live-row-103]");
    await page.waitForSelector("[data-testid=trip-stops]");
    await page.click("[data-testid=panel-tab-orders]");
    await page.waitForSelector("[data-testid=timeline-so-SO-TEST-3001]");
    await shot(page, "overview-2-driver-panel-timeline");
    const panel = (await page.textContent("[data-testid=driver-panel]")) ?? "";
    assert.match(panel, /Casey Runner/);
    assert.match(panel, /Acknowledged \(checklist complete\)/);
    assert.match(panel, /Number of packs received: 12 \(2 packs short\)/);
    assert.match(panel, /Arrived at site/);
    assert.match(panel, /Distance from the address: 85 m/);
    assert.match(panel, /far from the address/);
    assert.match(panel, /Departed from site/);
    assert.match(panel, /Invoice\/DR no\.: 000456/);
    assert.match(panel, /Outcome: Partially delivered/);
    assert.match(panel, /Reason: Store closed/);
    assert.match(panel, /Time at site: 20 min/);
    assert.match(panel, /Trip length/);
    await page.click("[data-testid=panel-tab-issues]");
    assert.equal(await page.locator("[data-testid=panel-issues]").count(), 1); // Casey's open issue
    await page.click("[data-testid=panel-tab-orders]");
    await page.waitForSelector("[data-testid=timeline-photo]");
    assert.ok((await page.locator("[data-testid=timeline-photo] img").count()) >= 1, "the proof-of-delivery photo is a thumbnail");
    await page.locator("[data-testid=timeline-photo]").first().click();
    await page.waitForSelector("[data-testid=photo-lightbox]");
    await shot(page, "overview-2b-photo-enlarged");
    await page.click("[data-testid=photo-lightbox] button");
    assert.equal(await page.locator("[data-testid=photo-lightbox]").count(), 0);
    assert.match(panel, /Trip started: .* by Casey Runner/);
    await page.click("[data-testid=panel-history]");
    await page.waitForSelector("[data-testid=panel-trip-b-3]");
    await shot(page, "overview-3-driver-panel-history");
    await close();
  });

  it("search finds a driver by SO number and by plate", async () => {
    const { page, close } = await open(OVERVIEW, "[data-testid=live-list]");
    await page.fill("[data-testid=top-search]", "SO-TEST-4003");
    assert.equal(await page.locator("[data-testid=live-list] li").count(), 1);
    assert.match((await page.textContent("[data-testid=live-list]")) ?? "", /Dana Hauler/);
    await page.fill("[data-testid=top-search]", "trk1001");
    assert.equal(await page.locator("[data-testid=live-list] li").count(), 2); // driver + helper of the same crew
    await page.fill("[data-testid=top-search]", "nobody");
    assert.match((await page.textContent("[data-testid=live-tab]")) ?? "", /No driver matches/);
    await close();
  });

  it("Trips tab: one row per batch with Trip 1 of 2 / 2 of 2, partial weight flagged, expandable timeline", async () => {
    const { page, close } = await open(OVERVIEW, READY);
    await page.click("[data-testid=tab-trips]");
    await page.waitForSelector("[data-testid=trips-table]");
    const table = (await page.textContent("[data-testid=trips-table]")) ?? "";
    assert.match(table, /Trip 1 of 2/);
    assert.match(table, /Trip 2 of 2/);
    assert.match(table, /354 kg\+/);
    await page.click("[data-testid=trip-row-b-3]");
    await page.waitForSelector("[data-testid=timeline-so-SO-TEST-3002]");
    await shot(page, "overview-4-trips");
    await close();
  });

  it("Invoices & handover: who holds each hard copy, problems first", async () => {
    const { page, close } = await open(OVERVIEW, READY);
    await page.click("[data-testid=tab-handover]");
    await page.waitForSelector("[data-testid=handover-table]");
    const rows = await page.locator("[data-testid=handover-table] tbody tr").allTextContents();
    assert.equal(rows.length, 5);
    assert.match(rows[0], /Missing/);
    assert.match(rows[1], /Discrepancy/);
    assert.match(rows[4], /With the driver/);
    assert.match(rows[2], /Olivia Officer/);
    await page.selectOption("[data-testid=handover-filter]", "with_officer");
    assert.equal(await page.locator("[data-testid=handover-table] tbody tr").count(), 2);
    await page.selectOption("[data-testid=handover-filter]", "");
    await shot(page, "overview-5-invoices-handover");
    await close();
  });

  it("Issues: dispatch reads and replies; the reply is sent to the server", async () => {
    const { page, recorder, close } = await open(OVERVIEW, READY);
    await page.click("[data-testid=tab-issues]");
    await page.waitForSelector("[data-testid=issue-IS-20261013-0005]");
    await shot(page, "overview-6-issues");
    await page.locator("[data-testid=issue-IS-20261013-0005] textarea").fill("Replacement carton is on the way.");
    await page.selectOption("[data-testid=issue-IS-20261013-0005] select", "in_progress");
    await page.click("[data-testid=issue-save-IS-20261013-0005]");
    await page.waitForSelector("text=Saved. The driver sees it in Alerts.");
    const sent = recorder.calls.find((c) => c.path === "/api/driver-overview/issues/5/respond");
    assert.deepEqual(sent?.body, { status: "in_progress", response: "Replacement carton is on the way." });
    await close();
  });

  it("Template settings live in Admin > Settings (admin only), not in Driver Overview", async () => {
    const { page, recorder, close } = await open("/admin/settings", "[data-testid=driver-forms-settings]");
    const text = (await page.textContent("[data-testid=driver-forms-settings]")) ?? "";
    assert.match(text, /Delivery time log/);
    assert.match(text, /Added in app, not in Zoho form/);
    assert.match(text, /In the Zoho form/);
    assert.match((await page.textContent("[data-testid=settings-acknowledge_checklist]")) ?? "", /DRAFT/);
    await shot(page, "admin-settings-driver-forms");
    await page.locator("[data-testid=setting-item-notes] input[type=checkbox]").nth(1).uncheck(); // switch the optional notes question off
    await page.click("[data-testid=save-delivery_checkout]");
    await page.waitForTimeout(600);
    const saved = recorder.calls.find((c) => c.method === "POST" && c.path === "/api/driver-overview/templates/delivery_checkout");
    assert.ok(saved, "saved as a new version");
    const items = (saved.body as { items: Array<{ key: string; active: boolean; app_only: boolean }> }).items;
    assert.equal(items.find((i) => i.key === "notes")?.active, false);
    assert.equal(items.find((i) => i.key === "outcome")?.app_only, true);
    assert.equal(items.find((i) => i.key === "delivery_photo")?.app_only, true);
    await close();
  });

  it("Export CSV downloads a file", async () => {
    const { page, recorder, close } = await open(OVERVIEW, READY);
    await page.click("[data-testid=tab-export]");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("[data-testid=export-download]")]);
    assert.match(download.suggestedFilename(), /\.csv$/);
    assert.ok(recorder.calls.some((c) => c.path === "/api/driver-overview/export.csv"));
    await shot(page, "overview-8-export");
    await close();
  });

  it("works at a 1024px desktop width without horizontal scroll", async () => {
    const { page, close } = await open(OVERVIEW, "[data-testid=live-list]", { role: "admin" }, 1024, 800);
    await page.click("[data-testid=live-row-103]");
    await page.waitForSelector("[data-testid=trip-stops]");
    await page.click("[data-testid=panel-tab-orders]");
    await page.waitForSelector("[data-testid=timeline-so-SO-TEST-3001]");
    await shot(page, "overview-9-1024");
    assert.equal(await horizontalOverflow(page), 0);
    await close();
  });
});
