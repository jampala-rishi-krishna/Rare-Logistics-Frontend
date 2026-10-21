// TEST-ONLY sample data reproducing the approved Order Tracker mockups (docs/design/order-tracker/*.png).
// Never imported from src/. Time is frozen in the browser at NOW (Thu 15 Oct 2026, 13:42 Manila) so that
// manilaToday() === DAY and "N min ago" texts match the mockup.
import type { Answer, Card, Fact, OrderList, OrderRow } from "../../src/services/api/orderTracker.ts";

export const DAY = "2026-10-15";
export const TOMORROW = "2026-10-16";
export const NOW = `${DAY}T13:42:00+08:00`;
export const at = (hm: string, day = DAY) => `${day}T${hm}:00+08:00`;
const link = (number: string) => `/app/order-tracker?order=${number}&from=${DAY}&to=${DAY}`;

const fact = (source: string, value: unknown, asOf: string | null = at("13:42")): Fact => ({ source, as_of: asOf, state: "recorded", value, message: null });
export const missingFact = (source: string, message: string, value: unknown = null): Fact => ({ source, as_of: at("13:42"), state: "not_recorded", value, message });

// ---- order cards ----
function so18447(): Card {
  return {
    id: "so-18447", number: "SO26-18447", order_type: "SO", customer: "Puregold Guiguinto", delivery_date: DAY, status: "Partly delivered",
    truck: "NAJ 6018", last_update: at("13:40"), link: link("SO26-18447"), contact: "Call Logistics",
    area: "McArthur Hwy, Tabe, Guiguinto, Bulacan",
    sections: {
      status_now: fact("Trip workflow read snapshot", { status: "Partly delivered", truck: "NAJ 6018", stop: 2, total_stops: 5 }),
      location: fact("Cartrack GPS", { lat: 14.8433, lng: 120.8114, plate: "NAJ 6018", stale: false }, at("13:41")),
      times: fact("helper app", { acknowledged_at: at("06:42"), acknowledged_by: "Raymond (helper)", left_warehouse: at("07:15"), arrived: at("10:02"), checkout_at: at("10:31") }),
      delivery_result: fact("helper app delivery form", {
        outcome: "Partly delivered", reason: "damaged boxes",
        rejected_items: [{ sku: "Pork belly 5 kg", quantity: 2, unit: "boxes" }],
        receiver: "Ana Cruz", receiver_position: "Receiving Clerk", invoice_dr: "0012345",
      }, at("10:31")),
      proof: fact("POD photos", {
        photos: [41, 42, 43].map((photo_id, i) => ({ photo_id, order: "SO26-18447", captured_at: at(["10:29", "10:30", "10:31"][i]), timestamp_basis: "checkout time; capture metadata may differ" })),
        officer_invoice: { status: "pending", number: "0012345" },
      }, at("10:31")),
      payment: fact("Zoho Books", { status: "Partly paid", invoice_total: "48250.00", paid: "38600.00", balance: "9650.00", arithmetic: "matches", fully_paid: false, payment_date: "2026-10-14", payment_reference: "OR-55102" }, at("13:40")),
      documents: fact("Zoho SO reference", { client_po_number: "PO-88213" }),
      customer_rules: fact("customer notes", { recorded_rules: { opening_time: "6:00 AM", receiving_cutoff_time: "11:00 AM", notes: "Use the back gate, Receiving Bay 2\nBring 2 copies of DR + PO copy" }, so_notes: null }, at("09:00", "2026-10-02")),
      loading_check: fact("helper acknowledgement", {
        warehouse_loading: { checklist_completed: true, cargo_count_verified: true, completed_at: at("06:30"), cargo_count_actual: 5, cargo_count_expected: 5 },
        crew_acknowledgement: { by: "Raymond Roblo", at: at("06:42") },
      }, at("06:42")),
      problems: fact("issues", [{ reference: "IS-20261015-0004", created_at: at("10:24"), category: "damaged_goods", description: "2 boxes of pork belly damaged in transit.", response: "Approved partial. Credit note for 2 boxes.", responded_at: at("10:40"), status: "resolved" }], at("10:40")),
    },
  };
}

function so18452(): Card {
  return {
    id: "so-18452", number: "SO26-18452", order_type: "SO", customer: "SM Hypermarket Malolos", delivery_date: DAY, status: "Out for delivery",
    truck: "NAJ 6018", last_update: at("13:38"), link: link("SO26-18452"), contact: "Call Logistics",
    area: "MacArthur Hwy, Sumapang Matanda, Malolos, Bulacan",
    sections: {
      status_now: fact("Trip workflow read snapshot", { status: "Out for delivery", truck: "NAJ 6018", stop: 4, total_stops: 5 }),
      location: fact("Cartrack GPS", { lat: 14.8527, lng: 120.8160, plate: "NAJ 6018", stale: false }, at("13:41")),
      times: fact("helper app", { acknowledged_at: at("06:42"), acknowledged_by: "Raymond (helper)", left_warehouse: at("07:15"), arrived: null, checkout_at: null }),
      delivery_result: missingFact("helper app delivery form", "Not recorded — the result shows after the crew checks out at the store.", {}),
      proof: missingFact("POD photos", "Not recorded — photos appear after delivery.", { photos: [] }),
      payment: fact("Zoho Books", { status: "Paid", invoice_total: "22400.00", paid: "22400.00", balance: "0.00", arithmetic: "matches", fully_paid: true, invoice_number: "0012388", payment_date: "2026-10-14", payment_reference: "OR-55117" }, at("13:40")),
      documents: fact("Zoho SO reference", { client_po_number: "PO-90114" }),
      customer_rules: fact("customer notes", { recorded_rules: { receiving_cutoff_time: "12:00 noon", notes: "Dock C, show gate pass" }, so_notes: null }),
      loading_check: fact("helper acknowledgement", { crew_acknowledgement: { by: "Raymond", at: at("06:42") } }, at("06:42")),
      problems: fact("issues", []),
    },
  };
}

/** Plain card for the other list rows (only what the row says; everything else not recorded). */
function plain(row: OrderRow): Card {
  return {
    id: row.number.toLowerCase(), number: row.number, order_type: "SO", customer: row.customer, delivery_date: DAY, status: row.status,
    truck: row.truck, last_update: row.last_update, link: row.link, contact: "Call Logistics", area: null,
    sections: {
      status_now: fact("Trip workflow read snapshot", { status: row.status, truck: row.truck, stop: row.stop ?? null, total_stops: row.total_stops ?? null }),
      location: missingFact("Cartrack / active trip", "Live location unavailable — the truck is not on a trip with this order."),
      times: fact("helper app", {}),
      delivery_result: missingFact("helper app delivery form", "Not recorded — no checkout yet."),
      proof: missingFact("POD photos", "Not recorded — no delivery photo.", { photos: [] }),
      payment: missingFact("Zoho Books", "Not recorded — no cached invoice for this order."),
      documents: fact("Zoho SO reference", {}),
      customer_rules: missingFact("customer notes", "Not recorded — no delivery rules for this customer."),
      loading_check: missingFact("helper acknowledgement", "Not recorded — no loading check."),
      problems: fact("issues", []),
    },
  };
}

const row = (r: Partial<OrderRow> & Pick<OrderRow, "number" | "customer" | "status">): OrderRow => ({
  delivery_date: DAY, order_type: "SO", truck: null, last_update: null, payment: "Unknown", link: link(r.number), stop: null, total_stops: null, event: null, ...r,
});

/** The six mockup rows, then six older ones so the list shows "Show all 12 orders" like the mockup. */
export const designRows: OrderRow[] = [
  row({ number: "SO26-18447", customer: "Puregold Guiguinto", status: "Partly delivered", truck: "NAJ 6018", last_update: at("13:40"), payment: "Partly paid", event: { label: "delivered", at: at("10:31") } }),
  row({ number: "SO26-18452", customer: "SM Hypermarket Malolos", status: "Out for delivery", truck: "NAJ 6018", last_update: at("13:38"), payment: "Paid", stop: 4, total_stops: 5 }),
  row({ number: "SO26-18439", customer: "Mang Rudy Meat Shop", status: "Not delivered", truck: "DCD 8953", last_update: at("12:54"), payment: "Unpaid", event: { label: "store closed", at: at("09:48") } }),
  row({ number: "SO26-18441", customer: "Robinsons Pulilan", status: "Delivered", truck: "NAJ 6018", last_update: at("12:42"), payment: "Paid", event: { label: "delivered", at: at("09:12") } }),
  row({ number: "SO26-18460", customer: "Savemore Calumpit", status: "Loaded", truck: "DCD 8953", last_update: at("11:42"), payment: "Unpaid", event: { label: "trip 2 · leaves after trip 1", at: null } }),
  row({ number: "SO26-18466", customer: "Hapag Kainan Restaurant", status: "Not yet loaded", truck: null, last_update: at("10:42"), payment: "Unknown" }),
  row({ number: "SO26-18421", customer: "Walter Mart Plaridel", status: "Delivered", truck: "NAJ 6018", last_update: at("09:30"), payment: "Paid", event: { label: "delivered", at: at("08:40") } }),
  row({ number: "SO26-18424", customer: "Alfamart Baliuag", status: "Delivered", truck: "DCD 8953", last_update: at("09:10"), payment: "Paid", event: { label: "delivered", at: at("08:20") } }),
  row({ number: "SO26-18427", customer: "Lola Nena's Carinderia", status: "Delivered", truck: "DCD 8953", last_update: at("08:55"), payment: "Unpaid", event: { label: "delivered", at: at("08:05") } }),
  row({ number: "SO26-18430", customer: "Bulacan Fresh Mart", status: "Out for delivery", truck: "NAJ 6018", last_update: at("08:40"), payment: "Paid", stop: 5, total_stops: 5 }),
  row({ number: "SO26-18433", customer: "Puregold Malolos", status: "Out for delivery", truck: "DCD 8953", last_update: at("08:20"), payment: "Unknown", stop: 3, total_stops: 4 }),
  row({ number: "SO26-18436", customer: "Kusina ni Aling Rosa", status: "Delivered", truck: "DCD 8953", last_update: at("08:05"), payment: "Paid", event: { label: "delivered", at: at("07:50") } }),
];

const SPECIAL: Record<string, () => Card> = { "SO26-18447": so18447, "SO26-18452": so18452 };
/** A fresh copy of the card for `number` (or null). Mutate freely in a test. */
export function designCard(number: string): Card | null {
  const make = SPECIAL[number];
  if (make) return make();
  const r = designRows.find(x => x.number === number);
  return r ? plain(r) : null;
}

/** Server-side filter mirror for the mocked GET /orders. */
export function designList(params: URLSearchParams, rows: OrderRow[] = designRows): OrderList {
  const q = (params.get("q") ?? "").toLowerCase();
  const status = params.get("status") ?? "all";
  const orders = rows.filter(r => (!q || `${r.number} ${r.customer} ${r.truck ?? ""}`.toLowerCase().includes(q))
    && (status === "all" ? true : status === "problems" ? r.status === "Partly delivered" || r.status === "Not delivered" : r.status === status));
  return { orders, total: orders.length, offset: 0, scope: "All assigned orders", coverage: "Accessible cached records only.", as_of: at("13:42") };
}

// ---- Ask: the four mockup turns ----
export const ASK_TURNS = [
  "Which of my orders today were rejected, and why?",
  "Nabayaran na ba ang SO26-18452?",
  "Do we have the delivery permit for SM Hypermarket Malolos?",
  "How many buyers per SKU on tomorrow's orders?",
] as const;

const rejected: Answer = {
  answer_id: "1".repeat(32), answer: "2 of your 12 orders today had a rejection.", not_recorded: false, tools: ["find_orders", "delivery_result"], language: "en",
  sources: [{ source: "helper app delivery records", as_of: at("13:42"), link: null, not_recorded: false }],
  blocks: [
    { type: "order_table", source: "helper app delivery records", as_of: at("13:42"), rows: [
      { number: "SO26-18447", customer: "Puregold Guiguinto", status: "Partly delivered", reason: "Damaged boxes", rejected: "2 boxes pork belly", link: link("SO26-18447") },
      { number: "SO26-18439", customer: "Mang Rudy Meat Shop", status: "Not delivered", reason: "Store closed", rejected: "Whole order", link: link("SO26-18439") },
    ] },
    { type: "actions", actions: [
      { kind: "photos", label: "See the photos", link: link("SO26-18447") },
      { kind: "open_order", label: "Open SO26-18447", link: link("SO26-18447") },
    ] },
  ],
};
const paid: Answer = {
  answer_id: "2".repeat(32), answer: "Oo, bayad na nang buo — ₱22,400.", not_recorded: false, tools: ["payment_status"], language: "tl",
  sources: [{ source: "Zoho Books", as_of: at("13:40"), link: null, not_recorded: false }],
  blocks: [{ type: "tiles", source: "Zoho Books", as_of: at("13:40"), chip: { label: "Bayad na", tone: "positive" }, tiles: [
    { label: "Invoice", value: "0012388" },
    { label: "Binayaran", value: "14 Oct · OR-55117" },
    { label: "Tugma sa invoice?", value: "Oo, tugma", tone: "positive" },
  ] }],
};
const permit: Answer = {
  answer_id: "3".repeat(32), answer: "Not recorded. The platform doesn't store delivery permits yet, so I can't confirm this. I won't guess.", not_recorded: true, tools: ["order_documents"], language: "en",
  sources: [],
  blocks: [{ type: "not_recorded", title: "Not recorded.", message: "The platform doesn't store delivery permits yet, so I can't confirm this. I won't guess." }],
};
const bars: Answer = {
  answer_id: "4".repeat(32), answer: "Top SKUs for Fri 16 Oct, by number of buyers", not_recorded: false, tools: ["buyers_per_sku"], language: "en",
  sources: [{ source: "confirmed sales orders for Fri 16 Oct (your scope)", as_of: at("13:30"), link: null, not_recorded: false }],
  blocks: [{ type: "bars", title: "Top SKUs for Fri 16 Oct, by number of buyers", unit: "buyers", source: "confirmed sales orders for Fri 16 Oct (your scope)", as_of: at("13:30"), items: [
    { label: "Pork belly 5 kg", value: 23 }, { label: "Whole chicken 1.2 kg", value: 19 }, { label: "Bangus, cleaned", value: 14 }, { label: "Chicken wings 2 kg", value: 11 },
  ] }],
};
/** A plainly recorded answer with a linked source (for the "answer with sources" check). */
const left: Answer = {
  answer_id: "5".repeat(32), answer: "SO26-18452 left the warehouse at 07:15 on truck NAJ 6018.", not_recorded: false, tools: ["order_times"], language: "en",
  sources: [{ source: "Trip start record", as_of: at("07:15"), link: link("SO26-18452"), not_recorded: false }], blocks: [],
};

export function designAnswer(question: string): Answer {
  const q = question.toLowerCase();
  if (q.includes("rejected")) return rejected;
  if (q.includes("nabayaran") || q.includes("paid")) return paid;
  if (q.includes("permit")) return permit;
  if (q.includes("sku")) return bars;
  if (q.includes("leave") || q.includes("left")) return left;
  if (q.includes("where is my truck")) return { ...left, answer_id: "6".repeat(32), answer: "NAJ 6018 is on the way to SM Hypermarket Malolos (stop 4 of 5); GPS updated 1 min ago." };
  return permit;
}

export const salesUser = { id: 5, email: "maria@example.test", fullName: "Maria Reyes", full_name: "Maria Reyes", role: "sales", status: "active", is_manager: false };
