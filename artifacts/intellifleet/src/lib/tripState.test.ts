import assert from "node:assert/strict";
import { test } from "node:test";
import { chipLabelFor, deriveBatchState, queueCounts } from "./tripState.ts";
import type { QueuedAction } from "./tripState.ts";
import type { BatchDetail } from "./tripTypes.ts";

function order(id: number, wf: Record<string, unknown> = {}) {
  return {
    id,
    so_number: `SO-${id}`,
    customer_name: `Cust ${id}`,
    contact: null,
    address_lines: [],
    address_text: "",
    shipment_date: null,
    lines: [],
    total_kg: 1,
    total_packs: 1,
    notes: null,
    delivery_status: null,
    details_loading: false,
    workflow: { ack: null, stop: null, can_acknowledge: true, can_check_in: false, can_check_out: false, blocker: null, ...wf },
  };
}

function batch(orders: any[], trip: Record<string, unknown> = {}): BatchDetail {
  return {
    batch_id: "b1",
    delivery_date: "2026-10-12",
    vehicle: "V",
    so_count: orders.length,
    total_kg: 0,
    total_packs: 0,
    first_area: null,
    last_area: null,
    departure_time: null,
    helpers: [],
    assignment_status: "x",
    email_status: null,
    stop_order_set: false,
    details_loading: false,
    orders,
    trip: {
      status: "pending",
      chip: "to_acknowledge",
      chip_label: "To acknowledge",
      acknowledged: 0,
      total: orders.length,
      stops_done: 0,
      current_stop_so_id: null,
      started_at: null,
      ended_at: null,
      next_action: "acknowledge",
      can_start: false,
      can_end: false,
      can_submit_handover: false,
      blocker: `Acknowledge all ${orders.length} SOs to start the trip (${orders.length} left).`,
      handover_status: null,
      officer: null,
      ...trip,
    },
  } as BatchDetail;
}

const ACK = { at: "t", by: { name: "Emert" } };
const q = (kind: QueuedAction["kind"], so: number | null, seq: number, extra: Partial<QueuedAction> = {}): QueuedAction => ({
  batch_id: "b1",
  so_id: so === null ? null : String(so),
  kind,
  status: "pending",
  seq,
  ...extra,
});

test("no queue: flags come straight from the server", () => {
  const b = batch([order(1), order(2)]);
  const s = deriveBatchState(b, []);
  assert.equal(s.overlay, false);
  assert.equal(s.canStart, false);
  assert.equal(s.startBlocker, "Acknowledge all 2 SOs to start the trip (2 left).");
  assert.equal(s.chipLabel, "To acknowledge");
  assert.equal(s.nextAction, "acknowledge");
  assert.equal(s.orders[0].canAcknowledge, true);
  assert.equal(s.orders[0].canCheckIn, false);
  assert.equal(s.progressText, null);
});

test("server can_start is respected; start hidden once not pending", () => {
  const b = batch([order(1, { ack: ACK, can_acknowledge: false })], { acknowledged: 1, can_start: true, next_action: "start", chip: "ready", chip_label: "Ready to start", blocker: null });
  assert.equal(deriveBatchState(b, []).canStart, true);
  const on = batch([order(1, { ack: ACK, can_acknowledge: false })], { status: "on_trip", can_start: true });
  assert.equal(deriveBatchState(on, []).canStart, false);
});

test("queued acknowledge shows pending sync and disables the ack button", () => {
  const b = batch([order(1), order(2)]);
  const s = deriveBatchState(b, [q("acknowledge", 1, 1)]);
  assert.equal(s.overlay, true);
  assert.equal(s.pendingCount, 1);
  assert.equal(s.orders[0].ackPending, true);
  assert.equal(s.orders[0].statusLabel, "Acknowledged - pending sync");
  assert.equal(s.orders[0].canAcknowledge, false);
  assert.equal(s.orders[1].canAcknowledge, true);
  assert.equal(s.acknowledged, 1);
  assert.equal(s.canStart, false);
  assert.equal(s.startBlocker, "Acknowledge all 2 SOs to start the trip (1 left).");
});

test("all acknowledged offline enables Start; queued start puts the trip on_trip", () => {
  const b = batch([order(1), order(2)]);
  const acks = [q("acknowledge", 1, 1), q("acknowledge", 2, 2)];
  let s = deriveBatchState(b, acks);
  assert.equal(s.canStart, true);
  assert.equal(s.chip, "ready");
  assert.equal(s.nextAction, "start");
  s = deriveBatchState(b, [...acks, q("start", null, 3)]);
  assert.equal(s.status, "on_trip");
  assert.equal(s.canStart, false);
  assert.equal(s.chipLabel, "On trip · stop 1 of 2");
  assert.equal(s.orders[0].canCheckIn, true);
  assert.equal(s.orders[1].canCheckIn, true);
  assert.equal(s.progressText, "0 of 2 delivered");
});

test("on trip: arriving at one stop blocks the others until checkout", () => {
  const b = batch([order(1, { ack: ACK, can_acknowledge: false, can_check_in: true }), order(2, { ack: ACK, can_acknowledge: false, can_check_in: true })], { status: "on_trip", acknowledged: 2, chip: "on_trip", chip_label: "On trip · stop 1 of 2", next_action: "check_in" });
  let s = deriveBatchState(b, [q("check_in", 1, 1)]);
  assert.equal(s.orders[0].stopStatus, "checked_in");
  assert.equal(s.orders[0].statusLabel, "Arrived - pending sync");
  assert.equal(s.orders[0].canCheckOut, true);
  assert.equal(s.orders[0].canCheckIn, false);
  assert.equal(s.orders[1].canCheckIn, false);
  assert.equal(s.orders[1].blocker, "Check out of SO-1 before arriving at another stop.");
  assert.equal(s.nextAction, "check_out");
  s = deriveBatchState(b, [q("check_in", 1, 1), q("check_out", 1, 2, { body: { answers: { outcome: "Delivered" } } })]);
  assert.equal(s.orders[0].statusLabel, "Delivered - pending sync");
  assert.equal(s.stopsDone, 1);
  assert.equal(s.orders[1].canCheckIn, true);
  assert.equal(s.canEnd, false);
  assert.equal(s.endBlocker, "1 stop is not checked out yet.");
  assert.equal(s.progressText, "1 of 2 delivered");
});

test("all stops checked out offline enables End; queued end -> returned -> handover", () => {
  const b = batch([order(1, { ack: ACK, can_acknowledge: false, stop: { status: "checked_out", outcome: "Delivered" } })], { status: "on_trip", acknowledged: 1, stops_done: 1, can_end: true, next_action: "end", chip: "on_trip", chip_label: "On trip · stop 1 of 1" });
  assert.equal(deriveBatchState(b, []).canEnd, true);
  const queued = deriveBatchState(b, [q("end", null, 1)]);
  assert.equal(queued.status, "returned");
  assert.equal(queued.canEnd, false);
  assert.equal(queued.canHandover, true);
  assert.equal(queued.chipLabel, "Back - hand over invoices");
  const ho = deriveBatchState(b, [q("end", null, 1), q("handover", null, 2)]);
  assert.equal(ho.status, "handover_submitted");
  assert.equal(ho.nextAction, "wait_officer");
  assert.equal(ho.canHandover, false);
});

test("needs_attention entries do not change state but are listed on the order", () => {
  const b = batch([order(1)]);
  const s = deriveBatchState(b, [q("acknowledge", 1, 1, { status: "needs_attention", error: "The trip has already started.", id: "e1" })]);
  assert.equal(s.overlay, false);
  assert.equal(s.orders[0].ackPending, false);
  assert.equal(s.orders[0].attention[0].error, "The trip has already started.");
});

test("entries of other batches are ignored; ordering by seq", () => {
  const b = batch([order(1)]);
  const other = { ...q("acknowledge", 1, 1), batch_id: "zzz" };
  assert.equal(deriveBatchState(b, [other]).overlay, false);
  // start applied before checkin regardless of array order
  const done = batch([order(1, { ack: ACK, can_acknowledge: false })], { acknowledged: 1 });
  const s = deriveBatchState(done, [q("check_in", 1, 2), q("start", null, 1)]);
  assert.equal(s.orders[0].stopStatus, "checked_in");
});

test("batch without trip/workflow (older backend) degrades to a pending trip", () => {
  const b = batch([order(1)]);
  delete (b as any).trip;
  delete (b.orders[0] as any).workflow;
  const s = deriveBatchState(b, []);
  assert.equal(s.status, "pending");
  assert.equal(s.canStart, false);
  assert.equal(s.orders[0].canAcknowledge, false);
});

test("chip labels and queue counts", () => {
  assert.equal(chipLabelFor("on_trip", 5, 5), "On trip · stop 5 of 5");
  assert.equal(chipLabelFor("handover_pending", 0, 1), "Handover pending");
  assert.deepEqual(queueCounts([{ status: "pending" }, { status: "syncing" }, { status: "needs_attention" }, { status: "done" }]), { pending: 2, needsAttention: 1 });
});
