import assert from "node:assert/strict";
import test from "node:test";
import { effectiveOrderStatus, manilaHm, statusLabelWithTime, statusStyle } from "./statusColors.ts";
import { formatKg, roundKg } from "./kgDisplay.ts";
import { deriveOrderTimeline } from "./orderTimeline.ts";

test("every status gets its colour and label from the one helper", () => {
  const cases: [string, string, string][] = [
    ["shipped", "Shipped", "orange"],
    ["partially_delivered", "Partially delivered", "orange"],
    ["Partially delivered", "Partially delivered", "orange"],
    ["delivered", "Delivered", "green"],
    ["fulfilled", "Fulfilled", "green"],
    ["not_delivered", "Not delivered", "red"],
    ["Failed / Returned", "Not delivered", "red"],
    ["cancelled", "Cancelled", "red"],
    ["cancelled_by_request", "Cancelled", "red"],
    ["confirmed", "Confirmed", "neutral"],
    ["something new", "Something new", "neutral"],
    ["", "Unknown", "neutral"],
  ];
  for (const [raw, label, tone] of cases) {
    const s = statusStyle(raw);
    assert.equal(s.label, label, raw);
    assert.equal(s.tone, tone, raw);
    assert.equal(s.className, `status-tone-${tone}`);
    assert.match(s.color, /^hsl\(var\(--/);
  }
});

test("check-out time (Manila) shows next to final statuses only", () => {
  assert.equal(manilaHm("2026-10-21T02:31:00Z"), "10:31");
  assert.equal(manilaHm("2026-10-21 02:31:00"), "10:31");
  assert.equal(manilaHm(null), null);
  assert.equal(statusLabelWithTime("delivered", "2026-10-21T02:31:00Z"), "Delivered · 10:31");
  assert.equal(statusLabelWithTime("partially_delivered", "2026-10-21T02:31:00Z"), "Partially delivered · 10:31");
  assert.equal(statusLabelWithTime("fulfilled", "2026-10-21T02:31:00Z"), "Fulfilled · 10:31");
  assert.equal(statusLabelWithTime("not_delivered", "2026-10-21T02:31:00Z"), "Not delivered · 10:31");
  assert.equal(statusLabelWithTime("shipped", "2026-10-21T02:31:00Z"), "Shipped");
  assert.equal(statusLabelWithTime("delivered", null), "Delivered");
});

test("helper-app outcome wins over Zoho status", () => {
  assert.equal(effectiveOrderStatus({ stopOutcome: "cancelled_by_request", orderStatus: "confirmed" }), "cancelled_by_request");
  assert.equal(effectiveOrderStatus({ orderStatus: "fulfilled" }), "fulfilled");
  assert.equal(effectiveOrderStatus({ orderStatus: "confirmed", shipmentStatus: "shipped" }), "shipped");
});

test("kg values round to max 2 decimals", () => {
  assert.equal(formatKg(49.41999999999999), "49.42 kg");
  assert.equal(formatKg(1234.5), "1,234.5 kg");
  assert.equal(formatKg(10), "10 kg");
  assert.equal(formatKg(1.005), "1.01 kg");
  assert.equal(formatKg(null), "—");
  assert.equal(formatKg(2.345, { unit: false }), "2.35");
  assert.equal(roundKg(49.41999999999999), 49.42);
});

const at = "2026-10-21T02:31:00Z";
const states = (t: ReturnType<typeof deriveOrderTimeline>) => t.steps.map((s) => s.state).join(",");

test("timeline: fulfilled SO reaches the final step (green)", () => {
  const t = deriveOrderTimeline({ orderStatus: "fulfilled", checkoutAt: at });
  assert.equal(t.reached, 3);
  assert.equal(states(t), "done,done,done,done");
  assert.equal(t.steps[3].title, "Fulfilled");
  assert.equal(t.steps[3].tone, "green");
  assert.equal(t.steps[3].time, "10:31");
});

test("timeline: shipped stops on Shipped (orange, current)", () => {
  const t = deriveOrderTimeline({ orderStatus: "confirmed", shipmentStatus: "shipped" });
  assert.equal(t.reached, 2);
  assert.equal(states(t), "done,done,current,todo");
  assert.equal(t.steps[2].tone, "orange");
  assert.equal(t.fill, 2 / 3);
});

test("timeline: partially delivered is an orange Delivered step", () => {
  const t = deriveOrderTimeline({ orderStatus: "confirmed", stopOutcome: "Partially delivered", checkoutAt: at });
  assert.equal(t.steps[3].title, "Partially delivered");
  assert.equal(t.steps[3].tone, "orange");
  assert.equal(t.steps[3].detail, "Partially delivered · 10:31");
});

test("timeline: delivered via helper app uses the check-out time", () => {
  const t = deriveOrderTimeline({ orderStatus: "confirmed", stopOutcome: "Delivered", checkoutAt: at });
  assert.equal(t.steps[3].title, "Delivered");
  assert.equal(t.steps[3].tone, "green");
  assert.equal(t.steps[3].time, "10:31");
  assert.equal(t.fill, 1);
});

test("timeline: delivered via Zoho packages", () => {
  assert.equal(deriveOrderTimeline({ orderStatus: "confirmed", packageStatuses: ["delivered", "delivered"] }).steps[3].title, "Delivered");
  assert.equal(deriveOrderTimeline({ orderStatus: "confirmed", packageStatuses: ["delivered", "shipped"] }).steps[3].title, "Partially delivered");
  assert.equal(deriveOrderTimeline({ orderStatus: "confirmed", packageStatuses: ["shipped"], deliveryStatus: "Partially delivered" }).reached, 2);
});

test("timeline: not delivered and cancelled are red", () => {
  const nd = deriveOrderTimeline({ orderStatus: "confirmed", stopOutcome: "Failed / Returned", checkoutAt: at });
  assert.equal(nd.steps[3].title, "Not delivered");
  assert.equal(nd.steps[3].tone, "red");
  const c = deriveOrderTimeline({ orderStatus: "confirmed", stopOutcome: "cancelled_by_request" });
  assert.equal(c.steps[3].title, "Cancelled");
  assert.equal(c.steps[3].tone, "red");
});

test("timeline: confirmed only and draft", () => {
  assert.equal(states(deriveOrderTimeline({ orderStatus: "confirmed" })), "done,current,todo,todo");
  assert.equal(states(deriveOrderTimeline({ orderStatus: "draft" })), "current,todo,todo,todo");
});

test("crew email label and tooltip", async () => {
  const { crewEmailLabel, CREW_EMAIL_TOOLTIP } = await import("./emailStatus.ts");
  assert.equal(crewEmailLabel("not_sent"), "Crew email: Not sent");
  assert.equal(crewEmailLabel("sent", "2026-10-21T02:12:00Z"), "Crew email: Sent 10:12");
  assert.equal(crewEmailLabel("sent", null), "Crew email: Sent");
  assert.equal(crewEmailLabel("failed"), "Crew email: Failed");
  assert.equal(CREW_EMAIL_TOOLTIP, "Sends the assignment email to the driver and helper");
});

test("Order Tracker 'Partly delivered' is orange through the shared helper", () => {
  assert.equal(statusStyle("Partly delivered").tone, "orange");
});
