// Adapters from backend row shapes (services/api/*.ts) to the UI-friendly
// shapes App.tsx already renders against, so wiring real data doesn't require
// restructuring every component.
import type { ApiVehicle } from "./api/fleet";
import type { ApiOrder } from "./api/orders";
import type { ApiAlert } from "./api/alerts";

export function titleCase(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Approximate linear projection of real lat/lng onto the schematic 0-100
// viewBox MockMap draws the Philippines on. This is not a real map
// projection - it's calibrated against the Philippines' rough bounding box
// only so live vehicle positions land in believable places on that sketch.
const PH_BOUNDS = { latMin: 4.5, latMax: 21.0, lngMin: 116.5, lngMax: 127.0 };

export function projectLatLngToMapXY(lat: number, lng: number): { x: number; y: number } {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const x = 10 + ((lng - PH_BOUNDS.lngMin) / (PH_BOUNDS.lngMax - PH_BOUNDS.lngMin)) * 80;
  const y = 85 - ((lat - PH_BOUNDS.latMin) / (PH_BOUNDS.latMax - PH_BOUNDS.latMin)) * 75;
  return { x: clamp(x, 8, 92), y: clamp(y, 10, 90) };
}

// Inverse of the above - only used to backfill a plausible real-coordinate pair for the
// local fixture fallback array (schematic x/y only), so its shape still satisfies UiVehicle
// for LiveOpsMap's sake. Never used for anything derived from real API data.
export function mapXYToLatLngApprox(x: number, y: number): { lat: number; lng: number } {
  const lng = PH_BOUNDS.lngMin + ((x - 10) / 80) * (PH_BOUNDS.lngMax - PH_BOUNDS.lngMin);
  const lat = PH_BOUNDS.latMin + ((85 - y) / 75) * (PH_BOUNDS.latMax - PH_BOUNDS.latMin);
  return { lat, lng };
}

export interface UiVehicle {
  id: string;
  plate: string;
  driver: string;
  speed: number;
  fuel: number;
  status: string;
  x: number;
  y: number;
  zone: string;
  // Real coordinates/heading, kept alongside the schematic x/y projection above -
  // MockMap still uses x/y, while LiveOpsMap and the live socket
  // WebSocket merge (useLiveFleetSocket in App.tsx) use these directly.
  currentLat: number;
  currentLng: number;
  heading: number;
  lastUpdated: string;
  ignitionOn: boolean;
  address: string;
  associatedSos: ApiVehicle["associated_sos"];
  warehousePickup: string | null;
  locked: boolean;
  lockReason: string | null;
  capacityKg: number | null;
  load: ApiVehicle["load"];
  fulfillment: ApiVehicle["fulfillment"];
}

export function adaptVehicle(v: ApiVehicle): UiVehicle {
  const { x, y } = projectLatLngToMapXY(v.current_lat, v.current_lng);
  return {
    // Postgres returns the primary key as a number while the WebSocket contract
    // uses a string vehicle_id. Keep one identity type so live updates merge.
    id: String(v.id),
    plate: v.plate_no,
    // fleet-module has no name lookup for driver_id (drivers/users aren't
    // joined by any endpoint) - showing the id is honest, not a guess.
    driver: v.driver_id || "Unassigned",
    speed: Math.round(v.speed_kph),
    // The unified schema stores a real percentage; clamp malformed provider values.
    fuel: v.fuel_pct == null ? 0 : Math.max(0, Math.min(100, Math.round(v.fuel_pct))),
    status: titleCase(v.status || "Unknown"),
    x,
    y,
    zone: v.zone,
    currentLat: v.current_lat,
    currentLng: v.current_lng,
    heading: v.heading,
    lastUpdated: v.last_updated,
    ignitionOn: v.ignition_on,
    address: "",
    associatedSos: v.associated_sos || [],
    warehousePickup: v.warehouse_pickup,
    locked: v.locked,
    lockReason: v.lock_reason,
    capacityKg: v.capacity_kg,
    load: v.load,
    fulfillment: v.fulfillment,
  };
}

export interface UiOrder {
  id: string;
  customer: string;
  route: string;
  vehicle: string;
  status: string;
  eta: string;
  temperature: string;
  shipmentWeight: number | null;
  shipmentWeightUnit: string | null;
  serviceTimeMin: number | null;
}

function formatEta(order: ApiOrder): string {
  if (!order.eta_window_end) return "ETA pending";
  const parsed = parseZcqlDatetime(order.eta_window_end);
  if (parsed === null) return order.eta_window_end;
  return new Date(parsed).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function adaptOrder(o: ApiOrder): UiOrder {
  return {
    id: String(o.id ?? o.ROWID ?? ""),
    // orders-module has no GET /customers or GET /routes joined in - showing
    // the raw foreign key is honest given the current API surface.
    customer: o.customer_id || "Unknown customer",
    route: o.route_id || "Unassigned route",
    vehicle: o.vehicle_id || "Unassigned",
    status: titleCase(o.status || "Scheduled"),
    eta: formatEta(o),
    temperature: `${o.cargo_temp_c}°C`,
    shipmentWeight: o.shipment_weight,
    shipmentWeightUnit: o.shipment_weight_unit,
    serviceTimeMin: o.service_time_min,
  };
}

export interface UiAlert {
  id: string;
  type: string;
  severity: string;
  vehicle: string;
  message: string;
  time: string;
  status: string;
}

// Legacy rows may return CREATEDTIME/MODIFIEDTIME as "yyyy-MM-dd HH:mm:ss:SSS" (note
// the trailing ":SSS" milliseconds, not the "." Date.parse expects) and plain
// datetime columns (e.g. vehicles.last_updated, written by fleet-module's
// nowForZcql()) as "yyyy-MM-dd HH:mm:ss" - both are naive UTC wall-clock strings
// with NO timezone marker. Without appending "Z" below, `new Date()` parses them
// as browser-LOCAL time instead of UTC, silently shifting "now - then" by the
// browser's UTC offset (hours, not seconds) - this is what made genuinely fresh
// vehicle data look "Stale" (or vice versa) outside UTC. Real ISO-8601 strings
// that already carry a "Z"/offset (e.g. the live WebSocket push) are
// left untouched.
export function parseZcqlDatetime(value: string | null | undefined): number | null {
  if (!value) return null;
  let normalized = value.includes(" ") && !value.includes("T") ? value.replace(" ", "T") : value;
  normalized = normalized.replace(/:(\d{3})$/, ".$1");
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) normalized += "Z";
  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function timeAgo(value: string | null): string {
  const then = parseZcqlDatetime(value);
  if (then === null) return "";
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.round(diffMin / 60)}h ago`;
}

export function adaptAlert(a: ApiAlert): UiAlert {
  return {
    id: a.ROWID,
    type: titleCase(a.type || "Alert"),
    severity: titleCase(a.severity || "Info"),
    vehicle: a.vehicle_id || "-",
    message: a.message,
    time: timeAgo(a.CREATEDTIME) || "recently",
    status: titleCase(a.status || "Open"),
  };
}
