type Product = {
  line_item_id?: string | null;
  item_id?: string | null;
  name?: string | null;
  sku?: string | null;
  quantity?: number | null;
  unit?: string | null;
  total_weight_kg?: number | null;
  mets_qty_available_for_sale?: number | null;
  glacier_qty_available_for_sale?: number | null;
};

type OrderWithProducts = {
  products?: Product[];
  mets_qty_available_for_sale?: number | null;
  glacier_qty_available_for_sale?: number | null;
};

function text(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

export function lineProduct(order: OrderWithProducts, item: any, index?: number): Product | null | undefined {
  const itemId = text(item?.item_id ?? item?.itemid ?? item?.item?.item_id ?? item?.item?.id);
  const lineItemId = text(item?.line_item_id);
  const sku = text(item?.sku);
  const products = order.products ?? [];
  const matched = products.find((entry) => {
    const entryLineItemId = text(entry.line_item_id);
    const entryItemId = text(entry.item_id);
    const entrySku = text(entry.sku);
    return (
      (entryLineItemId && lineItemId && entryLineItemId === lineItemId) ||
      (entryItemId && itemId && entryItemId === itemId) ||
      (entrySku && sku && entrySku === sku)
    );
  });
  if (matched) return matched;
  const hasLineIdentity = Boolean(lineItemId || itemId || sku);
  if (hasLineIdentity) return null;
  return index !== undefined ? products[index] : undefined;
}

export function lineProductName(product: Product | null | undefined, item: any): string {
  return product?.name || item?.name || item?.item_description || item?.description || "Details unavailable";
}

export function lineStock(order: OrderWithProducts, product: Product | null | undefined, site: "mets" | "glacier") {
  const key = site === "mets" ? "mets_qty_available_for_sale" : "glacier_qty_available_for_sale";
  return product?.[key] ?? null;
}
