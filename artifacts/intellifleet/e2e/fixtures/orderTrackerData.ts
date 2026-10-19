import type { Card, Fact, OrderRow } from "../../src/services/api/orderTracker.ts";

export const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const at = `${day}T08:30:00+08:00`;
const fact = (source: string, value: unknown, message: string | null = null): Fact => ({ source, as_of: at, state: message ? "not_recorded" : "recorded", value, message });
export function card(mode = "delivered"): Card {
  const status = mode === "partial" ? "Partly delivered" : mode === "ontrip" ? "Out for delivery" : "Delivered";
  return { id: "one", number: "SO-100", order_type: "SO", customer: "Fresh Foods — Bulacan", delivery_date: day, status,
    truck: "DCD 8953", last_update: at, link: "/app/order-tracker?order=SO-100", contact: "Call Logistics",
    sections: {
      status_now: fact("Trip workflow read snapshot", { status, truck: "DCD 8953", stop: 3, total_stops: 5 }),
      location: mode === "ontrip" ? fact("Cartrack GPS fix", { lat: 14.6, lng: 121, plate: "DCD 8953", stale: false }) : fact("Cartrack / active trip", null, "Live location is available only while the truck carries your order."),
      times: fact("Crew acknowledgement / trip / stop", { acknowledged_by: "Crew member", acknowledged_at: at, left_warehouse: at, arrived: at, delivered_at: mode === "delivered" ? at : null, eta: "Not recorded — no calibrated ETA is available." }),
      delivery_result: fact("Recorded stop / checkout answers", { outcome: status, reason: mode === "partial" ? "Customer refused damaged items" : null, receiver: "Not recorded — ask Logistics to add a receiver field.", rejected_items: "Not recorded — quantities per item were not captured.", invoice_dr: "000123" }),
      proof: fact("Authenticated delivery proof / officer record", { photos: [], officer_invoice: { status: "received", number: "000123" } }, "Not recorded — no delivery photo in this fixture."),
      payment: fact("Zoho cached invoice", { status: "Partly paid", invoice_total: "1500.00", paid: "1000.00", balance: "500.00", payment_reference: null }),
      documents: fact("Zoho cached SO reference", { client_po_number: "PO-4501", client_po_copy: "Not recorded — copy has not been verified.", permits: "Not recorded — ask Logistics which documents are required." }),
      customer_rules: fact("SO notes — unverified instructions", { notes: "Receiving 8 AM to 4 PM. Report at the receiving gate." }),
      loading_check: fact("Crew acknowledgement / officer record", { crew_acknowledgement: { by: "Crew member", at }, checklist: "Not recorded", warehouse_loading: "Not recorded — ask Logistics to check the manifest checklist.", note: "Crew acknowledgement does not establish correct physical loading." }),
      problems: fact("Recorded order issue / Logistics reply", [{ reference: "IS-TEST-1", description: "Customer requested a delivery update", response: "Receiving team informed.", status: "resolved" }]),
    } };
}
export const rows: OrderRow[] = ["delivered", "partial", "ontrip"].map((mode, i) => ({ ...card(mode), number: `SO-${100 + i}`, payment: i === 0 ? "Paid" : "Unknown" }));
