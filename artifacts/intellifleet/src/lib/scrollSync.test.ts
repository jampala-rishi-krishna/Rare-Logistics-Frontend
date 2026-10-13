import test from "node:test";
import assert from "node:assert/strict";
import { hasHorizontalOverflow, mirroredScrollLeft, topScrollbarWidth } from "./scrollSync.ts";

test("top scrollbar width equals the table's real scrollWidth (rounded up)", () => {
  assert.equal(topScrollbarWidth(2400, 1000), 2400);
  assert.equal(topScrollbarWidth(2400.4, 1000), 2401);
});

test("never narrower than the container and tolerates bad input", () => {
  assert.equal(topScrollbarWidth(500, 1000), 1000);
  assert.equal(topScrollbarWidth(Number.NaN, 800), 800);
  assert.equal(topScrollbarWidth(-5), 0);
});

test("overflow detection ignores sub-pixel differences", () => {
  assert.equal(hasHorizontalOverflow(1000, 1000), false);
  assert.equal(hasHorizontalOverflow(1001, 1000), false);
  assert.equal(hasHorizontalOverflow(1500, 1000), true);
});

test("mirrored scrollLeft reaches the far right and is clamped", () => {
  assert.equal(mirroredScrollLeft(1400, 2400, 1000), 1400);
  assert.equal(mirroredScrollLeft(5000, 2400, 1000), 1400);
  assert.equal(mirroredScrollLeft(-3, 2400, 1000), 0);
});
