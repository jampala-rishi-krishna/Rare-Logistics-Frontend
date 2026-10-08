import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as authApi from "@/services/api/auth";
import * as fh from "@/services/api/fleetHealth";
import { permissionsFor, type FleetPermissions } from "@/lib/fleetHealth";

// The API caches its read model for 5 minutes, so there is no point refetching faster than that on demand.
const STALE = 60_000;

export const fhKeys = {
  summary: ["fh", "summary"] as const,
  trucks: ["fh", "trucks"] as const,
  truck: (id: number | null) => ["fh", "truck", id] as const,
  ecoDrivers: (week: string | undefined) => ["fh", "eco", "drivers", week ?? "last"] as const,
  ecoTrucks: (from: string | undefined, to: string | undefined) => ["fh", "eco", "trucks", from ?? "", to ?? ""] as const,
  fuelChecks: ["fh", "eco", "fuel-checks"] as const,
  co2: ["fh", "eco", "co2"] as const,
  scorecard: (week: string | undefined) => ["fh", "eco", "scorecard", week ?? "last"] as const,
  fuelLogs: ["fh", "fuel-logs"] as const,
};

export type InvalidateScope = "maintenance" | "fuel" | "scorecard";

/** Invalidate just the queries an edit can change. */
export function invalidateFleetHealth(qc: QueryClient, scope: InvalidateScope) {
  const keys: (readonly unknown[])[] =
    scope === "maintenance"
      ? [fhKeys.summary, fhKeys.trucks, ["fh", "truck"]]
      : scope === "fuel"
        ? [fhKeys.summary, ["fh", "truck"], ["fh", "eco"], fhKeys.fuelLogs]
        : [["fh", "eco", "scorecard"]];
  for (const queryKey of keys) qc.invalidateQueries({ queryKey: queryKey as unknown[] });
}

export function useSessionRole(): FleetPermissions & { loaded: boolean } {
  const session = useQuery({ queryKey: ["session-role"], queryFn: authApi.getSession, staleTime: 5 * 60 * 1000, retry: false });
  const perms = permissionsFor(session.data?.user?.role);
  return { ...perms, loaded: session.isSuccess || session.isError };
}

export const useSummary = () => useQuery({ queryKey: fhKeys.summary, queryFn: fh.getSummary, staleTime: STALE, refetchInterval: 60_000, retry: 1 });
export const useTrucks = () => useQuery({ queryKey: fhKeys.trucks, queryFn: fh.getTrucks, staleTime: STALE, refetchInterval: 60_000, retry: 1 });
export const useTruckDetail = (id: number | null) =>
  useQuery({ queryKey: fhKeys.truck(id), queryFn: () => fh.getTruckDetail(id as number), enabled: id != null, staleTime: STALE, retry: 1 });
export const useEcoDrivers = (week: string | undefined) => useQuery({ queryKey: fhKeys.ecoDrivers(week), queryFn: () => fh.getEcoDrivers(week), staleTime: STALE, retry: 1 });
export const useEcoTrucks = (from: string | undefined, to: string | undefined, enabled = true) =>
  useQuery({ queryKey: fhKeys.ecoTrucks(from, to), queryFn: () => fh.getEcoTrucks(from, to), staleTime: STALE, retry: 1, enabled });
export const useFuelChecks = () => useQuery({ queryKey: fhKeys.fuelChecks, queryFn: () => fh.getFuelChecks(30), staleTime: STALE, retry: 1 });
export const useCo2 = () => useQuery({ queryKey: fhKeys.co2, queryFn: () => fh.getCo2(12), staleTime: STALE, retry: 1 });
export const useFuelLogs = () => useQuery({ queryKey: fhKeys.fuelLogs, queryFn: () => fh.getFuelLogs(undefined, 100), staleTime: STALE, retry: 1 });
export const useScorecard = (week: string | undefined) => useQuery({ queryKey: fhKeys.scorecard(week), queryFn: () => fh.getScorecard(week), staleTime: STALE, retry: 1 });

/** True below Tailwind's `md` breakpoint (768px). */
export function useIsMobile(): boolean {
  const query = "(max-width: 767px)";
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [mobile, setMobile] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const on = () => setMobile(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return mobile;
}

/** Tick every minute so "now"-relative labels stay honest without a render storm. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** localStorage-backed state that never throws (private windows, blocked storage). */
export function useStoredState<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored && (allowed as readonly string[]).includes(stored)) return stored as T;
    } catch {
      /* storage unavailable: use the default */
    }
    return initial;
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, update];
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export { useQueryClient };
