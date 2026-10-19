import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFailure, errorInfo } from "./tripErrors.ts";

test("HTTP client status zero is a network failure and must stay queued", () => {
  const error = { status: 0, body: null, message: "No connection" };
  assert.equal(errorInfo(error).network, true);
  assert.equal(classifyFailure(error).kind, "network");
  assert.equal(classifyFailure({ status: 422, message: "Invalid", body: { detail: "Invalid" } }).kind, "needs_attention");
});
