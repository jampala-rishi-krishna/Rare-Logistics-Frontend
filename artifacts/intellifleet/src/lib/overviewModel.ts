// Pure helpers for Driver Overview v2 (SPEC Part A sections 3 and 5): URL state, words, tiles, rail, sorting, captions.
// No React, no fetch: unit-tested in overviewModel.test.ts.
import { formatKgPartial } from "./kgDisplay.ts";
import { crewList, type CrewRowLike } from "./overviewCrew.ts";

export const MAX_RANGE_DAYS = 366;

export type TileId = "loading" | "on_road" | "back" | "closed" | "attention";
export type TabId = "trips" | "invoices" | "issues";

// ---- URL state (?date&from&to&wh&q&tile&trip&tab&stop&view) ----------------------------------------------------------

export interface UrlState {
  date: string; // single day (ignored when from/to are set)
  from: string; // range mode when both from and to are set
  to: string;
  wh: string; // "" | METS | GLACIER
  q: string;
  tile: TileId | "";
  trip: string; // open drawer batch_id
  stop: string; // stop (so_id or so_number) to scroll to inside the drawer
  tab: TabId;
  view: "list" | "table";
  only: boolean; // Invoices / Issues: "Only this date"
}

const TILE_IDS: readonly TileId[] = [
  "loading",
  "on_road",
  "back",
  "closed",
  "attention",
];
const TAB_IDS: readonly TabId[] = ["trips", "invoices", "issues"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: string): boolean => {
  if (!DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

export function parseUrlState(search: string, today: string): UrlState {
  const p = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const get = (k: string) => (p.get(k) ?? "").trim();
  const from = validDay(get("from")) ? get("from") : "";
  const to = validDay(get("to")) ? get("to") : "";
  const tile = get("tile") as TileId;
  const tab = get("tab") as TabId;
  const wh = get("wh").toUpperCase();
  return {
    date: validDay(get("date")) ? get("date") : today,
    from: from && to ? from : "",
    to: from && to ? to : "",
    wh: wh === "METS" || wh === "GLACIER" ? wh : "",
    q: get("q"),
    tile: TILE_IDS.includes(tile) ? tile : "",
    trip: get("trip"),
    stop: get("stop"),
    tab: TAB_IDS.includes(tab) ? tab : "trips",
    view: "table",
    only: get("only") === "1",
  };
}

/** Query string for a state; defaults are left out so a plain /app/driver-overview means "today, everything". */
export function toSearch(s: UrlState, today: string): string {
  const p = new URLSearchParams();
  if (s.from && s.to) {
    p.set("from", s.from);
    p.set("to", s.to);
  } else if (s.date && s.date !== today) p.set("date", s.date);
  if (s.wh) p.set("wh", s.wh);
  if (s.q.trim()) p.set("q", s.q.trim());
  if (s.tile) p.set("tile", s.tile);
  if (s.tab !== "trips") p.set("tab", s.tab);
  if (s.view === "table") p.set("view", "table");
  if (s.only) p.set("only", "1");
  if (s.trip) p.set("trip", s.trip);
  if (s.trip && s.stop) p.set("stop", s.stop);
  const out = p.toString();
  return out ? `?${out}` : "";
}

export function isRange(s: Pick<UrlState, "from" | "to">): boolean {
  return Boolean(s.from && s.to);
}

/** Old Overview links (?section=live|trips|handover|invoices|issues|export, ?status=) -> the new params; null = nothing to migrate. */
export function migrateLegacySearch(
  search: string,
  today: string,
): string | null {
  const p = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const section = (p.get("section") ?? "").toLowerCase();
  const status = (p.get("status") ?? "").toLowerCase();
  const warehouse = p.get("warehouse");
  if (!section && !status && !warehouse) return null;
  const s = parseUrlState(p.toString(), today);
  if (warehouse && !s.wh)
    s.wh = ["METS", "GLACIER"].includes(warehouse.toUpperCase())
      ? warehouse.toUpperCase()
      : "";
  if (section === "trips" && !isRange(s)) {
    s.from = shiftDay(today, -6);
    s.to = today;
  }
  if (
    section === "handover" ||
    section === "invoices" ||
    section === "hardcopies"
  )
    s.tab = "invoices";
  if (section === "issues") s.tab = "issues";
  const legacyTile: Record<string, TileId> = {
    to_acknowledge: "loading",
    ready: "loading",
    on_trip: "on_road",
    returned: "back",
    handover_pending: "back",
    handover_submitted: "back",
    closed: "closed",
  };
  if (status && legacyTile[status]) s.tile = legacyTile[status];
  return toSearch(s, today);
}

// ---- dates ------------------------------------------------------------------------------------------------------

export function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

/** null = ok, else the one-line error to show. */
export function rangeError(from: string, to: string): string | null {
  if (!validDay(from) || !validDay(to)) return "Pick both dates.";
  if (from > to) return "The start date must be on or before the end date.";
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS)
    return `Pick at most ${MAX_RANGE_DAYS} days.`;
  return null;
}

/** "Thu, 15 Oct" (a calendar day, no time zone shift). */
export function dayLabel(date: string | null | undefined): string {
  if (!date || !validDay(date)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}

const MANILA = "Asia/Manila";

export function manilaTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function manilaDayShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MANILA,
    day: "numeric",
    month: "short",
  }).format(d);
}

export function manilaDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${manilaDayShort(iso)}, ${manilaTime(iso)}`;
}

export function minutesSince(
  iso: string | null | undefined,
  now: Date,
): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 60_000));
}

/** "40 min", "5 h", "2 days" — how long something has been waiting. */
export function sinceText(iso: string | null | undefined, now: Date): string {
  const m = minutesSince(iso, now);
  if (m === null) return "—";
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h`;
  const d = Math.floor(m / 1440);
  return d === 1 ? "1 day" : `${d} days`;
}

export function agoText(iso: string | null | undefined, now: Date): string {
  const m = minutesSince(iso, now);
  if (m === null) return "—";
  if (m < 1) return "just now";
  return `${sinceText(iso, now)} ago`;
}

/** "Updated 12 s ago" from the last successful fetch time (ms). */
export function updatedAgo(fetchedAtMs: number, nowMs: number): string {
  if (!fetchedAtMs) return "Not updated yet";
  const s = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
  if (s < 60) return `Updated ${s} s ago`;
  const m = Math.floor(s / 60);
  return m < 60
    ? `Updated ${m} min ago`
    : `Updated ${Math.floor(m / 60)} h ago`;
}

export function durationText(minutes: number | null | undefined): string {
  if (
    minutes === null ||
    minutes === undefined ||
    !Number.isFinite(minutes) ||
    minutes < 0
  )
    return "—";
  const t = Math.round(minutes);
  if (t < 60) return `${t} min`;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---- words (SPEC 3.9) ---------------------------------------------------------------------------------------------

export const TILES: ReadonlyArray<{ id: TileId; label: string; hint: string }> =
  [
    {
      id: "loading",
      label: "Loading",
      hint: "Waiting for crew or ready to leave",
    },
    { id: "on_road", label: "On the road", hint: "Delivering" },
    {
      id: "back",
      label: "Back, invoices due",
      hint: "Signed invoices to the officer",
    },
    { id: "closed", label: "Closed", hint: "Officer received everything" },
    { id: "attention", label: "Needs attention", hint: "Any trip with a flag" },
  ];

export function tileLabel(id: string): string {
  return TILES.find((t) => t.id === id)?.label ?? "—";
}

export const STEP_WORD: Record<string, string> = {
  waiting_crew: "Waiting for crew",
  ready: "Ready to leave",
  on_road: "On the road",
  invoices_due: "Back, invoices due",
  closed: "Closed",
};

export const INVOICE_WORD: Record<string, string> = {
  with_driver: "With driver",
  with_officer: "With officer",
  received: "Received",
  missing: "Missing",
  discrepancy: "Wrong",
  not_handed_over: "Not handed over",
  pending: "With officer",
};

export function invoiceWord(status: string | null | undefined): string {
  if (!status) return "—";
  return INVOICE_WORD[status] ?? sentence(status);
}

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

export const INVOICE_TONE: Record<string, Tone> = {
  with_driver: "neutral",
  with_officer: "warn",
  received: "good",
  missing: "bad",
  discrepancy: "bad",
  not_handed_over: "bad",
};

/** Invoices tab chips (state keys of /hardcopies rows). "" = All. */
export const INVOICE_CHIPS: ReadonlyArray<[string, string]> = [
  ["", "All"],
  ["with_driver", "With driver"],
  ["with_officer", "With officer"],
  ["not_handed_over", "Not handed over"],
  ["missing", "Missing"],
  ["discrepancy", "Wrong"],
];

export function sentence(s: string): string {
  const t = s.replaceAll("_", " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

// ---- outcomes -----------------------------------------------------------------------------------------------------

export type OutcomeKey = "delivered" | "partial" | "failed";

export function outcomeKey(
  outcome: string | null | undefined,
): OutcomeKey | null {
  const o = (outcome ?? "").toLowerCase();
  if (!o) return null;
  if (o.startsWith("partial")) return "partial";
  if (
    o.startsWith("failed") ||
    o.startsWith("returned") ||
    o.startsWith("not delivered") ||
    o.startsWith("not_delivered")
  )
    return "failed";
  if (o.startsWith("delivered")) return "delivered";
  return null;
}

export const OUTCOME: Record<
  OutcomeKey,
  { glyph: string; word: string; tone: Tone }
> = {
  delivered: { glyph: "✓", word: "delivered", tone: "good" },
  partial: { glyph: "◐", word: "partial", tone: "warn" },
  failed: { glyph: "✕", word: "not delivered", tone: "bad" },
};

export function outcomeChipText(outcome: string | null | undefined): string {
  const k = outcomeKey(outcome);
  return k ? sentence(OUTCOME[k].word) : outcome ? outcome : "—";
}

/** "48 orders: 30 delivered, 2 partial, 1 not delivered, 15 to go". */
export function ordersLineText(
  o:
    | {
        orders: number;
        delivered: number;
        partial: number;
        failed: number;
        to_go: number;
      }
    | null
    | undefined,
): string {
  if (!o) return "—";
  return `${o.orders} ${o.orders === 1 ? "order" : "orders"}: ${o.delivered} delivered, ${o.partial} partial, ${o.failed} not delivered, ${o.to_go} to go`;
}

// ---- trip rows ----------------------------------------------------------------------------------------------------

export interface RowLike {
  batch_id: string;
  date?: string | null;
  vehicle?: string | null;
  state?: string;
  step?: {
    step: 1 | 2 | 3 | "closed";
    label_key: string;
    sub: Record<string, unknown>;
  } | null;
  tile?: string | null;
  attention?: Array<{ code: string; label: string }>;
  so_count?: number;
  acknowledged?: number;
  stops_done?: number;
  outcomes?: { delivered: number; partial: number; failed: number };
  delivered?: number;
  partial?: number;
  failed?: number;
  invoices?: { total: number; received: number };
  // Array of {id, name, role, phone} or (contract 2026-10-16) {driver, helpers}.
  crew?: CrewRowLike["crew"];
  driver_id?: number | null;
  driver_name?: string | null;
  // Plain names (older servers) or {staff_id, name, phone}.
  helpers?: CrewRowLike["helpers"];
}

/** The trip's step; servers without driver_step fall back to the legacy state. */
export function stepOf(row: RowLike): {
  step: 1 | 2 | 3 | "closed";
  label_key: string;
  sub: Record<string, unknown>;
} {
  if (row.step && row.step.step !== undefined) return row.step;
  const total = row.so_count ?? 0;
  const ack = row.acknowledged ?? 0;
  switch (row.state) {
    case "on_trip":
      return {
        step: 2,
        label_key: "on_road",
        sub: { done: row.stops_done ?? 0, total },
      };
    case "returned":
    case "handover_pending":
    case "handover_submitted":
      return { step: 3, label_key: "invoices_due", sub: {} };
    case "closed":
      return { step: "closed", label_key: "closed", sub: {} };
    default:
      return {
        step: 1,
        label_key: total > 0 && ack >= total ? "ready" : "waiting_crew",
        sub: { acknowledged: ack, total },
      };
  }
}

export function tileOf(row: RowLike): Exclude<TileId, "attention"> {
  if (
    row.tile === "loading" ||
    row.tile === "on_road" ||
    row.tile === "back" ||
    row.tile === "closed"
  )
    return row.tile;
  const s = stepOf(row).step;
  return s === 1
    ? "loading"
    : s === 2
      ? "on_road"
      : s === 3
        ? "back"
        : "closed";
}

export function needsAttention(row: RowLike): boolean {
  return (row.attention ?? []).length > 0;
}

export function outcomesOf(row: RowLike): {
  delivered: number;
  partial: number;
  failed: number;
} {
  return (
    row.outcomes ?? {
      delivered: row.delivered ?? 0,
      partial: row.partial ?? 0,
      failed: row.failed ?? 0,
    }
  );
}

/** Driver first, then helper(s); every server shape (see overviewCrew.ts). */
export function crewOf(row: RowLike): Array<{
  id: number | string | null;
  name: string;
  role: string;
  phone: string | null;
}> {
  return crewList(row);
}

export interface RailStep {
  key: "load" | "deliver" | "return";
  label: string;
  sub: string;
  state: "done" | "current" | "todo";
}

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The 3-step rail: Load "4 of 5 acknowledged" / Deliver "3 of 5 stops" / Return "invoices 3 of 5 received" (+ closed). */
export function railOf(row: RowLike): {
  steps: RailStep[];
  closed: boolean;
  word: string;
} {
  const st = stepOf(row);
  const sub = st.sub ?? {};
  const pos = st.step === "closed" ? 4 : st.step;
  const total = n(sub.total) ?? row.so_count ?? null;
  const ack = n(sub.acknowledged) ?? row.acknowledged ?? null;
  const done = n(sub.done) ?? row.stops_done ?? null;
  const invTotal = n(sub.total_invoices) ?? row.invoices?.total ?? null;
  const invRecv = n(sub.received) ?? row.invoices?.received ?? null;
  const state = (i: number): RailStep["state"] =>
    pos > i ? "done" : pos === i ? "current" : "todo";
  const of = (a: number | null, b: number | null, tail: string) =>
    a === null || b === null ? "—" : `${a} of ${b} ${tail}`;
  const current = n(sub.current);
  const deliverSub =
    pos === 2 && current
      ? `${of(done, total, "stops")} · at stop ${current}`
      : of(done, total, "stops");
  return {
    steps: [
      {
        key: "load",
        label: "Load",
        sub: of(ack, total, "acknowledged"),
        state: state(1),
      },
      {
        key: "deliver",
        label: "Deliver",
        sub: pos < 2 ? `${total ?? "—"} stops` : deliverSub,
        state: state(2),
      },
      {
        key: "return",
        label: "Return",
        sub:
          invTotal === null || invRecv === null
            ? "—"
            : `invoices ${invRecv} of ${invTotal} received`,
        state: state(3),
      },
    ],
    closed: pos === 4,
    word: STEP_WORD[st.label_key] ?? "—",
  };
}

/** Last crew activity: "Last activity 4 min ago", or red "No activity 42 min" when on the road and older than the stale threshold. */
export function lastActivity(
  row: RowLike & {
    last_crew_activity_at?: string | null;
    started_at?: string | null;
  },
  now: Date,
  staleMinutes: number,
): { text: string; stale: boolean } {
  const at = row.last_crew_activity_at ?? null;
  const onRoad = tileOf(row) === "on_road";
  const m = minutesSince(at, now);
  if (m === null)
    return {
      text: "No activity yet",
      stale:
        onRoad && (row.attention ?? []).some((a) => a.code === "no_activity"),
    };
  if (onRoad && m > staleMinutes)
    return { text: `No activity ${durationText(m)}`, stale: true };
  return {
    text: `Last activity ${m < 1 ? "just now" : `${durationText(m)} ago`}`,
    stale: false,
  };
}

const TILE_RANK: Record<string, number> = {
  on_road: 1,
  loading: 2,
  back: 3,
  closed: 4,
};

/** Needs attention first, then On the road, Loading, Back, Closed; then plate; then trip number. Stable. */
export function sortTrips<T extends RowLike & { trip_number?: number }>(
  rows: readonly T[],
): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const at = (needsAttention(a.r) ? 0 : 1) - (needsAttention(b.r) ? 0 : 1);
      if (at) return at;
      const t = (TILE_RANK[tileOf(a.r)] ?? 9) - (TILE_RANK[tileOf(b.r)] ?? 9);
      if (t) return t;
      const p = String(a.r.vehicle ?? "~").localeCompare(
        String(b.r.vehicle ?? "~"),
      );
      if (p) return p;
      return (a.r.trip_number ?? 0) - (b.r.trip_number ?? 0) || a.i - b.i;
    })
    .map((x) => x.r);
}

/** Range mode: rows grouped under date headers, newest day first, each group in sortTrips order. */
export function groupByDate<T extends RowLike & { trip_number?: number }>(
  rows: readonly T[],
): Array<{ date: string; rows: T[] }> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.date ?? "—";
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, rows: sortTrips(list) }));
}

/** Total kg over rows ("2,264 kg+" when some lines have no weight); null when there are no rows. */
export function formatKg(
  rows: ReadonlyArray<{ kg?: number | null; kg_unknown_lines?: number }>,
): { text: string; note: string | null } | null {
  if (rows.length === 0) return null;
  const kg = rows.reduce(
    (a, r) =>
      a + (typeof r.kg === "number" && Number.isFinite(r.kg) ? r.kg : 0),
    0,
  );
  const unknown = rows.reduce((a, r) => a + (r.kg_unknown_lines ?? 0), 0);
  return formatKgPartial(kg, unknown, 0);
}

export function invoicesText(row: RowLike): string {
  const inv = row.invoices;
  if (!inv || !inv.total) return "—";
  return `${inv.received}/${inv.total} received`;
}

// ---- attention ----------------------------------------------------------------------------------------------------

export const ATTENTION_LABEL: Record<string, string> = {
  no_activity: "No activity",
  not_delivered: "Not delivered",
  partial: "Partial",
  problem_open: "Problem reported",
  far_checkin: "Far check-in",
  no_gps: "No GPS",
  invoice_missing: "Invoice missing",
  invoice_discrepancy: "Invoice wrong",
  order_removed: "Order removed",
  photo_missing: "Photo missing",
};

export const ATTENTION_TONE: Record<string, Tone> = {
  no_activity: "bad",
  not_delivered: "bad",
  partial: "warn",
  problem_open: "bad",
  far_checkin: "warn",
  no_gps: "warn",
  invoice_missing: "bad",
  invoice_discrepancy: "bad",
  order_removed: "neutral",
  photo_missing: "warn",
};

export function attentionLabel(flag: {
  code: string;
  label?: string | null;
}): string {
  return flag.label || ATTENTION_LABEL[flag.code] || sentence(flag.code);
}

// ---- photos -------------------------------------------------------------------------------------------------------

export interface PhotoLike {
  photo_id: number | string;
  so_number?: string | null;
  captured_at?: string | null;
  kind?: string | null;
  field_key?: string | null;
}

const KIND_WORD: Record<string, string> = {
  delivered: "Delivered",
  partial: "Partial",
  failed: "Not delivered",
  problem: "Problem",
  other: "Photo",
};

/** "SO-TEST-3002 · 13 Oct · 9:20 AM · Partial" — SO, date, time (Manila), result. */
export function photoCaption(p: PhotoLike, fallbackAt?: string | null): string {
  const at = p.captured_at ?? fallbackAt ?? null;
  return [
    p.so_number || "—",
    manilaDayShort(at),
    manilaTime(at),
    KIND_WORD[p.kind ?? "other"] ?? sentence(String(p.kind)),
  ].join(" · ");
}

function isPhotoId(v: unknown): v is number | string {
  return typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v));
}

/** A stop's photos: the server's photo metadata, or (older servers) the photo answers of the check-out / acknowledge forms. */
export function stopPhotos(order: {
  so_number: string;
  photos?: PhotoLike[];
  stop?: {
    checkout?: {
      at: string | null;
      outcome: string | null;
      answers: Array<{
        key?: string;
        type?: string;
        value?: unknown;
        photo_url?: string | null;
      }>;
    } | null;
  } | null;
}): PhotoLike[] {
  if (Array.isArray(order.photos)) return order.photos;
  const out = order.stop?.checkout;
  if (!out) return [];
  const kind = outcomeKey(out.outcome) ?? "other";
  return out.answers
    .filter(
      (a) =>
        (a.type === "photo" || a.type === "signature" || a.photo_url) &&
        isPhotoId(a.value),
    )
    .map((a) => ({
      photo_id: a.value as number | string,
      so_number: order.so_number,
      captured_at: out.at,
      kind,
      field_key: a.key ?? null,
    }));
}

// ---- filters summary for the empty state ---------------------------------------------------------------------------

export function activeFilters(s: UrlState, today: string): string[] {
  const out: string[] = [];
  if (isRange(s)) out.push(`${dayLabel(s.from)} – ${dayLabel(s.to)}`);
  else
    out.push(
      s.date === today ? `Today (${dayLabel(s.date)})` : dayLabel(s.date),
    );
  if (s.wh) out.push(`Warehouse ${s.wh}`);
  if (s.q.trim()) out.push(`Search "${s.q.trim()}"`);
  if (s.tile) out.push(tileLabel(s.tile));
  return out;
}

export function hasNarrowingFilters(s: UrlState, today: string): boolean {
  return Boolean(
    s.wh || s.q.trim() || s.tile || isRange(s) || s.date !== today,
  );
}

/** Tolerant person name from a timeline "by" object or string. */
export function personName(by: unknown): string {
  if (!by) return "";
  if (typeof by === "string") return by;
  if (typeof by === "object" && by !== null && "name" in by)
    return String((by as { name?: unknown }).name ?? "");
  return "";
}
