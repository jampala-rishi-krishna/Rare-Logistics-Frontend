// Explicit opt-in production UI smoke check; never part of *.test.ts / CI.
// Reads current-day records only. Never submits Ask, changes orders, or prints credentials.
// Screenshots contain REAL customer data: they are written locally and must not be committed.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { chromium } from "playwright";
import type { Page } from "playwright";

const root = resolve(import.meta.dirname, "../../..");
const origin = "https://rare-logistics-frontend.rishi-315.workers.dev";
const api = "https://rgf-logistics-backend.onrender.com";
const output = resolve(import.meta.dirname, "screenshots/order-tracker/production");
mkdirSync(output, { recursive: true });
const report: Record<string, unknown> = { frontend: origin, live_ai_called: false, business_writes: false };
// The redesigned card: Journey plus the six detail sections (Status now / Truck location / Times live in the header chip, Journey and Location row).
const DESKTOP_SECTIONS = ["Journey", "Delivery result", "Proof of delivery", "Payment", "Documents", "Customer delivery rules", "Loading check"];
const PHONE_SECTIONS = ["Journey", "Delivery rules", "Proof of delivery"];

const file = (name: string) => resolve(output, name.replace(/[^A-Za-z0-9_-]/g, "_") + ".png");
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

async function run() {
  const html = await fetch(origin + "/app/order-tracker", { signal: AbortSignal.timeout(30000) });
  report.frontend_http = html.status;
  const source = await html.text();
  const bundle = source.match(/<script[^>]*src="([^"]+\.js)"/i)?.[1];
  if (!bundle) { report.blocked = "Frontend JavaScript bundle was not found."; return; }
  report.bundle = bundle;
  const script = await fetch(new URL(bundle, origin), { signal: AbortSignal.timeout(30000) }).then(r => r.text());
  report.tracker_bundle_present = script.includes("Ask about any order");
  if (!report.tracker_bundle_present) { report.blocked = "The redesigned Tracker has not reached this origin yet."; return; }
  const env = parseEnv(readFileSync(resolve(root, "backend/.env"), "utf8"));
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) { report.blocked = "Local admin credentials are unavailable; no login attempted."; return; }
  const login = await fetch(api + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }), signal: AbortSignal.timeout(30000) });
  if (!login.ok) { report.blocked = "One admin login attempt was unsuccessful."; return; }
  const session = await login.json();
  if (session.user?.role !== "admin") { report.blocked = "The configured account is not an administrator."; return; }
  const headers = { Authorization: "Bearer " + session.token };
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const ordersResponse = await fetch(api + `/api/order-tracker/orders?date_from=${day}&date_to=${day}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!ordersResponse.ok) { report.blocked = "The current-day Tracker list was unavailable."; return; }
  const list = await ordersResponse.json();
  report.list_total = list.total; report.list_counts = list.counts ?? "missing";
  report.row_fields_present = list.orders.length ? ["stop", "total_stops", "event"].every(k => k in list.orders[0]) : "no rows";
  // Prefer orders in different states so the check covers more of the card.
  const sos = list.orders.filter((r: { order_type: string }) => ["SO", "WM"].includes(r.order_type));
  const picked: Array<{ number: string; status: string }> = [];
  for (const row of sos) if (picked.length < 3 && !picked.some(p => p.status === row.status)) picked.push(row);
  for (const row of sos) if (picked.length < 3 && !picked.includes(row)) picked.push(row);
  const browser = await chromium.launch({ headless: true });
  const unexpected: string[] = [], errors: string[] = [], checked: unknown[] = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, deviceScaleFactor: width > 600 ? 1 : 2, timezoneId: "Asia/Manila" });
      await context.addInitScript(token => localStorage.setItem("if-access-token", token), session.token);
      const page = await context.newPage();
      await page.route("**/api/order-tracker/ask", route => { unexpected.push("Ask was unexpectedly requested"); return route.abort(); });
      await page.route("**/api/order-tracker/feedback", route => { unexpected.push("Feedback was unexpectedly requested"); return route.abort(); });
      page.on("pageerror", e => errors.push(`${width}: ${e.name}`));
      page.on("request", req => { if (new URL(req.url()).origin === api && !["GET", "OPTIONS"].includes(req.method())) unexpected.push(req.method() + " " + new URL(req.url()).pathname); });
      await page.goto(origin + "/app/order-tracker", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Order Tracker", exact: true }).waitFor({ timeout: 40000 });
      await page.locator(".otl-rows, .otl-empty, [class*='otl-empty']").first().waitFor({ timeout: 40000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: file(`list-${width}`), fullPage: true });
      checked.push({ width, view: "list", sideways_scroll: await sideways(page) });
      for (const row of picked) {
        await page.goto(origin + `/app/order-tracker?order=${encodeURIComponent(row.number)}&from=${day}&to=${day}`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: row.number, exact: true }).waitFor({ timeout: 40000 });
        const wanted = width > 640 ? DESKTOP_SECTIONS : PHONE_SECTIONS;
        await page.getByRole("heading", { name: wanted[wanted.length - 1], exact: true }).waitFor({ timeout: 20000 });
        const present = [];
        for (const name of wanted) if (await page.getByRole("heading", { name, exact: true }).count()) present.push(name);
        if (present.length !== wanted.length) throw new Error(`Order card at ${width}px is missing sections`);
        await page.waitForTimeout(1200);
        checked.push({ width, order: row.number, status: row.status, sections: present.length, sideways_scroll: await sideways(page) });
        await page.screenshot({ path: file(`${row.number}-${width}`), fullPage: true });
      }
      await context.close();
    }
  } finally { await browser.close(); }
  report.checked = checked; report.page_errors = errors; report.unexpected_requests = unexpected;
  report.live_ai_called = unexpected.some(u => u.includes("Ask"));
  report.business_writes = unexpected.some(u => !u.includes("Ask") && !u.includes("Feedback"));
}

try { await run(); } catch (error) { report.blocked = "Production browser check could not finish."; report.error_type = error instanceof Error ? error.name : "Unknown"; report.error_message = error instanceof Error ? error.message.slice(0, 200) : undefined; }
writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
