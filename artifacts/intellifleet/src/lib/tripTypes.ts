// Payload types for the driver / helper trip workflow (docs/TRIP_WORKFLOW.md sections 3-7).
// Type-only module (no runtime code) so pure libs and node tests can share it.

export type EmailStatus = "queued" | "sent" | "failed" | "skipped" | null;

export interface DriverMe {
  driver_id: number | string;
  name: string;
  title: string | null;
  role?: "driver" | "helper" | string;
  warehouse: string | null;
  phone: string | null;
  dispatch_phone: string | null;
  now: string;
  today: string;
  staff_id?: number | string;
  email?: string | null;
  vehicles_today?: string[];
  crew_today?: CrewMember[];
}

export interface Helper {
  id: number | string;
  name: string;
  phone: string | null;
}

export interface CrewMember {
  id: number | string;
  name: string;
  role: "driver" | "helper" | string;
  phone: string | null;
}

export type TripStatus = "pending" | "on_trip" | "returned" | "handover_submitted" | "closed";
export type TripChip = "to_acknowledge" | "ready" | "on_trip" | "returned" | "handover_pending" | "closed";
export type NextAction =
  | "acknowledge"
  | "start"
  | "check_in"
  | "check_out"
  | "end"
  | "handover"
  | "wait_officer"
  | "none";

export interface TripInfo {
  status: TripStatus;
  chip: TripChip;
  chip_label: string;
  acknowledged: number;
  total: number;
  stops_done: number;
  current_stop_so_id: string | number | null;
  started_at: string | null;
  ended_at: string | null;
  next_action: NextAction;
  can_start: boolean;
  can_end: boolean;
  can_submit_handover: boolean;
  blocker: string | null;
  handover_status: string | null;
  officer: { id: number | string; name: string } | null;
}

export interface Batch {
  batch_id: string;
  delivery_date: string;
  vehicle: string;
  so_count: number;
  total_kg: number;
  kg_complete?: boolean;
  kg_unknown_lines?: number;
  total_packs: number | null; // null = no pack-unit line (unknown), shown as a dash
  trip_number?: number;
  trips_on_date?: number;
  assigned_at?: string | null;
  progress?: { acknowledged: number; stops_done: number; delivered: number; partial: number; failed: number };
  first_area: string | null;
  last_area: string | null;
  departure_time: string | null;
  helpers: Helper[];
  assignment_status: string;
  email_status: EmailStatus;
  stop_order_set: boolean;
  details_loading: boolean;
  trip?: TripInfo | null;
  crew?: CrewMember[];
  ended_at?: string | null;
}

export interface OrderLine {
  name: string;
  quantity: number;
  unit: string | null;
  packs: number | null;
  kg: number | null;
}

export interface OrderContact {
  person: string | null;
  phone: string | null;
  attention: string | null;
}

export interface WhoWhen {
  user_id?: number | string;
  name: string;
  role?: string;
}

export interface OrderWorkflow {
  ack: { at: string; by: WhoWhen; template_version?: number } | null;
  stop: {
    sequence: number;
    status: "pending" | "checked_in" | "checked_out" | string;
    checkin_at: string | null;
    checkin_by: WhoWhen | string | null;
    checkin_distance_m: number | null;
    checkin_far: boolean;
    checkout_at: string | null;
    checkout_by: WhoWhen | string | null;
    outcome: string | null;
    reason: string | null;
    invoice_no?: string | null;
  } | null;
  can_acknowledge: boolean;
  can_check_in: boolean;
  can_check_out: boolean;
  blocker: string | null;
}

export interface DriverOrder {
  id: number | string;
  so_number: string;
  customer_name: string;
  contact: OrderContact | null;
  address_lines: string[];
  address_text: string;
  shipment_date: string | null;
  lines: OrderLine[];
  total_kg: number;
  kg_complete?: boolean;
  kg_unknown_lines?: number;
  total_packs: number | null;
  notes: string | null;
  invoice_hint?: string | null;
  order_status?: string | null;
  shipment_status?: string | null;
  delivery_status: string | null;
  details_loading: boolean;
  workflow?: OrderWorkflow | null;
  // Values the delivery form is prefilled from, keyed by template item `prefill` (or `key`).
  checkout_prefill?: Record<string, unknown> | null;
}

export interface BatchDetail extends Batch {
  orders: DriverOrder[];
}

export interface DaySummary {
  assigned: number;
  completed: number;
  remaining: number;
  needs_attention: number;
  open_issues: number;
  trips: number;
}

export interface DriverToday {
  date: string;
  driver: { id: number | string; name: string };
  summary?: DaySummary;
  batches: Batch[];
}

export type HistoryFilter = "all" | "completed" | "failed";

export interface DriverHistoryPage {
  from: string;
  to: string;
  status: HistoryFilter;
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
  batches: Batch[];
}

export interface IssueItem {
  id: number;
  reference: string;
  category: string;
  priority: "normal" | "high" | "urgent" | string;
  status: string;
  status_label: string;
  description: string;
  batch_id: string | null;
  so_id: string | null;
  so_number: string | null;
  vehicle: string | null;
  photo_ids: number[];
  created_at: string | null;
  response: string | null;
  responded_at: string | null;
}

export interface IssueList {
  issues: IssueItem[];
  categories: string[];
  priorities: string[];
}

export interface AlertItem {
  key: string;
  type: "assigned" | "changed" | "validated" | "issue" | string;
  title: string;
  body: string;
  at: string | null;
  link: string;
  priority: string;
  read: boolean;
}

export interface AlertList {
  alerts: AlertItem[];
  unread: number;
}

export interface DriverHistory {
  from: string;
  to: string;
  batches: Batch[];
}

export type HistoryRange = { days: 7 | 30 } | { from: string; to: string };

// ---- templates ----
export type ChecklistItemType = "checkbox" | "count" | "photo" | "note";
export type CheckoutItemType =
  | "text"
  | "textarea"
  | "dropdown"
  | "radio"
  | "number"
  | "numeric_text"
  | "date"
  | "datetime"
  | "photo"
  | "signature"
  | "checkbox";

export interface ShowWhen {
  key: string;
  in: Array<string | number | boolean>;
}

export interface TemplateItem {
  id: number;
  key: string;
  label: string;
  item_type: ChecklistItemType | CheckoutItemType | string;
  required: boolean;
  options: string[] | null;
  prefill: string | null;
  show_when: ShowWhen | null;
  position: number;
  app_only?: boolean;
}

export interface Template {
  id: number;
  kind: string;
  version: number;
  name: string;
  is_draft: boolean;
  items: TemplateItem[];
}

export interface Templates {
  photo_storage_enabled: boolean;
  acknowledge_checklist: Template;
  delivery_checkout: Template;
}

export interface Officer {
  id: number;
  name: string;
}

// ---- route ----
export interface RouteStop {
  so_id: string | number;
  so_number: string;
  customer_name: string;
  address_text: string;
  sequence: number;
  status: string;
  lat: number | null;
  lng: number | null;
  navigate_url: string | null;
}

export interface RouteInfo {
  source: "optimized" | "assignment" | string;
  origin: { name: string; address: string | null; lat: number | null; lng: number | null } | null;
  stops: RouteStop[];
  maps_links: Array<{ label: string; url: string }>;
  warning: string | null;
}

// ---- action bodies / responses ----
export interface GpsFix {
  lat: number;
  lng: number;
  accuracy_m: number | null;
}

export type GpsDeniedReason = "denied" | "unavailable" | "timeout" | null;

export interface ActionBody {
  idempotency_key: string;
  client_ts: string;
  gps: GpsFix | null;
  gps_denied_reason: GpsDeniedReason;
  [extra: string]: unknown;
}

export interface DoneBy {
  name: string;
  role?: string;
  at: string;
}

export interface ActionResponse {
  ok: boolean;
  already_done: boolean;
  replayed: boolean;
  done_by: DoneBy | null;
  batch: BatchDetail | null;
}

export interface AckAnswer {
  item_id: number;
  checked: boolean | null;
  count: number | null;
  text: string | null;
  photo_id: number | null;
  note: string | null;
}

export interface HandoverItemInput {
  so_id: string;
  handed_over: boolean;
  note: string | null;
}

// ---- timeline ----
export interface TimelineAnswer {
  label: string;
  type?: string;
  value: unknown;
  note?: string | null;
  photo_url?: string | null;
}

export interface TimelineOrder {
  so_id: string | number;
  so_number: string;
  customer_name: string;
  address_text: string;
  ack: {
    at: string;
    by: WhoWhen | string | null;
    template_version?: number;
    answers: TimelineAnswer[];
    discrepancy_note: string | null;
  } | null;
  stop: {
    sequence: number;
    status: string;
    checkin: { at: string; by: WhoWhen | string | null; gps: GpsFix | null; distance_m: number | null; far: boolean } | null;
    checkout: {
      at: string;
      by: WhoWhen | string | null;
      gps: GpsFix | null;
      outcome: string | null;
      reason: string | null;
      answers: TimelineAnswer[];
      template_version?: number;
    } | null;
    minutes_at_stop: number | null;
  } | null;
  handover: {
    handed_over: boolean;
    crew_note: string | null;
    officer_status: string | null;
    officer_note: string | null;
    checked_at: string | null;
    checked_by: WhoWhen | string | null;
  } | null;
}

export interface TimelineEvent {
  type: string;
  at: string;
  received_at?: string;
  by: WhoWhen | string | null;
  so_number: string | null;
  gps: GpsFix | null;
}

export interface Timeline {
  batch: Batch;
  trip: TripInfo & { duration_minutes?: number | null };
  crew: CrewMember[];
  orders: TimelineOrder[];
  events: TimelineEvent[];
}
