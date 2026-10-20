// Order Tracker (rebuilt UI) behaviour + layout + accessibility. All API calls are route-mocked from
// e2e/fixtures/orderTrackerDesign.ts; the browser clock is frozen at Thu 15 Oct 2026 13:42 Manila.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "playwright";
import { startServer, stopServer, launch, shot } from "./harness.ts";
import { openTracker, orderUrl, sideways, solidPhoto, trackerSmallTargets, trackerUnexpected } from "./orderTrackerMock.ts";

let browser: Browser;
before(async () => { await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); stopServer(); });

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).include(".ot").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], label);
}
const MODES: Record<string, string> = { list: "", delivered: orderUrl("SO26-18441"), partial: orderUrl("SO26-18447"), ontrip: orderUrl("SO26-18452") };
const askRequests = (urls: URL[]) => urls.filter(u => u.pathname.endsWith("/ask")).length;

for (const width of [390, 1440]) {
  for (const [mode, query] of Object.entries(MODES)) {
    test(`Order Tracker ${mode} at ${width}px: layout, screenshot, axe`, async () => {
      const view = await openTracker(browser, { width, query });
      const { page } = view;
      if (mode !== "list" && width > 640) await page.getByRole("heading", { name: "Delivery result", exact: true }).waitFor();
      assert.ok(await page.locator('a[href="/app/order-tracker"]').count(), "the Order Tracker tab is in the navigation");
      assert.equal(await sideways(page), 0);
      await axe(page, `${mode} ${width}`);
      await shot(page, `order-tracker/${mode}-${width}`);
      assert.deepEqual(view.errors, []);
      assert.deepEqual(trackerUnexpected(view), []);
      await view.context.close();
    });
  }
}

test("search submits explicitly (no request per keystroke), filters work, and a card opens", async () => {
  const view = await openTracker(browser, { width: 1440 });
  const { page, requests } = view;
  const listCalls = () => requests.filter(u => u.pathname.endsWith("/orders")).length;
  assert.equal(await page.locator("a.otl-row").count(), 6, "collapsed list shows 6 of 12");
  const before = listCalls();
  await page.getByRole("textbox", { name: "Search orders", exact: true }).pressSequentially("18452", { delay: 20 });
  await page.waitForTimeout(300);
  assert.equal(listCalls(), before, "typing alone does not request");
  await Promise.all([
    page.waitForResponse(r => r.url().includes("q=18452")),
    page.getByRole("button", { name: "Search", exact: true }).click(),
  ]);
  await page.waitForFunction(() => document.querySelectorAll("a.otl-row").length === 1);
  assert.match(await page.locator("a.otl-row").innerText(), /SO26-18452/);
  // clear the search, then the Problems quick filter
  await page.getByRole("textbox", { name: "Search orders", exact: true }).fill("");
  await page.getByRole("textbox", { name: "Search orders", exact: true }).press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("a.otl-row").length === 6);
  await Promise.all([
    page.waitForResponse(r => r.url().includes("status=problems")),
    page.getByRole("button", { name: "Problems", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "Problems 2", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Problems 2" }).getAttribute("aria-pressed"), "true");
  assert.deepEqual(await page.locator("a.otl-row .otl-num").allInnerTexts(), ["SO26-18447", "SO26-18439"]);
  await page.locator("a.otl-row").first().click();
  await page.getByRole("heading", { name: "Loading check", exact: true }).waitFor();
  assert.match(page.url(), /order=SO26-18447/);
  assert.equal(await page.locator("a.otl-row.otl-current").count(), 1);
  assert.deepEqual(view.errors, []);
  await view.context.close();
});

for (const width of [390, 1440]) {
  test(`Ask at ${width}px: loading, not-recorded, feedback once, answer with sources, error with Retry`, async () => {
    const view = await openTracker(browser, { width, askDelayMs: 700 });
    const { page, requests } = view;
    await page.locator("#ota-question").fill("Do we have the delivery permit for SM Hypermarket Malolos?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.waitForURL(/view=ask/);
    await page.getByRole("button", { name: "Looking up records…" }).waitFor();
    await page.getByText("Checking recorded facts. This can take up to 30 seconds.").waitFor();
    const nr = page.locator(".otq-card-dashed");
    await nr.waitFor();
    assert.match(await nr.innerText(), /Not recorded\./);
    assert.equal((await nr.innerText()).match(/doesn't store delivery permits/g)?.length, 1, "the not-recorded message is shown once");
    await page.getByRole("button", { name: "Helpful answer", exact: true }).click();
    await page.getByText("Feedback received.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Helpful answer", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Unhelpful answer", exact: true }).isDisabled(), true);
    assert.equal(requests.filter(u => u.pathname.endsWith("/feedback")).length, 1, "feedback is sent once");
    await shot(page, `order-tracker/ask-not-recorded-${width}`);
    await axe(page, `ask not-recorded ${width}`);

    await page.locator("#otq-input").fill("When did SO26-18452 leave the warehouse?");
    await page.locator(".otq-send").click();
    const answer = page.locator(".otq-turn").nth(1).locator(".otq-card");
    await answer.filter({ hasText: "left the warehouse at 07:15" }).waitFor();
    assert.match(await answer.innerText(), /Source: Trip start record · as of 07:15/);
    await answer.getByRole("button", { name: "Trip start record" }).waitFor();
    await shot(page, `order-tracker/ask-recorded-${width}`);

    view.setAskFailure(true);
    await page.locator("#otq-input").fill("Where is my truck now?");
    await page.locator(".otq-send").click();
    const alert = page.getByRole("alert").filter({ hasText: "Ask service is unavailable" });
    await alert.waitFor();
    await shot(page, `order-tracker/ask-error-${width}`);
    view.setAskFailure(false);
    const asked = askRequests(requests);
    await alert.getByRole("button", { name: "Retry" }).click();
    await page.locator(".otq-turn").nth(2).locator(".otq-card").filter({ hasText: "NAJ 6018 is on the way" }).waitFor();
    assert.equal(askRequests(requests), asked + 1);
    assert.equal(await sideways(page), 0);
    assert.deepEqual(view.errors, []);
    await view.context.close();
  });
}

test("a suggested-question chip fills and sends the question", async () => {
  const view = await openTracker(browser, { width: 1440, askDelayMs: 50 });
  const { page, requests } = view;
  const ask = page.waitForRequest(r => r.url().endsWith("/api/order-tracker/ask") && r.method() === "POST");
  await page.getByRole("button", { name: "Which orders were rejected today?", exact: true }).click();
  const request = await ask;
  assert.equal(request.postDataJSON().question, "Which orders were rejected today?");
  await page.waitForURL(/view=ask/);
  assert.equal(await page.locator(".otq-q").first().innerText(), "Which orders were rejected today?");
  await page.getByRole("table").waitFor();
  assert.deepEqual(await page.locator(".otq-order-link").allInnerTexts(), ["SO26-18447", "SO26-18439"]);
  assert.equal(askRequests(requests), 1);
  assert.deepEqual(view.errors, []);
  await view.context.close();
});

test("Wet Market sees the tab and the warehouse role is redirected away", async () => {
  const wet = await openTracker(browser, { width: 1440, role: "wet_market" });
  assert.ok(await wet.page.locator('a[href="/app/order-tracker"]').count());
  assert.ok(await wet.page.locator("a.otl-row").count() > 0);
  await wet.context.close();
  const wh = await openTracker(browser, { width: 1440, role: "warehouse", waitFor: "none" });
  await wh.page.waitForURL("**/warehouse/dashboard");
  assert.equal(await wh.page.locator(".ot").count(), 0);
  await wh.context.close();
});

for (const width of [1440, 390]) test(`proof photos at ${width}px: fetched with auth + read_only, and the thumbnails actually paint`, async () => {
  const view = await openTracker(browser, { width, query: orderUrl("SO26-18447") });
  const { page } = view;
  await page.waitForFunction(() => document.querySelectorAll(".otm-thumb img").length === 3 && Array.from(document.querySelectorAll<HTMLImageElement>(".otm-thumb img")).every(i => i.complete && i.naturalWidth > 0));
  const media = view.requests.filter(u => u.pathname.startsWith("/api/media/"));
  for (const id of [41, 42, 43]) assert.ok(media.some(u => u.pathname === `/api/media/${id}` && u.searchParams.get("read_only") === "true"), media.map(String).join());
  assert.ok(view.mediaAuth.length >= 3 && view.mediaAuth.every(h => h === "Bearer test-token-not-real"), `auth: ${view.mediaAuth.join()}`);
  const painted = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>(".otm-thumb img")).map(img => {
    const r = img.getBoundingClientRect();
    const c = document.createElement("canvas"); c.width = 4; c.height = 4;
    const x = c.getContext("2d")!; x.drawImage(img, 0, 0, 4, 4);
    const [red, green, blue, alpha] = x.getImageData(2, 2, 1, 1).data;
    const s = getComputedStyle(img);
    return { w: Math.round(r.width), h: Math.round(r.height), nat: img.naturalWidth, visible: s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0, rgba: [red, green, blue, alpha] };
  }));
  for (const p of painted) {
    assert.ok(p.w > 40 && p.h > 40 && p.nat > 0 && p.visible, JSON.stringify(p));
    assert.deepEqual(p.rgba, [178, 172, 160, 255], "the fixture photo colour is what is drawn");
  }
  await page.locator(".otm-thumb").first().screenshot({ path: `e2e/screenshots/order-tracker/states/photo-thumb-${width}.png` });
  await view.context.close();
});

test("a non-image media body shows 'Photo unavailable' with Retry instead of a blank tile", async () => {
  // Root cause of the blank thumbnails seen in the first compare image: the old fixture was a 1x1 PNG with a bad zlib
  // checksum that Chromium still decodes - to one opaque WHITE pixel, stretched over the tile. It is kept for photo 43 to
  // document that; photo 42 gets an HTML body (an error page served as 200), which must not paint as an empty tile.
  const corrupt = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lS8AAAAASUVORK5CYII=", "base64");
  const view = await openTracker(browser, { width: 1440, query: orderUrl("SO26-18447"), media: id => id === 43 ? { body: corrupt, contentType: "image/png" } : id === 42 ? { body: Buffer.from("<html>error</html>"), contentType: "text/html" } : { body: solidPhoto, contentType: "image/png" } });
  const { page } = view;
  await page.locator(".otm-thumb img").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".otm-thumb-error").length >= 1);
  await page.waitForTimeout(500);
  const errors = await page.locator(".otm-thumb-error").count();
  const legacy = await page.evaluate(() => { const img = Array.from(document.querySelectorAll<HTMLImageElement>(".otm-thumb img")).pop()!; const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d")!; x.drawImage(img, 0, 0, 1, 1); return [img.naturalWidth, ...x.getImageData(0, 0, 1, 1).data]; });
  console.log(`[photos] non-image tiles shown as unavailable: ${errors}; the old 1x1 fixture PNG decodes to [naturalWidth, r, g, b, a] = ${JSON.stringify(legacy)}`);
  assert.equal(errors, 1, "the non-image body is reported");
  assert.deepEqual(legacy, [1, 255, 255, 255, 255]);
  assert.equal(await page.getByRole("button", { name: "Retry photo" }).first().isVisible(), true);
  await view.context.close();
});

for (const width of [390, 768, 1440]) {
  test(`no sideways scroll at ${width}px (list, order, Ask thread)`, async () => {
    for (const query of ["", orderUrl("SO26-18447"), orderUrl("SO26-18452")]) {
      const view = await openTracker(browser, { width, query });
      assert.equal(await sideways(view.page), 0, `${query || "list"} at ${width}`);
      await view.context.close();
    }
    const ask = await openTracker(browser, { width, query: "?view=ask", askDelayMs: 20 });
    for (const q of ["Which of my orders today were rejected, and why?", "How many buyers per SKU on tomorrow's orders?"]) {
      await ask.page.locator("#otq-input").fill(q);
      await ask.page.locator(".otq-send").click();
      await ask.page.locator(".otq-turn").last().locator(".otq-card:not(.otq-card-busy)").waitFor();
    }
    assert.equal(await sideways(ask.page), 0, `ask at ${width}`);
    await ask.context.close();
  });
}

for (const width of [390, 1440]) {
  test(`every interactive target inside the tracker is at least 44px at ${width}px`, async () => {
    for (const query of ["", orderUrl("SO26-18447"), orderUrl("SO26-18452")]) {
      const view = await openTracker(browser, { width, query });
      await view.page.waitForTimeout(300);
      assert.deepEqual(await trackerSmallTargets(view.page, ".ot", 44), [], `${query || "list"} at ${width}`);
      await view.context.close();
    }
    const ask = await openTracker(browser, { width, query: "?view=ask", askDelayMs: 20 });
    for (const q of ["Which of my orders today were rejected, and why?", "When did SO26-18452 leave?", "Do we have the permit?"]) {
      await ask.page.locator("#otq-input").fill(q);
      await ask.page.locator(".otq-send").click();
      await ask.page.locator(".otq-turn").last().locator(".otq-card:not(.otq-card-busy)").waitFor();
    }
    assert.deepEqual(await trackerSmallTargets(ask.page, ".ot", 44), [], `ask at ${width}`);
    await ask.context.close();
  });
}

test("phone: the sticky Ask bar never covers content and sits above the bottom navigation", async () => {
  for (const number of ["SO26-18452", "SO26-18447"]) {
    const view = await openTracker(browser, { width: 390, height: 780, query: orderUrl(number) });
    const problem = await view.page.evaluate(async () => {
      const root = document.scrollingElement ?? document.documentElement;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, root.scrollHeight);
      await new Promise(r => setTimeout(r, 300));
      const bar = document.querySelector<HTMLElement>(".otp-ask")!.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>("nav.mobile-bottom-nav");
      const navTop = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().top : innerHeight;
      const leaves = Array.from(document.querySelectorAll<HTMLElement>(".otp-body *")).filter(e => {
        const r = e.getBoundingClientRect();
        return r.height > 1 && r.width > 1 && getComputedStyle(e).visibility !== "hidden";
      });
      const bottom = Math.max(...leaves.map(e => e.getBoundingClientRect().bottom));
      if (bar.bottom > navTop + 1) return `bar bottom ${bar.bottom} overlaps the nav at ${navTop}`;
      if (bottom > bar.top + 1) return `content bottom ${Math.round(bottom)} is under the Ask bar at ${Math.round(bar.top)}`;
      return null;
    });
    assert.equal(problem, null, number);
    await shot(view.page, `order-tracker/phone-ask-bar-${number}`, false);
    await view.context.close();
  }
});

test("phone: Back from an order restores the list scroll position", async () => {
  const view = await openTracker(browser, { width: 390, height: 780 });
  const { page } = view;
  const row = page.locator("a.otl-row").nth(4);
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 40));
  await page.waitForTimeout(200);
  const y = await page.evaluate(() => window.scrollY);
  assert.ok(y > 300, `list scrolled (${y})`);
  // A real tap on the row where it is (a Playwright click could scroll it first and change the remembered position).
  const box = (await row.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));
  await page.locator(".otp-head .otp-number").waitFor();
  assert.equal(await page.locator(".otp-number").innerText(), "SO26-18460");
  await page.getByRole("button", { name: "Back to orders" }).click();
  await page.locator("a.otl-row").first().waitFor();
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(back - y) <= 4, `scroll restored: was ${y}, now ${back}`);
  assert.deepEqual(view.errors, []);
  await view.context.close();
});

test("payment note is amber only when paid + balance don't add up to the invoice total", async () => {
  const note = async (number: string, edit?: (v: Record<string, unknown>) => void) => {
    const view = await openTracker(browser, { width: 1440, query: orderUrl(number), card: (n, c) => { if (c && edit) edit(c.sections.payment.value as Record<string, unknown>); return c; } });
    const el = view.page.locator(".otk-note");
    const out = { cls: (await el.getAttribute("class")) ?? "", bg: await el.evaluate(e => getComputedStyle(e).backgroundColor), text: await el.innerText() };
    const warningBg = await view.page.evaluate(() => { const p = document.createElement("p"); p.className = "otk-note otk-note-warning"; document.querySelector(".otk")!.append(p); const bg = getComputedStyle(p).backgroundColor; p.remove(); return bg; });
    await view.context.close();
    return { ...out, warningBg };
  };
  const matching = await note("SO26-18447");                       // partly paid, amounts add up
  assert.match(matching.cls, /otk-note-neutral/);
  assert.notEqual(matching.bg, matching.warningBg, "matching amounts are not amber");
  const paid = await note("SO26-18452");                           // paid in full, matches
  assert.match(paid.cls, /otk-note-positive/);
  const mismatch = await note("SO26-18447", v => { v.paid = "38000.00"; v.arithmetic = "doesn't match"; });
  assert.match(mismatch.cls, /otk-note-warning/);
  assert.equal(mismatch.bg, mismatch.warningBg);
  assert.match(mismatch.text, /don't add up/);
});
