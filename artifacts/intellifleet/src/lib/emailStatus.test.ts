import test from "node:test";
import assert from "node:assert/strict";
import { emailStatusView, panelHeading, sendOptions, shouldPollStatus } from "./emailStatus.ts";

test("a fresh assignment shows 'Not sent' with a Send button and no Retry", () => {
  const view = emailStatusView("not_sent");
  assert.deepEqual(view, { tone: "not_sent", label: "Not sent", spinner: false, canSend: true, canRetry: false });
});

test("only 'not_sent' offers Send and only 'failed' offers Retry", () => {
  for (const status of ["queued", "sent", "skipped"]) {
    const view = emailStatusView(status)!;
    assert.equal(view.canSend, false, status);
    assert.equal(view.canRetry, false, status);
  }
  assert.equal(emailStatusView("failed")!.canRetry, true);
  assert.equal(emailStatusView("failed")!.canSend, false);
});

test("real statuses keep their labels and queued spins", () => {
  assert.equal(emailStatusView("sent")!.label, "Email sent");
  assert.equal(emailStatusView("failed")!.label, "Email failed");
  assert.equal(emailStatusView("skipped")!.label, "Email skipped");
  assert.deepEqual([emailStatusView("queued")!.label, emailStatusView("queued")!.spinner], ["Email sending…", true]);
});

test("no status shows nothing, an unknown status is shown as-is without actions", () => {
  assert.equal(emailStatusView(null), null);
  assert.equal(emailStatusView(undefined), null);
  const odd = emailStatusView("mystery")!;
  assert.equal(odd.label, "mystery");
  assert.equal(odd.canSend, false);
  assert.equal(odd.canRetry, false);
});

test("the first Send is not a resend (so WhatsApp/SMS/voice go out); later sends are resends", () => {
  assert.deepEqual(sendOptions(true), { resend: false });
  assert.deepEqual(sendOptions(false), { resend: true });
});

test("the panel waits for a person while not_sent and only polls while Gmail has not answered", () => {
  assert.equal(shouldPollStatus("not_sent"), false);
  assert.equal(shouldPollStatus("sent"), false);
  assert.equal(shouldPollStatus("failed"), false);
  assert.equal(shouldPollStatus("queued"), true);
  assert.equal(shouldPollStatus(null), true);
  assert.equal(panelHeading("not_sent"), "Assignment saved - email not sent yet");
  assert.equal(panelHeading("queued"), "Sending assignment email…");
  assert.equal(panelHeading(null), "Sending assignment email…");
});
