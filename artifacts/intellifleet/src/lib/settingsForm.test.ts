import test from "node:test";
import assert from "node:assert/strict";
import { formatFallback, isDirty, sourceLabel, validateSettingInput } from "./settingsForm.ts";

const stale = { label: "Driver stale threshold", type: "number" as const, min: 1, max: 1440 };
const budget = { label: "Zoho daily budget", type: "number" as const, min: 100, max: 10000 };
const phone = { label: "Dispatch phone", type: "text" as const, min: null, max: null };

test("numbers are accepted inside the server bounds", () => {
  assert.deepEqual(validateSettingInput(stale, " 30 "), { ok: true, value: 30 });
  assert.deepEqual(validateSettingInput(stale, "1"), { ok: true, value: 1 });
  assert.deepEqual(validateSettingInput(budget, "10000"), { ok: true, value: 10000 });
});

test("cache-only percentage accepts decimals for an exact call threshold", () => {
  const guard = { ...budget, key: "ZOHO_GUARD_CACHE_ONLY_PCT", min: 50, max: 99 };
  assert.deepEqual(validateSettingInput(guard, "95.83333333333333"), { ok: true, value: 95.83333333333333 });
  for (const bad of ["NaN", "Infinity", "49.9", "99.1"]) assert.equal(validateSettingInput(guard, bad).ok, false);
  assert.equal(validateSettingInput(budget, "6000.5").ok, false);
});

test("numbers outside the bounds or not whole are explained", () => {
  assert.deepEqual(validateSettingInput(stale, "0"), { ok: false, message: "Driver stale threshold must be at least 1." });
  assert.deepEqual(validateSettingInput(stale, "1441"), { ok: false, message: "Driver stale threshold must be at most 1440." });
  assert.deepEqual(validateSettingInput(budget, "99"), { ok: false, message: "Zoho daily budget must be at least 100." });
  for (const bad of ["", "abc", "1.5", "1e3", "--2"]) assert.equal(validateSettingInput(stale, bad).ok, false, bad);
});

test("the dispatch phone allows digits and phone punctuation only, and may be empty to hide the button", () => {
  assert.deepEqual(validateSettingInput(phone, " +63 917-000 (0000) "), { ok: true, value: "+63 917-000 (0000)" });
  assert.deepEqual(validateSettingInput(phone, ""), { ok: true, value: "" });
  assert.equal(validateSettingInput(phone, "call me").ok, false);
  assert.equal(validateSettingInput(phone, "1".repeat(33)).ok, false);
});

test("Save is only offered for a real change", () => {
  assert.equal(isDirty({ value: 15 }, "15"), false);
  assert.equal(isDirty({ value: 15 }, " 15 "), false);
  assert.equal(isDirty({ value: 15 }, "16"), true);
  assert.equal(isDirty({ value: "" }, ""), false);
  assert.equal(isDirty({ value: "+63" }, ""), true);
});

test("labels tell the admin where a value comes from", () => {
  assert.equal(sourceLabel("admin"), "Saved in Settings");
  assert.equal(sourceLabel("env"), "From environment variable");
  assert.equal(sourceLabel("default"), "Built-in default");
  assert.equal(formatFallback({ fallback: 15, unit: "minutes", type: "number" }), "15 minutes");
  assert.equal(formatFallback({ fallback: "", unit: null, type: "text" }), "(empty)");
});
