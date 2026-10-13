import assert from "node:assert/strict";
import test from "node:test";
import { formatKgPartial } from "./kgDisplay.ts";

test("a complete total is plain", () => {
  assert.deepEqual(formatKgPartial(354, 0), { text: "354 kg", note: null });
});

test("a partial total is a lower bound with a note, never complete", () => {
  assert.deepEqual(formatKgPartial(354, 1), { text: "354 kg+", note: "1 line without weight" });
  assert.deepEqual(formatKgPartial(1141.114, 3), { text: "1,141.1 kg+", note: "3 lines without weight" });
});

test("nothing known is a dash", () => {
  assert.deepEqual(formatKgPartial(0, 2), { text: "\u2014", note: "2 lines without weight" });
  assert.deepEqual(formatKgPartial(null, 0), { text: "\u2014", note: null });
});
