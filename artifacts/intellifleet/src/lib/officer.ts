// Pure helpers for the officer invoice-validation screens (docs/TRIP_WORKFLOW.md section 6).

export type Decision = { status: "received" | "missing" | "discrepancy" | null; note: string };
export type Decisions = Record<string, Decision>;

export const NOTE_REQUIRED = ["missing", "discrepancy"] as const;

export function noteRequired(status: string | null | undefined): boolean {
  return status === "missing" || status === "discrepancy";
}

export interface ValidationState {
  total: number;
  decided: number;
  /** item ids still without a status */
  undecided: string[];
  /** item ids with missing/discrepancy but no note */
  needsNote: string[];
  canSubmit: boolean;
}

// "Acknowledge & submit" is enabled only when every invoice has a status and every
// missing/discrepancy status carries a note.
export function validationState(itemIds: ReadonlyArray<string | number>, decisions: Decisions): ValidationState {
  const undecided: string[] = [];
  const needsNote: string[] = [];
  for (const raw of itemIds) {
    const id = String(raw);
    const d = decisions[id];
    if (!d || !d.status) {
      undecided.push(id);
      continue;
    }
    if (noteRequired(d.status) && d.note.trim().length === 0) needsNote.push(id);
  }
  const total = itemIds.length;
  return {
    total,
    decided: total - undecided.length,
    undecided,
    needsNote,
    canSubmit: total > 0 && undecided.length === 0 && needsNote.length === 0,
  };
}

export function buildValidatePayload(
  itemIds: ReadonlyArray<string | number>,
  decisions: Decisions,
): Array<{ item_id: number | string; status: "received" | "missing" | "discrepancy"; note: string | null }> {
  return itemIds.map((raw) => {
    const d = decisions[String(raw)];
    const note = d?.note.trim() ? d.note.trim() : null;
    return { item_id: typeof raw === "number" ? raw : /^\d+$/.test(raw) ? Number(raw) : raw, status: d!.status!, note };
  });
}

export function ageLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours) || hours < 0) return "-";
  if (hours < 1) return "<1 h";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.floor(hours / 24)} d`;
}

export type AgeTone = "good" | "warn" | "bad" | "neutral";
export function ageTone(hours: number | null | undefined): AgeTone {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return "neutral";
  if (hours >= 72) return "bad";
  if (hours >= 24) return "warn";
  return "good";
}

// Errors may carry detail as an object ({message, code, errors}) or a plain string.
export function errorInfo(error: unknown): { message: string; code: string | null; fieldErrors: Array<{ key: string; message: string }> } {
  const fallback = "Something went wrong. Please try again.";
  if (!error || typeof error !== "object") return { message: fallback, code: null, fieldErrors: [] };
  const e = error as { message?: unknown; body?: unknown };
  let message = typeof e.message === "string" && e.message ? e.message : fallback;
  let code: string | null = null;
  let fieldErrors: Array<{ key: string; message: string }> = [];
  const body = e.body as { detail?: unknown } | null | undefined;
  const detail = body && typeof body === "object" ? body.detail : undefined;
  if (typeof detail === "string" && detail) {
    message = detail;
  } else if (detail && typeof detail === "object") {
    const d = detail as { message?: unknown; code?: unknown; errors?: unknown };
    if (typeof d.message === "string" && d.message) message = d.message;
    if (typeof d.code === "string") code = d.code;
    if (Array.isArray(d.errors)) {
      fieldErrors = d.errors
        .filter((x): x is { key: unknown; message: unknown } => !!x && typeof x === "object")
        .map((x) => ({ key: String(x.key ?? ""), message: String(x.message ?? "") }));
    }
  }
  return { message, code, fieldErrors };
}

// Message for the "already done" result of an officer action.
export function alreadyDoneText(result: { already_done?: boolean; done_by?: { name?: string; role?: string } | null }): string | null {
  if (!result.already_done) return null;
  const by = result.done_by?.name ? ` by ${result.done_by.name}` : "";
  return `Already recorded${by}. Nothing was changed.`;
}

export function newActionBase(now: Date = new Date()): { idempotency_key: string; client_ts: string } {
  return { idempotency_key: globalThis.crypto.randomUUID(), client_ts: now.toISOString() };
}

export function personName(p: unknown): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  if (typeof p === "object" && typeof (p as { name?: unknown }).name === "string") return (p as { name: string }).name;
  return "";
}

export interface HandoverLike {
  for_me: boolean;
  delivery_date: string;
  vehicle: string | null;
  driver: { name: string } | null;
  helpers: Array<{ name: string } | string>;
  items?: Array<{ so_number: string; customer_name: string | null }>;
}

export function filterHandovers<T extends HandoverLike>(rows: readonly T[], scope: "all" | "mine", search: string): T[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (scope === "mine" && !row.for_me) return false;
    if (!q) return true;
    const hay = [
      row.delivery_date,
      row.vehicle ?? "",
      row.driver?.name ?? "",
      ...row.helpers.map(personName),
      ...(row.items ?? []).flatMap((i) => [i.so_number, i.customer_name ?? ""]),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function sortOutstandingOldest<T extends { age_hours: number | null; delivery_date: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ah = a.age_hours ?? -1;
    const bh = b.age_hours ?? -1;
    if (ah !== bh) return bh - ah;
    return a.delivery_date.localeCompare(b.delivery_date);
  });
}

export function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case "received":
      return "Received";
    case "missing":
      return "Missing";
    case "discrepancy":
      return "Discrepancy";
    case "pending":
      return "Pending";
    case "acknowledged":
      return "Part-validated";
    case "closed":
      return "Closed";
    case "submitted":
      return "Submitted";
    default:
      return status ? status.replaceAll("_", " ") : "-";
  }
}
