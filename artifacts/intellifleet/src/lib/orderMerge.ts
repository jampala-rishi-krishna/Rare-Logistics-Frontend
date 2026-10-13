import { orderTypeOfRow, type OrderType } from "./orderType.ts";

/** Pure helpers for the combined SO + TO lists (Load Planning, Confirmed Orders). */

export type TypeFilter = "all" | "SO" | "TO";

type Row = {
  id: string;
  order_type?: unknown;
  expected_shipment_date?: string | null;
  salesorder_number?: string | null;
  products?: { total_weight_kg?: number | null }[] | null;
};

/** Merge SO and TO rows into one list: unique by id (a later list wins), sorted by date then order number. */
export function mergeOrders<T extends Row>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const order of list) byId.set(String(order.id), order);
  return Array.from(byId.values()).sort((a, b) => {
    const da = String(a.expected_shipment_date ?? "");
    const db = String(b.expected_shipment_date ?? "");
    if (da !== db) return da < db ? -1 : 1;
    return String(a.salesorder_number ?? a.id).localeCompare(String(b.salesorder_number ?? b.id), undefined, { numeric: true });
  });
}

export function filterByType<T extends Row>(orders: T[], filter: TypeFilter): T[] {
  if (filter === "all") return orders;
  return orders.filter((order) => orderTypeOfRow(order) === filter);
}

export function countByType(orders: Row[]): Record<OrderType, number> {
  const counts: Record<OrderType, number> = { SO: 0, TO: 0, PO: 0 };
  for (const order of orders) counts[orderTypeOfRow(order)] += 1;
  return counts;
}

/** "SO 3 / TO 2" (types with zero orders are left out). */
export function describeCounts(counts: { SO?: number; TO?: number; PO?: number }): string {
  return (["SO", "TO", "PO"] as const)
    .filter((type) => (counts[type] ?? 0) > 0)
    .map((type) => `${type} ${counts[type]}`)
    .join(" / ");
}

/** The `order_types` query value for the Confirmed Orders list. */
export function orderTypesParam(filter: TypeFilter): string {
  return filter === "all" ? "SO,TO" : filter;
}

/** Total kg of the known line weights, and how many lines have no weight yet. */
export function weightTotals(orders: Row[]): { total: number; unknown: number } {
  let total = 0;
  let unknown = 0;
  for (const order of orders) {
    for (const product of order.products ?? []) {
      if (product.total_weight_kg == null) unknown += 1;
      else total += Number(product.total_weight_kg);
    }
  }
  return { total, unknown };
}

/** Sort ids into the order they were selected from the list, dropping ids that are no longer present. */
export function idsStillPresent(selected: string[], orders: Row[]): string[] {
  const present = new Set(orders.map((order) => String(order.id)));
  return selected.filter((id) => present.has(id));
}

/** Hh:mm label of a last-refreshed ISO timestamp in the viewer's locale; "" when missing/invalid. */
export function lastRefreshedLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Group rows per truck, in first-seen order, with unassigned rows last. */
export function groupOrdersByTruck<T extends { vehicle: string }>(orders: T[]): { vehicle: string; orders: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const order of orders) {
    const key = order.vehicle || "Unassigned";
    const list = groups.get(key);
    if (list) list.push(order);
    else groups.set(key, [order]);
  }
  const result = Array.from(groups, ([vehicle, list]) => ({ vehicle, orders: list }));
  return [...result.filter((g) => g.vehicle !== "Unassigned"), ...result.filter((g) => g.vehicle === "Unassigned")];
}
