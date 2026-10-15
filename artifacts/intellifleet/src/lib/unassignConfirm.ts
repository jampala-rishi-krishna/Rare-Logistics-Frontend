// Unassign guard (Load Planning / Confirmed Orders): decides, from the unassign-preview response, whether the
// dispatcher must confirm before an order leaves its truck. Pure (no React, no fetch) so it is node-testable.

export type UnassignState = "assigned" | "acknowledged" | "trip_started" | "checked_in" | "delivered";

/** One row of POST /api/load-planning/assignments/unassign-preview (also the `orders` of a 409 confirm_required). */
export interface UnassignPreviewOrder {
  id: string;
  number: string | null;
  order_type?: "SO" | "WM" | "PO" | "TO" | null;
  state?: UnassignState | string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  trip_started_at?: string | null;
  checked_in_at?: string | null;
  needs_confirm: boolean;
  blocked: boolean;
  reason?: string | null;
  message?: string | null;
}

export interface UnassignPreview {
  needs_confirm: boolean;
  orders: UnassignPreviewOrder[];
}

export type UnassignPlan =
  /** Nothing acknowledged / started / delivered: keep the current flow, no extra dialog. */
  | { kind: "proceed"; ids: string[] }
  /** Show the one confirmation dialog. `ids` = what "Unassign anyway" sends (blocked orders excluded). */
  | {
      kind: "dialog";
      ids: string[];
      confirmRows: UnassignPreviewOrder[];
      blockedRows: UnassignPreviewOrder[];
      needsConfirm: boolean;
    };

/** Decide what to do with the selected ids given the preview rows. Ids the preview did not return are kept (the server decides). */
export function planUnassign(requestedIds: string[], rows: ReadonlyArray<UnassignPreviewOrder>): UnassignPlan {
  const blockedRows = rows.filter((r) => r.blocked);
  const blocked = new Set(blockedRows.map((r) => String(r.id)));
  const confirmRows = rows.filter((r) => !r.blocked && r.needs_confirm);
  const ids = requestedIds.filter((id) => !blocked.has(String(id)));
  if (!blockedRows.length && !confirmRows.length) return { kind: "proceed", ids };
  return { kind: "dialog", ids, confirmRows, blockedRows, needsConfirm: confirmRows.length > 0 };
}

/** Line shown for an order that needs confirmation. The backend's `message` is preferred. */
export function confirmLine(row: UnassignPreviewOrder): string {
  if (row.message && row.message.trim()) return row.message.trim();
  const who = row.number || row.id;
  const state = row.state ? String(row.state).replaceAll("_", " ") : "in progress";
  return `${who}: ${state}`;
}

/** Line shown for an order that can't be unassigned. */
export function blockedLine(row: UnassignPreviewOrder): string {
  const who = row.number || row.id;
  const why = (row.reason && row.reason.trim()) || (row.message && row.message.trim()) || "already delivered";
  return `${who}: can't be unassigned - ${why}`;
}

export function dialogTitle(plan: Extract<UnassignPlan, { kind: "dialog" }>): string {
  if (!plan.ids.length) return plan.blockedRows.length === 1 ? "This order can't be unassigned" : "These orders can't be unassigned";
  if (plan.needsConfirm) return plan.confirmRows.length === 1 ? "This order is already in progress" : `${plan.confirmRows.length} orders are already in progress`;
  return "Some orders can't be unassigned";
}

/** Label of the go button, or null when there is nothing left to unassign (only Close). */
export function proceedLabel(plan: Extract<UnassignPlan, { kind: "dialog" }>): string | null {
  if (!plan.ids.length) return null;
  if (plan.needsConfirm) return "Unassign anyway";
  return `Unassign ${plan.ids.length} other${plan.ids.length === 1 ? "" : "s"}`;
}

/** The 409 `confirm_required` rows from an unassign call (race: an order moved on after the preview), else null. */
export function confirmRequiredOrders(error: unknown): UnassignPreviewOrder[] | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { status?: unknown; body?: unknown };
  if (e.status !== 409) return null;
  const detail = (e.body as { detail?: unknown } | null | undefined)?.detail;
  if (!detail || typeof detail !== "object") return null;
  const d = detail as { code?: unknown; orders?: unknown };
  if (d.code !== "confirm_required" || !Array.isArray(d.orders)) return null;
  return d.orders as UnassignPreviewOrder[];
}

/** " 2 not unassigned: SO26-1 (delivered), ..." from a bulk result's `skipped`. */
export function skippedText(skipped: ReadonlyArray<{ id: string; reason?: string | null }> | undefined, numberOf: (id: string) => string = (id) => id): string {
  if (!skipped?.length) return "";
  const parts = skipped.map((s) => (s.reason ? `${numberOf(s.id)} (${s.reason})` : numberOf(s.id)));
  return ` ${skipped.length} not unassigned: ${parts.join(", ")}.`;
}
