// Pure helpers for the Driver Overview dashboard (docs/TRIP_WORKFLOW.md section 8).

export const MANILA_TZ = "Asia/Manila";

// YYYY-MM-DD in Manila for the given instant.
export function manilaDate(now: Date = new Date(), offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TZ }).format(new Date(now.getTime() + offsetDays * 86_400_000));
}

export function isValidRange(from: string, to: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
}

// ---- durations / stale ----------------------------------------------------------------------

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes) || minutes < 0) return "-";
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function minutesBetween(fromIso: string | null | undefined, to: Date = new Date()): number | null {
  if (!fromIso) return null;
  const t = new Date(fromIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((to.getTime() - t) / 60_000));
}

export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  const m = minutesBetween(iso, now);
  if (m === null) return "-";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return formatDuration(m) + " ago";
  return `${Math.floor(m / 1440)} d ago`;
}

// The red flag text for a stale board row; null when the row is not stale.
export function staleLabel(row: { stale: boolean; last_action: { at: string } | null }, now: Date = new Date()): string | null {
  if (!row.stale) return null;
  const m = minutesBetween(row.last_action?.at, now);
  return m === null ? "No update recently" : `No update for ${formatDuration(m)}`;
}

export const DEFAULT_STALE_MINUTES = 15;
export const STALE_STORAGE_KEY = "if-overview-stale-minutes";

export function parseStaleMinutes(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_STALE_MINUTES;
  return Math.min(n, 24 * 60);
}

// ---- board ----------------------------------------------------------------------------------

export const STATE_LABEL: Record<string, string> = {
  idle: "Idle",
  to_acknowledge: "To acknowledge",
  ready: "Ready to start",
  on_trip: "On trip",
  returned: "Returned",
  handover_pending: "Handover pending",
  closed: "Closed",
};

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

export function stateTone(state: string): Tone {
  switch (state) {
    case "on_trip":
      return "info";
    case "ready":
    case "closed":
      return "good";
    case "to_acknowledge":
    case "handover_pending":
      return "warn";
    case "returned":
      return "neutral";
    default:
      return "neutral";
  }
}

export function stateLabel(state: string): string {
  return STATE_LABEL[state] ?? state.replaceAll("_", " ");
}

export function progressLabel(p: { done: number; total: number } | null | undefined): string {
  return p && p.total > 0 ? `${p.done} of ${p.total}` : "-";
}

export function progressPct(p: { done: number; total: number } | null | undefined): number {
  if (!p || p.total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((p.done / p.total) * 100)));
}

export const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "on_trip", label: "On trip" },
  { value: "to_acknowledge", label: "To acknowledge" },
  { value: "ready", label: "Ready to start" },
  { value: "returned", label: "Returned" },
  { value: "handover_pending", label: "Handover pending" },
  { value: "closed", label: "Closed" },
  { value: "idle", label: "Idle" },
];

// ---- KPI mapping ----------------------------------------------------------------------------

export interface KpiCard {
  id: string;
  group: "Drivers" | "Sales orders" | "Handover";
  label: string;
  value: number;
  hint?: string;
  tone: Tone;
}

type SummaryKpis = {
  drivers: { active: number; on_trip: number; returned: number; idle: number };
  sos: { assigned: number; acknowledged: number; delivered: number; partial: number; failed: number };
  trips_pending_handover: number;
  invoices_outstanding: number;
};

export function kpiCards(k: SummaryKpis): KpiCard[] {
  return [
    { id: "drivers-active", group: "Drivers", label: "Drivers active", value: k.drivers.active, tone: "neutral" },
    { id: "drivers-on-trip", group: "Drivers", label: "On trip", value: k.drivers.on_trip, tone: "info" },
    { id: "drivers-returned", group: "Drivers", label: "Returned", value: k.drivers.returned, tone: "good" },
    { id: "drivers-idle", group: "Drivers", label: "Idle", value: k.drivers.idle, tone: "neutral" },
    { id: "sos-assigned", group: "Sales orders", label: "SOs assigned", value: k.sos.assigned, tone: "neutral" },
    { id: "sos-acknowledged", group: "Sales orders", label: "Acknowledged", value: k.sos.acknowledged, tone: "info" },
    { id: "sos-delivered", group: "Sales orders", label: "Delivered", value: k.sos.delivered, tone: "good" },
    { id: "sos-partial", group: "Sales orders", label: "Partial", value: k.sos.partial, tone: k.sos.partial > 0 ? "warn" : "neutral" },
    { id: "sos-failed", group: "Sales orders", label: "Failed", value: k.sos.failed, tone: k.sos.failed > 0 ? "bad" : "neutral" },
    { id: "trips-pending-handover", group: "Handover", label: "Trips pending handover", value: k.trips_pending_handover, tone: k.trips_pending_handover > 0 ? "warn" : "neutral" },
    { id: "invoices-outstanding", group: "Handover", label: "Invoices outstanding", hint: "all dates", value: k.invoices_outstanding, tone: k.invoices_outstanding > 0 ? "bad" : "neutral" },
  ];
}

// ---- timeline -------------------------------------------------------------------------------

export const EVENT_LABEL: Record<string, string> = {
  acknowledged: "Acknowledged",
  so_acknowledged: "Acknowledged",
  trip_started: "Trip started",
  checkin: "Checked in",
  check_in: "Checked in",
  checkout: "Checked out",
  check_out: "Checked out",
  trip_ended: "Trip ended",
  end_trip: "Trip ended",
  handover_submitted: "Handover submitted",
  officer_validated: "Officer validated",
  trip_closed: "Trip closed",
};

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

export const DELIVERED_OUTCOME = "Delivered";

// An order is a discrepancy when delivery was not a clean "Delivered", the checkin was far, or the
// officer flagged the invoice.
export function orderIssues(order: {
  stop: { checkin: { far: boolean | null } | null; checkout: { outcome: string | null } | null } | null;
  handover: { handed_over: boolean | null; officer_status: string | null } | null;
  ack: { discrepancy_note: string | null } | null;
}): string[] {
  const issues: string[] = [];
  const outcome = order.stop?.checkout?.outcome;
  if (outcome && outcome !== DELIVERED_OUTCOME) issues.push(outcome);
  if (order.stop?.checkin?.far) issues.push("Checked in far from address");
  if (order.ack?.discrepancy_note) issues.push("Discrepancy noted at acknowledgement");
  if (order.handover?.handed_over === false) issues.push("Invoice not handed over");
  const os = order.handover?.officer_status;
  if (os === "missing") issues.push("Invoice missing");
  if (os === "discrepancy") issues.push("Invoice discrepancy");
  return issues;
}

// photo / signature values are numeric photo ids
export function isPhotoValue(type: string | undefined, value: unknown): value is number | string {
  if (type !== "photo" && type !== "signature") return false;
  return typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value));
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ---- map ------------------------------------------------------------------------------------

export const POINT_STYLE: Record<string, { label: string; color: string; shape: "square" | "circle" | "diamond" | "triangle" }> = {
  start: { label: "Trip start", color: "#1d4ed8", shape: "square" },
  checkin: { label: "Check-in", color: "#a16819", shape: "triangle" },
  checkout: { label: "Check-out", color: "#1e7b44", shape: "circle" },
  end: { label: "Trip end", color: "#7c3aed", shape: "diamond" },
};

export function pointStyle(type: string) {
  return POINT_STYLE[type] ?? { label: type, color: "#55565a", shape: "circle" as const };
}

// ---- checklist template editor --------------------------------------------------------------

export type TemplateKindId = "acknowledge_checklist" | "delivery_checkout";

export const ITEM_TYPES: Record<TemplateKindId, readonly string[]> = {
  acknowledge_checklist: ["checkbox", "count", "photo", "note"],
  delivery_checkout: ["text", "textarea", "dropdown", "radio", "number", "date", "datetime", "photo", "signature", "checkbox"],
};

export const OPTION_TYPES = ["dropdown", "radio"] as const;

export function needsOptions(itemType: string): boolean {
  return (OPTION_TYPES as readonly string[]).includes(itemType);
}

export interface EditorItem {
  uid: string;
  key: string;
  keyLocked: boolean;
  label: string;
  item_type: string;
  required: boolean;
  active: boolean;
  optionsText: string;
  showWhenKey: string;
  showWhenIn: string;
  prefill: unknown;
}

export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Unique key from a label, ignoring the item's own current key.
export function generateKey(label: string, takenKeys: ReadonlyArray<string>): string {
  const base = slugifyKey(label) || "item";
  const taken = new Set(takenKeys);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function parseList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

let uidCounter = 0;
export function nextUid(): string {
  uidCounter += 1;
  return `item-${uidCounter}`;
}

export function blankItem(kind: TemplateKindId, existing: ReadonlyArray<EditorItem>): EditorItem {
  return {
    uid: nextUid(),
    key: generateKey("", existing.map((i) => i.key)),
    keyLocked: false,
    label: "",
    item_type: ITEM_TYPES[kind][0],
    required: false,
    active: true,
    optionsText: "",
    showWhenKey: "",
    showWhenIn: "",
    prefill: null,
  };
}

// Changing a label re-derives the key until the item came from a saved template.
export function relabel(items: ReadonlyArray<EditorItem>, uid: string, label: string): EditorItem[] {
  return items.map((it) => {
    if (it.uid !== uid) return it;
    if (it.keyLocked) return { ...it, label };
    const others = items.filter((o) => o.uid !== uid).map((o) => o.key);
    return { ...it, label, key: generateKey(label, others) };
  });
}

export function moveItem<T>(items: ReadonlyArray<T>, index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeItem<T>(items: ReadonlyArray<T>, index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export function toEditorItems(items: ReadonlyArray<{ key: string; label: string; item_type: string; required: boolean; options: string[] | null; prefill?: unknown; show_when: { key: string; in: unknown[] } | null; active?: boolean }>): EditorItem[] {
  return items.map((it) => ({
    uid: nextUid(),
    key: it.key,
    keyLocked: true,
    label: it.label,
    item_type: it.item_type,
    required: it.required,
    active: it.active ?? true,
    optionsText: (it.options ?? []).join(", "),
    showWhenKey: it.show_when?.key ?? "",
    showWhenIn: (it.show_when?.in ?? []).map((v) => String(v)).join(", "),
    prefill: it.prefill ?? null,
  }));
}

export interface TemplateError {
  uid: string | null;
  message: string;
}

export function validateTemplate(kind: TemplateKindId, name: string, items: ReadonlyArray<EditorItem>): TemplateError[] {
  const errors: TemplateError[] = [];
  if (name.trim().length === 0) errors.push({ uid: null, message: "Template name is required." });
  if (items.length === 0) errors.push({ uid: null, message: "Add at least one item." });
  const allowed = ITEM_TYPES[kind];
  const seen = new Set<string>();
  const keys = new Set(items.map((i) => i.key));
  items.forEach((it, idx) => {
    const where = `Item ${idx + 1}${it.label.trim() ? ` (${it.label.trim()})` : ""}`;
    if (it.label.trim().length === 0) errors.push({ uid: it.uid, message: `${where}: label is required.` });
    if (!/^[a-z][a-z0-9_]*$/.test(it.key)) errors.push({ uid: it.uid, message: `${where}: key must be lowercase letters, digits or underscores and start with a letter.` });
    if (seen.has(it.key)) errors.push({ uid: it.uid, message: `${where}: key "${it.key}" is used twice.` });
    seen.add(it.key);
    if (!allowed.includes(it.item_type)) errors.push({ uid: it.uid, message: `${where}: type "${it.item_type}" is not allowed for this form.` });
    if (needsOptions(it.item_type) && parseList(it.optionsText).length === 0) errors.push({ uid: it.uid, message: `${where}: add at least one option.` });
    if (it.showWhenKey) {
      if (kind !== "delivery_checkout") errors.push({ uid: it.uid, message: `${where}: show-when is only supported on the checkout form.` });
      if (it.showWhenKey === it.key) errors.push({ uid: it.uid, message: `${where}: cannot depend on itself.` });
      else if (!keys.has(it.showWhenKey)) errors.push({ uid: it.uid, message: `${where}: show-when refers to an unknown item.` });
      if (parseList(it.showWhenIn).length === 0) errors.push({ uid: it.uid, message: `${where}: show-when needs at least one value.` });
    }
  });
  if (kind === "delivery_checkout") {
    const outcome = items.find((i) => i.key === "outcome");
    if (!outcome || !needsOptions(outcome.item_type) || !outcome.active) {
      errors.push({ uid: outcome?.uid ?? null, message: 'The checkout form must keep an active "outcome" dropdown or radio item.' });
    }
  }
  return errors;
}

export function buildTemplatePayload(
  kind: TemplateKindId,
  name: string,
  items: ReadonlyArray<EditorItem>,
): { name: string; items: Array<{ key: string; label: string; item_type: string; required: boolean; options: string[] | null; prefill: unknown; show_when: { key: string; in: unknown[] } | null; active: boolean }> } {
  return {
    name: name.trim(),
    items: items.map((it) => ({
      key: it.key,
      label: it.label.trim(),
      item_type: it.item_type,
      required: it.required,
      options: needsOptions(it.item_type) ? parseList(it.optionsText) : null,
      prefill: it.prefill ?? null,
      show_when: kind === "delivery_checkout" && it.showWhenKey ? { key: it.showWhenKey, in: parseList(it.showWhenIn) } : null,
      active: it.active,
    })),
  };
}

export const DRAFT_BADGE_TEXT = "DRAFT — replace with Logistics checklist";
