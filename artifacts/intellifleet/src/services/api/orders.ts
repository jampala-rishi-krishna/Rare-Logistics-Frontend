import { api } from "./client";

export interface ApiOrder {
  id?: number | string;
  ROWID?: string;
  customer_id: string;
  route_id: string;
  vehicle_id: string;
  status: string;
  eta_window_start: string | null;
  eta_window_end: string | null;
  cargo_temp_c: number;
  shipment_weight: number | null;
  shipment_weight_unit: string | null;
  service_time_min: number | null;
}

export interface ApiOrderEvent {
  ROWID: string;
  order_id: string;
  event_type: string;
  event_time: string;
  notes: string;
}

export interface ApiDeliveryProof {
  ROWID: string;
  order_id: string;
  photo_url: string;
  signature_ref: string;
  recipient_name: string;
  captured_at: string;
}

export function listOrders(customerId?: string): Promise<ApiOrder[]> {
  return api.get<ApiOrder[]>("/orders", { customerId });
}

// Real ZCQL lookup by ROWID on the backend - 404s if the id doesn't exist,
// never falls back to a sample record. Always pass the exact ROWID string.
export function getOrder(rowid: string): Promise<ApiOrder> {
  return api.get<ApiOrder>(`/orders/${rowid}`);
}

export function postOrderEvent(rowid: string, eventType: string, notes?: string): Promise<ApiOrderEvent> {
  return api.post<ApiOrderEvent>(`/orders/${rowid}/events`, { eventType, notes });
}

export function postOrderProof(
  rowid: string,
  file: File,
  meta: { recipientName?: string; signatureRef?: string } = {},
): Promise<ApiDeliveryProof> {
  const form = new FormData();
  form.append("file", file);
  if (meta.recipientName) form.append("recipientName", meta.recipientName);
  if (meta.signatureRef) form.append("signatureRef", meta.signatureRef);
  return api.postForm<ApiDeliveryProof>(`/orders/${rowid}/proof`, form);
}
