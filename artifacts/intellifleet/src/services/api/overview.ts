// Driver Overview client (docs/TRIP_WORKFLOW.md section 8). Prefix /api/driver-overview.
// Overview v2 (one filter bar, tiles, trip list, trip drawer): GET /trips, /trips/{batch_id}, /hardcopies, /issues, /export.csv.
// The legacy /summary, /board, /drivers/{id}, /map and /live endpoints still exist on the server but the page no longer calls them.
import { api, ensureOk, getStoredSessionId, sessionExpiry, toApiError } from "./client";

const BASE = "/api/driver-overview";

export type TileId = "loading" | "on_road" | "back" | "closed" | "attention";

export interface TripsFilter {
  date?: string;
  from?: string;
  to?: string;
  warehouse?: string;
  q?: string;
  tile?: TileId | "";
}

export interface Gps {
  lat?: number;
  lng?: number;
  accuracy_m?: number;
  [k: string]: unknown;
}

export interface Person {
  user_id?: number;
  name?: string | null;
  role?: string | null;
}

// driver_step(batch) — the same 3-step vocabulary as the driver app's rail.
export interface DriverStep {
  step: 1 | 2 | 3 | "closed";
  label_key: "waiting_crew" | "ready" | "on_road" | "invoices_due" | "closed" | string;
  sub: {
    acknowledged?: number;
    total?: number;
    done?: number;
    current?: number | null;
    current_so?: string | null;
    here_since?: string | null;
    received?: number;
    total_invoices?: number;
    missing?: number;
    discrepancy?: number;
    problems?: number;
  };
}

export type AttentionCode =
  | "no_activity"
  | "not_delivered"
  | "partial"
  | "problem_open"
  | "far_checkin"
  | "no_gps"
  | "invoice_missing"
  | "invoice_discrepancy"
  | "order_removed"
  | "photo_missing";

export interface AttentionFlag {
  code: AttentionCode | string;
  label: string;
  stop_so_id?: string | null;
  event_id?: string | number | null;
}

export interface CrewMember {
  id: number | string | null;
  name: string | null;
  role: "driver" | "helper" | string;
  phone?: string | null;
}

// Contract 2026-10-16: helpers on board rows, crew {driver, helpers} on trip detail.
export interface CrewRef {
  staff_id: number | string;
  name: string;
  phone: string | null;
}
export interface CrewShape {
  driver: CrewRef | null;
  helpers: CrewRef[];
}

export interface TripRow {
  batch_id: string;
  date: string | null;
  vehicle: string | null;
  warehouse?: string | null;
  trip_number: number;
  trips_on_date: number;
  step?: DriverStep | null;
  tile?: Exclude<TileId, "attention"> | null;
  crew?: CrewMember[] | CrewShape | null;
  so_count: number;
  kg: number | null;
  kg_complete?: boolean;
  kg_unknown_lines: number;
  packs: number | null;
  acknowledged: number;
  stops_done: number;
  outcomes?: { delivered: number; partial: number; failed: number };
  invoices?: { total: number; received: number; missing: number; discrepancy: number; with_driver: number; with_officer: number };
  attention?: AttentionFlag[];
  last_crew_activity_at?: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes?: number | null;
  so_numbers?: string[];
  invoice_nos?: string[];
  customers?: string[];
  // keys the pre-v2 /trips rows already had (kept by the server)
  driver_id?: number | null;
  driver_name?: string | null;
  // Plain names (older servers) or, from 2026-10-16, {staff_id, name, phone}.
  helpers?: Array<string | CrewRef | null>;
  state?: string;
  state_label?: string;
  delivered?: number;
  partial?: number;
  failed?: number;
  trip_minutes?: number | null;
  handover_status?: string | null;
}

export interface NotAssigned {
  staff_id: number | string;
  name: string;
  warehouse: string | null;
  phone: string | null;
}

export interface TripsResponse {
  from: string;
  to: string;
  generated_at?: string;
  stale_minutes?: number;
  tile_counts?: Record<TileId, number>;
  orders_line?: { orders: number; delivered: number; partial: number; failed: number; to_go: number };
  total: number;
  trips: TripRow[];
  not_assigned?: NotAssigned[];
}

export interface TimelineAnswer {
  key?: string;
  label: string;
  type?: string;
  value?: unknown;
  note?: string | null;
  photo_url?: string | null;
}

export type PhotoKind = "delivered" | "partial" | "failed" | "problem" | "other" | string;

export interface PhotoMeta {
  photo_id: number | string;
  so_number?: string | null;
  captured_at?: string | null;
  kind?: PhotoKind | null;
  field_key?: string | null;
}

export interface TimelineOrder {
  so_id: string;
  so_number: string;
  // Order type: absent = "SO". TO/PO use the order number as the reference (no invoice/DR number at check-out).
  order_type?: "SO" | "WM" | "PO" | "TO" | null;
  order_reference?: string | null;
  destination_warehouse?: string | null;
  customer_name: string | null;
  address_text: string | null;
  removed?: boolean;
  flags?: string[];
  photos?: PhotoMeta[];
  ack: { at: string | null; received_at?: string | null; by: unknown; template_version: number | null; answers: TimelineAnswer[]; discrepancy_note: string | null; gps?: Gps | null } | null;
  stop: {
    sequence: number | null;
    status: string;
    checkin: { at: string | null; received_at?: string | null; by: unknown; gps: Gps | null; distance_m: number | null; far: boolean | null } | null;
    checkout: { at: string | null; received_at?: string | null; by: unknown; gps: Gps | null; outcome: string | null; reason: string | null; invoice_no?: string | null; answers: TimelineAnswer[]; template_version: number | null; template_name?: string | null } | null;
    minutes_at_stop: number | null;
    address_gps?: { lat: number; lng: number } | null;
  } | null;
  handover: {
    invoice_no?: string | null;
    handed_over: boolean | null;
    crew_note: string | null;
    officer_status: string | null;
    officer_note: string | null;
    checked_at: string | null;
    checked_by: unknown;
    resolved_at?: string | null;
  } | null;
}

export interface TimelineEvent {
  type: string;
  at: string | null;
  received_at?: string | null;
  by?: unknown;
  so_number?: string | null;
  gps?: Gps | null;
  id?: string | number;
  actor_name?: string | null;
  // Who did it: "driver" | "helper" | "officer" | "dispatcher" | "admin" (contract 2026-10-16).
  actor_role?: string | null;
  previous_state?: string | null;
  order_type?: string | null;
  [k: string]: unknown;
}

export type InvoiceStatus = "with_driver" | "with_officer" | "received" | "missing" | "discrepancy" | "not_handed_over" | string;

export interface TripInvoice {
  so_id: string;
  so_number: string;
  invoice_no: string | null;
  status: InvoiceStatus;
  officer_name?: string | null;
  checked_at?: string | null;
  officer_note?: string | null;
}

export interface OtherDay {
  batch_id: string;
  date: string | null;
  vehicle: string | null;
  trip_number?: number | null;
  step?: DriverStep | null;
  tile?: string | null;
}

export interface Timeline {
  batch: Record<string, unknown> & { batch_id?: string; vehicle?: string; delivery_date?: string; warehouse?: string | null; assigned_at?: string | null; so_count?: number };
  trip: {
    status?: string;
    chip_label?: string;
    acknowledged?: number;
    total?: number;
    stops_done?: number;
    started_at?: string | null;
    started_by?: unknown;
    started_gps?: Gps | null;
    ended_at?: string | null;
    ended_by?: unknown;
    ended_gps?: Gps | null;
    end_distance_m?: number | null;
    closed_at?: string | null;
    duration_minutes?: number | null;
    handover_status?: string | null;
    [k: string]: unknown;
  };
  crew: CrewMember[] | CrewShape;
  orders: TimelineOrder[];
  handover?: { status?: string; submitted_at?: string | null; submitted_by?: unknown; officer?: unknown; officer_acknowledged_at?: string | null; note?: string | null } | null;
  events: TimelineEvent[];
  // v2 additions (CONTRACT.md)
  step?: DriverStep | null;
  tile?: string | null;
  attention?: AttentionFlag[];
  invoices?: TripInvoice[];
  issues?: IssueRow[];
  other_days?: OtherDay[];
}

export type TemplateKind = "acknowledge_checklist" | "delivery_checkout";

export interface TemplateItem {
  id?: number;
  key: string;
  label: string;
  item_type: string;
  required: boolean;
  options: string[] | null;
  prefill?: unknown;
  show_when: { key: string; in: unknown[] } | null;
  position?: number;
  active?: boolean;
  app_only?: boolean;
}

export interface Template {
  id: number;
  kind: TemplateKind;
  version: number;
  name: string;
  is_draft: boolean;
  source_note?: string | null;
  items: TemplateItem[];
}

export interface TemplateVersionInfo {
  version: number;
  name: string;
  is_draft: boolean;
  active: boolean;
  created_at: string | null;
}

export interface TemplatesResponse {
  acknowledge_checklist: { active: Template; versions: TemplateVersionInfo[] };
  delivery_checkout: { active: Template; versions: TemplateVersionInfo[] };
}

export interface TemplateSavePayload {
  name: string;
  items: Array<{
    key: string;
    label: string;
    item_type: string;
    required: boolean;
    options: string[] | null;
    prefill: unknown;
    show_when: { key: string; in: unknown[] } | null;
    active: boolean;
    app_only: boolean;
  }>;
}

const q = (o: Record<string, string | number | undefined>) => o;

// Only the filter keys the server knows; date XOR from/to.
function tripParams(f: TripsFilter): Record<string, string | undefined> {
  const range = f.from && f.to ? { from: f.from, to: f.to } : { date: f.date };
  return { ...range, warehouse: f.warehouse || undefined, q: f.q?.trim() || undefined, tile: f.tile || undefined };
}

export function getTrips(f: TripsFilter): Promise<TripsResponse> {
  return api.get<TripsResponse>(`${BASE}/trips`, q(tripParams(f)));
}

export function getTrip(batchId: string): Promise<Timeline> {
  return api.get<Timeline>(`${BASE}/trips/${encodeURIComponent(batchId)}`);
}

export function getTemplates(): Promise<TemplatesResponse> {
  return api.get<TemplatesResponse>(`${BASE}/templates`);
}

export function getTemplateVersion(kind: TemplateKind, version: number): Promise<Template> {
  return api.get<Template>(`${BASE}/templates/${kind}/versions/${version}`);
}

export function saveTemplate(kind: TemplateKind, payload: TemplateSavePayload): Promise<Template> {
  return api.post<Template>(`${BASE}/templates/${kind}`, payload);
}

// Authenticated CSV download: fetch with the bearer header -> blob. The token never appears in a URL.
// Exports exactly the page's filters: date or from/to, warehouse, search (q) and tile.
export async function downloadExport(f: TripsFilter): Promise<{ blob: Blob; filename: string }> {
  const params = tripParams(f);
  const { blob, filename } = await api.download(`${BASE}/export.csv`, q(params));
  const span = params.date ?? `${params.from ?? ""}_${params.to ?? ""}`;
  return { blob, filename: filename && filename !== "sales-orders" ? filename : `driver-overview_${span}.csv` };
}

// Photo media needs the bearer token, so <img src> cannot point at it directly: fetch -> object URL.
// size=thumb for thumbnails, size=full for the viewer (CONTRACT: the server streams bytes, no redirect).
export async function fetchMediaObjectUrl(photoId: number | string, size: "thumb" | "full" = "full"): Promise<string> {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) throw new Error("VITE_API_BASE_URL is not configured");
  const token = getStoredSessionId();
  const url = new URL(`/api/media/${encodeURIComponent(String(photoId))}`, base);
  url.searchParams.set("size", size);
  const path = `/api/media/${encodeURIComponent(String(photoId))}`;
  if (sessionExpiry.redirecting) throw toApiError("GET", path, { status: 401, ok: false, body: null });
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch (error) {
    if (error instanceof TypeError) throw toApiError("GET", path, { status: 0, ok: false, body: null, networkError: error });
    throw error;
  }
  // Same 401 single-flight redirect and error shape as api.* calls.
  await ensureOk(res, "GET", path);
  return URL.createObjectURL(await res.blob());
}

export interface HardCopyRow {
  so_id?: string | null;
  so_number: string | null;
  order_type?: "SO" | "WM" | "PO" | "TO" | null;
  customer_name: string | null;
  invoice_no: string | null;
  state: "with_driver" | "with_officer" | "not_handed_over" | "missing" | "discrepancy" | string;
  state_label: string;
  holder: string | null;
  since: string | null;
  batch_id: string;
  delivery_date: string;
  vehicle?: string | null;
  note: string | null;
}

export interface HardCopiesFilter {
  warehouse?: string;
  q?: string;
  date?: string;
}

export function getHardCopies(f: HardCopiesFilter): Promise<{ generated_at: string; total: number; counts: Record<string, number>; rows: HardCopyRow[] }> {
  return api.get(`${BASE}/hardcopies`, q({ warehouse: f.warehouse || undefined, q: f.q?.trim() || undefined, date: f.date || undefined }));
}

export interface IssueRow {
  id: number;
  reference: string;
  category: string;
  priority: "normal" | "high" | "urgent" | string;
  status: string;
  status_label: string;
  description: string;
  batch_id: string | null;
  so_id?: string | null;
  so_number: string | null;
  vehicle: string | null;
  photo_ids: number[];
  photos?: PhotoMeta[];
  created_at: string | null;
  response: string | null;
  responded_at: string | null;
  responded_by?: string | null;
  reporter: { user_id: number; staff_id: number | null; name: string | null; role: string };
}

export interface IssuesFilter {
  status: string;
  warehouse?: string;
  q?: string;
  date?: string;
}

export function getIssues(f: IssuesFilter): Promise<{ issues: IssueRow[]; statuses: string[] }> {
  return api.get(`${BASE}/issues`, q({ status: f.status, warehouse: f.warehouse || undefined, q: f.q?.trim() || undefined, date: f.date || undefined }));
}

export function respondToIssue(id: number, body: { status: string; response: string | null }): Promise<{ ok: boolean; changed: boolean; issue: IssueRow }> {
  return api.post(`${BASE}/issues/${id}/respond`, body);
}
