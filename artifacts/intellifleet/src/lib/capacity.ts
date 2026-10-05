export interface CapacityOverage {
  overKg: number;
  /** Over-capacity as a percentage of the truck's capacity. */
  percent: number;
  text: string;
}

const oneDecimal = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * Over-capacity warning for a truck. `weightKg` is the load being assigned; `remainingKg` is
 * what the truck has left after everything already on it, and `capacityKg` its rating.
 * Returns null when there is nothing to warn about: unknown weight or capacity (never treated
 * as over), or a load that fits - including one that is exactly at capacity.
 */
export function capacityOverage(
  weightKg: number | null | undefined,
  remainingKg: number | null | undefined,
  capacityKg: number | null | undefined,
): CapacityOverage | null {
  if (weightKg == null || remainingKg == null || capacityKg == null || !(capacityKg > 0)) return null;
  const overKg = weightKg - remainingKg;
  if (!(overKg > 0)) return null;
  const percent = (overKg / capacityKg) * 100;
  return { overKg, percent, text: `Over capacity by ${oneDecimal(overKg)} kg (${oneDecimal(percent)}%)` };
}

/** Fleet/truck load already past its rating (e.g. after an over-capacity assignment). */
export function loadOverage(assignedKg: number | null | undefined, capacityKg: number | null | undefined): CapacityOverage | null {
  return capacityOverage(assignedKg, capacityKg, capacityKg);
}
