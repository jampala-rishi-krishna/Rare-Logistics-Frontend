import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blockedLine,
  confirmLine,
  confirmRequiredOrders,
  dialogTitle,
  planUnassign,
  proceedLabel,
  skippedText,
  type UnassignPreviewOrder,
} from "./unassignConfirm.ts";

const row = (over: Partial<UnassignPreviewOrder> & { id: string }): UnassignPreviewOrder => ({
  number: over.id.toUpperCase(),
  order_type: "SO",
  state: "assigned",
  needs_confirm: false,
  blocked: false,
  reason: null,
  message: `${over.id.toUpperCase()}: assigned`,
  ...over,
});

const acked = row({ id: "so1", number: "SO26-18449", state: "acknowledged", needs_confirm: true, message: "SO26-18449: acknowledged by Albert Atienza at 13:20" });
const started = row({ id: "so2", number: "SO26-18450", state: "checked_in", needs_confirm: true, message: "Trip started 13:24, stop checked in" });
const delivered = row({ id: "so3", number: "SO26-18451", state: "delivered", blocked: true, reason: "already delivered (checked out 14:10)" });
const plain = row({ id: "so4" });

test("nothing in progress or delivered keeps the current flow (no extra dialog)", () => {
  assert.deepEqual(planUnassign(["so4", "so5"], [plain]), { kind: "proceed", ids: ["so4", "so5"] });
  assert.deepEqual(planUnassign(["so4"], []), { kind: "proceed", ids: ["so4"] });
});

test("acknowledged / started orders need one confirmation listing each message", () => {
  const plan = planUnassign(["so1", "so2", "so4"], [acked, started, plain]);
  assert.equal(plan.kind, "dialog");
  if (plan.kind !== "dialog") return;
  assert.deepEqual(plan.ids, ["so1", "so2", "so4"]);
  assert.equal(plan.needsConfirm, true);
  assert.deepEqual(plan.confirmRows.map(confirmLine), ["SO26-18449: acknowledged by Albert Atienza at 13:20", "Trip started 13:24, stop checked in"]);
  assert.equal(proceedLabel(plan), "Unassign anyway");
  assert.equal(dialogTitle(plan), "2 orders are already in progress");
});

test("delivered orders are shown as blocked and excluded from the unassign", () => {
  const plan = planUnassign(["so1", "so3", "so4"], [acked, delivered, plain]);
  assert.equal(plan.kind, "dialog");
  if (plan.kind !== "dialog") return;
  assert.deepEqual(plan.ids, ["so1", "so4"]);
  assert.deepEqual(plan.blockedRows.map(blockedLine), ["SO26-18451: can't be unassigned - already delivered (checked out 14:10)"]);
  assert.equal(plan.needsConfirm, true);
});

test("only blocked + plain orders: dialog, but no confirm flag; button names the rest", () => {
  const plan = planUnassign(["so3", "so4"], [delivered, plain]);
  assert.equal(plan.kind, "dialog");
  if (plan.kind !== "dialog") return;
  assert.equal(plan.needsConfirm, false);
  assert.deepEqual(plan.ids, ["so4"]);
  assert.equal(proceedLabel(plan), "Unassign 1 other");
  assert.equal(dialogTitle(plan), "Some orders can't be unassigned");
});

test("single unassign of a blocked order: reason only, nothing to unassign (Close)", () => {
  const plan = planUnassign(["so3"], [delivered]);
  assert.equal(plan.kind, "dialog");
  if (plan.kind !== "dialog") return;
  assert.deepEqual(plan.ids, []);
  assert.equal(proceedLabel(plan), null);
  assert.equal(dialogTitle(plan), "This order can't be unassigned");
});

test("a blocked row that also says needs_confirm is only blocked", () => {
  const plan = planUnassign(["so3"], [{ ...delivered, needs_confirm: true }]);
  assert.equal(plan.kind === "dialog" && plan.confirmRows.length, 0);
});

test("lines fall back when the backend sends no message / reason", () => {
  assert.equal(confirmLine(row({ id: "x", number: "SO1", state: "trip_started", needs_confirm: true, message: "" })), "SO1: trip started");
  assert.equal(blockedLine(row({ id: "x", number: null, blocked: true, reason: null, message: "" })), "x: can't be unassigned - already delivered");
});

test("409 confirm_required from the unassign call yields the preview rows", () => {
  const err = { status: 409, body: { detail: { code: "confirm_required", message: "Confirm", orders: [acked] } } };
  assert.deepEqual(confirmRequiredOrders(err), [acked]);
  assert.equal(confirmRequiredOrders({ status: 409, body: { detail: { code: "delivered", message: "Delivered" } } }), null);
  assert.equal(confirmRequiredOrders({ status: 500, body: { detail: { code: "confirm_required", orders: [] } } }), null);
  assert.equal(confirmRequiredOrders(new Error("x")), null);
  assert.equal(confirmRequiredOrders(null), null);
});

test("skipped text lists each order with its reason", () => {
  assert.equal(skippedText([]), "");
  assert.equal(skippedText(undefined), "");
  assert.equal(skippedText([{ id: "a", reason: "delivered" }, { id: "b" }], (id) => id.toUpperCase()), " 2 not unassigned: A (delivered), B.");
});
