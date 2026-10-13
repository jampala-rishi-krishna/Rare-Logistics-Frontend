import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { AlertTriangle, ChevronRight, Phone } from "lucide-react";
import { browserPollDeps, formatLongDate, greeting, startVisibilityPolling, telHref, withDriverParams } from "@/lib/driver";
import { primaryAction, routeText, stopProgress, tripLabel } from "@/lib/tripCards";
import { useOfflineQueue } from "@/lib/offlineRuntime";
import type { Batch, DaySummary } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { useToday } from "./queries";
import { ChipBadge, ErrorState, KgValue, MissingDriverNotice, OfflineNote, PacksValue, Skeleton, errorText, useDriverMe, useDriverScope } from "./shared";

const POLL_MS = 60_000;

function Tile({ label, value, warn = false, testId }: { label: string; value: number | string; warn?: boolean; testId: string }) {
  return (
    <div data-testid={testId} className={`min-w-0 border bg-white px-3 py-3 ${warn ? "border-[#e6c36a]" : "border-[#e4e3df]"}`}>
      <div className="flex items-center gap-1 text-2xl font-bold leading-none">
        {warn && Number(value) > 0 && <AlertTriangle size={18} className="text-[#a16819]" aria-hidden="true" />}
        {value}
      </div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase leading-tight text-[#77787b]">{label}</div>
    </div>
  );
}

function Kpis({ summary }: { summary: DaySummary }) {
  return (
    <section aria-label="Today at a glance" className="mb-5 grid grid-cols-4 gap-2" data-testid="driver-kpis">
      <Tile testId="kpi-assigned" label="Assigned" value={summary.assigned} />
      <Tile testId="kpi-completed" label="Completed" value={summary.completed} />
      <Tile testId="kpi-remaining" label="Remaining" value={summary.remaining} />
      <Tile testId="kpi-attention" label="Attention" value={summary.needs_attention} warn />
    </section>
  );
}

function BatchCard({ batch, adminDriverId, pendingCount }: { batch: Batch; adminDriverId: string | null; pendingCount: number }) {
  const href = withDriverParams(`/driver/assignment/${encodeURIComponent(batch.batch_id)}`, { driver_id: adminDriverId });
  const action = primaryAction(batch);
  const route = routeText(batch);
  const label = tripLabel(batch);
  const progress = stopProgress(batch);
  const people = batch.crew && batch.crew.length > 0 ? batch.crew : (batch.helpers ?? []).map((h) => ({ id: h.id, name: h.name, role: "helper", phone: h.phone }));
  return (
    <article className="overflow-hidden border border-[#d8d7d2] bg-white" data-testid={`driver-batch-${batch.batch_id}`}>
      <Link href={href} className="block p-4" aria-label={`Open ${batch.vehicle}${label ? `, ${label}` : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#77787b]">{label ? `Vehicle · ${label}` : "Vehicle"}</div>
            <div className="font-mono text-xl font-bold">{batch.vehicle}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {batch.trip ? <ChipBadge chip={batch.trip.chip} label={batch.trip.chip_label} /> : null}
            <ChevronRight size={20} className="text-[#77787b]" />
          </div>
        </div>
        {pendingCount > 0 && <div className="mt-2 inline-flex border border-[#e6c36a] bg-[#fff6dd] px-2 py-1 text-xs font-bold text-[#6b4a00]">Pending sync ({pendingCount})</div>}
        <div className="mt-3 grid grid-cols-3 gap-3 border-y border-[#efeeeb] py-3 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Orders</div>
            <div className="font-semibold">{batch.so_count}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Total</div>
            <KgValue kg={batch.total_kg} unknownLines={batch.kg_unknown_lines} className="font-semibold" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Packs</div>
            <div className="font-semibold">
              <PacksValue packs={batch.total_packs} />
            </div>
          </div>
        </div>
        {route && (
          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Route</div>
            <div className="mt-0.5 break-words text-sm font-semibold">{route}</div>
          </div>
        )}
        {progress && (
          <div className="mt-3" data-testid="driver-card-progress">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>
                {progress.done} of {progress.total} orders done
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full bg-[#e4e3df]">
              <div className="h-1.5 bg-[#33673B]" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}
      </Link>
      {people.length > 0 && (
        <ul className="border-t border-[#efeeeb] px-4 py-1 text-sm">
          {people.map((p) => {
            const tel = telHref(p.phone);
            return (
              <li key={String(p.id)} className="flex min-h-[48px] items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="capitalize text-[#77787b]">{p.role}</span> {p.name}
                </span>
                {tel && (
                  <a href={tel} aria-label={`Call ${p.name}`} className="inline-flex h-12 w-12 shrink-0 items-center justify-center">
                    <Phone size={18} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-[#efeeeb] p-3">
        {action.actionable ? (
          <Link href={href} data-testid={`driver-card-action-${action.kind}`} className="inline-flex min-h-[52px] w-full items-center justify-center bg-black px-4 text-base font-bold !text-white">
            {action.label}
          </Link>
        ) : (
          <div data-testid="driver-card-action-wait" className="flex min-h-[52px] items-center justify-center border border-[#e6c36a] bg-[#fff6dd] px-4 text-sm font-bold text-[#6b4a00]">
            {action.label}
          </div>
        )}
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
          <section className="mb-4">
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
          {data?.summary && data.batches.length > 0 && <Kpis summary={data.summary} />}

          {today.isLoading ? (
            <div className="grid gap-3" aria-busy="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : today.isError && !data ? (
            <ErrorState message={errorText(today.error)} onRetry={() => void today.refetch()} />
          ) : data && data.batches.length === 0 ? (
            <div className="border border-[#e4e3df] bg-white p-6 text-center" data-testid="driver-empty-today">
              <p className="text-base font-semibold">No assignments yet today.</p>
              <p className="mt-1 text-sm text-[#55565a]">New assignments from dispatch appear here and in Alerts.</p>
              {dispatchHref && (
                <a href={dispatchHref} data-testid="driver-call-dispatch" className="mt-4 inline-flex min-h-[52px] items-center justify-center gap-2 bg-black px-6 text-sm font-semibold !text-white">
                  <Phone size={16} />
                  Call dispatch
                </a>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              <h2 className="text-base font-bold">Today&apos;s assignments</h2>
              {today.isError && <p className="text-xs text-[#86000B]">Could not refresh just now. Showing the last loaded assignments.</p>}
              {data?.batches.map((batch) => (
                <BatchCard key={batch.batch_id} batch={batch} adminDriverId={scope.adminDriverId} pendingCount={pendingFor(batch.batch_id)} />
              ))}
              {dispatchHref && (
                <a href={dispatchHref} data-testid="driver-call-dispatch" className="inline-flex min-h-[52px] items-center justify-center gap-2 border border-black bg-white px-6 text-sm font-semibold">
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
