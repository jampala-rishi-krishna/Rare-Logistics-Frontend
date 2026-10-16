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

export type InviteState = "none" | "pending" | "expired" | "used";

export interface ApiUser {
  id: number | string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: "active" | "disabled" | null;
  staff_id: number | string | null;
  must_change_password: boolean;
  invite_state: InviteState;
  is_manager?: boolean;
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

export type InvitePurpose = "invite" | "reset";

export function createInviteLink(userId: number | string, purpose: InvitePurpose): Promise<{ link: string; expires_at: string }> {
  return api.post<{ link: string; expires_at: string }>(`/api/admin/users/${encodeURIComponent(String(userId))}/invite-link`, { purpose });
}

// Emails a real person: callers must confirm with the admin first.
export function sendInvite(userId: number | string, purpose: InvitePurpose): Promise<{ sent: true; to: string; expires_at: string }> {
  return api.post<{ sent: true; to: string; expires_at: string }>(`/api/admin/users/${encodeURIComponent(String(userId))}/send-invite`, { purpose });
}

export function setUserStatus(userId: number | string, status: "active" | "disabled"): Promise<{ ok: true }> {
  return api.post<{ ok: true }>(`/api/admin/users/${encodeURIComponent(String(userId))}/status`, { status });
}

export function setManager(userId: string | number, is_manager: boolean): Promise<{ok: boolean}> {
  return api.patch(`/api/admin/users/${encodeURIComponent(String(userId))}/manager`, {is_manager});
}

export function listRoles(): Promise<ApiRole[]> {
  return api.get<ApiRole[]>("/roles");
}

export interface ZohoUsageHealth {
  zoho_calls_today: number;
  instance_id?: string;
  process_started_at?: string;
  usage_restored_from_db?: { restored: boolean; total: number; error?: string | null };
  zoho_usage: {
    date: string;
    timezone: string;
    budget: number;
    org_limit: number;
    by_feature: Record<string, number>;
    by_source: { request: number; background: number };
    token_refresh: number;
    unflushed: number;
    percent_used: number;
    guard: string;
    scope?: string;
  };
}

export function getZohoUsage(): Promise<ZohoUsageHealth> {
  return api.get<ZohoUsageHealth>("/api/admin/zoho-usage");
}

export type CreatableRole = "admin" | "planner" | "driver" | "sales" | "wet_market" | "helper" | "logistics_officer";

export interface CreateUserBody {
  full_name: string;
  email: string;
  phone: string | null;
  role: CreatableRole;
  staff_id?: number | string;
  password?: string;
  send_login_email?: boolean;
}

// Creates the account only; sending the invite is a separate, confirmed step (sendInvite / createInviteLink).
export async function createUser(body: CreateUserBody): Promise<ApiUser> {
  const res = await api.post<ApiUser | { user: ApiUser }>("/api/admin/users", body);
  return "user" in (res as object) ? (res as { user: ApiUser }).user : (res as ApiUser);
}

// Staff records a driver / helper login can be linked to (n8n Staff Directory via the backend cache).
export async function getStaffOptions(role: "driver" | "helper"): Promise<import("@/lib/userForm").StaffOption[]> {
  const res = await api.get<import("@/lib/userForm").StaffOption[] | { options?: import("@/lib/userForm").StaffOption[]; staff?: import("@/lib/userForm").StaffOption[] }>("/api/admin/staff-options", { role });
  if (Array.isArray(res)) return res;
  return res?.options ?? res?.staff ?? [];
}

// Admin > Settings: whitelisted non-secret settings (Neon table app_settings; env stays the fallback).
export type { AdminSetting } from "@/lib/settingsForm";

export function listSettings(): Promise<{ settings: import("@/lib/settingsForm").AdminSetting[] }> {
  return api.get("/api/admin/settings");
}

export function saveSetting(key: string, value: string | number): Promise<import("@/lib/settingsForm").AdminSetting> {
  return api.put(`/api/admin/settings/${encodeURIComponent(key)}`, { value });
}

export function resetSetting(key: string): Promise<import("@/lib/settingsForm").AdminSetting> {
  return api.delete(`/api/admin/settings/${encodeURIComponent(key)}`);
}
