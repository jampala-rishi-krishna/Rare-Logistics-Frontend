import test from "node:test";
import assert from "node:assert/strict";
import { ORDER_TYPES, ORDER_TYPE_STYLE, isReferenceType, isWetMarketNumber, normalizeOrderType, orderTypeColor, orderTypeOfRow, requiresInvoice } from "./orderType.ts";

test("colour tokens: SO red, WM purple, PO blue, TO green", () => {
  assert.equal(ORDER_TYPE_STYLE.SO.color, "#C00000");
  assert.equal(ORDER_TYPE_STYLE.WM.color, "#7C3AED");
  assert.equal(ORDER_TYPE_STYLE.PO.color, "#1F4E9E");
  assert.equal(ORDER_TYPE_STYLE.TO.color, "#2E7D32");
  assert.deepEqual(ORDER_TYPES, ["SO", "WM", "PO", "TO"]);
});

test("normalize defaults to SO", () => {
  assert.equal(normalizeOrderType(undefined), "SO");
  assert.equal(normalizeOrderType("to"), "TO");
  assert.equal(normalizeOrderType("wm"), "WM");
  assert.equal(normalizeOrderType("po"), "PO");
  assert.equal(normalizeOrderType("weird"), "SO");
  assert.equal(orderTypeColor("TO"), "#2E7D32");
  assert.equal(orderTypeColor("WM"), "#7C3AED");
});

test("row type from explicit field, TO:/PO: id prefix, or WM-SO number", () => {
  assert.equal(orderTypeOfRow({ id: "TO:123" }), "TO");
  assert.equal(orderTypeOfRow({ id: "PO:123" }), "PO");
  assert.equal(orderTypeOfRow({ id: "123" }), "SO");
  assert.equal(orderTypeOfRow({ id: "123", salesorder_number: "WM-SO26-00282" }), "WM");
  assert.equal(orderTypeOfRow({ id: "123", so_number: "wm-so26-00282" }), "WM");
  assert.equal(orderTypeOfRow({ id: "123", salesorder_number: "SS SO26-16612" }), "SO");
  assert.equal(orderTypeOfRow({ id: "TO:1", order_type: "SO" }), "SO");
  assert.equal(isWetMarketNumber("WM-SO26-1"), true);
  assert.equal(isWetMarketNumber("SO-WM"), false);
});

test("SO and WM require an invoice; TO and PO use their number as the reference", () => {
  assert.equal(requiresInvoice("SO"), true);
  assert.equal(requiresInvoice("WM"), true);
  assert.equal(requiresInvoice(undefined), true);
  assert.equal(requiresInvoice("TO"), false);
  assert.equal(requiresInvoice("PO"), false);
  assert.equal(isReferenceType("PO"), true);
  assert.equal(isReferenceType("WM"), false);
});
