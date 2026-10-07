import type { SalesOrdersPage } from "../services/api/inventory.ts";
import type { SalesOrderSummary } from "../services/api/inventory.ts";

export interface AckOutcome {
  id: string;
  ok: boolean;
  /** The server's response for an acknowledge that succeeded. */
  result?: Record<string, any>;
  /** Why an acknowledge failed. */
  error?: string;
}

const SESSION_KEY = "intellifleet.acknowledgedSalesOrders.v1";
const SESSION_TTL_MS = 15 * 60 * 1000;

type SessionAckEntry = { id: string; at: number; order?: SalesOrderSummary };

function readSessionEntries(): SessionAckEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const fresh = parsed.filter((entry) => entry?.id && now - Number(entry.at || 0) <= SESSION_TTL_MS);
    if (fresh.length !== parsed.length) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return [];
  }
}

function writeSessionEntries(entries: SessionAckEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort UI guard only; the server remains authoritative.
  }
}

export function sessionAcknowledgedIds(): Set<string> {
  return new Set(readSessionEntries().map((entry) => String(entry.id)));
}

export function sessionAcknowledgedOrders(): SalesOrderSummary[] {
  return readSessionEntries().map((entry) => entry.order).filter(Boolean) as SalesOrderSummary[];
}

export function rememberSessionAcknowledged(ids: string[], sourceOrders: SalesOrderSummary[] = []) {
  const existing = new Map(readSessionEntries().map((entry) => [String(entry.id), entry]));
  const byId = new Map(sourceOrders.map((order) => [String(order.id), order]));
  const now = Date.now();
  for (const id of ids.map(String)) existing.set(id, { id, at: now, order: byId.get(id) ?? existing.get(id)?.order });
  writeSessionEntries(Array.from(existing.values()));
}

export function forgetSessionAcknowledged(ids: string[]) {
  const gone = new Set(ids.map(String));
  writeSessionEntries(readSessionEntries().filter((entry) => !gone.has(String(entry.id))));
}

/**
 * Run one acknowledge per id and keep every outcome. Unlike Promise.all, one failure never
 * hides the others: the successful orders still move, the failed ones keep their error.
 */
export async function settleAcknowledgements(
  ids: string[],
  acknowledge: (id: string) => Promise<Record<string, any>>,
): Promise<AckOutcome[]> {
  const settled = await Promise.allSettled(ids.map((id) => acknowledge(id)));
  return settled.map((entry, index) => {
    const id = ids[index];
    if (entry.status === "fulfilled") {
      // A response is only a success when the server says the order is acknowledged.
      return entry.value?.acknowledged === false
        ? { id, ok: false, error: "Zoho did not acknowledge this sales order." }
        : { id, ok: true, result: entry.value };
    }
    const reason: any = entry.reason;
    return { id, ok: false, error: reason?.message || "Zoho could not acknowledge this sales order." };
  });
}

/** Drop orders from a cached list page and keep its total in step (never below zero). */
export function removeOrdersFromPage<T extends Pick<SalesOrdersPage, "items" | "total">>(
  page: T | undefined,
  ids: Iterable<string>,
): T | undefined {
  if (!page) return page;
  const gone = new Set(Array.from(ids, String));
  const items = page.items.filter((order) => !gone.has(String(order.id)));
  const removed = page.items.length - items.length;
  return removed === 0 ? page : { ...page, items, total: Math.max(0, page.total - removed) };
}

export function summarizeAcknowledgements(
  outcomes: AckOutcome[],
  label: (id: string) => string,
): { acknowledgedIds: string[]; failedIds: string[]; errors: Record<string, string>; message: string } {
  const acknowledgedIds = outcomes.filter((o) => o.ok).map((o) => o.id);
  const failed = outcomes.filter((o) => !o.ok);
  const errors = Object.fromEntries(failed.map((o) => [o.id, o.error ?? "Failed"]));
  const parts = [`Acknowledged ${acknowledgedIds.length} sales order${acknowledgedIds.length === 1 ? "" : "s"}.`];
  if (failed.length) parts.push(`Failed ${failed.length}: ${failed.map((o) => `${label(o.id)} (${o.error ?? "failed"})`).join("; ")}.`);
  return { acknowledgedIds, failedIds: failed.map((o) => o.id), errors, message: parts.join(" ") };
}
