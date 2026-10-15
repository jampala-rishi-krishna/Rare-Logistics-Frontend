import test from "node:test";
import assert from "node:assert/strict";
import { countByType, describeCounts, filterByType, idsStillPresent, lastRefreshedLabel, mergeOrders, orderTypesParam, weightTotals } from "./orderMerge.ts";

const so = (id: string, date: string, n: string, kg: (number | null)[] = []) => ({ id, expected_shipment_date: date, salesorder_number: n, order_type: "SO", products: kg.map((w) => ({ total_weight_kg: w })) });
const to = (id: string, date: string, n: string, kg: (number | null)[] = []) => ({ id: `TO:${id}`, expected_shipment_date: date, salesorder_number: n, order_type: "TO", products: kg.map((w) => ({ total_weight_kg: w })) });

test("merge de-duplicates by id and sorts by date then number", () => {
  const merged = mergeOrders([so("1", "2026-10-14", "SO-2"), so("2", "2026-10-13", "SO-1")], [to("9", "2026-10-13", "TO-1"), so("1", "2026-10-14", "SO-2")]);
  assert.deepEqual(merged.map((o) => o.id), ["2", "TO:9", "1"]);
});

test("type filter and counts (type taken from field or TO: id)", () => {
  const list = [so("1", "d", "SO-1"), to("2", "d", "TO-1"), { id: "TO:3", salesorder_number: "TO-2" }];
  assert.equal(filterByType(list, "all").length, 3);
  assert.deepEqual(filterByType(list, "TO").map((o) => o.id), ["TO:2", "TO:3"]);
  assert.deepEqual(filterByType(list, "SO").map((o) => o.id), ["1"]);
  assert.deepEqual(countByType(list), { SO: 1, WM: 0, PO: 0, TO: 2 });
  assert.equal(describeCounts(countByType(list)), "SO 1 / TO 2");
  assert.equal(describeCounts({ SO: 0, TO: 4 }), "TO 4");
});

test("order_types query value", () => {
  assert.equal(orderTypesParam("all"), "SO,WM,PO,TO");
  assert.equal(orderTypesParam("TO"), "TO");
  assert.equal(orderTypesParam("WM"), "WM");
});

test("SO + WM + PO + TO in one list: type filter, counts and description", () => {
  const list = [
    so("1", "d", "SO-1"),
    { id: "2", salesorder_number: "WM-SO26-00282", order_type: "WM" },
    { id: "3", salesorder_number: "WM-SO26-00283" }, // no order_type: read from the WM-SO number
    { id: "PO:4", salesorder_number: "PO-1026-01704" }, // no order_type: read from the PO: id
    to("5", "d", "TO-1"),
  ];
  assert.deepEqual(filterByType(list, "WM").map((o) => o.id), ["2", "3"]);
  assert.deepEqual(filterByType(list, "PO").map((o) => o.id), ["PO:4"]);
  assert.deepEqual(filterByType(list, "SO").map((o) => o.id), ["1"]);
  assert.deepEqual(countByType(list), { SO: 1, WM: 2, PO: 1, TO: 1 });
  assert.equal(describeCounts(countByType(list)), "SO 1 / WM 2 / PO 1 / TO 1");
  assert.equal(describeCounts({ SO: 0, WM: 0, PO: 3, TO: 0 }), "PO 3");
});

test("weight totals count unknown lines across mixed orders", () => {
  assert.deepEqual(weightTotals([so("1", "d", "a", [10, null]), to("2", "d", "b", [5.5])]), { total: 15.5, unknown: 1 });
});

test("selection drops ids that left the list (assigned elsewhere)", () => {
  assert.deepEqual(idsStillPresent(["1", "TO:2", "3"], [so("1", "d", "a"), to("2", "d", "b")]), ["1", "TO:2"]);
});

test("last refreshed label", () => {
  assert.equal(lastRefreshedLabel(null), "");
  assert.equal(lastRefreshedLabel("nonsense"), "");
  assert.match(lastRefreshedLabel("2026-10-13T08:05:00Z"), /^\d{2}:\d{2}$/);
});

import { groupOrdersByTruck } from "./orderMerge.ts";

test("group per truck keeps first-seen order and puts Unassigned last", () => {
  const groups = groupOrdersByTruck([{ vehicle: "Unassigned", n: 1 }, { vehicle: "T1", n: 2 }, { vehicle: "T2", n: 3 }, { vehicle: "T1", n: 4 }]);
  assert.deepEqual(groups.map((g) => [g.vehicle, g.orders.map((o) => o.n)]), [["T1", [2, 4]], ["T2", [3]], ["Unassigned", [1]]]);
});
