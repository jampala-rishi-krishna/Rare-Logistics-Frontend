import { test } from "node:test";
import assert from "node:assert/strict";
import type { TemplateItem } from "./tripTypes.ts";
import { buildCancelAnswers, cancelSubmitEnabled, emptyCancelForm, isCancelledOutcome, validateCancel, CANCELLED_OUTCOME } from "./cancelDelivery.ts";
import { outcomeChipText, outcomeKey } from "./overviewModel.ts";

const item = (key: string, item_type: string, required: boolean, extra: Partial<TemplateItem> = {}): TemplateItem =>
  ({ id: key.length, key, label: key, item_type, required, position: key.length, options: null, show_when: null, prefill: null, ...extra }) as unknown as TemplateItem;

const ITEMS: TemplateItem[] = [
  item("invoice_dr_number", "numeric_text", true),
  item("outcome", "radio", true, { options: ["Delivered", "Partially delivered", "Failed"] }),
  item("reason", "textarea", true, { show_when: { key: "outcome", in: ["Partially delivered", "Failed"] } }),
  item("delivery_photo", "photo", true, { show_when: { key: "outcome", in: ["Delivered", "Partially delivered"] } }),
];
const photo = { blob: new Blob(["x"]), filename: "proof.jpg", upload_key: "up-cancel-1" };

test("cancel needs who asked, a name, a reason and a proof photo; submit disabled until the photo is attached", () => {
  const form = emptyCancelForm();
  assert.equal(cancelSubmitEnabled(form), false);
  const errs = validateCancel(ITEMS, { invoice_dr_number: "123" }, form);
  assert.deepEqual(Object.keys(errs).sort(), ["cancel_proof", "cancel_requested_by", "cancel_requester_name", "reason"]);
  const withoutPhoto = { ...form, requestedBy: "customer" as const, name: "Ana", reason: "Customer changed mind" };
  assert.deepEqual(Object.keys(validateCancel(ITEMS, { invoice_dr_number: "123" }, withoutPhoto)), ["cancel_proof"]);
  const ready = { ...withoutPhoto, photo };
  assert.equal(cancelSubmitEnabled(ready), true);
  assert.deepEqual(validateCancel(ITEMS, { invoice_dr_number: "123" }, ready), {});  // the delivery photo is not asked for a cancel
});

test("cancel answers: outcome cancelled_by_request + details + the proof photo queued like other proof photos", () => {
  const form = { requestedBy: "sales_agent" as const, name: " Mark ", reason: "Order cancelled by sales", note: "re-order", photo };
  const built = buildCancelAnswers(ITEMS, { invoice_dr_number: "123", outcome: "", reason: "" }, form, () => "new-key");
  assert.deepEqual(built.answers, { invoice_dr_number: "123", outcome: CANCELLED_OUTCOME, cancel_requested_by: "sales_agent", cancel_requester_name: "Mark", reason: "Order cancelled by sales", cancel_note: "re-order", cancel_proof: null });
  assert.deepEqual(built.blobs.map((b) => [b.field_key, b.upload_key]), [["cancel_proof", "up-cancel-1"]]);
});

test("cancelled shows as Cancelled and counts as not delivered", () => {
  assert.equal(isCancelledOutcome("cancelled_by_request"), true);
  assert.equal(outcomeKey("cancelled_by_request"), "failed");
  assert.equal(outcomeChipText("cancelled_by_request"), "Cancelled");
});
