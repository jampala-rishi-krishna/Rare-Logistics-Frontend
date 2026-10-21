import assert from "node:assert/strict";
import { test } from "node:test";
import { NAV_ROLES, SECTION_ROLES, canSeeNavItem, filterNavGroups, isOfficerReadOnly, postLoginRoute, redirectForDisallowedRole, routeForRole } from "./roles.ts";

test("Order Tracker navigation is limited to operations, Sales and Wet Market", () => {
  for (const role of ["admin", "planner", "dispatcher", "sales", "wet_market"]) assert.equal(canSeeNavItem("/app/order-tracker", role), true);
  for (const role of ["warehouse", "driver", "helper", "logistics_officer", "client"]) assert.equal(canSeeNavItem("/app/order-tracker", role), false);
});

test("role home routes", () => {
  assert.equal(routeForRole("driver"), "/driver/today");
  assert.equal(routeForRole("Admin"), "/admin/users");
  assert.equal(routeForRole("dispatcher"), "/app/tower");
  assert.equal(routeForRole("planner"), "/app/tower");
  assert.equal(routeForRole("warehouse"), "/warehouse/dashboard");
  assert.equal(routeForRole("client"), "/portal/orders");
  assert.equal(routeForRole("mystery"), "/login");
});

test("a driver outside the driver section always goes to driver today", () => {
  assert.equal(redirectForDisallowedRole("driver"), "/driver/today");
  assert.equal(redirectForDisallowedRole("client"), "/portal/orders");
  assert.equal(redirectForDisallowedRole("warehouse"), "/warehouse/dashboard");
});

test("must-change-password wins over role routing", () => {
  assert.equal(postLoginRoute({ role: "driver", mustChangePassword: true }), "/set-password");
  assert.equal(postLoginRoute({ role: "driver", mustChangePassword: false }), "/driver/today");
});

test("section rules", () => {
  assert.ok(!(SECTION_ROLES.app as readonly string[]).includes("driver"));
  assert.ok(!(SECTION_ROLES.admin as readonly string[]).includes("dispatcher"));
  assert.ok((SECTION_ROLES.portal as readonly string[]).includes("client"));
});

test("new roles: helper and logistics_officer", () => {
  assert.equal(routeForRole("helper"), "/driver/today");
  assert.equal(routeForRole("logistics_officer"), "/officer/pending");
  assert.equal(postLoginRoute({ role: "logistics_officer" }), "/officer/pending");
  assert.ok((SECTION_ROLES.driver as readonly string[]).includes("helper"));
  assert.ok(!(SECTION_ROLES.officer as readonly string[]).includes("driver"));
  assert.ok((SECTION_ROLES.officer as readonly string[]).includes("dispatcher"));
  assert.ok(!(SECTION_ROLES.app as readonly string[]).includes("helper"));
  assert.ok(!(SECTION_ROLES.app as readonly string[]).includes("logistics_officer"));
});

test("crew and officers outside their section go home", () => {
  assert.equal(redirectForDisallowedRole("helper"), "/driver/today");
  assert.equal(redirectForDisallowedRole("logistics_officer"), "/officer/pending");
  assert.equal(redirectForDisallowedRole("mystery"), "/login");
});

test("planner may use driver overview; fleet health is admin only", () => {
  const allowed = SECTION_ROLES.driverOverview as readonly string[];
  assert.deepEqual(allowed, ["admin", "planner", "dispatcher"]);
  for (const r of ["warehouse", "driver", "helper", "client", "logistics_officer"]) assert.ok(!allowed.includes(r));
  assert.deepEqual(SECTION_ROLES.fleetHealth as readonly string[], ["admin"]);
  assert.ok("/app/driver-overview" in NAV_ROLES);
  assert.ok("/app/fleet-health" in NAV_ROLES);
});

test("nav filtering hides admin-only operations from non-admin roles", () => {
  const groups = [
    { label: "Control", items: [["/app/tower", "Tower"], ["/app/fleet-health", "Fleet Health"]] as const },
    { label: "Execution", items: [["/app/orders", "Orders"], ["/app/driver-overview", "Driver Overview"]] as const },
  ];
  assert.ok(canSeeNavItem("/app/driver-overview", "Dispatcher"));
  assert.ok(!canSeeNavItem("/app/driver-overview", "warehouse"));
  assert.ok(!canSeeNavItem("/app/fleet-health", "planner"));
  assert.ok(canSeeNavItem("/app/tower", "warehouse"));
  const wh = filterNavGroups(groups, "warehouse");
  assert.deepEqual(wh[0].items.map((i) => i[0]), ["/app/tower"]);
  assert.deepEqual(wh[1].items.map((i) => i[0]), ["/app/orders"]);
  const admin = filterNavGroups(groups, "admin");
  assert.equal(admin[0].items.length, 2);
  assert.equal(admin[1].items.length, 2);
});

test("officer screens are read-only for dispatchers", () => {
  assert.ok(isOfficerReadOnly("dispatcher"));
  assert.ok(!isOfficerReadOnly("logistics_officer"));
  assert.ok(!isOfficerReadOnly("admin"));
});

test("sales and wet market see only Control Tower, Fleet, Orders and Order Tracker", () => {
  for (const role of ["sales", "wet_market"]) {
    for (const href of ["/app/tower", "/app/fleet", "/app/orders", "/app/order-tracker"]) assert.equal(canSeeNavItem(href, role), true, `${role} ${href}`);
    for (const href of ["/app/loads", "/app/routes", "/app/fleet-health", "/app/driver-overview", "/app/comms", "/app/reports"]) assert.equal(canSeeNavItem(href, role), false, `${role} ${href}`);
  }
});
