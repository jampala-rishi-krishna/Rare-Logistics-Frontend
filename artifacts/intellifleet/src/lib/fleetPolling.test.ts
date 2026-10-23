import assert from "node:assert/strict";
import { test } from "node:test";
import { startFleetCachePolling } from "./fleetPolling.ts";

test("30-minute Fleet timer performs cached reads only and stops after cleanup", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const requests: string[] = [];
  const stop = startFleetCachePolling(async () => { requests.push("GET /vehicles"); });
  t.mock.timers.tick(30 * 60 * 1000 - 1);
  assert.equal(requests.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(requests, ["GET /vehicles"]);
  t.mock.timers.tick(30 * 60 * 1000);
  assert.deepEqual(requests, ["GET /vehicles", "GET /vehicles"]);
  stop();
  t.mock.timers.tick(30 * 60 * 1000);
  assert.equal(requests.length, 2);
  assert.equal(requests.filter((r) => r.startsWith("POST")).length, 0);
});

test("a failed cached read does not stop the next scheduled read", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let reads = 0;
  const stop = startFleetCachePolling(async () => { reads++; throw new Error("mocked GET failure"); });
  t.mock.timers.tick(30 * 60 * 1000);
  await Promise.resolve();
  t.mock.timers.tick(30 * 60 * 1000);
  await Promise.resolve();
  assert.equal(reads, 2);
  stop();
});
