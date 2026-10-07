// Pure helpers for the route result: return-warehouse gating, the single cost table and the
// "Rates:" line. Kept free of React so the rules can be unit-tested.

export const RETURN_WAREHOUSE_HINT = "Choose the return warehouse";

/** Return to warehouse is checked but the user has not picked one. Never auto-selected. */
export function returnWarehouseMissing(returnToWarehouse: boolean, returnWarehouseId: string): boolean {
  return returnToWarehouse && !returnWarehouseId;
}

/** Toll summary for a leg / the whole trip. `unknown`: a toll road with no fee from Google (not in the total). */
export interface TollSummary {
  present: boolean;
  amount: number;
  unknown: boolean;
}

export interface CostParts {
  distanceKm: number;
  durationMin: number;
  costBreakdown: { distance: number; time: number; fuel: number; refrigeration: number; tolls?: number; total: number };
  toll?: TollSummary;
}

export type ExpresswayChoice = "compare" | "expressway" | "avoid";

export const EXPRESSWAY_CHOICES: { value: ExpresswayChoice; label: string }[] = [
  { value: "compare", label: "Compare both" },
  { value: "expressway", label: "Use expressways" },
  { value: "avoid", label: "Avoid tolls" },
];

export const peso = (value: number) => `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface CostTableRow {
  key: "outbound" | "return" | "total";
  label: string;
  distanceKm: number;
  durationMin: number;
  distanceCost: number;
  timeCost: number;
  fuel: number;
  refrigeration: number;
  tolls: number;
  tollApplies: boolean;
  tollUnknown: boolean;
  total: number;
}

function toRow(key: CostTableRow["key"], label: string, part: CostParts): CostTableRow {
  return {
    key,
    label,
    distanceKm: part.distanceKm,
    durationMin: part.durationMin,
    distanceCost: part.costBreakdown.distance,
    timeCost: part.costBreakdown.time,
    fuel: part.costBreakdown.fuel,
    refrigeration: part.costBreakdown.refrigeration,
    tolls: part.costBreakdown.tolls ?? 0,
    tollApplies: part.toll?.present ?? false,
    tollUnknown: part.toll?.unknown ?? false,
    total: part.costBreakdown.total,
  };
}

/** Tolls cell. A toll road is never shown as 0: an unpriced one says so. */
export function tollCellText(row: CostTableRow): string {
  if (row.tollUnknown) return row.tolls > 0 ? `${peso(row.tolls)} + fee unknown` : "Toll applies, fee unknown";
  return peso(row.tolls);
}

/** Row total; the TOTAL row says when unpriced tolls are left out of it. */
export function totalCellText(row: CostTableRow): string {
  return row.key === "total" && row.tollUnknown ? `${peso(row.total)} + tolls (unknown)` : peso(row.total);
}

/** Outbound [+ Return to {warehouse}] + TOTAL. One-way -> Outbound and TOTAL only. */
export function buildCostTableRows(
  roundTrip: { outbound: CostParts; return: CostParts | null; total: CostParts },
  warehouseName?: string | null,
): CostTableRow[] {
  const rows = [toRow("outbound", "Outbound", roundTrip.outbound)];
  if (roundTrip.return) rows.push(toRow("return", `Return to ${warehouseName || "warehouse"}`, roundTrip.return));
  rows.push(toRow("total", "TOTAL ESTIMATED COST", roundTrip.total));
  return rows;
}

export interface CostRates {
  dieselPricePerLiter: number;
  fuelKmPerLiter: number;
  fuelCostPerKm: number;
  distanceCostPerKm: number;
  driverCostPerHour: number;
  helperCostPerHour: number;
  refrigerationLitersPerHourChilled: number;
  refrigerationLitersPerHourFrozen: number;
  refrigerationCostPerHourChilled: number;
  refrigerationCostPerHourFrozen: number;
  tollsEnabled?: boolean;
  tollVehicleClass?: number;
  tollMultiplier?: number;
}

const num = (value: number) => Number(value.toFixed(2)).toString();

/** Muted line under the table, built from the live backend config. */
export function formatRatesLine(rates: CostRates): string {
  return [
    `Rates: diesel ₱${num(rates.dieselPricePerLiter)}/L at ${num(rates.fuelKmPerLiter)} km/L (₱${num(rates.fuelCostPerKm)}/km)`,
    `distance ₱${num(rates.distanceCostPerKm)}/km`,
    `driver ₱${num(rates.driverCostPerHour)}/h`,
    `helper ₱${num(rates.helperCostPerHour)}/h (if assigned)`,
    `refrigeration ${num(rates.refrigerationLitersPerHourChilled)} L/h chilled (₱${num(rates.refrigerationCostPerHourChilled)}/h) / ${num(rates.refrigerationLitersPerHourFrozen)} L/h frozen (₱${num(rates.refrigerationCostPerHourFrozen)}/h), estimated`,
    rates.tollsEnabled
      ? `tolls: Google Class 1 estimate × ${(rates.tollMultiplier ?? 1).toFixed(1)} (Class ${rates.tollVehicleClass ?? 1}), VAT-inclusive estimate`
      : "tolls not included",
  ].join(" · ");
}

/** Clock time (local) the truck is back at the warehouse / finishes the last delivery. */
export function etaLabel(startIso: string | undefined, minutesFromStart: number): string | null {
  if (!startIso) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + minutesFromStart * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** One of the two routes shown by "Compare both". */
export interface TollOption {
  key: string;
  label: string;
  distanceKm: number;
  durationMin: number;
  cost: number;
  costBreakdown: CostParts["costBreakdown"];
  roundTrip: { outbound: CostParts; return: CostParts | null; total: CostParts };
  toll: TollSummary;
  geometry: string | null;
}

/** "Via expressway: 24.1 km · 48 min · ₱1,234.00 (incl. ₱78.00 tolls)" / "Avoid tolls: 28.0 km · 61 min · ₱1,200.00". */
export function tollOptionSummary(option: TollOption): string {
  const tolls = option.costBreakdown.tolls ?? 0;
  const note = option.toll.unknown ? " + tolls (unknown)" : tolls > 0 ? ` (incl. ${peso(tolls)} tolls)` : "";
  return `${option.label}: ${option.distanceKm.toFixed(1)} km · ${Math.round(option.durationMin)} min · ${peso(option.cost)}${note}`;
}

/** The plan with the chosen compare option applied: map, cost table, top cards and timeline all read the result. */
export function resolveActivePlan<P extends { tollOptions?: TollOption[]; activeOption?: string }>(plan: P | null, picked: string | null): P | null {
  if (!plan?.tollOptions?.length) return plan;
  const option = plan.tollOptions.find((item) => item.key === (picked ?? plan.activeOption)) ?? plan.tollOptions[0];
  return {
    ...plan,
    distanceKm: option.distanceKm,
    durationMin: option.durationMin,
    cost: option.cost,
    costBreakdown: option.costBreakdown,
    roundTrip: option.roundTrip,
    toll: option.toll,
    geometry: option.geometry,
    activeOption: option.key,
  };
}
