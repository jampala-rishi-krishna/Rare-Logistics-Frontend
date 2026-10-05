export type ViewMode = "kpi" | "spreadsheet";

export const VIEW_MODE_KEY = "intellifleet.confirmedSo.viewMode";
export const DEFAULT_VIEW_MODE: ViewMode = "spreadsheet";
/** 2 columns x 2 rows per page. */
export const CARDS_PER_PAGE = 4;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The remembered view for this browser; the spreadsheet if nothing (valid) is stored or storage is unavailable. */
export function readViewMode(storage: StorageLike | null = browserStorage()): ViewMode {
  try {
    const value = storage?.getItem(VIEW_MODE_KEY);
    return value === "kpi" || value === "spreadsheet" ? value : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

export function writeViewMode(mode: ViewMode, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Private mode / blocked storage: the choice just won't survive a refresh.
  }
}

/** One entry per sales order, in first-seen order (the spreadsheet repeats an order once per line item). */
export function uniqueOrders<T extends { order: { id: string } }>(rows: T[]): T["order"][] {
  const seen = new Set<string>();
  const orders: T["order"][] = [];
  for (const { order } of rows) {
    const id = String(order.id);
    if (seen.has(id)) continue;
    seen.add(id);
    orders.push(order);
  }
  return orders;
}

export function cardPageCount(total: number, perPage = CARDS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** The cards on `page` (1-based); the page is clamped so a shrinking list never shows an empty page. */
export function pageOfCards<T>(items: T[], page: number, perPage = CARDS_PER_PAGE): { items: T[]; page: number; pageCount: number } {
  const pageCount = cardPageCount(items.length, perPage);
  const current = Math.min(Math.max(1, page), pageCount);
  return { items: items.slice((current - 1) * perPage, current * perPage), page: current, pageCount };
}
