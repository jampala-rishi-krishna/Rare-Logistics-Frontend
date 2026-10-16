import assert from "node:assert/strict";
import { test } from "node:test";
import { activeStop, afterDelivery, focusStop, keepChoice, normalizeStopStatus, pendingStops, stopView } from "./stopChoice.ts";
import type { ChoosableStop } from "./stopChoice.ts";

const s = (so_id: string, stopStatus: ChoosableStop["stopStatus"]): ChoosableStop => ({ so_id, stopStatus });

test("normalizeStopStatus maps server statuses and is_active", () => {
  assert.equal(normalizeStopStatus("checked_out"), "checked_out");
  assert.equal(normalizeStopStatus("checked_in"), "checked_in");
  assert.equal(normalizeStopStatus("arrived"), "checked_in");
  assert.equal(normalizeStopStatus("pending", true), "checked_in");
  assert.equal(normalizeStopStatus("checked_out", true), "checked_out");
  assert.equal(normalizeStopStatus(null), "pending");
  assert.equal(normalizeStopStatus("pending", false), "pending");
});

test("pendingStops keeps server order and skips reached/done stops", () => {
  const stops = [s("1", "checked_out"), s("2", "pending"), s("3", "checked_in"), s("4", "pending")];
  assert.deepEqual(pendingStops(stops).map((x) => x.so_id), ["2", "4"]);
  assert.equal(activeStop(stops)?.so_id, "3");
});

test("no choice yet -> list every pending stop", () => {
  const view = stopView([s("1", "pending"), s("2", "pending"), s("3", "pending")], null);
  assert.equal(view.kind, "choose");
  assert.deepEqual(view.kind === "choose" && view.pending.map((x) => x.so_id), ["1", "2", "3"]);
  assert.equal(focusStop(view), null);
});

test("helper picks a stop out of sequence", () => {
  const view = stopView([s("1", "pending"), s("2", "pending"), s("3", "pending")], "3");
  assert.deepEqual(view.kind === "chosen" && view.stop.so_id, "3");
  assert.equal(focusStop(view)?.so_id, "3");
});

test("a checked-in stop is always current, whatever was picked", () => {
  const view = stopView([s("1", "pending"), s("2", "checked_in"), s("3", "pending")], "3");
  assert.equal(view.kind, "current");
  assert.equal(focusStop(view)?.so_id, "2");
});

test("a picked stop that is no longer pending is ignored", () => {
  assert.equal(stopView([s("1", "checked_out"), s("2", "pending")], "1").kind, "choose");
  assert.equal(stopView([s("2", "pending")], "gone").kind, "choose");
});

test("all stops done -> none (End trip)", () => {
  assert.equal(stopView([s("1", "checked_out"), s("2", "checked_out")], null).kind, "none");
  assert.equal(stopView([], null).kind, "none");
});

test("after a delivery the remaining pending stops show again", () => {
  const view = afterDelivery([s("1", "pending"), s("2", "checked_in"), s("3", "pending")], "2");
  assert.equal(view.kind, "choose");
  assert.deepEqual(view.kind === "choose" && view.pending.map((x) => x.so_id), ["1", "3"]);
  assert.equal(afterDelivery([s("1", "checked_out"), s("2", "checked_in")], "2").kind, "none");
});

test("keepChoice keeps a pending/checked-in pick and drops a delivered or removed one", () => {
  assert.equal(keepChoice([s("1", "pending")], "1"), "1");
  assert.equal(keepChoice([s("1", "checked_in")], "1"), "1");
  assert.equal(keepChoice([s("1", "checked_out")], "1"), null);
  assert.equal(keepChoice([s("1", "pending")], "9"), null);
  assert.equal(keepChoice([s("1", "pending")], null), null);
});
