import { api } from "./client";

export interface ApiUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  mustChangePassword?: boolean;
}

export interface LoginResult {
  user: ApiUser;
  token: string;
}

// Accounts are pre-provisioned in the backend users table.
export function login(email: string, password: string): Promise<LoginResult> {
  // A sign-in request should fail clearly if the backend is stopped or blocked,
  // rather than leaving the login screen in a permanent loading state.
  return api.post<LoginResult>("/auth/login", { email, password }, undefined, 12000);
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
