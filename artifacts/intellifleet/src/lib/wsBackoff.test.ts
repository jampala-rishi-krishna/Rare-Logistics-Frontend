import assert from "node:assert/strict";
import test from "node:test";
import {
  WS_BASE_DELAY_MS,
  WS_MAX_DELAY_MS,
  backoffCeilingMs,
  closeDecision,
  equalJitterMs,
  fullJitterMs,
  isStatusMessage,
  socketUrl,
} from "./wsBackoff.ts";

test("ceiling: 1s base, doubling, 30s cap", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 10].map((n) => backoffCeilingMs(n)), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(WS_BASE_DELAY_MS, 1000);
  assert.equal(WS_MAX_DELAY_MS, 30000);
});

test("full jitter stays within [0, ceiling]", () => {
  for (const attempt of [0, 3, 9]) {
    assert.equal(fullJitterMs(attempt, () => 0), 0);
    assert.equal(fullJitterMs(attempt, () => 1), backoffCeilingMs(attempt));
    for (let i = 0; i < 50; i++) {
      const d = fullJitterMs(attempt);
      assert.ok(d >= 0 && d <= backoffCeilingMs(attempt));
    }
  }
});

test("equal jitter stays within [ceiling/2, ceiling] and never exceeds 30s", () => {
  for (const attempt of [0, 2, 5, 20]) {
    const ceiling = backoffCeilingMs(attempt);
    assert.equal(equalJitterMs(attempt, () => 0), ceiling / 2);
    assert.equal(equalJitterMs(attempt, () => 1), ceiling);
    for (let i = 0; i < 50; i++) {
      const d = equalJitterMs(attempt);
      assert.ok(d >= ceiling / 2 && d <= ceiling && d <= 30000);
    }
  }
});

test("close codes: 4401 stops and signs in, 4403 stops, others reconnect, client close stops", () => {
  assert.equal(closeDecision(4401, false), "stop_and_sign_in");
  assert.equal(closeDecision(4403, false), "stop");
  assert.equal(closeDecision(1006, false), "reconnect");
  assert.equal(closeDecision(1011, false), "reconnect");
  assert.equal(closeDecision(1000, false), "reconnect");
  assert.equal(closeDecision(1006, true), "stop");
  assert.equal(closeDecision(4401, true), "stop");
});

test("token is appended as ?token= only when present", () => {
  assert.equal(socketUrl("wss://x/ws/fleet", null), "wss://x/ws/fleet");
  assert.equal(socketUrl("wss://x/ws/fleet", "a b/c"), "wss://x/ws/fleet?token=a%20b%2Fc");
  assert.equal(socketUrl("wss://x/ws/fleet?v=2", "t"), "wss://x/ws/fleet?v=2&token=t");
});

test("status frames are recognised without crashing on junk", () => {
  assert.equal(isStatusMessage({ type: "status", cartrack: "unavailable" }), true);
  assert.equal(isStatusMessage({ type: "FLEET_POSITIONS" }), false);
  assert.equal(isStatusMessage(null), false);
  assert.equal(isStatusMessage("status"), false);
});
