import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as driverApi from "@/services/api/driver";
import { capturePosition } from "@/lib/geo";
import { fetchWithCache, saveToCache, useRuntime } from "@/lib/offlineRuntime";
import { buildActionBody } from "@/lib/tripActions";
import type { ActionSpec, SubmitOutcome } from "@/lib/tripActions";
import type { QueueBlob, QueueKind } from "@/lib/offlineQueue";
import { alreadyDoneText } from "@/lib/driver";
import type { DriverScope } from "./shared";
import { showToast } from "./shared";

// Every read goes through the cache so screens still render offline ("offline - showing saved data").

export function useToday(scope: DriverScope) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId;
  return useQuery({
    queryKey: ["driver-today", scope.adminDriverId],
    queryFn: () => fetchWithCache("today", undefined, scope.adminDriverId, () => driverApi.getToday(scope.adminDriverId)),
    enabled,
    retry: 1,
  });
}

export function useAssignmentQuery(scope: DriverScope, batchId: string | undefined) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId && Boolean(batchId);
  return useQuery({
    queryKey: ["driver-assignment", batchId, scope.adminDriverId],
    queryFn: () => fetchWithCache("batch", batchId, scope.adminDriverId, () => driverApi.getAssignment(batchId as string, scope.adminDriverId)),
    enabled,
    retry: 1,
    refetchInterval: (query) => (query.state.data?.data.details_loading ? 8000 : false),
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

export function useRouteQuery(scope: DriverScope, batchId: string | undefined, enabledExtra = true) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId && Boolean(batchId) && enabledExtra;
  return useQuery({
    queryKey: ["driver-route", batchId, scope.adminDriverId],
    queryFn: () => fetchWithCache("route", batchId, scope.adminDriverId, () => driverApi.getRoute(batchId as string, scope.adminDriverId)),
    enabled,
    retry: 1,
  });
}

export function useOfficersQuery(scope: DriverScope) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId;
  return useQuery({
    queryKey: ["driver-officers", scope.adminDriverId],
    queryFn: () => fetchWithCache("officers", undefined, scope.adminDriverId, () => driverApi.getOfficers(scope.adminDriverId)),
    enabled,
    retry: 1,
  });
}

export function useTimelineQuery(scope: DriverScope, batchId: string | undefined) {
  const enabled = !scope.sessionLoading && !scope.missingDriverId && Boolean(batchId);
  return useQuery({
    queryKey: ["driver-timeline", batchId, scope.adminDriverId],
    queryFn: () => fetchWithCache("timeline", batchId, scope.adminDriverId, () => driverApi.getTimeline(batchId as string, scope.adminDriverId)),
    enabled,
    retry: 1,
  });
}

export interface RunOptions {
  kind: QueueKind;
  so_id?: string | null;
  label: string;
  path: string;
  extra?: Record<string, unknown>;
  blobs?: QueueBlob[];
  // Message shown after success when nothing else is said (e.g. "Trip started").
  doneMessage?: string;
}

// Crew action runner: capture GPS at the tap -> body (key, client_ts, gps) -> online first,
// queue on network failure. Guarded against double taps while a call is in flight.
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
      try {
        const position = await capturePosition({ timeoutMs: 8000 });
        const body = buildActionBody(position, opts.extra ?? {});
        const spec: ActionSpec = { batch_id: batchId, so_id: opts.so_id ?? null, kind: opts.kind, label: opts.label, path: opts.path, body, blobs: opts.blobs };
        const outcome = await runtime.submitter.submit(spec);
        if (outcome.status === "done") {
          const batch = outcome.response.batch;
          if (batch) {
            queryClient.setQueryData(["driver-assignment", batchId, scope.adminDriverId], { data: batch, offline: false, saved_at: Date.now() });
            void saveToCache("batch", batchId, scope.adminDriverId, batch);
          }
          void queryClient.invalidateQueries({ queryKey: ["driver-today"] });
          void queryClient.invalidateQueries({ queryKey: ["driver-route", batchId] });
          if (outcome.response.already_done) showToast(alreadyDoneText(outcome.response.done_by), "warn");
          else if (opts.doneMessage) showToast(opts.doneMessage);
        } else if (outcome.status === "queued") {
          showToast(`${opts.label} saved - it will sync when you are online.`, "warn");
        } else if (outcome.status === "unauthorized") {
          setLocation("/login");
        } else {
          showToast(outcome.info.message, "error");
          // The server state moved on (e.g. the trip already started): refresh the flags.
          void queryClient.invalidateQueries({ queryKey: ["driver-assignment", batchId] });
        }
        return outcome;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [runtime, batchId, scope.adminDriverId, scope.isAdmin, queryClient, setLocation],
  );

  return { run, busy, ready: Boolean(runtime) };
}

export { assignmentPath as assignmentHref, subpagePath as subpageHref } from "@/lib/tripNav";
