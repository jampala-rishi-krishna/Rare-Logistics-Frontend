import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright";
import {
  launch,
  startServer,
  stopServer,
  BASE,
  shot,
  horizontalOverflow,
} from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import { dispatcherSession } from "./fixtures/overviewData.ts";
import { today, v2Timeline } from "./overviewMock.ts";
import { contrastViolations } from "./contrast.ts";
let browser: Browser;
before(async () => {
  await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  stopServer();
});
async function open(width = 1440, path = "", setup?: (page: Page) => Promise<void>, role = "admin") {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    timezoneId: "Asia/Manila",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const recorder = await installMocks(page, { role, ...(role === "planner" ? { session: { user: { ...dispatcherSession.user, role: "planner" } } } : {}) });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (setup) await setup(page);
  await page.goto(`${BASE}/app/driver-overview${path}`);
  await page.waitForSelector('[data-testid="trip-row"]');
  return { page, context, recorder, errors };
}
const count = async (page: Page) =>
  page.locator('[data-testid="trip-row"]').count();
describe("Driver Overview v2 manager workflows", () => {
  it("Planner gets driver/helper tables only, receives a handed invoice and gets live updates", async () => {
    let received = false, writes = 0;
    let push: ((message: string) => void) | null = null;
    const { page, context, errors } = await open(1440, "", async page => {
      await page.routeWebSocket("**/never**", ws => { push = message => ws.send(message); });
      await page.route("http://mock-api.test/api/driver-overview/hardcopies**", route => {
        const collected = new URL(route.request().url()).searchParams.get("collected") === "true";
        const rows = collected === received ? [{ item_id: 99, handed_over: true, so_id: "so-1", so_number: "SO-COLLECT-1", invoice_no: "31879", customer_name: "Test Customer", vehicle: "TRK-2002", driver_name: "Test Driver", batch_id: "b-3", delivery_date: today, delivery_outcome: "Delivered", state: collected ? "received" : "with_officer", state_label: collected ? "Collected" : "With officer", received_by: collected ? "Test Planner" : null, holder: "Test Planner", since: new Date().toISOString(), note: null }] : [];
        return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ total: rows.length, counts: rows.length ? { [collected ? "received" : "with_officer"]: rows.length } : {}, rows }) });
      });
      await page.route("http://mock-api.test/api/driver-overview/trips/b-3", route => {
        const timeline = v2Timeline("b-3");
        const invoice = { ...timeline.invoices[0], item_id: 99, handed_over: true, status: received ? "received" : "with_officer" };
        return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ...timeline, invoices: [invoice], trip: { ...timeline.trip, status: received ? "closed" : "handover_submitted" } }) });
      });
      await page.route("http://mock-api.test/api/driver-overview/invoices/99/receive", route => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "*" } });
        const body = route.request().postDataJSON();
        assert.equal(body.status, "received"); assert.ok(body.idempotency_key);
        writes++; received = true;
        return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true }) });
      });
    }, "planner");
    assert.equal(await page.locator("article[data-testid=trip-row]").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Table view" }).count(), 0);
    await page.getByTestId("board-mode-helper").click();
    assert.equal(await page.getByRole("table", { name: "Helper trips", exact: true }).count(), 1);
    assert.equal(await page.getByRole("columnheader", { name: "Vehicle", exact: true }).count(), 1);
    assert.equal(await page.getByTestId("helper-group").count(), 0);
    await page.getByRole("button", { name: "Open TRK-2002, Trip 1", exact: true }).click();
    const drawer = page.getByTestId("trip-drawer");
    await drawer.getByRole("button", { name: "Received", exact: true }).waitFor();
    assert.ok(!(await drawer.innerText()).includes("Other days for this crew"));
    await drawer.getByRole("button", { name: "Received", exact: true }).click();
    await drawer.getByText("Received", { exact: true }).waitFor();
    await page.waitForTimeout(200);
    assert.equal(writes, 1);
    assert.equal(await drawer.getByRole("button", { name: "Received", exact: true }).count(), 0);
    assert.ok(push, "the app's shared live socket connected");
    await Promise.all([
      page.waitForResponse(r => r.url().includes("/api/driver-overview/trips/b-3")),
      Promise.resolve().then(() => push!(JSON.stringify({ type: "TRIP_STATE_CHANGED" }))),
    ]);
    await page.getByRole("tab", { name: "Collected invoices (1)", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Invoices to collect (0)", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close trip", exact: true }).click();
    await page.getByTestId("tab-collected").click();
    await page.getByRole("cell", { name: "SO-COLLECT-1", exact: true }).waitFor();
    assert.equal(await page.getByRole("cell", { name: "Collected", exact: true }).count(), 1);
    assert.equal(await page.getByRole("cell", { name: "Test Planner", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Partly delivered (0)", exact: true }).click();
    await page.getByText("No collected invoices match these filters.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Delivered (1)", exact: true }).click();
    await page.getByRole("cell", { name: "SO-COLLECT-1", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  });
  it("one trip row per batch, four tabs including collected invoices, tile counts equal matching rows and clear", async () => {
    const { page, context, errors } = await open();
    assert.equal(await count(page), 3);
    assert.equal(await page.getByRole("tab").count(), 4);
    await shot(page, "overview-after/today");
    for (const tile of ["loading", "on_road", "attention"]) {
      const n = Number(
        await page.getByTestId(`tile-count-${tile}`).textContent(),
      );
      await page.getByTestId(`tile-${tile}`).click();
      await page.waitForFunction(
        (expected) =>
          document.querySelectorAll('[data-testid="trip-row"]').length ===
          expected,
        n,
      );
      assert.equal(await count(page), n);
      if (tile === "attention") await shot(page, "overview-after/attention");
      await page.getByTestId(`tile-${tile}`).click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll('[data-testid="trip-row"]').length === 3,
      );
    }
    assert.deepEqual(errors, []);
    assert.equal(await horizontalOverflow(page), 0);
    assert.deepEqual(
      await contrastViolations(page, '[data-testid="driver-overview"]'),
      [],
    );
    await context.close();
  });
  it("SO proof in two clicks; full facts, unassign audit and photo viewer", async () => {
    const { page, context } = await open(1440, "?q=SO-TEST-3001");
    await page
      .getByRole("button", { name: "Open TRK-2002, Trip 1", exact: true })
      .click();
    await page.getByTestId("trip-drawer").waitFor();
    await page.locator('[data-testid="photo-thumb"]').first().waitFor();
    await shot(page, "overview-after/drawer-expanded-proof");
    const text = await page.getByTestId("trip-drawer").textContent();
    assert.match(text ?? "", /Loaded \(acknowledged\)/);
    assert.match(text ?? "", /GPS/);
    assert.match(text ?? "", /Invoice\/DR/);
    await page.getByTestId("photo-thumb").first().click();
    await page.getByTestId("photo-viewer").waitFor();
    await shot(page, "overview-after/photo-viewer");
    await page
      .getByRole("button", { name: "Close photo", exact: true })
      .click();
    await page.locator("#trip-activity > summary").click();
    await page.getByTestId("activity-unassigned").waitFor();
    await page.keyboard.press("Escape");
    await page.getByTestId("trip-drawer").waitFor({ state: "detached" });
    await context.close();
  });
  it("URL reload and Back restore filters, range and drawer", async () => {
    const { page, context } = await open();
    await page.getByTestId("tile-attention").click();
    await page
      .getByRole("button", { name: "Open TRK-2002, Trip 1", exact: true })
      .click();
    await page.reload();
    await page.getByTestId("trip-drawer").waitFor();
    assert.match(page.url(), /tile=attention/);
    await page.getByRole("button", { name: "Close trip" }).click();
    await page.goBack();
    await page.getByTestId("trip-drawer").waitFor();
    await page.getByRole("button", { name: "Close trip" }).click();
    await page.getByTestId("tile-attention").click();
    await page.getByTestId("range-toggle").click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="trip-row"]').length === 5,
    );
    await shot(page, "overview-after/range");
    assert.equal(await page.getByRole("button", { name: "Table view" }).count(), 0);
    await page
      .getByRole("columnheader", { name: "Weight", exact: true }).first()
      .waitFor();
    await shot(page, "overview-after/table");
    await context.close();
  });
  it("invoices and issues default to all dates; reply updates both tab and drawer; filtered CSV", async () => {
    const { page, context, recorder } = await open();
    await page.getByTestId("tab-invoices").click();
    await page.getByText("All dates — anything not yet received").waitFor();
    await shot(page, "overview-after/invoices");
    await page.getByTestId("tab-issues").click();
    await page.getByTestId("issues-tab").waitFor();
    await page.locator('[data-testid^="issue-IS-"]').first().waitFor();
    await shot(page, "overview-after/issues");
    const card = page.locator('[data-testid^="issue-IS-"]').first();
    await card
      .getByRole("textbox", { name: "Reply" })
      .fill("Dispatch has arranged assistance.");
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await card.getByRole("status").waitFor();
    await card.getByRole("button", { name: /Open trip/ }).click();
    await page.getByTestId("trip-drawer").waitFor();
    await page
      .getByText("Dispatch has arranged assistance.", { exact: true })
      .first()
      .waitFor();
    const drawerCard = page
      .getByTestId("trip-drawer")
      .locator('[data-testid^="issue-IS-"]:visible')
      .last();
    await drawerCard
      .getByRole("textbox", { name: "Reply" })
      .fill("Officer will check the damaged cartons.");
    await drawerCard.getByRole("button", { name: "Save", exact: true }).click();
    await drawerCard.getByRole("status").waitFor();
    await page.getByRole("button", { name: "Close trip" }).click();
    await card.getByRole("textbox", { name: "Reply" }).waitFor();
    assert.equal(
      await card.getByRole("textbox", { name: "Reply" }).inputValue(),
      "Officer will check the damaged cartons.",
    );
    const download = page.waitForEvent("download");
    await page.getByTestId("export-csv").click();
    await download;
    assert.ok(recorder.calls.some((c) => c.path.includes("export.csv")));
    await context.close();
  });
  for (const width of [1440, 1280, 1024, 390])
    it(`layout ${width}: no page overflow and usable drawer`, async () => {
      const { page, context } = await open(width);
      assert.equal(await horizontalOverflow(page), 0);
      await page
        .getByRole("button", { name: "Open TRK-2002, Trip 1", exact: true })
        .click();
      await page.getByTestId("trip-drawer").waitFor();
      assert.equal(await horizontalOverflow(page), 0);
      await shot(page, `overview-after/${width}-drawer`, false);
      assert.deepEqual(
        await contrastViolations(page, '[data-testid="trip-drawer"]'),
        [],
      );
      await page.getByRole("button", { name: "Close trip" }).click();
      if (width === 390) await shot(page, "overview-after/390-list");
      await context.close();
    });
  it("empty state explains filters and offers clear", async () => {
    const { page, context } = await open();
    await page.getByTestId("search").fill("NO-SUCH-ORDER");
    await page
      .getByRole("heading", { name: "No trips match these filters" })
      .waitFor();
    await shot(page, "overview-after/empty");
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="trip-row"]').length === 3,
    );
    await context.close();
  });
});
