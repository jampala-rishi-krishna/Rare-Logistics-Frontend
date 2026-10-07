// Pure helpers for the route result: return-warehouse gating, the single cost table and the
// "Rates:" line. Kept free of React so the rules can be unit-tested.

export const RETURN_WAREHOUSE_HINT = "Choose the return warehouse";

/** Return to warehouse is checked but the user has not picked one. Never auto-selected. */
export function returnWarehouseMissing(returnToWarehouse: boolean, returnWarehouseId: string): boolean {
  return returnToWarehouse && !returnWarehouseId;
}

export interface CostParts {
  distanceKm: number;
  durationMin: number;
  costBreakdown: { distance: number; time: number; fuel: number; refrigeration: number; total: number };
}

export interface CostTableRow {
  key: "outbound" | "return" | "total";
  label: string;
  distanceKm: number;
  durationMin: number;
  distanceCost: number;
  timeCost: number;
  fuel: number;
  refrigeration: number;
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
    total: part.costBreakdown.total,
  };
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
    "tolls not included",
  ].join(" · ");
}

/** Clock time (local) the truck is back at the warehouse / finishes the last delivery. */
export function etaLabel(startIso: string | undefined, minutesFromStart: number): string | null {
  if (!startIso) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + minutesFromStart * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
