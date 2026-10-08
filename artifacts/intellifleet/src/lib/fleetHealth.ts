// Pure, framework-free helpers for the Fleet Health page. No React, no fetch, no Date.now() unless injected.
import type {
  BatteryPoint,
  BatteryStatus,
  ChecklistItemKey,
  ChecklistValue,
  Co2Month,
  DailyPoint,
  EcoBand,
  EcoBreakdownItem,
  EcoTotals,
  EcoWeights,
  FleetTruck,
  FlagSeverity,
  FlagSource,
  IntervalView,
  Kpis,
  MaintainedTruck,
  NeedsAttentionItem,
  RiskBand,
  RiskBreakdownItem,
  ServiceKey,
  ServiceState,
  ServiceStatus,
  TrackerInfo,
} from "../services/api/fleetHealth.ts";

export const TZ = "Asia/Manila";
export const EM_DASH = "—";

// ------------------------------------------------------------------------------------------------ tone tokens
export type Tone = "ok" | "soon" | "over" | "none" | "info" | "brand";

export interface ToneTokens {
  fg: string;
  bg: string;
  border: string;
  solid: string;
}

export const TONES: Record<Tone, ToneTokens> = {
  ok: { fg: "#1e7b44", bg: "#eaf5ee", border: "#bfdcc9", solid: "#1e7b44" },
  soon: { fg: "#8a5a00", bg: "#fff6dd", border: "#e6c36a", solid: "#d89b00" },
  over: { fg: "#a32720", bg: "#fdeeed", border: "#f0c4c1", solid: "#c4291f" },
  none: { fg: "#77787b", bg: "#f2f2ef", border: "#d8d7d2", solid: "#b9b8b3" },
  info: { fg: "#33673B", bg: "#eef4ef", border: "#cddfd2", solid: "#33673B" },
  brand: { fg: "#86000B", bg: "#fbeeee", border: "#ecc7ca", solid: "#86000B" },
};

// ------------------------------------------------------------------------------------------------ services
export const SERVICE_ORDER: ServiceKey[] = ["oil_change", "tires", "brakes", "reefer_service", "general_pms", "battery"];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  oil_change: "Oil",
  tires: "Tyres",
  brakes: "Brakes",
  reefer_service: "Reefer",
  general_pms: "PMS",
  battery: "Battery",
};

export const SERVICE_LONG_LABELS: Record<ServiceKey, string> = {
  oil_change: "Oil change",
  tires: "Tyres",
  brakes: "Brakes",
  reefer_service: "Reefer unit service",
  general_pms: "General PMS",
  battery: "Battery",
};

export const DUE_SOON_FROM_PCT = 80;
export const OVERDUE_ABOVE_PCT = 100;

export function serviceTone(status: ServiceStatus | undefined): Tone {
  if (status === "ok") return "ok";
  if (status === "due_soon") return "soon";
  if (status === "overdue") return "over";
  return "none";
}

export function serviceStatusLabel(status: ServiceStatus | undefined): string {
  if (status === "ok") return "OK";
  if (status === "due_soon") return "Due soon";
  if (status === "overdue") return "Overdue";
  if (status === "not_tracked") return "Not tracked";
  return "No record";
}

/** Bar width 0-100 for a service usage %. Anything past 100% is a full bar (the label carries the real number). */
export function usageBarFill(pct: number | null | undefined): number {
  if (pct == null || !Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

export function formatUsage(pct: number | null | undefined): string {
  return pct == null || !Number.isFinite(pct) ? EM_DASH : `${Math.round(pct)}%`;
}

export function intervalText(interval: Pick<IntervalView, "km" | "engine_hours" | "days"> | null | undefined): string {
  if (!interval) return "No interval set";
  const parts: string[] = [];
  if (interval.km) parts.push(`${formatNumber(interval.km)} km`);
  if (interval.engine_hours) parts.push(`${formatNumber(interval.engine_hours)} engine h`);
  if (interval.days) parts.push(`${formatNumber(interval.days)} days`);
  return parts.length ? parts.join(" or ") : "No interval set";
}

export interface ServiceTipLine {
  label: string;
  text: string;
  driving: boolean;
}

/** Lines for a service bar tooltip: usage %, then each measured component, then the interval + its confirmation state. */
export function serviceTipLines(service: ServiceState | undefined, label: string): { title: string; lines: ServiceTipLine[]; footer: string } {
  if (!service) return { title: label, lines: [], footer: "Not tracked for this vehicle." };
  const title = service.status === "no_record" || service.usage_pct == null ? `${label}: no record` : `${label}: ${formatUsage(service.usage_pct)} of interval used`;
  const lines: ServiceTipLine[] = [];
  const c = service.components ?? {};
  if (c.km) lines.push({ label: "Distance", text: `${formatNumber(c.km.since)} of ${formatNumber(c.km.interval)} km (${Math.round(c.km.pct)}%)`, driving: service.driven_by === "km" });
  if (c.engine_hours) lines.push({ label: "Engine hours", text: `${formatNumber(c.engine_hours.since, 1)} of ${formatNumber(c.engine_hours.interval)} h (${Math.round(c.engine_hours.pct)}%)`, driving: service.driven_by === "engine_hours" });
  if (c.days) lines.push({ label: "Time", text: `${formatNumber(c.days.since)} of ${formatNumber(c.days.interval)} days (${Math.round(c.days.pct)}%)`, driving: service.driven_by === "days" });
  let footer = "";
  if (service.interval) {
    footer = `Interval: ${intervalText(service.interval)} (${service.interval.scope === "truck" ? "this truck" : "fleet default"}). ${service.interval.confirmed ? "Confirmed." : "Placeholder, not yet confirmed with logistics."}`;
  }
  if (service.status === "no_record") {
    footer = `${service.note ? service.note[0].toUpperCase() + service.note.slice(1) + ". " : "No service has been logged yet. "}${footer}`.trim();
  }
  if (service.engine_hours_partial) footer = `${footer} Engine hours are counted from the first day of tracker data.`.trim();
  return { title, lines, footer };
}

/** The worst (highest-usage) measured service of a truck, for a quick summary. */
export function worstService(truck: MaintainedTruck): { key: ServiceKey; state: ServiceState } | null {
  let best: { key: ServiceKey; state: ServiceState } | null = null;
  for (const key of SERVICE_ORDER) {
    const state = truck.services[key];
    if (!state || state.usage_pct == null) continue;
    if (!best || (state.usage_pct ?? 0) > (best.state.usage_pct ?? 0)) best = { key, state };
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ tracker / risk / eco tokens
export function trackerTone(tracker: TrackerInfo | undefined): Tone {
  if (!tracker) return "none";
  if (tracker.kind === "third_party" || tracker.kind === "no_tracker") return "none";
  if (tracker.status === "live") return "ok";
  if (tracker.status === "stale") return "soon";
  return "none";
}

export function trackerLabel(tracker: TrackerInfo | undefined): string {
  return tracker?.label || "No tracker";
}

export const RISK_BAND_LABELS: Record<RiskBand, string> = { low: "Low", medium: "Medium", high: "High" };

export function riskTone(band: RiskBand | undefined): Tone {
  if (band === "high") return "over";
  if (band === "medium") return "soon";
  return "ok";
}

export const ECO_BAND_LABELS: Record<EcoBand, string> = { great: "Great", good: "Good", watch: "Watch", poor: "Poor", none: "No score" };

export function ecoTone(band: EcoBand | undefined): Tone {
  if (band === "great") return "ok";
  if (band === "good") return "info";
  if (band === "watch") return "soon";
  if (band === "poor") return "over";
  return "none";
}

/** Score bands as the backend defines them (eco.score_band). */
export function ecoBandFor(score: number | null | undefined): EcoBand {
  if (score == null) return "none";
  return score >= 85 ? "great" : score >= 70 ? "good" : score >= 50 ? "watch" : "poor";
}

export function trendMeta(trend: number | null | undefined): { symbol: string; text: string; tone: Tone; label: string } {
  if (trend == null) return { symbol: EM_DASH, text: EM_DASH, tone: "none", label: "No score last week to compare with" };
  if (trend > 0) return { symbol: "▲", text: `+${trend}`, tone: "ok", label: `Up ${trend} points vs last week` };
  if (trend < 0) return { symbol: "▼", text: `${trend}`, tone: "over", label: `Down ${Math.abs(trend)} points vs last week` };
  return { symbol: "=", text: "0", tone: "none", label: "Same as last week" };
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** width as % of the bar */
  width: number;
  detail: string;
  formula: string;
}

/** Risk breakdown as a stacked bar on a 0-100 scale (points are already out of 100 in total). */
export function riskSegments(breakdown: RiskBreakdownItem[]): Segment[] {
  return breakdown
    .filter((b) => b.points > 0)
    .map((b) => ({ key: b.key, label: b.label, value: b.points, width: Math.min(100, b.points), detail: b.detail, formula: b.formula }));
}

/** Eco penalties as a bar on a 0-100 scale: what was lost from a perfect 100. */
export function ecoSegments(breakdown: EcoBreakdownItem[]): Segment[] {
  return breakdown
    .filter((b) => b.penalty > 0)
    .map((b) => ({ key: b.key, label: b.label, value: b.penalty, width: Math.min(100, b.penalty), detail: b.detail, formula: b.formula }));
}

export function ecoFormulaLines(weights: EcoWeights): string[] {
  return [
    `Score = 100 minus penalties (never below 0).`,
    `Speeding: seconds over the limit per 100 km x ${weights.speeding_per_100km_seconds}, max ${weights.speeding_cap}.`,
    `Harsh driving: events per 100 km x ${weights.harsh_per_100km_events}, max ${weights.harsh_cap}.`,
    `Idling away from stops: idle minutes per driving hour x ${weights.idle_elsewhere_min_per_driving_hour}, max ${weights.idle_cap}.`,
    `Fuel economy: % below fleet-average km/L x ${weights.kmpl_below_average_pct}, max ${weights.kmpl_cap}.`,
  ];
}

// ------------------------------------------------------------------------------------------------ number formatting
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return value.toLocaleString("en-PH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatKm(value: number | null | undefined, decimals = 0): string {
  return value == null || !Number.isFinite(value) ? EM_DASH : `${formatNumber(value, decimals)} km`;
}

export function formatLitres(value: number | null | undefined, decimals = 1): string {
  return value == null || !Number.isFinite(value) ? EM_DASH : `${formatNumber(value, decimals)} L`;
}

export function formatKmpl(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? EM_DASH : `${formatNumber(value, 2)} km/L`;
}

export function formatKg(value: number | null | undefined, decimals = 0): string {
  return value == null || !Number.isFinite(value) ? EM_DASH : `${formatNumber(value, decimals)} kg`;
}

/** Peso amount with thousands separators. Whole pesos drop the decimals unless `decimals` is given. */
export function formatPeso(value: number | null | undefined, decimals?: number): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  const places = decimals ?? (Number.isInteger(value) ? 0 : 2);
  return `₱${formatNumber(value, places)}`;
}

export function formatPesoPerLitre(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? EM_DASH : `₱${formatNumber(value, 2)}/L`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return EM_DASH;
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return EM_DASH;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return formatMinutes(seconds / 60);
}

export function formatHours(hours: number | null | undefined, decimals = 1): string {
  return hours == null || !Number.isFinite(hours) ? EM_DASH : `${formatNumber(hours, decimals)} h`;
}

/** Human downtime between two ISO instants ("3 d 4 h"); an open downtime runs until `now`. */
export function formatDowntime(startIso: string | null, endIso: string | null, now: Date): string {
  if (!startIso) return EM_DASH;
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return EM_DASH;
  const totalMin = Math.round((end - start) / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return mins ? `${hours} h ${mins} min` : `${hours} h`;
  return `${mins} min`;
}

// ------------------------------------------------------------------------------------------------ dates (Asia/Manila)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parseYmd(value: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function ymdToString({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function ymdWeekday(p: Ymd): number {
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

/** Manila calendar parts of an instant. */
export function manilaParts(instant: Date | string): { y: number; m: number; d: number; hh: number; mm: number; weekday: number } | null {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(get("weekday"));
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), hh: Number(get("hour")), mm: Number(get("minute")), weekday };
}

/** Today's date in Manila as YYYY-MM-DD. */
export function manilaToday(now: Date): string {
  const p = manilaParts(now);
  return p ? ymdToString(p) : "";
}

/** The Manila calendar date (YYYY-MM-DD) of an instant, or the date itself when given a plain date. */
export function manilaDate(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const p = manilaParts(value);
  return p ? ymdToString(p) : "";
}

export function addDays(date: string, days: number): string {
  const p = parseYmd(date);
  if (!p) return date;
  const ms = Date.UTC(p.y, p.m - 1, p.d) + days * 86_400_000;
  const next = new Date(ms);
  return ymdToString({ y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() });
}

export function daysBetween(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** "8 Oct 2026" for a date or an instant (rendered in Manila). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EM_DASH;
  const day = manilaDate(value);
  const p = parseYmd(day);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : EM_DASH;
}

/** "8 Oct" without the year. */
export function formatDayMonth(value: string | null | undefined): string {
  if (!value) return EM_DASH;
  const p = parseYmd(manilaDate(value));
  return p ? `${p.d} ${MONTHS[p.m - 1]}` : EM_DASH;
}

/** "Mon 28 Sep". */
export function formatWeekdayDay(value: string | null | undefined): string {
  if (!value) return EM_DASH;
  const p = parseYmd(manilaDate(value));
  return p ? `${WEEKDAYS[ymdWeekday(p)]} ${p.d} ${MONTHS[p.m - 1]}` : EM_DASH;
}

/** "8 Oct 2026, 2:58 PM" in Manila. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EM_DASH;
  const p = manilaParts(value);
  if (!p) return EM_DASH;
  const hour12 = p.hh % 12 === 0 ? 12 : p.hh % 12;
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${hour12}:${String(p.mm).padStart(2, "0")} ${p.hh >= 12 ? "PM" : "AM"}`;
}

/** "Mon 28 Sep – Sun 4 Oct" */
export function weekRangeLabel(start: string, end: string): string {
  return `${formatWeekdayDay(start)} – ${formatWeekdayDay(end)}`;
}

/** Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const p = parseYmd(date);
  if (!p) return date;
  const offset = (ymdWeekday(p) + 6) % 7;
  return addDays(date, -offset);
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return addDays(weekStart, weeks * 7);
}

/** Month key "2026-09" to "Sep 2026" / "Sep" when `short`. */
export function formatMonth(key: string, short = false): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const name = MONTHS[Number(match[2]) - 1];
  return short ? name : `${name} ${match[1]}`;
}

/** "3 days ago" / "today" / "yesterday" relative to Manila `now`. */
export function relativeDay(value: string | null | undefined, now: Date): string {
  if (!value) return EM_DASH;
  const diff = daysBetween(manilaDate(value), manilaToday(now));
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff} days ago`;
}

/** value for <input type="datetime-local"> in Manila from an instant. */
export function toManilaInputValue(instant: Date): string {
  const p = manilaParts(instant);
  if (!p) return "";
  return `${ymdToString(p)}T${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

/** Convert a <input type="datetime-local"> value (Manila wall clock) into an ISO string with the +08:00 offset. */
export function manilaInputToIso(value: string): string {
  if (!value) return "";
  const v = value.length === 16 ? `${value}:00` : value;
  return `${v}+08:00`;
}

/** Instant for a Manila date + wall clock, for tests and "not in the future" checks. */
export function manilaInputToDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(manilaInputToIso(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

// ------------------------------------------------------------------------------------------------ KPIs
export interface KpiTileData {
  key: string;
  label: string;
  value: string;
  unit?: string;
  /** shown under the value */
  detail: string;
  /** set when the value is unknown: a short reason */
  reason: string | null;
  tooltip: string[];
  tone: Tone;
}

/** The six KPI tiles from /summary. A null value is "—" with a reason, never a fake 0. */
export function buildKpiTiles(kpis: Kpis, co2KgPerLitre = 2.68, ecoMinKm = 50): KpiTileData[] {
  const maintained = kpis.maintained_trucks;
  const attention = kpis.trucks_needing_attention;
  return [
    {
      key: "attention",
      label: "Trucks needing attention",
      value: attention == null ? EM_DASH : formatNumber(attention),
      detail: maintained == null ? "" : `of ${formatNumber(maintained)} maintained vehicles`,
      reason: attention == null ? "no fleet data yet" : null,
      tooltip: ["Trucks with an overdue service or a High risk score (60 or more).", "Third-party trucks are excluded."],
      tone: attention ? "over" : "ok",
    },
    {
      key: "overdue",
      label: "Services overdue",
      value: kpis.services_overdue == null ? EM_DASH : formatNumber(kpis.services_overdue),
      detail: "across all maintained vehicles",
      reason: kpis.services_overdue == null ? "no fleet data yet" : null,
      tooltip: ["Count of service types (oil, tyres, brakes, reefer, PMS, battery) used beyond 100% of their interval.", "Third-party trucks are excluded."],
      tone: kpis.services_overdue ? "over" : "ok",
    },
    {
      key: "issues",
      label: "Open issues",
      value: kpis.open_issues == null ? EM_DASH : formatNumber(kpis.open_issues),
      detail: "unresolved flags",
      reason: kpis.open_issues == null ? "no fleet data yet" : null,
      tooltip: ["Flags that have not been resolved yet, from every source (manual, checklist, battery, fuel, email...).", "Third-party trucks are excluded."],
      tone: kpis.open_issues ? "soon" : "ok",
    },
    {
      key: "kmpl",
      label: "Fleet km/L",
      value: kpis.fleet_kmpl_30d == null ? EM_DASH : formatNumber(kpis.fleet_kmpl_30d, 2),
      unit: kpis.fleet_kmpl_30d == null ? undefined : "km/L",
      detail: "last 30 days, from fuel logs",
      reason: kpis.fleet_kmpl_30d == null ? "no full-tank fuel logs yet" : null,
      tooltip: ["km/L = distance between two full-tank fills / litres added at the second fill.", "Uses full-to-full intervals from the last 30 days. Third-party trucks are excluded."],
      tone: "none",
    },
    {
      key: "co2",
      label: "CO2 this month",
      value: kpis.co2_month_kg == null ? EM_DASH : formatNumber(kpis.co2_month_kg, 0),
      unit: kpis.co2_month_kg == null ? undefined : "kg",
      detail: kpis.co2_month_litres == null ? "" : `from ${formatNumber(kpis.co2_month_litres, 1)} L of diesel`,
      reason: kpis.co2_month_kg == null ? "no fuel logs yet" : null,
      tooltip: [co2Formula(co2KgPerLitre), "Based on fuel-log litres added this month (Manila time)."],
      tone: "none",
    },
    {
      key: "eco",
      label: "Avg eco score",
      value: kpis.avg_eco_score_last_week == null ? EM_DASH : formatNumber(kpis.avg_eco_score_last_week),
      unit: kpis.avg_eco_score_last_week == null ? undefined : "/ 100",
      detail: kpis.eco_scored_drivers == null ? "last full week" : `${kpis.eco_scored_drivers} scored driver${kpis.eco_scored_drivers === 1 ? "" : "s"}${kpis.eco_week_start ? `, week of ${formatDayMonth(kpis.eco_week_start)}` : ""}`,
      reason: kpis.avg_eco_score_last_week == null ? `no driver reached ${ecoMinKm} km last week` : null,
      tooltip: ["Average of last week's driver eco scores (Mon-Sun).", `Only drivers with at least ${ecoMinKm} km that week are scored. Days with no assignment are excluded.`],
      tone: kpis.avg_eco_score_last_week == null ? "none" : ecoTone(ecoBandFor(kpis.avg_eco_score_last_week)),
    },
  ];
}

export function co2Formula(kgPerLitre = 2.68): string {
  return `CO2 (kg) = diesel litres from the fuel log x ${kgPerLitre}`;
}

/** Plain-English reasons a truck is on the "Needs attention" list. */
export function attentionReasons(item: Pick<NeedsAttentionItem, "overdue" | "critical_flags" | "risk">): string[] {
  const reasons: string[] = [];
  for (const label of item.overdue) reasons.push(`${label} service overdue`);
  if (item.critical_flags > 0) reasons.push(`${item.critical_flags} critical issue${item.critical_flags === 1 ? "" : "s"} open`);
  if (!reasons.length && item.risk.band === "high") reasons.push("High risk score");
  return reasons;
}

// ------------------------------------------------------------------------------------------------ truck list helpers
export type TruckFilter = "all" | "attention" | "overdue" | "issues";

export function isMaintained(truck: FleetTruck): truck is MaintainedTruck {
  return truck.kind === "tracked" || truck.kind === "no_tracker";
}

export function hasOverdue(truck: MaintainedTruck): boolean {
  return Object.values(truck.services).some((s) => s?.status === "overdue");
}

export function truckMatchesFilter(truck: FleetTruck, filter: TruckFilter): boolean {
  if (filter === "all") return true;
  if (!isMaintained(truck)) return false;
  if (filter === "attention") return truck.risk.needs_attention;
  if (filter === "overdue") return hasOverdue(truck);
  return truck.open_flags_count > 0;
}

export function normalizePlate(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Filter by plate search + chip, then sort: maintained by risk desc (then plate), third-party last. */
export function filterAndSortTrucks(trucks: FleetTruck[], query: string, filter: TruckFilter): FleetTruck[] {
  const q = normalizePlate(query);
  return trucks
    .filter((t) => (q ? normalizePlate(t.plate).includes(q) : true) && truckMatchesFilter(t, filter))
    .sort((a, b) => {
      const am = isMaintained(a);
      const bm = isMaintained(b);
      if (am !== bm) return am ? -1 : 1;
      if (am && bm) {
        const diff = (b as MaintainedTruck).risk.score - (a as MaintainedTruck).risk.score;
        if (diff) return diff;
      }
      return a.plate.localeCompare(b.plate, "en", { numeric: true });
    });
}

export function filterCounts(trucks: FleetTruck[]): Record<TruckFilter, number> {
  const counts: Record<TruckFilter, number> = { all: trucks.length, attention: 0, overdue: 0, issues: 0 };
  for (const t of trucks) {
    if (!isMaintained(t)) continue;
    if (t.risk.needs_attention) counts.attention += 1;
    if (hasOverdue(t)) counts.overdue += 1;
    if (t.open_flags_count > 0) counts.issues += 1;
  }
  return counts;
}

/** Last pre-trip check cell: Pass/Fail + date, or "None in 45 d". */
export function checklistCell(last: MaintainedTruck["last_checklist"], lookbackDays = 45): { label: string; sub: string; tone: Tone } {
  if (!last) return { label: `None in ${lookbackDays} d`, sub: "", tone: "none" };
  return { label: last.passed ? "Pass" : "Fail", sub: formatDayMonth(last.checked_at), tone: last.passed ? "ok" : "over" };
}

// ------------------------------------------------------------------------------------------------ issues / flags
export const FLAG_SOURCE_LABELS: Record<FlagSource, string> = {
  manual: "Manual",
  checklist: "Checklist",
  battery: "Battery",
  fuel: "Fuel",
  overload: "Overload",
  voice: "Voice",
  email: "Email",
  whatsapp: "WhatsApp",
  driver_app: "Driver app",
};

export const SEVERITY_LABELS: Record<FlagSeverity, string> = { info: "Info", warning: "Warning", critical: "Critical" };

export function severityTone(severity: FlagSeverity): Tone {
  return severity === "critical" ? "over" : severity === "warning" ? "soon" : "none";
}

export function flagSourceLabel(source: string): string {
  return FLAG_SOURCE_LABELS[source as FlagSource] ?? source;
}

// ------------------------------------------------------------------------------------------------ checklist
export const CHECKLIST_ITEMS: { key: ChecklistItemKey; label: string; hint: string }[] = [
  { key: "tires", label: "Tyres", hint: "Pressure, tread, no bulges" },
  { key: "lights", label: "Lights", hint: "Head, brake, signal lights" },
  { key: "brakes", label: "Brakes", hint: "Pedal feel, no warning light" },
  { key: "leaks", label: "Leaks", hint: "Oil, coolant, fuel under the truck" },
  { key: "mirrors_wipers", label: "Mirrors and wipers", hint: "Clean, secure, working" },
  { key: "body_damage", label: "Body damage", hint: "Dents, doors, cargo box" },
  { key: "reefer_running", label: "Reefer running", hint: "Unit on and holding temperature" },
  { key: "documents", label: "Documents", hint: "OR/CR, licence, delivery papers" },
];

export const CHECKLIST_VALUE_LABELS: Record<ChecklistValue, string> = { ok: "OK", issue: "Issue", na: "N/A" };

export function defaultChecklistItems(isReefer: boolean | null | undefined): Record<ChecklistItemKey, ChecklistValue> {
  const items = {} as Record<ChecklistItemKey, ChecklistValue>;
  for (const { key } of CHECKLIST_ITEMS) items[key] = "ok";
  if (!isReefer) items.reefer_running = "na";
  return items;
}

export function checklistIssues(items: Partial<Record<ChecklistItemKey, ChecklistValue>>): ChecklistItemKey[] {
  return CHECKLIST_ITEMS.filter(({ key }) => items[key] === "issue").map(({ key }) => key);
}

export function checklistItemLabel(key: string): string {
  return CHECKLIST_ITEMS.find((i) => i.key === key)?.label ?? key.replace(/_/g, " ");
}

/** What submitting would do: passes, or raises a flag (critical when the brakes are an issue, else warning). */
export function checklistOutcome(items: Partial<Record<ChecklistItemKey, ChecklistValue>>): { pass: boolean; issues: ChecklistItemKey[]; severity: FlagSeverity | null; text: string } {
  const issues = checklistIssues(items);
  if (!issues.length) return { pass: true, issues, severity: null, text: "Pass: no issues reported" };
  const severity: FlagSeverity = issues.includes("brakes") ? "critical" : "warning";
  const labels = issues.map((k) => checklistItemLabel(k).toLowerCase()).join(", ");
  return { pass: false, issues, severity, text: `Will raise a ${severity} issue: ${labels}` };
}

export interface ChecklistFormState {
  vehicleId: number | null;
  items: Record<ChecklistItemKey, ChecklistValue>;
  reeferTemp: string;
  notes: string;
}

export function validateChecklist(form: ChecklistFormState, isReefer: boolean | null | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.vehicleId) errors.vehicleId = "Choose a truck";
  if (form.reeferTemp.trim() !== "") {
    const n = Number(form.reeferTemp);
    if (!Number.isFinite(n)) errors.reeferTemp = "Enter a temperature in °C";
    else if (n < -60 || n > 60) errors.reeferTemp = "Must be between -60 and 60 °C";
  }
  if (form.notes.length > 1000) errors.notes = "Keep notes under 1,000 characters";
  if (isReefer === false && form.reeferTemp.trim() !== "") errors.reeferTemp = "This truck is not a reefer";
  return errors;
}

// ------------------------------------------------------------------------------------------------ forms: shared validators
export function parseNumber(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

function numberError(label: string, value: string, opts: { min?: number; max?: number; required?: boolean; gt?: number }): string | null {
  const n = parseNumber(value);
  if (n === null) return opts.required ? `${label} is required` : null;
  if (Number.isNaN(n)) return `${label} must be a number`;
  if (opts.gt !== undefined && n <= opts.gt) return `${label} must be more than ${opts.gt}`;
  if (opts.min !== undefined && n < opts.min) return `${label} must be at least ${opts.min}`;
  if (opts.max !== undefined && n > opts.max) return `${label} must be at most ${formatNumber(opts.max)}`;
  return null;
}

/** A link or reference only: never file content. Mirrors the backend's rule. */
export function receiptError(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (text.length > 500) return "Keep this under 500 characters";
  if (text.toLowerCase().startsWith("data:")) return "Paste a link or reference, not file content";
  return null;
}

export function pricePerLitre(amount: number | null | undefined, litres: number | null | undefined): number | null {
  if (amount == null || litres == null || !Number.isFinite(amount) || !Number.isFinite(litres) || litres <= 0) return null;
  return Math.round((amount / litres) * 100) / 100;
}

export interface FuelFormState {
  vehicleId: number | null;
  filledAt: string; // datetime-local, Manila
  litres: string;
  amount: string;
  odometer: string;
  fullTank: boolean;
  station: string;
  receipt: string;
}

export function validateFuelLog(form: FuelFormState, now: Date): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.vehicleId) errors.vehicleId = "Choose a truck";
  if (!form.filledAt) errors.filledAt = "Date and time are required";
  else {
    const at = manilaInputToDate(form.filledAt);
    if (!at) errors.filledAt = "Enter a valid date and time";
    else if (at.getTime() > now.getTime() + 5 * 60_000) errors.filledAt = "Cannot be in the future";
  }
  const litres = numberError("Litres", form.litres, { required: true, gt: 0, max: 1000 });
  if (litres) errors.litres = litres;
  const amount = numberError("Amount", form.amount, { required: true, min: 0, max: 10_000_000 });
  if (amount) errors.amount = amount;
  const odo = numberError("Odometer", form.odometer, { min: 0, max: 5_000_000 });
  if (odo) errors.odometer = odo;
  if (form.station.length > 200) errors.station = "Keep this under 200 characters";
  const receipt = receiptError(form.receipt);
  if (receipt) errors.receipt = receipt;
  return errors;
}

/** Informational only: a fill larger than the tank we know about (200 L for the two unconfirmed trucks). Still submittable. */
export const UNCONFIRMED_TANK_L = 200;
export const TANK_OVERFILL_FACTOR = 1.05;
export const CAPACITY_UNCONFIRMED_TIP = "Cartrack reports a 200 L tank; logistics has not confirmed it, so fuel litre estimates for this truck are less certain.";

export function fuelLitreWarning(litres: number | null, capacityUnconfirmed: boolean): string | null {
  if (litres == null || !Number.isFinite(litres)) return null;
  if (capacityUnconfirmed && litres > UNCONFIRMED_TANK_L * TANK_OVERFILL_FACTOR) {
    return `${formatNumber(litres, 0)} L is more than the ${UNCONFIRMED_TANK_L} L tank (capacity unconfirmed). You can still save it; it will be marked "check".`;
  }
  return null;
}

export interface RecordFormState {
  kind: "service" | "repair" | "inspection";
  serviceType: ServiceKey | "";
  performedOn: string;
  odometer: string;
  engineHours: string;
  downtimeStart: string;
  downtimeEnd: string;
  reason: string;
  cost: string;
  vendor: string;
  notes: string;
  receipt: string;
}

export function validateRecord(form: RecordFormState, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.kind === "service" && !form.serviceType) errors.serviceType = "Choose which service was done";
  if (!form.performedOn) errors.performedOn = "Date is required";
  else if (form.performedOn > today) errors.performedOn = "Cannot be in the future";
  const odo = numberError("Odometer", form.odometer, { min: 0, max: 5_000_000 });
  if (odo) errors.odometer = odo;
  const hours = numberError("Engine hours", form.engineHours, { min: 0, max: 500_000 });
  if (hours) errors.engineHours = hours;
  const cost = numberError("Cost", form.cost, { min: 0, max: 100_000_000 });
  if (cost) errors.cost = cost;
  if (form.downtimeEnd && !form.downtimeStart) errors.downtimeStart = "Add when the downtime started";
  if (form.downtimeStart && form.downtimeEnd) {
    const a = manilaInputToDate(form.downtimeStart);
    const b = manilaInputToDate(form.downtimeEnd);
    if (a && b && b < a) errors.downtimeEnd = "Must be after the start";
  }
  if (form.vendor.length > 200) errors.vendor = "Keep this under 200 characters";
  if (form.reason.length > 1000) errors.reason = "Keep this under 1,000 characters";
  if (form.notes.length > 2000) errors.notes = "Keep this under 2,000 characters";
  const receipt = receiptError(form.receipt);
  if (receipt) errors.receipt = receipt;
  return errors;
}

export interface IssueFormState {
  severity: FlagSeverity;
  message: string;
  ref: string;
  photoRef: string;
}

export function validateIssue(form: IssueFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.message.trim()) errors.message = "Describe the issue";
  else if (form.message.trim().length > 500) errors.message = "Keep this under 500 characters";
  if (form.ref.length > 300) errors.ref = "Keep this under 300 characters";
  const photo = receiptError(form.photoRef);
  if (photo) errors.photoRef = photo;
  return errors;
}

export interface IntervalFormRow {
  km: string;
  hours: string;
  days: string;
}

export function intervalRowError(row: IntervalFormRow): string | null {
  const km = parseNumber(row.km);
  const hours = parseNumber(row.hours);
  const days = parseNumber(row.days);
  if ([km, hours, days].some((n) => n !== null && Number.isNaN(n))) return "Use numbers only";
  if (km === null && hours === null && days === null) return "Set at least one interval";
  if (km !== null && (km < 1 || km > 1_000_000)) return "Distance must be 1 to 1,000,000 km";
  if (hours !== null && (hours < 1 || hours > 100_000)) return "Engine hours must be 1 to 100,000";
  if (days !== null && (days < 1 || days > 3650)) return "Days must be 1 to 3,650";
  return null;
}

export function intervalRowFrom(km: number | null | undefined, hours: number | null | undefined, days: number | null | undefined): IntervalFormRow {
  return { km: km ? String(km) : "", hours: hours ? String(hours) : "", days: days ? String(days) : "" };
}

export function intervalRowEquals(a: IntervalFormRow, b: IntervalFormRow): boolean {
  return a.km.trim() === b.km.trim() && a.hours.trim() === b.hours.trim() && a.days.trim() === b.days.trim();
}

/** Body fields for PUT /service-intervals from a row (integers; blank = null). */
export function intervalBody(row: IntervalFormRow): { interval_km: number | null; interval_engine_hours: number | null; interval_days: number | null } {
  const conv = (v: string) => {
    const n = parseNumber(v);
    return n === null || Number.isNaN(n) ? null : Math.round(n);
  };
  return { interval_km: conv(row.km), interval_engine_hours: conv(row.hours), interval_days: conv(row.days) };
}

/** Drop empty strings so the API stores null instead of "". */
export function blankToNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

// ------------------------------------------------------------------------------------------------ roles
export type AppRole = "admin" | "dispatcher" | "warehouse" | "other";

/** Lower-cases the role and treats "planner" as "dispatcher". */
export function normalizeRole(role: string | null | undefined): AppRole {
  const r = (role ?? "").trim().toLowerCase();
  if (r === "planner") return "dispatcher";
  if (r === "admin" || r === "dispatcher" || r === "warehouse") return r;
  return "other";
}

export interface FleetPermissions {
  role: AppRole;
  /** edit records/intervals/fuel logs, resolve flags */
  canEdit: boolean;
  /** create checklists, fuel logs, issues */
  canEnter: boolean;
  isAdmin: boolean;
  readOnly: boolean;
}

export function permissionsFor(role: string | null | undefined): FleetPermissions {
  const r = normalizeRole(role);
  const canEdit = r === "admin" || r === "dispatcher";
  const canEnter = canEdit || r === "warehouse";
  return { role: r, canEdit, canEnter, isAdmin: r === "admin", readOnly: !canEnter };
}

// ------------------------------------------------------------------------------------------------ battery
export const BATTERY_LIMITS = {
  12: { parkedWarn: 12.2, parkedCritical: 11.9, runningLow: 13.5, runningHigh: 14.7 },
  24: { parkedWarn: 24.4, parkedCritical: 23.8, runningLow: 27.0, runningHigh: 29.0 },
} as const;

export function batterySystemOf(series: BatteryPoint[], fallback?: 12 | 24 | null): 12 | 24 | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].system) return series[i].system;
  }
  return fallback ?? null;
}

export function batteryTone(status: BatteryStatus | undefined): Tone {
  if (status === "ok") return "ok";
  if (status === "warning") return "soon";
  if (status === "critical") return "over";
  return "none";
}

export function batteryStatusLabel(status: BatteryStatus | undefined): string {
  if (status === "ok") return "OK";
  if (status === "warning") return "Warning";
  if (status === "critical") return "Critical";
  return "No data";
}

export function hasBatteryData(series: BatteryPoint[]): boolean {
  return series.some((p) => p.parked_min != null || p.running_avg != null);
}

export interface BatteryChartPoint {
  date: string;
  label: string;
  parked: number | null;
  running: number | null;
  status: BatteryStatus;
  reasons: string[];
}

export function batteryChartData(series: BatteryPoint[], days: number): BatteryChartPoint[] {
  return series.slice(-days).map((p) => ({ date: p.date, label: formatDayMonth(p.date), parked: p.parked_min, running: p.running_avg, status: p.status, reasons: p.reasons }));
}

/** Y axis range that always includes the reference lines for the system. */
export function batteryDomain(points: BatteryChartPoint[], system: 12 | 24): [number, number] {
  const limits = BATTERY_LIMITS[system];
  const values = points.flatMap((p) => [p.parked, p.running]).filter((v): v is number => v != null);
  const lo = Math.min(limits.parkedCritical, ...values);
  const hi = Math.max(limits.runningHigh, ...values);
  return [Math.floor((lo - 0.3) * 2) / 2, Math.ceil((hi + 0.3) * 2) / 2];
}

// ------------------------------------------------------------------------------------------------ distance / eco rollups
export interface DistancePoint {
  date: string;
  label: string;
  assigned: number;
  unassigned: number;
  engineHours: number | null;
  trips: number | null;
  partial: boolean;
}

export function distanceChartData(daily: DailyPoint[], days: number): DistancePoint[] {
  return daily.slice(-days).map((d) => ({
    date: d.date,
    label: formatDayMonth(d.date),
    assigned: d.assigned ? d.km ?? 0 : 0,
    unassigned: d.assigned ? 0 : d.km ?? 0,
    engineHours: d.engine_hours,
    trips: d.trips,
    partial: d.partial_day,
  }));
}

export function hasDistanceData(daily: DailyPoint[]): boolean {
  return daily.some((d) => (d.km ?? 0) > 0);
}

export interface IdleSplit {
  atStop: number;
  elsewhere: number;
  unclassified: number;
  total: number;
  atStopPct: number;
  elsewherePct: number;
  unclassifiedPct: number;
}

export function idleSplit(totals: Pick<EcoTotals, "idle_at_stop_min" | "idle_elsewhere_min" | "unclassified_idle_min">): IdleSplit {
  const atStop = totals.idle_at_stop_min || 0;
  const elsewhere = totals.idle_elsewhere_min || 0;
  const unclassified = totals.unclassified_idle_min || 0;
  const total = atStop + elsewhere + unclassified;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return { atStop, elsewhere, unclassified, total, atStopPct: pct(atStop), elsewherePct: pct(elsewhere), unclassifiedPct: pct(unclassified) };
}

export function kmSplit(totals: Pick<EcoTotals, "km" | "assigned_km" | "unassigned_km">): { assignedPct: number; unassignedPct: number } {
  const total = totals.assigned_km + totals.unassigned_km;
  if (total <= 0) return { assignedPct: 0, unassignedPct: 0 };
  return { assignedPct: (totals.assigned_km / total) * 100, unassignedPct: (totals.unassigned_km / total) * 100 };
}

/** True when the rollup has nothing to show: no distance and no engine time (then the row says "No data yet"). */
export function rollupHasNoData(totals: Pick<EcoTotals, "km" | "engine_hours">, litres: number | null): boolean {
  return (totals.km ?? 0) <= 0 && (totals.engine_hours ?? 0) <= 0 && (litres == null || litres <= 0);
}

export function rateRange(days: 7 | 30 | 90, lastDate: string): { from: string; to: string } {
  return { from: addDays(lastDate, -(days - 1)), to: lastDate };
}

/** Per-event rate for speeding: seconds per 100 km. */
export function perHundredKm(value: number, km: number, decimals = 1): string {
  if (!km || km <= 0) return EM_DASH;
  return formatNumber((value / km) * 100, decimals);
}

// ------------------------------------------------------------------------------------------------ CO2 chart data
export interface Co2ChartRow {
  month: string;
  label: string;
  total: number;
  litres: number;
  [plate: string]: number | string;
}

export function co2PlateKeys(months: Co2Month[]): string[] {
  const set = new Set<string>();
  for (const m of months) for (const plate of Object.keys(m.trucks)) set.add(plate);
  return [...set].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function co2ChartData(months: Co2Month[]): Co2ChartRow[] {
  const plates = co2PlateKeys(months);
  return months.map((m) => {
    const row: Co2ChartRow = { month: m.month, label: formatMonth(m.month, true), total: m.co2_kg, litres: m.litres };
    for (const plate of plates) row[plate] = m.trucks[plate]?.co2_kg ?? 0;
    return row;
  });
}

// ------------------------------------------------------------------------------------------------ scorecard
export function scorecardStatus(item: { will_send: boolean; skip_reason: string | null }): { label: string; tone: Tone } {
  return item.will_send ? { label: "Will send", tone: "ok" } : { label: `Skipped: ${item.skip_reason ?? "not sent"}`, tone: "none" };
}

/** True when the weekly scorecard would reach drivers right now. */
export function scorecardLive(sw: { enabled: boolean; whatsapp_active: boolean }): boolean {
  return sw.enabled && sw.whatsapp_active;
}

export function scorecardHeadline(sw: { enabled: boolean; whatsapp_active: boolean; schedule: string }): { label: string; detail: string; tone: Tone } {
  if (!sw.enabled) return { label: "Off", detail: "No weekly scores are being sent.", tone: "none" };
  if (!sw.whatsapp_active) return { label: "On, but WhatsApp is paused", detail: "Nothing will be sent until WhatsApp messages are resumed.", tone: "soon" };
  return { label: "On", detail: `Sends every ${sw.schedule}.`, tone: "ok" };
}

// ------------------------------------------------------------------------------------------------ misc
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** Truck choices for the checklist: only vehicles the API lists as maintained. */
export function maintainedTrucks(trucks: FleetTruck[]): MaintainedTruck[] {
  return trucks.filter(isMaintained);
}
