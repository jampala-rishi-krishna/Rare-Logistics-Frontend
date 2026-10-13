// TEST-ONLY harness: starts the Vite dev server with a FAKE API origin (every request to it is intercepted by e2e/mockApi.ts),
// launches headless Chromium, and offers the layout assertions used by the screen specs.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { API_ORIGIN } from "./mockApi.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = resolve(here, "..");
export const SHOTS = join(here, "screenshots");
export const PORT = 5199;
export const BASE = `http://localhost:${PORT}`;

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

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

// ---- layout assertions (run inside the page) ----

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
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
