// Next-day assignments: dispatch assigns tomorrow's orders today, the crew acknowledges them today and delivers them
// tomorrow morning. GET /api/driver/today returns both days; each item carries `delivery_date` and `day`
// ("today" | "tomorrow" | "overdue"). Older servers send no `day`: those items are today's.
// Pure (no React) so node tests can cover it.

export type TripDay = "today" | "tomorrow" | "overdue";

export interface DayItem {
  delivery_date?: string | null;
  day?: string | null;
}

export function dayOf(item: DayItem): TripDay {
  const d = String(item.day ?? "").toLowerCase();
  return d === "tomorrow" || d === "overdue" ? d : "today";
}

export interface TripDayGroups<T> {
  /** Overdue first, then today (the delivery list + progress). */
  today: T[];
  /** Acknowledge-only until that morning. */
  tomorrow: T[];
  overdueCount: number;
  /** Delivery date of the tomorrow items (first one found), null when there are none. */
  tomorrowDate: string | null;
}

export function groupTripDays<T extends DayItem>(items: readonly T[] | null | undefined): TripDayGroups<T> {
  const overdue: T[] = [];
  const today: T[] = [];
  const tomorrow: T[] = [];
  for (const it of items ?? []) {
    const d = dayOf(it);
    if (d === "tomorrow") tomorrow.push(it);
    else if (d === "overdue") overdue.push(it);
    else today.push(it);
  }
  const tomorrowDate = tomorrow.find((t) => t.delivery_date)?.delivery_date ?? null;
  return { today: [...overdue, ...today], tomorrow, overdueCount: overdue.length, tomorrowDate };
}

/** Start trip is only for today's (or overdue) items; tomorrow's start on that morning. */
export function canStartOnDay(item: DayItem): boolean {
  return dayOf(item) !== "tomorrow";
}

/** The day sections the Today screen shows, in order (tomorrow's acknowledge list on top when there is one). */
export function daySections<T extends DayItem>(groups: TripDayGroups<T>): Array<{ day: "tomorrow" | "today"; items: T[] }> {
  const out: Array<{ day: "tomorrow" | "today"; items: T[] }> = [];
  if (groups.tomorrow.length > 0) out.push({ day: "tomorrow", items: groups.tomorrow });
  out.push({ day: "today", items: groups.today });
  return out;
}

/** "2026-10-16" + 1 day ("" when not a date). */
export function nextYmd(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)).toISOString().slice(0, 10);
}
