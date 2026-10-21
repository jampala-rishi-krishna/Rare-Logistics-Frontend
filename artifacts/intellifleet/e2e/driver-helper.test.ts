import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import type { Browser } from "playwright";
import { launch, startServer, stopServer, BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import * as d from "./fixtures/driverData.ts";

let browser: Browser;
before(async () => { await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); stopServer(); });

test("Driver login sees helper assignment, role and Call driver on mobile", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  // The account stays Driver; this trip's assignment says Helper.
  const trip = d.batch({ viewer_role: "helper" });
  await installMocks(page, {
    me: { ...d.me, role: "driver", viewer_role: "driver", staff_id: 102, driver_id: 102 },
    today: { ...d.today, batches: [trip] },
    detail: { "b-1": { ...d.detailPending, ...trip } },
  });
  await page.goto(`${BASE}/driver/today`);
  await page.getByTestId("trip-viewer-role").getByText("Your role: Helper", { exact: true }).waitFor();
  assert.ok(await page.locator('[data-kind="call_driver"]').count());
  await page.goto(`${BASE}/driver/trip/b-1`);
  await page.getByTestId("trip-viewer-role").getByText("Your role: Helper", { exact: true }).waitFor();
  assert.ok(await page.locator('[data-kind="call_driver"]').count());
  await context.close();
});

test("assignment offers drivers as helpers and prevents duplicate crew selection", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  await installMocks(page, { session: { user: { id: 1, fullName: "Admin", email: "admin@example.test", role: "admin", status: "active", is_manager: true } } });
  await page.route("http://mock-api.test/api/load-planning/assignments/one", route => route.fulfill({
    contentType: "application/json", body: JSON.stringify({
      order: { id: "one", number: "SO-TEST", weight_kg: 10, selected_weight_kg: 10 },
      selected_order_count: 1, constraints: null, constraint_status: "No constraints", vehicles: [],
      drivers: [{ id: 1, name: "Driver A", title: "DELIVERY DRIVER", kind: "driver" },
        { id: 2, name: "Driver B", title: "DELIVERY DRIVER", kind: "driver" },
        { id: 3, name: "Helper C", title: "DELIVERY HELPER", kind: "helper" }],
    }),
  }));
  await page.goto(`${BASE}/app/routes?assign=one`);
  const driver = page.getByTestId("select-assignment-driver");
  await driver.waitFor();
  assert.equal(await driver.locator('option[value="3"]').count(), 0);
  await driver.selectOption("1");
  await page.getByTestId("assignment-helper-2").check();
  assert.equal(await page.getByTestId("assignment-helper-1").count(), 0);
  assert.ok(await page.getByTestId("assignment-helper-3").count());
  await driver.selectOption("2");
  assert.equal(await page.getByTestId("assignment-helper-2").count(), 0);
  await driver.selectOption("1");
  assert.equal(await page.getByTestId("assignment-helper-2").isChecked(), false);
  await context.close();
});
