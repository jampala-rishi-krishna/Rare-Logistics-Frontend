// Form drafts for the acknowledge / check-out / handover screens, kept in sessionStorage so a
// reload or navigating away does not lose typed values. Photos and signatures are Blobs and are
// NOT persisted (they must be captured again). Every storage access is guarded.
import { isFileValue } from "./tripForms.ts";
import type { FormValues } from "./tripForms.ts";

export interface DraftStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DraftKind = "ack" | "checkout" | "handover";
type Scalar = string | number | boolean | null;

export function draftKey(kind: DraftKind, batchId: string, soId: string | null, templateId: number | null): string {
  return ["if-draft", kind, batchId, soId ?? "-", templateId ?? "-"].join(":");
}

// Only plain scalars survive; File values and undefined are dropped.
export function serializeValues(values: FormValues): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || isFileValue(v)) continue;
    out[k] = v;
  }
  return out;
}

// Applies saved values onto a freshly built initial form: only known keys, locked (prefilled)
// keys keep the order's value, and a saved value must have the same primitive type as the initial one.
export function mergeValues(initial: FormValues, saved: unknown, locked: ReadonlySet<string> = new Set()): FormValues {
  const out: FormValues = { ...initial };
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return out;
  const src = saved as Record<string, unknown>;
  for (const key of Object.keys(initial)) {
    if (locked.has(key) || !(key in src)) continue;
    const base = initial[key];
    const v = src[key];
    if (typeof base === "boolean") {
      if (typeof v === "boolean") out[key] = v;
    } else if (typeof base === "string") {
      if (typeof v === "string") out[key] = v;
    }
    // file-typed fields (initial "" for photo/signature) never restore a non-string
  }
  return out;
}

export function saveDraft(store: DraftStore | null, key: string, data: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(store: DraftStore | null, key: string): unknown | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function clearDraft(store: DraftStore | null, key: string): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // ignore
  }
}

export function browserDraftStore(): DraftStore | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

// ---- typed helpers ----

export interface FormDraft {
  values: Record<string, Scalar>;
  notes?: Record<string, string>;
  general_note?: string;
}

export function readFormDraft(data: unknown): FormDraft | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!d.values || typeof d.values !== "object" || Array.isArray(d.values)) return null;
  const notes: Record<string, string> = {};
  if (d.notes && typeof d.notes === "object" && !Array.isArray(d.notes)) {
    for (const [k, v] of Object.entries(d.notes as Record<string, unknown>)) if (typeof v === "string") notes[k] = v;
  }
  return {
    values: d.values as Record<string, Scalar>,
    notes,
    general_note: typeof d.general_note === "string" ? d.general_note : "",
  };
}

export interface HandoverDraft {
  rows: Record<string, { handed_over: boolean | null; note: string }>;
  officer_id: number | null;
  note: string;
}

export function readHandoverDraft(data: unknown, validSoIds: readonly string[]): HandoverDraft | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const rows: HandoverDraft["rows"] = {};
  const srcRows = d.rows && typeof d.rows === "object" && !Array.isArray(d.rows) ? (d.rows as Record<string, unknown>) : {};
  for (const id of validSoIds) {
    const r = srcRows[id] as { handed_over?: unknown; note?: unknown } | undefined;
    if (!r || typeof r !== "object") continue;
    rows[id] = {
      handed_over: typeof r.handed_over === "boolean" ? r.handed_over : null,
      note: typeof r.note === "string" ? r.note : "",
    };
  }
  return {
    rows,
    officer_id: typeof d.officer_id === "number" ? d.officer_id : null,
    note: typeof d.note === "string" ? d.note : "",
  };
}
