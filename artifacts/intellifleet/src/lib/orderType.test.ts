import test from "node:test";
import assert from "node:assert/strict";
import { ORDER_TYPE_STYLE, normalizeOrderType, orderTypeColor, orderTypeOfRow, requiresInvoice } from "./orderType.ts";

test("colour tokens", () => {
  assert.equal(ORDER_TYPE_STYLE.SO.color, "#C00000");
  assert.equal(ORDER_TYPE_STYLE.TO.color, "#2E7D32");
  assert.equal(ORDER_TYPE_STYLE.PO.color, "#1F4E9E");
});

test("normalize defaults to SO", () => {
  assert.equal(normalizeOrderType(undefined), "SO");
  assert.equal(normalizeOrderType("to"), "TO");
  assert.equal(normalizeOrderType("weird"), "SO");
  assert.equal(orderTypeColor("TO"), "#2E7D32");
});

test("row type from explicit field or TO: id prefix", () => {
  assert.equal(orderTypeOfRow({ id: "TO:123" }), "TO");
  assert.equal(orderTypeOfRow({ id: "123" }), "SO");
  assert.equal(orderTypeOfRow({ id: "TO:1", order_type: "SO" }), "SO");
});

test("only SO requires an invoice", () => {
  assert.equal(requiresInvoice("SO"), true);
  assert.equal(requiresInvoice(undefined), true);
  assert.equal(requiresInvoice("TO"), false);
  assert.equal(requiresInvoice("PO"), false);
});
