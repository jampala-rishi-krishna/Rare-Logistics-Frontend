// Typed client for the Fleet Health API (/api/fleet-health/*).
// Types are derived from the real responses of backend/routers/fleet_health.py.
import { api } from "./client";

const BASE = "/api/fleet-health";

// ---------------------------------------------------------------------------------------------- shared vocab
export type ServiceKey = "oil_change" | "tires" | "brakes" | "reefer_service" | "general_pms" | "battery";
export type ServiceStatus = "ok" | "due_soon" | "overdue" | "no_record" | "not_tracked";
export type TruckKind = "tracked" | "no_tracker" | "third_party";
export type TrackerStatus = "live" | "stale" | "no_data";
export type RiskBand = "low" | "medium" | "high";
export type EcoBand = "great" | "good" | "watch" | "poor" | "none";
export type FlagSource = "manual" | "checklist" | "battery" | "fuel" | "overload" | "voice" | "email" | "whatsapp" | "driver_app";
export type FlagSeverity = "info" | "warning" | "critical";
export type ChecklistValue = "ok" | "issue" | "na";
export type ChecklistItemKey = "tires" | "lights" | "brakes" | "leaks" | "mirrors_wipers" | "body_damage" | "reefer_running" | "documents";
export type RecordKind = "service" | "repair" | "inspection";
export type BatteryStatus = "no_data" | "ok" | "warning" | "critical";

export interface TrackerInfo {
  kind: TruckKind;
  status: TrackerStatus | null;
  last_seen: string | null;
  label: string;
}

export interface IntervalView {
  km: number | null;
  engine_hours: number | null;
  days: number | null;
  confirmed: boolean;
  scope: "fleet" | "truck";
}

export interface UsageComponent {
  since: number;
  interval: number;
  pct: number;
}

export interface ServiceState {
  status: ServiceStatus;
  usage_pct: number | null;
  driven_by?: "km" | "engine_hours" | "days";
  components: Partial<Record<"km" | "engine_hours" | "days", UsageComponent>>;
  interval?: IntervalView;
  last_service_on?: string;
  label?: string;
  engine_hours_partial?: boolean;
  note?: string;
}

export interface RiskBreakdownItem {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
  formula: string;
}

export interface Risk {
  score: number;
  band: RiskBand;
  breakdown: RiskBreakdownItem[];
  any_overdue: boolean;
  needs_attention: boolean;
}

export interface Flag {
  id: number;
  vehicle_id: number;
  source: FlagSource;
  severity: FlagSeverity;
  message: string;
  ref: string | null;
  photo_ref: string | null;
  reported_by: string | null;
  resolution_note: string | null;
  resolved_by: string | number | null;
  occurred_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface LastChecklist {
  id: number;
  checked_at: string;
  passed: boolean;
}

export interface BatteryLatest {
  status: BatteryStatus;
  reasons: string[];
  date: string;
  parked_min: number | null;
  running_avg: number | null;
  system: 12 | 24 | null;
}

/** A maintained truck or motorcycle row (GET /trucks). */
export interface MaintainedTruck {
  id: number;
  plate: string;
  vehicle_type: string;
  is_reefer: boolean | null;
  tracker: TrackerInfo;
  locked_reason: string | null;
  capacity_unconfirmed: boolean;
  kind: "tracked" | "no_tracker";
  odometer_km: number | null;
  services: Partial<Record<ServiceKey, ServiceState>>;
  risk: Risk;
  open_flags: Flag[];
  open_flags_count: number;
  critical_flags_count: number;
  last_checklist: LastChecklist | null;
  failed_checklists_7d: number;
  battery: BatteryLatest | null;
  in_repair_record: boolean;
  offer_repair_record: boolean;
}

export interface ThirdPartyTruck {
  id: number;
  plate: string;
  vehicle_type: string;
  is_reefer: boolean | null;
  tracker: TrackerInfo;
  locked_reason: string | null;
  capacity_unconfirmed: boolean;
  kind: "third_party";
  message: string;
}

export type FleetTruck = MaintainedTruck | ThirdPartyTruck;

export interface ServiceTypeInfo {
  key: ServiceKey;
  label: string;
}

// ---------------------------------------------------------------------------------------------- summary / trucks
export interface Kpis {
  trucks_needing_attention: number | null;
  maintained_trucks: number | null;
  services_overdue: number | null;
  open_issues: number | null;
  fleet_kmpl_30d: number | null;
  co2_month_kg: number | null;
  co2_month_litres: number | null;
  avg_eco_score_last_week: number | null;
  eco_scored_drivers: number | null;
  eco_week_start: string | null;
}

export interface NeedsAttentionItem {
  id: number;
  plate: string;
  risk: Risk;
  overdue: string[];
  critical_flags: number;
}

export interface RiskWeights {
  service_overdue_points: number;
  service_due_soon_points: number;
  flag_points: { critical: number; warning: number; info: number };
  flag_cap: number;
  failed_checklist_points: number;
  failed_checklist_cap: number;
  failed_checklist_days: number;
  overload_points: number;
  overload_cap: number;
  overload_days: number;
  repair_points: number;
  repair_cap: number;
  repair_days: number;
}

export interface EcoWeights {
  speeding_per_100km_seconds: number;
  speeding_cap: number;
  harsh_per_100km_events: number;
  harsh_cap: number;
  idle_elsewhere_min_per_driving_hour: number;
  idle_cap: number;
  kmpl_below_average_pct: number;
  kmpl_cap: number;
}

export interface FleetSummary {
  generated_at: string;
  data_through: string;
  kpis: Kpis;
  intervals_unconfirmed: boolean;
  needs_attention: NeedsAttentionItem[];
  risk_weights: RiskWeights;
  eco_weights: EcoWeights;
  eco_min_km: number;
  co2_kg_per_litre: number;
}

export interface TrucksResponse {
  generated_at: string;
  service_types: ServiceTypeInfo[];
  intervals_unconfirmed: boolean;
  trucks: FleetTruck[];
}

// ---------------------------------------------------------------------------------------------- truck detail
export interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  kind: RecordKind;
  service_type: ServiceKey | null;
  performed_on: string;
  odometer_km: number | null;
  engine_hours: number | null;
  downtime_start: string | null;
  downtime_end: string | null;
  reason: string | null;
  cost_php: number | null;
  vendor: string | null;
  notes: string | null;
  receipt_ref: string | null;
  created_by?: number | null;
}

export interface ServiceIntervalRow {
  id: number;
  vehicle_id: number | null;
  service_type: ServiceKey;
  interval_km: number | null;
  interval_engine_hours: number | null;
  interval_days: number | null;
  active: boolean;
  confirmed: boolean;
  updated_at?: string;
}

export interface IntervalPair {
  service_type: ServiceKey;
  label: string;
  default: ServiceIntervalRow | null;
  override: ServiceIntervalRow | null;
  effective: ServiceIntervalRow | null;
  confirmed: boolean;
}

export interface ChecklistRecord {
  id: number;
  vehicle_id: number;
  staff_id: number | null;
  checked_at: string;
  items: Record<ChecklistItemKey, ChecklistValue>;
  reefer_temp_c: number | null;
  notes: string | null;
  passed: boolean;
  entered_by: number | null;
}

export interface DailyPoint {
  date: string;
  km: number | null;
  engine_hours: number | null;
  trips: number | null;
  assigned: boolean;
  idle_total_min: number | null;
  speeding_seconds: number | null;
  harsh: number | null;
  partial_day: boolean;
}

export interface BatteryPoint {
  date: string;
  parked_min: number | null;
  running_avg: number | null;
  system: 12 | 24 | null;
  status: BatteryStatus;
  reasons: string[];
}

export interface FuelLogBase {
  id: number;
  vehicle_id: number;
  staff_id: number | null;
  filled_at: string;
  litres: number;
  amount_php: number;
  odometer_km: number | null;
  full_tank: boolean;
  station: string | null;
  receipt_ref: string | null;
  price_per_litre: number | null;
}

export interface KmplInterval {
  start_at: string;
  end_at: string;
  km: number;
  litres: number;
  kmpl: number;
}

export interface FuelLogCheck {
  fill_id: number | null;
  filled_at: string;
  reason: string;
}

export interface TruckDetail {
  truck: FleetTruck;
  records?: MaintenanceRecord[];
  intervals?: IntervalPair[];
  flags?: Flag[];
  checklists?: ChecklistRecord[];
  daily?: DailyPoint[];
  battery_series?: BatteryPoint[];
  fuel_logs?: FuelLogBase[];
  kmpl_intervals?: KmplInterval[];
  fuel_checks?: FuelLogCheck[];
  has_tracker?: boolean;
}

// ---------------------------------------------------------------------------------------------- eco
export interface EcoTotals {
  km: number;
  assigned_km: number;
  unassigned_km: number;
  engine_hours: number;
  driving_hours: number;
  speeding_events: number;
  speeding_seconds: number;
  harsh_events: number;
  idle_total_min: number;
  idle_at_stop_min: number;
  idle_elsewhere_min: number;
  unclassified_idle_min: number;
  max_speed_kmh: number;
  days: number;
}

export interface EcoBreakdownItem {
  key: "speeding" | "harsh" | "idle" | "kmpl" | string;
  label: string;
  penalty: number;
  cap: number;
  detail: string;
  formula: string;
}

export interface EcoDriver {
  score: number | null;
  status: "scored" | "not_enough_data";
  reason: string | null;
  totals: EcoTotals;
  breakdown: EcoBreakdownItem[];
  staff_id: number;
  trucks: string[];
  kmpl: number | null;
  name: string;
  band: EcoBand;
  previous_score: number | null;
  trend: number | null;
  rank: number | null;
}

export interface EcoDriversResponse {
  week_start: string;
  week_end: string;
  min_km: number;
  weights: EcoWeights;
  fleet_kmpl_30d: number | null;
  drivers: EcoDriver[];
  summary: { avg_score: number | null; scored: number; not_enough_data: number };
  unassigned: { km: number; days: number; note: string };
}

export interface EcoTruckRollup {
  vehicle_id: number;
  plate: string;
  totals: EcoTotals;
  days_with_data: number;
  kmpl: number | null;
  kmpl_intervals: number;
  litres: number | null;
  spend_php: number | null;
  co2_kg: number | null;
  capacity_unconfirmed: boolean;
}

export interface EcoTrucksResponse {
  from: string;
  to: string;
  trucks: EcoTruckRollup[];
  fleet: EcoTotals;
}

export interface SensorCheck {
  vehicle_id: number;
  plate: string | null;
  date: string;
  kind: "parked_drop" | "refuel";
  litres_est: number;
  text: string;
}

export interface LogCheck {
  fill_id: number | null;
  filled_at: string;
  reason: string;
  vehicle_id: number;
  plate: string | null;
}

export interface FuelChecksResponse {
  days: number;
  sensor_checks: SensorCheck[];
  log_checks: LogCheck[];
  label: string;
}

export interface Co2Month {
  month: string;
  litres: number;
  co2_kg: number;
  trucks: Record<string, { litres: number; co2_kg: number }>;
}

export interface Co2Response {
  kg_per_litre: number;
  formula: string;
  months: Co2Month[];
}

export interface FuelLogRow extends FuelLogBase {
  plate: string | null;
  kmpl: number | null;
  interval_km: number | null;
  check: string | null;
  capacity_unconfirmed: boolean;
}

export interface FuelLogsResponse {
  count: number;
  logs: FuelLogRow[];
}

export interface ScorecardSwitch {
  enabled: boolean;
  changed_by: string | null;
  changed_at: string | null;
  default: boolean;
  schedule: string;
  whatsapp_active: boolean;
}

export interface ScorecardItem {
  staff_id: number;
  name: string;
  score: number | null;
  trucks: string[];
  message: string | null;
  has_phone: boolean;
  will_send: boolean;
  skip_reason: string | null;
}

export interface ScorecardResponse {
  switch: ScorecardSwitch;
  preview: { week_start: string; week_end: string; items: ScorecardItem[]; will_send_count: number };
}

// ---------------------------------------------------------------------------------------------- request bodies
export interface MaintenanceRecordBody {
  vehicle_id?: number;
  kind: RecordKind;
  service_type?: ServiceKey | null;
  performed_on: string; // YYYY-MM-DD, not in the future
  odometer_km?: number | null;
  engine_hours?: number | null;
  downtime_start?: string | null; // ISO date-time; no offset = Manila
  downtime_end?: string | null;
  reason?: string | null;
  cost_php?: number | null;
  vendor?: string | null;
  notes?: string | null;
  receipt_ref?: string | null; // link or reference only
}

export interface ServiceIntervalBody {
  service_type: ServiceKey;
  vehicle_id?: number | null; // omit/null = fleet default
  interval_km?: number | null;
  interval_engine_hours?: number | null;
  interval_days?: number | null;
  active?: boolean;
  confirmed?: boolean; // saving confirms unless false
}

export interface FuelLogBody {
  vehicle_id?: number;
  filled_at: string; // ISO date-time, not in the future
  litres: number;
  amount_php: number;
  odometer_km?: number | null;
  full_tank?: boolean;
  station?: string | null;
  receipt_ref?: string | null;
  staff_id?: number | null;
}

export interface ChecklistBody {
  vehicle_id: number;
  items: Record<ChecklistItemKey, ChecklistValue>;
  reefer_temp_c?: number | null;
  notes?: string | null;
  staff_id?: number | null;
  checked_at?: string;
}

export interface ChecklistResult {
  id: number;
  vehicle_id: number;
  checked_at: string;
  items: Record<ChecklistItemKey, ChecklistValue>;
  passed: boolean;
  reefer_temp_c: number | null;
  notes: string | null;
  flag: { created: boolean; flag: Flag } | null;
}

export interface IssueBody {
  vehicle: number | string;
  source: FlagSource;
  severity: FlagSeverity;
  message: string;
  ref?: string | null;
  photo_ref?: string | null;
  reported_by?: string | null;
  occurred_at?: string | null;
}

export interface IssueResult {
  created: boolean;
  flag: Flag;
}

// ---------------------------------------------------------------------------------------------- calls
export const getSummary = () => api.get<FleetSummary>(`${BASE}/summary`);
export const getTrucks = () => api.get<TrucksResponse>(`${BASE}/trucks`);
export const getTruckDetail = (id: number) => api.get<TruckDetail>(`${BASE}/trucks/${id}`);

export const getEcoDrivers = (week?: string) => api.get<EcoDriversResponse>(`${BASE}/eco/drivers`, { week });
export const getEcoTrucks = (from?: string, to?: string) => api.get<EcoTrucksResponse>(`${BASE}/eco/trucks`, { from, to });
export const getFuelChecks = (days = 30) => api.get<FuelChecksResponse>(`${BASE}/eco/fuel-checks`, { days });
export const getCo2 = (months = 12) => api.get<Co2Response>(`${BASE}/eco/co2`, { months });
export const getFuelLogs = (vehicleId?: number, limit = 100) => api.get<FuelLogsResponse>(`${BASE}/fuel-logs`, { vehicle_id: vehicleId, limit });
export const getScorecard = (week?: string) => api.get<ScorecardResponse>(`${BASE}/eco/scorecard`, { week });

export const createFuelLog = (body: FuelLogBody) => api.post<FuelLogBase>(`${BASE}/fuel-logs`, body);
export const updateFuelLog = (id: number, body: FuelLogBody) => api.put<FuelLogBase>(`${BASE}/fuel-logs/${id}`, body);
export const deleteFuelLog = (id: number) => api.delete<null>(`${BASE}/fuel-logs/${id}`);

export const createRecord = (body: MaintenanceRecordBody) => api.post<MaintenanceRecord>(`${BASE}/maintenance-records`, body);
export const updateRecord = (id: number, body: MaintenanceRecordBody) => api.put<MaintenanceRecord>(`${BASE}/maintenance-records/${id}`, body);
export const deleteRecord = (id: number) => api.delete<null>(`${BASE}/maintenance-records/${id}`);

export const putInterval = (body: ServiceIntervalBody) => api.put<ServiceIntervalRow>(`${BASE}/service-intervals`, body);
export const deleteInterval = (id: number) => api.delete<null>(`${BASE}/service-intervals/${id}`);

export const createChecklist = (body: ChecklistBody) => api.post<ChecklistResult>(`${BASE}/pretrip-checklists`, body);
export const resolveFlag = (id: number, note?: string) => api.post<Flag>(`${BASE}/flags/${id}/resolve`, { note: note || undefined });
export const createIssue = (body: IssueBody) => api.post<IssueResult>(`${BASE}/issues`, body);
export const setScorecardEnabled = (enabled: boolean) => api.put<ScorecardSwitch>(`${BASE}/eco/scorecard`, { enabled });
