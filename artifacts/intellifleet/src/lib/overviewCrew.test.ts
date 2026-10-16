import assert from "node:assert/strict";
import { test } from "node:test";
import { actorLine, crewList, groupByCrew, matchesCrewSearch, personWithRole, rowCrew } from "./overviewCrew.ts";

const a = { batch_id: "a", driver_id: 9, driver_name: "Emert", helpers: [{ staff_id: 17, name: "Bryan San. Antonio", phone: "0917" }] };
const b = { batch_id: "b", crew: { driver: { staff_id: 10, name: "Ben", phone: null }, helpers: [{ staff_id: 17, name: "Bryan San. Antonio", phone: "0917" }] } };
const c = { batch_id: "c", crew: [{ id: 11, name: "Carl", role: "driver", phone: null }] };
const d = { batch_id: "d", driver_name: "Dan", helpers: ["Old Helper"] };

test("rowCrew reads every server shape", () => {
  assert.equal(rowCrew(a).helpers[0].name, "Bryan San. Antonio");
  assert.equal(rowCrew(b).driver?.name, "Ben");
  assert.deepEqual(rowCrew(c).helpers, []);
  assert.equal(rowCrew(d).helpers[0].name, "Old Helper");
  assert.deepEqual(crewList(a).map((p) => p.role), ["driver", "helper"]);
});

test("board by helper groups trips under each helper, no-helper last", () => {
  const groups = groupByCrew([a, b, c, d], "helper");
  assert.deepEqual(
    groups.map((g) => [g.label, g.rows.map((r) => r.batch_id)]),
    [
      ["Bryan San. Antonio", ["a", "b"]],
      ["Old Helper", ["d"]],
      ["No helper", ["c"]],
    ],
  );
  assert.equal(groups[0].person?.phone, "0917");
  assert.deepEqual(groupByCrew([a, b], "driver").map((g) => g.label), ["Ben", "Emert"]);
});

test("search matches driver and helper names", () => {
  assert.ok(matchesCrewSearch(a, "bryan"));
  assert.ok(matchesCrewSearch(a, "emert"));
  assert.ok(!matchesCrewSearch(c, "bryan"));
  assert.ok(matchesCrewSearch(c, " "));
});

test("activity lines name the actor and role, never assuming driver", () => {
  assert.equal(actorLine("Acknowledged", { actor_name: "Bryan San. Antonio", actor_role: "helper" }, "07:42"), "Acknowledged by Bryan San. Antonio (Helper) · 07:42");
  assert.equal(actorLine("Trip started", { actor_name: "Ben" }, null), "Trip started by Ben");
  assert.equal(actorLine("Acknowledged", {}, "07:42"), null);
  assert.equal(personWithRole({ name: "Ana", role: "logistics_officer" }), "Ana (Logistics officer)");
  assert.equal(personWithRole(null), "");
});
