// Pure navigation / derived-view helpers for the one-page driver trip screen: href builders, which step the
// big button is on, the current stop, Google Maps directions, check-in distance notices and old-URL redirects.
import { withDriverParams } from "./driver.ts";
import type { BatchDetail, DispatchChange, DriverOrder, RouteStop } from "./tripTypes.ts";
import type { EffectiveBatch, EffectiveOrder } from "./tripState.ts";

const enc = encodeURIComponent;

// THE trip screen (everything happens on this one page).
export function tripPath(batchId: string, adminDriverId: string | null, extra: Record<string, string | null> = {}): string {
  return withDriverParams(`/driver/trip/${enc(batchId)}`, { ...extra, driver_id: adminDriverId });
}

// Kept as an alias: older code and alert links call it the assignment page.
export const assignmentPath = tripPath;

// Old driver URLs (bookmarks, alert links) -> the new screens, so nothing 404s.
//   /driver/assignment/:id[/anything]  -> /driver/trip/:id
//   /driver/trips, /driver/history     -> /driver/history
//   /driver/alerts                     -> /driver/profile (alerts list lives there)
//   /driver/issues/new?batch=:id       -> /driver/trip/:id ; /driver/issues[...] -> /driver/today
//   anything else under /driver        -> /driver/today
// Query params other than the ones consumed here (driver_id, from) are kept.
export function legacyRedirect(pathname: string, search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const keep = (extra: Record<string, string | null> = {}) => {
    const out: Record<string, string | null> = { ...extra };
    for (const k of ["from", "driver_id"]) if (params.get(k)) out[k] = params.get(k);
    return out;
  };
  const assignment = /^\/driver\/(?:assignment|trip)\/([^/]+)/.exec(pathname);
  if (assignment) return withDriverParams(`/driver/trip/${assignment[1]}`, keep());
  if (/^\/driver\/(trips|history)\b/.test(pathname)) return withDriverParams("/driver/history", keep());
  if (/^\/driver\/alerts\b/.test(pathname)) return withDriverParams("/driver/profile", keep());
  if (/^\/driver\/issues\b/.test(pathname)) {
    const batch = params.get("batch");
    return batch ? withDriverParams(`/driver/trip/${enc(batch)}`, keep()) : withDriverParams("/driver/today", keep());
  }
  return withDriverParams("/driver/today", keep());
}

// Crew actions are only offered to crew (not the read-only admin viewer), once the batch is loaded
// and the server sent trip info (history rows without `trip` stay read-only).
export function actionsEnabled(scope: { isAdmin: boolean; missingDriverId: boolean; sessionLoading: boolean }, batch: Pick<BatchDetail, "trip"> | null | undefined): boolean {
  return !scope.isAdmin && !scope.missingDriverId && !scope.sessionLoading && Boolean(batch?.trip);
}

// Which step the single big button is on.
export type TripStep = "acknowledge" | "start" | "arrive" | "deliver" | "end" | "waiting" | "closed";

export function tripStep(state: Pick<EffectiveBatch, "status" | "orders" | "acknowledged" | "total" | "stopsDone">): TripStep {
  if (state.status === "closed") return "closed";
  if (state.status === "returned" || state.status === "handover_submitted") return "waiting";
  if (state.status === "pending") return state.total > 0 && state.acknowledged >= state.total ? "start" : "acknowledge";
  if (state.orders.some((o) => o.stopStatus === "checked_in")) return "deliver";
  return state.total > 0 && state.stopsDone >= state.total ? "end" : "arrive";
}

// The stop the crew is at (checked in) or heading to next (first stop not checked out), in stop order.
export function currentStop(orders: EffectiveOrder[]): EffectiveOrder | null {
  return orders.find((o) => o.stopStatus === "checked_in") ?? orders.find((o) => o.stopStatus !== "checked_out") ?? null;
}

// Short stop state for the list rows.
export type StopState = "waiting" | "here" | "delivered" | "problem";

export function stopState(o: Pick<EffectiveOrder, "stopStatus" | "outcome" | "attention">): StopState {
  if (o.attention.length > 0) return "problem";
  if (o.stopStatus === "checked_in") return "here";
  if (o.stopStatus === "checked_out") return /^deliver/i.test((o.outcome ?? "Delivered").trim()) ? "delivered" : "problem";
  return "waiting";
}

// Google Maps turn-by-turn directions to one stop: the server's link, else coordinates, else the address.
export function directionsUrl(order: Pick<DriverOrder, "address_text" | "customer_name">, routeStop?: Pick<RouteStop, "lat" | "lng" | "navigate_url"> | null): string | null {
  if (routeStop?.navigate_url) return routeStop.navigate_url;
  const base = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=";
  if (routeStop && typeof routeStop.lat === "number" && typeof routeStop.lng === "number") return `${base}${routeStop.lat},${routeStop.lng}`;
  const text = (order.address_text || order.customer_name || "").trim();
  return text ? `${base}${enc(text)}` : null;
}

// Dispatch changes that concern one batch (or all of them when batchId is null), newest first, minus dismissed ones.
export function visibleChanges(changes: DispatchChange[] | null | undefined, batchId: string | null, dismissed: ReadonlySet<string>): DispatchChange[] {
  return (changes ?? [])
    .filter((c) => (batchId === null || c.batch_id === batchId) && !dismissed.has(changeKey(c)))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function changeKey(c: Pick<DispatchChange, "kind" | "batch_id" | "so_id" | "at">): string {
  return `${c.kind}:${c.batch_id}:${c.so_id ?? ""}:${c.at}`;
}

export interface CheckinNotice {
  far: boolean;
  text: string;
}

// Distance recorded at check-in. Far (> 500 m) is a warning only; it never blocks anything.
export function checkinNotice(stop: { checkin_distance_m?: number | null; checkin_far?: boolean | null } | null | undefined): CheckinNotice | null {
  if (!stop) return null;
  const d = stop.checkin_distance_m;
  const has = typeof d === "number" && Number.isFinite(d);
  const meters = has ? `${Math.round(d)} m` : null;
  if (stop.checkin_far) {
    return { far: true, text: `You arrived ${meters ?? "far"} from this address. Check that you are at the right stop.` };
  }
  return has ? { far: false, text: `${meters} from the address at arrival` } : null;
}

// Distance in metres of a far check-in (null when not far), read from the check-in response.
export function farDistanceFor(batch: BatchDetail | null | undefined, soId: string): number | null | undefined {
  const order = batch?.orders.find((o) => String(o.id) === soId);
  const stop = order?.workflow?.stop;
  if (!stop?.checkin_far) return undefined;
  return typeof stop.checkin_distance_m === "number" ? Math.round(stop.checkin_distance_m) : null;
}

// Warning to toast right after a check-in response when the stop was far from the address.
export function farWarningFor(batch: BatchDetail | null | undefined, soId: string): string | null {
  const order = batch?.orders.find((o) => String(o.id) === soId);
  const notice = checkinNotice(order?.workflow?.stop);
  return notice?.far ? notice.text : null;
}
