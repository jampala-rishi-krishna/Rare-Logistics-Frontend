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
  /** Flagged because the avoid-tolls route differs although Google returned no toll data. */
  inferred?: boolean;
  /** The amount was typed in by the dispatcher, not returned by Google. */
  manual?: boolean;
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
  tollManual: boolean;
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
    tollManual: part.toll?.manual ?? false,
    total: part.costBreakdown.total,
  };
}

/** Tolls cell. A toll road is never shown as 0: an unpriced one says so. */
export function tollCellText(row: CostTableRow): string {
  if (row.tollUnknown) return row.tolls > 0 ? `${peso(row.tolls)} + fee unknown` : "Toll applies, fee unknown";
  return row.tollManual ? `${peso(row.tolls)} (entered manually)` : peso(row.tolls);
}

/** How a Tolls cell is drawn: a known fee, an amber "Unknown" pill, a manual entry, or nothing ("-", never ₱0.00). */
export type TollCellState =
  | { kind: "known"; amount: number }
  | { kind: "unknown"; amount: number }
  | { kind: "manual"; amount: number }
  | { kind: "none" };

export function tollCellState(row: CostTableRow): TollCellState {
  if (row.tollUnknown) return { kind: "unknown", amount: row.tolls };
  if (row.tollManual) return { kind: "manual", amount: row.tolls };
  if (row.tollApplies || row.tolls > 0) return { kind: "known", amount: row.tolls };
  return { kind: "none" };
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
  /** false: Google returned no toll information for this route at all. */
  tollDataAvailable?: boolean;
  geometry: string | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function withTolls(part: CostParts, tolls: number, manual: boolean): CostParts {
  const old = part.costBreakdown.tolls ?? 0;
  return {
    ...part,
    costBreakdown: { ...part.costBreakdown, tolls, total: round2(part.costBreakdown.total - old + tolls) },
    toll: { present: true, amount: tolls, unknown: false, manual },
  };
}

/** The dispatcher's known toll amount (whole trip, already for this truck's class). It replaces every toll figure on the
 * route: spread over the legs that have a toll (by distance), or put on Outbound when none is flagged. Marked manual. */
export function applyManualToll<T extends Pick<TollOption, "cost" | "costBreakdown" | "roundTrip" | "toll">>(option: T, amount: number | null | undefined): T {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return option;
  const { outbound, return: back, total } = option.roundTrip;
  const parts = [outbound, ...(back ? [back] : [])];
  const flagged = parts.filter((part) => part.toll?.present);
  const targets = flagged.length ? flagged : [outbound];
  const km = targets.reduce((sum, part) => sum + part.distanceKm, 0);
  const share = (part: CostParts) => (km > 0 ? part.distanceKm / km : 1 / targets.length);
  let left = round2(amount);
  const updated = parts.map((part) => {
    const index = targets.indexOf(part);
    if (index < 0) return withTolls(part, 0, false);
    const portion = index === targets.length - 1 ? left : round2(amount * share(part));
    left = round2(left - portion);
    return withTolls(part, portion, true);
  });
  const newTotal = withTolls(total, round2(amount), true);
  const roundTrip = {
    outbound: updated[0],
    return: back ? updated[1] : null,
    total: { ...newTotal, costBreakdown: { ...newTotal.costBreakdown, total: round2(updated.reduce((sum, part) => sum + part.costBreakdown.total, 0)) } },
  };
  return { ...option, roundTrip, costBreakdown: roundTrip.total.costBreakdown, cost: roundTrip.total.costBreakdown.total, toll: roundTrip.total.toll as TollSummary };
}

/** "Via expressway: 76.7 km · 115 min · tolls unknown · total ₱1,757.07" - the trade-off in one line. */
export function tollOptionSummary(option: TollOption): string {
  const tolls = option.costBreakdown.tolls ?? 0;
  const tollText = option.toll.unknown
    ? tolls > 0 ? `tolls ${peso(tolls)} + unknown` : "tolls unknown"
    : option.toll.manual ? `tolls ${peso(tolls)} (manual)` : `tolls ${peso(tolls)}`;
  return `${option.label}: ${option.distanceKm.toFixed(1)} km · ${Math.round(option.durationMin)} min · ${tollText} · total ${peso(option.cost)}${option.toll.unknown ? " + tolls" : ""}`;
}

/** Fastest = shorter duration. Cheapest only when BOTH totals are fully known (no unpriced toll on either route). */
export function compareBadges(options: TollOption[] | undefined): { cheapest: string | null; fastest: string | null } {
  if (!options || options.length !== 2) return { cheapest: null, fastest: null };
  const [a, b] = options;
  const fastest = a.durationMin === b.durationMin ? null : a.durationMin < b.durationMin ? a.key : b.key;
  const known = !a.toll.unknown && !b.toll.unknown;
  const cheapest = !known || a.cost === b.cost ? null : a.cost < b.cost ? a.key : b.key;
  return { cheapest, fastest };
}

type ManualTolls = Record<string, number>;

/** Compare options (or the single route) with any manually entered toll applied. */
export function effectiveOptions<P extends { tollOptions?: TollOption[] }>(plan: P | null, manual: ManualTolls = {}): TollOption[] {
  return (plan?.tollOptions ?? []).map((option) => applyManualToll(option, manual[option.key]));
}

/** The plan with the chosen compare option applied: map, cost table, top cards and timeline all read the result. */
export function resolveActivePlan<P extends { tollOptions?: TollOption[]; activeOption?: string; distanceKm?: number; durationMin?: number; cost?: number; costBreakdown?: CostParts["costBreakdown"]; roundTrip?: TollOption["roundTrip"]; toll?: TollSummary; geometry?: string | null }>(
  plan: P | null,
  picked: string | null,
  manual: ManualTolls = {},
): P | null {
  if (!plan) return plan;
  if (!plan.tollOptions?.length) {
    const key = plan.activeOption ?? "expressway";
    if (manual[key] == null || !plan.roundTrip || !plan.costBreakdown || !plan.toll || plan.cost == null) return plan;
    const applied = applyManualToll({ cost: plan.cost, costBreakdown: plan.costBreakdown, roundTrip: plan.roundTrip, toll: plan.toll }, manual[key]);
    return { ...plan, ...applied };
  }
  const options = effectiveOptions(plan, manual);
  const option = options.find((item) => item.key === (picked ?? plan.activeOption)) ?? options[0];
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

/** One line of "How this is calculated", from the live backend rates. */
export interface RateChip {
  label: string;
  value: string;
}

export function rateChips(
  rates: CostRates,
  assumptions?: { refrigerated?: boolean; coldChain?: string; coldChainAssumed?: boolean },
): RateChip[] {
  const chips: RateChip[] = [
    { label: "Diesel", value: `₱${num(rates.dieselPricePerLiter)}/L · ${num(rates.fuelKmPerLiter)} km/L (₱${num(rates.fuelCostPerKm)}/km)` },
    { label: "Distance", value: `₱${num(rates.distanceCostPerKm)}/km` },
    { label: "Driver", value: `₱${num(rates.driverCostPerHour)}/h · Helper ₱${num(rates.helperCostPerHour)}/h (if assigned)` },
    {
      label: "Refrigeration",
      value: `${num(rates.refrigerationLitersPerHourChilled)} L/h chilled (₱${num(rates.refrigerationCostPerHourChilled)}/h) · ${num(rates.refrigerationLitersPerHourFrozen)} L/h frozen (₱${num(rates.refrigerationCostPerHourFrozen)}/h), estimate`,
    },
    {
      label: "Tolls",
      value: rates.tollsEnabled
        ? `Google Class 1 × ${(rates.tollMultiplier ?? 1).toFixed(1)} (Class ${rates.tollVehicleClass ?? 1}), VAT-inclusive estimate`
        : "not included",
    },
  ];
  if (assumptions) {
    const load = assumptions.refrigerated === false ? "dry truck, no refrigeration" : assumptions.coldChain === "frozen" ? "frozen" : "chilled";
    chips.push({ label: "Load", value: assumptions.coldChainAssumed && assumptions.refrigerated !== false ? `assumed ${load}` : load });
  }
  return chips;
}
