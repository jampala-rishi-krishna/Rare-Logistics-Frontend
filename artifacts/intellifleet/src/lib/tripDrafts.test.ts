import assert from "node:assert/strict";
import { test } from "node:test";
import { clearDraft, draftKey, loadDraft, mergeValues, readFormDraft, readHandoverDraft, saveDraft, serializeValues } from "./tripDrafts.ts";
import type { DraftStore } from "./tripDrafts.ts";

function memStore(): DraftStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

test("draftKey is stable and distinguishes screens, orders and templates", () => {
  assert.equal(draftKey("ack", "b1", "5", 2), "if-draft:ack:b1:5:2");
  assert.notEqual(draftKey("ack", "b1", "5", 2), draftKey("ack", "b1", "5", 3));
  assert.equal(draftKey("handover", "b1", null, null), "if-draft:handover:b1:-:-");
});

test("serializeValues drops files and undefined", () => {
  const out = serializeValues({ a: "x", b: true, c: 3, d: null, e: undefined, f: { blob: new Blob(["x"]), filename: "p.jpg" } });
  assert.deepEqual(out, { a: "x", b: true, c: 3, d: null });
});

test("mergeValues restores known same-typed keys, never locked or file keys", () => {
  const initial = { outcome: "", received_by: "Ana", agreed: false, photo: "" };
  const merged = mergeValues(initial, { outcome: "Failed", received_by: "Hacker", agreed: true, photo: 7, extra: "no" }, new Set(["received_by"]));
  assert.deepEqual(merged, { outcome: "Failed", received_by: "Ana", agreed: true, photo: "" });
  assert.deepEqual(mergeValues(initial, null), initial);
  assert.deepEqual(mergeValues(initial, ["x"]), initial);
  assert.deepEqual(mergeValues(initial, { agreed: "yes" }), initial);
});

test("save/load/clear round trip and tolerate broken or missing storage", () => {
  const s = memStore();
  assert.equal(saveDraft(s, "k", { values: { a: "1" } }), true);
  assert.deepEqual(loadDraft(s, "k"), { values: { a: "1" } });
  clearDraft(s, "k");
  assert.equal(loadDraft(s, "k"), null);
  s.map.set("bad", "{not json");
  assert.equal(loadDraft(s, "bad"), null);
  assert.equal(saveDraft(null, "k", 1), false);
  assert.equal(loadDraft(null, "k"), null);
  clearDraft(null, "k");
  const throwing: DraftStore = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(saveDraft(throwing, "k", 1), false);
  assert.equal(loadDraft(throwing, "k"), null);
  assert.doesNotThrow(() => clearDraft(throwing, "k"));
});

test("readFormDraft validates shape", () => {
  assert.equal(readFormDraft(null), null);
  assert.equal(readFormDraft({ values: [] }), null);
  assert.deepEqual(readFormDraft({ values: { a: "1" }, notes: { a: "n", b: 3 }, general_note: "g" }), { values: { a: "1" }, notes: { a: "n" }, general_note: "g" });
});

test("readHandoverDraft keeps only rows of the batch and valid types", () => {
  const d = readHandoverDraft({ rows: { "1": { handed_over: false, note: "lost" }, "9": { handed_over: true, note: "" }, "2": { handed_over: "x", note: 4 } }, officer_id: 7, note: "n" }, ["1", "2"]);
  assert.deepEqual(d, { rows: { "1": { handed_over: false, note: "lost" }, "2": { handed_over: null, note: "" } }, officer_id: 7, note: "n" });
  assert.equal(readHandoverDraft("x", ["1"]), null);
  assert.equal(readHandoverDraft({ officer_id: "7" }, ["1"])?.officer_id, null);
});
