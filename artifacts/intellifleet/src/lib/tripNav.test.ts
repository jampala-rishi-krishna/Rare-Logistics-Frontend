import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ackPath,
  acknowledgeLeft,
  actionsEnabled,
  assignmentPath,
  checkinNotice,
  checkoutPath,
  farWarningFor,
  handoverPath,
  nextToAcknowledge,
  routePath,
  stopRows,
  timelinePath,
} from "./tripNav.ts";
import type { EffectiveOrder } from "./tripState.ts";
import type { BatchDetail, RouteInfo } from "./tripTypes.ts";

test("href builders keep the URLs the existing screens link to", () => {
  assert.equal(assignmentPath("b 1", null), "/driver/assignment/b%201");
  assert.equal(assignmentPath("b1", "12", { from: "history" }), "/driver/assignment/b1?from=history&driver_id=12");
  assert.equal(ackPath("b1", "so/9", null), "/driver/assignment/b1/acknowledge/so%2F9");
  assert.equal(checkoutPath("b1", "5", "7"), "/driver/assignment/b1/checkout/5?driver_id=7");
  assert.equal(routePath("b1", null), "/driver/assignment/b1/route");
  assert.equal(handoverPath("b1", null), "/driver/assignment/b1/handover");
  assert.equal(timelinePath("b1", "7"), "/driver/trip/b1?driver_id=7");
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

const o = (so_id: string, canAcknowledge: boolean) => ({ so_id, canAcknowledge });

test("nextToAcknowledge walks forward, wraps, and skips the current order", () => {
  const orders = [o("1", true), o("2", false), o("3", true), o("4", true)];
  assert.equal(nextToAcknowledge(orders, "1"), "3");
  assert.equal(nextToAcknowledge(orders, "3"), "4");
  assert.equal(nextToAcknowledge(orders, "4"), "1");
  assert.equal(nextToAcknowledge([o("1", true)], "1"), null);
  assert.equal(nextToAcknowledge([o("1", false), o("2", false)], "1"), null);
  assert.equal(nextToAcknowledge(orders, null), "1");
  assert.equal(nextToAcknowledge([], "1"), null);
  assert.equal(acknowledgeLeft(orders), 3);
});

function eff(so_id: string, so_number: string, seq?: number): EffectiveOrder {
  return {
    so_id,
    order: { id: so_id, so_number, customer_name: `C${so_id}`, address_text: `A${so_id}`, workflow: seq ? { stop: { sequence: seq } } : null },
  } as unknown as EffectiveOrder;
}

test("stopRows orders by route sequence and falls back to the orders", () => {
  const orders = [eff("1", "SO-1"), eff("2", "SO-2"), eff("3", "SO-3")];
  const route = {
    source: "optimized",
    origin: null,
    maps_links: [],
    warning: null,
    stops: [
      { so_id: 3, so_number: "SO-3", customer_name: "C3", address_text: "A3", sequence: 1, status: "pending", lat: null, lng: null, navigate_url: "u3" },
      { so_id: 1, so_number: "SO-1", customer_name: "C1", address_text: "A1", sequence: 2, status: "pending", lat: null, lng: null, navigate_url: null },
    ],
  } as RouteInfo;
  const rows = stopRows(route, orders);
  assert.deepEqual(rows.map((r) => r.so_id), ["3", "1"]);
  assert.equal(rows[0].navigate_url, "u3");
  assert.equal(rows[0].eff?.so_id, "3");

  const fb = stopRows(undefined, [eff("1", "SO-1", 3), eff("2", "SO-2", 1)]);
  assert.deepEqual(fb.map((r) => r.so_id), ["2", "1"]);
  assert.equal(stopRows({ ...route, stops: [] }, orders).length, 3);
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
