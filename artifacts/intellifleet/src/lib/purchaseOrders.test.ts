import test from "node:test";
import assert from "node:assert/strict";
import { PO_HIDDEN_BY_DEFAULT, poStatusLabel, poStatusOptions } from "./purchaseOrders.ts";

test("status labels", () => {
  assert.equal(poStatusLabel("partially_received"), "Partially Received");
  assert.equal(poStatusLabel("OPEN"), "Open");
  assert.equal(poStatusLabel(""), "-");
  assert.equal(poStatusLabel(null), "-");
});

test("status options carry the counts and keep selected statuses even with zero rows", () => {
  const options = poStatusOptions({ open: 3, cancelled: 1, billed: 2 }, ["closed"]);
  assert.deepEqual(options.map((o) => [o.value, o.count]), [["billed", 2], ["cancelled", 1], ["closed", 0], ["open", 3]]);
  assert.deepEqual(poStatusOptions(undefined), []);
  assert.deepEqual(PO_HIDDEN_BY_DEFAULT, ["cancelled", "closed"]);
});
