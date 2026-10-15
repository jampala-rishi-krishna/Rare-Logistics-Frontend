// Pure form logic for the acknowledge checklist, the delivery check-out form and the handover
// form: visibility (show_when), conditional required, prefill, validation and answer building.
// Mirrors the server rules in docs/TRIP_WORKFLOW.md so the app rejects bad input before sending.
import type { AckAnswer, DriverOrder, HandoverItemInput, TemplateItem } from "./tripTypes.ts";
import type { QueueBlob } from "./offlineQueue.ts";
import { requiresInvoice } from "./orderType.ts";

export interface FileValue {
  blob: Blob;
  filename: string;
  // Set when the photo is taken: the same key is used for the early upload and the queued action (the server de-duplicates).
  upload_key?: string;
  captured_at?: string;
}

export type FormValue = string | number | boolean | null | undefined | FileValue;
export type FormValues = Record<string, FormValue>;

export function isFileValue(v: unknown): v is FileValue {
  return Boolean(v) && typeof v === "object" && "blob" in (v as object) && "filename" in (v as object);
}

const FILE_TYPES = new Set(["photo", "signature"]);

// Items to show: sorted by position; photo/signature hidden entirely when storage is disabled.
export function usableItems(items: TemplateItem[], photoStorageEnabled: boolean): TemplateItem[] {
  return [...items]
    .filter((i) => photoStorageEnabled || !FILE_TYPES.has(i.item_type))
    .sort((a, b) => a.position - b.position);
}

export const isFileType = (itemType: string): boolean => FILE_TYPES.has(itemType);

// Photo items the crew WOULD be asked for right now (visible for the chosen outcome) but cannot get because photo storage (R2) is not set up.
// The screen says so explicitly instead of silently hiding the field.
export function blockedPhotoItems(items: TemplateItem[], photoStorageEnabled: boolean, values: FormValues): TemplateItem[] {
  if (photoStorageEnabled) return [];
  return items.filter((i) => FILE_TYPES.has(i.item_type) && i.item_type === "photo" && isItemVisible(i, items, values));
}

export function submitLabelFor(outcome: unknown): string {
  const o = typeof outcome === "string" ? outcome.trim().toLowerCase() : "";
  if (o === "delivered") return "Mark as delivered";
  if (o.startsWith("partial")) return "Mark as partially delivered";
  return "Save departure";
}

export function isEmpty(item: TemplateItem, value: FormValue): boolean {
  if (value === null || value === undefined) return true;
  if (item.item_type === "checkbox") return value !== true;
  if (isFileValue(value)) return false;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function matchesShowWhen(value: FormValue, allowed: Array<string | number | boolean>): boolean {
  if (value === null || value === undefined || isFileValue(value)) return false;
  return allowed.some((a) => String(a).trim().toLowerCase() === String(value).trim().toLowerCase());
}

// An item is visible when it has no show_when, or its controlling item is itself visible and
// currently holds one of the listed values. Cycles are treated as hidden.
export function isVisible(item: TemplateItem, items: TemplateItem[], values: FormValues, seen: Set<string> = new Set()): boolean {
  const sw = item.show_when;
  if (!sw) return true;
  if (seen.has(item.key)) return false;
  const other = items.find((i) => i.key === sw.key);
  if (!other) return false;
  seen.add(item.key);
  if (!isVisible(other, items, values, seen)) return false;
  return matchesShowWhen(values[other.key], sw.in);
}

export const isDelivered = (outcome: unknown): boolean => typeof outcome === "string" && /^delivered$/i.test(outcome.trim());

// `reason` is mandatory (and shown) for every outcome except Delivered, as the server requires.
function isReasonItem(item: TemplateItem): boolean {
  return item.key === "reason";
}

export function isItemVisible(item: TemplateItem, items: TemplateItem[], values: FormValues): boolean {
  if (isReasonItem(item) && items.some((i) => i.key === "outcome")) {
    const outcome = values.outcome;
    if (typeof outcome === "string" && outcome && !isDelivered(outcome)) return true;
    if (!item.show_when) return false;
  }
  return isVisible(item, items, values);
}

export function isItemRequired(item: TemplateItem, items: TemplateItem[], values: FormValues): boolean {
  if (!isItemVisible(item, items, values)) return false;
  if (isReasonItem(item) && items.some((i) => i.key === "outcome")) {
    const outcome = values.outcome;
    if (typeof outcome === "string" && outcome && !isDelivered(outcome)) return true;
  }
  return item.required;
}

export function visibleItems(items: TemplateItem[], values: FormValues): TemplateItem[] {
  return items.filter((i) => isItemVisible(i, items, values));
}

export function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---- delivery check-out ----

export function prefillValueFor(item: TemplateItem, prefill: Record<string, unknown> | null | undefined): string | null {
  if (!prefill) return null;
  const source = item.prefill || item.key;
  const v = prefill[source];
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export interface InitialForm {
  values: FormValues;
  // Keys filled from the order: shown read-only.
  locked: Set<string>;
}

export const INVOICE_KEY = "invoice_dr_number";

// Transfer / purchase order stops need no invoice/DR number (the TO#/PO# is the reference): drop that item from the form.
// A missing order_type means a sales order, which still requires it.
export function checkoutItemsForOrder(items: TemplateItem[], orderType: unknown): TemplateItem[] {
  return requiresInvoice(orderType) ? items : items.filter((item) => item.key !== INVOICE_KEY);
}

export function initialCheckoutForm(items: TemplateItem[], order: Pick<DriverOrder, "checkout_prefill" | "invoice_hint"> | null): InitialForm {
  const values: FormValues = {};
  const locked = new Set<string>();
  for (const item of items) {
    const pre = prefillValueFor(item, order?.checkout_prefill);
    if (pre === null && item.key === INVOICE_KEY && order?.invoice_hint) {
      values[item.key] = order.invoice_hint; // a suggestion from the SO already in memory: editable, the crew confirms it
      continue;
    }
    if (pre !== null && !FILE_TYPES.has(item.item_type)) {
      values[item.key] = item.item_type === "checkbox" ? pre === "true" : pre;
      locked.add(item.key);
    } else {
      values[item.key] = item.item_type === "checkbox" ? false : "";
    }
  }
  return { values, locked };
}

export type FieldErrors = Record<string, string>;

function validateItemValue(item: TemplateItem, value: FormValue): string | null {
  if (isEmpty(item, value)) return null;
  switch (item.item_type) {
    case "number":
      return typeof value === "string" && parseNumber(value) === null ? "Enter a number" : null;
    case "numeric_text":
      return typeof value === "string" && /^\d{1,30}$/.test(value.trim()) ? null : "Digits only (0-9)";
    case "dropdown":
    case "radio":
      if (item.options && item.options.length > 0 && !item.options.includes(String(value))) return "Choose one of the options";
      return null;
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "Enter a valid date";
    case "datetime":
      return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? null : "Enter a valid date and time";
    default:
      return null;
  }
}

export function validateCheckout(items: TemplateItem[], values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const item of items) {
    if (!isItemVisible(item, items, values)) continue;
    if (isItemRequired(item, items, values) && isEmpty(item, values[item.key])) {
      errors[item.key] = item.item_type === "checkbox" ? "This must be ticked" : item.key === "reason" ? "Give a reason" : item.item_type === "photo" ? "Take a photo first (proof of delivery is required)" : "Required";
      continue;
    }
    const bad = validateItemValue(item, values[item.key]);
    if (bad) errors[item.key] = bad;
  }
  return errors;
}

export interface BuiltAnswers<A> {
  answers: A;
  blobs: QueueBlob[];
}

function datetimeToIso(raw: string): string {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

export function buildCheckoutAnswers(items: TemplateItem[], values: FormValues, newUploadKey: () => string): BuiltAnswers<Record<string, unknown>> {
  const answers: Record<string, unknown> = {};
  const blobs: QueueBlob[] = [];
  for (const item of items) {
    if (!isItemVisible(item, items, values)) continue;
    const v = values[item.key];
    if (FILE_TYPES.has(item.item_type)) {
      if (isFileValue(v)) {
        answers[item.key] = null; // replaced by the photo_id once uploaded
        blobs.push({ field_key: item.key, upload_key: v.upload_key ?? newUploadKey(), blob: v.blob, filename: v.filename, ...(v.captured_at ? { captured_at: v.captured_at } : {}) });
      }
      continue;
    }
    if (item.item_type === "checkbox") answers[item.key] = v === true;
    else if (v === null || v === undefined || v === "") answers[item.key] = null;
    else if (item.item_type === "number") answers[item.key] = typeof v === "string" ? parseNumber(v) : v;
    else if (item.item_type === "datetime") answers[item.key] = datetimeToIso(String(v));
    else answers[item.key] = typeof v === "string" ? v.trim() : v;
  }
  return { answers, blobs };
}

// ---- acknowledge checklist ----

export interface AckForm {
  values: FormValues;
  notes: Record<string, string>;
  general_note: string;
}

export function initialAckForm(items: TemplateItem[]): AckForm {
  const values: FormValues = {};
  for (const item of items) values[item.key] = item.item_type === "checkbox" ? false : "";
  return { values, notes: {}, general_note: "" };
}

export function validateAck(items: TemplateItem[], values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const item of items) {
    if (!isVisible(item, items, values)) continue;
    const v = values[item.key];
    if (item.required && isEmpty(item, v)) {
      errors[item.key] = item.item_type === "checkbox" ? "Tick this to continue" : item.item_type === "photo" ? "Add a photo" : "Required";
      continue;
    }
    if (item.item_type === "count" && !isEmpty(item, v)) {
      const n = typeof v === "string" ? parseNumber(v) : null;
      if (n === null || n < 0) errors[item.key] = "Enter a count (0 or more)";
    }
  }
  return errors;
}

export function ackReady(items: TemplateItem[], values: FormValues): boolean {
  return Object.keys(validateAck(items, values)).length === 0;
}

export function buildAckAnswers(form: AckForm, items: TemplateItem[], newUploadKey: () => string): BuiltAnswers<AckAnswer[]> & { discrepancy_note: string | null } {
  const answers: AckAnswer[] = [];
  const blobs: QueueBlob[] = [];
  for (const item of items) {
    if (!isVisible(item, items, form.values)) continue;
    const v = form.values[item.key];
    const note = (form.notes[item.key] ?? "").trim();
    const a: AckAnswer = { item_id: item.id, checked: null, count: null, text: null, photo_id: null, note: note || null };
    if (item.item_type === "checkbox") a.checked = v === true;
    else if (item.item_type === "count") a.count = typeof v === "string" ? parseNumber(v) : null;
    else if (item.item_type === "note") a.text = typeof v === "string" && v.trim() ? v.trim() : null;
    else if (item.item_type === "photo" && isFileValue(v)) {
      blobs.push({ field_key: `item:${item.id}`, upload_key: v.upload_key ?? newUploadKey(), blob: v.blob, filename: v.filename, ...(v.captured_at ? { captured_at: v.captured_at } : {}) });
    }
    answers.push(a);
  }
  const general = form.general_note.trim();
  return { answers, blobs, discrepancy_note: general || null };
}

// 422 `errors: [{key, message}]` -> field errors keyed by item key (matches key or numeric id).
export function mapServerErrors(errors: Array<{ key: string; message: string }>, items: TemplateItem[]): { fields: FieldErrors; general: string[] } {
  const fields: FieldErrors = {};
  const general: string[] = [];
  for (const e of errors) {
    const item = items.find((i) => i.key === e.key || String(i.id) === e.key);
    if (item) fields[item.key] = e.message;
    else general.push(e.message);
  }
  return { fields, general };
}

// ---- handover ----

export interface HandoverRow {
  so_id: string;
  handed_over: boolean | null;
  note: string;
}

export function validateHandover(rows: HandoverRow[], officerId: number | null): { rows: Record<string, string>; officer: string | null; ok: boolean } {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.handed_over === null) out[r.so_id] = "Choose Yes or No";
    else if (r.handed_over === false && r.note.trim() === "") out[r.so_id] = "Add a note explaining why not";
  }
  const officer = officerId === null ? "Choose the logistics officer" : null;
  return { rows: out, officer, ok: Object.keys(out).length === 0 && officer === null && rows.length > 0 };
}

export function buildHandoverItems(rows: HandoverRow[]): HandoverItemInput[] {
  return rows.map((r) => ({ so_id: r.so_id, handed_over: r.handed_over === true, note: r.note.trim() || null }));
}
