// Pure view helpers for the rebuilt Driver Overview (search, map geometry, hard-copy ordering, issue ordering).

export interface SearchableRow {
  name: string;
  vehicle: string | null;
  so_numbers?: string[];
}

// Search the live list by driver name, vehicle plate or SO number. Empty query matches everything.
export function matchesSearch(row: SearchableRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = squash(q);
  if (row.name.toLowerCase().includes(q)) return true;
  if (row.vehicle && squash(row.vehicle).includes(needle)) return true;
  return (row.so_numbers ?? []).some((so) => so.toLowerCase().includes(q) || (needle.length >= 3 && squash(so).includes(needle)));
}

export function plateKey(plate: string | null | undefined): string {
  return String(plate ?? "").toUpperCase().replace(/\s+/g, "");
}

// Great-circle distance in metres (used to show how far a check-in / check-out was from the address).
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatMeters(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "\u2014";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function hasGps<T extends { lat?: unknown; lng?: unknown }>(gps: T | null | undefined): gps is T & { lat: number; lng: number } {
  return Boolean(gps) && typeof gps?.lat === "number" && typeof gps?.lng === "number";
}

export function gpsReason(gps: { reason?: unknown } | null | undefined): string | null {
  const reason = gps && typeof gps.reason === "string" ? gps.reason : null;
  return reason ? ({ denied: "location permission denied", unavailable: "location unavailable", timeout: "location timed out" } as Record<string, string>)[reason] ?? reason : null;
}

const HARD_COPY_ORDER = ["missing", "discrepancy", "not_handed_over", "with_officer", "with_driver"];

// Oldest-first inside each group, problems first.
export function sortHardCopies<T extends { state: string; since: string | null }>(rows: T[]): T[] {
  const rank = (s: string) => {
    const i = HARD_COPY_ORDER.indexOf(s);
    return i === -1 ? HARD_COPY_ORDER.length : i;
  };
  return [...rows].sort((a, b) => rank(a.state) - rank(b.state) || (a.since ?? "").localeCompare(b.since ?? ""));
}

export const HARD_COPY_TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = {
  with_driver: "info",
  with_officer: "warn",
  not_handed_over: "bad",
  missing: "bad",
  discrepancy: "bad",
};

export const PRIORITY_TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = { normal: "neutral", high: "warn", urgent: "bad" };

// The "Live" map colours: outcome of a departed stop.
export function outcomeColor(outcome: string | null | undefined): string {
  const o = (outcome ?? "").toLowerCase();
  if (o.startsWith("delivered")) return "#1e7b44";
  if (o.startsWith("partial")) return "#b07b12";
  if (o.startsWith("failed") || o.startsWith("returned")) return "#c4291f";
  return "#55565a";
}
