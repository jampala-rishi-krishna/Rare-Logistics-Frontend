// Visual comparison of the rebuilt Order Tracker against the approved mockups (docs/design/order-tracker/*.png, 2x).
// The app is captured at deviceScaleFactor 2 with all API calls mocked and the clock frozen at the mockup time.
// Only the tracker content is compared (the real app shell - sidebar, header, bottom nav - differs from the mockup's black
// bar by design, and the mockup's own black bar is cropped away); map tiles, photo tiles and the phone's sticky Ask bar
// are masked. The desktop capture widens the viewport so the tracker content is the mockup's 1361 px content width (1:1
// scale) - the real sidebar would otherwise make it narrower.
//
// FONT-SWAP BASELINE: each screen is also measured for the mockup's own reference HTML rendered in this same headless Chromium
// (docs/design/order-tracker/reference-*.html, Google Fonts blocked like in the app test, so Figtree falls back to the same
// system sans the app gets). That is "identical CSS, different font" - the % the mockup's own code scores against its PNG in this environment, i.e. what any
// implementation sharing the mockup's exact CSS would score here; the app's number is reported next to it. It is higher
// than the app because the fallback face has different metrics, so every line of the unmodified mockup drifts down.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { before, after, test } from "node:test";
import type { Browser, Page } from "playwright";
import { startServer, stopServer, launch, APP_DIR, SHOTS } from "./harness.ts";
import { openTracker, orderUrl } from "./orderTrackerMock.ts";
import type { TrackerOptions } from "./orderTrackerMock.ts";
import { visualDiff } from "./visualDiff.ts";
import type { Rect } from "./visualDiff.ts";
import { ASK_TURNS } from "./fixtures/orderTrackerDesign.ts";

const DESIGN = resolve(APP_DIR, "..", "..", "docs", "design", "order-tracker");
const OUT = join(SHOTS, "order-tracker");
for (const dir of ["visual", "after", "compare"]) mkdirSync(join(OUT, dir), { recursive: true });
const APP_BG = "rgb(248, 247, 245)"; // hsl(40 14% 97%) = --background, only used to pad a shorter capture
const TOLERANCE = 40;

/** Max % of differing pixels per screen: measured value + ~2 points headroom (numbers are logged on every run). */
const LIMIT = { main: 10, card: 9.5, ask: 9, phone: 8 } as const; // measured 2026-10-20: main 8.16, card 7.40, ask 6.91, phone 5.97

let browser: Browser;
before(async () => { await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); stopServer(); });

const S = 2; // design + capture device scale
const dev = (r: Rect): Rect => ({ x: Math.round(r.x * S), y: Math.round(r.y * S), w: Math.round(r.w * S), h: Math.round(r.h * S) });
const rel = (r: Rect, origin: Rect): Rect => ({ x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h });

async function rectOf(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).first().evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
}
async function clipShot(page: Page, clip: Rect): Promise<Buffer> {
  return page.screenshot({ clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h }, animations: "disabled", caret: "hide" });
}
async function settle(page: Page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(400);
}
/** Grow the viewport to the document height so nothing scrolls (fixed/sticky bars then sit at their real place). */
async function growToContent(page: Page, width: number) {
  const tall = await page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollHeight);
  await page.setViewportSize({ width, height: Math.min(Math.max(tall, 900), 6000) });
  await page.waitForTimeout(300);
}

/** The mockup's reference HTML rendered here (fonts blocked), clipped to the same CSS rect as the design crop. */
async function referenceShot(file: string, viewport: { width: number; height: number }, clip: Rect): Promise<Buffer> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: S });
  const page = await context.newPage();
  await page.route("**/*", route => (route.request().url().startsWith("file:") ? route.continue() : route.abort()));
  await page.goto(pathToFileURL(join(DESIGN, file)).href);
  await settle(page);
  const shotBuf = await clipShot(page, clip);
  await context.close();
  return shotBuf;
}

interface Measure { name: string; design: string; app: Buffer; crop: Rect; masks: Rect[]; pad?: string; reference: { file: string; viewport: { width: number; height: number } } }
async function measure(m: Measure) {
  const designPng = readFileSync(join(DESIGN, m.design));
  const crop = dev(m.crop);
  const result = await visualDiff(browser, designPng, m.app, { crop, masks: m.masks, tolerance: TOLERANCE, pad: m.pad ?? "white" });
  writeFileSync(join(OUT, "visual", `${m.name}-diff.png`), result.diff);
  writeFileSync(join(OUT, "visual", `${m.name}-app.png`), m.app);
  writeFileSync(join(OUT, "compare", `${m.name}-design-vs-after.png`), result.composite);
  const ref = await referenceShot(m.reference.file, m.reference.viewport, m.crop);
  const floor = await visualDiff(browser, designPng, ref, { crop, masks: m.masks, tolerance: TOLERANCE, pad: m.pad ?? "white" });
  writeFileSync(join(OUT, "visual", `${m.name}-font-swap-diff.png`), floor.diff);
  console.log(`[visual] ${m.name}: app ${result.percent.toFixed(2)}% | mockup's own HTML re-rendered here ${floor.percent.toFixed(2)}% | region ${result.width}x${result.height} device px, >${TOLERANCE}/channel`);
  return { app: result.percent, floor: floor.percent };
}

async function open(opts: TrackerOptions) { return openTracker(browser, { dpr: S, ...opts }); }

const ORDERS_REF = { file: "reference-desktop-orders.html", viewport: { width: 1425, height: 2000 } };

test("visual: desktop main screen (title, Ask panel, filters, list) and order card SO26-18447 vs Desktop___Orders___order_details.png", async () => {
  // Probe at 1440 to learn the shell width, then widen so the tracker content is the mockup's content width (1361 + 2x4 padding).
  const view = await open({ width: 1440, height: 1200, query: orderUrl("SO26-18447") });
  const { page } = view;
  await page.locator(".otm-thumb img").first().waitFor();
  await settle(page);
  await growToContent(page, 1440);
  await page.screenshot({ path: join(OUT, "after", "selected-1440.png") });
  const probe = await rectOf(page, ".ot");
  const width = Math.round(1440 + (1369 - probe.w));
  await page.setViewportSize({ width, height: 1200 });
  await growToContent(page, width);
  await settle(page);
  const ot = await rectOf(page, ".ot");
  const list = rel(await rectOf(page, ".otl"), ot);
  const cardCol = rel(await rectOf(page, ".ot-card-col"), ot);
  const card = await rectOf(page, ".otk");
  const map = rel(await rectOf(page, ".otk-where-map"), card);
  const thumbs = rel(await rectOf(page, ".otk .otm-thumbs"), card);

  // (1) main screen without the order card: mockup content box starts at (28, 92); both card columns masked.
  const mainH = Math.max(list.y + list.h, 1136 - 92) + 12;
  const main = await measure({
    name: "main-1440", design: "Desktop___Orders___order_details.png", app: await clipShot(page, { x: ot.x, y: ot.y, w: ot.w, h: mainH }),
    crop: { x: 28, y: 92, w: ot.w, h: mainH },
    masks: [dev({ x: Math.min(455 - 28, cardCol.x), y: Math.min(476 - 92, cardCol.y), w: 2000, h: 4000 })],
    reference: ORDERS_REF,
  });
  // (2) the order card: mockup card at (455, 476) to y 1952; maps and photo tiles masked in both.
  const cardRes = await measure({
    name: "card-1440", design: "Desktop___Orders___order_details.png", app: await clipShot(page, card),
    crop: { x: 455, y: 476, w: card.w, h: 1952 - 476 },
    masks: [
      dev({ x: 483 - 455, y: 860 - 476, w: 1025 - 483, h: 200 }), dev(map),
      dev({ x: 951 - 455, y: 1163 - 476, w: 1364 - 951, h: 104 }), dev({ ...thumbs, h: 104 }),
    ],
    reference: ORDERS_REF,
  });
  assert.deepEqual(view.errors, []);
  await view.context.close();
  assert.ok(main.app <= LIMIT.main, `main screen differs ${main.app.toFixed(2)}% (limit ${LIMIT.main}%)`);
  assert.ok(cardRes.app <= LIMIT.card, `order card differs ${cardRes.app.toFixed(2)}% (limit ${LIMIT.card}%)`);
});

test("visual: Ask thread with the four mockup turns vs Desktop___Ask__AI_answers_with_sources_.png", async () => {
  const view = await open({ width: 1440, height: 1000, query: "?view=ask", askDelayMs: 50 });
  const { page } = view;
  for (const [i, question] of ASK_TURNS.entries()) {
    await page.locator("#otq-input").fill(question);
    await page.locator(".otq-send").click();
    await page.locator(".otq-turn").nth(i).locator(".otq-card:not(.otq-card-busy)").waitFor();
  }
  await settle(page);
  await growToContent(page, 1440);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(OUT, "after", "ask-thread-1440.png") });
  const otq = await rectOf(page, ".otq");
  // Mockup: 1425 px frame, 64 px black bar, Ask column 1040 px centred in the frame.
  const res = await measure({
    name: "ask-1440", design: "Desktop___Ask__AI_answers_with_sources_.png", app: await clipShot(page, otq),
    crop: { x: (1425 - otq.w) / 2, y: 64, w: otq.w, h: 1754 - 64 }, masks: [], pad: APP_BG,
    reference: { file: "reference-desktop-ask.html", viewport: { width: 1425, height: 1754 } },
  });
  assert.deepEqual(view.errors, []);
  await view.context.close();
  assert.ok(res.app <= LIMIT.ask, `Ask thread differs ${res.app.toFixed(2)}% (limit ${LIMIT.ask}%)`);
});

test("visual: phone one-order view of SO26-18452 vs Phone___one_order__Sales_on_the_go_.png", async () => {
  const view = await open({ width: 390, height: 844, query: orderUrl("SO26-18452") });
  const { page } = view;
  await settle(page);
  await growToContent(page, 390);
  await page.screenshot({ path: join(OUT, "after", "phone-order-390.png") });
  const head = await rectOf(page, ".otp-head");
  const body = await rectOf(page, ".otp-body");
  const map = await rectOf(page, ".otm-map, .otm-empty");
  const clip = { x: 0, y: head.y, w: 390, h: body.y + body.h + 20 - head.y };
  const res = await measure({
    name: "phone-order-390", design: "Phone___one_order__Sales_on_the_go_.png", app: await clipShot(page, clip),
    crop: { x: 0, y: 0, w: 390, h: 1680 },
    masks: [
      dev({ x: 17, y: 217, w: 357, h: 171 }),                // mockup map
      dev({ x: map.x, y: map.y - head.y, w: map.w, h: map.h }), // app map
      dev({ x: 0, y: 1590, w: 390, h: 90 }),                 // mockup sticky Ask bar (the app bar is outside the clip)
    ],
    pad: APP_BG,
    reference: { file: "reference-phone-order.html", viewport: { width: 390, height: 1680 } },
  });
  assert.deepEqual(view.errors, []);
  await view.context.close();
  assert.ok(res.app <= LIMIT.phone, `phone order differs ${res.app.toFixed(2)}% (limit ${LIMIT.phone}%)`);
});

test("after screenshots: list and selected order at 1440 and 390, Ask thread at 390", async () => {
  for (const width of [1440, 390]) {
    const view = await open({ width, height: 900 });
    await settle(view.page);
    await growToContent(view.page, width);
    await view.page.screenshot({ path: join(OUT, "after", `list-${width}.png`) });
    await view.context.close();
  }
  const phone = await open({ width: 390, height: 844, query: orderUrl("SO26-18447") });
  await phone.page.locator(".otm-thumb img").first().waitFor();
  await settle(phone.page);
  await growToContent(phone.page, 390);
  await phone.page.screenshot({ path: join(OUT, "after", "selected-390.png") });
  await phone.context.close();
  const ask = await open({ width: 390, height: 844, query: "?view=ask", askDelayMs: 50 });
  for (const [i, question] of ASK_TURNS.entries()) {
    await ask.page.locator("#otq-input").fill(question);
    await ask.page.locator(".otq-send").click();
    await ask.page.locator(".otq-turn").nth(i).locator(".otq-card:not(.otq-card-busy)").waitFor();
  }
  await settle(ask.page);
  await growToContent(ask.page, 390);
  await ask.page.evaluate(() => window.scrollTo(0, 0));
  await ask.page.screenshot({ path: join(OUT, "after", "ask-thread-390.png") });
  assert.deepEqual(ask.errors, []);
  await ask.context.close();
});
