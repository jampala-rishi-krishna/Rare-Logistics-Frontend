import assert from "node:assert/strict";
import test from "node:test";
import { alertTabs, isImportant } from "./alerts.ts";

const a = (type: string, priority: string, read: boolean) => ({ key: `${type}:${priority}:${read}`, type, priority, read, title: "", body: "", at: null, link: "/driver/today" }) as never;

test("tabs split the same list: all, unread, important", () => {
  const list = [a("assigned", "normal", false), a("changed", "high", true), a("validated", "high", false), a("issue", "normal", true)];
  const tabs = alertTabs(list);
  assert.equal(tabs.all.length, 4);
  assert.equal(tabs.unread.length, 2);
  assert.deepEqual(tabs.important.map((x) => x.type), ["changed", "validated"]);
});

test("a normal new assignment is not flagged important", () => {
  assert.equal(isImportant({ type: "assigned", priority: "normal" }), false);
  assert.equal(isImportant({ type: "issue", priority: "urgent" }), true);
});
