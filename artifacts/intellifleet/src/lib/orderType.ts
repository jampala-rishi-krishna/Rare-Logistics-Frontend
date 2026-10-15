export type OrderType = "SO" | "WM" | "PO" | "TO";

export const ORDER_TYPES: OrderType[] = ["SO", "WM", "PO", "TO"];

/** Badge classes + order-number text colour per order type (SO red, WM purple, PO blue, TO green). */
export const ORDER_TYPE_STYLE: Record<OrderType, { label: string; title: string; color: string; badge: string }> = {
  SO: { label: "SO", title: "Sales Order", color: "#C00000", badge: "border-[#C00000] bg-[#FDECEC] text-[#C00000]" },
  WM: { label: "WM", title: "Wet Market Order", color: "#7C3AED", badge: "border-[#7C3AED] bg-[#F3EEFE] text-[#7C3AED]" },
  PO: { label: "PO", title: "Purchase Order", color: "#1F4E9E", badge: "border-[#1F4E9E] bg-[#E8EEF9] text-[#1F4E9E]" },
  TO: { label: "TO", title: "Transfer Order", color: "#2E7D32", badge: "border-[#2E7D32] bg-[#E8F5E9] text-[#2E7D32]" },
};

export function normalizeOrderType(value: unknown): OrderType {
  const v = typeof value === "string" ? value.trim().toUpperCase() : "";
  return v === "TO" || v === "PO" || v === "WM" ? v : "SO";
}

export function orderTypeColor(value: unknown): string {
  return ORDER_TYPE_STYLE[normalizeOrderType(value)].color;
}

/** Wet market sales orders are numbered "WM-SO..." (same Zoho list as SO). */
export function isWetMarketNumber(value: unknown): boolean {
  return typeof value === "string" && value.trim().toUpperCase().startsWith("WM-SO");
}

/** An explicit order_type wins (the backend already reads WM-SO numbers as WM); else the id prefix (`TO:` / `PO:`); else a WM-SO number; else SO. */
export function orderTypeOfRow(row: { id?: string | null; order_type?: unknown; salesorder_number?: string | null; so_number?: string | null }): OrderType {
  if (row.order_type) return normalizeOrderType(row.order_type);
  if (typeof row.id === "string" && row.id.startsWith("TO:")) return "TO";
  if (typeof row.id === "string" && row.id.startsWith("PO:")) return "PO";
  return isWetMarketNumber(row.salesorder_number ?? row.so_number) ? "WM" : "SO";
}

/** Sales orders (SO and WM) require an invoice/DR number at check-out; TO/PO use the order number as reference. */
export function requiresInvoice(orderType: unknown): boolean {
  const t = normalizeOrderType(orderType);
  return t === "SO" || t === "WM";
}

/** TO / PO: no Zoho sales-order drawer, no acknowledgement, no branch stock. */
export function isReferenceType(orderType: unknown): boolean {
  return !requiresInvoice(orderType);
}
