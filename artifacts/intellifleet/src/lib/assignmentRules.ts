// Assignment rules shared by Load Planning and Confirmed Orders. Pure (no React, no fetch) so it is node-testable.
//
// 1. Unassign is hidden when the order can't be removed: the backend sends `unassign_blocked_reason` on each row (Zoho
//    fulfilled / shipped / partially delivered / delivered, or the trip stop checked out). `unassignBlockedReason` also
//    derives the same answer from the row's own status fields as a fallback (older payloads / rows without the field).
// 2. Customer pickups (Delivery method or Fulfillment type says pickup) can't be assigned to a truck: one
//    "Unable to assign" popup lists every blocked SO; the rest assign normally. The backend enforces the same rule
//    (single -> 422 detail.blocked, bulk -> `pickup_blocked` on the success response).

/** The order fields these rules read (a narrow view of SalesOrderSummary, so this file stays dependency free). */
export interface AssignmentRuleOrder {
  id: string;
  salesorder_number?: string | null;
  customer_name?: string | null;
  expected_shipment_date?: string | null;
  order_type?: string | null;
  order_status?: string | null;
  shipment_status?: string | null;
  delivery_status?: string | null;
  assignment_status?: string | null;
  delivery_method?: string | null;
  fulfillment_type?: string | null;
  unassign_blocked_reason?: string | null;
  stop_status?: string | null;
  checkout_at?: string | null;
}

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");

const BLOCKED_STATUS_LABELS: Record<string, string> = {
  fulfilled: "fulfilled",
  shipped: "shipped",
  "partially shipped": "partially shipped",
  "partially delivered": "partially delivered",
  partial: "partially delivered",
  delivered: "delivered",
};

export const CHECKED_OUT_REASON = "The stop was already checked out on the trip. A checked-out order cannot be unassigned.";

/** Why Unassign must be hidden for this row (null = it may show). Backend reason first, then the row's own fields. */
export function unassignBlockedReason(order: AssignmentRuleOrder): string | null {
  if (order.unassign_blocked_reason) return order.unassign_blocked_reason;
  const type = String(order.order_type ?? "").toUpperCase();
  if (type !== "TO" && type !== "PO") {
    for (const value of [order.order_status, order.shipment_status, order.delivery_status]) {
      const label = BLOCKED_STATUS_LABELS[norm(value)];
      if (label) return `Zoho shows this sales order as ${label}. It cannot be unassigned.`;
    }
  }
  if (norm(order.stop_status) === "checked out" || order.checkout_at) return CHECKED_OUT_REASON;
  return null;
}

/** Show the Unassign action? Only for assigned orders that can still be removed. */
export function canShowUnassign(order: AssignmentRuleOrder): boolean {
  return order.assignment_status === "assigned" && unassignBlockedReason(order) === null;
}

// ---- pickup ------------------------------------------------------------------------------------------------------------

const PICKUP = /pick[\s_-]*up/i;

export function isPickupValue(value: unknown): boolean {
  return Boolean(value) && PICKUP.test(String(value));
}

/** One blocked order in the "Unable to assign" popup (same shape as the backend's `blocked` / `pickup_blocked` entries). */
export interface PickupBlock {
  id: string;
  order_number: string;
  customer: string | null;
  delivery_date: string | null;
  delivery_method: string | null;
  fulfillment_type: string | null;
  reason: string;
}

export function pickupReason(orderNumber: string, deliveryMethod: string | null | undefined, fulfillmentType: string | null | undefined): string {
  const which = isPickupValue(fulfillmentType) ? `Fulfillment type: ${fulfillmentType}` : `Delivery method: ${deliveryMethod}`;
  return `${orderNumber} is a customer pickup (${which}). Pickup orders are collected by the customer and can't be assigned to a truck.`;
}

/** The popup entry for a customer pickup, or null when the order may go on a truck. PO / TO are never customer pickups. */
export function pickupBlock(order: AssignmentRuleOrder): PickupBlock | null {
  const type = String(order.order_type ?? "").toUpperCase();
  if (type === "PO" || type === "TO") return null;
  if (!isPickupValue(order.delivery_method) && !isPickupValue(order.fulfillment_type)) return null;
  const number = order.salesorder_number || order.id;
  return {
    id: order.id,
    order_number: number,
    customer: order.customer_name ?? null,
    delivery_date: order.expected_shipment_date ? String(order.expected_shipment_date).slice(0, 10) : null,
    delivery_method: order.delivery_method ?? null,
    fulfillment_type: order.fulfillment_type ?? null,
    reason: pickupReason(number, order.delivery_method, order.fulfillment_type),
  };
}

/** Split a selection: the ids that may be assigned, and the blocked pickups (for the one popup). */
export function splitPickups<T extends AssignmentRuleOrder>(orders: readonly T[]): { assignable: T[]; blocked: PickupBlock[] } {
  const assignable: T[] = [];
  const blocked: PickupBlock[] = [];
  for (const order of orders) {
    const block = pickupBlock(order);
    if (block) blocked.push(block);
    else assignable.push(order);
  }
  return { assignable, blocked };
}

/** Blocked pickups from a backend answer: a 422 error body (`detail.blocked`) or a success body (`pickup_blocked`). */
export function pickupBlocksFrom(value: unknown): PickupBlock[] {
  const v = value as { body?: unknown; detail?: unknown; pickup_blocked?: unknown } | null | undefined;
  if (!v || typeof v !== "object") return [];
  if (Array.isArray(v.pickup_blocked)) return v.pickup_blocked as PickupBlock[];
  const body = (v.body ?? v) as { detail?: { code?: string; blocked?: unknown } } | null;
  const detail = body?.detail;
  if (detail && typeof detail === "object" && detail.code === "pickup_not_assignable" && Array.isArray(detail.blocked)) return detail.blocked as PickupBlock[];
  return [];
}

export const UNABLE_TO_ASSIGN_TITLE = "Unable to assign";

/** The popup's text: the reason line(s), then customer / delivery date / both field values per blocked order. */
export function pickupPopupLines(blocked: readonly PickupBlock[]): { reason: string; details: string[] }[] {
  return blocked.map((b) => ({
    reason: b.reason,
    details: [
      `Customer: ${b.customer || "-"}`,
      `Delivery date: ${b.delivery_date || "-"}`,
      `Delivery method: ${b.delivery_method || "-"}`,
      `Fulfillment type: ${b.fulfillment_type || "-"}`,
    ],
  }));
}

/** Bulk unassign result: "SO26-1 (reason), SO26-2 (reason)" from the backend's skipped list (order_number preferred). */
export function skippedUnassignText(skipped: ReadonlyArray<{ id: string; order_number?: string | null; reason?: string | null }> | undefined): string {
  if (!skipped?.length) return "";
  return skipped.map((s) => `${s.order_number || s.id}${s.reason ? ` (${s.reason})` : ""}`).join(", ");
}
