import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOrderView, explain, missing } from "./orderTrackerView.ts";
import type { Card, Fact } from "../services/api/orderTracker";

// Times are fixed Manila stamps so HH:MM assertions are stable in any machine timezone.
const D = "2026-10-15";
const t = (hm: string) => `${D}T${hm}:00+08:00`;
const fact = (source: string, value: unknown, message: string | null = null, as_of: string | null = t("13:42")): Fact =>
  ({ source, as_of, state: message ? "not_recorded" : "recorded", value, message });

function base(over: Partial<Record<string, Fact>> = {}, status = "Partly delivered"): Card {
  return {
    id: "1", number: "SO-1", customer: "Store A", delivery_date: D, order_type: "SO", status, truck: "ABC 123",
    last_update: t("13:42"), link: "/x", contact: "Call Logistics", area: "Guiguinto",
    sections: {
      status_now: fact("trip snapshot", { status, truck: "ABC 123", stop: 4, total_stops: 5 }),
      location: fact("Cartrack memory / current trip", null, "Live location unavailable - only shown while this truck is carrying your order on an active trip.", null),
      times: fact("so_acknowledgements / trips / trip_stops", { acknowledged_at: t("06:42"), acknowledged_by: "Ray", left_warehouse: t("07:15"), arrived: t("10:02"), delivered_at: null, checkout_at: t("10:31"), eta: "Not recorded - no calibrated ETA is available." }),
      delivery_result: fact("trip_stops / form_answers", { outcome: "partial", reason: "Damaged boxes", receiver: "Not recorded - add receiver_name to the delivery form.", receiver_position: null, rejected_items: "Not recorded - item quantities were not captured.", invoice_dr: "0012345" }),
      proof: fact("trip_stops.form_answers / authenticated media", { photos: [], officer_invoice: null }, "Not recorded - no proof photo is available in the current read snapshot. Ask Logistics."),
      payment: fact("Zoho SO cache / invoices", { status: "Unknown", so_payment_status: null }, "Not recorded - an authoritative single invoice total and balance are needed. Ask Logistics to check payment."),
      documents: fact("Zoho SO cache / reference_number", { client_po_number: "PO-88213", cached_attachment_count: 1, client_po_copy: "Not recorded - attachments have not been verified as the client PO copy.", permits: "Not recorded - Logistics must confirm." }),
      customer_rules: fact("Zoho SO cache / notes (unverified instructions)", { notes: null }, "Not recorded - ask Logistics to record customer receiving hours and delivery rules."),
      loading_check: fact("so_acknowledgements / invoice_handover_items", { crew_acknowledgement: { at: t("06:42"), by: "Ray" }, checklist: "Not recorded - acknowledgement checklist may be off.", officer_invoice: "Not recorded", warehouse_loading: "Not recorded in Tracker memory - ask Logistics to check the manifest loading checklist.", note: "Crew acknowledgement and invoice receipt do not establish correct physical loading." }),
      problems: fact("driver_issues / Logistics reply", null, "Not recorded in current memory - ask Logistics to check reported issues.", null),
      ...over,
    } as Record<string, Fact>,
  };
}
const NOW = new Date(t("13:43")).getTime();

test("missing() treats Not recorded explanations as absent; explain() strips the prefix", () => {
  assert.equal(missing("Not recorded - x"), true);
  assert.equal(missing("PO-1"), false);
  assert.equal(explain("Not recorded - item quantities were not captured."), "Item quantities were not captured.");
  assert.equal(explain(null), null);
});

test("header meta shows only the parts that exist", () => {
  const v = buildOrderView(base(), NOW);
  assert.deepEqual(v.meta, ["Guiguinto", "Invoice/DR 0012345", "Client PO PO-88213"]);
  const c = base({ documents: fact("docs", { client_po_number: "Not recorded" }), delivery_result: fact("dr", { outcome: "partial" }) });
  c.area = null;
  assert.deepEqual(buildOrderView(c, NOW).meta, []);
});

test("journey: partial result is a problem step with the reason, invoice step not recorded", () => {
  const v = buildOrderView(base(), NOW);
  assert.deepEqual(v.journey.map(s => [s.label, s.state, s.time]), [
    ["Loaded", "done", "06:42"], ["Left warehouse", "done", "07:15"], ["Arrived", "done", "10:02"],
    ["Partly delivered", "problem", "10:31"], ["Invoice back", "todo", "—"]]);
  assert.equal(v.journey[0].sub, "by Ray");
  assert.equal(v.journey[1].sub, "ABC 123");
  assert.equal(v.journey[3].sub, "Damaged boxes");
  assert.equal(v.journey[4].sub, "Not recorded");
  assert.deepEqual(v.lastEvent, { label: "Partly delivered", time: "10:31", at: t("10:31") });
});

test("journey: out for delivery marks the first open step current, invoice says truck still on trip", () => {
  const c = base({ times: fact("times", { acknowledged_at: t("06:42"), acknowledged_by: null, left_warehouse: t("07:15"), arrived: null, checkout_at: null }) }, "Out for delivery");
  const v = buildOrderView(c, NOW);
  assert.equal(v.journey[0].sub, "by crew (name not recorded)");
  assert.equal(v.journey[2].state, "current");
  assert.equal(v.journey[2].phoneLabel, "On the way to you");
  assert.equal(v.journey[3].label, "Delivered");
  assert.equal(v.journey[3].state, "todo");
  assert.equal(v.journey[3].sub, "photo + invoice will show here");
  assert.equal(v.journey[4].sub, "truck still on trip");
  assert.equal(v.lastEvent?.label, "Left warehouse");
  assert.equal(v.stats[1].value, "Out for delivery");
});

test("journey: invoice back done only from the officer record; missing status is a problem", () => {
  const ok = base({ proof: fact("proof", { photos: [], officer_invoice: { number: "0012345", status: "received", note: null, checked_at: t("15:10") } }) });
  const v = buildOrderView(ok, NOW);
  assert.equal(v.journey[4].state, "done");
  assert.equal(v.journey[4].time, "15:10");
  assert.equal(v.documents.rows[1].state, "verified");
  const bad = base({ loading_check: fact("lc", { officer_invoice: { number: "1", status: "missing", checked_at: t("15:10") } }) });
  const w = buildOrderView(bad, NOW);
  assert.equal(w.journey[4].state, "problem");
  assert.equal(w.documents.rows[1].state, "problem");
});

test("no safe GPS: empty location with last event; stale GPS keeps its reason", () => {
  const v = buildOrderView(base(), NOW);
  assert.equal(v.location.gps, null);
  assert.equal(v.location.reason, null);
  assert.equal(v.location.lastEvent?.time, "10:31");
  const stale = buildOrderView(base({ location: fact("Cartrack GPS fix", { plate: "ABC 123", stale: true }, "Not recorded as a current location - GPS is stale or its fix time is unknown. Call Logistics.") }), NOW);
  assert.equal(stale.location.gps, null);
  assert.equal(stale.location.reason, "GPS is stale or its fix time is unknown. Call Logistics.");
});

test("safe GPS: plate, coordinates and fix age", () => {
  const v = buildOrderView(base({ location: fact("Cartrack GPS fix", { plate: "ABC 123", lat: 14.6, lng: 121, stale: false }, null, t("13:42")) }, "Out for delivery"), NOW);
  assert.deepEqual(v.location.gps, { plate: "ABC 123", lat: 14.6, lng: 121, fixAt: t("13:42"), ago: "1 min ago", coords: "14.60000, 121.00000" });
});

test("no ETA ever: eta null, stat box says not estimated; stop text from this order's sequence", () => {
  const v = buildOrderView(base(), NOW);
  assert.equal(v.eta, null);
  assert.equal(v.stopText, "Stop 4 of 5");
  assert.equal(v.stats[0].value, "Stop 4 of 5");
  assert.equal(v.stats[1].value, "Done at 10:31");
  assert.equal(v.stats[1].sub, "Truck back — not estimated yet");
  const none = base({ status_now: fact("s", null, "Not recorded in current memory") });
  assert.equal(buildOrderView(none, NOW).stopText, null);
});

test("delivery result: no structured quantities -> rejectedMissing; no receiver -> null", () => {
  const v = buildOrderView(base(), NOW);
  assert.equal(v.delivery.outcome, "Partly delivered — Damaged boxes");
  assert.equal(v.delivery.rejected, null);
  assert.equal(v.delivery.rejectedMissing, true);
  assert.equal(v.delivery.receiver, null);
  const full = buildOrderView(base({}, "Delivered"), NOW);
  assert.equal(full.delivery.rejectedMissing, false);
});

test("delivery result: validated rejected list renders rows and journey summary; invalid list is ignored", () => {
  const good = base({ delivery_result: fact("dr", { outcome: "partial", reason: "Damaged", receiver: "Ana", receiver_position: "Clerk", rejected_items: [{ sku: "PB-5", quantity: "2", unit: "boxes" }, { sku: "CW-2", quantity: "1", unit: "boxes" }] }) });
  const v = buildOrderView(good, NOW);
  assert.deepEqual(v.delivery.rejected, [{ item: "PB-5", quantity: "2 boxes" }, { item: "CW-2", quantity: "1 boxes" }]);
  assert.equal(v.journey[3].sub, "3 boxes rejected");
  assert.equal(v.delivery.receiver, "Ana");
  const bad = base({ delivery_result: fact("dr", { rejected_items: [{ sku: "PB-5", quantity: "x" }] }) });
  assert.equal(buildOrderView(bad, NOW).delivery.rejected, null);
});

test("no photos: empty list with the backend message; photos keep the timestamp basis", () => {
  assert.deepEqual(buildOrderView(base(), NOW).proof.photos, []);
  const p = buildOrderView(base({ proof: fact("proof", { photos: [{ photo_id: 41, order: "SO-1", captured_at: t("10:31"), timestamp_basis: "checkout time; capture metadata may differ", result: "partial" }] }) }), NOW);
  assert.equal(p.proof.photos.length, 1);
  assert.equal(p.proof.photos[0].caption, "15 Oct · 10:31");
  assert.equal(p.proof.photos[0].basis, "checkout time; capture metadata may differ");
});

test("payment unknown: chip Unknown, no numbers, backend reason", () => {
  const v = buildOrderView(base(), NOW).payment;
  assert.equal(v.status, "Unknown");
  assert.equal(v.tone, "unknown");
  assert.deepEqual([v.total, v.paid, v.balance], [null, null, null]);
  assert.match(v.note, /^An authoritative single invoice total/);
});

test("payment partly paid: numbers, arithmetic, last payment and derived basis", () => {
  const v = buildOrderView(base({ payment: fact("Zoho", { status: "Partly paid", invoice_total: "48250", paid: "38600", balance: "9650", arithmetic: "matches", fully_paid: false, paid_basis: "derived from invoice total minus balance; not a payment receipt", payment_date: "2026-10-14", payment_reference: "OR-55102" }) }), NOW).payment;
  assert.deepEqual([v.total, v.paid, v.balance], ["₱48,250", "₱38,600", "₱9,650"]);
  assert.equal(v.matches, true);
  assert.match(v.note, /Last payment 14 Oct, ref OR-55102\./);
  assert.match(v.note, /not a payment receipt/);
  assert.equal(v.short, "₱9,650 balance of ₱48,250");
});

test("documents: PO number is never verified; permits always not recorded", () => {
  const d = buildOrderView(base(), NOW).documents;
  assert.deepEqual(d.rows.map(r => [r.key, r.state]), [["po", "unverified"], ["invoice", "unverified"], ["permits", "missing"]]);
  assert.equal(d.rows[0].detail, "PO-88213 · copy not verified");
  assert.equal(d.rows[2].detail, "Not recorded yet — Logistics can add them");
  assert.ok(!d.rows.some(r => r.key === "po" && r.state === "verified"));
});

test("rules: recorded rules + SO notes labelled unverified with keyword icons; empty -> message", () => {
  const v = buildOrderView(base({ customer_rules: fact("client_delivery_constraints", { recorded_rules: { opening_time: "06:00", receiving_cutoff_time: "11:00", notes: null }, so_notes: "Use the back gate, Bay 2\nBring 2 copies of DR" }) }), NOW).rules;
  assert.deepEqual(v.recorded, [{ text: "Receiving 06:00–11:00", icon: "clock", verified: true }]);
  assert.deepEqual(v.soNotes.map(n => [n.icon, n.verified]), [["pin", false], ["file", false]]);
  const notesOnly = buildOrderView(base({ customer_rules: fact("SO notes", { notes: "Receiving 8 AM to 4 PM. Report at the receiving gate." }) }), NOW).rules;
  assert.equal(notesOnly.soNotes.length, 2);
  assert.equal(notesOnly.soNotes[0].icon, "clock");
  assert.equal(buildOrderView(base(), NOW).rules.message, "Ask Logistics to record customer receiving hours and delivery rules.");
});

test("loading check: Loaded OK only with a completed + verified warehouse checklist", () => {
  assert.equal(buildOrderView(base(), NOW).loading.chip, "Helper acknowledged");
  const ok = buildOrderView(base({ loading_check: fact("lc", { warehouse_loading: { checklist_completed: true, cargo_count_verified: true, cargo_count_actual: 5, cargo_count_expected: 5 } }) }), NOW).loading;
  assert.equal(ok.chip, "Loaded OK");
  assert.equal(ok.word, "Checked");
  const half = buildOrderView(base({ loading_check: fact("lc", { warehouse_loading: { checklist_completed: true, cargo_count_verified: false } }) }), NOW).loading;
  assert.equal(half.chip, "Not fully checked");
  const c = base({ loading_check: fact("lc", {}), times: fact("times", {}) }, "Not yet loaded");
  assert.equal(buildOrderView(c, NOW).loading.chip, "Not checked");
});

test("problems fold into loading check with the Logistics reply", () => {
  const v = buildOrderView(base({ problems: fact("issues", [{ reference: "IS-1", category: "damaged_goods", description: "2 boxes wet", response: "Approved partial.", created_at: t("10:24"), responded_at: t("10:40"), status: "resolved" }]) }), NOW).loading;
  assert.equal(v.problems[0].title, "Problem reported 10:24 — Damaged goods.");
  assert.equal(v.problems[0].reply, 'Logistics: "Approved partial." — 10:40');
  assert.equal(buildOrderView(base(), NOW).loading.problemsMessage, "No problems recorded in Tracker memory.");
});

test("a card with no sections at all still builds without inventing values", () => {
  const c = { ...base(), sections: {} } as Card;
  const v = buildOrderView(c, NOW);
  assert.ok(v.journey.every(s => s.state === "todo" || s.key === "result"));
  assert.equal(v.payment.status, "Unknown");
  assert.equal(v.location.gps, null);
  assert.equal(v.delivery.receiver, null);
});
