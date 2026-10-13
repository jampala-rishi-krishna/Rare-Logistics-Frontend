// TEST-ONLY stateful fake of the crew + officer API for ONE trip (2 SOs). It enforces the same rules the real server does (acknowledge all before
// start, check-in before check-out, proof-of-delivery photo for Delivered / Partially delivered, reason for Partially delivered / Failed,
// end only when every stop is done, handover only after end), so the Playwright flow can tap through the REAL screens.
import type { Page } from "playwright";
import * as d from "./fixtures/driverData.ts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });

interface So {
  n: number;
  ack: boolean;
  stop: "pending" | "checked_in" | "checked_out";
  outcome: string | null;
  reason: string | null;
  invoice: string | null;
  photo: number | null;
}

export interface Flow {
  trip: "pending" | "on_trip" | "returned" | "handover_submitted" | "closed";
  sos: So[];
  handedOver: boolean;
  officerStatus: Record<number, string>;
  uploads: number;
  log: string[];
}

export function newFlow(count = 2): Flow {
  return { trip: "pending", sos: Array.from({ length: count }, (_, i) => ({ n: i + 1, ack: false, stop: "pending", outcome: null, reason: null, invoice: null, photo: null })), handedOver: false, officerStatus: {}, uploads: 0, log: [] };
}

const BY = { name: "Alex Driver", role: "driver" };

export function detail(f: Flow) {
  const total = f.sos.length;
  const acked = f.sos.filter((s) => s.ack).length;
  const done = f.sos.filter((s) => s.stop === "checked_out").length;
  const open = f.sos.find((s) => s.stop === "checked_in");
  const nextPending = f.sos.find((s) => s.stop === "pending");
  let next = "acknowledge";
  let chip = "to_acknowledge";
  let label = "To acknowledge";
  let blocker: string | null = `Acknowledge all ${total} SOs to start the trip (${total - acked} left).`;
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
  const tripInfo = {
    status: f.trip, chip, chip_label: label, acknowledged: acked, total, stops_done: done, current_stop_so_id: open ? `so-${open.n}` : null, started_at: f.trip === "pending" ? null : "2026-10-13T08:00:00+08:00", ended_at: ["returned", "handover_submitted", "closed"].includes(f.trip) ? "2026-10-13T11:00:00+08:00" : null,
    next_action: next, can_start: f.trip === "pending" && acked === total, can_end: f.trip === "on_trip" && done === total, can_submit_handover: f.trip === "returned", blocker,
    handover_status: f.trip === "handover_submitted" ? "pending" : f.trip === "closed" ? "closed" : null, officer: f.handedOver ? { id: 9, name: "Olivia Officer" } : null,
  };
  const orders = f.sos.map((s) => {
    const started = f.trip !== "pending";
    return d.order(s.n - 1, {
      ack: s.ack ? { at: "2026-10-13T07:00:00+08:00", by: BY, template_version: 1 } : null,
      stop: started ? { sequence: s.n, status: s.stop, checkin_at: s.stop === "pending" ? null : "2026-10-13T09:00:00+08:00", checkin_by: s.stop === "pending" ? null : BY, checkin_distance_m: s.stop === "pending" ? null : 60, checkin_far: false, checkout_at: s.stop === "checked_out" ? "2026-10-13T09:20:00+08:00" : null, checkout_by: s.stop === "checked_out" ? BY : null, outcome: s.outcome, reason: s.reason, invoice_no: s.invoice } : null,
      can_acknowledge: f.trip === "pending" && !s.ack,
      can_check_in: f.trip === "on_trip" && s.stop === "pending" && !open && nextPending === s,
      can_check_out: f.trip === "on_trip" && s.stop === "checked_in",
      blocker: null,
    }, { total_kg: 100, kg_complete: true, kg_unknown_lines: 0, total_packs: null, lines: [{ name: "Frozen item A", quantity: 100, unit: "kg", packs: null, kg: 100 }] });
  });
  const progress = { acknowledged: acked, stops_done: done, delivered: f.sos.filter((s) => s.outcome === "Delivered").length, partial: f.sos.filter((s) => s.outcome === "Partially delivered").length, failed: f.sos.filter((s) => s.outcome === "Failed").length };
  return { ...d.batch({ batch_id: "b-f", vehicle: "TRK-1001", so_count: total, total_kg: 100 * total, kg_complete: true, kg_unknown_lines: 0, total_packs: null, trip_number: 1, trips_on_date: 1, progress, trip: tripInfo }), orders };
}

function officerRows(f: Flow) {
  const closed = f.trip === "closed";
  const totals = { invoices: f.sos.length, handed_over: f.sos.length, not_handed_over: 0, received: closed ? f.sos.length : 0, missing: 0, discrepancy: 0, pending: closed ? 0 : f.sos.length };
  return { handover_id: 1, batch_id: "b-f", delivery_date: "2026-10-13", vehicle: "TRK-1001", driver: { id: 101, name: "Alex Driver" }, helpers: [{ id: 102, name: "Sam Helper" }], submitted_at: "2026-10-13T11:10:00+08:00", officer: { id: 9, name: "Olivia Officer" }, for_me: true, status: closed ? "closed" : "pending", totals };
}

function officerDetail(f: Flow) {
  return {
    ...officerRows(f),
    items: f.sos.map((s) => ({ item_id: s.n, so_id: `so-${s.n}`, so_number: `SO-TEST-100${s.n}`, invoice_no: s.invoice, customer_name: `Test Customer ${String.fromCharCode(64 + s.n)}`, handed_over: true, crew_note: null, officer_status: f.trip === "closed" ? "received" : "pending", officer_note: null, checked_at: null, checked_by: null })),
    stops: f.sos.map((s) => ({ so_number: `SO-TEST-100${s.n}`, customer_name: `Test Customer ${String.fromCharCode(64 + s.n)}`, outcome: s.outcome, reason: s.reason, checkout_at: "2026-10-13T09:20:00+08:00" })),
    events: [],
  };
}

// Registered AFTER installMocks, so it answers first; anything it does not own falls through to the generic fixtures.
export async function installFlow(page: Page, flow: Flow): Promise<void> {
  await page.route("http://mock-api.test/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const path = new URL(request.url()).pathname;
    let body: Record<string, unknown> = {};
    try {
      body = request.postDataJSON() ?? {};
    } catch {
      body = {};
    }
    const ok = () => route.fulfill(json({ ok: true, already_done: false, replayed: false, done_by: null, batch: detail(flow) }));
    const reject = (status: number, message: string, code: string, errors?: Array<{ key: string; message: string }>) => route.fulfill(json({ detail: { message, code, ...(errors ? { errors } : {}) } }, status));
    const so = (id: string) => flow.sos.find((s) => `so-${s.n}` === id);

    if (path === "/api/driver/assignments/b-f") return route.fulfill(json(detail(flow)));
    if (path === "/api/driver/today") {
      const b = detail(flow);
      const { orders: _orders, ...summary } = b;
      return route.fulfill(json({ date: d.TODAY, driver: { id: 101, name: "Alex Driver" }, summary: { assigned: flow.sos.length, completed: flow.sos.filter((s) => s.stop === "checked_out").length, remaining: 0, needs_attention: 0, open_issues: 0, trips: 1 }, batches: [summary] }));
    }
    if (path === "/api/driver/uploads" && request.method() === "POST") {
      flow.uploads += 1;
      flow.log.push("upload");
      return route.fulfill(json({ photo_id: 100 + flow.uploads, content_type: "image/png", size_bytes: 68, replayed: false }));
    }
    const m = /^\/api\/driver\/batches\/b-f\/(start|end|handover|orders\/(so-\d+)\/(acknowledge|check-in|check-out))$/.exec(path);
    if (m && request.method() === "POST") {
      const action = m[3] ?? m[1];
      flow.log.push(action);
      if (action === "acknowledge") {
        const s = so(m[2]);
        if (s) s.ack = true;
        return ok();
      }
      if (action === "start") {
        if (flow.sos.some((s) => !s.ack)) return reject(409, "Acknowledge all SOs to start the trip.", "out_of_order");
        flow.trip = "on_trip";
        return ok();
      }
      if (action === "check-in") {
        const s = so(m[2]);
        if (s) s.stop = "checked_in";
        return ok();
      }
      if (action === "check-out") {
        const s = so(m[2]);
        const answers = (body.answers ?? {}) as Record<string, unknown>;
        const errors: Array<{ key: string; message: string }> = [];
        if (!/^\d+$/.test(String(answers.invoice_dr_number ?? ""))) errors.push({ key: "invoice_dr_number", message: "Invoice or DR Number is required." });
        const outcome = String(answers.outcome ?? "");
        if (["Partially delivered", "Failed"].includes(outcome) && !String(answers.reason ?? "").trim()) errors.push({ key: "reason", message: "Reason is required." });
        if (["Delivered", "Partially delivered"].includes(outcome) && !answers.delivery_photo) errors.push({ key: "delivery_photo", message: "Proof of delivery photo: a photo is required." });
        if (errors.length) return reject(422, "Please complete the delivery form.", "validation", errors);
        if (s) Object.assign(s, { stop: "checked_out", outcome, reason: (answers.reason as string) ?? null, invoice: String(answers.invoice_dr_number), photo: (answers.delivery_photo as number) ?? null });
        return ok();
      }
      if (action === "end") {
        if (flow.sos.some((s) => s.stop !== "checked_out")) return reject(409, "Stops are not checked out yet.", "out_of_order");
        flow.trip = "returned";
        return ok();
      }
      if (action === "handover") {
        flow.trip = "handover_submitted";
        flow.handedOver = true;
        return ok();
      }
    }
    if (path === "/api/officer/handovers" && request.method() === "GET") return route.fulfill(json(flow.handedOver ? [officerRows(flow)] : []));
    if (path === "/api/officer/handovers/1" && request.method() === "GET") return route.fulfill(json(officerDetail(flow)));
    if (path === "/api/officer/handovers/1/validate" && request.method() === "POST") {
      flow.trip = "closed";
      flow.log.push("officer_validate");
      return route.fulfill(json({ ok: true, already_done: false, replayed: false, done_by: null, handover: officerDetail(flow) }));
    }
    if (/^\/api\/media\/\d+$/.test(path)) return route.fulfill({ status: 200, contentType: "image/png", headers: CORS, body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64") });
    return route.fallback();
  });
}
