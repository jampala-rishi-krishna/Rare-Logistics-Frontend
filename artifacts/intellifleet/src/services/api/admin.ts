import { api } from "./client";

export interface ApiAuditLogEntry {
  ROWID: string;
  actor_id: string;
  action: string;
  target_entity: string;
  target_id: string;
  event_time: string;
  details_json: string | null;
}

export type IntegrationState = "not_connected" | "sandbox" | "live";

export interface ApiIntegration {
  ROWID: string;
  provider: string;
  state: IntegrationState;
  last_checked: string;
}

export function listAuditLog(filters: { targetEntity?: string; actorId?: string } = {}): Promise<ApiAuditLogEntry[]> {
  return api.get<ApiAuditLogEntry[]>("/audit-log", filters);
}

export function listIntegrations(): Promise<ApiIntegration[]> {
  return api.get<ApiIntegration[]>("/integrations");
}

// Just flips the mocked state label - no real provider connection happens.
export function patchIntegration(provider: string, state: IntegrationState): Promise<ApiIntegration> {
  return api.patch<ApiIntegration>(`/integrations/${provider}`, { state });
}

export interface ApiUser {
  ROWID: string;
  full_name: string;
  email: string;
  phone: number;
  role: string;
  status: string;
  profile_photo_url: string | null;
}

export interface ApiRole {
  ROWID: string;
  name: string;
  permissions_json: string | null;
  description: string | null;
}

// The backend gates every admin route to role 'admin'.
export function listUsers(): Promise<ApiUser[]> {
  return api.get<ApiUser[]>("/users");
}

export function listRoles(): Promise<ApiRole[]> {
  return api.get<ApiRole[]>("/roles");
}
