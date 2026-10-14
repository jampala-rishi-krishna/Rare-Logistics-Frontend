// The simplified driver app, tapped like a driver at 360 px against the stateful fake in e2e/flowMock.ts (2 SOs + 1 TO):
// Sign in -> Today -> Acknowledge (ONE call) -> Start trip (+sheet) -> per stop Reached -> Delivered sheet (photo) -> End trip (+sheet)
// -> "Give the signed invoice copies" / Waiting for officer -> Closed. Plus: dispatch removed an order (banner, 409 order_removed
// online and from the offline queue), Not fully delivered / Problem sheets, Tagalog, History read-only, Profile.
// Screenshots: e2e/screenshots/driver-simplified/. Run:
//   node --experimental-strip-types --no-warnings --test e2e/driver.flow.test.ts
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, BrowserContext, Page } from "playwright";
import { launch, newContext, shot, startServer, stopServer, BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import type { Recorder, Scenario } from "./mockApi.ts";
import { BATCH, bringToFront, ended, installFlow, newFlow, onTrip, removeOrder } from "./flowMock.ts";
import type { Flow } from "./flowMock.ts";
import * as d from "./fixtures/driverData.ts";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const DIR = "driver-simplified";
let browser: Browser;

before(async () => {
  await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  stopServer();
});

interface Session {
  context: BrowserContext;
  page: Page;
  recorder: Recorder;
  errors: string[];
  done: () => Promise<void>;
}

async function session(flow: Flow, scenario: Scenario = {}, width = 360): Promise<Session> {
  const context = await newContext(browser, width);
  const page = await context.newPage();
  const recorder = await installMocks(page, scenario);
  await installFlow(page, flow);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return {
    context,
    page,
    recorder,
    errors,
    done: async () => {
      assert.deepEqual(errors, [], "uncaught page errors");
      assert.deepEqual(recorder.unexpected, [], "requests no fixture answers");
      await context.close();
    },
  };
}

// Toasts stay 5 s and sit above the content; screenshots wait for them to go so the screen itself is visible.
async function snap(page: Page, name: string, fullPage = true) {
  await page.waitForFunction(() => !document.querySelector("[data-testid=driver-toast]"), null, { timeout: 10_000 }).catch(() => undefined);
  await shot(page, `${DIR}/${name}`, fullPage);
}

const toastText = async (page: Page, re: RegExp) => page.waitForFunction((src) => Array.from(document.querySelectorAll("[data-testid=driver-toast]")).some((t) => new RegExp(src).test(t.textContent ?? "")), re.source, { timeout: 15_000 });

async function addPhoto(page: Page, tap: (sel: string, label: string) => Promise<void>, label: string) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), tap("[data-testid=driver-photo-add]", label)]);
  await chooser.setFiles({ name: "pod.png", mimeType: "image/png", buffer: PNG });
  await page.waitForSelector("[data-testid=driver-photo-taken]");
}

describe("simplified driver flow at 360 px", () => {
  it("sign in -> acknowledge (one call) -> start -> 3 stops delivered -> end -> waiting for officer -> closed; counts the taps", async () => {
    const flow = newFlow();
    const s = await session(flow, { session: null });
    const { page } = s;
    const taps: string[] = [];
    const tap = async (selector: string, label: string) => {
      taps.push(label);
      await page.click(selector);
    };

    // Sign in
    await page.goto(`${BASE}/driver/login`);
    await page.waitForSelector("[data-testid=driver-login-submit]");
    await snap(page, "01-signin");
    await page.fill("[data-testid=driver-login-identifier]", "09170000101");
    await page.fill("[data-testid=driver-login-password]", "correct horse battery");
    await tap("[data-testid=driver-login-submit]", "Sign in");
    await page.waitForURL("**/driver/today");
    await page.waitForSelector("[data-testid=driver-card-action-acknowledge]");
    assert.equal((await page.textContent("[data-testid=driver-card-action-acknowledge]"))?.trim(), "Acknowledge");
    assert.equal((await page.textContent("[data-testid=kpi-stops]"))?.match(/^\d+/)?.[0], "3");
    await snap(page, "02-today");

    // (not counted: a second tab shows what the trip screen looks like before acknowledging)
    const peek = await s.context.newPage();
    const peekRecorder = await installMocks(peek, {});
    await installFlow(peek, flow);
    await peek.goto(`${BASE}/driver/trip/${BATCH}`);
    await peek.waitForSelector("[data-testid=driver-ack-all]");
    for (const no of ["SO-TEST-1001", "SO-TEST-1002", "TO-TEST-0003"]) assert.equal(await peek.locator(`[data-testid=driver-order-${no}]`).count(), 1, `${no} listed`);
    await snap(peek, "03-trip-acknowledge");
    assert.deepEqual(peekRecorder.unexpected, []);
    assert.equal(flow.log.length, 0, "looking at the trip sends nothing");
    await peek.close();

    // Acknowledge: ONE tap, ONE call, every order
    await tap("[data-testid=driver-card-action-acknowledge]", "Acknowledge (Today card)");
    await page.waitForSelector("[data-testid=driver-card-action-start]");
    assert.equal(flow.log.filter((l) => l === "acknowledge-all").length, 1, "acknowledge-all called once");
    assert.equal(flow.log.filter((l) => l === "acknowledge").length, 0, "no per-order acknowledge calls");
    assert.ok(flow.orders.every((o) => o.ack), "all 3 orders (2 SO + 1 TO) acknowledged by that one call");
    const ackBody = flow.posts.find((p) => p.path.endsWith("/acknowledge-all"))?.body ?? {};
    assert.ok(typeof ackBody.idempotency_key === "string" && ackBody.client_ts, "idempotency key + client time sent");

    // Start trip + confirm sheet
    await tap("[data-testid=driver-card-action-start]", "Start trip (Today card)");
    await page.waitForSelector("[data-testid=driver-start-sheet]");
    await snap(page, "04-start-sheet", false);
    await tap("[data-testid=driver-start-sheet-confirm]", "Start (sheet)");
    await page.waitForURL(`**/driver/trip/${BATCH}`);
    await page.waitForSelector("[data-testid=driver-im-here]");

    // Every stop: Reached -> Delivered -> photo -> Delivered (submit)
    const stops = [
      { no: "SO-TEST-1001", invoice: "000456", type: "SO" },
      { no: "SO-TEST-1002", invoice: "000457", type: "SO" },
      { no: "TO-TEST-0003", invoice: "TO-TEST-0003", type: "TO" },
    ];
    for (const [i, stop] of stops.entries()) {
      await page.waitForSelector(`[data-testid=driver-current-stop][data-so="${stop.no}"]`);
      await page.waitForSelector("[data-testid=driver-im-here]:not([disabled])");
      assert.match((await page.getAttribute("[data-testid=driver-navigate]", "href")) ?? "", /google\.com\/maps\/dir/, "Navigate opens Google Maps directions");
      await tap("[data-testid=driver-im-here]", `Reached (stop ${i + 1})`);
      await page.waitForSelector("[data-testid=driver-delivered]:not([disabled])");
      if (i === 0) await snap(page, "05-trip-at-stop");
      await tap("[data-testid=driver-delivered]", `Delivered (stop ${i + 1})`);
      await page.waitForSelector("[data-testid=driver-delivered-sheet]");
      const input = page.locator("[data-testid=driver-invoice-input]");
      if (stop.type === "TO") {
        assert.equal(await input.inputValue(), "TO-TEST-0003", "TO invoice field = the TO number");
        assert.equal(await input.getAttribute("readonly"), "", "TO invoice field is read-only");
      } else if (i === 0) {
        assert.equal(await input.inputValue(), "000456", "known invoice number prefilled");
        assert.equal(await input.getAttribute("readonly"), null, "an SO prefill stays editable");
      } else {
        assert.equal(await input.inputValue(), "");
        await input.fill("000457"); // typing, not counted
      }
      await addPhoto(page, tap, `Add photo (stop ${i + 1})`);
      if (i === 0) await snap(page, "06-delivered-sheet", false);
      await tap("[data-testid=driver-delivered-submit]", `Delivered submit (stop ${i + 1})`);
      await page.waitForSelector("[data-testid=driver-delivered-sheet]", { state: "detached" });
    }
    await page.waitForSelector("[data-testid=driver-end-trip]:not([disabled])");
    const checkouts = flow.posts.filter((p) => p.path.endsWith("/check-out")).map((p) => (p.body.answers ?? {}) as Record<string, unknown>);
    assert.deepEqual(checkouts.map((a) => a.outcome), ["Delivered", "Delivered", "Delivered"]);
    assert.deepEqual(checkouts.map((a) => a.invoice_dr_number ?? null), ["000456", "000457", null], "a TO sends no invoice number (the server uses the TO number)");
    assert.ok(checkouts.every((a) => typeof a.delivery_photo === "number"), "every Delivered carries its uploaded photo id");

    // End trip + confirm sheet
    await tap("[data-testid=driver-end-trip]", "End trip");
    await page.waitForSelector("[data-testid=driver-end-sheet]");
    await snap(page, "09-end-sheet", false);
    await tap("[data-testid=driver-end-sheet-confirm]", "End trip (sheet)");

    // Auto handover: no handover form, the list comes from the End trip response
    await page.waitForSelector("[data-testid=driver-give-invoices]");
    assert.match((await page.textContent("[data-testid=driver-give-invoices]")) ?? "", /Give the signed invoice copies to the Logistics Officer/);
    assert.equal((await page.textContent("[data-testid=driver-trip-chip]"))?.trim(), "Waiting for officer");
    const list = (await page.textContent("[data-testid=driver-invoice-list]")) ?? "";
    for (const v of ["000456", "000457", "TO-TEST-0003"]) assert.match(list, new RegExp(v), `invoice list shows ${v} (from the End trip handover)`);
    assert.doesNotMatch(list, /No invoice/i);
    assert.equal(await page.locator("[data-testid=driver-handover-submit], [data-testid=driver-handover-link]").count(), 0, "no driver handover form");
    await snap(page, "10-waiting-officer");

    // The officer validates (server side); the driver's screen picks it up on the next refresh
    flow.trip = "closed";
    await bringToFront(page);
    await page.waitForSelector("[data-testid=driver-closed]", { timeout: 30_000 });
    assert.equal((await page.textContent("[data-testid=driver-trip-chip]"))?.trim(), "Closed ✓");
    await snap(page, "11-closed");

    assert.deepEqual(flow.log.filter((l) => l !== "upload"), ["acknowledge-all", "start", "check-in", "check-out", "check-in", "check-out", "check-in", "check-out", "end"]);
    assert.equal(flow.uploads, 3);
    console.log(`\n[driver flow] taps from sign-in to End trip confirm (typing and Navigate excluded): ${taps.length}\n  ${taps.map((t, i) => `${i + 1}. ${t}`).join("\n  ")}\n`);
    assert.equal(taps.length, 18);
    await s.done();
  });

  it("the trip screen's Acknowledge also acknowledges every order with one call", async () => {
    const flow = newFlow();
    const s = await session(flow);
    await s.page.goto(`${BASE}/driver/trip/${BATCH}`);
    await s.page.waitForSelector("[data-testid=driver-ack-all]");
    assert.equal((await s.page.textContent("[data-testid=driver-ack-all]"))?.trim(), "Acknowledge");
    await s.page.click("[data-testid=driver-ack-all]");
    await s.page.waitForSelector("[data-testid=driver-start-trip]");
    assert.deepEqual(flow.log, ["acknowledge-all"]);
    assert.ok(flow.orders.every((o) => o.ack));
    await s.done();
  });

  it("Not fully delivered (Failed + reason, photo optional) and the Problem sheet", async () => {
    const flow = onTrip(newFlow(), 0, true);
    const s = await session(flow);
    const { page } = s;
    await page.goto(`${BASE}/driver/trip/${BATCH}`);
    await page.click("[data-testid=driver-delivered]");
    await page.waitForSelector("[data-testid=driver-delivered-sheet]");
    await page.click("[data-testid=driver-not-fully]");
    await page.waitForSelector("[data-testid=driver-outcome-partial][aria-pressed=true]");
    await page.waitForSelector("[data-testid=driver-reason-0]");
    await snap(page, "07-not-fully", false);
    await page.click("[data-testid=driver-outcome-failed]");
    await page.click("[data-testid=driver-delivered-submit]");
    await page.waitForSelector("[data-testid=driver-delivered-sheet] [role=alert]"); // reason required
    assert.ok(!flow.log.includes("check-out"), "nothing sent without a reason");
    await page.click("[data-testid=driver-reason-0]");
    await page.click("[data-testid=driver-delivered-submit]");
    await page.waitForSelector("[data-testid=driver-delivered-sheet]", { state: "detached" });
    const sent = (flow.posts.find((p) => p.path.endsWith("/check-out"))?.body.answers ?? {}) as Record<string, unknown>;
    assert.equal(sent.outcome, "Failed");
    assert.ok(String(sent.reason ?? "").length > 0, "reason chip text sent");
    assert.equal(sent.delivery_photo, undefined, "no photo needed for Failed");

    await page.click("[data-testid=driver-problem]");
    await page.waitForSelector("[data-testid=driver-problem-sheet]");
    await snap(page, "08-problem-sheet", false);
    await page.click("[data-testid=driver-problem-customer]");
    await page.click("[data-testid=driver-problem-send]");
    await page.waitForSelector("[data-testid=driver-problem-sheet]", { state: "detached" });
    const issue = s.recorder.calls.find((c) => c.method === "POST" && c.path === "/api/driver/issues")?.body as { batch_id: string; category: string } | undefined;
    assert.equal(issue?.batch_id, BATCH);
    assert.equal(issue?.category, "Customer unavailable");
    await s.done();
  });

  it("dispatch removed an order: Reached answers 409 order_removed, the banner shows and the order is gone after the refetch", async () => {
    const flow = onTrip(newFlow(), 1);
    const s = await session(flow);
    const { page } = s;
    await page.goto(`${BASE}/driver/trip/${BATCH}`);
    await page.waitForSelector('[data-testid=driver-current-stop][data-so="SO-TEST-1002"]');
    removeOrder(flow, "so-2"); // the phone still shows SO-TEST-1002
    await page.click("[data-testid=driver-im-here]");
    await toastText(page, /This order was removed by dispatch/);
    await page.waitForSelector("[data-testid=driver-dispatch-order_removed]");
    assert.match((await page.textContent("[data-testid=driver-dispatch-order_removed]")) ?? "", /Dispatch removed SO-TEST-1002 from your trip/);
    await page.waitForSelector("[data-testid=driver-order-SO-TEST-1002]", { state: "detached" });
    await page.waitForSelector('[data-testid=driver-current-stop][data-so="TO-TEST-0003"]');
    await snap(page, "15-dispatch-removed-banner");
    // Today shows it too
    await page.click("[data-testid=driver-trip-back]");
    await page.waitForSelector("[data-testid=driver-dispatch-order_removed]");
    await s.done();
  });

  it("a queued (offline) action whose order dispatch removed is dropped with 'This order was removed by dispatch'", async () => {
    const flow = onTrip(newFlow(), 1);
    const s = await session(flow);
    const { page } = s;
    await page.goto(`${BASE}/driver/trip/${BATCH}`);
    await page.waitForSelector('[data-testid=driver-current-stop][data-so="SO-TEST-1002"]');
    flow.apiDown = true;
    await page.click("[data-testid=driver-im-here]");
    await page.waitForSelector("[data-testid=driver-pending-sync]", { timeout: 20_000 });
    removeOrder(flow, "so-2");
    flow.apiDown = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await toastText(page, /This order was removed by dispatch/);
    await page.waitForSelector("[data-testid=driver-order-SO-TEST-1002]", { state: "detached", timeout: 20_000 });
    assert.equal(await page.locator("[data-sync=failed]").count(), 0, "dropped for good, not left as a failed action");
    assert.ok(flow.log.includes("check-in"), "the queued Reached reached the server");
    await s.done();
  });

  it("Tagalog: the sign-in toggle and the Profile language switch change the labels", async () => {
    const flow = newFlow();
    const s = await session(flow, { session: null });
    const { page } = s;
    await page.goto(`${BASE}/driver/login`);
    await page.waitForSelector("[data-testid=driver-login-submit]");
    assert.match((await page.textContent("[data-testid=driver-login-submit]")) ?? "", /^Sign in/);
    await page.click("[data-testid=driver-lang-toggle]");
    assert.match((await page.textContent("[data-testid=driver-login-submit]")) ?? "", /^Mag-sign in/);
    await page.click("[data-testid=driver-lang-toggle]");
    await page.fill("[data-testid=driver-login-identifier]", "09170000101");
    await page.fill("[data-testid=driver-login-password]", "correct horse battery");
    await page.click("[data-testid=driver-login-submit]");
    await page.waitForURL("**/driver/today");
    await page.click("[data-testid=driver-nav-profile]");
    await page.waitForSelector("[data-testid=driver-lang-tl]");
    await page.click("[data-testid=driver-lang-tl]");
    await page.waitForFunction(() => document.querySelector("[data-testid=driver-nav-today]")?.textContent?.trim() === "Ngayon");
    assert.equal((await page.textContent("[data-testid=driver-nav-history]"))?.trim(), "Nakaraan");
    await snap(page, "14-profile-tagalog");
    await page.click("[data-testid=driver-nav-today]");
    await page.waitForSelector("[data-testid=driver-card-action-acknowledge]");
    assert.equal((await page.textContent("[data-testid=driver-card-action-acknowledge]"))?.trim(), "Kumpirmahin");
    await s.done();
  });

  it("History lists past trips and opens one read-only (no crew buttons)", async () => {
    const flow = newFlow();
    const h2 = { ...d.detailOnTrip, batch_id: "h-2", delivery_date: "2026-10-11" };
    const s = await session(flow, { detail: { "h-2": h2 } });
    const { page } = s;
    await page.goto(`${BASE}/driver/history`);
    await page.waitForSelector("[data-testid=driver-trip-h-1]");
    await snap(page, "12-history");
    await page.click("[data-testid=driver-trip-h-2]");
    await page.waitForURL("**/driver/trip/h-2?from=history");
    await page.waitForSelector("[data-testid=driver-trip-header]");
    await page.waitForTimeout(400);
    const crewButtons = "[data-testid=driver-ack-all], [data-testid=driver-start-trip], [data-testid=driver-im-here], [data-testid=driver-delivered], [data-testid=driver-end-trip], [data-testid=driver-problem], [data-testid=driver-action-bar]";
    assert.equal(await page.locator(crewButtons).count(), 0, "read-only: no crew action");
    assert.equal(await page.getAttribute("[data-testid=driver-trip-back]", "href"), "/driver/history");
    await s.done();
  });

  it("Profile: language toggle and the alerts list", async () => {
    const flow = newFlow();
    const s = await session(flow);
    const { page } = s;
    await page.goto(`${BASE}/driver/profile`);
    await page.waitForSelector("[data-testid=driver-alerts]");
    assert.equal(await page.locator("[data-testid=driver-lang-en][aria-pressed=true]").count(), 1);
    assert.equal(await page.locator("[data-testid=driver-lang-tl]").count(), 1);
    assert.equal(await page.locator("[data-testid=driver-alerts] [data-testid^=driver-alert-]").count(), d.alerts.alerts.length);
    assert.equal((await page.textContent("[data-testid=driver-unread]"))?.trim(), "3");
    await snap(page, "13-profile");
    await s.done();
  });

  it("after End trip the officer list waits; it never asks the driver for a handover form", async () => {
    const flow = ended(newFlow());
    const s = await session(flow);
    await s.page.goto(`${BASE}/driver/trip/${BATCH}`);
    await s.page.waitForSelector("[data-testid=driver-give-invoices]");
    assert.equal(await s.page.locator("[data-testid=driver-back-today]").count(), 1);
    await s.done();
  });
});
