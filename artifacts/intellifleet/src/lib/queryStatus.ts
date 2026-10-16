// Pure "keep last data" decision for list queries: a failed refetch must not replace rows the user
// is already looking at. Red error only when there is nothing to show.

import { RETRYING_MESSAGE } from "./apiErrors.ts";

export interface ListQueryState {
  hasData: boolean;
  isError: boolean;
  isFetching?: boolean;
  /** react-query dataUpdatedAt (ms epoch); 0 when never loaded. */
  dataUpdatedAt: number;
  /** Optional `stale` / `stale_since` fields the backend adds to a 200 list response served from cache. */
  stale?: boolean | null;
  staleSince?: string | null;
}

export type ListQueryView =
  | { mode: "ok" }
  | { mode: "error" }
  | { mode: "degraded"; reason: "error" | "stale"; since: number | null };

export function listQueryView(state: ListQueryState): ListQueryView {
  if (!state.hasData) return state.isError ? { mode: "error" } : { mode: "ok" };
  if (state.isError) return { mode: "degraded", reason: "error", since: state.dataUpdatedAt || null };
  if (state.stale) {
    const parsed = state.staleSince ? Date.parse(state.staleSince) : NaN;
    return { mode: "degraded", reason: "stale", since: Number.isFinite(parsed) ? parsed : null };
  }
  return { mode: "ok" };
}

/** "13:42" on a 24h clock (viewer's time zone unless one is given). */
export function clockLabel(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(ms));
}

export function degradedText(view: Extract<ListQueryView, { mode: "degraded" }>, isFetching = false, timeZone?: string): string {
  const since = view.since ? `showing data from ${clockLabel(view.since, timeZone)}` : "showing the last loaded data";
  if (view.reason === "stale") return `Live data is delayed - ${since}.`;
  return isFetching ? `Reconnecting… ${since}.` : `${RETRYING_MESSAGE.split(".")[0]} - ${since}.`;
}

/** Combines several list queries (e.g. SO + TO + PO) into one view: the worst state wins. */
export function combineViews(views: ListQueryView[]): ListQueryView {
  if (views.some((v) => v.mode === "error")) return { mode: "error" };
  const degraded = views.filter((v): v is Extract<ListQueryView, { mode: "degraded" }> => v.mode === "degraded");
  if (!degraded.length) return { mode: "ok" };
  const times = degraded.map((v) => v.since).filter((t): t is number => t !== null);
  return { mode: "degraded", reason: degraded.some((v) => v.reason === "error") ? "error" : "stale", since: times.length ? Math.min(...times) : null };
}
