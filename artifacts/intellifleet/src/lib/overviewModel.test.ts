import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseUrlState,
  toSearch,
  rangeError,
  sortTrips,
  groupByDate,
  stepOf,
  railOf,
  photoCaption,
  stopPhotos,
  outcomeKey,
} from "./overviewModel.ts";
const today = "2026-10-15";
test("URL reload roundtrip preserves every filter and drawer target", () => {
  const q =
    "?from=2026-10-01&to=2026-10-15&wh=METS&q=SO-23&tile=attention&tab=issues&view=table&only=1&trip=batch-2&stop=so-23";
  const state = parseUrlState(q, today);
  assert.deepEqual(parseUrlState(toSearch(state, today), today), state);
  assert.equal(
    parseUrlState("?tile=bogus&wh=UNKNOWN&tab=bad", today).tab,
    "trips",
  );
});
test("inclusive 366 day range boundary", () => {
  assert.equal(rangeError("2025-10-15", "2026-10-15"), null);
  assert.match(rangeError("2025-10-14", "2026-10-15") ?? "", /366/);
  assert.match(rangeError("2026-10-16", today) ?? "", /before/);
});
test("one row per batch, attention first, crew trips stay separate", () => {
  const rows = [
    { batch_id: "a", vehicle: "A", state: "closed", date: today },
    { batch_id: "b", vehicle: "A", state: "ready", date: today },
    {
      batch_id: "c",
      vehicle: "Z",
      state: "on_trip",
      attention: [{ code: "far_checkin", label: "Far" }],
      date: "2026-10-14",
    },
  ];
  assert.deepEqual(
    sortTrips(rows).map((r) => r.batch_id),
    ["c", "b", "a"],
  );
  assert.equal(groupByDate(rows)[0].rows.length, 2);
});
test("three step rail includes legacy return and truthful outcome words", () => {
  assert.equal(stepOf({ batch_id: "a", state: "returned" }).step, 3);
  assert.equal(railOf({ batch_id: "a", state: "closed" }).closed, true);
  assert.equal(outcomeKey("returned_customer_absent"), "failed");
});
test("proof captions preserve Manila capture time and outcome", () => {
  assert.match(
    photoCaption({
      photo_id: 1,
      so_number: "SO-23",
      captured_at: "2026-10-15T05:42:00Z",
      kind: "partial",
    }),
    /SO-23.*15 Oct.*1:42.*Partial/,
  );
  assert.equal(
    stopPhotos({ so_number: "SO-23", photos: [{ photo_id: 4 }] }).length,
    1,
  );
});
test("Overview source uses dashboard tokens with no hex literals", () => {
  const dir = fileURLToPath(new URL("../pages/overview/", import.meta.url));
  for (const name of readdirSync(dir).filter((n) => /\.tsx?$/.test(n)))
    assert.doesNotMatch(
      readFileSync(`${dir}/${name}`, "utf8"),
      /#[0-9a-f]{3,8}\b/i,
      name,
    );
});
