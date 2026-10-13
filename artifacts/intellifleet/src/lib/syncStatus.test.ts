import assert from "node:assert/strict";
import test from "node:test";
import { entryStatusLabel, syncBadge } from "./syncStatus.ts";

const e = (status: "pending" | "syncing" | "needs_attention" | "done", attempts = 0) => ({ status, attempts });

test("nothing queued and nothing recent is silent", () => {
  assert.deepEqual(syncBadge([], null, 1000), { kind: "idle", count: 0, text: "" });
});

test("a freshly saved action says Saved locally, a retried one Pending sync", () => {
  assert.equal(syncBadge([e("pending", 0)], null, 0).text, "Saved locally (1)");
  assert.equal(syncBadge([e("pending", 0), e("pending", 2)], null, 0).text, "Pending sync (2)");
});

test("failed outranks syncing outranks pending", () => {
  assert.equal(syncBadge([e("pending", 1), e("syncing"), e("needs_attention")], null, 0).kind, "failed");
  assert.equal(syncBadge([e("pending", 1), e("syncing")], null, 0).kind, "syncing");
});

test("Synced is shown only briefly after a server-confirmed result", () => {
  assert.equal(syncBadge([], 1000, 1500).text, "Synced");
  assert.equal(syncBadge([], 1000, 9000).kind, "idle");
});

test("entry labels never claim success for unconfirmed work", () => {
  assert.equal(entryStatusLabel(e("pending", 0)), "Saved locally");
  assert.equal(entryStatusLabel(e("pending", 3)), "Pending sync");
  assert.equal(entryStatusLabel(e("needs_attention")), "Failed");
  assert.equal(entryStatusLabel(e("done")), "Synced");
});
