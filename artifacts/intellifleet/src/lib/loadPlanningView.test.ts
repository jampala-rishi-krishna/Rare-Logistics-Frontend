import assert from "node:assert/strict";
import { test } from "node:test";
import { CARDS_PER_PAGE, DEFAULT_VIEW_MODE, VIEW_MODE_KEY, pageOfCards, readViewMode, uniqueOrders, writeViewMode } from "./loadPlanningView.ts";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

test("the default view is the spreadsheet", () => {
  assert.equal(DEFAULT_VIEW_MODE, "spreadsheet");
  assert.equal(readViewMode(memoryStorage()), "spreadsheet");
  assert.equal(readViewMode(null), "spreadsheet");
});

test("the choice is remembered per browser", () => {
  const storage = memoryStorage();
  writeViewMode("kpi", storage);
  assert.equal(storage.data[VIEW_MODE_KEY], "kpi");
  assert.equal(readViewMode(storage), "kpi");
  writeViewMode("spreadsheet", storage);
  assert.equal(readViewMode(storage), "spreadsheet");
});

test("a corrupt stored value falls back to the spreadsheet", () => {
  assert.equal(readViewMode(memoryStorage({ [VIEW_MODE_KEY]: "grid" })), "spreadsheet");
});

test("storage that throws (private window / blocked) never breaks the toggle", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(readViewMode(broken), "spreadsheet");
  assert.doesNotThrow(() => writeViewMode("kpi", broken));
});

test("cards show the same SO set as the spreadsheet: one card per order, spreadsheet line-item rows collapse", () => {
  const rows = [
    { order: { id: "a" }, item: { sku: "1" } },
    { order: { id: "a" }, item: { sku: "2" } },
    { order: { id: "b" }, item: {} },
    { order: { id: "c" }, item: { sku: "3" } },
  ];
  assert.deepEqual(uniqueOrders(rows).map((o) => o.id), ["a", "b", "c"]);
});

test("toggling is pure local state: the same rows feed both views, so filters/search/sort/selection cannot differ", () => {
  const rows = [{ order: { id: "b" } }, { order: { id: "a" } }];
  // The card list is derived from the already filtered/sorted rows and keeps their order.
  assert.deepEqual(uniqueOrders(rows).map((o) => o.id), rows.map((r) => r.order.id));
});

test("2 columns x 2 rows: four cards per page, paginated", () => {
  assert.equal(CARDS_PER_PAGE, 4);
  const orders = Array.from({ length: 10 }, (_, i) => i + 1);
  const first = pageOfCards(orders, 1);
  assert.deepEqual([first.items, first.pageCount], [[1, 2, 3, 4], 3]);
  assert.deepEqual(pageOfCards(orders, 3).items, [9, 10]);
});

test("a page past the end (the list shrank after an acknowledge) is clamped, never empty", () => {
  const shrunk = pageOfCards([1, 2, 3, 4, 5], 9);
  assert.equal(shrunk.page, 2);
  assert.deepEqual(shrunk.items, [5]);
  assert.equal(pageOfCards([], 1).pageCount, 1);
});
