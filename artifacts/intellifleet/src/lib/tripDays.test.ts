import assert from "node:assert/strict";
import { test } from "node:test";
import { canStartOnDay, dayOf, daySections, groupTripDays, nextYmd } from "./tripDays.ts";

const b = (id: string, day?: string, delivery_date = "2026-10-16") => ({ id, day, delivery_date });

test("dayOf: missing or unknown day is today", () => {
  assert.equal(dayOf({}), "today");
  assert.equal(dayOf({ day: "weird" }), "today");
  assert.equal(dayOf({ day: "tomorrow" }), "tomorrow");
  assert.equal(dayOf({ day: "OVERDUE" }), "overdue");
});

test("groupTripDays: overdue goes first under today, tomorrow separate", () => {
  const g = groupTripDays([b("a", "today"), b("t", "tomorrow", "2026-10-17"), b("o", "overdue", "2026-10-15"), b("x")]);
  assert.deepEqual(g.today.map((x) => x.id), ["o", "a", "x"]);
  assert.deepEqual(g.tomorrow.map((x) => x.id), ["t"]);
  assert.equal(g.overdueCount, 1);
  assert.equal(g.tomorrowDate, "2026-10-17");
});

test("groupTripDays: older server (no day) = everything today", () => {
  const g = groupTripDays([b("a"), b("c")]);
  assert.equal(g.today.length, 2);
  assert.equal(g.tomorrow.length, 0);
  assert.equal(g.tomorrowDate, null);
  assert.deepEqual(groupTripDays(null).today, []);
});

test("canStartOnDay: tomorrow's trips cannot start today", () => {
  assert.equal(canStartOnDay({ day: "tomorrow" }), false);
  assert.equal(canStartOnDay({ day: "today" }), true);
  assert.equal(canStartOnDay({ day: "overdue" }), true);
  assert.equal(canStartOnDay({}), true);
});

test("daySections: tomorrow on top only when there is something", () => {
  assert.deepEqual(daySections(groupTripDays([b("a")])).map((s) => s.day), ["today"]);
  assert.deepEqual(daySections(groupTripDays([b("a"), b("t", "tomorrow")])).map((s) => s.day), ["tomorrow", "today"]);
});

test("nextYmd", () => {
  assert.equal(nextYmd("2026-10-31"), "2026-11-01");
  assert.equal(nextYmd("2026-12-31"), "2027-01-01");
  assert.equal(nextYmd(""), "");
});
