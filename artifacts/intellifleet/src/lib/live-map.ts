// Pure helper logic for LiveOpsMap (App.tsx), separated out the same way adapters.ts already
// separates data-transform logic from the component tree.
import { parseZcqlDatetime } from "@/services/adapters";

// The backend polls provider telemetry every 30s; a vehicle is considered
// stale once its last_updated is meaningfully older than that cadence.
const STALE_THRESHOLD_MS = 30_000 * 1.5;

// Uses adapters.ts's parseZcqlDatetime rather than `new Date()` directly - the naive
// "yyyy-MM-dd HH:mm:ss" strings vehicles.last_updated comes back as have no timezone
// marker but are UTC, and parsing them as browser-local time was making fresh data
// falsely read as stale (or fresh) depending on the viewer's timezone offset.
export function isVehicleStale(lastUpdatedIso: string | null | undefined): boolean {
  const then = parseZcqlDatetime(lastUpdatedIso);
  if (then === null) return true;
  return Date.now() - then > STALE_THRESHOLD_MS;
}

// Short eased interpolation between two lat/lng points, driven by requestAnimationFrame -
// same technique as the existing useCountUp hook. Returns a cancel function.
export function animateLatLng(
  from: [number, number],
  to: [number, number],
  durationMs: number,
  onTick: (lat: number, lng: number) => void
): () => void {
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    onTick(from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
