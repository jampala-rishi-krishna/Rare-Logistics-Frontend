import assert from "node:assert/strict";
import { test } from "node:test";
import { alreadyDoneNotice, crewCalls, doneByParts, normalizeCrew, toggleSingleHelper, viewerRoleOf } from "./crewCalls.ts";
import { staffPickerEntries, staffRecordError } from "./userForm.ts";

const crew = normalizeCrew({
  driver: { staff_id: 9, name: "Emert", phone: "09170000009" },
  helpers: [
    { staff_id: 17, name: "Bryan", phone: "09170000017" },
    { staff_id: 18, name: "Ana", phone: null },
  ],
});

test("helper viewer: Call driver with the driver's phone, plus the other helper", () => {
  const calls = crewCalls(crew, "helper", [17]);
  assert.deepEqual(
    calls.map((c) => [c.kind, c.name, c.phone]),
    [
      ["call_driver", "Emert", "09170000009"],
      ["call_helper", "Ana", null],
    ],
  );
});

test("driver viewer: calls the helper(s), never the driver", () => {
  const one = normalizeCrew({ driver: { staff_id: 9, name: "Emert", phone: "1" }, helpers: [{ staff_id: 17, name: "Bryan", phone: "2" }] });
  assert.deepEqual(crewCalls(one, "driver", [9]).map((c) => [c.kind, c.name]), [["call_helper", "Bryan"]]);
});

test("helper viewer with unknown id and a single helper does not call themself", () => {
  const one = normalizeCrew({ driver: { staff_id: 9, name: "Emert", phone: "1" }, helpers: [{ staff_id: 17, name: "Bryan", phone: "2" }] });
  assert.deepEqual(crewCalls(one, "helper", []).map((c) => c.kind), ["call_driver"]);
});

test("normalizeCrew accepts the older array shape and the helpers fallback", () => {
  const old = normalizeCrew([
    { id: 9, name: "Emert", role: "driver", phone: "1" },
    { id: 17, name: "Bryan", role: "helper", phone: null },
  ]);
  assert.equal(old.driver?.name, "Emert");
  assert.deepEqual(old.helpers.map((h) => h.name), ["Bryan"]);
  const fallback = normalizeCrew(undefined, [{ id: 17, name: "Bryan", phone: null }]);
  assert.equal(fallback.driver, null);
  assert.equal(fallback.helpers.length, 1);
});

test("viewer role: viewer_role wins, then role, default helper", () => {
  assert.equal(viewerRoleOf({ viewer_role: "driver", role: "helper" }), "driver");
  assert.equal(viewerRoleOf({ role: "driver" }), "driver");
  assert.equal(viewerRoleOf(null, { viewer_role: "helper" }), "helper");
  assert.equal(viewerRoleOf(undefined), "helper");
});

test("already_done notice text", () => {
  assert.equal(alreadyDoneNotice({ already_done: true, done_by: "Bryan" }), "Already done by Bryan");
  assert.equal(alreadyDoneNotice({ already_done: true, done_by: { name: "Ana" } }), "Already done by Ana");
  assert.equal(alreadyDoneNotice({ already_done: true, done_by: null }), "Already done");
  assert.equal(alreadyDoneNotice({ already_done: false, done_by: null }), null);
  assert.deepEqual(doneByParts({ name: "Ana", at: "2026-10-16T00:00:00Z" }), { name: "Ana", at: "2026-10-16T00:00:00Z" });
});

test("load planning: only one helper per truck", () => {
  assert.deepEqual(toggleSingleHelper([], 5), [5]);
  assert.deepEqual(toggleSingleHelper([5], 7), [7]);
  assert.deepEqual(toggleSingleHelper([7], 7), []);
});

test("staff record picker is required for driver / helper and blocks linked records", () => {
  const options = [
    { staff_id: 17, name: "Bryan", role: "helper", phone: "0917", linked_user_id: null },
    { staff_id: 18, name: "Ana", role: "helper", phone: null, linked_user_id: 44 },
  ];
  assert.deepEqual(staffPickerEntries(options), [
    { value: "17", label: "Bryan · 0917", disabled: false },
    { value: "18", label: "Ana · No phone · already has a login", disabled: true },
  ]);
  assert.equal(staffRecordError("helper", "", options), "Choose a staff record.");
  assert.equal(staffRecordError("driver", "99", options), "Choose a staff record.");
  assert.equal(staffRecordError("helper", "18", options), "That staff record already has a login.");
  assert.equal(staffRecordError("helper", "17", options), null);
  assert.equal(staffRecordError("planner", "", []), null);
});
