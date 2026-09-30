import { api } from "./client";

// Table is "Warehouse" (capital W, singular) in the live Data Store, but that's
// a backend implementation detail - the route is the plural /warehouses.
export interface ApiWarehouse {
  ROWID: string;
  name: string;
  location: string;
  zone: string;
}

export interface ApiWarehouseEvent {
  ROWID: string;
  warehouse_id: string;
  event_type: string;
  manifest_id: string;
  status: string;
  event_time: string;
}

export function listWarehouses(): Promise<ApiWarehouse[]> {
  return api.get<ApiWarehouse[]>("/warehouses");
}

export function listWarehouseEvents(warehouseId?: string): Promise<ApiWarehouseEvent[]> {
  return api.get<ApiWarehouseEvent[]>("/warehouse-events", { warehouseId });
}

export function createWarehouseEvent(event: {
  warehouseId: string;
  eventType: string;
  manifestId?: string;
  status?: string;
}): Promise<ApiWarehouseEvent> {
  return api.post<ApiWarehouseEvent>("/warehouse-events", event);
}
