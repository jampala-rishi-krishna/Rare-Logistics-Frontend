import assert from "node:assert/strict";
import { test } from "node:test";
import { jpegFilename, scaledSize } from "./tripMedia.ts";

test("scaledSize caps the longest side at 1600 and keeps aspect ratio", () => {
  assert.deepEqual(scaledSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(scaledSize(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(scaledSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(scaledSize(0, 10), { width: 0, height: 0 });
  assert.deepEqual(scaledSize(10000, 1), { width: 1600, height: 1 });
});

test("jpegFilename", () => {
  assert.equal(jpegFilename("IMG 001.HEIC"), "IMG_001.jpg");
  assert.equal(jpegFilename(""), "photo.jpg");
});
