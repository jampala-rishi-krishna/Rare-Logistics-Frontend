import assert from "node:assert/strict";
import { test } from "node:test";
import { actionsEnabled, changeKey, checkinNotice, currentStop, directionsUrl, farWarningFor, legacyRedirect, stopState, tripPath, tripStep, visibleChanges } from "./tripNav.ts";
import type { EffectiveOrder } from "./tripState.ts";
import type { BatchDetail, DispatchChange } from "./tripTypes.ts";

test("tripPath is the one trip screen, keeping driver_id / from", () => {
  assert.equal(tripPath("b 1", null), "/driver/trip/b%201");
  assert.equal(tripPath("b1", "12", { from: "history" }), "/driver/trip/b1?from=history&driver_id=12");
});

test("legacyRedirect sends every old driver URL to a live screen", () => {
  assert.equal(legacyRedirect("/driver/assignment/b1", ""), "/driver/trip/b1");
  assert.equal(legacyRedirect("/driver/assignment/b1/acknowledge/so9", "?driver_id=7"), "/driver/trip/b1?driver_id=7");
  assert.equal(legacyRedirect("/driver/assignment/b1/checkout/5", ""), "/driver/trip/b1");
  assert.equal(legacyRedirect("/driver/assignment/b1/route", ""), "/driver/trip/b1");
  assert.equal(legacyRedirect("/driver/assignment/b1/handover", ""), "/driver/trip/b1");
  assert.equal(legacyRedirect("/driver/assignment/b1", "?from=history"), "/driver/trip/b1?from=history");
  assert.equal(legacyRedirect("/driver/trips", ""), "/driver/history");
  assert.equal(legacyRedirect("/driver/alerts", ""), "/driver/profile");
  assert.equal(legacyRedirect("/driver/issues/new", "?batch=b%202&so=1"), "/driver/trip/b%202");
  assert.equal(legacyRedirect("/driver/issues", ""), "/driver/today");
  assert.equal(legacyRedirect("/driver/whatever", ""), "/driver/today");
});

const scope = (o: Partial<{ isAdmin: boolean; missingDriverId: boolean; sessionLoading: boolean }> = {}) => ({ isAdmin: false, missingDriverId: false, sessionLoading: false, ...o });

test("actionsEnabled: crew with loaded trip only", () => {
  const withTrip = { trip: { status: "pending" } } as unknown as BatchDetail;
  assert.equal(actionsEnabled(scope(), withTrip), true);
  assert.equal(actionsEnabled(scope({ isAdmin: true }), withTrip), false);
  assert.equal(actionsEnabled(scope({ sessionLoading: true }), withTrip), false);
  assert.equal(actionsEnabled(scope(), undefined), false);
  assert.equal(actionsEnabled(scope(), { trip: null } as unknown as BatchDetail), false);
});

test("checkinNotice: far is a warning, near is informational, none when unknown", () => {
  assert.equal(checkinNotice(null), null);
  assert.equal(checkinNotice({ checkin_distance_m: null, checkin_far: false }), null);
  assert.deepEqual(checkinNotice({ checkin_distance_m: 120.4, checkin_far: false }), { far: false, text: "120 m from the address at arrival" });
  const far = checkinNotice({ checkin_distance_m: 812.6, checkin_far: true });
  assert.equal(far?.far, true);
  assert.match(far?.text ?? "", /813 m/);
  assert.equal(checkinNotice({ checkin_distance_m: null, checkin_far: true })?.far, true);
});

test("farWarningFor reads the stop of the right order", () => {
  const batch = {
    orders: [
      { id: 1, workflow: { stop: { checkin_distance_m: 900, checkin_far: true } } },
      { id: 2, workflow: { stop: { checkin_distance_m: 30, checkin_far: false } } },
    ],
  } as unknown as BatchDetail;
  assert.match(farWarningFor(batch, "1") ?? "", /900 m/);
  assert.equal(farWarningFor(batch, "2"), null);
  assert.equal(farWarningFor(batch, "9"), null);
  assert.equal(farWarningFor(null, "1"), null);
});

const eo = (so_id: string, stopStatus: string, extra: Partial<EffectiveOrder> = {}) => ({ so_id, stopStatus, outcome: null, attention: [], ...extra }) as unknown as EffectiveOrder;

test("tripStep: one big button per state", () => {
  const base = { orders: [] as EffectiveOrder[], acknowledged: 0, total: 3, stopsDone: 0 };
  assert.equal(tripStep({ ...base, status: "pending" }), "acknowledge");
  assert.equal(tripStep({ ...base, status: "pending", acknowledged: 3 }), "start");
  assert.equal(tripStep({ ...base, status: "on_trip", orders: [eo("1", "pending")] }), "arrive");
  assert.equal(tripStep({ ...base, status: "on_trip", orders: [eo("1", "checked_in")] }), "deliver");
  assert.equal(tripStep({ ...base, status: "on_trip", stopsDone: 3 }), "end");
  assert.equal(tripStep({ ...base, status: "returned" }), "waiting");
  assert.equal(tripStep({ ...base, status: "handover_submitted" }), "waiting");
  assert.equal(tripStep({ ...base, status: "closed" }), "closed");
});

test("currentStop: checked-in first, else the first stop not done (auto-advance)", () => {
  assert.equal(currentStop([eo("1", "checked_out"), eo("2", "pending"), eo("3", "pending")])?.so_id, "2");
  assert.equal(currentStop([eo("1", "pending"), eo("2", "checked_in")])?.so_id, "2");
  assert.equal(currentStop([eo("1", "checked_out")]), null);
});

test("stopState labels", () => {
  assert.equal(stopState(eo("1", "pending")), "waiting");
  assert.equal(stopState(eo("1", "checked_in")), "here");
  assert.equal(stopState(eo("1", "checked_out", { outcome: "Delivered" })), "delivered");
  assert.equal(stopState(eo("1", "checked_out", { outcome: "Failed" })), "problem");
  assert.equal(stopState(eo("1", "pending", { attention: [{ id: "x", kind: "check_in", error: "e" }] })), "problem");
});

test("directionsUrl prefers the server link, then coordinates, then the address", () => {
  const order = { address_text: "131 Armstrong Ave, Paranaque", customer_name: "PJ" };
  assert.equal(directionsUrl(order, { navigate_url: "https://x", lat: 1, lng: 2 }), "https://x");
  assert.equal(directionsUrl(order, { navigate_url: null, lat: 14.5, lng: 121 }), "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=14.5,121");
  assert.match(directionsUrl(order, null) ?? "", /destination=131%20Armstrong/);
  assert.equal(directionsUrl({ address_text: "", customer_name: "" }, null), null);
});

test("visibleChanges filters by batch, hides dismissed, newest first", () => {
  const c = (batch_id: string, at: string, so_id: string | null = "s"): DispatchChange => ({ kind: "order_removed", batch_id, so_id, so_number: "SO-1", at });
  const list = [c("b1", "2026-10-14T01:00:00Z"), c("b2", "2026-10-14T02:00:00Z"), c("b1", "2026-10-14T03:00:00Z", "t")];
  assert.deepEqual(visibleChanges(list, "b1", new Set()).map((x) => x.at), ["2026-10-14T03:00:00Z", "2026-10-14T01:00:00Z"]);
  assert.equal(visibleChanges(list, null, new Set([changeKey(list[1])])).length, 2);
  assert.deepEqual(visibleChanges(undefined, null, new Set()), []);
});
