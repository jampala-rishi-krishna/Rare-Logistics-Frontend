import { chromium } from "../artifacts/intellifleet/node_modules/playwright/index.mjs";
import fs from "fs";

const out = "artifacts/intellifleet/verification";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(5000);
console.log("start");
const requests = [];
page.on("request", (r) => { if (r.url().includes("inventory/sales-orders")) requests.push({ method: r.method(), url: r.url(), postData: r.postData() }); });

await page.goto("http://127.0.0.1:5173/login", { waitUntil: "networkidle" });
console.log("login page");
await page.getByTestId("input-login-password").fill("IntelliFleet!2026");
await page.getByRole("button", { name: /continue/i }).click();
console.log("submitted");
await page.waitForTimeout(3000);
console.log("after demo", page.url());
await page.getByTestId("nav-load-planning").click();
await page.waitForTimeout(800);
console.log("loads page");
await page.getByRole("button", { name: "Load Planning" }).click();
const dateInputs = page.locator('input[type="date"]');
await dateInputs.nth(0).fill("2026-09-18");
await dateInputs.nth(1).fill("2026-09-18");
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/01-load-planning-before.png`, fullPage: true });
const bodyBefore = await page.locator("body").innerText();
const countMatch = bodyBefore.match(/Unassigned Sales Orders\s+(\d+)/);
const cards = page.locator('button').filter({ hasText: /SO\d+-\d+/ });
const cardCount = await cards.count();
const trackedText = cardCount ? await cards.first().innerText() : "";
const so = trackedText.match(/(?:SO|WM-SO)[0-9-]+/)?.[0] ?? "";
const client = trackedText.split("\n")[1] ?? "";
const result = { test1: { beforeCount: countMatch?.[1] ?? null, cardCount, so, client, beforeScreenshot: `${out}/01-load-planning-before.png` } };

if (cardCount) {
  await cards.first().click();
  await page.getByRole("dialog").waitFor();
  const truck = page.getByRole("dialog").locator("select").nth(0);
  const driver = page.getByRole("dialog").locator("select").nth(1);
  const truckValue = await truck.locator("option:not([disabled])").nth(1).getAttribute("value");
  const driverValue = await driver.locator("option").nth(1).getAttribute("value");
  result.test1.assignedTruck = truckValue;
  result.test1.assignedDriverId = driverValue;
  await truck.selectOption(truckValue);
  if (driverValue) await driver.selectOption(driverValue);
  await page.getByRole("button", { name: /confirm assignment/i }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/02-load-planning-after-assignment.png`, fullPage: true });
  result.test1.afterAssignmentText = await page.locator("body").innerText();
  result.test1.afterAssignmentVisible = result.test1.afterAssignmentText.includes(so);

  await page.getByRole("button", { name: "Confirmed SO" }).click();
  await page.waitForTimeout(2500);
  result.test1.confirmedText = await page.locator("body").innerText();
  result.test1.confirmedVisible = result.test1.confirmedText.includes(so);
  result.test1.confirmedScreenshot = `${out}/03-confirmed-so.png`;
  await page.screenshot({ path: result.test1.confirmedScreenshot, fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  result.test1.afterHardReloadConfirmed = (await page.locator("body").innerText()).includes(so);
  await page.getByRole("button", { name: "Load Planning" }).click();
  await page.waitForTimeout(2500);
  result.test1.afterHardReloadLoadPlanningVisible = (await page.locator("body").innerText()).includes(so);
  result.test1.hardReloadScreenshot = `${out}/04-hard-reload-load-planning.png`;
  await page.screenshot({ path: result.test1.hardReloadScreenshot, fullPage: true });
}

await page.getByRole("button", { name: "Load Planning" }).click();
await page.waitForTimeout(500);
const beforeDateText = await page.locator("body").innerText();
await dateInputs.nth(0).fill("2026-09-19"); await dateInputs.nth(1).fill("2026-09-19"); await page.waitForTimeout(3000);
const date19Text = await page.locator("body").innerText();
await dateInputs.nth(0).fill("2026-09-18"); await dateInputs.nth(1).fill("2026-09-18"); await page.waitForTimeout(3000);
result.test2 = { date19Text: date19Text.slice(0, 2000), requestUrls: requests.slice(-8), returnedTo18: (await page.locator("body").innerText()).includes("Unassigned Sales Orders") };
await page.screenshot({ path: `${out}/05-date-filter-returned.png`, fullPage: true });

await page.getByRole("button", { name: "Confirmed SO" }).click(); await page.waitForTimeout(2500);
const confirmedButtons = page.getByRole("button", { name: "Edit" });
result.test3 = { filters: { dateInputs: await page.locator('input[type="date"]').count(), searchInputs: await page.locator('input[placeholder*="Search"]').count(), statusSelects: await page.locator('select').count() }, confirmedRows: await confirmedButtons.count() };
if (confirmedButtons.count && await confirmedButtons.count()) { await confirmedButtons.first().click(); await page.waitForTimeout(300); }
result.test3.drawerHasLineItems = (await page.locator("body").innerText()).includes("Line items");
await page.screenshot({ path: `${out}/06-confirmed-detail.png`, fullPage: true });
result.requests = requests;
fs.writeFileSync(`${out}/results.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
