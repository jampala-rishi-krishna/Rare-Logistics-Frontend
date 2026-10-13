import { api } from "./client";

export interface ApiUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  mustChangePassword?: boolean;
  staffId?: number | string | null;
}

export interface LoginResult {
  user: ApiUser;
  token: string;
}

// Accounts are pre-provisioned in the backend users table. `identifier` is an email address
// or a Philippine mobile number; the backend normalises it.
export function login(identifier: string, password: string): Promise<LoginResult> {
  // A sign-in request should fail clearly if the backend is stopped or blocked,
  // rather than leaving the login screen in a permanent loading state.
  return api.post<LoginResult>("/auth/login", { identifier, password }, undefined, 12000);
}

export function logout(): Promise<{ ok: true }> {
  return api.post<{ ok: true }>("/auth/logout");
}

export function getSession(): Promise<{ user: ApiUser }> {
  return api.get<{ user: ApiUser }>("/auth/session");
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return api.post<{ ok: true }>("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

// Public: redeems an invite / reset link token. Never log the token.
export function setPassword(token: string, password: string): Promise<{ ok: true }> {
  return api.post<{ ok: true }>("/auth/set-password", { token, password });
}

// Public: the dispatcher number a locked-out driver can call (Forgot password). Password resets are links issued by dispatch / admin.
export function getSupport(): Promise<{ dispatch_phone: string | null }> {
  return api.get<{ dispatch_phone: string | null }>("/auth/support");
}
