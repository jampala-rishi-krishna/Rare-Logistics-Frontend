import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as driverApi from "@/services/api/driver";
import { formatClock } from "@/lib/driver";
import { capturePosition } from "@/lib/geo";
import { fetchWithCache, saveToCache, useRuntime, photoUploader } from "@/lib/offlineRuntime";
import { isRemovedByDispatch } from "@/lib/offlineQueue";
import { buildActionBody } from "@/lib/tripActions";
import type { ActionSpec, SubmitOutcome } from "@/lib/tripActions";
import type { QueueBlob, QueueKind } from "@/lib/offlineQueue";
import { getLang, DICTS, driverMessage } from "./i18n";
import type { DriverScope } from "./shared";
import { showToast } from "./shared";

// Live data: refetch every 25 s while the app is visible, when it comes back to the front (focus / resume), and right
// after every action. Every read goes through the offline cache so screens still render with no signal.
export const LIVE_REFRESH_MS = 25_000;

function useDriverResumeRefresh(enabled: boolean) {
 const client = useQueryClient();
 useEffect(() => {
   if (!enabled) return;
   const refresh = () => { if (document.visibilityState !== "hidden") {
     void client.invalidateQueries({ queryKey: ["driver-today"] });
     void client.invalidateQueries({ queryKey: ["driver-assignment"] });
   }};
   document.addEventListener("visibilitychange", refresh);
   window.addEventListener("online", refresh);
   window.addEventListener("focus", refresh);
   return () => { document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); };
 }, [client, enabled]);
}
export function useToday(scope: DriverScope) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId;
  useDriverResumeRefresh(enabled);
  return useQuery({
    queryKey: ["driver-today", scope.adminDriverId],
    queryFn: () => fetchWithCache("today", undefined, scope.adminDriverId, () => driverApi.getToday(scope.adminDriverId)),
    enabled,
    retry: 1,
    refetchInterval: LIVE_REFRESH_MS,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export function useAssignmentQuery(scope: DriverScope, batchId: string | undefined, live = true) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId && Boolean(batchId);
  useDriverResumeRefresh(enabled && live);
  return useQuery({
    queryKey: ["driver-assignment", batchId, scope.adminDriverId],
    queryFn: () => fetchWithCache("batch", batchId, scope.adminDriverId, () => driverApi.getAssignment(batchId as string, scope.adminDriverId)),
    enabled,
    retry: (count, err) => count < 1 && (err as { status?: number })?.status !== 404 && (err as { status?: number })?.status !== 409,
    refetchInterval: (query) => (query.state.data?.data.details_loading ? 8000 : live ? LIVE_REFRESH_MS : false),
    refetchOnWindowFocus: live ? "always" : true,
    refetchOnReconnect: "always",
  });
}

export function useTemplatesQuery(scope: DriverScope) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId;
  return useQuery({
    queryKey: ["driver-templates", scope.adminDriverId],
    queryFn: () => fetchWithCache("templates", undefined, scope.adminDriverId, () => driverApi.getTemplates(scope.adminDriverId)),
    enabled,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
}

// Route = Google Maps links per stop and the pickup warehouse (local data, no external call).
export function useRouteQuery(scope: DriverScope, batchId: string | undefined, enabledExtra = true) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId && Boolean(batchId) && enabledExtra;
  return useQuery({
    queryKey: ["driver-route", batchId, scope.adminDriverId],
    queryFn: () => fetchWithCache("route", batchId, scope.adminDriverId, () => driverApi.getRoute(batchId as string, scope.adminDriverId)),
    enabled,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
}

export interface RunOptions {
  kind: QueueKind;
  so_id?: string | null;
  // English label for the "saved on this phone" list.
  label: string;
  path: string;
  extra?: Record<string, unknown>;
  blobs?: QueueBlob[];
  // Message shown after success when nothing else is said (e.g. "Trip started").
  doneMessage?: string;
}

// Crew action runner: capture GPS at the tap -> body (key, client_ts, gps) -> online first, queue on network failure.
// Guarded against double taps while a call is in flight. Removed-by-dispatch answers are final and say so.
export function useCrewAction(scope: DriverScope, batchId: string) {
  const runtime = useRuntime();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback(
    async (opts: RunOptions): Promise<SubmitOutcome | null> => {
      if (!runtime || busyRef.current || scope.isAdmin) return null;
      busyRef.current = true;
      setBusy(true);
      const t = DICTS[getLang()];
      try {
        const position = await capturePosition({ timeoutMs: 8000 });
        const body = buildActionBody(position, opts.extra ?? {});
        const spec: ActionSpec = { batch_id: batchId, so_id: opts.so_id ?? null, kind: opts.kind, label: opts.label, path: opts.path, body, blobs: opts.blobs, uploaded: photoUploader.uploadedFor((opts.blobs ?? []).map(b => b.upload_key)), queueNow: photoUploader.anySending((opts.blobs ?? []).map(b => b.upload_key)) };
        const outcome = await runtime.submitter.submit(spec);
        if (outcome.status === "done") {
          const batch = outcome.response.batch;
          if (batch) {
            queryClient.setQueryData(["driver-assignment", batchId, scope.adminDriverId], { data: batch, offline: false, saved_at: Date.now() });
            void saveToCache("batch", batchId, scope.adminDriverId, batch);
          }
          if (outcome.response.already_done) showToast(t.alreadyDone(outcome.response.done_by?.name ?? "", formatClock(outcome.response.done_by?.at)), "warn");
          else if (opts.doneMessage) showToast(opts.doneMessage);
        } else if (outcome.status === "queued") {
          showToast(t.savedOffline, "warn");
        } else if (outcome.status === "unauthorized") {
          setLocation("/driver/login");
        } else if (isRemovedByDispatch(outcome.info.code)) {
          showToast(outcome.info.code === "trip_removed" ? t.removedTrip : t.orderRemovedByDispatch, "error");
        } else {
          showToast(driverMessage(outcome.info.message, t), "error");
        }
        return outcome;
      } finally {
        // Refresh right after every action (also picks up dispatch changes).
        void queryClient.invalidateQueries({ queryKey: ["driver-assignment", batchId] });
        void queryClient.invalidateQueries({ queryKey: ["driver-today"] });
        busyRef.current = false;
        setBusy(false);
      }
    },
    [runtime, batchId, scope.adminDriverId, scope.isAdmin, queryClient, setLocation],
  );

  return { run, busy, ready: Boolean(runtime) };
}

// Alerts belong to the logged-in crew member only (no admin ?driver_id= view).
export function useAlertsQuery(scope: DriverScope) {
  const enabled = !scope.sessionLoading && !scope.isAdmin;
  return useQuery({
    queryKey: ["driver-alerts"],
    queryFn: () => driverApi.getAlerts(),
    enabled,
    retry: 1,
    refetchInterval: (query) => (!query.state.error ? 60_000 : false),
  });
}
