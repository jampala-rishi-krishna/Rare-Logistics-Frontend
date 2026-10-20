import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import AxeBuilder from "@axe-core/playwright";
import type { Browser } from "playwright";
import { startServer, stopServer, launch, BASE, shot } from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import { card, rows, day } from "./fixtures/orderTrackerData.ts";

let browser: Browser;
before(async () => { await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); stopServer(); });

async function open(width = 390, mode = "list", role = "sales") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "Asia/Manila" });
  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", e => errors.push(String(e)));
  const queries: URL[] = []; let failAsk = false;
  await installMocks(page, { session: { user: { id: 5, email: "ana@example.test", fullName: "Ana Cruz", full_name: "Ana Cruz", role, status: "active", is_manager: false } } });
  await page.route("http://mock-api.test/api/order-tracker/**", async route => {
    const url = new URL(route.request().url()); queries.push(url);
    const send = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(value) });
    if (url.pathname.endsWith("/feedback")) return send({ recorded: true });
    if (url.pathname.endsWith("/ask")) {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (failAsk) return send({ detail: "The Ask service is unavailable. Use the Order card." }, 400);
      if (String(route.request().postDataJSON().question).includes("leave")) return send({ answer_id: "b".repeat(32), answer: "SO-100 left the warehouse at 8:30 AM Manila time, according to the recorded trip start.", not_recorded: false, tools: ["order_times"], sources: [{ source: "Trip start record", as_of: `${day}T08:30:00+08:00`, link: `/app/order-tracker?order=SO-100&from=${day}&to=${day}`, not_recorded: false }] });
      return send({ answer_id: "a".repeat(32), answer: "Not recorded — the receiver name was not captured. Ask Logistics to add it to the delivery form.", not_recorded: true, tools: ["delivery_result"], sources: [{ source: "Recorded stop / checkout answers", as_of: `${day}T08:30:00+08:00`, link: `/app/order-tracker?order=SO-100&from=${day}&to=${day}`, not_recorded: true }] });
    }
    if (/\/orders\/[^/]+$/.test(url.pathname)) {
      const detail = card(mode === "list" ? "delivered" : mode);
      if (mode === "proof") detail.sections.proof = { source: "Authenticated delivery proof", as_of: `${day}T08:30:00+08:00`, state: "recorded", message: null, value: { photos: [{ photo_id: 41, order: "SO-100", captured_at: `${day}T08:30:00+08:00`, result: "Delivered" }] } };
      return send(detail);
    }
    const q = url.searchParams.get("q") ?? "", status = url.searchParams.get("status");
    const filtered = rows.filter(r => (!q || r.number.includes(q)) && (!status || status === "all" || status === "problems" ? status !== "problems" || r.status === "Partly delivered" : r.status === status));
    return send({ orders: filtered, total: filtered.length, offset: 0, scope: "Exact salesperson name matches only", coverage: "Accessible cached records only." });
  });
  await page.route("http://mock-api.test/api/media/**", async route => {
    queries.push(new URL(route.request().url()));
    await route.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lS8AAAAASUVORK5CYII=", "base64") });
  });
  await page.goto(`${BASE}/app/order-tracker${mode === "list" ? "" : `?order=SO-100&from=${day}&to=${day}`}`);
  await page.locator(".ot h1").waitFor();
  if (mode === "list") await page.locator(".ot-order").first().waitFor(); else await page.getByRole("heading", { name: "Delivery result", exact: true }).waitFor();
  return { context, page, errors, queries, failAsk: () => { failAsk = true; } };
}

for (const width of [390, 1440]) {
  for (const mode of ["list", "delivered", "partial", "ontrip"]) {
    test(`Order Tracker ${mode} at ${width}px: layout, screenshot, axe`, async () => {
      const { context, page, errors } = await open(width, mode);
      assert.ok(await page.locator('a[href="/app/order-tracker"]').count());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const result = await new AxeBuilder({ page }).include(".ot").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
      await shot(page, `order-tracker/${mode}-${width}`);
      assert.deepEqual(errors, []); await context.close();
    });
  }
}

test("search submits explicitly, filters work, and a card opens", async () => {
  const { context, page, errors, queries } = await open();
  const before = queries.length;
  await page.getByRole("textbox", { name: "Find an order", exact: true }).fill("SO-101");
  assert.equal(queries.length, before);
  await Promise.all([
    page.waitForResponse(r => r.url().includes("q=SO-101")),
    page.getByRole("button", { name: "Search", exact: true }).click(),
  ]);
  await page.locator(".ot-order").first().waitFor();
  assert.equal(await page.locator(".ot-order").count(), 1);
  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await page.locator(".ot-order").first().click();
  await page.getByRole("heading", { name: "Loading check", exact: true }).waitFor();
  assert.deepEqual(errors, []); await context.close();
});

for (const width of [390, 1440]) test(`Ask loading, sources, not-recorded, feedback and error at ${width}px`, async () => {
  const view = await open(width, "delivered"); const { page, context } = view;
  await page.getByRole("textbox", { name: "Your question" }).fill("Who received SO-100?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByRole("button", { name: "Looking up records…" }).waitFor();
  await page.locator(".ot-answer").waitFor();
  assert.match(await page.locator(".ot-answer").innerText(), /Not recorded/);
  await page.getByRole("button", { name: "Helpful answer", exact: true }).click();
  await page.getByText("Feedback received.", { exact: true }).waitFor();
  await shot(page, `order-tracker/ask-not-recorded-${width}`);
  const axe = await new AxeBuilder({ page }).include(".ot").analyze();
  assert.deepEqual(axe.violations.map(v => v.id), []);
  await page.getByRole("textbox", { name: "Your question" }).fill("When did SO-100 leave the warehouse?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.locator(".ot-answer").filter({ hasText: "8:30 AM Manila time" }).waitFor();
  await shot(page, `order-tracker/ask-recorded-${width}`);
  view.failAsk(); await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Ask service is unavailable" }).waitFor();
  assert.deepEqual(view.errors, []); await context.close();
});

test("Wet Market sees the tab and warehouse role cannot open it", async () => {
  const view = await open(1440, "list", "wet_market"); await view.context.close();
  const context = await browser.newContext(); const page = await context.newPage();
  await installMocks(page, { session: { user: { id: 9, email: "warehouse@example.test", fullName: "Warehouse", role: "warehouse", status: "active" } } });
  await page.goto(`${BASE}/app/order-tracker`);
  await page.waitForURL("**/warehouse/dashboard");
  assert.equal(await page.locator(".ot").count(), 0);
  await context.close();
});

test("proof photo is fetched with authentication and the read-only flag", async () => {
  const { page, context, queries } = await open(390, "proof");
  await page.locator(".ot-proof img").waitFor();
  assert.ok(queries.some(url => url.pathname === "/api/media/41" && url.searchParams.get("read_only") === "true"));
  await context.close();
});
