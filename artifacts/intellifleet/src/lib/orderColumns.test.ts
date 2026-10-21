import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeColumnPrefs, orderFieldText, orderFieldValue, parseColumnPrefs, visibleOrderFieldColumns } from "./orderColumns.ts";

const KEYS = ["delivery_method", "fulfillment_type"];

test("new columns default visible even with older persisted prefs", () => {
  assert.deepEqual(parseColumnPrefs(null, KEYS), { delivery_method: true, fulfillment_type: true });
  assert.deepEqual(parseColumnPrefs(JSON.stringify({ customer: false }), KEYS), { delivery_method: true, fulfillment_type: true });
  assert.deepEqual(parseColumnPrefs("not json", KEYS), { delivery_method: true, fulfillment_type: true });
  assert.deepEqual(mergeColumnPrefs([false], KEYS), { delivery_method: true, fulfillment_type: true });
});

test("an explicit false hides only that column", () => {
  const prefs = parseColumnPrefs(JSON.stringify({ fulfillment_type: false, delivery_method: "yes" }), KEYS);
  assert.deepEqual(prefs, { delivery_method: true, fulfillment_type: false });
  assert.deepEqual(visibleOrderFieldColumns(prefs).map((c) => c.label), ["Delivery Method"]);
});

test("field text falls back to a dash", () => {
  assert.equal(orderFieldText(" Company Delivery "), "Company Delivery");
  assert.equal(orderFieldText(""), "—");
  assert.equal(orderFieldText(null), "—");
  assert.equal(orderFieldValue({ delivery_method: "Truck", fulfillment_type: null }, "delivery_method"), "Truck");
  assert.equal(orderFieldValue({ delivery_method: "Truck", fulfillment_type: null }, "fulfillment_type"), "—");
  assert.equal(orderFieldValue(undefined, "fulfillment_type"), "—");
});
