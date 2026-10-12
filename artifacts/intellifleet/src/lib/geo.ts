// Position capture at the moment of a tap. Never throws, never blocks longer than the timeout.
import type { GpsDeniedReason, GpsFix } from "./tripTypes.ts";

export interface PositionResult {
  gps: GpsFix | null;
  gps_denied_reason: GpsDeniedReason;
}

export interface GeoLike {
  getCurrentPosition(
    success: (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void,
    error: (err: { code: number }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ): void;
}

// GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
export function geoErrorReason(code: number | null | undefined): Exclude<GpsDeniedReason, null> {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function toGpsFix(coords: { latitude: number; longitude: number; accuracy?: number | null }): GpsFix | null {
  const { latitude, longitude, accuracy } = coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    lat: round(latitude, 6),
    lng: round(longitude, 6),
    accuracy_m: typeof accuracy === "number" && Number.isFinite(accuracy) ? round(accuracy, 1) : null,
  };
}

export interface CaptureOptions {
  timeoutMs?: number;
  geo?: GeoLike | null;
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn?: (h: unknown) => void;
}

export function capturePosition(options: CaptureOptions = {}): Promise<PositionResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const geo: GeoLike | null =
    options.geo !== undefined ? options.geo : typeof navigator !== "undefined" && navigator.geolocation ? navigator.geolocation : null;
  const setT = options.setTimeoutFn ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearT = options.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  return new Promise<PositionResult>((resolve) => {
    if (!geo) {
      resolve({ gps: null, gps_denied_reason: "unavailable" });
      return;
    }
    let settled = false;
    let timer: unknown = null;
    const finish = (result: PositionResult) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearT(timer);
      resolve(result);
    };
    // Hard timeout: a pending permission prompt may never call back at all.
    timer = setT(() => finish({ gps: null, gps_denied_reason: "timeout" }), timeoutMs + 500);
    try {
      geo.getCurrentPosition(
        (pos) => {
          const gps = toGpsFix(pos.coords);
          finish(gps ? { gps, gps_denied_reason: null } : { gps: null, gps_denied_reason: "unavailable" });
        },
        (err) => finish({ gps: null, gps_denied_reason: geoErrorReason(err?.code) }),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
      );
    } catch {
      finish({ gps: null, gps_denied_reason: "unavailable" });
    }
  });
}
