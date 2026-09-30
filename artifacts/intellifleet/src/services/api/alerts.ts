import { api } from "./client";

export interface ApiAlert {
  ROWID: string;
  CREATEDTIME: string;
  type: string;
  severity: string;
  vehicle_id: string;
  order_id: string;
  message: string;
  status: string;
  resolved_at: string | null;
}

export function listAlerts(filters: { status?: string; severity?: string } = {}): Promise<ApiAlert[]> {
  return api.get<ApiAlert[]>("/alerts", filters);
}

export function acknowledgeAlert(rowid: string, actorId?: string): Promise<ApiAlert> {
  return api.post<ApiAlert>(`/alerts/${rowid}/acknowledge`, { actorId });
}

export function escalateAlert(
  rowid: string,
  options: { actorId?: string; escalatedToUserId?: string; note?: string } = {},
): Promise<ApiAlert> {
  return api.post<ApiAlert>(`/alerts/${rowid}/escalate`, options);
}

export function resolveAlert(rowid: string, options: { actorId?: string; note?: string } = {}): Promise<ApiAlert> {
  return api.post<ApiAlert>(`/alerts/${rowid}/resolve`, options);
}
