import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STALE_MINUTES,
  blankItem,
  buildTemplatePayload,
  displayValue,
  formatDuration,
  generateKey,
  isPhotoValue,
  isValidRange,
  kpiCards,
  manilaDate,
  minutesBetween,
  moveItem,
  orderIssues,
  parseStaleMinutes,
  progressLabel,
  progressPct,
  relabel,
  removeItem,
  slugifyKey,
  staleLabel,
  stateLabel,
  timeAgo,
  toEditorItems,
  validateTemplate,
  type EditorItem,
} from "./overview.ts";

const NOW = new Date("2026-10-12T04:00:00Z");

test("manila date rolls over at 16:00 UTC", () => {
  assert.equal(manilaDate(new Date("2026-10-12T15:59:00Z")), "2026-10-12");
  assert.equal(manilaDate(new Date("2026-10-12T16:01:00Z")), "2026-10-13");
  assert.equal(manilaDate(new Date("2026-10-12T04:00:00Z"), -1), "2026-10-11");
});

test("range validation", () => {
  assert.ok(isValidRange("2026-10-01", "2026-10-12"));
  assert.ok(!isValidRange("2026-10-13", "2026-10-12"));
  assert.ok(!isValidRange("", "2026-10-12"));
});

test("durations", () => {
  assert.equal(formatDuration(0), "0 min");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1 h");
  assert.equal(formatDuration(125), "2 h 5 min");
  assert.equal(formatDuration(null), "-");
  assert.equal(formatDuration(-3), "-");
});

test("minutes between and time ago", () => {
  assert.equal(minutesBetween("2026-10-12T03:30:00Z", NOW), 30);
  assert.equal(minutesBetween("bad", NOW), null);
  assert.equal(timeAgo("2026-10-12T03:59:40Z", NOW), "just now");
  assert.equal(timeAgo("2026-10-12T03:30:00Z", NOW), "30 min ago");
  assert.equal(timeAgo("2026-10-12T01:00:00Z", NOW), "3 h ago");
  assert.equal(timeAgo(null, NOW), "-");
});

test("stale flag label", () => {
  assert.equal(staleLabel({ stale: false, last_action: { at: "2026-10-12T03:00:00Z" } }, NOW), null);
  assert.equal(staleLabel({ stale: true, last_action: { at: "2026-10-12T03:30:00Z" } }, NOW), "No update for 30 min");
  assert.equal(staleLabel({ stale: true, last_action: { at: "2026-10-12T02:00:00Z" } }, NOW), "No update for 2 h");
  assert.equal(staleLabel({ stale: true, last_action: null }, NOW), "No update recently");
});

test("stale minutes parsing defaults and clamps", () => {
  assert.equal(parseStaleMinutes(null), DEFAULT_STALE_MINUTES);
  assert.equal(parseStaleMinutes("abc"), DEFAULT_STALE_MINUTES);
  assert.equal(parseStaleMinutes("0"), DEFAULT_STALE_MINUTES);
  assert.equal(parseStaleMinutes("30"), 30);
  assert.equal(parseStaleMinutes(99999), 1440);
});

test("progress and state labels", () => {
  assert.equal(progressLabel({ done: 3, total: 5 }), "3 of 5");
  assert.equal(progressLabel(null), "-");
  assert.equal(progressLabel({ done: 0, total: 0 }), "-");
  assert.equal(progressPct({ done: 3, total: 5 }), 60);
  assert.equal(progressPct({ done: 9, total: 5 }), 100);
  assert.equal(stateLabel("handover_pending"), "Handover pending");
  assert.equal(stateLabel("weird_state"), "weird state");
});

test("KPI mapping", () => {
  const cards = kpiCards({
    drivers: { active: 8, on_trip: 3, returned: 4, idle: 2 },
    sos: { assigned: 20, acknowledged: 18, delivered: 10, partial: 1, failed: 0 },
    trips_pending_handover: 2,
    invoices_outstanding: 7,
    issues_open: 2,
  });
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  assert.equal(cards.length, 12);
  assert.equal(byId["issues-open"].value, 2);
  assert.equal(byId["drivers-on-trip"].value, 3);
  assert.equal(byId["sos-partial"].tone, "warn");
  assert.equal(byId["sos-failed"].tone, "neutral");
  assert.equal(byId["invoices-outstanding"].hint, "all dates");
  assert.equal(byId["invoices-outstanding"].value, 7);
});

test("order issues", () => {
  assert.deepEqual(
    orderIssues({ stop: { checkin: { far: false }, checkout: { outcome: "Delivered" } }, handover: { handed_over: true, officer_status: "received" }, ack: null }),
    [],
  );
  const issues = orderIssues({
    stop: { checkin: { far: true }, checkout: { outcome: "Partially delivered" } },
    handover: { handed_over: false, officer_status: "missing" },
    ack: { discrepancy_note: "short" },
  });
  assert.equal(issues.length, 5);
  assert.deepEqual(orderIssues({ stop: null, handover: null, ack: null }), []);
});

test("photo values and display", () => {
  assert.ok(isPhotoValue("photo", 12));
  assert.ok(isPhotoValue("signature", "13"));
  assert.ok(!isPhotoValue("text", 12));
  assert.ok(!isPhotoValue("photo", "abc"));
  assert.equal(displayValue(true), "Yes");
  assert.equal(displayValue(null), "-");
  assert.equal(displayValue(["a", "b"]), "a, b");
});

test("key generation", () => {
  assert.equal(slugifyKey("Received By"), "received_by");
  assert.equal(slugifyKey("  Qty / Packs (kg)! "), "qty_packs_kg");
  assert.equal(slugifyKey("???"), "");
  assert.equal(generateKey("Received By", []), "received_by");
  assert.equal(generateKey("Received By", ["received_by"]), "received_by_2");
  assert.equal(generateKey("Received By", ["received_by", "received_by_2"]), "received_by_3");
  assert.equal(generateKey("", []), "item");
});

function item(over: Partial<EditorItem>): EditorItem {
  return { uid: Math.random().toString(), key: "k", keyLocked: false, label: "Label", item_type: "text", required: false, active: true, optionsText: "", showWhenKey: "", showWhenIn: "", prefill: null, ...over };
}

test("relabel regenerates key only for unlocked items", () => {
  const a = item({ uid: "a", key: "item", label: "" });
  const b = item({ uid: "b", key: "locked_key", keyLocked: true, label: "Old" });
  const out = relabel([a, b], "a", "Truck Condition");
  assert.equal(out[0].key, "truck_condition");
  const out2 = relabel(out, "b", "New label");
  assert.equal(out2[1].key, "locked_key");
  assert.equal(out2[1].label, "New label");
  const dup = relabel([item({ uid: "a", key: "x", label: "" }), item({ uid: "b", key: "truck_condition", keyLocked: true })], "a", "Truck condition");
  assert.equal(dup[0].key, "truck_condition_2");
});

test("reorder and remove", () => {
  assert.deepEqual(moveItem([1, 2, 3], 1, -1), [2, 1, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 1, 1), [1, 3, 2]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 2, 1), [1, 2, 3]);
  assert.deepEqual(removeItem([1, 2, 3], 1), [1, 3]);
});

const outcomeItem = item({ uid: "o", key: "outcome", label: "Outcome", item_type: "dropdown", optionsText: "Delivered, Partially delivered, Failed, Returned" });

test("checkout validation passes for a good template", () => {
  const items = [outcomeItem, item({ uid: "r", key: "reason", label: "Reason", showWhenKey: "outcome", showWhenIn: "Failed, Returned" })];
  assert.deepEqual(validateTemplate("delivery_checkout", "Checkout", items), []);
});

test("checkout validation catches contract violations", () => {
  const msgs = (items: EditorItem[], kind: "delivery_checkout" | "acknowledge_checklist" = "delivery_checkout", name = "T") =>
    validateTemplate(kind, name, items).map((e) => e.message).join("|");
  assert.match(msgs([]), /at least one item/);
  assert.match(msgs([outcomeItem], "delivery_checkout", " "), /name is required/);
  assert.match(msgs([outcomeItem, item({ uid: "x", key: "outcome", label: "Dup" })]), /used twice/);
  assert.match(msgs([outcomeItem, item({ uid: "x", key: "Bad Key", label: "L" })]), /key must be/);
  assert.match(msgs([outcomeItem, item({ uid: "x", key: "x", label: " " })]), /label is required/);
  assert.match(msgs([outcomeItem, item({ uid: "x", key: "x", item_type: "radio", optionsText: "" })]), /at least one option/);
  assert.match(msgs([outcomeItem, item({ uid: "x", key: "x", item_type: "count" })]), /not allowed/);
  assert.match(msgs([outcomeItem, item({ uid: "x", key: "x", showWhenKey: "nope", showWhenIn: "a" })]), /unknown item/);
  assert.match(msgs([outcomeItem, item({ uid: "x", key: "x", showWhenKey: "x", showWhenIn: "a" })]), /itself/);
  assert.match(msgs([outcomeItem, item({ uid: "x", key: "x", showWhenKey: "outcome", showWhenIn: "" })]), /at least one value/);
  assert.equal(msgs([item({ key: "other" })]), ""); // the outcome question is optional: without it every departed stop is recorded as Delivered
  assert.match(msgs([item({ uid: "o2", key: "outcome", item_type: "text" })]), /must be a dropdown or radio/);
  assert.match(msgs([item({ uid: "i", key: "invoice_dr_number", item_type: "text" })]), /digits-only/);
  assert.equal(msgs([item({ uid: "i", key: "invoice_dr_number", item_type: "numeric_text" })]), "");
  assert.match(msgs([item({ uid: "c", key: "c", item_type: "checkbox", showWhenKey: "c2", showWhenIn: "a" }), item({ uid: "c2", key: "c2", item_type: "checkbox" })], "acknowledge_checklist"), /only supported on the checkout/);
  assert.equal(msgs([item({ key: "c", item_type: "checkbox" })], "acknowledge_checklist"), "");
});

test("payload building", () => {
  const items = [
    outcomeItem,
    item({ uid: "r", key: "reason", label: " Reason ", required: true, showWhenKey: "outcome", showWhenIn: "Failed, Returned" }),
    item({ uid: "s", key: "note", label: "Note", item_type: "textarea" }),
  ];
  const p = buildTemplatePayload("delivery_checkout", " Checkout v2 ", items);
  assert.equal(p.name, "Checkout v2");
  assert.deepEqual(p.items[0].options, ["Delivered", "Partially delivered", "Failed", "Returned"]);
  assert.deepEqual(p.items[1].show_when, { key: "outcome", in: ["Failed", "Returned"] });
  assert.equal(p.items[1].label, "Reason");
  assert.equal(p.items[2].options, null);
  const ack = buildTemplatePayload("acknowledge_checklist", "A", [item({ key: "c", item_type: "checkbox", showWhenKey: "zzz", showWhenIn: "a" })]);
  assert.equal(ack.items[0].show_when, null);
});

test("blank item and round trip", () => {
  const b = blankItem("acknowledge_checklist", [item({ key: "item" })]);
  assert.equal(b.key, "item_2");
  assert.equal(b.item_type, "checkbox");
  const edit = toEditorItems([{ key: "outcome", label: "Outcome", item_type: "dropdown", required: true, options: ["A", "B"], show_when: { key: "x", in: ["1"] }, active: true }]);
  assert.equal(edit[0].keyLocked, true);
  assert.equal(edit[0].optionsText, "A, B");
  assert.equal(edit[0].showWhenIn, "1");
});


test("app-only flag round-trips through the editor and the payload", () => {
  const [editor] = toEditorItems([{ key: "outcome", label: "Outcome", item_type: "radio", required: true, options: ["Delivered"], show_when: null, active: true, app_only: true }]);
  assert.equal(editor.appOnly, true);
  assert.equal(buildTemplatePayload("delivery_checkout", "T", [editor]).items[0].app_only, true);
  assert.equal(blankItem("delivery_checkout", []).appOnly, true); // anything added in Settings is not in the Zoho form
});
