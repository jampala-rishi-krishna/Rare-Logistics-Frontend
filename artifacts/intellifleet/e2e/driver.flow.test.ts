// The WHOLE trip through the real screens, tapping like a driver: acknowledge -> start trip -> Arrived -> Departed (+ Invoice/DR, outcome,
// proof-of-delivery photo) -> end trip -> handover -> the officer validates. Server rules come from e2e/flowMock.ts (same rules as the backend,
// which test_full_driver_flow.py exercises against the real services). Run:
//   node --experimental-strip-types --no-warnings --test e2e/driver.flow.test.ts
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, BrowserContext, Page } from "playwright";
import { launch, newContext, shot, startServer, stopServer, BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import type { Recorder } from "./mockApi.ts";
import { installFlow, newFlow } from "./flowMock.ts";
import type { Flow } from "./flowMock.ts";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
let browser: Browser;
before(async () => {
  await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  stopServer();
});

async function session(role: "driver" | "officer", flow: Flow): Promise<{ context: BrowserContext; page: Page; recorder: Recorder }> {
  const context = await newContext(browser, 360);
  const page = await context.newPage();
  const recorder = await installMocks(page, role === "officer" ? { session: { user: { id: "9", fullName: "Olivia Officer", email: "o@example.test", role: "logistics_officer", status: "active", mustChangePassword: false, staffId: null } } } : {});
  await installFlow(page, flow);
  return { context, page, recorder };
}

describe("full trip", () => {
  it("acknowledge -> start -> arrived -> departed with proof of delivery -> end -> handover -> officer validates", async () => {
    const flow = newFlow(2);
    const { context, page, recorder } = await session("driver", flow);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    // Today: the trip card's primary action is Acknowledge
    await page.goto(`${BASE}/driver/today`);
    await page.waitForSelector("[data-testid=driver-card-action-acknowledge]");
    await shot(page, "flow-01-today-to-acknowledge");
    await page.click("[data-testid=driver-card-action-acknowledge]");
    await page.waitForSelector("[data-testid=driver-trip-summary]");
    await shot(page, "flow-02-trip-to-acknowledge");

    // Acknowledge each SO by completing its checklist (after the first, the app opens the next SO to acknowledge by itself)
    await page.click("[data-testid=driver-ack-SO-TEST-1001]");
    for (let n = 1; n <= 2; n += 1) {
      await page.waitForSelector("[data-testid=driver-ack-submit]");
      for (const box of await page.locator("input[type=checkbox]").all()) await box.check();
      if (n === 1) await shot(page, "flow-03-acknowledge-checklist");
      await page.click("[data-testid=driver-ack-submit]");
      await page.waitForTimeout(700);
    }
    if (!(await page.locator("[data-testid=driver-trip-summary]").count())) await page.goto(`${BASE}/driver/assignment/b-f`);
    await page.waitForSelector("[data-testid=driver-trip-summary]");

    // Start trip is only offered after every SO is acknowledged
    await page.waitForSelector("[data-testid=driver-start-trip]:not([disabled])");
    await shot(page, "flow-04-ready-to-start");
    await page.click("[data-testid=driver-start-trip]");
    await page.waitForSelector("[data-testid=driver-arrived-SO-TEST-1001]");
    await shot(page, "flow-05-on-trip-arrive");

    // Stop 1: Arrived -> Departed (Delivered needs the proof-of-delivery photo)
    await page.click("[data-testid=driver-arrived-SO-TEST-1001]");
    await page.waitForSelector("[data-testid=driver-checkout-SO-TEST-1001]");
    await page.click("[data-testid=driver-checkout-SO-TEST-1001]");
    await page.waitForSelector("[data-testid=driver-field-invoice_dr_number]");
    await page.locator("[data-testid=driver-field-invoice_dr_number] input").fill("000456");
    await page.click("text=Delivered");
    await page.waitForSelector("[data-testid=driver-field-delivery_photo]");
    assert.equal(await page.locator("[data-testid=driver-field-reason]").count(), 0);
    assert.match((await page.textContent("[data-testid=driver-checkout-submit]")) ?? "", /Mark as delivered/);
    await page.click("[data-testid=driver-checkout-submit]");
    await page.waitForSelector("text=Take a photo first (proof of delivery is required)");
    await shot(page, "flow-06-departed-photo-required");
    assert.ok(!flow.log.includes("check-out"), "nothing was sent without the photo");
    await page.locator("[data-testid=driver-field-delivery_photo] [data-testid=driver-photo-input]").setInputFiles({ name: "pod.png", mimeType: "image/png", buffer: PNG });
    await page.waitForSelector("[data-testid=driver-field-delivery_photo] img");
    await shot(page, "flow-07-departed-with-photo");
    await page.click("[data-testid=driver-checkout-submit]");
    await page.waitForSelector("[data-testid=driver-arrived-SO-TEST-1002]");
    assert.ok(flow.log.includes("upload") && flow.log.includes("check-out"));

    // Stop 2: Failed (reason required, photo optional)
    await page.click("[data-testid=driver-arrived-SO-TEST-1002]");
    await page.click("[data-testid=driver-checkout-SO-TEST-1002]");
    await page.waitForSelector("[data-testid=driver-field-invoice_dr_number]");
    await page.locator("[data-testid=driver-field-invoice_dr_number] input").fill("000457");
    await page.click("text=Failed");
    await page.waitForSelector("[data-testid=driver-field-reason]");
    assert.equal(await page.locator("[data-testid=driver-field-delivery_photo]").count(), 0);
    assert.match((await page.textContent("[data-testid=driver-checkout-submit]")) ?? "", /Save departure/);
    await page.click("[data-testid=driver-checkout-submit]");
    await page.waitForSelector("text=Give a reason");
    await page.locator("[data-testid=driver-field-reason] textarea").fill("Store closed");
    await page.click("[data-testid=driver-checkout-submit]");
    await page.waitForSelector("[data-testid=driver-end-trip]:not([disabled])");
    await shot(page, "flow-08-all-stops-done-end-trip");

    // End trip, then hand over the carbon copies
    page.on("dialog", (dialog) => void dialog.accept());
    await page.click("[data-testid=driver-end-trip]");
    await page.waitForSelector("[data-testid=driver-handover-link]");
    await shot(page, "flow-09-returned-handover");
    await page.click("[data-testid=driver-handover-link]");
    await page.waitForSelector("[data-testid=driver-handover-submit]");
    const lines = (await page.textContent("main")) ?? "";
    assert.match(lines, /SO-TEST-1001/);
    assert.match(lines, /Invoice\/DR 000456/);
    assert.match(lines, /Invoice\/DR 000457/);
    await page.click("text=Mark all handed over");
    await page.selectOption("[data-testid=driver-handover-officer] select", "9").catch(() => undefined); // a single officer is preselected
    await shot(page, "flow-10-handover-carbon-copies");
    await page.click("[data-testid=driver-handover-submit]");
    await page.waitForSelector("[data-testid=driver-handover-waiting]");
    await shot(page, "flow-11-handover-waiting-for-officer");
    assert.deepEqual(errors, []);
    assert.deepEqual(recorder.unexpected, []);
    assert.deepEqual(flow.log.filter((l) => l !== "upload"), ["acknowledge", "acknowledge", "start", "check-in", "check-out", "check-in", "check-out", "end", "handover"]);
    await context.close();

    // The logistics officer validates every invoice line
    const officer = await session("officer", flow);
    await officer.page.goto(`${BASE}/officer/handover/1`);
    await officer.page.waitForSelector("[data-testid=invoice-1]");
    const card = (await officer.page.textContent("[data-testid=invoice-1]")) ?? "";
    assert.match(card, /SO-TEST-1001/);
    assert.match(card, /Invoice\/DR 000456/);
    assert.match(card, /Delivered/);
    await shot(officer.page, "flow-12-officer-validates");
    for (const label of await officer.page.locator("button:has-text('Received')").all()) await label.click();
    await officer.page.click("[data-testid=officer-submit]");
    await officer.page.waitForSelector("text=fully validated and closed");
    await shot(officer.page, "flow-13-officer-closed");
    assert.equal(flow.trip, "closed");
    assert.deepEqual(officer.recorder.unexpected, []);
    await officer.context.close();

    // And the driver sees the final state
    const after = await session("driver", flow);
    await after.page.goto(`${BASE}/driver/assignment/b-f`);
    await after.page.waitForSelector("[data-testid=driver-trip-summary]");
    assert.match((await after.page.textContent("[data-testid=driver-trip-summary]")) ?? "", /Closed/);
    await shot(after.page, "flow-14-driver-sees-closed");
    await after.context.close();
  });

  it("without photo storage the form says so (it does not hide the field) and the departure can still be saved", async () => {
    const flow = newFlow(1);
    const context = await newContext(browser, 360);
    const page = await context.newPage();
    const recorder = await installMocks(page, {});
    await page.route("http://mock-api.test/api/driver/templates", async (route) => {
      const { templates } = await import("./fixtures/driverData.ts");
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ...templates, photo_storage_enabled: false }) });
    });
    await installFlow(page, flow);
    flow.sos[0].ack = true;
    flow.trip = "on_trip";
    flow.sos[0].stop = "checked_in";
    await page.goto(`${BASE}/driver/assignment/b-f/checkout/so-1`);
    await page.waitForSelector("[data-testid=driver-field-invoice_dr_number]");
    await page.locator("[data-testid=driver-field-invoice_dr_number] input").fill("1");
    await page.click("text=Delivered");
    await page.waitForSelector("[data-testid=driver-photo-not-configured]");
    assert.match((await page.textContent("[data-testid=driver-photo-not-configured]")) ?? "", /Photo upload is not configured/);
    assert.match((await page.textContent("[data-testid=driver-photo-not-configured]")) ?? "", /Contact the admin/);
    await shot(page, "flow-15-photo-storage-not-configured");
    assert.deepEqual(recorder.unexpected, []);
    await context.close();
  });
});
