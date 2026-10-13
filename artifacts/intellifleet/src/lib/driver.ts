// Pure helpers for the driver portal (no React, no network) so they can be unit tested.

export type GreetingPart = "morning" | "afternoon" | "evening";

export function greetingPart(hour: number): GreetingPart {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

// Hour of day (0-23) in Asia/Manila for an ISO timestamp. Returns null when unparseable.
export function manilaHour(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", hour12: false }).formatToParts(date);
  const raw = parts.find((p) => p.type === "hour")?.value;
  if (raw === undefined) return null;
  const hour = Number(raw) % 24;
  return Number.isFinite(hour) ? hour : null;
}

export function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

// "Good morning, Juan" (or just "Good morning" when no name is known).
export function greeting(nowIso: string, fullName: string | null | undefined): string {
  const hour = manilaHour(nowIso);
  const part = greetingPart(hour ?? 12);
  const name = firstName(fullName);
  return name ? `Good ${part}, ${name}` : `Good ${part}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

// "2026-10-12" -> "Monday, 12 October". Falls back to the raw string if it is not a date.
export function formatLongDate(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// "2026-10-12" -> "12 Oct 2026".
export function formatShortDate(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

// Whole days between two YYYY-MM-DD dates (to - from). NaN when either is invalid.
export function daysBetween(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return Number.NaN;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export const MAX_HISTORY_RANGE_DAYS = 366;

// Returns an error message, or null when the range is acceptable.
export function validateDateRange(from: string, to: string): string | null {
  if (!from || !to) return "Pick both a start and an end date.";
  const span = daysBetween(from, to);
  if (Number.isNaN(span)) return "Enter valid dates.";
  if (span < 0) return "The start date must be on or before the end date.";
  if (span + 1 > MAX_HISTORY_RANGE_DAYS) return `Choose a range of at most ${MAX_HISTORY_RANGE_DAYS} days.`;
  return null;
}

// "0917 123 4567" -> "tel:09171234567". null when there is no dialable number.
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 3) return null;
  // A "+" is only meaningful as the first character.
  const normalised = (cleaned.startsWith("+") ? "+" : "") + digits;
  return `tel:${normalised}`;
}

export function mapsSearchUrl(addressText: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
}

export function formatKg(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} kg`;
}

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

// Query params for driver endpoints: admins must pass driver_id, drivers must not.
export function driverIdQuery(adminDriverId: string | null | undefined): Record<string, string> {
  return adminDriverId ? { driver_id: adminDriverId } : {};
}

// Builds "/path?from=history&driver_id=12" style in-app links, skipping empty params.
export function withDriverParams(path: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export interface PollDeps {
  isVisible: () => boolean;
  onVisibilityChange: (cb: () => void) => () => void;
  setIntervalFn: (cb: () => void, ms: number) => unknown;
  clearIntervalFn: (handle: unknown) => void;
}

// Calls `tick` every `intervalMs` while the page is visible. Pauses while hidden and calls
// `tick` immediately when the page becomes visible again. Returns a stop function.
export function startVisibilityPolling(tick: () => void, intervalMs: number, deps: PollDeps): () => void {
  let handle: unknown = null;
  const start = () => {
    if (handle === null) handle = deps.setIntervalFn(tick, intervalMs);
  };
  const stopTimer = () => {
    if (handle !== null) {
      deps.clearIntervalFn(handle);
      handle = null;
    }
  };
  if (deps.isVisible()) start();
  const unsubscribe = deps.onVisibilityChange(() => {
    if (deps.isVisible()) {
      stopTimer();
      tick();
      start();
    } else {
      stopTimer();
    }
  });
  return () => {
    stopTimer();
    unsubscribe();
  };
}

export function browserPollDeps(): PollDeps {
  return {
    isVisible: () => document.visibilityState === "visible",
    onVisibilityChange: (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    setIntervalFn: (cb, ms) => window.setInterval(cb, ms),
    clearIntervalFn: (handle) => window.clearInterval(handle as number),
  };
}

// "2026-10-12T08:15:30+08:00" -> "08:15" (Asia/Manila). Empty string when unparseable.
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

// "12 Oct, 08:15" (Asia/Manila).
export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short" }).format(d);
  return `${date}, ${formatClock(iso)}`;
}

// Name of a {name} object or plain string; "" when absent.
export function personName(by: { name?: string } | string | null | undefined): string {
  if (!by) return "";
  return typeof by === "string" ? by : (by.name ?? "");
}

// "already done by Raymond at 08:15" toast text for an already_done response.
export function alreadyDoneText(doneBy: { name?: string; at?: string } | null | undefined): string {
  const who = doneBy?.name ? ` by ${doneBy.name}` : "";
  const at = formatClock(doneBy?.at);
  return `Already done${who}${at ? ` at ${at}` : ""}`;
}

// What the sign-in screen tells the user. Uses the status only (never echoes server internals); a 401 is deliberately the same
// message for "no such account" and "wrong password".
export function loginErrorText(status: number | null, serverMessage: string | null): string {
  if (status === 401) return "Wrong phone number, email or password. Check it and try again.";
  if (status === 429) return "Too many attempts. Wait a few minutes and try again.";
  if (status === 403) return serverMessage && /disabled/i.test(serverMessage) ? "This account is disabled. Please contact dispatch." : "You do not have access. Contact dispatch.";
  if (status === 400) return "Enter your phone number or email, and your password.";
  if (status === null) return "Can't reach the server. Check your connection and try again.";
  return "Something went wrong signing in. Try again.";
}

export const MIN_PASSWORD_LENGTH = 8;

// Client-side check before sending; the server still enforces its own rules.
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}
