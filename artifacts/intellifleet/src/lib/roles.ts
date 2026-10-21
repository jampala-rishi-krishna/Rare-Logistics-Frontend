// Role -> home route and per-section access rules (pure, shared by Login, SetPassword, RoleGate, AppShell).

export const SECTION_ROLES = {
  driver: ["driver", "helper", "admin"],
  // Logistics officers validate invoices; dispatchers get a read-only view of the same screens.
  officer: ["logistics_officer", "admin", "dispatcher"],
  app: ["admin", "dispatcher", "planner", "warehouse", "sales", "wet_market"],
  // Planners use Driver Overview; Fleet Health stays admin-only.
  driverOverview: ["admin", "planner", "dispatcher"],
  fleetHealth: ["admin"],
  admin: ["admin"],
  warehouse: ["warehouse", "admin"],
  portal: ["client", "admin"],
} as const;

// Nav entries that only some roles of the /app section may see (href -> allowed roles).
export const NAV_ROLES: Record<string, readonly string[]> = {
  "/app/driver-overview": SECTION_ROLES.driverOverview,
  "/app/fleet-health": SECTION_ROLES.fleetHealth,
  "/app/order-tracker": ["admin", "planner", "dispatcher", "sales", "wet_market"],
};

// Roles that may open the officer screens but not act on them.
export const OFFICER_READ_ONLY_ROLES: readonly string[] = ["dispatcher"];

// Sales / Wet Market logins see only these tabs (read-only; the backend allows GETs for exactly these screens).
export const DEPARTMENT_TABS: readonly string[] = ["/app/tower", "/app/fleet", "/app/orders", "/app/order-tracker"];

export function canSeeNavItem(href: string, role: string | null | undefined): boolean {
  if (["sales", "wet_market"].includes((role ?? "").toLowerCase())) return DEPARTMENT_TABS.includes(href);
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
    case "sales":
    case "wet_market":
      return "/app/orders";
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
