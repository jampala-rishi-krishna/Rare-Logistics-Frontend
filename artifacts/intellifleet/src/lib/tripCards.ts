// Today-screen helpers: ONE primary action per trip card, chosen from the server's real trip state; trip labels; progress.
import type { Batch } from "./tripTypes.ts";

export type CardActionKind = "acknowledge" | "start" | "arrive" | "depart" | "end" | "handover" | "wait" | "view";

export interface CardAction {
  kind: CardActionKind;
  label: string;
  // false = informational (nothing for the crew to do right now)
  actionable: boolean;
}

export function primaryAction(batch: Pick<Batch, "trip">): CardAction {
  const trip = batch.trip;
  if (!trip) return { kind: "view", label: "View trip", actionable: true };
  const left = Math.max(trip.total - trip.acknowledged, 0);
  switch (trip.next_action) {
    case "acknowledge":
      return { kind: "acknowledge", label: left > 0 ? `Acknowledge orders (${left} left)` : "Acknowledge orders", actionable: true };
    case "start":
      return { kind: "start", label: "Start trip", actionable: true };
    case "check_in":
      return { kind: "arrive", label: "Arrived at site", actionable: true };
    case "check_out":
      return { kind: "depart", label: "Departed from site", actionable: true };
    case "end":
      return { kind: "end", label: "End trip", actionable: true };
    case "handover":
      return { kind: "handover", label: "Hand over invoices", actionable: true };
    case "wait_officer":
      return { kind: "wait", label: "Waiting for the officer", actionable: false };
    default:
      return { kind: "view", label: "View trip", actionable: true };
  }
}

// "Trip 2 of 3" only when the same day has more than one real assignment (two Assign clicks), else null.
export function tripLabel(batch: Pick<Batch, "trip_number" | "trips_on_date">): string | null {
  const total = batch.trips_on_date ?? 1;
  const n = batch.trip_number ?? 1;
  return total > 1 ? `Trip ${n} of ${total}` : null;
}

// Delivered-or-otherwise-finished stops out of all orders; null when the trip has not started (no stops yet).
export function stopProgress(batch: Pick<Batch, "trip" | "so_count">): { done: number; total: number; percent: number } | null {
  const trip = batch.trip;
  if (!trip || trip.status === "pending") return null;
  const total = batch.so_count;
  const done = trip.stops_done;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export function routeText(batch: Pick<Batch, "first_area" | "last_area">): string | null {
  const parts = [batch.first_area, batch.last_area].filter((p): p is string => Boolean(p));
  if (parts.length === 0) return null;
  return parts.length === 2 && parts[0] !== parts[1] ? `${parts[0]} \u2192 ${parts[1]}` : parts[0] === parts[1] ? `${parts[0]} \u2192 ${parts[0]}` : parts[0];
}

export type HistoryTone = "done" | "warn" | "bad" | "idle";

// The status chip of a past trip, from the real outcomes only.
export function historyStatus(batch: Pick<Batch, "trip" | "so_count" | "progress">): { label: string; tone: HistoryTone } {
  const p = batch.progress;
  const finished = Boolean(batch.trip && ["returned", "handover_submitted", "closed"].includes(batch.trip.status));
  if (p && batch.so_count > 0 && p.failed === batch.so_count) return { label: "Failed", tone: "bad" };
  if (p && (p.failed > 0 || p.partial > 0)) return { label: finished ? "Partially completed" : "Needs attention", tone: "warn" };
  if (finished) return { label: "Completed", tone: "done" };
  if (batch.trip && batch.trip.status === "on_trip") return { label: "In progress", tone: "idle" };
  return { label: "Not completed", tone: "idle" };
}
