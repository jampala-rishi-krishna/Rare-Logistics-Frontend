import { Link, useParams } from "wouter";
import { OrderTypeBadge } from "@/components/load-planning/OrderTypeBadge";
import { MapPin, Navigation, Warehouse } from "lucide-react";
import { formatClock, personName } from "@/lib/driver";
import { actionsEnabled, assignmentPath, checkinNotice, checkoutPath, handoverPath, stopRows } from "@/lib/tripNav";
import type { StopRow } from "@/lib/tripNav";
import type { EffectiveBatch } from "@/lib/tripState";
import { useRouteQuery } from "./queries";
import { BlockerNote, ChipBadge, ErrorState, Skeleton, btnPrimary, btnSecondary, errorText } from "./shared";
import type { DriverScope } from "./shared";
import { BatchFrame, InlineAlert, StickyBar, useBatchScreen, useTripActions } from "./subscreen";

function StopCard({ row, scope, batchId, canAct, busy, onArrived }: { row: StopRow; scope: DriverScope; batchId: string; canAct: boolean; busy: boolean; onArrived: (row: StopRow) => void }) {
  const eff = row.eff;
  const stop = eff?.order.workflow?.stop ?? null;
  const notice = checkinNotice(stop);
  const done = eff?.stopStatus === "checked_out";
  const url = row.navigate_url;
  return (
    <li className={`border bg-white p-4 ${done ? "border-[#33673B]/40" : "border-[#e4e3df]"}`} data-testid={`driver-stop-${row.so_number}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-black text-sm font-bold !text-white">{row.sequence}</span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-semibold text-[#77787b]"><OrderTypeBadge type={row.order_type ?? row.eff?.order.order_type} className="mr-1.5 align-middle" />{row.so_number}</div>
          <div className="break-words text-base font-bold leading-snug">{row.customer_name}</div>
          {row.address_text && (
            <div className="mt-1 flex items-start gap-1.5 text-sm text-[#55565a]">
              <MapPin size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{row.address_text}</span>
            </div>
          )}
          {eff && <div className="mt-2 text-sm font-bold">{eff.statusLabel}</div>}
          {stop?.checkin_at && (
            <div className="text-xs text-[#55565a]">
              Arrived {formatClock(stop.checkin_at)} by {personName(stop.checkin_by) || "crew"}
            </div>
          )}
          {stop?.checkout_at && (
            <div className="text-xs text-[#55565a]">
              Departed {formatClock(stop.checkout_at)} by {personName(stop.checkout_by) || "crew"}
              {stop.invoice_no ? ` \u00b7 Invoice/DR ${stop.invoice_no}` : ""}
              {stop.reason ? ` - ${stop.reason}` : ""}
            </div>
          )}
          {notice && (
            <div
              role={notice.far ? "alert" : undefined}
              data-testid={notice.far ? "driver-checkin-far" : undefined}
              className={notice.far ? "mt-2 border-l-2 border-[#a16819] bg-[#fff8ec] p-3 text-sm font-semibold text-[#6b4a00]" : "text-xs text-[#55565a]"}
            >
              {notice.text}
            </div>
          )}
          {eff?.attention.map((a, i) => (
            <div key={a.id ?? i} role="alert" className="mt-2 border border-[#f0c4c7] bg-[#fff1f2] p-3 text-sm text-[#86000B]">
              <span className="font-semibold">Not accepted by the server: </span>
              <span className="break-words">{a.error}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {canAct && eff?.canCheckIn && (
          <button type="button" disabled={busy} onClick={() => onArrived(row)} data-testid={`driver-arrived-${row.so_number}`} className={btnPrimary}>
            {busy ? "Getting location..." : "Arrived at site"}
          </button>
        )}
        {canAct && eff?.canCheckOut && (
          <Link href={checkoutPath(batchId, row.so_id, scope.adminDriverId)} data-testid={`driver-checkout-${row.so_number}`} className={btnPrimary}>
            Departed from site
          </Link>
        )}
        {canAct && eff && !eff.canCheckIn && !eff.canCheckOut && eff.blocker && <BlockerNote text={eff.blocker} />}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={btnSecondary} data-testid={`driver-navigate-${row.so_number}`}>
            <Navigation size={18} />
            Navigate to stop
          </a>
        )}
      </div>
    </li>
  );
}

function ActionBar({ state, canAct, busy, capturing, onStart, onEnd, handoverHref }: { state: EffectiveBatch; canAct: boolean; busy: boolean; capturing: boolean; onStart: () => void; onEnd: () => void; handoverHref: string }) {
  if (!canAct) return null;
  if (state.status === "pending") {
    return (
      <StickyBar>
        {!state.canStart && <BlockerNote text={state.startBlocker ?? "This trip cannot be started yet."} />}
        <button type="button" disabled={!state.canStart || busy} onClick={onStart} data-testid="driver-start-trip" className={btnPrimary}>
          {capturing ? "Getting location..." : "Start trip"}
        </button>
      </StickyBar>
    );
  }
  if (state.status === "on_trip") {
    return (
      <StickyBar>
        {!state.canEnd && <BlockerNote text={state.endBlocker ?? "Finish every stop before ending the trip."} />}
        <button type="button" disabled={!state.canEnd || busy} onClick={onEnd} data-testid="driver-end-trip" className={btnPrimary}>
          {capturing ? "Getting location..." : "End trip - back at warehouse"}
        </button>
      </StickyBar>
    );
  }
  if (state.status === "returned" && state.canHandover) {
    return (
      <StickyBar>
        <Link href={handoverHref} data-testid="driver-handover-link" className={btnPrimary}>
          Hand over invoices
        </Link>
      </StickyBar>
    );
  }
  return null;
}

export default function DriverRoute() {
  const { batch_id: batchId } = useParams<{ batch_id: string }>();
  const ctx = useBatchScreen(batchId);
  const route = useRouteQuery(ctx.scope, batchId);
  const trip = useTripActions(ctx.scope, batchId ?? "");
  const adminId = ctx.scope.adminDriverId;
  return (
    <BatchFrame ctx={ctx} backHref={assignmentPath(batchId, adminId)} backLabel="Back to assignment" title="Route and stops" fullScreen>
      {(batch, state) => {
        const canAct = actionsEnabled(ctx.scope, batch);
        const info = route.data?.data;
        const rows = stopRows(info, state.orders);
        const links = info?.maps_links ?? [];
        return (
          <div className="grid gap-4">
            <section className="border border-[#e4e3df] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-xl font-bold">{batch.vehicle}</div>
                {batch.trip && <ChipBadge chip={state.chip} label={state.chipLabel} />}
              </div>
              {state.pendingCount > 0 && <div className="mt-2 inline-flex border border-[#e6c36a] bg-[#fff6dd] px-2 py-1 text-xs font-bold text-[#6b4a00]">Pending sync ({state.pendingCount})</div>}
              {state.progressText && <div className="mt-2 text-sm font-bold">{state.progressText}</div>}
              {info?.origin && (
                <div className="mt-3 flex items-start gap-2 text-sm">
                  <Warehouse size={18} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Start from</div>
                    <div className="break-words font-semibold">{info.origin.name}</div>
                    {info.origin.address && <div className="break-words text-[#55565a]">{info.origin.address}</div>}
                  </div>
                </div>
              )}
            </section>

            {ctx.scope.isAdmin && <BlockerNote text="Admin view is read only. Crew actions are done by the driver or helper." />}
            {route.isError && !info && (
              <>
                <ErrorState message={errorText(route.error)} onRetry={() => void route.refetch()} />
                <p className="text-xs text-[#55565a]">Showing the stops from the assignment instead.</p>
              </>
            )}
            {route.isLoading && <Skeleton className="h-14 w-full" />}
            {route.data?.offline && <p className="text-xs font-semibold text-[#6b4a00]">Route saved on this phone. Open Google Maps when you are back online.</p>}
            {info?.warning && <InlineAlert tone="warn">{info.warning}</InlineAlert>}
            {info && info.source === "assignment" && state.status === "pending" && <p className="text-xs text-[#55565a]">Stops are in assignment order. The order is fixed when the trip starts.</p>}

            {links.length > 0 && (
              <section className="grid gap-2" data-testid="driver-maps-links">
                {links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" data-testid="driver-open-maps" className={btnPrimary}>
                    <Navigation size={20} />
                    <span className="min-w-0 break-words">{links.length > 1 ? `Open in Google Maps - ${l.label}` : "Open in Google Maps"}</span>
                  </a>
                ))}
              </section>
            )}

            {rows.length === 0 ? (
              <div className="border border-[#e4e3df] bg-white p-5 text-sm text-[#55565a]">No stops in this assignment.</div>
            ) : (
              <ol className="grid gap-3" data-testid="driver-stops">
                {rows.map((row) => (
                  <StopCard key={row.so_id} row={row} scope={ctx.scope} batchId={batchId} canAct={canAct} busy={trip.busy} onArrived={(r) => void trip.checkIn(r.so_id, r.so_number)} />
                ))}
              </ol>
            )}

            {state.status === "returned" && !canAct && <BlockerNote text="Trip ended. Invoices are handed over by the crew." />}
            {(state.status === "handover_submitted" || state.status === "closed") && (
              <Link href={handoverPath(batchId, adminId)} className={btnSecondary}>
                {state.status === "closed" ? "Trip closed" : "Handover status"}
              </Link>
            )}
            <ActionBar
              state={state}
              canAct={canAct}
              busy={trip.busy}
              capturing={trip.capturing}
              onStart={() => void trip.startTrip()}
              onEnd={() => void trip.endTrip()}
              handoverHref={handoverPath(batchId, adminId)}
            />
          </div>
        );
      }}
    </BatchFrame>
  );
}
