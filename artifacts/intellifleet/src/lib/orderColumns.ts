/** Delivery method + Fulfillment type columns shared by Inventory (SO/WM/TO/PO), Confirmed Orders and Load Planning.
 * Pure logic (no React) so it can be unit-tested with node --test. */

export type OrderFieldKey = "delivery_method" | "fulfillment_type";

export const ORDER_FIELD_COLUMNS: { key: OrderFieldKey; label: string; width: number }[] = [
  { key: "delivery_method", label: "Delivery Method", width: 150 },
  { key: "fulfillment_type", label: "Fulfillment Type", width: 160 },
];

export const COLUMN_PREFS_STORAGE_KEY = "intellifleet.orderColumns.v1";

export type ColumnPrefs = Record<string, boolean>;

/** Every known column defaults to visible. Stored prefs only ever turn a column OFF when they hold an explicit `false` for that key,
 * so a column added after the prefs were saved (a key the stored object does not know) shows up instead of being hidden. */
export function mergeColumnPrefs(stored: unknown, keys: readonly string[]): ColumnPrefs {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const result: ColumnPrefs = {};
  for (const key of keys) result[key] = source[key] !== false;
  return result;
}

export function parseColumnPrefs(raw: string | null | undefined, keys: readonly string[]): ColumnPrefs {
  if (!raw) return mergeColumnPrefs(null, keys);
  try {
    return mergeColumnPrefs(JSON.parse(raw), keys);
  } catch {
    return mergeColumnPrefs(null, keys);
  }
}

/** Display text for an order field: trimmed value, or an em dash when the order has none (TO / PO usually). */
export function orderFieldText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

export function orderFieldValue(order: { delivery_method?: string | null; fulfillment_type?: string | null } | null | undefined, key: OrderFieldKey): string {
  return orderFieldText(order?.[key]);
}

export function visibleOrderFieldColumns(prefs: ColumnPrefs) {
  return ORDER_FIELD_COLUMNS.filter((column) => prefs[column.key] !== false);
}
