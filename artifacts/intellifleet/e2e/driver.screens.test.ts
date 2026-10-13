// Mocked-API UI run of every driver screen and state (Phase 1). Run: node --experimental-strip-types --no-warnings --test e2e/driver.screens.test.ts
// Screenshots go to e2e/screenshots/. Every screen is also checked at 360 / 390 / 430 px for: no horizontal scroll, 48 px tap targets,
// nothing hidden behind the bottom bar. Any request that is not answered by the fixtures fails the run.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright";
import { hiddenBehindBottomBar, horizontalOverflow, invisibleText, launch, newContext, shot, smallTargets, startServer, stopServer, BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import type { Recorder, Scenario } from "./mockApi.ts";
import * as d from "./fixtures/driverData.ts";

let browser: Browser;

before(async () => {
  await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  stopServer();
});

interface Screen {
  name: string;
  path: string;
  ready: string; // a selector that proves the screen rendered its real content
  scenario?: Scenario;
  widths?: number[];
}

const ALL_WIDTHS = [360, 390, 430];

async function open(screen: Screen, width: number): Promise<{ page: Page; recorder: Recorder; close: () => Promise<void> }> {
  const context = await newContext(browser, width);
  const page = await context.newPage();
  const recorder = await installMocks(page, screen.scenario);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}${screen.path}`);
  await page.waitForSelector(screen.ready, { timeout: 20_000 });
  await page.waitForTimeout(350);
  return {
    page,
    recorder,
    close: async () => {
      assert.deepEqual(errors, [], `uncaught page errors on ${screen.name}`);
      assert.deepEqual(recorder.unexpected, [], `unexpected network on ${screen.name}`);
      await context.close();
    },
  };
}

const SCREENS: Screen[] = [
  { name: "login", path: "/driver/login", ready: "[data-testid=driver-login-submit]", scenario: { session: null } },
  { name: "forgot-password", path: "/driver/forgot-password", ready: "[data-testid=driver-forgot-call]", scenario: { session: null } },
  { name: "today", path: "/driver/today", ready: "[data-testid=driver-kpis]" },
  { name: "today-empty", path: "/driver/today", ready: "[data-testid=driver-empty-today]", scenario: { today: d.todayEmpty } },
  { name: "trip-1-acknowledge", path: "/driver/assignment/b-1", ready: "[data-testid=driver-trip-summary]" },
  { name: "trip-2-ready-to-start", path: "/driver/assignment/b-2", ready: "[data-testid=driver-start-trip]", scenario: { detail: { "b-2": d.detailReady } } },
  { name: "trip-3-on-trip-arrive", path: "/driver/assignment/b-3", ready: "[data-testid=driver-arrived-SO-TEST-1004]" },
  { name: "trip-4-arrived-far", path: "/driver/assignment/b-3", ready: "[data-testid=driver-checkout-SO-TEST-1004]", scenario: { detail: { "b-3": d.detailArrived } } },
  { name: "trip-5-returned-handover", path: "/driver/assignment/b-3", ready: "[data-testid=driver-handover-link]", scenario: { detail: { "b-3": d.detailReturned } } },
  { name: "trip-6-handover-waiting", path: "/driver/assignment/b-3", ready: "[data-testid=driver-trip-summary]", scenario: { detail: { "b-3": d.detailHandoverWaiting } } },
  { name: "acknowledge-checklist", path: "/driver/assignment/b-1/acknowledge/so-3", ready: "text=Products match the SO lines" },
  { name: "route-and-stops", path: "/driver/assignment/b-3/route", ready: "[data-testid=driver-stops]" },
  { name: "checkout-time-log", path: "/driver/assignment/b-3/checkout/so-4", ready: "[data-testid=driver-field-invoice_dr_number]", scenario: { detail: { "b-3": d.detailArrived } } },
  { name: "handover-carbon-copies", path: "/driver/assignment/b-3/handover", ready: "[data-testid=driver-handover-submit]", scenario: { detail: { "b-3": d.detailReturned } } },
  { name: "trips-all", path: "/driver/trips", ready: "[data-testid=driver-trips-list]" },
  { name: "trips-empty", path: "/driver/trips", ready: "[data-testid=driver-trips-empty]", scenario: { history: () => d.historyEmpty } },
  { name: "alerts-all", path: "/driver/alerts", ready: "[data-testid=driver-alerts-list]" },
  { name: "alerts-empty", path: "/driver/alerts", ready: "[data-testid=driver-alerts-empty]", scenario: { alerts: d.alertsEmpty } },
  { name: "profile", path: "/driver/profile", ready: "[data-testid=driver-profile-header]" },
  { name: "issue-form", path: "/driver/issues/new?batch=b-3&so=so-2", ready: "[data-testid=driver-issue-submit]" },
  { name: "issues-list", path: "/driver/issues", ready: "[data-testid=driver-issues-list]" },
  { name: "issues-empty", path: "/driver/issues", ready: "[data-testid=driver-issues-empty]", scenario: { issues: d.issuesEmpty } },
];

describe("every driver screen at 360 / 390 / 430", () => {
  for (const screen of SCREENS) {
    it(screen.name, async () => {
      const problems: string[] = [];
      for (const width of screen.widths ?? ALL_WIDTHS) {
        const { page, close } = await open(screen, width);
        if (width === 360) await shot(page, screen.name);
        const overflow = await horizontalOverflow(page);
        if (overflow > 0) problems.push(`${width}px: horizontal scroll by ${overflow}px`);
        const small = await smallTargets(page);
        if (small.length > 0) problems.push(`${width}px: tap targets under 48px: ${small.slice(0, 6).join("; ")}`);
        const invisible = await invisibleText(page);
        if (invisible.length > 0) problems.push(`${width}px: text invisible (same colour as its background): ${invisible.join("; ")}`);
        const hidden = await hiddenBehindBottomBar(page);
        if (hidden) problems.push(`${width}px: ${hidden}`);
        await close();
      }
      assert.deepEqual(problems, [], `${screen.name}: ${problems.join(" | ")}`);
    });
  }
});

describe("behaviour", () => {
  it("login: wrong password shows a clear error, show/hide works, forgot password is reachable", async () => {
    const { page, close } = await open({ name: "login-flow", path: "/driver/login", ready: "[data-testid=driver-login-submit]", scenario: { session: null } }, 360);
    await page.fill("[data-testid=driver-login-identifier]", "wrong@example.test");
    await page.fill("[data-testid=driver-login-password]", "not-the-password");
    assert.equal(await page.getAttribute("[data-testid=driver-login-password]", "type"), "password");
    await page.click("[data-testid=driver-login-toggle]");
    assert.equal(await page.getAttribute("[data-testid=driver-login-password]", "type"), "text");
    await page.click("[data-testid=driver-login-submit]");
    await page.waitForSelector("[data-testid=driver-login-error]");
    assert.match((await page.textContent("[data-testid=driver-login-error]")) ?? "", /Wrong phone number, email or password/);
    await shot(page, "login-error-password-visible");
    await page.click("[data-testid=driver-forgot-link]");
    await page.waitForSelector("[data-testid=driver-forgot-call]");
    assert.equal(await page.getAttribute("[data-testid=driver-forgot-call]", "href"), "tel:0285550100");
    await close();
  });

  it("login: a correct sign-in lands on Today", async () => {
    const { page, close } = await open({ name: "login-ok", path: "/driver/login", ready: "[data-testid=driver-login-submit]", scenario: { session: null } }, 360);
    await page.fill("[data-testid=driver-login-identifier]", "09170000101");
    await page.fill("[data-testid=driver-login-password]", "correct horse battery");
    await page.click("[data-testid=driver-login-submit]");
    await page.waitForURL("**/driver/today");
    await close();
  });

  it("Today shows two real trips of one truck as Trip 1 / Trip 2, KPIs from the server and one primary action each", async () => {
    const { page, close } = await open({ name: "today-trips", path: "/driver/today", ready: "[data-testid=driver-kpis]" }, 360);
    const text = (await page.textContent("main")) ?? "";
    assert.match(text, /Trip 1 of 2/);
    assert.match(text, /Trip 2 of 2/);
    assert.equal(await page.textContent("[data-testid=kpi-assigned]").then((t) => t?.replace(/\D+$/, "").match(/^\d+/)?.[0]), "11");
    assert.match(text, /354 kg\+/); // partial weight is never shown as complete
    assert.match(text, /1 line without weight/);
    assert.equal(await page.locator("[data-testid=driver-batch-b-1] [data-testid=driver-card-action-acknowledge]").count(), 1);
    assert.equal(await page.locator("[data-testid=driver-batch-b-2] [data-testid=driver-card-action-start]").count(), 1);
    assert.equal(await page.locator("[data-testid=driver-batch-b-3] [data-testid=driver-card-action-arrive]").count(), 1);
    assert.equal(await page.locator("[data-testid=driver-batch-b-1] [data-testid=driver-packs]").textContent(), "—"); // unknown packs are a dash, never 0
    assert.equal(await page.locator("[data-testid=driver-batch-b-3] [data-testid=driver-packs]").textContent(), "66");
    assert.equal(await page.locator("[data-testid=driver-batch-b-3] [data-testid=driver-card-progress]").count(), 1);
    await close();
  });

  it("bottom navigation: Today, Trips, Alerts, Profile, with the unread count", async () => {
    const { page, close } = await open({ name: "nav", path: "/driver/today", ready: "[data-testid=driver-kpis]" }, 360);
    const labels = await page.locator("nav[aria-label='Driver navigation'] a").allTextContents();
    assert.deepEqual(labels.map((l) => l.trim()), ["Today", "Trips", "Alerts", "Profile"]);
    assert.equal((await page.textContent("[data-testid=driver-unread]"))?.trim(), "3");
    await page.click("[data-testid=driver-nav-trips]");
    await page.waitForURL("**/driver/trips");
    await page.click("[data-testid=driver-nav-profile]");
    await page.waitForURL("**/driver/profile");
    await close();
  });

  it("trip detail: invoice number shown for departed stops, route map drawn from real coordinates", async () => {
    const { page, close } = await open({ name: "trip-map", path: "/driver/assignment/b-3", ready: "[data-testid=driver-route-map]" }, 360);
    assert.match((await page.textContent("main")) ?? "", /Invoice\/DR 000456/);
    assert.ok((await page.locator(".leaflet-marker-icon").count()) >= 5, "origin + stops are markers");
    await shot(page, "trip-map-section");
    await close();
  });

  it("check-out is the Delivery time log: Invoice/DR first (numeric, prefilled hint), outcome, reason only when needed", async () => {
    const { page, close } = await open({ name: "checkout-flow", path: "/driver/assignment/b-3/checkout/so-4", ready: "[data-testid=driver-field-invoice_dr_number]", scenario: { detail: { "b-3": d.detailArrived } } }, 360);
    const input = page.locator("[data-testid=driver-field-invoice_dr_number] input");
    assert.equal(await input.getAttribute("inputmode"), "numeric");
    await input.fill("12ab34");
    assert.equal(await input.inputValue(), "1234"); // digits only
    assert.equal(await page.locator("[data-testid=driver-field-reason]").count(), 0);
    await page.click("text=Failed");
    await page.waitForSelector("[data-testid=driver-field-reason]");
    await shot(page, "checkout-time-log-failed-needs-reason");
    await page.click("[data-testid=driver-checkout-submit]");
    await page.waitForSelector("text=Give a reason");
    await close();
  });

  it("Trips: filters and server-side paging (Load more)", async () => {
    const calls: string[] = [];
    const scenario: Scenario = {
      history: (params) => {
        calls.push(`${params.get("status")}:${params.get("page")}`);
        if (params.get("status") === "failed") return d.historyFailed;
        return params.get("page") === "2" ? { ...d.historyPage1, page: 2, has_more: false, batches: [{ ...d.historyAll.batches[3], batch_id: "h-9" }] } : d.historyPage1;
      },
    };
    const { page, close } = await open({ name: "trips-flow", path: "/driver/trips", ready: "[data-testid=driver-trips-list]", scenario }, 360);
    assert.match((await page.textContent("[data-testid=driver-trips-count]")) ?? "", /Showing 4 of 12/);
    await page.click("[data-testid=driver-trips-more]");
    await page.waitForSelector("[data-testid=driver-trip-h-9]");
    await shot(page, "trips-all-after-load-more");
    await page.click("[data-testid=driver-filter-failed]");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid^=driver-trip-h-]").length === 1);
    await shot(page, "trips-failed");
    assert.ok(calls.includes("failed:1"), `filter is applied by the server: ${calls.join(",")}`);
    await page.click("[data-testid=driver-filter-all]");
    await page.click("text=Date range");
    await page.fill("[data-testid=driver-range-from]", "2026-10-10");
    await page.fill("[data-testid=driver-range-to]", "2026-10-01");
    await page.click("[data-testid=driver-range-apply]");
    await page.waitForSelector("text=The start date must be on or before the end date.");
    await shot(page, "trips-date-range-error");
    await close();
  });

  it("Alerts: unread / important tabs, tapping an alert marks it read and opens it, mark all read", async () => {
    const { page, recorder, close } = await open({ name: "alerts-flow", path: "/driver/alerts", ready: "[data-testid=driver-alerts-list]" }, 360);
    await page.click("[data-testid=driver-alerts-tab-unread]");
    assert.equal(await page.locator("[data-testid=driver-alerts-list] li").count(), 3);
    await shot(page, "alerts-unread");
    await page.click("[data-testid=driver-alerts-tab-important]");
    assert.equal(await page.locator("[data-testid=driver-alerts-list] li").count(), 1); // the changed assignment
    await shot(page, "alerts-important");
    await page.click("[data-testid=driver-alert-changed]");
    await page.waitForURL("**/driver/assignment/b-1");
    assert.ok(recorder.calls.some((c) => c.path === "/api/driver/alerts/read" && JSON.stringify(c.body).includes("changed:b-1:ab12")));
    await close();
  });

  it("Profile: real fields, dispatcher number from settings, change password only after the server accepts it", async () => {
    const { page, close } = await open({ name: "profile-flow", path: "/driver/profile", ready: "[data-testid=driver-profile-header]" }, 360);
    assert.match((await page.textContent("[data-testid=profile-vehicle]")) ?? "", /TRK-1001, TRK-2002/);
    assert.match((await page.textContent("[data-testid=profile-crew]")) ?? "", /Sam Helper \(helper\)/);
    assert.equal(await page.getAttribute("[data-testid=profile-call-dispatch]", "href"), "tel:0285550100");
    await page.click("[data-testid=driver-change-password]");
    await page.fill("input[placeholder='Current password']", "old password 1");
    await page.fill("input[placeholder^='New password']", "short");
    await page.fill("input[placeholder='Confirm new password']", "short");
    await page.click("text=Save new password");
    await page.waitForSelector("text=at least 8 characters");
    await page.fill("input[placeholder^='New password']", "a much better password");
    await page.fill("input[placeholder='Confirm new password']", "a much better password");
    await page.click("text=Save new password");
    await page.waitForSelector("[data-testid=driver-password-changed]");
    await shot(page, "profile-change-password-done");
    await close();
  });

  it("Report an issue: validation, then a confirmation with a reference only after the server stored it", async () => {
    const { page, recorder, close } = await open({ name: "issue-flow", path: "/driver/issues/new?batch=b-3&so=so-2", ready: "[data-testid=driver-issue-submit]" }, 360);
    await page.click("[data-testid=driver-issue-submit]");
    await page.waitForSelector("text=Choose a category.");
    await shot(page, "issue-form-errors");
    await page.selectOption("[data-testid=driver-issue-category]", "Damaged goods");
    await page.click("[data-testid=driver-issue-priority-high]");
    await page.fill("[data-testid=driver-issue-description]", "Two cartons were crushed during loading.");
    await page.click("[data-testid=driver-issue-submit]");
    await page.waitForSelector("[data-testid=driver-issue-sent]");
    assert.match((await page.textContent("[data-testid=driver-issue-sent]")) ?? "", /IS-20261013-0009/);
    const sent = recorder.calls.find((c) => c.method === "POST" && c.path === "/api/driver/issues");
    assert.ok(sent);
    const payload = sent.body as { batch_id: string; so_id: string; priority: string; idempotency_key: string };
    assert.deepEqual([payload.batch_id, payload.so_id, payload.priority], ["b-3", "so-2", "high"]);
    assert.ok(payload.idempotency_key.length >= 8);
    await shot(page, "issue-sent");
    await close();
  });

  it("offline: an action taken offline is 'Saved locally', never a success; saved data still shows with an offline note", async () => {
    const context = await newContext(browser, 360);
    const page = await context.newPage();
    const recorder = await installMocks(page, {});
    await page.goto(`${BASE}/driver/today`);
    await page.waitForSelector("[data-testid=driver-kpis]");
    await page.goto(`${BASE}/driver/assignment/b-3`);
    await page.waitForSelector("[data-testid=driver-arrived-SO-TEST-1004]");
    recorder.apiDown = true;
    await page.click("[data-testid=driver-arrived-SO-TEST-1004]");
    await page.waitForSelector("[data-sync=saved_locally], [data-sync=pending], [data-sync=syncing]", { timeout: 20_000 });
    const pill = (await page.textContent("[data-testid=driver-pending-sync]")) ?? "";
    assert.match(pill, /Saved locally|Pending sync|Syncing/);
    assert.doesNotMatch((await page.textContent("main")) ?? "", /Arrived at site: SO-TEST-1004/); // no success shown before the server confirms
    await shot(page, "offline-saved-locally");
    await page.reload();
    await page.waitForSelector("[data-testid=driver-offline-note]", { timeout: 20_000 });
    await shot(page, "offline-showing-saved-data");
    await context.close();
    assert.deepEqual(recorder.unexpected, []);
  });

  it("a queued action the server later rejects is 'Failed' with the reason visible in Alerts", async () => {
    const context = await newContext(browser, 360);
    const page = await context.newPage();
    const scenario: Scenario = {};
    const recorder = await installMocks(page, scenario);
    await page.goto(`${BASE}/driver/assignment/b-3`);
    await page.waitForSelector("[data-testid=driver-arrived-SO-TEST-1004]");
    recorder.apiDown = true;
    await page.click("[data-testid=driver-arrived-SO-TEST-1004]");
    await page.waitForSelector("[data-testid=driver-pending-sync]", { timeout: 20_000 });
    scenario.actionError = { status: 409, body: { detail: { message: "Check out of SO-TEST-1003 before arriving at another stop.", code: "out_of_order" } } };
    recorder.apiDown = false;
    await page.click("[data-testid=driver-pending-sync]");
    await page.click("text=Sync now");
    await page.waitForSelector("[data-sync=failed]", { timeout: 20_000 });
    await shot(page, "sync-failed-on-trip");
    await page.click("[data-testid=driver-nav-alerts]");
    await page.waitForSelector("[data-testid=driver-alert-sync-failed]");
    assert.match((await page.textContent("[data-testid=driver-alert-sync-failed]")) ?? "", /Check out of SO-TEST-1003/);
    await shot(page, "alerts-sync-failed");
    await context.close();
    assert.deepEqual(recorder.unexpected, []);
  });
});
