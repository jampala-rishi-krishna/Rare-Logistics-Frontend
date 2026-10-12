import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysBetween,
  driverIdQuery,
  firstName,
  formatLongDate,
  greeting,
  greetingPart,
  manilaHour,
  mapsSearchUrl,
  startVisibilityPolling,
  telHref,
  validateDateRange,
  withDriverParams,
} from "./driver.ts";

test("greeting part follows the hour", () => {
  assert.equal(greetingPart(0), "morning");
  assert.equal(greetingPart(11), "morning");
  assert.equal(greetingPart(12), "afternoon");
  assert.equal(greetingPart(17), "afternoon");
  assert.equal(greetingPart(18), "evening");
  assert.equal(greetingPart(23), "evening");
});

test("manila hour is taken from Manila, not the machine zone", () => {
  assert.equal(manilaHour("2026-10-12T00:30:00+08:00"), 0);
  assert.equal(manilaHour("2026-10-11T16:30:00Z"), 0);
  assert.equal(manilaHour("2026-10-12T13:05:00+08:00"), 13);
  assert.equal(manilaHour("garbage"), null);
});

test("greeting uses first name and Manila time of day", () => {
  assert.equal(greeting("2026-10-12T08:00:00+08:00", "Juan Dela Cruz"), "Good morning, Juan");
  assert.equal(greeting("2026-10-12T19:00:00+08:00", "  Maria  "), "Good evening, Maria");
  assert.equal(greeting("2026-10-12T14:00:00+08:00", ""), "Good afternoon");
  assert.equal(firstName(null), "");
});

test("long date format", () => {
  assert.equal(formatLongDate("2026-10-12"), "Monday, 12 October");
  assert.equal(formatLongDate("nope"), "nope");
});

test("date range validation", () => {
  assert.equal(validateDateRange("2026-10-01", "2026-10-10"), null);
  assert.equal(validateDateRange("2026-10-10", "2026-10-10"), null);
  assert.match(validateDateRange("2026-10-11", "2026-10-10")!, /on or before/);
  assert.match(validateDateRange("", "2026-10-10")!, /both/);
  assert.equal(daysBetween("2026-01-01", "2026-01-02"), 1);
  // 365 days inclusive (a full non-leap year) is allowed; 367 inclusive days is not.
  assert.equal(validateDateRange("2026-01-01", "2026-12-31"), null);
  assert.match(validateDateRange("2025-01-01", "2026-01-02")!, /at most/);
});

test("tel href", () => {
  assert.equal(telHref("0917 123 4567"), "tel:09171234567");
  assert.equal(telHref("+63 917-123-4567"), "tel:+639171234567");
  assert.equal(telHref(null), null);
  assert.equal(telHref("  "), null);
});

test("maps url encodes the address", () => {
  assert.equal(mapsSearchUrl("1 A St, Taguig"), "https://www.google.com/maps/search/?api=1&query=1%20A%20St%2C%20Taguig");
});

test("driver params only add driver_id when given", () => {
  assert.deepEqual(driverIdQuery(null), {});
  assert.deepEqual(driverIdQuery("12"), { driver_id: "12" });
  assert.equal(withDriverParams("/driver/today", { driver_id: null }), "/driver/today");
  assert.equal(withDriverParams("/driver/today", { driver_id: "42" }), "/driver/today?driver_id=42");
  assert.equal(withDriverParams("/driver/assignment/b1", { from: "history", driver_id: "12" }), "/driver/assignment/b1?from=history&driver_id=12");
});

test("visibility polling pauses when hidden and refetches on return", () => {
  let visible = true;
  let listener: (() => void) | null = null;
  const timers = new Map<number, () => void>();
  let nextId = 1;
  let ticks = 0;
  const stop = startVisibilityPolling(() => { ticks += 1; }, 60000, {
    isVisible: () => visible,
    onVisibilityChange: (cb) => { listener = cb; return () => { listener = null; }; },
    setIntervalFn: (cb) => { const id = nextId++; timers.set(id, cb); return id; },
    clearIntervalFn: (h) => { timers.delete(h as number); },
  });
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(ticks, 1);
  visible = false;
  listener!();
  assert.equal(timers.size, 0);
  visible = true;
  listener!();
  assert.equal(ticks, 2);
  assert.equal(timers.size, 1);
  stop();
  assert.equal(timers.size, 0);
  assert.equal(listener, null);
});

test("no timer starts when the page begins hidden", () => {
  const timers = new Map<number, () => void>();
  const stop = startVisibilityPolling(() => {}, 1000, {
    isVisible: () => false,
    onVisibilityChange: () => () => {},
    setIntervalFn: (cb) => { timers.set(1, cb); return 1; },
    clearIntervalFn: () => {},
  });
  assert.equal(timers.size, 0);
  stop();
});

import { alreadyDoneText, formatClock, personName } from "./driver.ts";

test("formatClock renders Manila time and tolerates bad input", () => {
  assert.equal(formatClock("2026-10-12T00:15:30Z"), "08:15");
  assert.equal(formatClock("nope"), "");
  assert.equal(formatClock(null), "");
});

test("personName and alreadyDoneText", () => {
  assert.equal(personName({ name: "Ana" }), "Ana");
  assert.equal(personName("Bo"), "Bo");
  assert.equal(personName(null), "");
  assert.equal(alreadyDoneText({ name: "Raymond", at: "2026-10-12T00:15:30Z" }), "Already done by Raymond at 08:15");
  assert.equal(alreadyDoneText(null), "Already done");
});
