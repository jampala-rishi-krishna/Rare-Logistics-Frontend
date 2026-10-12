// Role -> home route and per-section access rules (pure, shared by Login, SetPassword, RoleGate, AppShell).

export const SECTION_ROLES = {
  driver: ["driver", "helper", "admin"],
  // Logistics officers validate invoices; dispatchers get a read-only view of the same screens.
  officer: ["logistics_officer", "admin", "dispatcher"],
  app: ["admin", "dispatcher", "planner", "warehouse"],
  // Driver Overview lives inside /app but is not for warehouse users.
  driverOverview: ["admin", "dispatcher", "planner"],
  admin: ["admin"],
  warehouse: ["warehouse", "admin", "dispatcher", "planner"],
  portal: ["client", "admin"],
} as const;

// Nav entries that only some roles of the /app section may see (href -> allowed roles).
export const NAV_ROLES: Record<string, readonly string[]> = {
  "/app/driver-overview": SECTION_ROLES.driverOverview,
};

// Roles that may open the officer screens but not act on them.
export const OFFICER_READ_ONLY_ROLES: readonly string[] = ["dispatcher"];

export function canSeeNavItem(href: string, role: string | null | undefined): boolean {
  const allowed = NAV_ROLES[href];
  if (!allowed) return true;
  return allowed.includes((role ?? "").toLowerCase());
}

export function filterNavGroups<T extends { items: ReadonlyArray<ReadonlyArray<unknown>> }>(
  groups: readonly T[],
  role: string | null | undefined,
): T[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => canSeeNavItem(String(item[0]), role)) }) as T)
    .filter((group) => group.items.length > 0);
}

export function isOfficerReadOnly(role: string | null | undefined): boolean {
  return OFFICER_READ_ONLY_ROLES.includes((role ?? "").toLowerCase());
}

export function isCrewRole(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "driver" || r === "helper";
}

export function routeForRole(role: string | null | undefined): string {
  switch ((role ?? "").toLowerCase()) {
    case "driver":
    case "helper":
      return "/driver/today";
    case "logistics_officer":
      return "/officer/pending";
    case "admin":
      return "/admin/users";
    case "warehouse":
      return "/warehouse/dashboard";
    case "client":
      return "/portal/orders";
    case "dispatcher":
    case "planner":
      return "/app/tower";
    default:
      // Unknown role: never guess a privileged area.
      return "/login";
  }
}

// Where to send a signed-in user who is not allowed in a section. Crew and officers always go to
// their own home; everyone else to their role home.
export function redirectForDisallowedRole(role: string | null | undefined): string {
  return routeForRole(role);
}

// Where to land after authentication: forced password change first, then the role home.
export function postLoginRoute(user: { role: string; mustChangePassword?: boolean }): string {
  return user.mustChangePassword ? "/set-password" : routeForRole(user.role);
}
