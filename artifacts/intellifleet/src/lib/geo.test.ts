import assert from "node:assert/strict";
import { test } from "node:test";
import { capturePosition, geoErrorReason, toGpsFix } from "./geo.ts";

test("geoErrorReason maps codes", () => {
  assert.equal(geoErrorReason(1), "denied");
  assert.equal(geoErrorReason(2), "unavailable");
  assert.equal(geoErrorReason(3), "timeout");
  assert.equal(geoErrorReason(undefined), "unavailable");
});

test("toGpsFix rounds and rejects bad coordinates", () => {
  assert.deepEqual(toGpsFix({ latitude: 14.2912345678, longitude: 121.0100001, accuracy: 12.345 }), { lat: 14.291235, lng: 121.01, accuracy_m: 12.3 });
  assert.equal(toGpsFix({ latitude: Number.NaN, longitude: 1 }), null);
  assert.equal(toGpsFix({ latitude: 91, longitude: 1 }), null);
  assert.equal(toGpsFix({ latitude: 1, longitude: 1 })?.accuracy_m, null);
});

test("capturePosition success", async () => {
  const geo = { getCurrentPosition: (ok: (p: any) => void) => ok({ coords: { latitude: 14.29, longitude: 121.01, accuracy: 12.5 } }) };
  const r = await capturePosition({ geo });
  assert.deepEqual(r, { gps: { lat: 14.29, lng: 121.01, accuracy_m: 12.5 }, gps_denied_reason: null });
});

test("capturePosition denied, never throws", async () => {
  const geo = { getCurrentPosition: (_ok: unknown, err: (e: { code: number }) => void) => err({ code: 1 }) };
  assert.deepEqual(await capturePosition({ geo }), { gps: null, gps_denied_reason: "denied" });
  const thrower = {
    getCurrentPosition: () => {
      throw new Error("boom");
    },
  };
  assert.deepEqual(await capturePosition({ geo: thrower }), { gps: null, gps_denied_reason: "unavailable" });
  assert.deepEqual(await capturePosition({ geo: null }), { gps: null, gps_denied_reason: "unavailable" });
});

test("capturePosition hard timeout when the browser never answers", async () => {
  const geo = { getCurrentPosition: () => {} };
  const r = await capturePosition({ geo, timeoutMs: 10 });
  assert.deepEqual(r, { gps: null, gps_denied_reason: "timeout" });
});
