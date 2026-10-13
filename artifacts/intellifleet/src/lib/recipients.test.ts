import test from "node:test";
import assert from "node:assert/strict";
import { canSendEmail, isValidEmail, parseRecipients, removeRecipient, splitRecipientInput } from "./recipients.ts";

test("validates emails", () => {
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("first.last+x@sub.example.com"), true);
  assert.equal(isValidEmail("nope"), false);
  assert.equal(isValidEmail("a@b"), false);
  assert.equal(isValidEmail("a b@c.com"), false);
});

test("splits on comma, space, semicolon and newline", () => {
  assert.deepEqual(splitRecipientInput("a@x.com, b@x.com;c@x.com\nd@x.com  e@x.com"), ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"]);
});

test("parse separates valid, invalid and duplicate (case-insensitive)", () => {
  const r = parseRecipients("a@x.com B@x.com bad a@X.com", ["b@x.com"]);
  assert.deepEqual(r.added, ["a@x.com"]);
  assert.deepEqual(r.invalid, ["bad"]);
  assert.deepEqual(r.duplicates, ["B@x.com", "a@X.com"]);
});

test("remove and canSend", () => {
  assert.deepEqual(removeRecipient(["a@x.com", "b@x.com"], "a@x.com"), ["b@x.com"]);
  assert.equal(canSendEmail("mets", ["a@x.com"]), true);
  assert.equal(canSendEmail(null, ["a@x.com"]), false);
  assert.equal(canSendEmail("glacier", []), false);
  assert.equal(canSendEmail("other", ["a@x.com"]), false);
});
