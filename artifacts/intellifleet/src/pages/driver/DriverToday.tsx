import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { ChevronRight, Phone } from "lucide-react";
import { browserPollDeps, formatKg, formatLongDate, greeting, startVisibilityPolling, telHref, withDriverParams } from "@/lib/driver";
import { useOfflineQueue } from "@/lib/offlineRuntime";
import type { Batch } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { useToday } from "./queries";
import { ChipBadge, CrewList, ErrorState, MissingDriverNotice, OfflineNote, Skeleton, Stat, StatusBadge, errorText, useDriverMe, useDriverScope } from "./shared";

const POLL_MS = 60_000;

function BatchCard({ batch, adminDriverId, pendingCount }: { batch: Batch; adminDriverId: string | null; pendingCount: number }) {
  const href = withDriverParams(`/driver/assignment/${encodeURIComponent(batch.batch_id)}`, { driver_id: adminDriverId });
  const route = [batch.first_area, batch.last_area].filter(Boolean).join(" → ");
  const trip = batch.trip ?? null;
  return (
    <article className="border border-[#e4e3df] bg-white" data-testid={`driver-batch-${batch.batch_id}`}>
      <Link href={href} className="block min-h-[44px] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#77787b]">Vehicle</div>
            <div className="font-mono text-xl font-bold">{batch.vehicle}</div>
          </div>
          <div className="flex items-center gap-2">
            {!trip && batch.email_status && <StatusBadge status={batch.email_status} />}
            <ChevronRight size={20} className="text-[#77787b]" />
          </div>
        </div>
        {trip && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ChipBadge chip={trip.chip} label={trip.chip_label} />
            {pendingCount > 0 && (
              <span className="inline-flex items-center border border-[#e6c36a] bg-[#fff6dd] px-2 py-1 text-xs font-bold text-[#6b4a00]">
                Pending sync ({pendingCount})
              </span>
            )}
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Orders" value={batch.so_count} />
          <Stat label="Total" value={formatKg(batch.total_kg)} />
          <Stat label="Packs" value={batch.total_packs.toLocaleString("en-US")} />
        </div>
        {route && <div className="mt-3 break-words text-sm">{route}</div>}
        {batch.departure_time && <div className="mt-1 text-sm text-[#55565a]">Departure {batch.departure_time}</div>}
        {!batch.stop_order_set && <div className="mt-2 text-xs text-[#77787b]">Stop order not set</div>}
      </Link>
      <div className="border-t border-[#efeeeb] px-4 pb-2">
        <CrewList crew={batch.crew} helpers={batch.helpers} />
      </div>
    </article>
  );
}

export default function DriverToday() {
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const enabled = !scope.sessionLoading && !scope.missingDriverId;
  const today = useToday(scope);
  const queue = useOfflineQueue();

  // Poll every 60s only while the tab is visible; refetch right away when it becomes visible.
  const refetchRef = useRef(today.refetch);
  refetchRef.current = today.refetch;
  useEffect(() => {
    if (!enabled) return;
    return startVisibilityPolling(() => void refetchRef.current(), POLL_MS, browserPollDeps());
  }, [enabled]);

  const data = today.data?.data;
  const name = me.data?.name ?? data?.driver.name ?? null;
  const dispatchHref = telHref(me.data?.dispatch_phone);
  const pendingFor = (batchId: string) => queue.entries.filter((e) => e.batch_id === batchId && (e.status === "pending" || e.status === "syncing")).length;

  return (
    <DriverLayout scope={scope} name={name}>
      {scope.missingDriverId ? (
        <MissingDriverNotice />
      ) : (
        <>
          <section className="mb-5">
            {me.data ? (
              <>
                <h1 className="text-2xl font-bold leading-tight" data-testid="driver-greeting">
                  {greeting(me.data.now, me.data.name)}
                </h1>
                <p className="mt-1 text-sm text-[#55565a]">{formatLongDate(me.data.today)}</p>
              </>
            ) : me.isError ? (
              <h1 className="text-2xl font-bold leading-tight">Today</h1>
            ) : (
              <div className="grid gap-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
          </section>

          <OfflineNote offline={Boolean(today.data?.offline)} savedAt={today.data?.saved_at} />

          {today.isLoading ? (
            <div className="grid gap-3" aria-busy="true">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : today.isError && !data ? (
            <ErrorState message={errorText(today.error)} onRetry={() => void today.refetch()} />
          ) : data && data.batches.length === 0 ? (
            <div className="border border-[#e4e3df] bg-white p-6 text-center">
              <p className="text-base font-semibold">No assignments yet today.</p>
              {dispatchHref && (
                <a
                  href={dispatchHref}
                  data-testid="driver-call-dispatch"
                  className="mt-4 inline-flex min-h-[48px] items-center justify-center gap-2 bg-black px-6 text-sm font-semibold text-white"
                >
                  <Phone size={16} />
                  Call dispatch
                </a>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {today.isError && <p className="text-xs text-[#86000B]">Could not refresh just now. Showing the last loaded assignments.</p>}
              {data?.batches.map((batch) => (
                <BatchCard key={batch.batch_id} batch={batch} adminDriverId={scope.adminDriverId} pendingCount={pendingFor(batch.batch_id)} />
              ))}
              {dispatchHref && (
                <a
                  href={dispatchHref}
                  data-testid="driver-call-dispatch"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 border border-black bg-white px-6 text-sm font-semibold"
                >
                  <Phone size={16} />
                  Call dispatch
                </a>
              )}
            </div>
          )}
        </>
      )}
    </DriverLayout>
  );
}
