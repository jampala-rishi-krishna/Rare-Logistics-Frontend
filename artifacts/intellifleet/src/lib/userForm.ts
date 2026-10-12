// Pure helpers for the Admin > Users "Add user" form.

export const CREATABLE_ROLES = [
  { value: "logistics_officer", label: "Logistics officer" },
  { value: "driver", label: "Driver" },
  { value: "helper", label: "Helper" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "planner", label: "Planner" },
  { value: "warehouse", label: "Warehouse" },
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
  active: boolean;
}

// Staff offered in the picker: right title for the role, active, and not already linked to a user.
export function staffOptionsFor(role: string, staff: readonly StaffLike[], linkedStaffIds: ReadonlyArray<number | string | null | undefined>): StaffLike[] {
  if (!needsStaffLink(role)) return [];
  const wanted = role === "driver" ? /driver/i : /helper/i;
  const linked = new Set(linkedStaffIds.filter((v) => v !== null && v !== undefined).map(String));
  return staff.filter((s) => s.active && wanted.test(s.title ?? "") && !linked.has(String(s.id)));
}

export function validateNewUser(form: { full_name: string; email: string; phone: string; role: string }): string[] {
  const errors: string[] = [];
  if (form.full_name.trim().length < 2) errors.push("Full name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.push("A valid email is required.");
  if (!CREATABLE_ROLES.some((r) => r.value === form.role)) errors.push("Choose a role.");
  return errors;
}
