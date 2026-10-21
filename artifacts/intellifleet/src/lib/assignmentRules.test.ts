import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECKED_OUT_REASON,
  canShowUnassign,
  pickupBlock,
  pickupBlocksFrom,
  pickupPopupLines,
  skippedUnassignText,
  splitPickups,
  unassignBlockedReason,
  type AssignmentRuleOrder,
} from "./assignmentRules.ts";

const order = (over: Partial<AssignmentRuleOrder> = {}): AssignmentRuleOrder => ({
  id: "so-1",
  salesorder_number: "SO26-16612",
  customer_name: "Acme Foods",
  expected_shipment_date: "2026-10-21",
  order_type: "SO",
  order_status: "confirmed",
  assignment_status: "assigned",
  ...over,
});

test("Unassign shows for an open assigned order", () => {
  assert.equal(unassignBlockedReason(order()), null);
  assert.equal(canShowUnassign(order()), true);
  assert.equal(canShowUnassign(order({ assignment_status: "unassigned" })), false);
});

test("Unassign is hidden when the backend sends a reason", () => {
  const o = order({ unassign_blocked_reason: "Zoho shows this sales order as shipped. It cannot be unassigned." });
  assert.equal(canShowUnassign(o), false);
  assert.match(unassignBlockedReason(o)!, /shipped/);
});

for (const [field, value, label] of [
  ["order_status", "fulfilled", "fulfilled"],
  ["shipment_status", "shipped", "shipped"],
  ["shipment_status", "partially_shipped", "partially shipped"],
  ["delivery_status", "Partially delivered", "partially delivered"],
  ["order_status", "partially-delivered", "partially delivered"],
  ["delivery_status", "Delivered", "delivered"],
] as const) {
  test(`Unassign is hidden (fallback) when ${field} is ${value}`, () => {
    const o = order({ [field]: value });
    assert.equal(canShowUnassign(o), false);
    assert.ok(unassignBlockedReason(o)!.includes(label));
  });
}

test("Unassign is hidden when the stop is checked out", () => {
  assert.equal(unassignBlockedReason(order({ stop_status: "checked_out" })), CHECKED_OUT_REASON);
  assert.equal(canShowUnassign(order({ checkout_at: "2026-10-21T10:00:00+08:00" })), false);
});

test("TO / PO statuses never use the SO Zoho-status rule", () => {
  assert.equal(canShowUnassign(order({ order_type: "TO", order_status: "shipped" })), true);
});

test("pickup: Fulfillment type or Delivery method says pickup (any spelling)", () => {
  for (const value of ["Pickup", "pick up", "Customer Pick-Up", "PICK_UP"]) {
    assert.ok(pickupBlock(order({ fulfillment_type: value })), value);
    assert.ok(pickupBlock(order({ delivery_method: value })), value);
  }
  assert.equal(pickupBlock(order({ delivery_method: "Truck", fulfillment_type: "Delivery" })), null);
  assert.equal(pickupBlock(order({ order_type: "PO", delivery_method: "For Pickup" })), null);
});

test("pickup popup text: SO number, customer, delivery date and both fields", () => {
  const block = pickupBlock(order({ fulfillment_type: "Pickup", delivery_method: "Standard" }))!;
  assert.equal(block.reason, "SO26-16612 is a customer pickup (Fulfillment type: Pickup). Pickup orders are collected by the customer and can't be assigned to a truck.");
  const [line] = pickupPopupLines([block]);
  assert.deepEqual(line.details, ["Customer: Acme Foods", "Delivery date: 2026-10-21", "Delivery method: Standard", "Fulfillment type: Pickup"]);
  const byMethod = pickupBlock(order({ delivery_method: "Pick up" }))!;
  assert.match(byMethod.reason, /\(Delivery method: Pick up\)/);
});

test("bulk: pickups are split out, the rest stay assignable", () => {
  const { assignable, blocked } = splitPickups([order({ id: "a" }), order({ id: "b", salesorder_number: "SO26-2", fulfillment_type: "Pickup" }), order({ id: "c", delivery_method: "pickup" })]);
  assert.deepEqual(assignable.map((o) => o.id), ["a"]);
  assert.deepEqual(blocked.map((b) => b.id), ["b", "c"]);
});

test("pickup blocks are read from a 422 error body and from a bulk success body", () => {
  const entry = { id: "x", order_number: "SO26-1", customer: null, delivery_date: null, delivery_method: "Pickup", fulfillment_type: null, reason: "r" };
  assert.deepEqual(pickupBlocksFrom({ status: 422, body: { detail: { code: "pickup_not_assignable", blocked: [entry] } } }), [entry]);
  assert.deepEqual(pickupBlocksFrom({ success: true, pickup_blocked: [entry] }), [entry]);
  assert.deepEqual(pickupBlocksFrom({ body: { detail: { code: "other" } } }), []);
  assert.deepEqual(pickupBlocksFrom(null), []);
});

test("bulk unassign skipped list prefers the SO number", () => {
  assert.equal(skippedUnassignText([{ id: "1", order_number: "SO26-1", reason: "shipped" }, { id: "2" }]), "SO26-1 (shipped), 2");
});
