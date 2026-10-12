import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ageLabel,
  ageTone,
  alreadyDoneText,
  buildValidatePayload,
  errorInfo,
  filterHandovers,
  newActionBase,
  noteRequired,
  sortOutstandingOldest,
  validationState,
} from "./officer.ts";

test("submit is enabled only when every invoice has a status", () => {
  const ids = [1, 2, 3];
  assert.equal(validationState(ids, {}).canSubmit, false);
  const partial = { "1": { status: "received" as const, note: "" }, "2": { status: "received" as const, note: "" }, "3": { status: null, note: "" } };
  const s = validationState(ids, partial);
  assert.equal(s.canSubmit, false);
  assert.equal(s.decided, 2);
  assert.deepEqual(s.undecided, ["3"]);
  assert.equal(validationState(ids, { ...partial, "3": { status: "received", note: "" } }).canSubmit, true);
});

test("missing and discrepancy need a note", () => {
  const ids = [1, 2];
  const d = { "1": { status: "received" as const, note: "" }, "2": { status: "missing" as const, note: "   " } };
  const s = validationState(ids, d);
  assert.equal(s.canSubmit, false);
  assert.deepEqual(s.needsNote, ["2"]);
  assert.equal(validationState(ids, { ...d, "2": { status: "discrepancy", note: "short 2" } }).canSubmit, true);
  assert.ok(noteRequired("missing") && noteRequired("discrepancy") && !noteRequired("received"));
});

test("no items means nothing to submit", () => {
  assert.equal(validationState([], {}).canSubmit, false);
});

test("validate payload trims notes and nulls blanks", () => {
  const out = buildValidatePayload([1, "2"], {
    "1": { status: "received", note: "  " },
    "2": { status: "missing", note: " lost " },
  });
  assert.deepEqual(out, [
    { item_id: 1, status: "received", note: null },
    { item_id: 2, status: "missing", note: "lost" },
  ]);
});

test("age label and tone", () => {
  assert.equal(ageLabel(0.2), "<1 h");
  assert.equal(ageLabel(5.4), "5 h");
  assert.equal(ageLabel(72), "3 d");
  assert.equal(ageLabel(null), "-");
  assert.equal(ageTone(2), "good");
  assert.equal(ageTone(30), "warn");
  assert.equal(ageTone(100), "bad");
});

test("error info handles object and string detail", () => {
  const obj = errorInfo({ message: "x", body: { detail: { message: "Note needed", code: "validation", errors: [{ key: "3", message: "required" }] } } });
  assert.equal(obj.message, "Note needed");
  assert.equal(obj.code, "validation");
  assert.deepEqual(obj.fieldErrors, [{ key: "3", message: "required" }]);
  assert.equal(errorInfo({ message: "m", body: { detail: "Forbidden" } }).message, "Forbidden");
  assert.equal(errorInfo(new Error("boom")).message, "boom");
  assert.equal(errorInfo(null).code, null);
});

test("already done text", () => {
  assert.equal(alreadyDoneText({ already_done: false }), null);
  assert.match(alreadyDoneText({ already_done: true, done_by: { name: "Ana" } }) ?? "", /Ana/);
});

test("action base has a uuid key and iso time", () => {
  const a = newActionBase(new Date("2026-10-12T00:00:00Z"));
  assert.match(a.idempotency_key, /^[0-9a-f-]{36}$/);
  assert.equal(a.client_ts, "2026-10-12T00:00:00.000Z");
  assert.notEqual(newActionBase().idempotency_key, a.idempotency_key);
});

test("handover filtering by scope and search", () => {
  const rows = [
    { for_me: true, delivery_date: "2026-10-12", vehicle: "DCD 1", driver: { name: "Emert" }, helpers: [{ name: "Raymond" }], items: [{ so_number: "SO-100", customer_name: "Acme" }] },
    { for_me: false, delivery_date: "2026-10-11", vehicle: "ABC 2", driver: { name: "Ben" }, helpers: [], items: [] },
  ];
  assert.equal(filterHandovers(rows, "all", "").length, 2);
  assert.equal(filterHandovers(rows, "mine", "").length, 1);
  assert.equal(filterHandovers(rows, "all", "so-100").length, 1);
  assert.equal(filterHandovers(rows, "all", "raymond").length, 1);
  assert.equal(filterHandovers(rows, "all", "zzz").length, 0);
});

test("outstanding sorted oldest first", () => {
  const out = sortOutstandingOldest([
    { age_hours: 5, delivery_date: "2026-10-12" },
    { age_hours: 50, delivery_date: "2026-10-10" },
    { age_hours: null, delivery_date: "2026-10-09" },
  ]);
  assert.deepEqual(out.map((r) => r.age_hours), [50, 5, null]);
});
