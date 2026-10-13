export type OrderType = "SO" | "TO" | "PO";

/** Badge classes + order-number text colour per order type. PO is reserved (not used yet). */
export const ORDER_TYPE_STYLE: Record<OrderType, { label: string; color: string; badge: string }> = {
  SO: { label: "SO", color: "#C00000", badge: "border-[#C00000] bg-[#FDECEC] text-[#C00000]" },
  TO: { label: "TO", color: "#2E7D32", badge: "border-[#2E7D32] bg-[#E8F5E9] text-[#2E7D32]" },
  PO: { label: "PO", color: "#1F4E9E", badge: "border-[#1F4E9E] bg-[#E8EEF9] text-[#1F4E9E]" },
};

export function normalizeOrderType(value: unknown): OrderType {
  const v = typeof value === "string" ? value.trim().toUpperCase() : "";
  return v === "TO" || v === "PO" ? v : "SO";
}

export function orderTypeColor(value: unknown): string {
  return ORDER_TYPE_STYLE[normalizeOrderType(value)].color;
}

/** Row id for a transfer order is `TO:<zoho id>`; also honours an explicit order_type. */
export function orderTypeOfRow(row: { id?: string | null; order_type?: unknown }): OrderType {
  if (row.order_type) return normalizeOrderType(row.order_type);
  return typeof row.id === "string" && row.id.startsWith("TO:") ? "TO" : "SO";
}

/** Only sales orders require an invoice/DR number at check-out; TO/PO use the order number as reference. */
export function requiresInvoice(orderType: unknown): boolean {
  return normalizeOrderType(orderType) === "SO";
}
