// TEST-ONLY: opens the Order Tracker with every API call route-mocked from e2e/fixtures/orderTrackerDesign.ts and the
// browser clock frozen at the mockup time (Thu 15 Oct 2026 13:42 Manila). No live API / Zoho / DB calls.
import { crc32, deflateSync } from "node:zlib";
import type { Browser, BrowserContext, Page } from "playwright";
import { BASE } from "./harness.ts";
import { installMocks } from "./mockApi.ts";
import type { Recorder } from "./mockApi.ts";
import { DAY, NOW, designAnswer, designCard, designList, salesUser } from "./fixtures/orderTrackerDesign.ts";
import type { Answer, Card, OrderList } from "../src/services/api/orderTracker.ts";

/** A small solid-colour PNG (stands in for a delivery photo so thumbnails are visible in screenshots). */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PHOTO = solidPng(8, 6, [178, 172, 160]);
export const solidPhoto = PHOTO;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };

export interface TrackerOptions {
  width?: number;
  height?: number;
  dpr?: number;
  role?: string;
  /** Path + query after /app/order-tracker, e.g. "?order=SO26-18447&from=2026-10-15&to=2026-10-15". */
  query?: string;
  /** Replace or edit the card served for an order. */
  card?: (number: string, base: Card | null) => Card | null;
  /** Replace the list response. */
  list?: (params: URLSearchParams) => OrderList;
  askDelayMs?: number;
  answer?: (question: string) => Answer;
  dispatchPhone?: string | null;
  /** Body served for /api/media/<id> (default: a small solid-colour PNG). */
  media?: (id: number) => { body: Buffer; contentType: string };
  waitFor?: "list" | "card" | "phone" | "ask" | "none";
}

export interface TrackerView {
  context: BrowserContext;
  page: Page;
  errors: string[];
  recorder: Recorder;
  /** Every order-tracker / media request URL, in order. */
  requests: URL[];
  /** Authorization header of each /api/media request. */
  mediaAuth: Array<string | undefined>;
  setAskFailure: (fail: boolean) => void;
}

export const orderUrl = (number: string) => `?order=${encodeURIComponent(number)}&from=${DAY}&to=${DAY}`;

export async function openTracker(browser: Browser, opts: TrackerOptions = {}): Promise<TrackerView> {
  const width = opts.width ?? 1440;
  const context = await browser.newContext({ viewport: { width, height: opts.height ?? 900 }, deviceScaleFactor: opts.dpr ?? 1, timezoneId: "Asia/Manila", locale: "en-GB" });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  const requests: URL[] = [];
  const mediaAuth: Array<string | undefined> = [];
  let askFails = false;
  const recorder = await installMocks(page, { session: { user: { ...salesUser, role: opts.role ?? "sales" } } });
  if (opts.dispatchPhone !== undefined) await page.route("http://mock-api.test/auth/support", route => route.fulfill({ contentType: "application/json", headers: CORS, body: JSON.stringify({ dispatch_phone: opts.dispatchPhone }) }));
  await page.route("http://mock-api.test/api/order-tracker/**", async route => {
    const req = route.request();
    const url = new URL(req.url());
    requests.push(url);
    const send = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(value) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-methods": "GET,POST,OPTIONS" } });
    if (url.pathname.endsWith("/feedback")) return send({ recorded: true });
    if (url.pathname.endsWith("/ask")) {
      await new Promise(r => setTimeout(r, opts.askDelayMs ?? 400));
      if (askFails) return send({ detail: "The Ask service is unavailable. Use the Order card." }, 400);
      const question = String(req.postDataJSON()?.question ?? "");
      return send(opts.answer ? opts.answer(question) : designAnswer(question));
    }
    const one = /\/orders\/([^/]+)$/.exec(url.pathname);
    if (one) {
      const number = decodeURIComponent(one[1]);
      const base = designCard(number);
      const found = opts.card ? opts.card(number, base) : base;
      return found ? send(found) : send({ detail: "Order not found." }, 404);
    }
    return send(opts.list ? opts.list(url.searchParams) : designList(url.searchParams));
  });
  await page.route("http://mock-api.test/api/media/**", async route => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    requests.push(new URL(req.url()));
    mediaAuth.push(req.headers()["authorization"]);
    const served = opts.media?.(Number(new URL(req.url()).pathname.split("/").pop())) ?? { body: PHOTO, contentType: "image/png" };
    await route.fulfill({ contentType: served.contentType, headers: CORS, body: served.body });
  });
  await page.goto(`${BASE}/app/order-tracker${opts.query ?? ""}`);
  const wait = opts.waitFor ?? (opts.query?.includes("view=ask") ? "ask" : opts.query?.includes("order=") ? (width <= 640 ? "phone" : "card") : "list");
  if (wait === "list") await page.locator("a.otl-row").first().waitFor();
  else if (wait === "card") await page.locator(".otk-head .otk-number").waitFor(); // not the skeleton (it shares .otk-head)
  else if (wait === "phone") await page.locator(".otp-head .otp-number").waitFor();
  else if (wait === "ask") await page.locator(".otq").waitFor();
  return { context, page, errors, recorder, requests, mediaAuth, setAskFailure: fail => { askFails = fail; } };
}

/** Interactive elements inside `root` smaller than `min` CSS px (the tracker standard is 44). Hidden / sr-only skipped. */
export async function trackerSmallTargets(page: Page, root: string, min = 44): Promise<string[]> {
  return page.evaluate(({ root, min }) => {
    const out: string[] = [];
    const scope = document.querySelector(root);
    if (!scope) return [`${root} not found`];
    const sel = "a[href], button, select, textarea, input:not([type=hidden]):not([type=file]), [role=tab], [tabindex='0']";
    for (const el of Array.from(scope.querySelectorAll<HTMLElement>(sel))) {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      // A ::before hit-area extension counts (the Ask chips are a 36px pill with a 44px hit area).
      const before = getComputedStyle(el, "::before");
      const extra = before.content && before.content !== "none" && before.position === "absolute" ? Math.max(0, -parseFloat(before.top || "0")) + Math.max(0, -parseFloat(before.bottom || "0")) : 0;
      const h = r.height + extra;
      if (h < min - 0.5 || r.width < min - 0.5) out.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}[${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}] ${Math.round(r.width)}x${Math.round(h)}`);
    }
    return out;
  }, { root, min });
}

/** Document scrolls sideways by this many px (0 = none). */
export const sideways = (page: Page) => page.evaluate(() => Math.max(0, (document.scrollingElement ?? document.documentElement).scrollWidth - window.innerWidth));

/** Requests that left the mocks, minus the app shell's known extras (web fonts, the shell's access-alerts poll). */
export const trackerUnexpected = (view: TrackerView) =>
  view.recorder.unexpected.filter(u => !u.includes("fonts.googleapis.com") && !u.includes("/api/access/alerts"));
