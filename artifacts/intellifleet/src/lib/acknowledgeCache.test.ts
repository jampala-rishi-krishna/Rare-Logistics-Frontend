import assert from "node:assert/strict";
import { test } from "node:test";
import { forgetSessionAcknowledged, rememberSessionAcknowledged, removeOrdersFromPage, sessionAcknowledgedIds, sessionAcknowledgedOrders, settleAcknowledgements, summarizeAcknowledgements } from "./acknowledgeCache.ts";

const page = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}` })) as any[], total: n, page: 1, per_page: 100, has_more: false });

test("bulk acknowledge 2 of 10: the list shows 8 and the count shows 8", () => {
  const next = removeOrdersFromPage(page(10), ["id2", "id5"])!;
  assert.equal(next.items.length, 8);
  assert.equal(next.total, 8);
  assert.ok(!next.items.some((o) => o.id === "id2" || o.id === "id5"));
});

test("removing ids that are not in the page changes nothing (same object, same count)", () => {
  const original = page(10);
  assert.equal(removeOrdersFromPage(original, ["nope"]), original);
});

test("the count never goes below zero and undefined pages pass through", () => {
  assert.equal(removeOrdersFromPage({ ...page(2), total: 1 }, ["id1", "id2"])!.total, 0);
  assert.equal(removeOrdersFromPage(undefined, ["id1"]), undefined);
});

test("partial failure: only the successful order is reported as acknowledged", async () => {
  const outcomes = await settleAcknowledgements(["id1", "id2"], async (id) => {
    if (id === "id2") throw new Error("Zoho refused");
    return { acknowledged: true };
  });
  assert.deepEqual(outcomes.map((o) => [o.id, o.ok]), [["id1", true], ["id2", false]]);
  const summary = summarizeAcknowledgements(outcomes, (id) => `SO-${id}`);
  assert.deepEqual(summary.acknowledgedIds, ["id1"]);
  assert.deepEqual(summary.failedIds, ["id2"]);
  assert.equal(summary.errors.id2, "Zoho refused");
  assert.match(summary.message, /Acknowledged 1 sales order\./);
  assert.match(summary.message, /Failed 1: SO-id2 \(Zoho refused\)/);
  // Only the ok one leaves the list; the failed one stays.
  const next = removeOrdersFromPage(page(2), summary.acknowledgedIds)!;
  assert.deepEqual(next.items.map((o) => o.id), ["id2"]);
});

test("a response that says acknowledged:false is a failure, not a move", async () => {
  const [outcome] = await settleAcknowledgements(["id1"], async () => ({ acknowledged: false }));
  assert.equal(outcome.ok, false);
});

test("a rejected acknowledge never prevents the others from running", async () => {
  const seen: string[] = [];
  await settleAcknowledgements(["a", "b", "c"], async (id) => {
    seen.push(id);
    if (id === "a") throw new Error("boom");
    return { acknowledged: true };
  });
  assert.deepEqual(seen.sort(), ["a", "b", "c"]);
});

test("session acknowledgement guard remembers snapshots and can forget them", () => {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  };
  rememberSessionAcknowledged(["id1"], [{ id: "id1", salesorder_number: "SO-1", expected_shipment_date: "2026-10-08" } as any]);
  assert.deepEqual(Array.from(sessionAcknowledgedIds()), ["id1"]);
  assert.equal(sessionAcknowledgedOrders()[0].salesorder_number, "SO-1");
  forgetSessionAcknowledged(["id1"]);
  assert.deepEqual(Array.from(sessionAcknowledgedIds()), []);
  delete (globalThis as any).window;
});
