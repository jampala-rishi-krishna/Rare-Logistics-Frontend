// TEST-ONLY fixtures for the mocked-API Playwright run. Nothing in here ships in the app bundle, and nothing here is real data:
// fictitious names, plates and addresses. The app is exercised against these through page.route() interception only.

export const NOW = "2026-10-13T08:30:00+08:00";
export const TODAY = "2026-10-13";

export const crewDriver = { id: 101, name: "Alex Driver", role: "driver", phone: "09170000101" };
export const crewHelper = { id: 102, name: "Sam Helper", role: "helper", phone: "09170000102" };

export const me = {
  driver_id: 101,
  staff_id: 101,
  role: "driver",
  name: "Alex Driver",
  title: "DRIVER",
  warehouse: "METS",
  phone: "09170000101",
  email: "alex.driver@example.test",
  dispatch_phone: "0285550100",
  vehicles_today: ["TRK-1001", "TRK-2002"],
  crew_today: [crewHelper],
  now: NOW,
  today: TODAY,
};

export const session = { user: { id: "7", fullName: "Alex Driver", email: "alex.driver@example.test", role: "driver", status: "active", mustChangePassword: false, staffId: 101 } };

type Chip = "to_acknowledge" | "ready" | "on_trip" | "returned" | "handover_pending" | "closed";

function trip(over: Record<string, unknown> = {}) {
  return {
    status: "pending", chip: "to_acknowledge" as Chip, chip_label: "To acknowledge", acknowledged: 2, total: 5, stops_done: 0, current_stop_so_id: null, started_at: null, ended_at: null,
    next_action: "acknowledge", can_start: false, can_end: false, can_submit_handover: false, blocker: "Acknowledge all 5 SOs to start the trip (3 left).", handover_status: null, officer: null, ...over,
  };
}

export function batch(over: Record<string, unknown> = {}) {
  return {
    batch_id: "b-1", delivery_date: TODAY, vehicle: "TRK-1001", so_count: 5, total_kg: 564.67, kg_complete: true, kg_unknown_lines: 0, total_packs: null, trip_number: 1, trips_on_date: 2,
    assigned_at: "2026-10-12T14:31:00+08:00", progress: { acknowledged: 2, stops_done: 0, delivered: 0, partial: 0, failed: 0 }, first_area: "Quezon City", last_area: "Makati",
    departure_time: null, helpers: [crewHelper], assignment_status: "assigned", email_status: "sent", stop_order_set: false, details_loading: false, trip: trip(), crew: [crewDriver, crewHelper], ...over,
  };
}

export const todayBatches = [
  batch(),
  batch({ batch_id: "b-2", so_count: 1, total_kg: 100, trip_number: 2, assigned_at: "2026-10-12T14:38:00+08:00", first_area: "Pasig", last_area: "Pasig", progress: { acknowledged: 1, stops_done: 0, delivered: 0, partial: 0, failed: 0 },
          trip: trip({ chip: "ready", chip_label: "Ready to start", acknowledged: 1, total: 1, next_action: "start", can_start: true, blocker: null }) }),
  batch({ batch_id: "b-3", vehicle: "TRK-2002", so_count: 5, total_kg: 354, kg_complete: false, kg_unknown_lines: 1, total_packs: 66, trip_number: 1, trips_on_date: 1, first_area: "Taguig", last_area: "Pateros",
          progress: { acknowledged: 5, stops_done: 3, delivered: 2, partial: 0, failed: 1 },
          trip: trip({ status: "on_trip", chip: "on_trip", chip_label: "On trip · stop 4 of 5", acknowledged: 5, total: 5, stops_done: 3, next_action: "check_in", blocker: "3 stops are not checked out yet.", started_at: "2026-10-13T07:10:00+08:00" }) }),
];

export const todaySummary = { assigned: 11, completed: 3, remaining: 8, needs_attention: 2, open_issues: 1, trips: 3 };

export const today = { date: TODAY, driver: { id: 101, name: "Alex Driver" }, summary: todaySummary, batches: todayBatches };
export const todayEmpty = { date: TODAY, driver: { id: 101, name: "Alex Driver" }, summary: { assigned: 0, completed: 0, remaining: 0, needs_attention: 0, open_issues: 0, trips: 0 }, batches: [] };

const customers = ["Test Customer A", "Test Customer B", "Test Customer C", "Test Customer D", "Test Customer E"];
const coords: Array<[number, number]> = [[14.676, 121.044], [14.6, 121.03], [14.58, 121.05], [14.55, 121.03], [14.54, 121.0]];

export function order(index: number, workflow: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  const n = index + 1;
  return {
    id: `so-${n}`, so_number: `SO-TEST-${1000 + n}`, customer_name: customers[index] ?? `Test Customer ${n}`,
    contact: { person: "Receiving Clerk", phone: "09170000200", attention: null }, address_lines: [`${n} Sample Street`, "Metro Manila"], address_text: `${n} Sample Street, Metro Manila`,
    shipment_date: TODAY, lines: [{ name: "Frozen item A", quantity: 100, unit: "kg", packs: null, kg: 100 }, { name: "Packed item B", quantity: 12, unit: "pck", packs: 12, kg: null }],
    total_kg: 100, kg_complete: false, kg_unknown_lines: 1, total_packs: 12, notes: n === 1 ? "Leave at the receiving area. Call on arrival." : null, order_status: "confirmed", shipment_status: "pending", delivery_status: "Pending",
    details_loading: false, checkout_prefill: {}, invoice_hint: n === 1 ? "000456" : null,
    workflow: { ack: null, stop: null, can_acknowledge: false, can_check_in: false, can_check_out: false, blocker: null, ...workflow }, ...over,
  };
}

const ackAt = "2026-10-13T06:40:00+08:00";
const ackDone = { at: ackAt, by: { name: "Alex Driver", role: "driver" }, template_version: 1 };

export const detailPending = {
  ...todayBatches[0],
  orders: [
    order(0, { ack: ackDone }), order(1, { ack: ackDone }), order(2, { can_acknowledge: true }), order(3, { can_acknowledge: true }), order(4, { can_acknowledge: true }),
  ],
};

export const detailReady = {
  ...todayBatches[1],
  orders: [order(0, { ack: ackDone })],
};

function stop(seq: number, status: string, over: Record<string, unknown> = {}) {
  return { sequence: seq, status, checkin_at: null, checkin_by: null, checkin_distance_m: null, checkin_far: false, checkout_at: null, checkout_by: null, outcome: null, reason: null, invoice_no: null, ...over };
}

export const detailOnTrip = {
  ...todayBatches[2],
  orders: [
    order(0, { ack: ackDone, stop: stop(1, "checked_out", { checkin_at: "2026-10-13T07:30:00+08:00", checkin_by: { name: "Alex Driver" }, checkin_distance_m: 85, checkout_at: "2026-10-13T07:50:00+08:00", checkout_by: { name: "Alex Driver" }, outcome: "Delivered", invoice_no: "000456" }) }),
    order(1, { ack: ackDone, stop: stop(2, "checked_out", { checkin_at: "2026-10-13T08:00:00+08:00", checkin_by: { name: "Alex Driver" }, checkout_at: "2026-10-13T08:10:00+08:00", checkout_by: { name: "Alex Driver" }, outcome: "Delivered", invoice_no: "000457" }) }),
    order(2, { ack: ackDone, stop: stop(3, "checked_out", { checkin_at: "2026-10-13T08:15:00+08:00", checkin_by: { name: "Alex Driver" }, checkout_at: "2026-10-13T08:25:00+08:00", checkout_by: { name: "Alex Driver" }, outcome: "Failed", reason: "Store closed", invoice_no: "000458" }) }),
    order(3, { ack: ackDone, stop: stop(4, "pending"), can_check_in: true }),
    order(4, { ack: ackDone, stop: stop(5, "pending"), blocker: "Check out of SO-TEST-1004 first." }),
  ],
};

export const detailArrived = {
  ...detailOnTrip,
  trip: { ...detailOnTrip.trip, next_action: "check_out", current_stop_so_id: "so-4", blocker: "1 stop is not checked out yet." },
  orders: detailOnTrip.orders.map((o, i) => (i === 3 ? order(3, { ack: ackDone, stop: stop(4, "checked_in", { checkin_at: "2026-10-13T08:28:00+08:00", checkin_by: { name: "Alex Driver" }, checkin_distance_m: 640, checkin_far: true }), can_check_out: true }) : o)),
};

export const detailReturned = {
  ...todayBatches[2],
  trip: trip({ status: "returned", chip: "returned", chip_label: "Back - hand over invoices", acknowledged: 5, total: 5, stops_done: 5, next_action: "handover", can_submit_handover: true, blocker: null, started_at: "2026-10-13T07:10:00+08:00", ended_at: "2026-10-13T11:00:00+08:00" }),
  progress: { acknowledged: 5, stops_done: 5, delivered: 4, partial: 0, failed: 1 },
  orders: detailOnTrip.orders.map((o, i) => ({ ...o, workflow: { ...o.workflow, can_check_in: false, can_check_out: false, blocker: null, stop: stop(i + 1, "checked_out", { outcome: i === 2 ? "Failed" : "Delivered", invoice_no: `00045${6 + i}`, checkout_at: "2026-10-13T09:00:00+08:00", checkout_by: { name: "Alex Driver" } }) } })),
};

export const detailHandoverWaiting = { ...detailReturned, trip: { ...detailReturned.trip, status: "handover_submitted", chip: "handover_pending", chip_label: "Handover pending", next_action: "wait_officer", can_submit_handover: false, handover_status: "pending", officer: { id: 9, name: "Olivia Officer" } } };

export const officers = [{ id: 9, name: "Olivia Officer" }, { id: 10, name: "Omar Officer" }];

const ackItems = [
  { id: 1, key: "products_match", label: "Products match the SO lines and quantities", item_type: "checkbox", required: true, options: null, prefill: null, show_when: null, position: 1 },
  { id: 2, key: "invoice_copies", label: "Invoice copies received", item_type: "checkbox", required: true, options: null, prefill: null, show_when: null, position: 2 },
  { id: 3, key: "delivery_docs", label: "Delivery receipt / documents received", item_type: "checkbox", required: true, options: null, prefill: null, show_when: null, position: 3 },
  { id: 4, key: "packs_received", label: "Number of packs received", item_type: "count", required: false, options: null, prefill: null, show_when: null, position: 4 },
  { id: 5, key: "remarks", label: "Notes / discrepancies", item_type: "note", required: false, options: null, prefill: null, show_when: null, position: 5 },
];

export const templates = {
  photo_storage_enabled: true,
  acknowledge_checklist: { id: 1, kind: "acknowledge_checklist", version: 1, name: "Acknowledgement checklist (DRAFT)", is_draft: true, items: ackItems },
  delivery_checkout: {
    id: 3, kind: "delivery_checkout", version: 2, name: "Delivery time log", is_draft: false,
    items: [
      { id: 10, key: "invoice_dr_number", label: "Invoice or DR Number", item_type: "numeric_text", required: true, options: null, prefill: null, show_when: null, position: 1, app_only: false },
      { id: 11, key: "outcome", label: "Delivery outcome", item_type: "radio", required: true, options: ["Delivered", "Partially delivered", "Failed"], prefill: null, show_when: null, position: 2, app_only: true },
      { id: 12, key: "reason", label: "Reason (what was not delivered, or why it failed)", item_type: "textarea", required: true, options: null, prefill: null, show_when: { key: "outcome", in: ["Partially delivered", "Failed"] }, position: 3, app_only: true },
      { id: 13, key: "delivery_photo", label: "Photo (optional)", item_type: "photo", required: false, options: null, prefill: null, show_when: null, position: 4, app_only: true },
      { id: 14, key: "notes", label: "Notes (optional)", item_type: "textarea", required: false, options: null, prefill: null, show_when: null, position: 5, app_only: true },
    ],
  },
};

export const route = {
  source: "assignment",
  origin: { name: "METS cold storage", address: "Warehouse Road, Metro Manila", lat: 14.62, lng: 121.0 },
  stops: coords.map(([lat, lng], i) => ({ so_id: `so-${i + 1}`, so_number: `SO-TEST-${1001 + i}`, customer_name: customers[i], address_text: `${i + 1} Sample Street, Metro Manila`, sequence: i + 1, status: i < 3 ? "checked_out" : "pending", lat, lng, navigate_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving` })),
  maps_links: [{ label: "Full route", url: "https://www.google.com/maps/dir/?api=1&origin=14.62,121.0&destination=14.54,121.0&travelmode=driving" }],
  warning: null,
};

function history(id: string, vehicle: string, date: string, status: string, over: Record<string, unknown> = {}) {
  return batch({ batch_id: id, vehicle, delivery_date: date, trips_on_date: 1, trip_number: 1, so_count: 4, total_kg: 300, total_packs: null, first_area: "Mandaluyong", last_area: "Marikina",
                 progress: { acknowledged: 4, stops_done: 4, delivered: 4, partial: 0, failed: 0 }, trip: trip({ status, chip: "closed", chip_label: "Closed", acknowledged: 4, total: 4, stops_done: 4, next_action: "none", blocker: null }), ...over });
}

export const historyAll = {
  from: "2026-10-06", to: "2026-10-12", status: "all", page: 1, page_size: 10, total: 4, has_more: false,
  batches: [
    history("h-1", "TRK-1001", "2026-10-12", "closed"),
    history("h-2", "TRK-2002", "2026-10-11", "returned", { progress: { acknowledged: 4, stops_done: 4, delivered: 3, partial: 1, failed: 0 }, total_kg: 354, kg_complete: false, kg_unknown_lines: 1, total_packs: 66 }),
    history("h-3", "TRK-1001", "2026-10-10", "closed", { progress: { acknowledged: 4, stops_done: 4, delivered: 0, partial: 0, failed: 4 } }),
    history("h-4", "TRK-3003", "2026-10-09", "closed"),
  ],
};
export const historyFailed = { ...historyAll, status: "failed", total: 1, batches: [historyAll.batches[2]] };
export const historyEmpty = { ...historyAll, total: 0, batches: [], has_more: false };
export const historyPage1 = { ...historyAll, total: 12, has_more: true, batches: historyAll.batches };

export const alerts = {
  unread: 3,
  alerts: [
    { key: "assigned:b-2", type: "assigned", title: "New assignment", body: "TRK-1001 · 1 order · 100.0 kg", at: "2026-10-13T08:20:00+08:00", link: "/driver/assignment/b-2", priority: "normal", read: false },
    { key: "changed:b-1:ab12", type: "changed", title: "Assignment changed", body: "TRK-1001 · 5 orders. Check the vehicle, crew and orders.", at: "2026-10-13T07:45:00+08:00", link: "/driver/assignment/b-1", priority: "high", read: false },
    { key: "validated:9:received", type: "validated", title: "Invoice received", body: "SO-TEST-1001 · invoice 000456", at: "2026-10-12T17:30:00+08:00", link: "/driver/assignment/h-1", priority: "normal", read: false },
    { key: "issue:4:resolved:1", type: "issue", title: "Dispatch replied to IS-20261012-0004", body: "Replacement truck is on the way.", at: "2026-10-12T15:00:00+08:00", link: "/driver/issues", priority: "normal", read: true },
  ],
};
export const alertsEmpty = { unread: 0, alerts: [] };

export const issueMeta = {
  categories: ["Delivery delay", "Customer unavailable", "Incorrect address", "Damaged goods", "Missing goods", "Partial delivery", "Vehicle breakdown", "Traffic or route issue", "Incorrect assignment", "Vehicle mismatch", "Helper unavailable", "Refrigeration or cargo handling", "Application or technical issue", "Other"],
  priorities: ["normal", "high", "urgent"],
};

export const issuesList = {
  ...issueMeta,
  issues: [
    { id: 4, reference: "IS-20261012-0004", category: "Vehicle breakdown", priority: "urgent", status: "resolved", status_label: "Resolved", description: "Engine warning light, truck will not start.", batch_id: "h-1", so_id: null, so_number: null, vehicle: "TRK-1001", photo_ids: [], created_at: "2026-10-12T14:00:00+08:00", response: "Replacement truck is on the way.", responded_at: "2026-10-12T15:00:00+08:00" },
    { id: 5, reference: "IS-20261013-0005", category: "Damaged goods", priority: "high", status: "submitted", status_label: "Submitted", description: "Two cartons crushed.", batch_id: "b-3", so_id: "so-2", so_number: "SO-TEST-1002", vehicle: "TRK-2002", photo_ids: [], created_at: "2026-10-13T08:00:00+08:00", response: null, responded_at: null },
  ],
};
export const issuesEmpty = { ...issueMeta, issues: [] };

export const timelineStub = { batch: batch(), trip: { status: "on_trip" }, crew: [crewDriver], orders: [], events: [] };
