import assert from "node:assert/strict";
import test from "node:test";
import { primaryAction, routeText, stopProgress, tripLabel } from "./tripCards.ts";

const trip = (over: Record<string, unknown>) => ({ trip: { status: "pending", total: 5, acknowledged: 2, stops_done: 0, next_action: "acknowledge", ...over } }) as never;

test("exactly one primary action per real state", () => {
  assert.deepEqual(primaryAction(trip({})), { kind: "acknowledge", label: "Acknowledge orders (3 left)", actionable: true });
  assert.equal(primaryAction(trip({ next_action: "start" })).label, "Start trip");
  assert.equal(primaryAction(trip({ next_action: "check_in" })).label, "Arrived at site");
  assert.equal(primaryAction(trip({ next_action: "check_out" })).label, "Departed from site");
  assert.equal(primaryAction(trip({ next_action: "end" })).label, "End trip");
  assert.equal(primaryAction(trip({ next_action: "handover" })).label, "Hand over invoices");
  assert.deepEqual(primaryAction(trip({ next_action: "wait_officer" })), { kind: "wait", label: "Waiting for the officer", actionable: false });
  assert.equal(primaryAction(trip({ next_action: "none" })).label, "View trip");
  assert.equal(primaryAction({ trip: null } as never).label, "View trip"); // a history row without trip info
});

test("two assignments on one day are numbered, a single one is not", () => {
  assert.equal(tripLabel({ trip_number: 2, trips_on_date: 2 }), "Trip 2 of 2");
  assert.equal(tripLabel({ trip_number: 1, trips_on_date: 1 }), null);
  assert.equal(tripLabel({}), null);
});

test("progress only exists once the trip started and is computed, not invented", () => {
  assert.equal(stopProgress({ so_count: 5, trip: { status: "pending", stops_done: 0 } } as never), null);
  assert.deepEqual(stopProgress({ so_count: 5, trip: { status: "on_trip", stops_done: 3 } } as never), { done: 3, total: 5, percent: 60 });
});

test("route text is only shown from real areas", () => {
  assert.equal(routeText({ first_area: "Olongapo", last_area: "San Fernando" }), "Olongapo \u2192 San Fernando");
  assert.equal(routeText({ first_area: null, last_area: null }), null);
});

import { historyStatus } from "./tripCards.ts";

test("history status comes from real outcomes", () => {
  const b = (status: string, so: number, failed: number, partial: number) => ({ trip: { status }, so_count: so, progress: { acknowledged: so, stops_done: so, delivered: so - failed - partial, partial, failed } }) as never;
  assert.deepEqual(historyStatus(b("closed", 3, 0, 0)), { label: "Completed", tone: "done" });
  assert.deepEqual(historyStatus(b("closed", 3, 3, 0)), { label: "Failed", tone: "bad" });
  assert.deepEqual(historyStatus(b("returned", 3, 1, 0)), { label: "Partially completed", tone: "warn" });
  assert.deepEqual(historyStatus(b("returned", 3, 0, 1)), { label: "Partially completed", tone: "warn" });
  assert.deepEqual(historyStatus({ trip: null, so_count: 2, progress: undefined } as never), { label: "Not completed", tone: "idle" });
});
