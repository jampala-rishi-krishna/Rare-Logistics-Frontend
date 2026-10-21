// Multi-warehouse sales orders: some SO lines are picked from METS and others from GLACIER. The server sends the line-level
// pickup warehouse (lines[].warehouse / products[].warehouse) and the order's distinct list (pickup_warehouses), from the
// cached Zoho SO line location only.

/** The order's pickup warehouses, from a payload that may not carry them yet (local narrow type: not on the shared order types). */
export function pickupWarehousesOf(order: unknown): string[] {
  const list = (order as { pickup_warehouses?: unknown } | null | undefined)?.pickup_warehouses;
  return Array.isArray(list) ? list.filter((w): w is string => typeof w === "string" && w.trim() !== "") : [];
}

/** "Pickup: METS + GLACIER" when an order is picked from more than one warehouse; null otherwise (nothing to flag). */
export function multiPickupLabel(order: unknown): string | null {
  const list = pickupWarehousesOf(order);
  return list.length > 1 ? `Pickup: ${list.join(" + ")}` : null;
}

export interface WarehouseGroup<L> {
  warehouse: string | null; // null = the line has no recorded location
  lines: L[];
}

const ORDER: Record<string, number> = { METS: 0, GLACIER: 1 };

/** Lines grouped by pickup warehouse (METS, GLACIER, other names, then lines without a location), keeping line order inside a group. */
export function groupLinesByWarehouse<L extends { warehouse?: string | null }>(lines: L[] | null | undefined): Array<WarehouseGroup<L>> {
  const groups = new Map<string | null, L[]>();
  for (const line of lines ?? []) {
    const key = line.warehouse && line.warehouse.trim() ? line.warehouse.trim() : null;
    const list = groups.get(key);
    if (list) list.push(line);
    else groups.set(key, [line]);
  }
  const rank = (w: string | null) => (w === null ? 3 : (ORDER[w] ?? 2));
  return [...groups.entries()]
    .map(([warehouse, ls]) => ({ warehouse, lines: ls }))
    .sort((a, b) => rank(a.warehouse) - rank(b.warehouse) || String(a.warehouse).localeCompare(String(b.warehouse)));
}

/** True when the lines come from more than one known warehouse (only then is grouping worth showing). */
export function isMultiWarehouse(lines: Array<{ warehouse?: string | null }> | null | undefined): boolean {
  return new Set((lines ?? []).map((l) => l.warehouse).filter(Boolean)).size > 1;
}
