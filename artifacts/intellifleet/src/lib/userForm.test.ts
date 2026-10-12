import assert from "node:assert/strict";
import { test } from "node:test";
import { CREATABLE_ROLES, needsStaffLink, showInviteActions, staffOptionsFor, validateNewUser } from "./userForm.ts";

const staff = [
  { id: 9, name: "Emert", title: "MC RIDER", role: "DRIVER", active: true },
  { id: 10, name: "Ben", title: "Driver", active: true },
  { id: 17, name: "Raymond", title: "HELPER", active: true },
  { id: 18, name: "Gone", title: "HELPER", active: false },
  { id: 30, name: "Office", title: "Dispatcher", active: true },
];

test("admin is never creatable", () => {
  assert.ok(!CREATABLE_ROLES.some((r) => (r.value as string) === "admin"));
  assert.equal(CREATABLE_ROLES.length, 6);
});

test("staff picker filters by role and hides linked staff", () => {
  assert.deepEqual(staffOptionsFor("driver", staff, []).map((s) => s.id), [9, 10]);
  assert.deepEqual(staffOptionsFor("driver", staff, ["9"]).map((s) => s.id), [10]);
  assert.deepEqual(staffOptionsFor("helper", staff, [null, undefined]).map((s) => s.id), [17]);
  assert.deepEqual(staffOptionsFor("planner", staff, []), []);
  assert.ok(needsStaffLink("helper") && !needsStaffLink("logistics_officer"));
});

test("invite actions show for driver, helper and logistics officer only", () => {
  for (const r of ["driver", "helper", "Logistics_Officer"]) assert.ok(showInviteActions(r));
  for (const r of ["admin", "dispatcher", "planner", "warehouse", "client", null]) assert.ok(!showInviteActions(r));
});

test("new user validation", () => {
  assert.deepEqual(validateNewUser({ full_name: "Ana Cruz", email: "ana@x.com", phone: "", role: "helper", password: "long-enough" }), []);
  assert.equal(validateNewUser({ full_name: "", email: "bad", phone: "", role: "admin" }).length, 3);
  assert.ok(validateNewUser({ full_name: "Ana Cruz", email: "ana@x.com", phone: "", role: "helper", password: "short" }).includes("Password must be at least 8 characters."));
});
