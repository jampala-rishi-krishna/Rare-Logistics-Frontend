import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCostTableRows, formatRatesLine, returnWarehouseMissing } from "./routeCost.ts";

const leg = (km: number, min: number, distance: number, time: number, fuel: number, refrigeration: number) => ({
  distanceKm: km,
  durationMin: min,
  costBreakdown: { distance, time, fuel, refrigeration, total: distance + time + fuel + refrigeration },
});

test("calculate is blocked while return is checked and no warehouse is chosen", () => {
  assert.equal(returnWarehouseMissing(true, ""), true);
  assert.equal(returnWarehouseMissing(true, "mets"), false);
  assert.equal(returnWarehouseMissing(false, ""), false); // one-way needs no warehouse
});

test("round trip rows: outbound, return, TOTAL equal to the sum of the legs", () => {
  const outbound = leg(12.3, 30, 61.5, 60, 166.93, 76);
  const ret = leg(8.9, 18, 44.5, 36, 120.79, 0);
  const total = leg(21.2, 48, 106, 96, 287.72, 76);
  const rows = buildCostTableRows({ outbound, return: ret, total }, "Glacier Cold Storage");
  assert.deepEqual(rows.map((r) => r.label), ["Outbound", "Return to Glacier Cold Storage", "TOTAL ESTIMATED COST"]);
  assert.ok(Math.abs(rows[0].total + rows[1].total - rows[2].total) < 0.01);
  assert.equal(rows[1].refrigeration, 0);
});

test("one-way shows only Outbound and TOTAL", () => {
  const part = leg(10, 20, 50, 40, 135.71, 76);
  const rows = buildCostTableRows({ outbound: part, return: null, total: part }, null);
  assert.deepEqual(rows.map((r) => r.key), ["outbound", "total"]);
  assert.equal(rows[0].total, rows[1].total);
});

test("rates line is built from the live config", () => {
  const line = formatRatesLine({
    dieselPricePerLiter: 95, fuelKmPerLiter: 7, fuelCostPerKm: 13.57, distanceCostPerKm: 5, driverCostPerHour: 120, helperCostPerHour: 120,
    refrigerationLitersPerHourChilled: 0.8, refrigerationLitersPerHourFrozen: 1.2, refrigerationCostPerHourChilled: 76, refrigerationCostPerHourFrozen: 114,
  });
  assert.equal(
    line,
    "Rates: diesel ₱95/L at 7 km/L (₱13.57/km) · distance ₱5/km · driver ₱120/h · helper ₱120/h (if assigned) · refrigeration 0.8 L/h chilled (₱76/h) / 1.2 L/h frozen (₱114/h), estimated · tolls not included",
  );
});
