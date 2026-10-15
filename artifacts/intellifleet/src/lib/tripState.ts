// Effective trip state = last server BatchDetail + optimistic overlay of queued (unsynced) actions.
// Without queued actions every flag comes straight from the server (`workflow.can_*`,
// `trip.can_*`, `trip.next_action`, `blocker`). With queued actions the same rules the server
// enforces are replayed locally; the server stays the authority once the queue syncs.
import type { BatchDetail, DriverOrder, NextAction, TripChip, TripStatus } from "./tripTypes.ts";

export interface QueuedAction {
  batch_id: string;
  so_id?: string | null;
  kind: "acknowledge" | "acknowledge_all" | "start" | "check_in" | "check_out" | "end" | "handover" | "issue";
  status: "pending" | "syncing" | "needs_attention" | "done";
  body?: Record<string, unknown>;
  seq?: number;
  id?: string;
  error?: string | null;
}

export type StopStatus = "pending" | "checked_in" | "checked_out";

export interface EffectiveOrder {
  so_id: string;
  order: DriverOrder;
  acked: boolean;
  ackPending: boolean;
  stopStatus: StopStatus;
  stopPending: boolean;
  outcome: string | null;
  pendingSync: boolean;
  attention: Array<{ id: string | null; kind: QueuedAction["kind"]; error: string }>;
  canAcknowledge: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  blocker: string | null;
  statusLabel: string;
}

export interface EffectiveBatch {
  status: TripStatus;
  chip: TripChip;
  chipLabel: string;
  total: number;
  acknowledged: number;
  stopsDone: number;
  nextAction: NextAction;
  canStart: boolean;
  canEnd: boolean;
  canHandover: boolean;
  startBlocker: string | null;
  endBlocker: string | null;
  overlay: boolean;
  pendingCount: number;
  orders: EffectiveOrder[];
  progressText: string | null;
}

export const soIdOf = (order: DriverOrder): string => String(order.id);

function outcomeOf(body: Record<string, unknown> | undefined): string | null {
  const answers = body?.answers;
  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    const v = (answers as Record<string, unknown>).outcome;
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export function chipFor(status: TripStatus, acknowledged: number, total: number): TripChip {
  if (status === "on_trip") return "on_trip";
  if (status === "returned") return "returned";
  if (status === "handover_submitted") return "handover_pending";
  if (status === "closed") return "closed";
  return total > 0 && acknowledged >= total ? "ready" : "to_acknowledge";
}

export function chipLabelFor(chip: TripChip, stopsDone: number, total: number): string {
  switch (chip) {
    case "to_acknowledge":
      return "To acknowledge";
    case "ready":
      return "Ready to start";
    case "on_trip":
      return `On trip · stop ${Math.min(stopsDone + 1, Math.max(total, 1))} of ${total}`;
    case "returned":
      return "Back - hand over invoices";
    case "handover_pending":
      return "Handover pending";
    case "closed":
      return "Closed";
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function deriveBatchState(batch: BatchDetail, queue: QueuedAction[]): EffectiveBatch {
  // Problem reports (kind "issue") ride the same queue but never change the trip state.
  const mine = queue.filter((q) => q.batch_id === batch.batch_id && q.kind !== "issue");
  const active = mine
    .filter((q) => q.status === "pending" || q.status === "syncing")
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const attention = mine.filter((q) => q.status === "needs_attention");
  const overlay = active.length > 0;
  const trip = batch.trip ?? null;

  let status: TripStatus = trip?.status ?? "pending";
  const orders: EffectiveOrder[] = batch.orders.map((order) => {
    const wf = order.workflow ?? null;
    const raw = wf?.stop?.status;
    const stopStatus: StopStatus = raw === "checked_in" || raw === "checked_out" ? raw : "pending";
    return {
      so_id: soIdOf(order),
      order,
      acked: Boolean(wf?.ack),
      ackPending: false,
      stopStatus,
      stopPending: false,
      outcome: wf?.stop?.outcome ?? null,
      pendingSync: false,
      attention: [],
      canAcknowledge: Boolean(wf?.can_acknowledge),
      canCheckIn: Boolean(wf?.can_check_in),
      canCheckOut: Boolean(wf?.can_check_out),
      blocker: wf?.blocker ?? null,
      statusLabel: "",
    };
  });
  const byId = new Map(orders.map((o) => [o.so_id, o]));

  for (const q of active) {
    const o = q.so_id ? byId.get(String(q.so_id)) : undefined;
    switch (q.kind) {
      case "acknowledge":
        if (o && !o.acked) {
          o.ackPending = true;
          o.pendingSync = true;
        }
        break;
      case "acknowledge_all":
        for (const each of orders) {
          if (!each.acked) {
            each.ackPending = true;
            each.pendingSync = true;
          }
        }
        break;
      case "start":
        if (status === "pending") status = "on_trip";
        break;
      case "check_in":
        if (o && o.stopStatus === "pending") {
          o.stopStatus = "checked_in";
          o.stopPending = true;
          o.pendingSync = true;
        }
        break;
      case "check_out":
        if (o && o.stopStatus !== "checked_out") {
          o.stopStatus = "checked_out";
          o.stopPending = true;
          o.pendingSync = true;
          o.outcome = outcomeOf(q.body) ?? o.outcome;
        }
        break;
      case "end":
        if (status === "on_trip") status = "returned";
        break;
      case "handover":
        if (status === "returned") status = "handover_submitted";
        break;
    }
  }
  for (const q of attention) {
    const o = q.so_id ? byId.get(String(q.so_id)) : undefined;
    if (o) o.attention.push({ id: q.id ?? null, kind: q.kind, error: q.error ?? "This action was rejected." });
  }

  const total = orders.length || trip?.total || 0;
  const acknowledged = overlay ? orders.filter((o) => o.acked || o.ackPending).length : (trip?.acknowledged ?? orders.filter((o) => o.acked).length);
  const stopsDone = overlay ? orders.filter((o) => o.stopStatus === "checked_out").length : (trip?.stops_done ?? orders.filter((o) => o.stopStatus === "checked_out").length);
  const anyCheckedIn = (except: string | null) => orders.some((o) => o.stopStatus === "checked_in" && o.so_id !== except);

  let canStart: boolean;
  let canEnd: boolean;
  let canHandover: boolean;
  let startBlocker: string | null;
  let endBlocker: string | null;

  if (!overlay) {
    canStart = status === "pending" && Boolean(trip?.can_start);
    canEnd = status === "on_trip" && Boolean(trip?.can_end);
    canHandover = status === "returned" && Boolean(trip?.can_submit_handover);
    startBlocker = canStart ? null : (trip?.blocker ?? null);
    endBlocker = canEnd ? null : status === "on_trip" ? (trip?.blocker ?? null) : null;
  } else {
    const left = total - acknowledged;
    canStart = status === "pending" && total > 0 && left <= 0;
    canEnd = status === "on_trip" && total > 0 && stopsDone >= total;
    canHandover = status === "returned";
    startBlocker = status === "pending" && !canStart ? `Acknowledge all ${total} ${plural(total, "SO", "SOs")} to start the trip (${left} left).` : null;
    const notDone = total - stopsDone;
    endBlocker = status === "on_trip" && !canEnd ? `${notDone} ${plural(notDone, "stop is", "stops are")} not checked out yet.` : null;
  }

  for (const o of orders) {
    if (overlay) {
      o.canAcknowledge = status === "pending" && !o.acked && !o.ackPending;
      o.canCheckIn = status === "on_trip" && o.stopStatus === "pending" && !anyCheckedIn(o.so_id);
      o.canCheckOut = status === "on_trip" && o.stopStatus === "checked_in";
      if (status === "on_trip" && o.stopStatus === "pending" && !o.canCheckIn) {
        const other = orders.find((x) => x.stopStatus === "checked_in" && x.so_id !== o.so_id);
        o.blocker = other ? `Check out of ${other.order.so_number} before arriving at another stop.` : null;
      } else {
        o.blocker = null;
      }
    }
    o.statusLabel = orderStatusLabel(o, status);
  }

  const chip: TripChip = overlay || !trip ? chipFor(status, acknowledged, total) : trip.chip;
  const chipLabel = overlay || !trip ? chipLabelFor(chip, stopsDone, total) : trip.chip_label;

  let nextAction: NextAction;
  if (!overlay && trip) nextAction = trip.next_action;
  else if (status === "pending") nextAction = acknowledged >= total && total > 0 ? "start" : "acknowledge";
  else if (status === "on_trip") nextAction = orders.some((o) => o.stopStatus === "checked_in") ? "check_out" : stopsDone >= total ? "end" : "check_in";
  else if (status === "returned") nextAction = "handover";
  else if (status === "handover_submitted") nextAction = "wait_officer";
  else nextAction = "none";

  const onTripLike = status === "on_trip" || status === "returned" || status === "handover_submitted" || status === "closed";
  return {
    status,
    chip,
    chipLabel,
    total,
    acknowledged,
    stopsDone,
    nextAction,
    canStart,
    canEnd,
    canHandover,
    startBlocker,
    endBlocker,
    overlay,
    pendingCount: active.length,
    orders,
    progressText: onTripLike ? `${stopsDone} of ${total} delivered` : null,
  };
}

function orderStatusLabel(o: EffectiveOrder, status: TripStatus): string {
  const suffix = o.pendingSync ? " - pending sync" : "";
  if (o.stopStatus === "checked_out") return `${o.outcome ?? "Checked out"}${suffix}`;
  if (o.stopStatus === "checked_in") return `Arrived${suffix}`;
  if (o.acked || o.ackPending) return `Acknowledged${suffix}`;
  return status === "pending" ? "Not acknowledged" : "Waiting";
}

// Counts for the header badge.
export function queueCounts(queue: Array<{ status: string }>): { pending: number; needsAttention: number } {
  let pending = 0;
  let needsAttention = 0;
  for (const q of queue) {
    if (q.status === "pending" || q.status === "syncing") pending += 1;
    else if (q.status === "needs_attention") needsAttention += 1;
  }
  return { pending, needsAttention };
}
