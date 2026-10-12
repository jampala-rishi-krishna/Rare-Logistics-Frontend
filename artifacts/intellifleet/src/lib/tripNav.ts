// Pure navigation / derived-view helpers for the driver trip screens: href builders, the
// "next SO to acknowledge" walk, route stop rows and check-in distance notices.
import { withDriverParams } from "./driver.ts";
import type { BatchDetail, RouteInfo } from "./tripTypes.ts";
import type { EffectiveOrder } from "./tripState.ts";

const enc = encodeURIComponent;

export function assignmentPath(batchId: string, adminDriverId: string | null, extra: Record<string, string | null> = {}): string {
  return withDriverParams(`/driver/assignment/${enc(batchId)}`, { ...extra, driver_id: adminDriverId });
}

export function subpagePath(batchId: string, sub: string, adminDriverId: string | null): string {
  return withDriverParams(`/driver/assignment/${enc(batchId)}/${sub}`, { driver_id: adminDriverId });
}

export const ackPath = (batchId: string, soId: string, adminDriverId: string | null) => subpagePath(batchId, `acknowledge/${enc(soId)}`, adminDriverId);
export const checkoutPath = (batchId: string, soId: string, adminDriverId: string | null) => subpagePath(batchId, `checkout/${enc(soId)}`, adminDriverId);
export const routePath = (batchId: string, adminDriverId: string | null) => subpagePath(batchId, "route", adminDriverId);
export const handoverPath = (batchId: string, adminDriverId: string | null) => subpagePath(batchId, "handover", adminDriverId);
export const timelinePath = (batchId: string, adminDriverId: string | null) => withDriverParams(`/driver/trip/${enc(batchId)}`, { driver_id: adminDriverId });

// Crew actions are only offered to crew (not the read-only admin viewer), once the batch is loaded
// and the server sent trip info (history rows without `trip` stay read-only).
export function actionsEnabled(scope: { isAdmin: boolean; missingDriverId: boolean; sessionLoading: boolean }, batch: Pick<BatchDetail, "trip"> | null | undefined): boolean {
  return !scope.isAdmin && !scope.missingDriverId && !scope.sessionLoading && Boolean(batch?.trip);
}

// Next order that can still be acknowledged, walking forward from `currentSoId` and wrapping.
// The current order is never returned (it is the one being submitted).
export function nextToAcknowledge(orders: Array<Pick<EffectiveOrder, "so_id" | "canAcknowledge">>, currentSoId: string | null): string | null {
  const start = currentSoId === null ? -1 : orders.findIndex((o) => o.so_id === currentSoId);
  for (let step = 1; step <= orders.length; step += 1) {
    const o = orders[(start + step + orders.length) % orders.length];
    if (o && o.so_id !== currentSoId && o.canAcknowledge) return o.so_id;
  }
  return null;
}

export function acknowledgeLeft(orders: Array<Pick<EffectiveOrder, "canAcknowledge">>): number {
  return orders.filter((o) => o.canAcknowledge).length;
}

export interface StopRow {
  so_id: string;
  so_number: string;
  customer_name: string;
  address_text: string;
  sequence: number;
  navigate_url: string | null;
  eff: EffectiveOrder | null;
}

// Stops in route order. Falls back to the batch orders (their stop sequence, else list order) when
// the route could not be loaded, so Start trip / Arrived still work.
export function stopRows(route: RouteInfo | undefined, orders: EffectiveOrder[]): StopRow[] {
  const byId = new Map(orders.map((o) => [o.so_id, o]));
  if (route && route.stops.length > 0) {
    return [...route.stops]
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({
        so_id: String(s.so_id),
        so_number: s.so_number,
        customer_name: s.customer_name,
        address_text: s.address_text,
        sequence: s.sequence,
        navigate_url: s.navigate_url,
        eff: byId.get(String(s.so_id)) ?? null,
      }));
  }
  return orders
    .map((o, i) => ({
      so_id: o.so_id,
      so_number: o.order.so_number,
      customer_name: o.order.customer_name,
      address_text: o.order.address_text,
      sequence: o.order.workflow?.stop?.sequence ?? i + 1,
      navigate_url: null,
      eff: o,
    }))
    .sort((a, b) => a.sequence - b.sequence);
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

// Warning to toast right after a check-in response when the stop was far from the address.
export function farWarningFor(batch: BatchDetail | null | undefined, soId: string): string | null {
  const order = batch?.orders.find((o) => String(o.id) === soId);
  const notice = checkinNotice(order?.workflow?.stop);
  return notice?.far ? notice.text : null;
}
