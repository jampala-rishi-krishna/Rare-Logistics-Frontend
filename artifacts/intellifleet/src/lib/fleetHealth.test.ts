import assert from "node:assert/strict";
import { test } from "node:test";
import * as fh from "./fleetHealth.ts";
import type { FleetTruck, MaintainedTruck, ServiceState } from "../services/api/fleetHealth.ts";

const NOW = new Date("2026-10-08T06:58:52Z"); // 14:58 in Manila

function truck(partial: Partial<MaintainedTruck> & { plate: string; id: number }): MaintainedTruck {
  return {
    vehicle_type: "Truck",
    is_reefer: false,
    tracker: { kind: "tracked", status: "live", last_seen: null, label: "Live" },
    locked_reason: null,
    capacity_unconfirmed: false,
    kind: "tracked",
    odometer_km: 1000,
    services: {},
    risk: { score: 0, band: "low", breakdown: [], any_overdue: false, needs_attention: false },
    open_flags: [],
    open_flags_count: 0,
    critical_flags_count: 0,
    last_checklist: null,
    failed_checklists_7d: 0,
    battery: null,
    in_repair_record: false,
    offer_repair_record: false,
    ...partial,
  };
}

test("service status maps to a label and tone", () => {
  assert.equal(fh.serviceStatusLabel("due_soon"), "Due soon");
  assert.equal(fh.serviceTone("overdue"), "over");
  assert.equal(fh.serviceTone("no_record"), "none");
  assert.equal(fh.serviceTone(undefined), "none");
  assert.equal(fh.TONES[fh.serviceTone("ok")].fg, "#1e7b44");
});

test("usage bar fill is clamped to 0-100 and unknown usage is empty", () => {
  assert.equal(fh.usageBarFill(230.7), 100);
  assert.equal(fh.usageBarFill(-5), 0);
  assert.equal(fh.usageBarFill(42.5), 42.5);
  assert.equal(fh.usageBarFill(null), 0);
  assert.equal(fh.usageBarFill(Number.NaN), 0);
  assert.equal(fh.formatUsage(230.7), "231%");
  assert.equal(fh.formatUsage(null), "—");
});

test("service tooltip lists each measured component and the interval confirmation", () => {
  const state: ServiceState = {
    status: "overdue",
    usage_pct: 230.7,
    driven_by: "km",
    components: { km: { since: 23070, interval: 10000, pct: 230.7 }, days: { since: 210, interval: 180, pct: 116.7 } },
    interval: { km: 10000, engine_hours: 250, days: 180, confirmed: false, scope: "fleet" },
  };
  const tip = fh.serviceTipLines(state, "Oil");
  assert.equal(tip.title, "Oil: 231% of interval used");
  assert.equal(tip.lines.length, 2);
  assert.equal(tip.lines[0].text, "23,070 of 10,000 km (231%)");
  assert.equal(tip.lines[0].driving, true);
  assert.equal(tip.lines[1].driving, false);
  assert.match(tip.footer, /Placeholder, not yet confirmed/);
  assert.match(tip.footer, /fleet default/);
});

test("a service with no record says so and never shows a percentage", () => {
  const tip = fh.serviceTipLines({ status: "no_record", usage_pct: null, components: {}, interval: { km: null, engine_hours: null, days: 730, confirmed: true, scope: "truck" } }, "Battery");
  assert.equal(tip.title, "Battery: no record");
  assert.equal(tip.lines.length, 0);
  assert.match(tip.footer, /730 days/);
  assert.match(tip.footer, /Confirmed/);
});

test("interval text joins the measured limits", () => {
  assert.equal(fh.intervalText({ km: 10000, engine_hours: 250, days: 180 }), "10,000 km or 250 engine h or 180 days");
  assert.equal(fh.intervalText({ km: null, engine_hours: null, days: 730 }), "730 days");
  assert.equal(fh.intervalText(null), "No interval set");
});

test("risk and eco bands map to tones; eco band thresholds match the backend", () => {
  assert.equal(fh.riskTone("high"), "over");
  assert.equal(fh.riskTone("medium"), "soon");
  assert.equal(fh.riskTone("low"), "ok");
  assert.equal(fh.ecoBandFor(85), "great");
  assert.equal(fh.ecoBandFor(84), "good");
  assert.equal(fh.ecoBandFor(70), "good");
  assert.equal(fh.ecoBandFor(69), "watch");
  assert.equal(fh.ecoBandFor(49), "poor");
  assert.equal(fh.ecoBandFor(null), "none");
  assert.equal(fh.ecoTone("watch"), "soon");
});

test("trend shows direction, number and an accessible label", () => {
  assert.deepEqual(fh.trendMeta(25), { symbol: "▲", text: "+25", tone: "ok", label: "Up 25 points vs last week" });
  assert.equal(fh.trendMeta(-3).text, "-3");
  assert.equal(fh.trendMeta(-3).tone, "over");
  assert.equal(fh.trendMeta(0).label, "Same as last week");
  assert.equal(fh.trendMeta(null).text, "—");
});

test("risk segments keep only the factors that add points", () => {
  const segs = fh.riskSegments([
    { key: "service", label: "Service", points: 40, max: 40, detail: "d", formula: "f" },
    { key: "flags", label: "Open issues", points: 0, max: 25, detail: "d", formula: "f" },
    { key: "repairs", label: "Repairs", points: 5, max: 10, detail: "d", formula: "f" },
  ]);
  assert.deepEqual(segs.map((s) => [s.key, s.width]), [["service", 40], ["repairs", 5]]);
});

test("number formatters use thousands separators and never invent zeros", () => {
  assert.equal(fh.formatNumber(193070), "193,070");
  assert.equal(fh.formatKm(1240.84, 1), "1,240.8 km");
  assert.equal(fh.formatKm(null), "—");
  assert.equal(fh.formatPeso(86000), "₱86,000");
  assert.equal(fh.formatPeso(5191.56), "₱5,191.56");
  assert.equal(fh.formatPeso(1500, 2), "₱1,500.00");
  assert.equal(fh.formatPeso(undefined), "—");
  assert.equal(fh.formatKmpl(5.263), "5.26 km/L");
  assert.equal(fh.formatLitres(85.54), "85.5 L");
  assert.equal(fh.formatPesoPerLitre(60.725), "₱60.73/L");
});

test("minutes and seconds read like a person would say them", () => {
  assert.equal(fh.formatMinutes(45), "45 min");
  assert.equal(fh.formatMinutes(60), "1 h");
  assert.equal(fh.formatMinutes(178.1), "2 h 58 min");
  assert.equal(fh.formatSeconds(30), "30 s");
  assert.equal(fh.formatSeconds(2621), "44 min");
  assert.equal(fh.formatMinutes(null), "—");
});

test("downtime duration runs to now while a repair is open", () => {
  assert.equal(fh.formatDowntime("2026-09-26T14:58:52+00:00", null, NOW), "11 d 16 h");
  assert.equal(fh.formatDowntime("2026-10-08T05:00:00Z", "2026-10-08T06:30:00Z", NOW), "1 h 30 min");
  assert.equal(fh.formatDowntime(null, null, NOW), "—");
  assert.equal(fh.formatDowntime("2026-10-09T00:00:00Z", null, NOW), "—");
});

test("dates are rendered in Asia/Manila, not UTC", () => {
  // 17:00 UTC on 7 Oct is already 8 Oct 01:00 in Manila.
  assert.equal(fh.formatDate("2026-10-07T17:00:00Z"), "8 Oct 2026");
  assert.equal(fh.manilaDate("2026-10-07T17:00:00Z"), "2026-10-08");
  assert.equal(fh.formatDateTime("2026-10-08T06:58:52Z"), "8 Oct 2026, 2:58 PM");
  assert.equal(fh.formatDateTime("2026-10-07T16:05:00Z"), "8 Oct 2026, 12:05 AM");
  assert.equal(fh.manilaToday(NOW), "2026-10-08");
  assert.equal(fh.formatDate("2026-03-12"), "12 Mar 2026");
  assert.equal(fh.formatDate(null), "—");
});

test("week helpers: Monday of a week, shifting, and the label", () => {
  assert.equal(fh.mondayOf("2026-10-04"), "2026-09-28"); // Sunday belongs to the week that started 28 Sep
  assert.equal(fh.mondayOf("2026-09-28"), "2026-09-28");
  assert.equal(fh.shiftWeek("2026-09-28", 1), "2026-10-05");
  assert.equal(fh.shiftWeek("2026-09-28", -1), "2026-09-21");
  assert.equal(fh.weekRangeLabel("2026-09-28", "2026-10-04"), "Mon 28 Sep – Sun 4 Oct");
  assert.equal(fh.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(fh.daysBetween("2026-09-28", "2026-10-08"), 10);
});

test("datetime-local values round-trip with the Manila offset", () => {
  assert.equal(fh.toManilaInputValue(NOW), "2026-10-08T14:58");
  assert.equal(fh.manilaInputToIso("2026-10-08T14:58"), "2026-10-08T14:58:00+08:00");
  assert.equal(fh.manilaInputToDate("2026-10-08T14:58")!.toISOString(), "2026-10-08T06:58:00.000Z");
  assert.equal(fh.manilaInputToDate(""), null);
});

test("relative day compares Manila calendar days", () => {
  assert.equal(fh.relativeDay("2026-10-08T01:00:00Z", NOW), "today");
  assert.equal(fh.relativeDay("2026-10-07T01:58:52Z", NOW), "yesterday");
  assert.equal(fh.relativeDay("2026-10-01", NOW), "7 days ago");
});

test("KPI tiles show a dash and a reason for null values, never a fake zero", () => {
  const tiles = fh.buildKpiTiles({
    trucks_needing_attention: 0, maintained_trucks: 8, services_overdue: 0, open_issues: 0,
    fleet_kmpl_30d: null, co2_month_kg: null, co2_month_litres: null, avg_eco_score_last_week: null, eco_scored_drivers: 0, eco_week_start: "2026-09-28",
  });
  assert.equal(tiles.length, 6);
  const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
  assert.equal(byKey.attention.value, "0"); // a real zero is a real zero
  assert.equal(byKey.kmpl.value, "—");
  assert.equal(byKey.kmpl.reason, "no full-tank fuel logs yet");
  assert.equal(byKey.co2.value, "—");
  assert.equal(byKey.co2.reason, "no fuel logs yet");
  assert.equal(byKey.eco.value, "—");
  assert.match(byKey.eco.reason!, /50 km/);
  assert.equal(byKey.attention.reason, null);
});

test("KPI tiles carry exact formulas and mention third-party exclusion", () => {
  const tiles = fh.buildKpiTiles({
    trucks_needing_attention: 2, maintained_trucks: 8, services_overdue: 2, open_issues: 6,
    fleet_kmpl_30d: 4.98, co2_month_kg: 800.2, co2_month_litres: 298.6, avg_eco_score_last_week: 71, eco_scored_drivers: 3, eco_week_start: "2026-09-28",
  });
  const co2 = tiles.find((t) => t.key === "co2")!;
  assert.equal(co2.value, "800");
  assert.equal(co2.tooltip[0], "CO2 (kg) = diesel litres from the fuel log x 2.68");
  assert.ok(tiles.find((t) => t.key === "attention")!.tooltip.join(" ").includes("Third-party"));
  assert.equal(tiles.find((t) => t.key === "eco")!.detail, "3 scored drivers, week of 28 Sep");
  assert.equal(fh.co2Formula(3), "CO2 (kg) = diesel litres from the fuel log x 3");
});

test("attention reasons name overdue services and critical issues", () => {
  const base = { risk: { score: 65, band: "high" as const, breakdown: [], any_overdue: true, needs_attention: true } };
  assert.deepEqual(fh.attentionReasons({ ...base, overdue: ["Oil"], critical_flags: 1 }), ["Oil service overdue", "1 critical issue open"]);
  assert.deepEqual(fh.attentionReasons({ ...base, overdue: [], critical_flags: 0 }), ["High risk score"]);
  assert.deepEqual(fh.attentionReasons({ ...base, overdue: ["Oil", "Tyres"], critical_flags: 2 }).length, 3);
});

test("truck list: sorted by risk, third-party last, plate search ignores spaces and dashes", () => {
  const trucks: FleetTruck[] = [
    { id: -1, plate: "ASIAN CONNECT", vehicle_type: "Third-party truck", is_reefer: null, tracker: { kind: "third_party", status: null, last_seen: null, label: "Third-party" }, locked_reason: null, capacity_unconfirmed: false, kind: "third_party", message: "x" },
    truck({ id: 1, plate: "DCD8953", risk: { score: 10, band: "low", breakdown: [], any_overdue: false, needs_attention: false } }),
    truck({ id: 4, plate: "NFX5791", open_flags_count: 2, risk: { score: 65, band: "high", breakdown: [], any_overdue: true, needs_attention: true }, services: { oil_change: { status: "overdue", usage_pct: 231, components: {} } } }),
    truck({ id: 3, plate: "DCD8955", risk: { score: 50, band: "medium", breakdown: [], any_overdue: true, needs_attention: true } }),
  ];
  assert.deepEqual(fh.filterAndSortTrucks(trucks, "", "all").map((t) => t.plate), ["NFX5791", "DCD8955", "DCD8953", "ASIAN CONNECT"]);
  assert.deepEqual(fh.filterAndSortTrucks(trucks, "nfx-5791", "all").map((t) => t.plate), ["NFX5791"]);
  assert.deepEqual(fh.filterAndSortTrucks(trucks, "dcd 89", "all").map((t) => t.plate), ["DCD8955", "DCD8953"]);
  assert.deepEqual(fh.filterAndSortTrucks(trucks, "", "attention").map((t) => t.plate), ["NFX5791", "DCD8955"]);
  assert.deepEqual(fh.filterAndSortTrucks(trucks, "", "overdue").map((t) => t.plate), ["NFX5791"]);
  assert.deepEqual(fh.filterAndSortTrucks(trucks, "", "issues").map((t) => t.plate), ["NFX5791"]);
  assert.deepEqual(fh.filterCounts(trucks), { all: 4, attention: 2, overdue: 1, issues: 1 });
});

test("last checklist cell: pass/fail with date, or none in 45 d", () => {
  assert.deepEqual(fh.checklistCell(null), { label: "None in 45 d", sub: "", tone: "none" });
  assert.deepEqual(fh.checklistCell({ id: 1, checked_at: "2026-10-07T01:58:52+00:00", passed: true }), { label: "Pass", sub: "7 Oct", tone: "ok" });
  assert.equal(fh.checklistCell({ id: 2, checked_at: "2026-10-07T01:58:52+00:00", passed: false }).tone, "over");
});

test("flag sources have readable labels", () => {
  assert.equal(fh.flagSourceLabel("driver_app"), "Driver app");
  assert.equal(fh.flagSourceLabel("whatsapp"), "WhatsApp");
  assert.equal(fh.flagSourceLabel("something_new"), "something_new");
  assert.equal(fh.severityTone("critical"), "over");
});

test("checklist defaults: N/A for the reefer item on a non-reefer truck", () => {
  assert.equal(fh.defaultChecklistItems(false).reefer_running, "na");
  assert.equal(fh.defaultChecklistItems(null).reefer_running, "na");
  assert.equal(fh.defaultChecklistItems(true).reefer_running, "ok");
  assert.equal(fh.defaultChecklistItems(true).tires, "ok");
  assert.equal(Object.keys(fh.defaultChecklistItems(true)).length, 8);
});

test("checklist outcome: pass, warning, or critical when the brakes fail", () => {
  const items = fh.defaultChecklistItems(true);
  assert.deepEqual(fh.checklistOutcome(items), { pass: true, issues: [], severity: null, text: "Pass: no issues reported" });
  assert.equal(fh.checklistOutcome({ ...items, leaks: "issue" }).severity, "warning");
  const brakes = fh.checklistOutcome({ ...items, leaks: "issue", brakes: "issue" });
  assert.equal(brakes.severity, "critical");
  assert.equal(brakes.text, "Will raise a critical issue: brakes, leaks");
});

test("checklist validation requires a truck and a sane reefer temperature", () => {
  const form = { vehicleId: 4, items: fh.defaultChecklistItems(true), reeferTemp: "", notes: "" };
  assert.deepEqual(fh.validateChecklist(form, true), {});
  assert.ok(fh.validateChecklist({ ...form, vehicleId: null }, true).vehicleId);
  assert.ok(fh.validateChecklist({ ...form, reeferTemp: "abc" }, true).reeferTemp);
  assert.ok(fh.validateChecklist({ ...form, reeferTemp: "99" }, true).reeferTemp);
  assert.deepEqual(fh.validateChecklist({ ...form, reeferTemp: "-18.5" }, true), {});
  assert.ok(fh.validateChecklist({ ...form, reeferTemp: "-18" }, false).reeferTemp);
});

test("fuel log validation: required fields, positive litres, no future time, link-only receipt", () => {
  const ok = { vehicleId: 4, filledAt: "2026-10-08T10:00", litres: "85.5", amount: "5191.56", odometer: "193991.3", fullTank: true, station: "Petron", receipt: "" };
  assert.deepEqual(fh.validateFuelLog(ok, NOW), {});
  assert.ok(fh.validateFuelLog({ ...ok, vehicleId: null }, NOW).vehicleId);
  assert.ok(fh.validateFuelLog({ ...ok, litres: "0" }, NOW).litres);
  assert.ok(fh.validateFuelLog({ ...ok, litres: "" }, NOW).litres);
  assert.ok(fh.validateFuelLog({ ...ok, litres: "1500" }, NOW).litres);
  assert.ok(fh.validateFuelLog({ ...ok, amount: "-1" }, NOW).amount);
  assert.ok(fh.validateFuelLog({ ...ok, filledAt: "2026-10-09T10:00" }, NOW).filledAt);
  assert.ok(fh.validateFuelLog({ ...ok, receipt: "data:image/png;base64,AAAA" }, NOW).receipt);
  assert.deepEqual(fh.validateFuelLog({ ...ok, receipt: "https://files.example.com/r.jpg", odometer: "" }, NOW), {});
  assert.equal(fh.validateFuelLog({ ...ok, litres: "1,000" }, NOW).litres, undefined);
});

test("price per litre is computed and guarded", () => {
  assert.equal(fh.pricePerLitre(5191.56, 85.5), 60.72);
  assert.equal(fh.pricePerLitre(100, 0), null);
  assert.equal(fh.pricePerLitre(null, 10), null);
});

test("the 200 L tank warning only applies to unconfirmed-capacity trucks and still lets you save", () => {
  assert.match(fh.fuelLitreWarning(220, true)!, /220 L is more than the 200 L tank/);
  assert.equal(fh.fuelLitreWarning(205, true), null); // within the 5% tolerance the backend uses
  assert.equal(fh.fuelLitreWarning(220, false), null);
  assert.equal(fh.fuelLitreWarning(null, true), null);
});

test("record validation: service needs a type, date not in the future, downtime order", () => {
  const base = { kind: "service" as const, serviceType: "oil_change" as const, performedOn: "2026-10-08", odometer: "193070", engineHours: "", downtimeStart: "", downtimeEnd: "", reason: "", cost: "3500", vendor: "", notes: "", receipt: "" };
  assert.deepEqual(fh.validateRecord(base, "2026-10-08"), {});
  assert.ok(fh.validateRecord({ ...base, serviceType: "" }, "2026-10-08").serviceType);
  assert.equal(fh.validateRecord({ ...base, kind: "repair", serviceType: "" }, "2026-10-08").serviceType, undefined);
  assert.ok(fh.validateRecord({ ...base, performedOn: "2026-10-09" }, "2026-10-08").performedOn);
  assert.ok(fh.validateRecord({ ...base, cost: "-5" }, "2026-10-08").cost);
  assert.ok(fh.validateRecord({ ...base, downtimeEnd: "2026-10-08T10:00" }, "2026-10-08").downtimeStart);
  assert.ok(fh.validateRecord({ ...base, downtimeStart: "2026-10-08T10:00", downtimeEnd: "2026-10-08T09:00" }, "2026-10-08").downtimeEnd);
  assert.ok(fh.validateRecord({ ...base, receipt: "DATA:xyz" }, "2026-10-08").receipt);
});

test("issue validation: message required and capped at 500", () => {
  const base = { severity: "warning" as const, message: "Left mirror loose", ref: "", photoRef: "" };
  assert.deepEqual(fh.validateIssue(base), {});
  assert.ok(fh.validateIssue({ ...base, message: "   " }).message);
  assert.ok(fh.validateIssue({ ...base, message: "x".repeat(501) }).message);
  assert.ok(fh.validateIssue({ ...base, photoRef: "data:abc" }).photoRef);
});

test("interval rows: at least one limit, sane ranges, integers in the request body", () => {
  assert.equal(fh.intervalRowError({ km: "", hours: "", days: "" }), "Set at least one interval");
  assert.equal(fh.intervalRowError({ km: "10000", hours: "", days: "180" }), null);
  assert.ok(fh.intervalRowError({ km: "abc", hours: "", days: "" }));
  assert.ok(fh.intervalRowError({ km: "0", hours: "", days: "" }));
  assert.ok(fh.intervalRowError({ km: "", hours: "", days: "5000" }));
  assert.deepEqual(fh.intervalBody({ km: "10,000", hours: "", days: "180.4" }), { interval_km: 10000, interval_engine_hours: null, interval_days: 180 });
  assert.deepEqual(fh.intervalRowFrom(10000, null, 180), { km: "10000", hours: "", days: "180" });
  assert.ok(fh.intervalRowEquals({ km: "1", hours: "", days: "" }, { km: " 1 ", hours: "", days: "" }));
  assert.equal(fh.blankToNull("  "), null);
  assert.equal(fh.blankToNull(" Petron "), "Petron");
});

test("roles: planner is a dispatcher, matching is case-insensitive, unknown roles are read-only", () => {
  assert.equal(fh.normalizeRole("Planner"), "dispatcher");
  assert.equal(fh.normalizeRole("ADMIN"), "admin");
  assert.equal(fh.normalizeRole(undefined), "other");
  assert.deepEqual(fh.permissionsFor("admin"), { role: "admin", canEdit: true, canEnter: true, isAdmin: true, readOnly: false });
  assert.deepEqual(fh.permissionsFor("planner"), { role: "dispatcher", canEdit: true, canEnter: true, isAdmin: false, readOnly: false });
  assert.deepEqual(fh.permissionsFor("Warehouse"), { role: "warehouse", canEdit: false, canEnter: true, isAdmin: false, readOnly: false });
  assert.deepEqual(fh.permissionsFor("driver"), { role: "other", canEdit: false, canEnter: false, isAdmin: false, readOnly: true });
});

test("battery: system limits, reference domain and day data detection", () => {
  const series = [
    { date: "2026-10-06", parked_min: null, running_avg: null, system: null, status: "no_data" as const, reasons: [] },
    { date: "2026-10-07", parked_min: 12.97, running_avg: 14.2, system: 12 as const, status: "ok" as const, reasons: [] },
    { date: "2026-10-08", parked_min: 12.16, running_avg: 14.01, system: 12 as const, status: "warning" as const, reasons: ["x"] },
  ];
  assert.equal(fh.batterySystemOf(series), 12);
  assert.equal(fh.batterySystemOf([], 24), 24);
  assert.equal(fh.hasBatteryData(series), true);
  assert.equal(fh.hasBatteryData([series[0]]), false);
  assert.equal(fh.hasBatteryData([]), false);
  const data = fh.batteryChartData(series, 2);
  assert.equal(data.length, 2);
  assert.equal(data[1].label, "8 Oct");
  const [lo, hi] = fh.batteryDomain(data, 12);
  assert.ok(lo <= 11.9 && hi >= 14.7);
  assert.equal(fh.BATTERY_LIMITS[24].parkedWarn, 24.4);
  assert.equal(fh.batteryTone("critical"), "over");
  assert.equal(fh.batteryStatusLabel("no_data"), "No data");
});

test("distance chart splits assigned and unassigned km", () => {
  const data = fh.distanceChartData([
    { date: "2026-10-07", km: 114.3, engine_hours: 4.97, trips: 10, assigned: false, idle_total_min: 1, speeding_seconds: 0, harsh: 0, partial_day: false },
    { date: "2026-10-08", km: 159.5, engine_hours: 6.8, trips: 14, assigned: true, idle_total_min: 1, speeding_seconds: 0, harsh: 0, partial_day: true },
  ], 30);
  assert.deepEqual(data.map((d) => [d.assigned, d.unassigned]), [[0, 114.3], [159.5, 0]]);
  assert.equal(data[1].partial, true);
  assert.equal(fh.hasDistanceData([]), false);
});

test("idle split percentages and the unassigned km split", () => {
  const split = fh.idleSplit({ idle_at_stop_min: 300, idle_elsewhere_min: 500, unclassified_idle_min: 200 });
  assert.equal(split.total, 1000);
  assert.equal(split.elsewherePct, 50);
  assert.equal(fh.idleSplit({ idle_at_stop_min: 0, idle_elsewhere_min: 0, unclassified_idle_min: 0 }).atStopPct, 0);
  assert.deepEqual(fh.kmSplit({ km: 100, assigned_km: 75, unassigned_km: 25 }), { assignedPct: 75, unassignedPct: 25 });
  assert.deepEqual(fh.kmSplit({ km: 0, assigned_km: 0, unassigned_km: 0 }), { assignedPct: 0, unassignedPct: 0 });
});

test("a truck with no distance, engine time or fuel has no data (not zeros)", () => {
  assert.equal(fh.rollupHasNoData({ km: 0, engine_hours: 0 }, null), true);
  assert.equal(fh.rollupHasNoData({ km: 0, engine_hours: 0 }, 0), true);
  assert.equal(fh.rollupHasNoData({ km: 210.1, engine_hours: 47 }, null), false);
  assert.equal(fh.rollupHasNoData({ km: 0, engine_hours: 0 }, 50), false);
});

test("range presets end on the last day and span the requested number of days", () => {
  assert.deepEqual(fh.rateRange(7, "2026-10-07"), { from: "2026-10-01", to: "2026-10-07" });
  assert.deepEqual(fh.rateRange(30, "2026-10-07"), { from: "2026-09-08", to: "2026-10-07" });
  assert.equal(fh.perHundredKm(3176, 853.4, 0), "372");
  assert.equal(fh.perHundredKm(3, 0), "—");
});

test("CO2 chart rows carry a column per truck and zero-fill months a truck did not fuel", () => {
  const months = [
    { month: "2026-09", litres: 100, co2_kg: 268, trucks: { DCD8953: { litres: 60, co2_kg: 160.8 }, NFX5791: { litres: 40, co2_kg: 107.2 } } },
    { month: "2026-10", litres: 50, co2_kg: 134, trucks: { DCD8953: { litres: 50, co2_kg: 134 } } },
  ];
  assert.deepEqual(fh.co2PlateKeys(months), ["DCD8953", "NFX5791"]);
  const rows = fh.co2ChartData(months);
  assert.equal(rows[0].label, "Sep");
  assert.equal(rows[1].NFX5791, 0);
  assert.equal(rows[1].total, 134);
  assert.equal(fh.formatMonth("2026-09"), "Sep 2026");
});

test("scorecard state: off by default, paused WhatsApp is called out", () => {
  assert.equal(fh.scorecardHeadline({ enabled: false, whatsapp_active: false, schedule: "Monday 08:00 Asia/Manila" }).label, "Off");
  assert.equal(fh.scorecardHeadline({ enabled: true, whatsapp_active: false, schedule: "x" }).tone, "soon");
  assert.equal(fh.scorecardHeadline({ enabled: true, whatsapp_active: true, schedule: "Monday 08:00 Asia/Manila" }).detail, "Sends every Monday 08:00 Asia/Manila.");
  assert.equal(fh.scorecardLive({ enabled: true, whatsapp_active: true }), true);
  assert.equal(fh.scorecardLive({ enabled: true, whatsapp_active: false }), false);
  assert.deepEqual(fh.scorecardStatus({ will_send: false, skip_reason: "No phone number on file" }), { label: "Skipped: No phone number on file", tone: "none" });
  assert.equal(fh.scorecardStatus({ will_send: true, skip_reason: null }).label, "Will send");
});

test("misc helpers: initials, plurals, maintained-truck filter", () => {
  assert.equal(fh.initials("Ricky Bautista"), "RB");
  assert.equal(fh.initials("Cher"), "C");
  assert.equal(fh.initials(""), "?");
  assert.equal(fh.plural(1, "truck"), "1 truck");
  assert.equal(fh.plural(2, "truck"), "2 trucks");
  const list: FleetTruck[] = [truck({ id: 1, plate: "A" }), truck({ id: 7, plate: "Motorcycle 1", kind: "no_tracker" }), { id: -1, plate: "TP", vehicle_type: "x", is_reefer: null, tracker: { kind: "third_party", status: null, last_seen: null, label: "Third-party" }, locked_reason: null, capacity_unconfirmed: false, kind: "third_party", message: "" }];
  assert.deepEqual(fh.maintainedTrucks(list).map((t) => t.plate), ["A", "Motorcycle 1"]);
});

test("eco segments only keep penalties and the formula text states each weight", () => {
  const segs = fh.ecoSegments([
    { key: "speeding", label: "Speeding", penalty: 13.2, cap: 30, detail: "d", formula: "f" },
    { key: "kmpl", label: "Fuel economy", penalty: 0, cap: 20, detail: "d", formula: "f" },
  ]);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].key, "speeding");
  const lines = fh.ecoFormulaLines({ speeding_per_100km_seconds: 0.05, speeding_cap: 30, harsh_per_100km_events: 2.5, harsh_cap: 25, idle_elsewhere_min_per_driving_hour: 1, idle_cap: 25, kmpl_below_average_pct: 0.5, kmpl_cap: 20 });
  assert.equal(lines.length, 5);
  assert.match(lines[1], /0\.05/);
});
