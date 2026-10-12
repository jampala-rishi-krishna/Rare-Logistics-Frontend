// Pure live-movement logic for LiveOpsMap: no aliased imports, so it is unit tested with node --test.

// ---------------------------------------------------------------------------------------------
// Live vehicle movement
//
// Positions arrive about every poll interval (15s in production) and the device's own timestamp
// says how far apart the two fixes really were. Each marker glides from where it is NOW to the new
// fix over that real gap, at constant speed, so it keeps moving until the next fix lands instead of
// finishing early and sitting still. A new fix mid-glide continues from the current interpolated
// position (never snaps back); a parked or unchanged vehicle is not animated at all.
// ---------------------------------------------------------------------------------------------

export const MIN_ANIMATION_MS = 3_000;
export const MAX_ANIMATION_MS = 60_000;
export const FALLBACK_ANIMATION_MS = 15_000;
const SAME_POSITION_EPSILON_DEG = 1e-7; // ~1 cm

export function parseGpsTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function clampDuration(ms: number): number {
  return Math.min(MAX_ANIMATION_MS, Math.max(MIN_ANIMATION_MS, ms));
}

// Duration of the glide to a new fix: the ACTUAL time between this vehicle's two GPS timestamps, clamped to
// 3s-60s. Without usable timestamps it falls back to the gap between the two updates' arrival, then to 15s.
export function animationDurationMs(
  previousGpsMs: number | null,
  nextGpsMs: number | null,
  arrivalGapMs?: number | null,
): number {
  if (previousGpsMs !== null && nextGpsMs !== null && nextGpsMs > previousGpsMs) {
    return clampDuration(nextGpsMs - previousGpsMs);
  }
  if (arrivalGapMs !== null && arrivalGapMs !== undefined && arrivalGapMs > 0) return clampDuration(arrivalGapMs);
  return FALLBACK_ANIMATION_MS;
}

// Signed shortest rotation from one compass heading to another, in (-180, 180].
export function shortestAngleDelta(from: number, to: number): number {
  let delta = (((to - from) % 360) + 540) % 360 - 180;
  if (delta === -180) delta = 180;
  return delta;
}

export function interpolateHeading(from: number, to: number, t: number): number {
  return (((from + shortestAngleDelta(from, to) * t) % 360) + 360) % 360;
}

// Marker icons are cached per heading step so rotating a truck never regenerates an image every frame.
export const HEADING_STEP_DEG = 5;
export function quantizeHeading(heading: number): number {
  return ((Math.round(heading / HEADING_STEP_DEG) * HEADING_STEP_DEG) % 360 + 360) % 360;
}

export interface VehicleFix {
  lat: number;
  lng: number;
  heading: number;
  gpsTime?: string | null;
}

export interface MarkerPose {
  lat: number;
  lng: number;
  heading: number;
}

interface Track {
  from: MarkerPose;
  to: MarkerPose;
  startMs: number;
  durationMs: number;
}

interface VehicleMotion {
  track: Track | null;
  pose: MarkerPose;
  target: MarkerPose; // the latest distinct fix received; a repeat of it is a duplicate delivery, not new movement
  lastGpsMs: number | null;
  lastArrivalMs: number;
}

function poseAt(track: Track, nowMs: number): MarkerPose {
  const t = Math.min(1, Math.max(0, (nowMs - track.startMs) / track.durationMs));
  return {
    lat: track.from.lat + (track.to.lat - track.from.lat) * t,
    lng: track.from.lng + (track.to.lng - track.from.lng) * t,
    heading: interpolateHeading(track.from.heading, track.to.heading, t),
  };
}

export class MarkerAnimator {
  private motions = new Map<string, VehicleMotion>();

  // Feed one fix. Returns true when it started (or redirected) a glide, false for a first sighting or a repeat
  // of the fix already being shown / headed to.
  update(id: string, fix: VehicleFix, nowMs: number): boolean {
    const target: MarkerPose = { lat: fix.lat, lng: fix.lng, heading: Number.isFinite(fix.heading) ? fix.heading : 0 };
    const gpsMs = parseGpsTime(fix.gpsTime);
    const motion = this.motions.get(id);
    if (!motion) {
      this.motions.set(id, { track: null, pose: target, target, lastGpsMs: gpsMs, lastArrivalMs: nowMs });
      return false;
    }
    const sameAsTarget =
      Math.abs(motion.target.lat - target.lat) <= SAME_POSITION_EPSILON_DEG &&
      Math.abs(motion.target.lng - target.lng) <= SAME_POSITION_EPSILON_DEG;
    if (sameAsTarget) {
      // The fix we are already heading to (or sitting at), delivered again - e.g. the map re-rendering because
      // ANOTHER vehicle moved. Never restart the glide for it. A heading-only change is just applied.
      motion.target = target;
      if (motion.track) motion.track.to = { ...motion.track.to, heading: target.heading };
      else motion.pose = { ...motion.pose, heading: target.heading };
      return false;
    }
    const current = motion.track ? poseAt(motion.track, nowMs) : motion.pose;
    const arrivalGap = nowMs - motion.lastArrivalMs;
    const previousGpsMs = motion.lastGpsMs;
    motion.lastArrivalMs = nowMs;
    if (gpsMs !== null) motion.lastGpsMs = gpsMs;
    motion.target = target;
    motion.pose = current;
    motion.track = {
      from: current,
      to: target,
      startMs: nowMs,
      durationMs: animationDurationMs(previousGpsMs, gpsMs, arrivalGap),
    };
    return true;
  }

  // Where every vehicle should be drawn at nowMs.
  poses(nowMs: number): Map<string, MarkerPose> {
    const out = new Map<string, MarkerPose>();
    this.motions.forEach((motion, id) => {
      if (motion.track) {
        motion.pose = poseAt(motion.track, nowMs);
        if (nowMs - motion.track.startMs >= motion.track.durationMs) motion.track = null;
      }
      out.set(id, { ...motion.pose });
    });
    return out;
  }

  pose(id: string, nowMs: number): MarkerPose | null {
    const motion = this.motions.get(id);
    if (!motion) return null;
    return motion.track ? poseAt(motion.track, nowMs) : { ...motion.pose };
  }

  isAnimating(): boolean {
    for (const motion of this.motions.values()) if (motion.track) return true;
    return false;
  }

  remove(id: string): void {
    this.motions.delete(id);
  }

  ids(): string[] {
    return [...this.motions.keys()];
  }
}

// How long ago a vehicle's GPS fix was taken, from the device's own timestamp (not the server poll time).
export function gpsAgeSeconds(gpsTime: string | null | undefined, nowMs: number): number | null {
  const ms = parseGpsTime(gpsTime);
  if (ms === null) return null;
  return Math.max(0, Math.round((nowMs - ms) / 1000));
}

export function formatGpsAge(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

// /vehicles polling: none while the live WebSocket is connected (it pushes every change, and a single
// fetch on load/reconnect supplies the full list); a 30s fallback only while the socket is down. The Fleet
// snapshot page (liveTracking false) keeps its 30-minute reconcile.
export const FALLBACK_POLL_MS = 30_000;
export const SNAPSHOT_POLL_MS = 30 * 60 * 1000;
export function vehiclesRefetchInterval(liveTracking: boolean, socketConnected: boolean): number | false {
  if (!liveTracking) return SNAPSHOT_POLL_MS;
  return socketConnected ? false : FALLBACK_POLL_MS;
}

// The GPS feed is alive while the backend heartbeat (one per poll) or any position keeps arriving. Generous
// enough for a 15s poll plus a slow tick, tight enough that a dead feed shows within a minute.
export const FEED_STALE_MS = 60_000;
export function isFeedStale(lastFeedAtMs: number | null, nowMs: number): boolean {
  return lastFeedAtMs === null || nowMs - lastFeedAtMs > FEED_STALE_MS;
}
