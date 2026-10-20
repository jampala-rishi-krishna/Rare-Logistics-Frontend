// Explicit opt-in production UI smoke check; never part of *.test.ts / CI.
// Reads current-day records only. Never submits Ask, changes orders, or prints credentials.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../../..");
const origin = "https://rare-logistics-frontend.rishi-315.workers.dev";
const api = "https://rgf-logistics-backend.onrender.com";
const output = resolve(root, "tmp/order-tracker-live-ui");
mkdirSync(output, { recursive: true });
const report: Record<string, unknown> = { frontend: origin, live_ai_called: false, business_writes: false };

async function run() {
  const html = await fetch(origin + "/app/order-tracker", { signal: AbortSignal.timeout(30000) });
  report.frontend_http = html.status;
  const source = await html.text();
  const bundle = source.match(/<script[^>]*src="([^"]+\.js)"/i)?.[1];
  if (!bundle) { report.blocked = "Frontend JavaScript bundle was not found."; return; }
  const script = await fetch(new URL(bundle, origin), { signal: AbortSignal.timeout(30000) }).then(r => r.text());
  report.tracker_bundle_present = script.includes("YOUR ORDERS, WITH THE RECORDS");
  if (!report.tracker_bundle_present) { report.blocked = "Frontend deployment has not reached this origin yet."; return; }
  const env = parseEnv(readFileSync(resolve(root, "backend/.env"), "utf8"));
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) { report.blocked = "Local admin credentials are unavailable; no login attempted."; return; }
  const login = await fetch(api + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }), signal: AbortSignal.timeout(30000) });
  if (!login.ok) { report.blocked = "One admin login attempt was unsuccessful."; return; }
  const session = await login.json();
  if (session.user?.role !== "admin") { report.blocked = "The configured account is not an administrator."; return; }
  const headers = { Authorization: "Bearer " + session.token };
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const overview = await fetch(api + `/api/driver-overview/trips?date=${day}`, { headers, signal: AbortSignal.timeout(40000) });
  report.overview_http = overview.status;
  const ordersResponse = await fetch(api + `/api/order-tracker/orders?date_from=${day}&date_to=${day}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!ordersResponse.ok) { report.blocked = "The current-day Tracker list was unavailable."; return; }
  const orders = (await ordersResponse.json()).orders.filter((r: { order_type: string }) => ["SO", "WM"].includes(r.order_type)).slice(0, 3);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Manila" });
    await context.addInitScript(token => localStorage.setItem("if-access-token", token), session.token);
    const page = await context.newPage();
    const unexpectedWrites: string[] = [], errors: string[] = [];
    await page.route("**/api/order-tracker/ask", route => { unexpectedWrites.push("Ask was unexpectedly requested"); return route.abort(); });
    page.on("pageerror", e => errors.push(e.name));
    page.on("request", req => { if (new URL(req.url()).origin === api && !["GET", "OPTIONS"].includes(req.method())) unexpectedWrites.push(req.method() + " " + new URL(req.url()).pathname); });
    await page.goto(origin + "/app/order-tracker", { waitUntil: "domcontentloaded" });
    await page.locator(".ot h1").waitFor({ timeout: 40000 });
    await page.locator(".ot-results-head").waitFor();
    await page.screenshot({ path: resolve(output, "list-1440.png"), fullPage: true });
    const checked = [];
    for (const row of orders) {
      await page.goto(origin + `/app/order-tracker?order=${encodeURIComponent(row.number)}&from=${day}&to=${day}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: row.number, exact: true }).waitFor({ timeout: 40000 });
      await page.getByRole("heading", { name: "Loading check", exact: true }).waitFor();
      const count = await page.locator(".ot-section").count();
      if (count !== 10) throw new Error("Order card is missing sections");
      checked.push({ order: row.number, sections: count, sideways_scroll: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) });
      await page.screenshot({ path: resolve(output, row.number.replace(/[^A-Za-z0-9_-]/g, "_") + ".png"), fullPage: true });
    }
    report.orders = checked; report.page_errors = errors; report.unexpected_posts = unexpectedWrites;
    await context.close();
  } finally { await browser.close(); }
}

try { await run(); } catch (error) { report.blocked = "Production browser check could not finish."; report.error_type = error instanceof Error ? error.name : "Unknown"; }
writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
