// Officer invoice validation client (docs/TRIP_WORKFLOW.md section 6). Prefix /api/officer.
import { api } from "./client";

export interface PersonRef {
  id: number | string;
  name: string;
}

export interface HandoverTotals {
  invoices: number;
  handed_over: number;
  not_handed_over: number;
  received: number;
  missing: number;
  discrepancy: number;
  pending: number;
}

export interface HandoverRow {
  handover_id: number | string;
  batch_id: string;
  delivery_date: string;
  vehicle: string | null;
  driver: PersonRef | null;
  helpers: Array<PersonRef | string>;
  submitted_at: string | null;
  officer: PersonRef | null;
  for_me: boolean;
  status: string;
  totals: HandoverTotals;
}

export type OfficerStatus = "pending" | "received" | "missing" | "discrepancy";

export interface HandoverItem {
  item_id: number | string;
  so_id: string;
  so_number: string;
  customer_name: string | null;
  handed_over: boolean | null;
  crew_note: string | null;
  officer_status: OfficerStatus | null;
  officer_note: string | null;
  checked_at: string | null;
  checked_by: string | PersonRef | { name?: string } | null;
}

export interface HandoverStop {
  so_number: string;
  customer_name: string | null;
  outcome: string | null;
  reason: string | null;
  checkout_at: string | null;
}

export interface HandoverDetail extends HandoverRow {
  items: HandoverItem[];
  stops: HandoverStop[];
  events?: Array<{ type: string; at: string | null; by?: unknown; so_number?: string | null }>;
}

export interface OutstandingItem {
  item_id: number | string;
  handover_id: number | string;
  batch_id: string;
  so_number: string;
  customer_name: string | null;
  officer_status: OfficerStatus | null;
  officer_note: string | null;
  crew_note: string | null;
  delivery_date: string;
  driver: PersonRef | null;
  age_hours: number | null;
}

export interface HandoversFilter {
  status?: "pending" | "all" | "closed";
  q?: string;
  from?: string;
  to?: string;
  driver_id?: number | string;
}

export interface ActionBase {
  idempotency_key: string;
  client_ts: string;
}

export interface ActionResult {
  ok: boolean;
  already_done: boolean;
  replayed: boolean;
  done_by: { name: string; role: string; at: string } | null;
  [key: string]: unknown;
}

export interface ValidateItem {
  item_id: number | string;
  status: "received" | "missing" | "discrepancy";
  note: string | null;
}

const clean = (q: Record<string, string | number | undefined>) => q;

export function listHandovers(filter: HandoversFilter = {}): Promise<HandoverRow[]> {
  return api.get<HandoverRow[]>("/api/officer/handovers", clean({ ...filter }));
}

export function getHandover(handoverId: number | string): Promise<HandoverDetail> {
  return api.get<HandoverDetail>(`/api/officer/handovers/${encodeURIComponent(String(handoverId))}`);
}

export function validateHandover(handoverId: number | string, base: ActionBase, items: ValidateItem[]): Promise<ActionResult> {
  return api.post<ActionResult>(`/api/officer/handovers/${encodeURIComponent(String(handoverId))}/validate`, { ...base, items });
}

export function resolveInvoice(itemId: number | string, base: ActionBase, note: string | null): Promise<ActionResult> {
  return api.post<ActionResult>(`/api/officer/invoices/${encodeURIComponent(String(itemId))}/resolve`, { ...base, status: "received", note });
}

export function listOutstanding(): Promise<OutstandingItem[]> {
  return api.get<OutstandingItem[]>("/api/officer/outstanding");
}

export function listHistory(filter: { q?: string; from?: string; to?: string; driver_id?: number | string } = {}): Promise<HandoverDetail[]> {
  return api.get<HandoverDetail[]>("/api/officer/history", clean({ ...filter }));
}
