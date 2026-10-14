// TEST-ONLY harness: starts the Vite dev server with a FAKE API origin (every request to it is intercepted by e2e/mockApi.ts),
// launches headless Chromium, and offers the layout assertions used by the screen specs.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { API_ORIGIN } from "./mockApi.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = resolve(here, "..");
export const SHOTS = join(here, "screenshots");
// Each spec file runs in its own process (node --test runs files in parallel), so each one starts its own dev server on a free port.
export let PORT = 5199;
export let BASE = `http://localhost:${PORT}`;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

let server: ChildProcess | null = null;

async function waitFor(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`dev server did not start: ${url}`);
}

export async function startServer(): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  PORT = await freePort();
  BASE = `http://localhost:${PORT}`;
  server = spawn(process.execPath, [join(APP_DIR, "node_modules", "vite", "bin", "vite.js"), "--config", "vite.config.ts"], {
    cwd: APP_DIR,
    env: { ...process.env, PORT: String(PORT), VITE_API_BASE_URL: API_ORIGIN, VITE_CARTRACK_WS_URL: "ws://127.0.0.1:1/never", VITE_GOOGLE_MAPS_API_KEY: "" },
    stdio: "ignore",
  });
  await waitFor(`${BASE}/driver/login`, 120_000);
}

export function stopServer(): void {
  server?.kill();
  server = null;
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function newContext(browser: Browser, width = 360, height = 740): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "en-GB", timezoneId: "Asia/Manila", permissions: ["geolocation"], geolocation: { latitude: 14.5995, longitude: 120.9842, accuracy: 15 } });
}

export async function shot(page: Page, name: string, fullPage = true): Promise<void> {
  const path = join(SHOTS, `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  const size = page.viewportSize();
  const tall = fullPage && size ? await page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollHeight) : 0;
  if (!size || !fullPage || tall <= size.height) {
    await page.screenshot({ path, fullPage });
    return;
  }
  // A full-page capture leaves position:fixed bars where the viewport ended (over the content). Grow the viewport to the
  // page height instead, so the bottom nav / action bar is drawn at the real bottom, then restore it.
  await page.setViewportSize({ width: size.width, height: Math.min(tall, 6000) });
  await page.waitForTimeout(250);
  await page.screenshot({ path });
  await page.setViewportSize(size);
  await page.waitForTimeout(100);
}

// ---- layout assertions (run inside the page) ----

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, (document.scrollingElement ?? document.documentElement).scrollWidth - window.innerWidth));
}

// Interactive elements smaller than 48 CSS px in either direction (leaflet controls, hidden file inputs and inline-in-text links excluded).
export async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = "a[href], button, select, textarea, input:not([type=hidden]):not([type=file]):not([type=radio]):not([type=checkbox]), [role=tab], [role=radio]";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest(".leaflet-container")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.width <= 1 || r.height <= 1) continue; // sr-only
      if (el.tagName === "A" && el.closest("p, li > span")) continue; // inline link inside running text
      if (r.height < 47.5 || r.width < 47.5) out.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? (el.textContent ?? "").trim().slice(0, 28)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

// After scrolling to the bottom, nothing of the page content may sit behind the fixed bottom bar (nav or sticky submit bar).
export async function hiddenBehindBottomBar(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" as ScrollBehavior });
    await new Promise((r) => setTimeout(r, 250));
    const bars = Array.from(document.querySelectorAll<HTMLElement>("nav[aria-label='Driver navigation'], div.fixed.bottom-0"))
      .filter((b) => getComputedStyle(b).position === "fixed" && b.getBoundingClientRect().height > 0);
    if (bars.length === 0) return null;
    const top = Math.min(...bars.map((b) => b.getBoundingClientRect().top));
    const main = document.querySelector("main");
    const last = main ? Array.from(main.querySelectorAll<HTMLElement>("*")).filter((e) => e.getBoundingClientRect().height > 0 && !e.closest(".fixed")).pop() : null;
    if (!last) return null;
    const bottom = last.getBoundingClientRect().bottom;
    return bottom > top + 1 ? `content bottom ${Math.round(bottom)} is under the bar at ${Math.round(top)}` : null;
  });
}

// Buttons / links whose text colour is (nearly) the same as their own background: the text would be invisible (e.g. black on black).
export async function invisibleText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("a[href], button"))) {
      const text = (el.textContent ?? "").trim();
      const r = el.getBoundingClientRect();
      if (!text || r.width < 2 || r.height < 2 || el.closest(".leaflet-container")) continue;
      const s = getComputedStyle(el);
      const bg = parse(s.backgroundColor);
      const fg = parse(s.color);
      if (bg.length < 3 || fg.length < 3 || (bg.length === 4 && bg[3] === 0)) continue;
      if (Math.abs(bg[0] - fg[0]) + Math.abs(bg[1] - fg[1]) + Math.abs(bg[2] - fg[2]) < 60) out.push(`${el.tagName.toLowerCase()}[${text.slice(0, 30)}]`);
    }
    return out;
  });
}

// Driver app (inline-styled, no <main>): scroll to the bottom, find the bar(s) fixed to the bottom edge (bottom nav / trip action
// bar; sheets and toasts excluded) and check that the last visible content element ends above the bar.
export async function coveredByFixedBottom(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const root = document.scrollingElement ?? document.documentElement;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, root.scrollHeight);
    await new Promise((r) => setTimeout(r, 300));
    const all = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
    const fixed = (el: Element) => getComputedStyle(el).position === "fixed";
    const inFixed = (el: Element | null) => {
      for (let e = el; e; e = e.parentElement) if (fixed(e)) return true;
      return false;
    };
    const bars = all.filter((el) => {
      if (!fixed(el) || el.closest("[role=dialog]") || el.getAttribute("aria-live")) return false;
      const r = el.getBoundingClientRect();
      return r.height > 0 && Math.abs(r.bottom - window.innerHeight) < 2 && r.width >= window.innerWidth * 0.9;
    });
    if (bars.length === 0) return null;
    const top = Math.min(...bars.map((b) => b.getBoundingClientRect().top));
    const leafy = (el: HTMLElement) => ["BUTTON", "A", "INPUT", "IMG", "TEXTAREA", "SELECT", "svg"].includes(el.tagName) || Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
    let worst: HTMLElement | null = null;
    let bottom = 0;
    for (const el of all) {
      if (inFixed(el) || el.closest("[aria-hidden=true]") || !leafy(el)) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.height <= 1 || r.width <= 1) continue;
      if (r.bottom > bottom) [bottom, worst] = [r.bottom, el];
    }
    if (!worst) return null;
    const what = `${worst.tagName.toLowerCase()}[${worst.getAttribute("data-testid") ?? (worst.textContent ?? "").trim().slice(0, 30)}]`;
    return bottom > top + 1 ? `${what} bottom ${Math.round(bottom)} is under the fixed bar at ${Math.round(top)}` : null;
  });
}

// A bottom sheet: its scroll panel has no sideways scroll and, scrolled to its end, the last control is fully on screen.
export async function sheetProblems(page: Page, testId: string): Promise<string[]> {
  return page.evaluate(async (id) => {
    const out: string[] = [];
    const dialog = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!dialog) return [`sheet ${id} not open`];
    const panel = Array.from(dialog.querySelectorAll<HTMLElement>("*")).find((e) => getComputedStyle(e).overflowY === "auto");
    if (!panel) return [`sheet ${id} has no scroll panel`];
    if (panel.scrollWidth > panel.clientWidth + 1) out.push(`sheet scrolls sideways by ${panel.scrollWidth - panel.clientWidth}px`);
    panel.scrollTop = panel.scrollHeight;
    await new Promise((r) => setTimeout(r, 200));
    const controls = Array.from(panel.querySelectorAll<HTMLElement>("button, input:not([type=file]), textarea")).filter((e) => e.getBoundingClientRect().height > 1);
    const last = controls[controls.length - 1];
    if (last && last.getBoundingClientRect().bottom > window.innerHeight + 1) out.push(`last control ends at ${Math.round(last.getBoundingClientRect().bottom)} below the screen (${window.innerHeight})`);
    const wide = Array.from(panel.querySelectorAll<HTMLElement>("*")).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1);
    if (wide.length) out.push(`${wide.length} element(s) wider than the screen, e.g. ${wide[0].tagName.toLowerCase()}[${(wide[0].textContent ?? "").trim().slice(0, 24)}]`);
    return out;
  }, testId);
}
