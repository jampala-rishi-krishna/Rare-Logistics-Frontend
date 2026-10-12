import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import * as driverApi from "@/services/api/driver";
import { useOfflineQueue } from "@/lib/offlineRuntime";
import { deriveBatchState } from "@/lib/tripState";
import type { EffectiveBatch } from "@/lib/tripState";
import { farWarningFor } from "@/lib/tripNav";
import type { BatchDetail } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { useAssignmentQuery, useCrewAction } from "./queries";
import { ErrorState, MissingDriverNotice, OfflineNote, Skeleton, errorText, showToast, useDriverMe, useDriverScope } from "./shared";
import type { DriverScope } from "./shared";

// Shared plumbing for the trip sub-screens (acknowledge, route, check-out, handover):
// scope + batch detail + the optimistic state over the offline queue.
export function useBatchScreen(batchId: string | undefined) {
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const detail = useAssignmentQuery(scope, batchId);
  const queue = useOfflineQueue();
  const batch = detail.data?.data;
  const entries = queue.entries;
  const state = useMemo(() => (batch ? deriveBatchState(batch, entries) : null), [batch, entries]);
  return { scope, me, detail, queue, batch, state };
}

export type BatchScreen = ReturnType<typeof useBatchScreen>;

export function BatchFrame({
  ctx,
  backHref,
  backLabel,
  title,
  subtitle,
  fullScreen = false,
  children,
}: {
  ctx: BatchScreen;
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string | null;
  fullScreen?: boolean;
  children: (batch: BatchDetail, state: EffectiveBatch) => ReactNode;
}) {
  const { scope, me, detail, batch, state } = ctx;
  let body: ReactNode = null;
  if (scope.missingDriverId) body = <MissingDriverNotice />;
  else if (batch && state)
    body = (
      <>
        <OfflineNote offline={Boolean(detail.data?.offline)} savedAt={detail.data?.saved_at} />
        {children(batch, state)}
      </>
    );
  else if (detail.isError) body = <ErrorState message={errorText(detail.error)} onRetry={() => void detail.refetch()} />;
  else
    body = (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  return (
    <DriverLayout scope={scope} name={me.data?.name ?? null} fullScreen={fullScreen}>
      <Link href={backHref} data-testid="driver-sub-back" className="mb-3 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold">
        <ArrowLeft size={18} />
        {backLabel}
      </Link>
      <h1 className="text-2xl font-bold leading-tight">{title}</h1>
      {subtitle && <p className="mb-4 mt-1 break-words text-sm text-[#55565a]">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {body}
    </DriverLayout>
  );
}

// Bottom action bar that owns the bottom of full-screen forms (safe-area aware).
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e4e3df] bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto grid max-w-[640px] gap-2">{children}</div>
    </div>
  );
}

export function InlineAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "warn" }) {
  const cls = tone === "error" ? "border-[#f0c4c7] bg-[#fff1f2] text-[#86000B]" : "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]";
  return (
    <div role="alert" className={`border p-3 text-sm font-semibold ${cls}`}>
      {children}
    </div>
  );
}

// Start / end / arrived: one runner shared by the assignment detail and the route screen.
export function useTripActions(scope: DriverScope, batchId: string) {
  const actions = useCrewAction(scope, batchId);
  const startTrip = () => actions.run({ kind: "start", label: "Start trip", path: driverApi.paths.start(batchId), doneMessage: "Trip started" });
  const endTrip = () => {
    if (!window.confirm("End the trip? Only do this when you are back at the warehouse.")) return Promise.resolve(null);
    return actions.run({ kind: "end", label: "End trip", path: driverApi.paths.end(batchId), doneMessage: "Trip ended" });
  };
  const checkIn = async (soId: string, soNumber: string) => {
    const out = await actions.run({
      kind: "check_in",
      so_id: soId,
      label: `Arrived at ${soNumber}`,
      path: driverApi.paths.checkIn(batchId, soId),
      doneMessage: `Arrived at ${soNumber}`,
    });
    if (out?.status === "done") {
      const warning = farWarningFor(out.response.batch, soId);
      if (warning) showToast(warning, "warn");
    }
    return out;
  };
  return { busy: actions.busy || !actions.ready, capturing: actions.busy, run: actions.run, ready: actions.ready, startTrip, endTrip, checkIn };
}
