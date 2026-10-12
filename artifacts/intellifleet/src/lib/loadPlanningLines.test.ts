import assert from "node:assert/strict";
import { test } from "node:test";
import { lineProduct, lineProductName, lineStock } from "./loadPlanningLines.ts";

test("SO26-18380 rows show Zoho stock for their matched SKU", () => {
  const order = {
    products: [
      { line_item_id: "4489499000272563433", item_id: "4489499000074842271", sku: "RGF-NF-0238", name: "Non-Food Styro Fishpac Body w/ Cover", mets_qty_available_for_sale: 177, glacier_qty_available_for_sale: 226 },
      { line_item_id: "4489499000272563434", item_id: "4489499000071561700", sku: "RGF-B401-1", name: "BEEF CHUCK ROLL MONDELLI SLICED 2.5MM 1KG", mets_qty_available_for_sale: 680.23, glacier_qty_available_for_sale: 6 },
      { line_item_id: "4489499000272563435", item_id: "4489499000071039493", sku: "RGF-C024", name: "CHICKEN LEG FILLET SKIN ON SEARA", mets_qty_available_for_sale: -552, glacier_qty_available_for_sale: 34 },
    ],
  };
  const lines = [
    { line_item_id: "4489499000272563433", item_id: "4489499000074842271", sku: "RGF-NF-0238" },
    { line_item_id: "4489499000272563434", item_id: "4489499000071561700", sku: "RGF-B401-1" },
    { line_item_id: "4489499000272563435", item_id: "4489499000071039493", sku: "RGF-C024" },
  ];
  const expected = [[177, 226], [680.23, 6], [-552, 34]];
  lines.forEach((line, index) => {
    const product = lineProduct(order, line, index);
    assert.equal(product?.sku, line.sku);
    assert.equal(lineStock(order, product, "mets"), expected[index][0]);
    assert.equal(lineStock(order, product, "glacier"), expected[index][1]);
  });
});

test("SO26-18379 keeps the distinct beef SKU stock matched to its own line", () => {
  const order = {
    products: [
      { line_item_id: "4489499000272563388", item_id: "4489499000074842271", sku: "RGF-NF-0238", mets_qty_available_for_sale: 177, glacier_qty_available_for_sale: 226 },
      { line_item_id: "4489499000272563389", item_id: "4489499000070724477", sku: "RGF-B041", mets_qty_available_for_sale: 8.265, glacier_qty_available_for_sale: -43.417 },
    ],
  };
  const line = { line_item_id: "4489499000272563389", item_id: "4489499000070724477", sku: "RGF-B041" };
  const product = lineProduct(order, line, 1);
  assert.equal(product?.sku, "RGF-B041");
  assert.equal(lineStock(order, product, "mets"), 8.265);
  assert.equal(lineStock(order, product, "glacier"), -43.417);
});

test("SO26-18441 shows the matched physical stock value, including negative, zero, and decimals", () => {
  const order = {
    mets_qty_available_for_sale: -13.14,
    products: [
      { line_item_id: "li-p059", item_id: "4489499000071564775", sku: "RGF-P059-2", mets_qty_available_for_sale: 196.48, glacier_qty_available_for_sale: 0 },
      { line_item_id: "li-p320", item_id: "4489499000239895407", sku: "RGF-P320", mets_qty_available_for_sale: 5.38, glacier_qty_available_for_sale: 0 },
    ],
  };
  const lines = [
    { line_item_id: "li-p059", item_id: "4489499000071564775", sku: "RGF-P059-2" },
    { line_item_id: "li-p320", item_id: "4489499000239895407", sku: "RGF-P320" },
  ];
  const expected = [[196.48, 0], [5.38, 0]];
  lines.forEach((line, index) => {
    const product = lineProduct(order, line, index);
    assert.equal(product?.sku, line.sku);
    assert.equal(lineStock(order, product, "mets"), expected[index][0]);
    assert.equal(lineStock(order, product, "glacier"), expected[index][1]);
  });
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
  assert.equal(lineStock(order, undefined, "mets"), null);
  assert.equal(lineStock(order, undefined, "glacier"), null);
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
