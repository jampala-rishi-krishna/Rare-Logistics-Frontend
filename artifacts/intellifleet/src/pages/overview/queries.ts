// React Query hooks for Driver Overview v2. Keys start with "driver-overview" so the officer screens'
// invalidateQueries(["driver-overview"]) refreshes this page too. Polling: 15 s while the tab is visible, paused when hidden.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as overviewApi from "@/services/api/overview";
import { isRange, rangeError } from "@/lib/overviewModel";
import type { UrlState } from "@/lib/overviewModel";

export const POLL = {
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
} as const;

export function tripsFilter(
  s: UrlState,
  withTile = true,
): overviewApi.TripsFilter {
  return {
    ...(isRange(s) ? { from: s.from, to: s.to } : { date: s.date }),
    warehouse: s.wh || undefined,
    q: s.q.trim() || undefined,
    tile: withTile ? s.tile || undefined : undefined,
  };
}

export function useTrips(s: UrlState) {
  const f = tripsFilter(s);
  const ok = !isRange(s) || rangeError(s.from, s.to) === null;
  return useQuery({
    queryKey: ["driver-overview", "trips", f],
    queryFn: () => overviewApi.getTrips(f),
    enabled: ok,
    placeholderData: keepPreviousData,
    ...POLL,
  });
}

export function useTripDetail(batchId: string) {
  return useQuery({
    queryKey: ["driver-overview", "trip", batchId],
    queryFn: () => overviewApi.getTrip(batchId),
    enabled: batchId !== "",
    ...POLL,
  });
}

/** Collected invoices always follow the calendar; outstanding invoices retain their optional date scope. */
export function useHardCopies(s: UrlState, collected = false) {
  const f = {
    warehouse: s.wh || undefined,
    q: s.q.trim() || undefined,
    ...(collected
      ? isRange(s)
        ? { from: s.from, to: s.to }
        : { date: s.date }
      : { date: s.only && !isRange(s) ? s.date : undefined }),
    collected,
  };
  return useQuery({
    queryKey: ["driver-overview", "hardcopies", f],
    queryFn: () => overviewApi.getHardCopies(f),
    enabled: !collected || !isRange(s) || rangeError(s.from, s.to) === null,
    placeholderData: collected ? undefined : keepPreviousData,
    ...POLL,
  });
}

export function useIssues(s: UrlState, status: string, onlyDate = s.only) {
  const f = {
    status,
    warehouse: s.wh || undefined,
    q: s.q.trim() || undefined,
    date: onlyDate && !isRange(s) ? s.date : undefined,
  };
  return useQuery({
    queryKey: ["driver-overview", "issues", f],
    queryFn: () => overviewApi.getIssues(f),
    placeholderData: keepPreviousData,
    ...POLL,
  });
}
