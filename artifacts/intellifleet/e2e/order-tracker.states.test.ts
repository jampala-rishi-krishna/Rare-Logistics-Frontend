// Order Tracker empty / partial states: every missing fact shows the designed "Not recorded" state, never a placeholder
// value. One test per state; screenshots in e2e/screenshots/order-tracker/states/. All API calls route-mocked.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import type { Browser, Page } from "playwright";
import { startServer, stopServer, launch, shot } from "./harness.ts";
import { openTracker, orderUrl } from "./orderTrackerMock.ts";
import type { TrackerOptions } from "./orderTrackerMock.ts";
import { designList, missingFact } from "./fixtures/orderTrackerDesign.ts";
import type { Card } from "../src/services/api/orderTracker.ts";

let browser: Browser;
before(async () => { await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); stopServer(); });

/** Open `number` with one edit applied to its card. */
async function withCard(number: string, edit: (card: Card) => void, opts: TrackerOptions = {}) {
  return openTracker(browser, { width: 1440, ...opts, query: orderUrl(number), card: (n, base) => { if (base && n === number) edit(base); return base; } });
}
const cell = (page: Page, title: string) => page.locator(".otk-cell").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const states = (name: string) => `order-tracker/states/${name}`;

test("no safe GPS fix: the grey panel explains when live location shows", async () => {
  const view = await withCard("SO26-18452", c => { c.sections.location = missingFact("Cartrack GPS", "Not recorded — the last GPS fix is more than 15 minutes old.", { lat: 14.85, lng: 120.81, plate: "NAJ 6018", stale: true }); });
  const { page } = view;
  await page.locator(".otm-empty").waitFor();
  assert.equal(await page.locator(".otm-map").count(), 0, "no map is drawn for a stale fix");
  assert.match(await page.locator(".otm-empty").innerText(), /Live location shows only while the truck is on the way to this order/);
  assert.match(await page.locator(".otm-empty").innerText(), /more than 15 minutes old/);
  await shot(page, states("no-gps-1440"));
  await view.context.close();
});

test("no ETA: desktop says the truck-back time is not estimated, phone says live ETA isn't available", async () => {
  const desk = await withCard("SO26-18452", () => {});
  assert.match(await desk.page.locator(".otk-stats").innerText(), /Truck back — not estimated yet/);
  assert.doesNotMatch(await desk.page.locator(".otk").innerText(), /\(estimate\)|Arrives around/);
  await shot(desk.page, states("no-eta-1440"));
  await desk.context.close();
  const phone = await withCard("SO26-18452", () => {}, { width: 390 });
  assert.match(await phone.page.locator(".otp-where").innerText(), /Live ETA isn't available yet/);
  assert.doesNotMatch(await phone.page.locator(".otp-where").innerText(), /Arrives around/);
  await shot(phone.page, states("no-eta-390"));
  await phone.context.close();
});

test("no structured rejected quantities: 'Rejected quantities: Not recorded', no item table", async () => {
  const view = await withCard("SO26-18447", c => { (c.sections.delivery_result.value as Record<string, unknown>).rejected_items = "Not recorded — quantities per item were not captured."; });
  const result = cell(view.page, "Delivery result");
  assert.equal((await result.locator(".otk-dashed").innerText()).replace(/\s+/g, " ").trim(), "Rejected quantities: Not recorded");
  assert.equal(await result.locator(".otk-table").count(), 0);
  await shot(view.page, states("no-rejected-quantities-1440"));
  await view.context.close();
});

test("no receiver: 'Received by: Not recorded'", async () => {
  const view = await withCard("SO26-18447", c => { const v = c.sections.delivery_result.value as Record<string, unknown>; v.receiver = "Not recorded — ask Logistics to add a receiver field."; v.receiver_position = null; });
  const result = cell(view.page, "Delivery result");
  assert.equal((await result.locator(".otk-receiver").innerText()).trim(), "Received by: Not recorded");
  await shot(view.page, states("no-receiver-1440"));
  await view.context.close();
});

test("no photos: dashed 'No photos yet' (desktop, delivered) and 'after delivery' (phone, on the way)", async () => {
  const desk = await withCard("SO26-18447", c => { c.sections.proof = missingFact("POD photos", "Not recorded — no delivery photo was uploaded.", { photos: [] }); });
  const proof = cell(desk.page, "Proof of delivery");
  assert.equal(await proof.locator(".otm-thumb-empty").count(), 3);
  assert.match(await proof.innerText(), /No photos yet/);
  assert.equal(await proof.locator("img").count(), 0);
  assert.equal(desk.requests.filter(u => u.pathname.startsWith("/api/media/")).length, 0, "no photo request without photos");
  await shot(desk.page, states("no-photos-1440"));
  await desk.context.close();
  const phone = await withCard("SO26-18452", () => {}, { width: 390 });
  const card = phone.page.locator(".otp-card:has(#otp-proof)");
  assert.equal(await card.locator(".otm-thumb-empty").count(), 3);
  assert.match(await card.innerText(), /after delivery/);
  await shot(phone.page, states("no-photos-390"));
  await phone.context.close();
});

test("payment unknown: chip Unknown and three dashes, never a guessed amount", async () => {
  const view = await withCard("SO26-18447", c => { c.sections.payment = missingFact("Zoho Books", "Not recorded — no cached invoice for this order."); });
  const pay = cell(view.page, "Payment");
  assert.equal((await pay.locator(".otk-cell-chip").innerText()).trim(), "Unknown");
  assert.deepEqual(await pay.locator(".otk-money-value").allInnerTexts(), ["—", "—", "—"]);
  assert.doesNotMatch(await pay.innerText(), /₱/);
  await shot(view.page, states("payment-unknown-1440"));
  await view.context.close();
});

test("PO number but copy unverified: 'copy not verified' and no green check", async () => {
  const view = await withCard("SO26-18447", () => {});
  const po = cell(view.page, "Documents").locator(".otk-doc").filter({ hasText: "Client PO" });
  assert.match(await po.innerText(), /PO-88213 · copy not verified/);
  assert.equal(await po.locator(".otk-pos").count(), 0, "no green check on an unverified copy");
  assert.equal(await po.evaluate(el => el.classList.contains("otk-doc-unverified")), true);
  await shot(view.page, states("po-unverified-1440"));
  await view.context.close();
});

test("permits: 'Not recorded yet — Logistics can add them' (desktop) and 'Not recorded' tile (phone)", async () => {
  const desk = await withCard("SO26-18447", () => {});
  const permits = cell(desk.page, "Documents").locator(".otk-doc").filter({ hasText: "Delivery permits" });
  assert.match(await permits.innerText(), /Not recorded yet — Logistics can add them/);
  assert.equal(await permits.evaluate(el => el.classList.contains("otk-doc-missing")), true);
  await shot(desk.page, states("permits-1440"));
  await desk.context.close();
  const phone = await withCard("SO26-18452", () => {}, { width: 390 });
  const tile = phone.page.locator(".otp-tile").filter({ hasText: "Permits" });
  assert.match(await tile.innerText(), /Not recorded\s+ask Logistics/);
  await shot(phone.page, states("permits-390"));
  await phone.context.close();
});

test("Sales user with no matching orders: date hint and Call Logistics", async () => {
  const view = await openTracker(browser, { width: 1440, waitFor: "none", list: p => designList(p, []) });
  const { page } = view;
  const empty = page.locator(".otl-empty");
  await empty.waitFor();
  const text = await empty.innerText();
  assert.match(text, /No orders for this date or search\./);
  assert.match(text, /Try another date, filter or reference\./);
  assert.doesNotMatch(text, /recorded salesperson/);
  await empty.getByRole("link", { name: "Call Logistics" }).waitFor();
  assert.equal(await empty.getByRole("link", { name: "Call Logistics" }).getAttribute("href"), "tel:0285550100");
  await shot(page, states("sales-no-orders-1440"));
  await view.context.close();
  const phone = await openTracker(browser, { width: 390, waitFor: "none", list: p => designList(p, []) });
  await phone.page.locator(".otl-empty").waitFor();
  await shot(phone.page, states("sales-no-orders-390"));
  await phone.context.close();
});

// Real SO notes carry WorkDrive links and e-mail addresses: long unbroken strings must wrap inside their card.
const LONG_URL = `https://workdrive.zoho.com/file/${"a1b2c3d4e5".repeat(9)}?preview=true`;   // 120+ characters, no spaces
const LONG_EMAIL = "receiving.department.puregold.guiguinto.bulacan.branch@puregold-supermarkets.example.com.ph";
function longText(c: Card) {
  c.customer = `Puregold Guiguinto ${LONG_EMAIL}`;
  c.sections.customer_rules = { source: "SO notes", as_of: null, state: "recorded", message: null, value: { recorded_rules: { opening_time: "6:00 AM", receiving_cutoff_time: "11:00 AM", notes: `PDF: ${LONG_URL}` }, so_notes: `Email the DR to ${LONG_EMAIL}\nSee ${LONG_URL}` } };
  (c.sections.problems.value as Array<Record<string, unknown>>)[0].description = `Photo of damage: ${LONG_URL}`;
}
for (const width of [390, 1440]) {
  test(`long URLs and e-mail addresses in notes wrap inside their card at ${width}px`, async () => {
    const view = await withCard("SO26-18447", longText, { width });
    const { page } = view;
    await page.getByText(LONG_URL.slice(0, 30), { exact: false }).first().waitFor();
    const problems = await page.evaluate(() => {
      const cards = ".otk-cell, .otk-block, .otk-head, .otk, .otp-card, .otp-tile, .otp-head, .otl, .otq-card, .ot";
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(".ot *"))) {
        if (el.closest(".otm-map, .otq-table, [aria-hidden=true]")) continue;
        if (el.matches(".otp-head, .otp-ask")) continue; // phone header bleeds edge to edge and the Ask bar is fixed - by design
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        const card = el.parentElement?.closest<HTMLElement>(cards);
        if (!card) continue;
        const c = card.getBoundingClientRect();
        if (r.right > c.right + 1 || r.left < c.left - 1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} [${(el.textContent ?? "").trim().slice(0, 40)}] ${Math.round(r.left)}-${Math.round(r.right)} outside ${String(card.className).split(" ")[0]} ${Math.round(c.left)}-${Math.round(c.right)}`);
      }
      return out.slice(0, 8);
    });
    assert.deepEqual(problems, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "no sideways scroll");
    await shot(page, states(`long-text-${width}`));
    await view.context.close();
  });
}
