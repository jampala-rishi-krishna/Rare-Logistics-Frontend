import assert from "node:assert/strict";
import { test } from "node:test";
import { applyManualToll, buildCostTableRows, compareBadges, effectiveOptions, formatRatesLine, peso, rateChips, resolveActivePlan, returnWarehouseMissing, tollCellState, tollCellText, tollOptionSummary, totalCellText } from "./routeCost.ts";

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

const toll = (present: boolean, amount: number, unknown = false) => ({ present, amount, unknown });
const tolled = (km: number, min: number, tolls: number, summary: ReturnType<typeof toll>) => {
  const part = leg(km, min, 10, 10, 10, 0);
  return { ...part, costBreakdown: { ...part.costBreakdown, tolls, total: part.costBreakdown.total + tolls }, toll: summary };
};

test("rates line says how tolls are estimated when they are enabled", () => {
  const base = {
    dieselPricePerLiter: 95, fuelKmPerLiter: 7, fuelCostPerKm: 13.57, distanceCostPerKm: 5, driverCostPerHour: 120, helperCostPerHour: 120,
    refrigerationLitersPerHourChilled: 0.8, refrigerationLitersPerHourFrozen: 1.2, refrigerationCostPerHourChilled: 76, refrigerationCostPerHourFrozen: 114,
  };
  assert.ok(formatRatesLine({ ...base, tollsEnabled: true, tollVehicleClass: 2, tollMultiplier: 2 }).endsWith("tolls: Google Class 1 estimate × 2.0 (Class 2), VAT-inclusive estimate"));
  assert.ok(formatRatesLine({ ...base, tollsEnabled: false }).endsWith("tolls not included"));
});

test("Tolls column: per-leg toll and it is part of each row total and the TOTAL", () => {
  const outbound = tolled(12, 30, 78, toll(true, 78));
  const ret = tolled(9, 18, 0, toll(false, 0));
  const total = { ...leg(21, 48, 20, 20, 20, 0), costBreakdown: { distance: 20, time: 20, fuel: 20, refrigeration: 0, tolls: 78, total: 138 }, toll: toll(true, 78) };
  const rows = buildCostTableRows({ outbound, return: ret, total }, "Glacier");
  assert.deepEqual(rows.map((r) => r.tolls), [78, 0, 78]);
  assert.equal(rows[0].total, 10 + 10 + 10 + 0 + 78);
  assert.ok(Math.abs(rows[0].total + rows[1].total - rows[2].total) < 0.01);
  assert.equal(tollCellText(rows[0]), "₱78.00");
  assert.equal(tollCellText(rows[1]), "₱0.00"); // no toll on that leg
});

test("a toll with no Google fee says so, never ₱0, and the TOTAL notes the unknown tolls", () => {
  const outbound = tolled(12, 30, 0, toll(true, 0, true));
  const total = tolled(12, 30, 0, toll(true, 0, true));
  const rows = buildCostTableRows({ outbound, return: null, total }, null);
  assert.equal(tollCellText(rows[0]), "Toll applies, fee unknown");
  assert.equal(totalCellText(rows[0]), `₱${rows[0].total.toFixed(2)}`);
  assert.ok(totalCellText(rows[1]).endsWith("+ tolls (unknown)"));
  const mixed = buildCostTableRows({ outbound: tolled(1, 1, 78, toll(true, 78, true)), return: null, total }, null);
  assert.equal(tollCellText(mixed[0]), "₱78.00 + fee unknown");
});

const option = (key: string, label: string, km: number, min: number, tolls: number, cost: number, geometry: string) => ({
  key, label, distanceKm: km, durationMin: min, cost, geometry,
  costBreakdown: { distance: 0, time: 0, fuel: 0, refrigeration: 0, tolls, total: cost },
  roundTrip: { outbound: tolled(km, min, tolls, toll(tolls > 0, tolls)), return: null, total: tolled(km, min, tolls, toll(tolls > 0, tolls)) },
  toll: toll(tolls > 0, tolls),
});

test("compare cards show distance, time, tolls and total", () => {
  assert.equal(tollOptionSummary(option("expressway", "Via expressway", 24.14, 48.2, 78, 640, "E")), "Via expressway: 24.1 km · 48 min · tolls ₱78.00 · total ₱640.00");
  assert.equal(tollOptionSummary(option("avoid", "Avoid tolls", 28, 61, 0, 600, "A")), "Avoid tolls: 28.0 km · 61 min · tolls ₱0.00 · total ₱600.00");
  const unknown = { ...option("expressway", "Via expressway", 76.7, 115, 0, 1757.07, "E"), toll: toll(true, 0, true) };
  assert.equal(tollOptionSummary(unknown), `Via expressway: 76.7 km · 115 min · tolls unknown · total ${peso(1757.07)} + tolls`);
});

test("the selected compare option drives the whole plan (table, cards, map geometry)", () => {
  const plan = {
    distanceKm: 24, durationMin: 48, cost: 640, geometry: "E", activeOption: "expressway",
    costBreakdown: { distance: 0, time: 0, fuel: 0, refrigeration: 0, tolls: 78, total: 640 },
    roundTrip: option("expressway", "x", 24, 48, 78, 640, "E").roundTrip, toll: toll(true, 78),
    tollOptions: [option("expressway", "Via expressway", 24, 48, 78, 640, "E"), option("avoid", "Avoid tolls", 28, 61, 0, 600, "A")],
  };
  const avoid = resolveActivePlan(plan, "avoid")!;
  assert.equal(avoid.geometry, "A");
  assert.equal(avoid.cost, 600);
  assert.equal(avoid.distanceKm, 28);
  assert.equal(buildCostTableRows(avoid.roundTrip, null).at(-1)!.tolls, 0);
  assert.equal(resolveActivePlan(plan, null)!.geometry, "E"); // nothing picked: the server's default option
  assert.equal(buildCostTableRows(resolveActivePlan(plan, "expressway")!.roundTrip, null).at(-1)!.tolls, 78);
  const single = { distanceKm: 1, durationMin: 1, cost: 1, geometry: "S" };
  assert.equal(resolveActivePlan(single, "avoid"), single); // no compare: the plan is used as is
  assert.equal(resolveActivePlan(null, "avoid"), null);
});

const unknownOption = (key: string, label: string, km: number, min: number, cost: number) => {
  const part = tolled(km, min, 0, toll(true, 0, true));
  return {
    key, label, distanceKm: km, durationMin: min, cost, geometry: key,
    costBreakdown: { distance: 0, time: 0, fuel: 0, refrigeration: 0, tolls: 0, total: cost },
    roundTrip: {
      outbound: { ...tolled(km / 2, min / 2, 0, toll(true, 0, true)), costBreakdown: { distance: 0, time: 0, fuel: 0, refrigeration: 0, tolls: 0, total: cost / 2 } },
      return: { ...tolled(km / 2, min / 2, 0, toll(true, 0, true)), costBreakdown: { distance: 0, time: 0, fuel: 0, refrigeration: 0, tolls: 0, total: cost / 2 } },
      total: { ...part, costBreakdown: { distance: 0, time: 0, fuel: 0, refrigeration: 0, tolls: 0, total: cost } },
    },
    toll: toll(true, 0, true),
  };
};

test("Cheapest badge is withheld while a toll is unknown; Fastest is simply the shorter time", () => {
  const expressway = unknownOption("expressway", "Via expressway", 76.7, 115, 1757);
  const avoid = option("avoid", "Avoid tolls", 76.7, 235, 0, 2056.07, "avoid");
  assert.deepEqual(compareBadges([expressway, avoid]), { cheapest: null, fastest: "expressway" });
  const known = option("expressway", "Via expressway", 76.7, 115, 400, 2157.07, "expressway");
  assert.deepEqual(compareBadges([known, avoid]), { cheapest: "avoid", fastest: "expressway" });
  assert.deepEqual(compareBadges([option("expressway", "x", 1, 10, 0, 100, "e")]), { cheapest: null, fastest: null });
  assert.deepEqual(compareBadges(undefined), { cheapest: null, fastest: null });
});

test("a manually entered toll replaces the unknown, updates legs and TOTAL, and is marked manual", () => {
  const expressway = unknownOption("expressway", "Via expressway", 76.7, 115, 1757);
  const applied = applyManualToll(expressway, 600);
  assert.equal(applied.toll.unknown, false);
  assert.equal(applied.toll.manual, true);
  assert.equal(applied.costBreakdown.tolls, 600);
  assert.equal(applied.cost, 2357);
  const rows = buildCostTableRows(applied.roundTrip, "Mets");
  assert.equal(rows[0].tolls + rows[1].tolls, 600); // spread over the two tolled legs by distance
  assert.equal(rows[2].tolls, 600);
  assert.ok(Math.abs(rows[0].total + rows[1].total - rows[2].total) < 0.011);
  assert.ok(rows.every((r) => !r.tollUnknown));
  assert.equal(tollCellText(rows[2]), "₱600.00 (entered manually)");
  assert.equal(tollOptionSummary(applied).includes("tolls ₱600.00 (manual)"), true);
  assert.equal(applyManualToll(expressway, null), expressway); // nothing typed: unchanged
  assert.equal(applyManualToll(expressway, -5), expressway);
  assert.equal(applyManualToll(expressway, Number.NaN), expressway);
});

test("with a manual toll the route has fully known costs and can earn Cheapest", () => {
  const options = [unknownOption("expressway", "Via expressway", 76.7, 115, 1757), option("avoid", "Avoid tolls", 76.7, 235, 0, 2056.07, "avoid")];
  assert.equal(compareBadges(options).cheapest, null);
  const manual = effectiveOptions({ tollOptions: options }, { expressway: 100 });
  assert.equal(manual[0].cost, 1857);
  assert.equal(compareBadges(manual).cheapest, "expressway");
});

test("resolveActivePlan applies the manual toll to the selected option and to a single-route plan", () => {
  const options = [unknownOption("expressway", "Via expressway", 76.7, 115, 1757), option("avoid", "Avoid tolls", 76.7, 235, 0, 2056.07, "avoid")];
  const plan = { ...options[0], activeOption: "expressway", tollOptions: options };
  assert.equal(resolveActivePlan(plan, "expressway", { expressway: 250 })!.cost, 2007);
  assert.equal(resolveActivePlan(plan, "avoid", { expressway: 250 })!.cost, 2056.07); // the avoid card keeps its own data
  const single = { ...options[0], activeOption: "expressway" };
  const resolved = resolveActivePlan(single, null, { expressway: 250 })!;
  assert.equal(resolved.cost, 2007);
  assert.equal(resolved.toll!.manual, true);
  assert.equal(resolveActivePlan(single, null, {}), single);
});

test("Tolls cell states: known, unknown, manual and none (never ₱0.00)", () => {
  const rowFor = (part: ReturnType<typeof tolled>) => buildCostTableRows({ outbound: part, return: null, total: part }, null)[0];
  assert.deepEqual(tollCellState(rowFor(tolled(1, 1, 123.45, toll(true, 123.45)))), { kind: "known", amount: 123.45 });
  assert.deepEqual(tollCellState(rowFor(tolled(1, 1, 0, toll(true, 0, true)))), { kind: "unknown", amount: 0 });
  assert.deepEqual(tollCellState(rowFor(tolled(1, 1, 0, toll(false, 0)))), { kind: "none" });
  assert.deepEqual(tollCellState(rowFor(tolled(1, 1, 0, { present: false, amount: 0, unknown: false }))), { kind: "none" });
  const manual = { ...tolled(1, 1, 50, toll(true, 50)), toll: { present: true, amount: 50, unknown: false, manual: true } };
  assert.deepEqual(tollCellState(rowFor(manual)), { kind: "manual", amount: 50 });
});

test("How this is calculated lists one chip per rate from the live config", () => {
  const rates = {
    dieselPricePerLiter: 95, fuelKmPerLiter: 7, fuelCostPerKm: 13.57, distanceCostPerKm: 5, driverCostPerHour: 120, helperCostPerHour: 120,
    refrigerationLitersPerHourChilled: 0.8, refrigerationLitersPerHourFrozen: 1.2, refrigerationCostPerHourChilled: 76, refrigerationCostPerHourFrozen: 114,
    tollsEnabled: true, tollVehicleClass: 2, tollMultiplier: 2,
  };
  const chips = rateChips(rates, { refrigerated: true, coldChain: "chilled", coldChainAssumed: true });
  assert.deepEqual(chips.map((c) => `${c.label}: ${c.value}`), [
    "Diesel: ₱95/L · 7 km/L (₱13.57/km)",
    "Distance: ₱5/km",
    "Driver: ₱120/h · Helper ₱120/h (if assigned)",
    "Refrigeration: 0.8 L/h chilled (₱76/h) · 1.2 L/h frozen (₱114/h), estimate",
    "Tolls: Google Class 1 × 2.0 (Class 2), VAT-inclusive estimate",
    "Load: assumed chilled",
  ]);
  assert.equal(rateChips({ ...rates, tollsEnabled: false })[4].value, "not included");
  assert.equal(rateChips(rates, { refrigerated: true, coldChain: "frozen", coldChainAssumed: false }).at(-1)!.value, "frozen");
  assert.equal(rateChips(rates, { refrigerated: false, coldChain: "chilled", coldChainAssumed: true }).at(-1)!.value, "dry truck, no refrigeration");
  assert.equal(rateChips(rates).length, 5);
});
