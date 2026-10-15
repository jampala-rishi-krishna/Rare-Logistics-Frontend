// Driver Overview client (docs/TRIP_WORKFLOW.md section 8). Prefix /api/driver-overview.
import { api, getStoredSessionId, ApiError } from "./client";

const BASE = "/api/driver-overview";

export interface OverviewFilter {
  date?: string;
  from?: string;
  to?: string;
  warehouse?: string;
  driver_id?: number | string;
}

export interface Summary {
  from: string;
  to: string;
  generated_at: string;
  kpis: {
    drivers: { active: number; on_trip: number; returned: number; idle: number };
    sos: { assigned: number; acknowledged: number; delivered: number; partial: number; failed: number };
    trips_pending_handover: number;
    invoices_outstanding: number;
    issues_open?: number;
    batches?: number;
    kg?: number;
    kg_complete?: boolean;
    kg_unknown_lines?: number;
    packs?: number | null;
  };
}

export type BoardState = "idle" | "to_acknowledge" | "ready" | "on_trip" | "returned" | "handover_pending" | "closed";

export interface BoardRow {
  staff_id: number | string;
  name: string;
  role: "driver" | "helper";
  warehouse: string | null;
  state: BoardState;
  vehicle: string | null;
  batch_id: string | null;
  current_stop: string | null;
  progress: { done: number; total: number } | null;
  state_label?: string;
  acknowledged?: number;
  batch_count?: number;
  kg?: number;
  kg_complete?: boolean;
  kg_unknown_lines?: number;
  packs?: number | null;
  so_numbers?: string[];
  trips?: BoardTrip[];
  last_action: { type: string; at: string; label: string } | null;
  last_gps_at: string | null;
  stale: boolean;
}

export interface BoardTrip {
  batch_id: string;
  trip_number: number;
  trips_on_date: number;
  vehicle: string | null;
  state: BoardState;
  state_label: string;
  so_count: number;
  kg: number;
  kg_complete: boolean;
  kg_unknown_lines: number;
  packs: number | null;
  acknowledged: number;
  stops_done: number;
  role: "driver" | "helper";
}

export interface Board {
  stale_minutes: number;
  rows: BoardRow[];
}

export interface TimelineAnswer {
  label: string;
  type?: string;
  value?: unknown;
  note?: string | null;
  photo_url?: string | null;
}

export interface Gps {
  lat?: number;
  lng?: number;
  accuracy_m?: number;
  [k: string]: unknown;
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
  ack: { at: string | null; by: unknown; template_version: number | null; answers: TimelineAnswer[]; discrepancy_note: string | null } | null;
  stop: {
    sequence: number | null;
    status: string;
    checkin: { at: string | null; by: unknown; gps: Gps | null; distance_m: number | null; far: boolean | null } | null;
    checkout: { at: string | null; by: unknown; gps: Gps | null; outcome: string | null; reason: string | null; invoice_no?: string | null; answers: TimelineAnswer[]; template_version: number | null } | null;
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
  } | null;
}

export interface Timeline {
  batch: Record<string, unknown> & { batch_id?: string; vehicle?: string; delivery_date?: string };
  trip: {
    status?: string;
    chip_label?: string;
    started_at?: string | null;
    ended_at?: string | null;
    duration_minutes?: number | null;
    handover_status?: string | null;
    [k: string]: unknown;
  };
  crew: Array<{ id: number | string; name: string; role: string; phone?: string | null }>;
  orders: TimelineOrder[];
  events: Array<{ type: string; at: string | null; received_at?: string | null; by?: unknown; so_number?: string | null; gps?: Gps | null }>;
}

export interface DriverDetail {
  person: Record<string, unknown> & { name?: string; staff_id?: number | string; role?: string };
  batches: Array<Record<string, unknown> & { batch_id: string; vehicle?: string; delivery_date?: string; trip?: { status?: string; chip_label?: string; duration_minutes?: number | null } }>;
  totals: Record<string, unknown>;
}

export interface MapPoint {
  type: "start" | "stop" | "checkin" | "checkout" | "end";
  lat: number;
  lng: number;
  at: string | null;
  so_number: string | null;
  customer_name: string | null;
  batch_id: string | null;
  driver_name: string | null;
  accuracy_m: number | null;
  outcome: string | null;
}

export interface MapData {
  warehouses: Array<{ id: string | number; name: string; lat: number; lng: number }>;
  points: MapPoint[];
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

export function getSummary(f: OverviewFilter): Promise<Summary> {
  return api.get<Summary>(`${BASE}/summary`, q({ ...f }));
}

export function getBoard(f: OverviewFilter & { status?: string; stale_minutes?: number }): Promise<Board> {
  return api.get<Board>(`${BASE}/board`, q({ ...f }));
}

export function getDriver(staffId: number | string, range: { from?: string; to?: string }): Promise<DriverDetail> {
  return api.get<DriverDetail>(`${BASE}/drivers/${encodeURIComponent(String(staffId))}`, q({ ...range }));
}

export function getTrip(batchId: string): Promise<Timeline> {
  return api.get<Timeline>(`${BASE}/trips/${encodeURIComponent(batchId)}`);
}

export function getMap(f: OverviewFilter): Promise<MapData> {
  return api.get<MapData>(`${BASE}/map`, q({ ...f }));
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
export async function downloadExport(f: { from?: string; to?: string; warehouse?: string; driver_id?: number | string }): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await api.download(`${BASE}/export.csv`, q({ ...f }));
  return { blob, filename: filename && filename !== "sales-orders" ? filename : `driver-overview_${f.from ?? ""}_${f.to ?? ""}.csv` };
}

// Photo / signature media is behind a 302 to a short-lived presigned URL and needs the bearer
// token, so <img src> cannot be used directly. Resolves to an object URL for the image.
export async function fetchMediaObjectUrl(photoId: number | string): Promise<string> {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) throw new Error("VITE_API_BASE_URL is not configured");
  const token = getStoredSessionId();
  const res = await fetch(new URL(`/api/media/${encodeURIComponent(String(photoId))}`, base).toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Could not load photo (HTTP ${res.status})`);
  return URL.createObjectURL(await res.blob());
}

// ---- Phase 2 additions ----

export interface LiveTruck {
  plate: string;
  drivers: string[];
  batch_ids: string[];
  states: string[];
  fix: { lat: number; lng: number; heading: number; speed_kph: number; ignition_on: boolean | null; status: string | null; gps_time: string | null; last_updated: string | null } | null;
}

export function getLive(f: { date?: string; warehouse?: string }): Promise<{ date: string; generated_at: string; trucks: LiveTruck[] }> {
  return api.get(`${BASE}/live`, q({ ...f }));
}

export interface TripRow {
  batch_id: string;
  date: string | null;
  driver_id: number | null;
  driver_name: string | null;
  helpers: Array<string | null>;
  vehicle: string | null;
  trip_number: number;
  trips_on_date: number;
  state: BoardState;
  state_label: string;
  so_count: number;
  kg: number;
  kg_complete: boolean;
  kg_unknown_lines: number;
  packs: number | null;
  acknowledged: number;
  stops_done: number;
  delivered: number;
  partial: number;
  failed: number;
  started_at: string | null;
  ended_at: string | null;
  trip_minutes: number | null;
  handover_status: string | null;
}

export function getTrips(f: OverviewFilter): Promise<{ from: string; to: string; total: number; trips: TripRow[] }> {
  return api.get(`${BASE}/trips`, q({ ...f }));
}

export interface HardCopyRow {
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
  note: string | null;
}

export function getHardCopies(f: { warehouse?: string; driver_id?: string }): Promise<{ generated_at: string; total: number; counts: Record<string, number>; rows: HardCopyRow[] }> {
  return api.get(`${BASE}/hardcopies`, q({ ...f }));
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
  so_number: string | null;
  vehicle: string | null;
  photo_ids: number[];
  created_at: string | null;
  response: string | null;
  responded_at: string | null;
  responded_by?: string | null;
  reporter: { user_id: number; staff_id: number | null; name: string | null; role: string };
}

export function getIssues(status: string): Promise<{ issues: IssueRow[]; statuses: string[] }> {
  return api.get(`${BASE}/issues`, q({ status }));
}

export function respondToIssue(id: number, body: { status: string; response: string | null }): Promise<{ ok: boolean; changed: boolean; issue: IssueRow }> {
  return api.post(`${BASE}/issues/${id}/respond`, body);
}
