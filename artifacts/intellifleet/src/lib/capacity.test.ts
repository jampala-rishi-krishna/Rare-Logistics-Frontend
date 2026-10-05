import assert from "node:assert/strict";
import { test } from "node:test";
import { capacityOverage, loadOverage } from "./capacity.ts";

test("over capacity is flagged with kg and percent of capacity", () => {
  const over = capacityOverage(1250, 1000, 1000)!;
  assert.equal(over.overKg, 250);
  assert.equal(over.percent, 25);
  assert.equal(over.text, "Over capacity by 250 kg (25%)");
});

test("the existing load counts: 400 kg onto a truck with 200 kg left is 200 kg over", () => {
  assert.equal(capacityOverage(400, 200, 1000)!.text, "Over capacity by 200 kg (20%)");
});

test("under capacity is not flagged", () => {
  assert.equal(capacityOverage(400, 500, 1000), null);
});

test("exactly at capacity is not flagged", () => {
  assert.equal(capacityOverage(1000, 1000, 1000), null);
  assert.equal(capacityOverage(200, 200, 1000), null);
});

test("unknown weight (null) is never over capacity", () => {
  assert.equal(capacityOverage(null, 100, 1000), null);
  assert.equal(capacityOverage(undefined, 100, 1000), null);
});

test("an unrated truck (no capacity) is never over capacity", () => {
  assert.equal(capacityOverage(5000, null, null), null);
});

test("loadOverage flags an already overloaded truck and not one at its limit", () => {
  assert.equal(loadOverage(1100, 1000)!.text, "Over capacity by 100 kg (10%)");
  assert.equal(loadOverage(1000, 1000), null);
  assert.equal(loadOverage(500, null), null);
});
