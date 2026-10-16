// Which stop the helper delivers next. The crew picks the order of stops themselves: after Start trip (and after
// each delivery) the trip screen lists every pending stop with a "Deliver this next" button; the picked stop then
// runs the usual Reached -> Delivered (with photo) flow. A stop already checked in (or flagged `is_active` by the
// server) is always the current one and cannot be swapped away.
// Pure (no React) so node tests can cover it.

export type StopStatusLike = "pending" | "checked_in" | "checked_out";

/** Server stop status -> the three states the phone works with. `is_active` / "arrived" count as checked in. */
export function normalizeStopStatus(raw: string | null | undefined, isActive?: boolean | null): StopStatusLike {
  const s = String(raw ?? "").toLowerCase();
  if (s === "checked_out") return "checked_out";
  if (s === "checked_in" || s === "arrived" || s === "active" || isActive === true) return "checked_in";
  return "pending";
}

export interface ChoosableStop {
  so_id: string;
  stopStatus: StopStatusLike;
}

/** Stops not yet reached, in the server's stop order. */
export function pendingStops<T extends ChoosableStop>(stops: readonly T[]): T[] {
  return stops.filter((s) => s.stopStatus === "pending");
}

/** The stop the crew is at right now (checked in), if any. */
export function activeStop<T extends ChoosableStop>(stops: readonly T[]): T | null {
  return stops.find((s) => s.stopStatus === "checked_in") ?? null;
}

export type StopView<T> =
  | { kind: "current"; stop: T } // checked in at this stop: Delivered
  | { kind: "chosen"; stop: T } // picked, on the way: Navigate / Reached
  | { kind: "choose"; pending: T[] } // pick the next stop from the list
  | { kind: "none" }; // every stop done (End trip)

/** What the trip screen shows while on the trip, given the stop the helper tapped (null = none picked yet). */
export function stopView<T extends ChoosableStop>(stops: readonly T[], chosenSoId: string | null | undefined, switching = false): StopView<T> {
  const active = activeStop(stops);
  const pending = pendingStops(stops);
  // switching: the crew reached a stop but wants to deliver another first; arriving there reopens the reached one.
  if (active && !(switching && pending.length > 0)) return { kind: "current", stop: active };
  const chosen = chosenSoId ? pending.find((s) => s.so_id === String(chosenSoId)) : undefined;
  if (chosen) return { kind: "chosen", stop: chosen };
  if (pending.length > 0) return { kind: "choose", pending };
  return { kind: "none" };
}

/** The stop the big button works on (current or chosen), else null. */
export function focusStop<T extends ChoosableStop>(view: StopView<T>): T | null {
  return view.kind === "current" || view.kind === "chosen" ? view.stop : null;
}

/**
 * The picked stop after a refresh: kept while it is still pending; dropped once it is delivered (so the list of the
 * remaining stops shows again) or removed by dispatch.
 */
export function keepChoice(stops: readonly ChoosableStop[], chosenSoId: string | null | undefined): string | null {
  if (!chosenSoId) return null;
  const hit = stops.find((s) => s.so_id === String(chosenSoId));
  return hit && hit.stopStatus !== "checked_out" ? hit.so_id : null;
}

/** After a delivery is saved: no stop is picked, the remaining pending stops are shown to choose from (or End trip). */
export function afterDelivery<T extends ChoosableStop>(stops: readonly T[], deliveredSoId: string): StopView<T> {
  const rest = stops.map((s) => (s.so_id === String(deliveredSoId) ? { ...s, stopStatus: "checked_out" as const } : s));
  return stopView(rest, null);
}
