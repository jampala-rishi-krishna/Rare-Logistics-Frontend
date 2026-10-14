// TEST-ONLY fixtures for the Driver Overview run. Fictitious people, plates and addresses; never shipped, never read by the app.
import { templates } from "./driverData.ts";

export const adminSession = { user: { id: "1", fullName: "Test Admin", email: "admin@example.test", role: "admin", status: "active", mustChangePassword: false, staffId: null } };
export const dispatcherSession = { user: { id: "2", fullName: "Test Dispatcher", email: "dispatch@example.test", role: "dispatcher", status: "active", mustChangePassword: false, staffId: null } };

export const kpis = {
  from: "2026-10-13", to: "2026-10-13", generated_at: "2026-10-13T08:30:00+08:00",
  kpis: {
    drivers: { active: 4, on_trip: 1, returned: 1, idle: 1 },
    sos: { assigned: 17, acknowledged: 13, delivered: 5, partial: 1, failed: 1 },
    trips_pending_handover: 2, invoices_outstanding: 5, issues_open: 2, batches: 5, kg: 2263.78, kg_complete: false, kg_unknown_lines: 1, packs: 66,
  },
};

function trip(batch_id: string, n: number, of: number, vehicle: string, state: string, label: string, so: number, ack: number, done: number, over: Record<string, unknown> = {}) {
  return { batch_id, trip_number: n, trips_on_date: of, vehicle, state, state_label: label, so_count: so, kg: 100 * so, kg_complete: true, kg_unknown_lines: 0, packs: null, acknowledged: ack, stops_done: done, role: "driver", ...over };
}

export const board = {
  stale_minutes: 15,
  rows: [
    {
      so_numbers: ["SO-TEST-2001", "SO-TEST-2002", "SO-TEST-2003", "SO-TEST-2004", "SO-TEST-2005", "SO-TEST-2006"], staff_id: 101, name: "Alex Driver", role: "driver", warehouse: "METS", state: "to_acknowledge", state_label: "To acknowledge",
      vehicle: "TRK-1001", batch_id: "b-1", current_stop: null, progress: { done: 0, total: 6 }, acknowledged: 2, batch_count: 2, kg: 664.67, kg_complete: true, kg_unknown_lines: 0, packs: null,
      trips: [trip("b-1", 1, 2, "TRK-1001", "to_acknowledge", "To acknowledge", 5, 1, 0), trip("b-2", 2, 2, "TRK-1001", "to_acknowledge", "To acknowledge", 1, 1, 0)],
      last_action: { type: "acknowledged", at: "2026-10-13T08:12:00+08:00", label: "Acknowledged SO-TEST-2002" }, last_gps_at: null, stale: false,
    },
    {
      so_numbers: ["SO-TEST-3001", "SO-TEST-3002", "SO-TEST-3003", "SO-TEST-3004", "SO-TEST-3005"], staff_id: 103, name: "Casey Runner", role: "driver", warehouse: "METS", state: "on_trip", state_label: "On trip · stop 4 of 5",
      vehicle: "TRK-2002", batch_id: "b-3", current_stop: "Test Customer D", progress: { done: 3, total: 5 }, acknowledged: 5, batch_count: 1, kg: 354, kg_complete: false, kg_unknown_lines: 1, packs: 66,
      trips: [trip("b-3", 1, 1, "TRK-2002", "on_trip", "On trip · stop 4 of 5", 5, 5, 3, { kg: 354, kg_complete: false, kg_unknown_lines: 1, packs: 66 })],
      last_action: { type: "checked_out", at: "2026-10-13T07:20:00+08:00", label: "Checked out of SO-TEST-3003" }, last_gps_at: "2026-10-13T08:25:00+08:00", stale: true,
    },
    {
      so_numbers: ["SO-TEST-4001", "SO-TEST-4002", "SO-TEST-4003", "SO-TEST-4004", "SO-TEST-4005"], staff_id: 104, name: "Dana Hauler", role: "driver", warehouse: "GLACIER", state: "handover_pending", state_label: "Handover pending",
      vehicle: "TRK-3003", batch_id: "b-4", current_stop: null, progress: { done: 5, total: 5 }, acknowledged: 5, batch_count: 1, kg: 1141.11, kg_complete: true, kg_unknown_lines: 0, packs: null,
      trips: [trip("b-4", 1, 1, "TRK-3003", "handover_pending", "Handover pending", 5, 5, 5)],
      last_action: { type: "handover_submitted", at: "2026-10-13T08:05:00+08:00", label: "Handed over invoices" }, last_gps_at: null, stale: false,
    },
    {
      so_numbers: ["SO-TEST-2001", "SO-TEST-2002", "SO-TEST-2003", "SO-TEST-2004", "SO-TEST-2005", "SO-TEST-2006"], staff_id: 102, name: "Sam Helper", role: "helper", warehouse: "METS", state: "to_acknowledge", state_label: "To acknowledge",
      vehicle: "TRK-1001", batch_id: "b-1", current_stop: null, progress: { done: 0, total: 6 }, acknowledged: 2, batch_count: 2, kg: 664.67, kg_complete: true, kg_unknown_lines: 0, packs: null, trips: [],
      last_action: { type: "acknowledged", at: "2026-10-13T08:12:00+08:00", label: "Acknowledged SO-TEST-2002" }, last_gps_at: null, stale: false,
    },
    { so_numbers: [], staff_id: 105, name: "Eli Standby", role: "driver", warehouse: "METS", state: "idle", state_label: "Idle", vehicle: null, batch_id: null, current_stop: null, progress: { done: 0, total: 0 }, acknowledged: 0, batch_count: 0, kg: 0, kg_complete: false, kg_unknown_lines: 0, packs: null, trips: [], last_action: null, last_gps_at: null, stale: false },
  ],
};

export const live = {
  date: "2026-10-13", generated_at: "2026-10-13T08:30:00+08:00",
  trucks: [
    { plate: "TRK-1001", drivers: ["Alex Driver"], batch_ids: ["b-1", "b-2"], states: ["to_acknowledge"], fix: { lat: 14.62, lng: 121.0, heading: 0, speed_kph: 0, ignition_on: false, status: "Idle", gps_time: "2026-10-13T00:28:00+00:00", last_updated: "2026-10-13T08:29:00+08:00" } },
    { plate: "TRK-2002", drivers: ["Casey Runner"], batch_ids: ["b-3"], states: ["on_trip"], fix: { lat: 14.56, lng: 121.04, heading: 90, speed_kph: 28, ignition_on: true, status: "Active", gps_time: "2026-10-13T00:29:00+00:00", last_updated: "2026-10-13T08:29:30+08:00" } },
    { plate: "TRK-3003", drivers: ["Dana Hauler"], batch_ids: ["b-4"], states: ["handover_pending"], fix: null },
  ],
};

const pt = (type: string, lat: number, lng: number, so: string | null, outcome: string | null = null, at: string | null = null, batch = "b-3") => ({ type, lat, lng, at, so_number: so, customer_name: so ? "Test Customer" : null, batch_id: batch, driver_name: "Casey Runner", accuracy_m: 10, outcome });
export const map = {
  warehouses: [{ id: "mets", name: "METS cold storage", lat: 14.62, lng: 121.0 }, { id: "glacier", name: "GLACIER cold storage", lat: 14.52, lng: 120.99 }],
  points: [
    pt("start", 14.62, 121.0, null, null, "2026-10-13T07:10:00+08:00"),
    pt("stop", 14.676, 121.044, "SO-TEST-3001"), pt("checkin", 14.6762, 121.0442, "SO-TEST-3001", null, "2026-10-13T07:30:00+08:00"), pt("checkout", 14.6762, 121.0442, "SO-TEST-3001", "Delivered", "2026-10-13T07:50:00+08:00"),
    pt("stop", 14.6, 121.03, "SO-TEST-3002"), pt("checkin", 14.6003, 121.0301, "SO-TEST-3002", null, "2026-10-13T08:00:00+08:00"), pt("checkout", 14.6003, 121.0301, "SO-TEST-3002", "Partially delivered", "2026-10-13T08:10:00+08:00"),
    pt("stop", 14.58, 121.05, "SO-TEST-3003"), pt("checkin", 14.5801, 121.0502, "SO-TEST-3003", null, "2026-10-13T08:15:00+08:00"), pt("checkout", 14.5801, 121.0502, "SO-TEST-3003", "Failed", "2026-10-13T08:25:00+08:00"),
    pt("stop", 14.55, 121.03, "SO-TEST-3004"), pt("stop", 14.54, 121.0, "SO-TEST-3005"),
  ],
};

const by = { name: "Casey Runner", role: "driver" };
const ackAnswers = [{ label: "Products match the SO lines and quantities", type: "checkbox", value: true, note: null }, { label: "Invoice copies received", type: "checkbox", value: true, note: null }, { label: "Number of packs received", type: "count", value: 12, note: "2 packs short" }];

function orderTl(n: number, seq: number, done: boolean, outcome: string | null, invoice: string | null) {
  return {
    so_id: `so-${n}`, so_number: `SO-TEST-300${n}`, customer_name: `Test Customer ${String.fromCharCode(64 + n)}`, address_text: `${n} Sample Street, Metro Manila`,
    ack: { at: "2026-10-13T06:40:00+08:00", by, template_version: 1, answers: ackAnswers, discrepancy_note: n === 2 ? "Two packs short" : null },
    stop: seq <= 3 || done
      ? {
          sequence: seq, status: "checked_out", address_gps: { lat: 14.6, lng: 121.03 },
          checkin: { at: `2026-10-13T${String(7 + seq).padStart(2, "0")}:00:00+08:00`, by, gps: { lat: 14.6003, lng: 121.0301, accuracy_m: 9 }, distance_m: n === 3 ? 640 : 85, far: n === 3 },
          checkout: { at: `2026-10-13T${String(7 + seq).padStart(2, "0")}:20:00+08:00`, by, gps: { lat: 14.6003, lng: 121.0301, accuracy_m: 8 }, outcome, reason: outcome === "Delivered" ? null : "Store closed", invoice_no: invoice, answers: [{ key: "invoice_dr_number", label: "Invoice or DR Number", value: invoice }, { key: "outcome", label: "Delivery outcome", value: outcome }, ...(outcome !== "Failed" ? [{ key: "delivery_photo", label: "Proof of delivery photo", value: 12 + n, photo_url: `/api/media/${12 + n}` }] : []), { key: "notes", label: "Notes (optional)", value: "Left with the guard" }], template_version: 2 },
          minutes_at_stop: 20,
        }
      : { sequence: seq, status: "pending", checkin: null, checkout: null, minutes_at_stop: null },
    handover: null,
  };
}

export const tripTimeline = {
  batch: { batch_id: "b-3", delivery_date: "2026-10-13", vehicle: "TRK-2002", so_count: 5, warehouse: "METS", assigned_at: "2026-10-12T14:31:00+08:00" },
  trip: { status: "on_trip", chip: "on_trip", chip_label: "On trip · stop 4 of 5", started_at: "2026-10-13T07:10:00+08:00", started_by: { name: "Casey Runner", role: "driver" }, ended_at: null, duration_minutes: null, handover_status: null, end_distance_m: null },
  crew: [{ id: 103, name: "Casey Runner", role: "driver" }, { id: 102, name: "Sam Helper", role: "helper" }],
  orders: [orderTl(1, 1, true, "Delivered", "000456"), orderTl(2, 2, true, "Partially delivered", "000457"), orderTl(3, 3, true, "Failed", "000458"), orderTl(4, 4, false, null, null), orderTl(5, 5, false, null, null)],
  handover: null,
  events: [{ type: "trip_started", at: "2026-10-13T07:10:00+08:00", by, so_number: null, gps: null }],
};

export const driverDetail = {
  person: { id: 103, name: "Casey Runner", title: "DRIVER", role: "driver", warehouse: "METS", phone: "09170000103" },
  from: "2026-10-13", to: "2026-10-13",
  batches: [{ batch_id: "b-3", delivery_date: "2026-10-13", vehicle: "TRK-2002", so_count: 5, role: "driver", driver: { id: 103, name: "Casey Runner" }, trip: { status: "on_trip", chip: "on_trip", chip_label: "On trip · stop 4 of 5", acknowledged: 5, total: 5, stops_done: 3, started_at: "2026-10-13T07:10:00+08:00", ended_at: null, duration_minutes: null, handover_status: null } }],
  totals: { batches: 1, sos: 5, acknowledged: 5, delivered: 1, partial: 1, failed: 1, trips_completed: 0, trip_minutes: 0, invoices_outstanding: 0, avg_minutes_at_stop: 20 },
};

function tripRow(batch_id: string, date: string, driver: string, vehicle: string, state: string, label: string, so: number, done: number, over: Record<string, unknown> = {}) {
  return { batch_id, date, driver_id: 1, driver_name: driver, helpers: ["Sam Helper"], vehicle, trip_number: 1, trips_on_date: 1, state, state_label: label, so_count: so, kg: 100 * so, kg_complete: true, kg_unknown_lines: 0, packs: null, acknowledged: so, stops_done: done, delivered: done, partial: 0, failed: 0, started_at: `${date}T07:10:00+08:00`, ended_at: null, trip_minutes: null, handover_status: null, ...over };
}
export const trips = {
  from: "2026-10-07", to: "2026-10-13", total: 5,
  trips: [
    tripRow("b-3", "2026-10-13", "Casey Runner", "TRK-2002", "on_trip", "On trip · stop 4 of 5", 5, 3, { kg: 354, kg_complete: false, kg_unknown_lines: 1, packs: 66, partial: 1, failed: 1, delivered: 1 }),
    tripRow("b-1", "2026-10-13", "Alex Driver", "TRK-1001", "to_acknowledge", "To acknowledge", 5, 0, { trip_number: 1, trips_on_date: 2, delivered: 0 }),
    tripRow("b-2", "2026-10-13", "Alex Driver", "TRK-1001", "to_acknowledge", "To acknowledge", 1, 0, { trip_number: 2, trips_on_date: 2, delivered: 0 }),
    tripRow("h-1", "2026-10-12", "Dana Hauler", "TRK-3003", "closed", "Closed", 4, 4, { trip_minutes: 410, ended_at: "2026-10-12T15:00:00+08:00", handover_status: "closed" }),
    tripRow("h-2", "2026-10-11", "Casey Runner", "TRK-2002", "returned", "Back - hand over invoices", 3, 3, { trip_minutes: 300, ended_at: "2026-10-11T14:00:00+08:00" }),
  ],
};

const hc = (so: string, inv: string | null, state: string, label: string, holder: string, since: string, note: string | null = null) => ({ so_number: so, customer_name: "Test Customer", invoice_no: inv, state, state_label: label, holder, since, batch_id: "b-4", delivery_date: "2026-10-12", note });
export const hardcopies = {
  generated_at: "2026-10-13T08:30:00+08:00", total: 5, counts: { with_driver: 1, with_officer: 2, missing: 1, discrepancy: 1 },
  rows: [
    hc("SO-TEST-4001", "000601", "missing", "Missing", "Dana Hauler", "2026-10-12T16:00:00+08:00", "Customer kept it"),
    hc("SO-TEST-4002", "000602", "discrepancy", "Discrepancy", "Dana Hauler", "2026-10-12T16:00:00+08:00", "Total differs"),
    hc("SO-TEST-4003", "000603", "with_officer", "With the officer: to validate", "Olivia Officer", "2026-10-13T08:05:00+08:00"),
    hc("SO-TEST-4004", "000604", "with_officer", "With the officer: to validate", "Olivia Officer", "2026-10-13T08:05:00+08:00"),
    hc("SO-TEST-3001", "000456", "with_driver", "With the driver", "Casey Runner", "2026-10-13T07:50:00+08:00"),
  ],
};

export const issues = {
  statuses: ["submitted", "acknowledged", "in_progress", "resolved", "closed"], categories: [], priorities: ["normal", "high", "urgent"],
  issues: [
    { id: 5, reference: "IS-20261013-0005", category: "Damaged goods", priority: "urgent", status: "submitted", status_label: "Submitted", description: "Two cartons were crushed during loading.", batch_id: "b-3", so_id: "so-2", so_number: "SO-TEST-3002", vehicle: "TRK-2002", photo_ids: [1], created_at: "2026-10-13T08:00:00+08:00", response: null, responded_at: null, responded_by: null, reporter: { user_id: 8, staff_id: 103, name: "Casey Runner", role: "driver" } },
    { id: 4, reference: "IS-20261012-0004", category: "Application or technical issue", priority: "normal", status: "in_progress", status_label: "In progress", description: "The app was slow when taking photos.", batch_id: null, so_id: null, so_number: null, vehicle: null, photo_ids: [], created_at: "2026-10-12T14:00:00+08:00", response: "We are looking into it.", responded_at: "2026-10-12T15:00:00+08:00", responded_by: "Test Dispatcher", reporter: { user_id: 7, staff_id: 101, name: "Alex Driver", role: "driver" } },
  ],
};

const tpl = (kind: string, active: Record<string, unknown>) => ({
  active, versions: [{ version: (active.version as number), name: active.name, is_draft: active.is_draft, active: true, created_at: "2026-10-13T06:00:00+08:00" }, ...(kind === "delivery_checkout" ? [{ version: 1, name: "DRAFT — mirror of Zoho form", is_draft: true, active: false, created_at: "2026-10-12T06:00:00+08:00" }] : [])],
});
const withActive = (t: Record<string, unknown>) => ({ ...t, active: true, source_note: null, items: (t.items as Array<Record<string, unknown>>).map((i) => ({ ...i, active: true, app_only: Boolean(i.app_only) })) });
export const templatesResponse = {
  acknowledge_checklist: tpl("acknowledge_checklist", withActive(templates.acknowledge_checklist as never)),
  delivery_checkout: tpl("delivery_checkout", { ...withActive(templates.delivery_checkout as never), source_note: "Mirrors the Zoho form 'B2B Logistics Delivery': Name, Sales Order Number, Invoice or DR Number, Time Logs, plus GPS." }),
};

export const csv = "date,batch,driver\r\n2026-10-13,b-3,Casey Runner\r\n";

// ---- Load planning > Confirmed Orders: the unassign guard (API contract 6/7). Fictitious orders only. ----
function confirmedOrder(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `50${n}`, salesorder_number: `SO-TEST-500${n}`, reference_number: null, customer_name: `Test Customer ${String.fromCharCode(64 + n)}`, order_status: "confirmed", invoice_status: "not_invoiced", payment_status: "unpaid",
    shipment_status: "pending", order_date: "2026-10-12", expected_shipment_date: "2026-10-13", total: 1000 * n, delivery_method: null, salesperson_name: null, synced_at: "2026-10-13T06:00:00+08:00",
    assignment_status: "assigned", vehicle_id: "TRK-1001", driver_id: 101, driver_name: "Alex Driver", shipping_city: "Quezon City", shipping_address: { address: `${n} Sample Street`, city: "Quezon City" },
    assignment_batch_id: "b-1", email_status: "sent", order_type: "SO", products: [], ...over,
  };
}
export const emptyOrdersPage = { items: [], page: 1, per_page: 100, total: 0, has_more: false, branches: [] };
export const confirmedOrders = { items: [confirmedOrder(1), confirmedOrder(2)], page: 1, per_page: 100, total: 2, has_more: false, branches: [], total_weight_kg: 200, weight_complete: true };
export const unassignPreview = {
  needs_confirm: true,
  orders: [
    { id: "501", number: "SO-TEST-5001", order_type: "SO", state: "acknowledged", acknowledged_by: "Alex Driver", acknowledged_at: "2026-10-13T05:20:00Z", trip_started_at: null, checked_in_at: null, needs_confirm: true, blocked: false, reason: null, message: "SO-TEST-5001: acknowledged by Alex Driver at 13:20" },
    { id: "502", number: "SO-TEST-5002", order_type: "SO", state: "delivered", acknowledged_by: "Alex Driver", acknowledged_at: "2026-10-13T05:20:00Z", trip_started_at: "2026-10-13T05:24:00Z", checked_in_at: "2026-10-13T06:00:00Z", needs_confirm: false, blocked: true, reason: "already delivered", message: "SO-TEST-5002: delivered at 14:20" },
  ],
};

// Driver Overview timeline of b-3 after dispatch unassigned one acknowledged order (API contract 9).
export const tripTimelineWithUnassign = {
  ...tripTimeline,
  events: [
    ...tripTimeline.events,
    { type: "order_unassigned", at: "2026-10-13T08:40:00+08:00", actor_name: "Test Dispatcher", by: null, so_id: "so-36", so_number: "SO-TEST-3006", order_type: "SO", previous_state: "acknowledged", gps: null },
  ],
};
