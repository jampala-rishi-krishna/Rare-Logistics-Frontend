import assert from "node:assert/strict";
import test from "node:test";
import { distanceMeters, formatMeters, gpsReason, matchesSearch, outcomeColor, plateKey, sortHardCopies } from "./overviewView.ts";

const row = { name: "Alex Driver", vehicle: "TRK-1001", so_numbers: ["SO26-18408", "SO26-18428"] };

test("search by driver, plate or SO number (punctuation-insensitive)", () => {
  assert.equal(matchesSearch(row, ""), true);
  assert.equal(matchesSearch(row, "alex"), true);
  assert.equal(matchesSearch(row, "trk1001"), true);
  assert.equal(matchesSearch(row, "SO26-18428"), true);
  assert.equal(matchesSearch(row, "so2618428"), true);
  assert.equal(matchesSearch(row, "zzz"), false);
});

test("plate keys ignore case and spaces", () => assert.equal(plateKey(" dcd 8954 "), "DCD8954"));

test("distance between two points", () => {
  const d = distanceMeters({ lat: 14.5995, lng: 120.9842 }, { lat: 14.6095, lng: 120.9842 });
  assert.ok(d > 1100 && d < 1120, String(d));
  assert.equal(formatMeters(85.4), "85 m");
  assert.equal(formatMeters(1530), "1.5 km");
  assert.equal(formatMeters(null), "\u2014");
});

test("a denied location is explained, not hidden", () => {
  assert.equal(gpsReason({ reason: "denied" }), "location permission denied");
  assert.equal(gpsReason({ reason: null }), null);
});

test("hard copies: problems first, oldest first", () => {
  const sorted = sortHardCopies([
    { state: "with_driver", since: "2026-10-13T08:00" },
    { state: "missing", since: "2026-10-12T10:00" },
    { state: "with_driver", since: "2026-10-13T07:00" },
    { state: "with_officer", since: "2026-10-13T06:00" },
  ]);
  assert.deepEqual(sorted.map((r) => `${r.state}@${r.since}`), ["missing@2026-10-12T10:00", "with_officer@2026-10-13T06:00", "with_driver@2026-10-13T07:00", "with_driver@2026-10-13T08:00"]);
});

test("outcome colours", () => {
  assert.equal(outcomeColor("Delivered"), "#1e7b44");
  assert.equal(outcomeColor("Failed / Returned"), "#c4291f");
  assert.equal(outcomeColor(null), "#55565a");
});
