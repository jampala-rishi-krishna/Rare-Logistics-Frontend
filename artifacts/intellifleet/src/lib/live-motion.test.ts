import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_ANIMATION_MS,
  FALLBACK_POLL_MS,
  MarkerAnimator,
  SNAPSHOT_POLL_MS,
  animationDurationMs,
  formatGpsAge,
  gpsAgeSeconds,
  interpolateHeading,
  isFeedStale,
  quantizeHeading,
  shortestAngleDelta,
  vehiclesRefetchInterval,
} from "./live-motion.ts";

const iso = (ms: number) => new Date(ms).toISOString();
const T0 = Date.UTC(2026, 9, 12, 7, 0, 0);

test("animation duration is the real gap between the two GPS timestamps", () => {
  assert.equal(animationDurationMs(T0, T0 + 15_000), 15_000);
  assert.equal(animationDurationMs(T0, T0 + 22_500), 22_500);
});

test("animation duration is clamped to 3s-60s", () => {
  assert.equal(animationDurationMs(T0, T0 + 1_000), 3_000);
  assert.equal(animationDurationMs(T0, T0 + 600_000), 60_000);
});

test("without usable timestamps the duration falls back to the update arrival gap, then to 15s", () => {
  assert.equal(animationDurationMs(null, null, 12_000), 12_000);
  assert.equal(animationDurationMs(T0, T0, 8_000), 8_000); // timestamp did not advance
  assert.equal(animationDurationMs(null, null, null), FALLBACK_ANIMATION_MS);
  assert.equal(animationDurationMs(null, null, 500), 3_000);
});

test("a glide runs for the timestamp delta, not a fixed 4.8s", () => {
  const animator = new MarkerAnimator();
  animator.update("1", { lat: 14.5, lng: 121, heading: 90, gpsTime: iso(T0) }, 1_000);
  assert.equal(animator.update("1", { lat: 14.5, lng: 121.001, heading: 90, gpsTime: iso(T0 + 15_000) }, 16_000), true);
  // 4.8s after the update the marker is still on its way (old behaviour: already finished and sitting still)
  const at4_8s = animator.pose("1", 16_000 + 4_800)!;
  assert.ok(at4_8s.lng > 121 && at4_8s.lng < 121.001 - 1e-6, `still moving, got ${at4_8s.lng}`);
  assert.ok(animator.isAnimating());
  // constant speed: a third of the way in after a third of the real gap
  assert.ok(Math.abs(animator.pose("1", 16_000 + 5_000)!.lng - (121 + 0.001 / 3)) < 1e-9);
  // arrives exactly when the gap has elapsed
  assert.ok(Math.abs(animator.pose("1", 16_000 + 15_000)!.lng - 121.001) < 1e-9);
  animator.poses(16_000 + 15_000);
  assert.equal(animator.isAnimating(), false);
});

test("a new fix mid-glide continues from the interpolated position (never snaps back)", () => {
  const animator = new MarkerAnimator();
  animator.update("1", { lat: 14.5, lng: 121, heading: 90, gpsTime: iso(T0) }, 0);
  animator.update("1", { lat: 14.5, lng: 121.001, heading: 90, gpsTime: iso(T0 + 10_000) }, 10_000);
  const midway = animator.pose("1", 15_000)!; // halfway through a 10s glide
  assert.ok(Math.abs(midway.lng - 121.0005) < 1e-9);
  animator.update("1", { lat: 14.5, lng: 121.002, heading: 90, gpsTime: iso(T0 + 20_000) }, 15_000);
  const justAfter = animator.pose("1", 15_000)!;
  assert.ok(Math.abs(justAfter.lng - midway.lng) < 1e-12, "starts exactly where the marker was drawn");
  for (let t = 15_000; t <= 25_000; t += 500) {
    assert.ok(animator.pose("1", t)!.lng >= midway.lng - 1e-12, "never moves backwards");
  }
  assert.ok(Math.abs(animator.pose("1", 25_000)!.lng - 121.002) < 1e-9);
});

test("re-delivering the same fix mid-glide (map re-render) does not restart or speed up the glide", () => {
  const animator = new MarkerAnimator();
  animator.update("1", { lat: 14.5, lng: 121, heading: 90, gpsTime: iso(T0) }, 0);
  animator.update("1", { lat: 14.5, lng: 121.001, heading: 90, gpsTime: iso(T0 + 15_000) }, 15_000);
  const before = animator.pose("1", 20_000)!;
  for (const t of [20_000, 21_000, 22_500]) {
    assert.equal(animator.update("1", { lat: 14.5, lng: 121.001, heading: 90, gpsTime: iso(T0 + 15_000) }, t), false);
  }
  const ref = new MarkerAnimator();
  ref.update("1", { lat: 14.5, lng: 121, heading: 90, gpsTime: iso(T0) }, 0);
  ref.update("1", { lat: 14.5, lng: 121.001, heading: 90, gpsTime: iso(T0 + 15_000) }, 15_000);
  assert.deepEqual(before, ref.pose("1", 20_000));
  assert.deepEqual(animator.pose("1", 26_000), ref.pose("1", 26_000), "same path as if it had been delivered once");
  assert.ok(Math.abs(animator.pose("1", 30_000)!.lng - 121.001) < 1e-9, "still arrives on the original schedule");
});

test("an unchanged or parked vehicle is not animated", () => {
  const animator = new MarkerAnimator();
  assert.equal(animator.update("1", { lat: 14.5, lng: 121, heading: 0, gpsTime: iso(T0) }, 0), false); // first sighting
  assert.equal(animator.update("1", { lat: 14.5, lng: 121, heading: 0, gpsTime: iso(T0) }, 15_000), false);
  assert.equal(animator.isAnimating(), false);
  assert.deepEqual(animator.pose("1", 20_000), { lat: 14.5, lng: 121, heading: 0 });
});

test("first sighting places the marker at the fix without a glide from nowhere", () => {
  const animator = new MarkerAnimator();
  animator.update("1", { lat: 10, lng: 120, heading: 45, gpsTime: null }, 0);
  assert.equal(animator.isAnimating(), false);
  assert.deepEqual(animator.pose("1", 1), { lat: 10, lng: 120, heading: 45 });
});

test("heading rotates along the shortest way round while moving", () => {
  assert.equal(shortestAngleDelta(350, 10), 20);
  assert.equal(shortestAngleDelta(10, 350), -20);
  assert.equal(shortestAngleDelta(0, 180), 180);
  assert.equal(interpolateHeading(350, 10, 0.5), 0);
  const animator = new MarkerAnimator();
  animator.update("1", { lat: 14.5, lng: 121, heading: 350, gpsTime: iso(T0) }, 0);
  animator.update("1", { lat: 14.5, lng: 121.001, heading: 10, gpsTime: iso(T0 + 10_000) }, 10_000);
  const half = animator.pose("1", 15_000)!.heading;
  assert.ok(half === 0 || half === 360 || Math.abs(half) < 1e-9, `expected ~0 (north), got ${half}`);
});

test("headings are quantised to 5 degree steps for icon caching", () => {
  assert.equal(quantizeHeading(92), 90);
  assert.equal(quantizeHeading(93), 95);
  assert.equal(quantizeHeading(359), 0);
  assert.equal(quantizeHeading(-2), 0);
  assert.equal(quantizeHeading(-3), 355);
});

test("removed vehicles are forgotten", () => {
  const animator = new MarkerAnimator();
  animator.update("1", { lat: 1, lng: 1, heading: 0 }, 0);
  animator.remove("1");
  assert.equal(animator.pose("1", 1), null);
  assert.deepEqual(animator.ids(), []);
});

test("last GPS update age comes from the device timestamp", () => {
  assert.equal(gpsAgeSeconds(iso(T0), T0 + 42_000), 42);
  assert.equal(gpsAgeSeconds(null, T0), null);
  assert.equal(gpsAgeSeconds("garbage", T0), null);
  assert.equal(gpsAgeSeconds(iso(T0 + 5_000), T0), 0); // clock skew never goes negative
  assert.equal(formatGpsAge(42), "42s ago");
  assert.equal(formatGpsAge(125), "2m 5s ago");
  assert.equal(formatGpsAge(7_500), "2h 5m ago");
  assert.equal(formatGpsAge(null), "unknown");
});

test("no /vehicles polling while the WebSocket is connected; 30s fallback while it is down", () => {
  assert.equal(vehiclesRefetchInterval(true, true), false);
  assert.equal(vehiclesRefetchInterval(true, false), FALLBACK_POLL_MS);
  assert.equal(FALLBACK_POLL_MS, 30_000);
  // the Fleet snapshot page keeps its slow reconcile whatever the socket does
  assert.equal(vehiclesRefetchInterval(false, true), SNAPSHOT_POLL_MS);
  assert.equal(vehiclesRefetchInterval(false, false), SNAPSHOT_POLL_MS);
});

test("fallback polling starts again the moment the socket drops", () => {
  const states = [true, true, false, false, true].map((connected) => vehiclesRefetchInterval(true, connected));
  assert.deepEqual(states, [false, false, 30_000, 30_000, false]);
});

test("the feed is stale only when neither heartbeats nor positions have arrived for a minute", () => {
  assert.equal(isFeedStale(null, T0), true);
  assert.equal(isFeedStale(T0, T0 + 30_000), false);
  assert.equal(isFeedStale(T0, T0 + 61_000), true);
});
