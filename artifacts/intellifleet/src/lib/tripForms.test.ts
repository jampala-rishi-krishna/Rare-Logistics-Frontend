import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ackReady,
  buildAckAnswers,
  buildCheckoutAnswers,
  buildHandoverItems,
  initialAckForm,
  initialCheckoutForm,
  isItemRequired,
  isItemVisible,
  mapServerErrors,
  usableItems,
  validateAck,
  validateCheckout,
  validateHandover,
} from "./tripForms.ts";
import type { TemplateItem } from "./tripTypes.ts";

let pos = 0;
function item(key: string, item_type: string, extra: Partial<TemplateItem> = {}): TemplateItem {
  pos += 1;
  return { id: pos, key, label: key, item_type, required: false, options: null, prefill: null, show_when: null, position: pos, ...extra };
}

const outcomeOptions = ["Delivered", "Partially delivered", "Failed", "Returned"];
function checkoutItems(): TemplateItem[] {
  pos = 0;
  return [
    item("outcome", "dropdown", { required: true, options: outcomeOptions }),
    item("received_by", "text", { required: true, prefill: "contact_person" }),
    item("reason", "textarea", { show_when: { key: "outcome", in: ["Partially delivered", "Failed", "Returned"] } }),
    item("short_qty", "number", { required: true, show_when: { key: "outcome", in: ["Partially delivered"] } }),
    item("delivery_photo", "photo", { required: true }),
    item("signature", "signature"),
    item("paid", "checkbox"),
  ];
}
const file = { blob: new Blob(["x"]), filename: "a.jpg" };

test("photo/signature items are hidden entirely when storage is disabled", () => {
  const items = checkoutItems();
  assert.deepEqual(usableItems(items, false).map((i) => i.key), ["outcome", "received_by", "reason", "short_qty", "paid"]);
  assert.equal(usableItems(items, true).length, items.length);
});

test("show_when visibility and conditional required", () => {
  const items = checkoutItems();
  const byKey = (k: string) => items.find((i) => i.key === k)!;
  const base = { outcome: "Delivered" };
  assert.equal(isItemVisible(byKey("short_qty"), items, base), false);
  assert.equal(isItemRequired(byKey("short_qty"), items, base), false);
  const partial = { outcome: "Partially delivered" };
  assert.equal(isItemVisible(byKey("short_qty"), items, partial), true);
  assert.equal(isItemRequired(byKey("short_qty"), items, partial), true);
  // reason is required for every non-Delivered outcome even though the template says optional
  assert.equal(isItemRequired(byKey("reason"), items, partial), true);
  assert.equal(isItemRequired(byKey("reason"), items, { outcome: "Failed" }), true);
  assert.equal(isItemRequired(byKey("reason"), items, base), false);
});

test("show_when chains: a child of a hidden item is hidden; cycles/unknown keys are hidden", () => {
  pos = 0;
  const items = [item("a", "dropdown", { options: ["x", "y"] }), item("b", "text", { show_when: { key: "a", in: ["x"] } }), item("c", "text", { show_when: { key: "b", in: ["hello"] } }), item("d", "text", { show_when: { key: "nope", in: ["1"] } })];
  assert.equal(isItemVisible(items[2], items, { a: "y", b: "hello" }), false);
  assert.equal(isItemVisible(items[2], items, { a: "x", b: "hello" }), true);
  assert.equal(isItemVisible(items[3], items, {}), false);
  const cyc = [item("p", "text", { show_when: { key: "q", in: ["1"] } }), item("q", "text", { show_when: { key: "p", in: ["1"] } })];
  assert.equal(isItemVisible(cyc[0], cyc, { p: "1", q: "1" }), false);
});

test("prefill fills from the order, locks the field, and leaves others empty", () => {
  const items = checkoutItems();
  const { values, locked } = initialCheckoutForm(items, { checkout_prefill: { contact_person: "Ana", customer_name: "Zed" } });
  assert.equal(values.received_by, "Ana");
  assert.deepEqual([...locked], ["received_by"]);
  assert.equal(values.outcome, "");
  assert.equal(values.paid, false);
  const none = initialCheckoutForm(items, null);
  assert.equal(none.locked.size, 0);
  // falls back to the item key when item.prefill is not set
  pos = 0;
  const k = [item("customer_name", "text")];
  assert.equal(initialCheckoutForm(k, { checkout_prefill: { customer_name: "Zed" } }).values.customer_name, "Zed");
});

test("validateCheckout mirrors the server rules", () => {
  const items = checkoutItems();
  const empty = validateCheckout(items, initialCheckoutForm(items, null).values);
  assert.deepEqual(Object.keys(empty).sort(), ["delivery_photo", "outcome", "received_by"]);

  const ok = validateCheckout(items, { outcome: "Delivered", received_by: "Ana", delivery_photo: file, paid: false });
  assert.deepEqual(ok, {});

  const partial = validateCheckout(items, { outcome: "Partially delivered", received_by: "Ana", delivery_photo: file, short_qty: "", reason: "" });
  assert.deepEqual(Object.keys(partial).sort(), ["reason", "short_qty"]);

  const badNumber = validateCheckout(items, { outcome: "Partially delivered", received_by: "Ana", delivery_photo: file, short_qty: "abc", reason: "short" });
  assert.deepEqual(badNumber, { short_qty: "Enter a number" });

  const badOption = validateCheckout(items, { outcome: "Lost", received_by: "Ana", delivery_photo: file, reason: "x" });
  assert.deepEqual(badOption, { outcome: "Choose one of the options" });

  // with storage disabled the photo is not required (item list excludes it)
  const noPhoto = usableItems(items, false);
  assert.deepEqual(validateCheckout(noPhoto, { outcome: "Delivered", received_by: "Ana" }), {});
});

test("required checkbox must be ticked; whitespace-only text is empty", () => {
  pos = 0;
  const items = [item("agree", "checkbox", { required: true }), item("name", "text", { required: true })];
  assert.deepEqual(Object.keys(validateCheckout(items, { agree: false, name: "   " })).sort(), ["agree", "name"]);
  assert.deepEqual(validateCheckout(items, { agree: true, name: "x" }), {});
});

test("buildCheckoutAnswers: only visible fields, numbers parsed, blobs collected with upload keys", () => {
  const items = checkoutItems();
  let n = 0;
  const { answers, blobs } = buildCheckoutAnswers(items, { outcome: "Delivered", received_by: " Ana ", reason: "stale text", short_qty: "5", delivery_photo: file, signature: null, paid: true }, () => `u${++n}`);
  assert.deepEqual(answers, { outcome: "Delivered", received_by: "Ana", delivery_photo: null, paid: true });
  assert.equal(blobs.length, 1);
  assert.deepEqual([blobs[0].field_key, blobs[0].upload_key, blobs[0].filename], ["delivery_photo", "u1", "a.jpg"]);
  const partial = buildCheckoutAnswers(items, { outcome: "Partially delivered", received_by: "Ana", reason: "short", short_qty: "5", delivery_photo: file }, () => "u");
  assert.equal(partial.answers.short_qty, 5);
  assert.equal(partial.answers.reason, "short");
});

test("acknowledge checklist validation and answer building", () => {
  pos = 0;
  const items = [
    item("count_ok", "checkbox", { required: true }),
    item("packs", "count", { required: true }),
    item("pic", "photo"),
    item("remarks", "note"),
    item("extra", "checkbox", { required: true, show_when: { key: "remarks", in: ["check"] } }),
  ];
  const form = initialAckForm(items);
  assert.equal(ackReady(items, form.values), false);
  assert.deepEqual(Object.keys(validateAck(items, form.values)).sort(), ["count_ok", "packs"]);
  form.values.count_ok = true;
  form.values.packs = "-1";
  assert.deepEqual(validateAck(items, form.values), { packs: "Enter a count (0 or more)" });
  form.values.packs = "12";
  assert.equal(ackReady(items, form.values), true);
  form.values.pic = file;
  form.values.remarks = "short by 2";
  form.notes.packs = "2 packs short";
  form.general_note = " check chilled ";
  let n = 0;
  const built = buildAckAnswers(form, items, () => `u${++n}`);
  assert.deepEqual(built.answers, [
    { item_id: items[0].id, checked: true, count: null, text: null, photo_id: null, note: null },
    { item_id: items[1].id, checked: null, count: 12, text: null, photo_id: null, note: "2 packs short" },
    { item_id: items[2].id, checked: null, count: null, text: null, photo_id: null, note: null },
    { item_id: items[3].id, checked: null, count: null, text: "short by 2", photo_id: null, note: null },
  ]);
  assert.equal(built.blobs[0].field_key, `item:${items[2].id}`);
  assert.equal(built.discrepancy_note, "check chilled");
});

test("server 422 errors map to item keys, ids, and a general bucket", () => {
  const items = checkoutItems();
  const m = mapServerErrors([{ key: "reason", message: "Required" }, { key: String(items[0].id), message: "Bad" }, { key: "", message: "Something else" }], items);
  assert.deepEqual(m.fields, { reason: "Required", outcome: "Bad" });
  assert.deepEqual(m.general, ["Something else"]);
});

test("handover validation: explicit choice, note required for No, officer required", () => {
  const rows = [
    { so_id: "1", handed_over: true, note: "" },
    { so_id: "2", handed_over: false, note: " " },
    { so_id: "3", handed_over: null, note: "" },
  ];
  const v = validateHandover(rows, null);
  assert.deepEqual(v.rows, { "2": "Add a note explaining why not", "3": "Choose Yes or No" });
  assert.equal(v.officer, "Choose the logistics officer");
  assert.equal(v.ok, false);
  const good = [{ so_id: "1", handed_over: true, note: "" }, { so_id: "2", handed_over: false, note: "left at gate" }];
  assert.equal(validateHandover(good, 7).ok, true);
  assert.deepEqual(buildHandoverItems(good), [{ so_id: "1", handed_over: true, note: null }, { so_id: "2", handed_over: false, note: "left at gate" }]);
});

import { INVOICE_KEY } from "./tripForms.ts";

test("Invoice / DR number: digits only, kept as text, suggestion prefilled but editable", () => {
  const items = [
    { id: 1, key: INVOICE_KEY, label: "Invoice or DR Number", item_type: "numeric_text", required: true, options: null, prefill: null, show_when: null, position: 1 },
    { id: 2, key: "outcome", label: "Outcome", item_type: "radio", required: true, options: ["Delivered", "Failed"], prefill: null, show_when: null, position: 2 },
  ] as never;
  const initial = initialCheckoutForm(items, { checkout_prefill: null, invoice_hint: "000456" } as never);
  assert.equal(initial.values[INVOICE_KEY], "000456");
  assert.equal(initial.locked.has(INVOICE_KEY), false); // a suggestion, never locked
  assert.equal(initialCheckoutForm(items, { checkout_prefill: null } as never).values[INVOICE_KEY], "");
  const values = { [INVOICE_KEY]: "12A", outcome: "Delivered" };
  assert.deepEqual(validateCheckout(items, values), { [INVOICE_KEY]: "Digits only (0-9)" });
  assert.deepEqual(validateCheckout(items, { [INVOICE_KEY]: "", outcome: "Delivered" }), { [INVOICE_KEY]: "Required" });
  assert.deepEqual(validateCheckout(items, { [INVOICE_KEY]: "000123", outcome: "Delivered" }), {});
  assert.equal(buildCheckoutAnswers(items, { [INVOICE_KEY]: " 000123 ", outcome: "Delivered" }, () => "k").answers[INVOICE_KEY], "000123"); // string, zeros kept
});

import { blockedPhotoItems, submitLabelFor } from "./tripForms.ts";

test("proof of delivery: a missing photo is explained, never silently hidden; the button names the outcome", () => {
  const pod = { id: 20, key: "delivery_photo", label: "Proof of delivery photo", item_type: "photo", required: true, options: null, prefill: null, show_when: { key: "outcome", in: ["Delivered", "Partially delivered"] }, position: 4 };
  const outcome = { id: 21, key: "outcome", label: "Outcome", item_type: "radio", required: true, options: ["Delivered", "Failed"], prefill: null, show_when: null, position: 2 };
  const items = [outcome, pod] as never;
  assert.deepEqual(blockedPhotoItems(items, false, { outcome: "Delivered" }).map((i) => i.key), ["delivery_photo"]);
  assert.deepEqual(blockedPhotoItems(items, false, { outcome: "Failed" }), []); // not asked for a failed delivery
  assert.deepEqual(blockedPhotoItems(items, true, { outcome: "Delivered" }), []); // storage is configured: the field is simply shown
  assert.equal(validateCheckout(items, { outcome: "Delivered" })["delivery_photo"], "Take a photo first (proof of delivery is required)");
  assert.deepEqual(validateCheckout(items, { outcome: "Failed" }), {});
  assert.equal(submitLabelFor("Delivered"), "Mark as delivered");
  assert.equal(submitLabelFor("Partially delivered"), "Mark as partially delivered");
  assert.equal(submitLabelFor("Failed"), "Save departure");
  assert.equal(submitLabelFor(undefined), "Save departure");
});
