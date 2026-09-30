import { api } from "./client";

// Raw shapes as returned by fleet-module, columns match
// /IntelliFleet_Catalyst_DataStore_Schema.md exactly.
export interface ApiVehicle {
  id: number | string;
  plate_no: string;
  driver_id: string;
  status: string;
  fuel_pct: number | null;
  ignition_on: boolean;
  current_lat: number;
  current_lng: number;
  heading: number;
  speed_kph: number;
  zone: string;
  last_updated: string;
  associated_sos: { soNumber: string; clientName: string | null; destinationCity: string | null; warehouse: string | null; orderedWeightKg?: number | null; shippedWeightKg?: number | null; status?: string | null; shipmentStatus?: string | null; deliveryStatus?: string | null }[];
  warehouse_pickup: string | null;
  locked: boolean;
  lock_reason: string | null;
  capacity_kg: number | null;
  load: { assignedWeightKg: number; capacityKg: number; remainingWeightKg: number; utilizationPercent: number } | null;
  fulfillment: { assignedWeightKg: number; shippedWeightKg: number; remainingWeightKg: number; percent: number; status: "pending" | "partial" | "fulfilled" | "none"; deliveredOrders?: number; totalOrders?: number } | null;
}

export interface ApiDriver {
  ROWID: string;
  user_id: string;
  license_no: string;
  preferred_channel: string;
  current_vehicle_id: string;
  status: string;
}

export interface ApiGeofence {
  ROWID: string;
  name: string;
  zone_type: string;
  polygon_json: string;
}

export interface ApiGpsPoint {
  ROWID: string;
  vehicle_id: string;
  lat: number;
  lng: number;
  speed_kph: number;
  recorded_at: string;
}

export function listVehicles(status?: string, date?: string): Promise<ApiVehicle[]> {
  return api.get<ApiVehicle[]>("/vehicles", { status, date });
}

export function triggerFleetPoll(): Promise<{ status: string; vehicle_updates?: number }> {
  return api.post<{ status: string; vehicle_updates?: number }>("/poll-now");
}

export function refreshVehicles(force = true): Promise<ApiVehicle[]> {
  return api.post<ApiVehicle[]>("/vehicles/refresh", undefined, { force: force ? 1 : 0 });
}

export function getVehicle(rowid: string): Promise<ApiVehicle> {
  return api.get<ApiVehicle>(`/vehicles/${rowid}`);
}

export function getVehicleTrail(rowid: string, limit = 50): Promise<ApiGpsPoint[]> {
  return api.get<ApiGpsPoint[]>(`/vehicles/${rowid}/trail`, { limit });
}

export function postVehiclePosition(
  rowid: string,
  position: { lat: number; lng: number; heading: number; speedKph: number },
): Promise<ApiVehicle> {
  return api.post<ApiVehicle>(`/vehicles/${rowid}/position`, position);
}

export function listGeofences(): Promise<ApiGeofence[]> {
  return api.get<ApiGeofence[]>("/geofences");
}

export function listDrivers(): Promise<ApiDriver[]> {
  return api.get<ApiDriver[]>("/drivers");
}
