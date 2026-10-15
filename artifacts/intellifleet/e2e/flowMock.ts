// TEST-ONLY stateful fake of the simplified crew API for ONE trip "b-f" (2 SOs + 1 TO). It enforces the server rules of
// API-CONTRACT.md (acknowledge-all in one call, start only when every order is acknowledged, check-in before check-out,
// proof-of-delivery photo for Delivered, reason for Partially delivered / Failed, TO invoice = TO number, End trip creates the
// handover, actions on an order dispatch removed -> 409 order_removed), so the Playwright specs tap through the REAL screens.
// Nothing here touches a real API, Zoho or a database: every request is answered by page.route().
import type { Page, Route } from "playwright";
import * as d from "./fixtures/driverData.ts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });

export const BATCH = "b-f";
export type TripStatus = "pending" | "on_trip" | "returned" | "handover_submitted" | "closed";
type StopStatus = "pending" | "checked_in" | "checked_out";

export interface FlowOrder {
  id: string;
  type: "SO" | "TO";
  number: string;
  customer: string;
  prefill: string | null;
  ack: boolean;
  stop: StopStatus;
  outcome: string | null;
  reason: string | null;
  invoice: string | null;
  photo: number | null;
  removed: boolean;
}

export interface Flow {
  trip: TripStatus;
  orders: FlowOrder[];
  changes: Array<{ kind: string; batch_id: string; so_id: string | null; so_number: string | null; at: string }>;
  handover: { id: number; status: string; items: Array<Record<string, unknown>> } | null;
  // true = phone has no signal: every API request fails like a real network error
  apiDown: boolean;
  log: string[];
  posts: Array<{ path: string; body: Record<string, unknown> }>;
  uploads: number;
}

export function newFlow(): Flow {
  const mk = (id: string, type: "SO" | "TO", number: string, customer: string, prefill: string | null): FlowOrder => ({ id, type, number, customer, prefill, ack: false, stop: "pending", outcome: null, reason: null, invoice: null, photo: null, removed: false });
  return {
    trip: "pending",
    orders: [mk("so-1", "SO", "SO-TEST-1001", "Test Customer A", "000456"), mk("so-2", "SO", "SO-TEST-1002", "Test Customer B", null), mk("to-3", "TO", "TO-TEST-0003", "GLACIER cold storage", "TO-TEST-0003")],
    changes: [],
    handover: null,
    apiDown: false,
    log: [],
    posts: [],
    uploads: 0,
  };
}

// ---- preset states (for the layout checks and the single-step specs) ----
export function ackAll(f: Flow): Flow {
  for (const o of f.orders) o.ack = true;
  return f;
}
export function onTrip(f: Flow, done = 0, atStop = false): Flow {
  ackAll(f);
  f.trip = "on_trip";
  live(f).forEach((o, i) => {
    if (i < done) Object.assign(o, { stop: "checked_out", outcome: "Delivered", invoice: o.type === "TO" ? o.number : `00045${6 + i}`, photo: 100 + i });
    else if (i === done && atStop) o.stop = "checked_in";
  });
  return f;
}
export function ended(f: Flow): Flow {
  onTrip(f, f.orders.length);
  f.trip = "handover_submitted";
  f.handover = handoverOf(f);
  return f;
}
// Dispatch unassigns one order (the server drops it from the payload and reports it in dispatch_changes).
export function removeOrder(f: Flow, id: string, at = "2026-10-13T09:05:00+08:00"): void {
  const o = f.orders.find((x) => x.id === id);
  if (!o) return;
  o.removed = true;
  f.changes.push({ kind: "order_removed", batch_id: BATCH, so_id: o.id, so_number: o.number, at });
}

const live = (f: Flow) => f.orders.filter((o) => !o.removed);
const BY = { name: "Alex Driver", role: "driver" };

function handoverOf(f: Flow) {
  return { id: 1, status: "pending", items: live(f).map((o) => ({ so_id: o.id, so_number: o.number, order_type: o.type, invoice_no: o.type === "TO" ? o.number : o.invoice, customer_name: o.customer, status: "pending" })) };
}

export function detail(f: Flow) {
  const orders = live(f);
  const total = orders.length;
  const acked = orders.filter((o) => o.ack).length;
  const done = orders.filter((o) => o.stop === "checked_out").length;
  const open = orders.find((o) => o.stop === "checked_in");
  const nextPending = orders.find((o) => o.stop === "pending");
  let next = "acknowledge";
  let chip = "to_acknowledge";
  let label = "To acknowledge";
  let blocker: string | null = `Acknowledge all ${total} orders to start the trip (${total - acked} left).`;
  if (f.trip === "pending" && acked === total) [next, chip, label, blocker] = ["start", "ready", "Ready to start", null];
  if (f.trip === "on_trip") {
    chip = "on_trip";
    label = `On trip · stop ${Math.min(done + 1, total)} of ${total}`;
    next = open ? "check_out" : done < total ? "check_in" : "end";
    blocker = done < total ? `${total - done} stops are not checked out yet.` : null;
  }
  if (f.trip === "returned") [next, chip, label, blocker] = ["handover", "returned", "Back - hand over invoices", null];
  if (f.trip === "handover_submitted") [next, chip, label, blocker] = ["wait_officer", "handover_pending", "Handover pending", null];
  if (f.trip === "closed") [next, chip, label, blocker] = ["none", "closed", "Closed", null];
  const started = f.trip !== "pending";
  const tripInfo = {
    status: f.trip, chip, chip_label: label, acknowledged: acked, total, stops_done: done, current_stop_so_id: open?.id ?? null,
    started_at: started ? "2026-10-13T08:00:00+08:00" : null, ended_at: ["returned", "handover_submitted", "closed"].includes(f.trip) ? "2026-10-13T11:00:00+08:00" : null,
    next_action: next, can_start: f.trip === "pending" && acked === total, can_end: f.trip === "on_trip" && done === total, can_submit_handover: false, blocker,
    handover_status: f.handover ? (f.trip === "closed" ? "closed" : "pending") : null, officer: null,
  };
  // While waiting for the officer the stop rows carry NO invoice number: the "give the invoices" list can then only come
  // from the handover returned by End trip (proves the UI uses it). Once closed the server data is complete again.
  const hideInvoice = f.trip === "handover_submitted";
  const out = orders.map((o, i) => {
    const isTo = o.type === "TO";
    return d.order(
      i,
      {
        ack: o.ack ? { at: "2026-10-13T07:00:00+08:00", by: BY, template_version: 1 } : null,
        stop: started
          ? { sequence: i + 1, status: o.stop, checkin_at: o.stop === "pending" ? null : "2026-10-13T09:00:00+08:00", checkin_by: o.stop === "pending" ? null : BY, checkin_distance_m: o.stop === "pending" ? null : 60, checkin_far: false, checkout_at: o.stop === "checked_out" ? "2026-10-13T09:20:00+08:00" : null, checkout_by: o.stop === "checked_out" ? BY : null, outcome: o.outcome, reason: o.reason, photos: o.photo ? [{ photo_id: o.photo, so_number: o.number, captured_at: "2026-10-13T01:20:00Z", kind: o.outcome === "Failed" ? "failed" : o.outcome === "Partially delivered" ? "partial" : "delivered" }] : [], invoice_no: hideInvoice ? null : o.invoice }
          : null,
        can_acknowledge: f.trip === "pending" && !o.ack,
        can_check_in: f.trip === "on_trip" && o.stop === "pending" && !open && nextPending === o,
        can_check_out: f.trip === "on_trip" && o.stop === "checked_in",
        blocker: null,
      },
      {
        id: o.id, so_number: o.number, customer_name: o.customer, order_type: o.type, invoice_no_prefill: o.prefill, invoice_hint: null,
        total_kg: 100, kg_complete: true, kg_unknown_lines: 0, total_packs: null, lines: [{ name: "Frozen item A", quantity: 100, unit: "kg", packs: null, kg: 100 }],
        ...(isTo ? { order_reference: o.number, source_warehouse: "METS", destination_warehouse: "GLACIER", address_lines: ["Glacier cold storage", "Navotas"], address_text: "Glacier cold storage, Navotas", contact: null, notes: null } : {}),
      },
    );
  });
  const progress = { acknowledged: acked, stops_done: done, delivered: orders.filter((o) => o.outcome === "Delivered").length, partial: orders.filter((o) => o.outcome === "Partially delivered").length, failed: orders.filter((o) => o.outcome === "Failed").length };
  return {
    ...d.batch({ batch_id: BATCH, vehicle: "TRK-1001", so_count: total, total_kg: 100 * total, kg_complete: true, kg_unknown_lines: 0, total_packs: null, trip_number: 1, trips_on_date: 1, progress, trip: tripInfo, first_area: "Quezon City", last_area: "Navotas" }),
    orders: out,
    dispatch_changes: f.changes,
    acknowledge_checklist_enabled: false,
    photo_storage_enabled: true,
  };
}

function today(f: Flow) {
  const { orders: _orders, ...summary } = detail(f);
  const done = live(f).filter((o) => o.stop === "checked_out").length;
  return { date: d.TODAY, driver: { id: 101, name: "Alex Driver" }, summary: { assigned: live(f).length, completed: done, remaining: live(f).length - done, needs_attention: 0, open_issues: 0, trips: 1 }, batches: [summary], dispatch_changes: f.changes, acknowledge_checklist_enabled: false, photo_storage_enabled: true };
}

function route(f: Flow) {
  return {
    source: "assignment",
    origin: { name: "METS cold storage", address: "Warehouse Road, Metro Manila", lat: 14.62, lng: 121.0 },
    stops: live(f).map((o, i) => ({ so_id: o.id, so_number: o.number, customer_name: o.customer, address_text: `${i + 1} Sample Street`, sequence: i + 1, status: o.stop, lat: 14.6 + i / 100, lng: 121.0, navigate_url: `https://www.google.com/maps/dir/?api=1&destination=${14.6 + i / 100},121&travelmode=driving` })),
    maps_links: [],
    warning: null,
  };
}

// Registered AFTER installMocks, so it answers first; anything it does not own falls through to the generic fixtures.
export async function installFlow(page: Page, f: Flow): Promise<void> {
  await page.route("http://mock-api.test/**", async (r: Route) => {
    const request = r.request();
    if (request.method() === "OPTIONS") return r.fallback();
    if (f.apiDown) return r.abort("internetdisconnected");
    const path = new URL(request.url()).pathname;
    let body: Record<string, unknown> = {};
    try {
      body = request.postDataJSON() ?? {};
    } catch {
      body = {};
    }
    const signedIn = Boolean(request.headers()["authorization"]);
    const reject = (status: number, message: string, code: string, errors?: Array<{ key: string; message: string }>) => r.fulfill(json({ detail: { message, code, ...(errors ? { errors } : {}) } }, status));
    const ok = (extra: Record<string, unknown> = {}) => r.fulfill(json({ ok: true, already_done: false, replayed: false, done_by: null, batch: detail(f), ...extra }));

    if (path === "/auth/session") return signedIn ? r.fulfill(json(d.session)) : reject(401, "Not authenticated", "unauthorized");
    if (path === "/api/driver/assignments/b-f") return r.fulfill(json({ ...detail(f), invoice_handover_items: (f.handover?.items ?? []).map(it => ({ ...it, officer_status: it.status })) }));
    if (path === "/api/driver/today") return r.fulfill(json(today(f)));
    if (path === "/api/driver/templates") return r.fulfill(json({ ...d.templates, acknowledge_checklist_enabled: false }));
    if (path === "/api/driver/batches/b-f/route") return r.fulfill(json(route(f)));
    if (path === "/api/driver/uploads" && request.method() === "POST") {
      f.uploads += 1;
      f.log.push("upload");
      return r.fulfill(json({ photo_id: 100 + f.uploads, content_type: "image/png", size_bytes: 68, replayed: false }));
    }
    if (/^\/api\/media\/\d+$/.test(path)) return r.fulfill({ status: 200, contentType: "image/png", headers: CORS, body: PNG });

    const m = /^\/api\/driver\/batches\/b-f\/(acknowledge-all|start|end|handover|orders\/([^/]+)\/(acknowledge|check-in|check-out))$/.exec(path);
    if (m && request.method() === "POST") {
      const action = m[3] ?? m[1];
      f.log.push(action);
      f.posts.push({ path, body });
      const o = m[2] ? f.orders.find((x) => x.id === decodeURIComponent(m[2])) : undefined;
      if (m[2] && (!o || o.removed)) return reject(409, "This order was removed by dispatch", "order_removed");
      switch (action) {
        case "acknowledge-all": {
          const fresh = live(f).filter((x) => !x.ack);
          const already = live(f).filter((x) => x.ack).map((x) => x.id);
          fresh.forEach((x) => (x.ack = true));
          return r.fulfill(json({ ok: true, acknowledged: fresh.map((x) => x.id), already_acknowledged: already, replayed: false }));
        }
        case "acknowledge":
          if (o) o.ack = true;
          return ok();
        case "start":
          if (live(f).some((x) => !x.ack)) return reject(409, "Acknowledge every order to start the trip.", "out_of_order");
          f.trip = "on_trip";
          return ok();
        case "check-in":
          if (f.trip !== "on_trip") return reject(409, "Start the trip first.", "out_of_order");
          if (o) o.stop = "checked_in";
          return ok();
        case "check-out": {
          if (!o || o.stop !== "checked_in") return reject(409, "Tap Reached first.", "out_of_order");
          const answers = (body.answers ?? {}) as Record<string, unknown>;
          const errors: Array<{ key: string; message: string }> = [];
          const outcome = String(answers.outcome ?? "");
          if (o.type === "SO" && !/^\d+$/.test(String(answers.invoice_dr_number ?? ""))) errors.push({ key: "invoice_dr_number", message: "Invoice or DR Number is required." });
          if (["Partially delivered", "Failed"].includes(outcome) && !String(answers.reason ?? "").trim()) errors.push({ key: "reason", message: "Reason is required." });
          if (["Delivered", "Partially delivered"].includes(outcome) && !answers.delivery_photo) errors.push({ key: "delivery_photo", message: "Proof of delivery photo: a photo is required." });
          if (errors.length) return reject(422, "Please complete the delivery form.", "validation", errors);
          // API contract 5: for a TO the server stores the TO number and ignores what the client sent.
          Object.assign(o, { stop: "checked_out", outcome, reason: (answers.reason as string) || null, invoice: o.type === "TO" ? o.number : String(answers.invoice_dr_number), photo: (answers.delivery_photo as number) ?? null });
          return ok();
        }
        case "end":
          if (live(f).some((x) => x.stop !== "checked_out")) return reject(409, "Stops are not checked out yet.", "out_of_order");
          f.trip = "handover_submitted";
          f.handover = handoverOf(f);
          return ok({ handover: f.handover });
        case "handover":
          return ok({ handover: f.handover });
      }
    }
    return r.fallback();
  });
}

// "The phone came back to the front": React Query refetches live data on visibilitychange.
export async function bringToFront(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}
