import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLinesByWarehouse, isMultiWarehouse, multiPickupLabel, pickupWarehousesOf } from "./pickupWarehouses.ts";

test("Load Planning label only when an SO is picked from more than one warehouse", () => {
  assert.equal(multiPickupLabel({ pickup_warehouses: ["METS", "GLACIER"] }), "Pickup: METS + GLACIER");
  assert.equal(multiPickupLabel({ pickup_warehouses: ["GLACIER"] }), null);
  assert.equal(multiPickupLabel({}), null);
  assert.equal(multiPickupLabel(null), null);
  assert.deepEqual(pickupWarehousesOf({ pickup_warehouses: ["METS", "", 3] }), ["METS"]);
});

test("helper load screen groups lines by warehouse: METS, GLACIER, others, then unknown", () => {
  const lines = [
    { name: "Beef", warehouse: "GLACIER" },
    { name: "Salt", warehouse: null },
    { name: "Pork", warehouse: "METS" },
    { name: "Fish", warehouse: "GLACIER" },
    { name: "Box", warehouse: "Other Hub" },
  ];
  const groups = groupLinesByWarehouse(lines);
  assert.deepEqual(groups.map((g) => [g.warehouse, g.lines.map((l) => l.name)]), [
    ["METS", ["Pork"]],
    ["GLACIER", ["Beef", "Fish"]],
    ["Other Hub", ["Box"]],
    [null, ["Salt"]],
  ]);
  assert.equal(isMultiWarehouse(lines), true);
  assert.equal(isMultiWarehouse([{ warehouse: "METS" }, { warehouse: null }]), false);
  assert.deepEqual(groupLinesByWarehouse(undefined), []);
});
