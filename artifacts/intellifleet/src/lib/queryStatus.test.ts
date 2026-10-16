import assert from "node:assert/strict";
import test from "node:test";
import { combineViews, degradedText, listQueryView } from "./queryStatus.ts";

const at1342 = Date.UTC(2026, 9, 16, 13, 42);

test("no data + error -> red error; no data + loading -> ok", () => {
  assert.deepEqual(listQueryView({ hasData: false, isError: true, dataUpdatedAt: 0 }), { mode: "error" });
  assert.deepEqual(listQueryView({ hasData: false, isError: false, dataUpdatedAt: 0 }), { mode: "ok" });
});

test("data + failed refetch keeps the data with an amber bar from dataUpdatedAt", () => {
  const view = listQueryView({ hasData: true, isError: true, dataUpdatedAt: at1342 });
  assert.deepEqual(view, { mode: "degraded", reason: "error", since: at1342 });
  if (view.mode !== "degraded") throw new Error("expected degraded");
  assert.equal(degradedText(view, true, "UTC"), "Reconnecting… showing data from 13:42.");
  assert.match(degradedText(view, false, "UTC"), /^Can't reach the IntelliFleet server right now - showing data from 13:42\.$/);
});

test("stale:true on a 200 shows stale_since", () => {
  const view = listQueryView({ hasData: true, isError: false, dataUpdatedAt: 1, stale: true, staleSince: "2026-10-16T13:42:00Z" });
  assert.deepEqual(view, { mode: "degraded", reason: "stale", since: at1342 });
  if (view.mode !== "degraded") throw new Error("expected degraded");
  assert.equal(degradedText(view, false, "UTC"), "Live data is delayed - showing data from 13:42.");
  assert.deepEqual(listQueryView({ hasData: true, isError: false, dataUpdatedAt: 1, stale: true, staleSince: "nope" }), { mode: "degraded", reason: "stale", since: null });
  assert.deepEqual(listQueryView({ hasData: true, isError: false, dataUpdatedAt: 1, stale: false }), { mode: "ok" });
});

test("combined views: any error wins, else the oldest degraded time", () => {
  assert.deepEqual(combineViews([{ mode: "ok" }, { mode: "error" }]), { mode: "error" });
  assert.deepEqual(combineViews([{ mode: "ok" }]), { mode: "ok" });
  assert.deepEqual(
    combineViews([
      { mode: "degraded", reason: "stale", since: 200 },
      { mode: "degraded", reason: "error", since: 100 },
    ]),
    { mode: "degraded", reason: "error", since: 100 },
  );
});
