// Pure helpers for the Admin > Users "Add user" form.

export const CREATABLE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "planner", label: "Planner" },
  { value: "driver", label: "Driver" },
  { value: "sales", label: "Sales" },
  { value: "wet_market", label: "Wet Market" },
  { value: "helper", label: "Helper" },
  { value: "logistics_officer", label: "Logistics Officer" },
] as const;

export type CreatableRoleValue = (typeof CREATABLE_ROLES)[number]["value"];

// Roles whose account is linked to a staff record (and which get the invite/reset/disable buttons).
export const STAFF_LINKED_ROLES: readonly string[] = ["driver", "helper"];
export const INVITE_ACTION_ROLES: readonly string[] = ["driver", "helper", "logistics_officer"];

export function showInviteActions(role: string | null | undefined): boolean {
  return INVITE_ACTION_ROLES.includes((role ?? "").toLowerCase());
}

export function needsStaffLink(role: string): boolean {
  return STAFF_LINKED_ROLES.includes(role);
}

export interface StaffLike {
  id: number | string;
  name: string;
  title: string | null;
  role?: string | null;
  warehouse?: string | null;
  email?: string | null;
  phone?: string | null;
  active: boolean;
}

// Staff offered in the picker: right title for the role, active, and not already linked to a user.
export function staffOptionsFor(role: string, staff: readonly StaffLike[], linkedStaffIds: ReadonlyArray<number | string | null | undefined>): StaffLike[] {
  if (!needsStaffLink(role)) return [];
  const linked = new Set(linkedStaffIds.filter((v) => v !== null && v !== undefined).map(String));
  return staff.filter((s) => {
    if (!s.active || linked.has(String(s.id))) return false;
    const staffRole = (s.role ?? "").toLowerCase();
    const title = (s.title ?? "").toLowerCase();
    if (role === "helper") return staffRole === "helper" || title.includes("helper");
    return staffRole === "driver" || title.includes("driver") || title.includes("rider");
  });
}

export function validateNewUser(form: { full_name: string; email: string; phone: string; role: string; password?: string }): string[] {
  const errors: string[] = [];
  if (form.full_name.trim().length < 2) errors.push("Full name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.push("A valid email is required.");
  if (!CREATABLE_ROLES.some((r) => r.value === form.role)) errors.push("Choose a role.");
  if ((form.password ?? "").trim() && (form.password ?? "").length < 8) errors.push("Password must be at least 8 characters.");
  return errors;
}

// ---- Staff record picker (GET /api/admin/staff-options?role=driver|helper) ----

export interface StaffOption {
  staff_id: number | string;
  name: string;
  role?: string | null;
  phone?: string | null;
  linked_user_id?: number | string | null;
}

export interface StaffPickerEntry {
  value: string;
  label: string;
  disabled: boolean;
}

// Name + phone; a record that already has a login is shown but cannot be picked.
export function staffPickerEntries(options: readonly StaffOption[]): StaffPickerEntry[] {
  return options.map((o) => {
    const linked = o.linked_user_id !== null && o.linked_user_id !== undefined && o.linked_user_id !== "";
    return {
      value: String(o.staff_id),
      label: `${o.name} · ${o.phone || "No phone"}${linked ? " · already has a login" : ""}`,
      disabled: linked,
    };
  });
}

// Driver and helper logins must be linked to a free staff record; null = OK.
export function staffRecordError(role: string, staffId: string, options: readonly StaffOption[]): string | null {
  if (!needsStaffLink(role)) return null;
  if (!staffId) return "Choose a staff record.";
  const chosen = options.find((o) => String(o.staff_id) === staffId);
  if (!chosen) return "Choose a staff record.";
  if (chosen.linked_user_id !== null && chosen.linked_user_id !== undefined && chosen.linked_user_id !== "") return "That staff record already has a login.";
  return null;
}
