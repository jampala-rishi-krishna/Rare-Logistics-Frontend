import assert from "node:assert/strict";
import { test } from "node:test";
import { lineProduct, lineProductName, lineStock } from "./loadPlanningLines.ts";

test("multi-SKU sales order rows keep their own product name and available stock", () => {
  const order = {
    products: [
      { line_item_id: "li-1", item_id: "item-1", sku: "RGF-NF-0238", name: "Non-Food Styro", mets_qty_available_for_sale: 0, glacier_qty_available_for_sale: 0 },
      { line_item_id: "li-2", item_id: "item-2", sku: "RGF-B401-1", name: "Beef Chuck Roll", mets_qty_available_for_sale: 76, glacier_qty_available_for_sale: -43.42 },
      { line_item_id: "li-3", item_id: "item-3", sku: "RGF-C024", name: "Chicken Leg Fillet", mets_qty_available_for_sale: 34, glacier_qty_available_for_sale: 6 },
    ],
  };
  const beefLine = { line_item_id: "li-2", item_id: "item-2", sku: "RGF-B401-1", name: "Raw Beef Text" };
  const product = lineProduct(order, beefLine, 1);
  assert.equal(lineProductName(product, beefLine), "Beef Chuck Roll");
  assert.equal(lineStock(order, product, "mets"), 76);
  assert.equal(lineStock(order, product, "glacier"), -43.42);
});

test("identified rows do not fall back to combined order-level stock when product stock is missing", () => {
  const order = {
    mets_qty_available_for_sale: 0,
    glacier_qty_available_for_sale: -43.42,
    products: [{ line_item_id: "li-1", item_id: "item-1", sku: "SKU-1", name: "Known SKU", mets_qty_available_for_sale: 9, glacier_qty_available_for_sale: 4 }],
  };
  const missingProduct = lineProduct(order, { line_item_id: "li-2", item_id: "item-2", sku: "SKU-2", name: "Second SKU" }, 1);
  assert.equal(missingProduct, null);
  assert.equal(lineProductName(missingProduct, { name: "Second SKU" }), "Second SKU");
  assert.equal(lineStock(order, missingProduct, "mets"), null);
  assert.equal(lineStock(order, missingProduct, "glacier"), null);
});

test("a matched product with null stock stays null instead of using another SKU's order-level stock", () => {
  const order = {
    mets_qty_available_for_sale: 76,
    glacier_qty_available_for_sale: -43.42,
    products: [{ line_item_id: "li-1", item_id: "item-1", sku: "SKU-1", name: "Pending SKU", mets_qty_available_for_sale: null, glacier_qty_available_for_sale: null }],
  };
  const product = lineProduct(order, { line_item_id: "li-1", item_id: "item-1", sku: "SKU-1" }, 0);
  assert.equal(lineStock(order, product, "mets"), null);
  assert.equal(lineStock(order, product, "glacier"), null);
});
