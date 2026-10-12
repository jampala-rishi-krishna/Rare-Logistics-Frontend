import { Link, useParams, useSearchParams } from "wouter";
import { ArrowLeft, MapPin, Navigation } from "lucide-react";
import * as driverApi from "@/services/api/driver";
import { formatClock, formatKg, formatLongDate, formatQty, mapsSearchUrl, personName, telHref, withDriverParams } from "@/lib/driver";
import { useOfflineQueue } from "@/lib/offlineRuntime";
import { deriveBatchState } from "@/lib/tripState";
import type { EffectiveBatch, EffectiveOrder } from "@/lib/tripState";
import type { RouteInfo } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { assignmentHref, subpageHref, useAssignmentQuery, useCrewAction, useRouteQuery } from "./queries";
import {
  BlockerNote,
  ChipBadge,
  CrewList,
  ErrorState,
  MissingDriverNotice,
  OfflineNote,
  PhoneLink,
  Skeleton,
  Stat,
  btnPrimary,
  btnSecondary,
  errorText,
  useDriverMe,
  useDriverScope,
} from "./shared";
import type { DriverScope } from "./shared";

const linkBtn = (primary: boolean) => (primary ? btnPrimary : btnSecondary);

function OrderCard({
  eff,
  route,
  scope,
  batchId,
  canAct,
  busy,
  onCheckIn,
  onRetry,
  onDismiss,
}: {
  eff: EffectiveOrder;
  route: RouteInfo | undefined;
  scope: DriverScope;
  batchId: string;
  canAct: boolean;
  busy: boolean;
  onCheckIn: (eff: EffectiveOrder) => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const order = eff.order;
  const wf = order.workflow ?? null;
  const contact = order.contact;
  const contactPhone = telHref(contact?.phone) ? contact?.phone : null;
  const stop = wf?.stop ?? null;
  const navigateUrl = route?.stops.find((s) => String(s.so_id) === eff.so_id)?.navigate_url ?? (order.address_text ? mapsSearchUrl(order.address_text) : null);
  const showButtons = canAct && (eff.canAcknowledge || eff.canCheckIn || eff.canCheckOut);
  const ackBy = wf?.ack ? `${personName(wf.ack.by)}${wf.ack.at ? ` at ${formatClock(wf.ack.at)}` : ""}` : null;
  const arrivedBy = stop?.checkin_at ? `${personName(stop.checkin_by)}${stop.checkin_at ? ` at ${formatClock(stop.checkin_at)}` : ""}` : null;

  return (
    <article className="border border-[#e4e3df] bg-white p-4" data-testid={`driver-order-${order.so_number}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-[#77787b]">
            {stop ? `Stop ${stop.sequence} · ` : ""}
            {order.so_number}
          </div>
          <h2 className="mt-1 break-words text-lg font-bold leading-snug">{order.customer_name}</h2>
        </div>
      </div>

      {eff.statusLabel && (
        <div className="mt-2 text-sm font-bold" data-testid={`driver-order-status-${order.so_number}`}>
          {eff.statusLabel}
        </div>
      )}
      {ackBy && <div className="text-xs text-[#55565a]">Acknowledged by {ackBy}</div>}
      {arrivedBy && <div className="text-xs text-[#55565a]">Arrived: {arrivedBy}</div>}
      {stop?.checkout_at && (
        <div className="text-xs text-[#55565a]">
          Checked out by {personName(stop.checkout_by)} at {formatClock(stop.checkout_at)}
          {stop.reason ? ` - ${stop.reason}` : ""}
        </div>
      )}
      {stop?.checkin_far && (
        <div role="alert" className="mt-2 border-l-2 border-[#a16819] bg-[#fff8ec] p-3 text-sm font-semibold text-[#6b4a00]" data-testid="driver-checkin-far">
          You checked in {stop.checkin_distance_m !== null ? `${Math.round(stop.checkin_distance_m)} m` : "far"} from this address. Check that you are at the right stop.
        </div>
      )}
      {!stop?.checkin_far && stop?.checkin_distance_m !== null && stop?.checkin_distance_m !== undefined && (
        <div className="text-xs text-[#55565a]">{Math.round(stop.checkin_distance_m)} m from the address at check-in</div>
      )}

      {eff.attention.map((a, i) => (
        <div key={a.id ?? i} role="alert" className="mt-3 border border-[#f0c4c7] bg-[#fff1f2] p-3 text-sm text-[#86000B]">
          <div className="font-semibold">Not accepted by the server</div>
          <p className="mt-1 break-words">{a.error}</p>
          {a.id && (
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => onRetry(a.id as string)} className="min-h-[48px] flex-1 border border-black bg-white px-3 text-sm font-semibold text-black">
                Retry
              </button>
              <button type="button" onClick={() => onDismiss(a.id as string)} className="min-h-[48px] flex-1 border border-[#86000B] bg-white px-3 text-sm font-semibold">
                Dismiss
              </button>
            </div>
          )}
        </div>
      ))}

      {contact && (contact.person || contactPhone || contact.attention) && (
        <div className="mt-3 text-sm">
          {contact.person && <div className="font-semibold">{contact.person}</div>}
          {contact.attention && <div className="text-[#55565a]">Attn: {contact.attention}</div>}
          {contactPhone && <PhoneLink phone={contactPhone} />}
        </div>
      )}

      {order.address_text && (
        <div className="mt-3 flex items-start gap-2 border border-[#e4e3df] bg-[#fafaf8] p-3 text-sm">
          <MapPin size={18} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            {order.address_lines.length > 0
              ? order.address_lines.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))
              : order.address_text}
          </span>
        </div>
      )}

      {order.notes && (
        <div className="mt-3 border-l-2 border-[#a16819] bg-[#fff8ec] p-3 text-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#a16819]">Notes</div>
          <p className="mt-1 whitespace-pre-wrap break-words">{order.notes}</p>
        </div>
      )}

      {canAct && (
        <div className="mt-3 grid gap-2">
          {eff.canAcknowledge && (
            <Link href={subpageHref(batchId, `acknowledge/${encodeURIComponent(eff.so_id)}`, scope.adminDriverId)} data-testid={`driver-ack-${order.so_number}`} className={linkBtn(true)}>
              Acknowledge
            </Link>
          )}
          {eff.canCheckIn && (
            <button type="button" disabled={busy} onClick={() => onCheckIn(eff)} data-testid={`driver-arrived-${order.so_number}`} className={btnPrimary}>
              Arrived
            </button>
          )}
          {eff.canCheckOut && (
            <Link href={subpageHref(batchId, `checkout/${encodeURIComponent(eff.so_id)}`, scope.adminDriverId)} data-testid={`driver-checkout-${order.so_number}`} className={linkBtn(true)}>
              Deliver / Check out
            </Link>
          )}
          {!showButtons && null}
        </div>
      )}
      {canAct && !(eff.canAcknowledge || eff.canCheckIn || eff.canCheckOut) && eff.blocker && (
        <div className="mt-3">
          <BlockerNote text={eff.blocker} />
        </div>
      )}
      {navigateUrl && (
        <a href={navigateUrl} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} mt-3`} data-testid={`driver-navigate-${order.so_number}`}>
          <Navigation size={18} />
          Navigate
        </a>
      )}

      {(order.lines.length > 0 || order.details_loading) && (
        <details className="mt-3 border-t border-[#efeeeb] pt-2">
          <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold">
            Items ({formatQty(order.total_packs)} packs, {formatKg(order.total_kg)})
          </summary>
          {order.details_loading && <div className="text-xs font-semibold text-[#6b4a00]">Details loading&hellip;</div>}
          <ul className="divide-y divide-[#efeeeb]">
            {order.lines.map((line, i) => (
              <li key={i} className="py-2.5">
                <div className="break-words text-sm font-semibold">{line.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-[#55565a]">
                  <span>
                    Qty {formatQty(line.quantity)}
                    {line.unit ? ` ${line.unit}` : ""}
                  </span>
                  <span>{formatQty(line.packs)} packs</span>
                  {line.kg !== null && line.kg !== undefined && <span>{formatKg(line.kg)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function PrimaryArea({
  state,
  route,
  scope,
  batchId,
  busy,
  onStart,
  onEnd,
}: {
  state: EffectiveBatch;
  route: RouteInfo | undefined;
  scope: DriverScope;
  batchId: string;
  busy: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const links = route?.maps_links ?? [];
  const routeHref = subpageHref(batchId, "route", scope.adminDriverId);
  const handoverHref = subpageHref(batchId, "handover", scope.adminDriverId);
  const timelineHref = withDriverParams(`/driver/trip/${encodeURIComponent(batchId)}`, { driver_id: scope.adminDriverId });
  return (
    <section className="grid gap-3" data-testid="driver-primary-area">
      {state.status === "pending" &&
        (state.canStart ? (
          <button type="button" disabled={busy} onClick={onStart} data-testid="driver-start-trip" className={btnPrimary}>
            Start trip
          </button>
        ) : (
          <BlockerNote text={state.startBlocker} />
        ))}
      {state.status === "on_trip" && (
        <>
          {links.length > 0 ? (
            links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" data-testid="driver-open-maps" className={btnPrimary}>
                <Navigation size={20} />
                {links.length > 1 ? `Open route in Google Maps - ${l.label}` : "Open route in Google Maps"}
              </a>
            ))
          ) : (
            <Link href={routeHref} className={btnPrimary}>
              <Navigation size={20} />
              View route
            </Link>
          )}
          <Link href={routeHref} className={btnSecondary}>
            All stops
          </Link>
          {state.canEnd ? (
            <button type="button" disabled={busy} onClick={onEnd} data-testid="driver-end-trip" className={btnPrimary}>
              End trip - back at warehouse
            </button>
          ) : (
            <BlockerNote text={state.endBlocker} />
          )}
        </>
      )}
      {state.status === "returned" &&
        (state.canHandover ? (
          <Link href={handoverHref} data-testid="driver-handover-link" className={btnPrimary}>
            Hand over invoices
          </Link>
        ) : (
          <BlockerNote text="Waiting for the trip end to sync before invoices can be handed over." />
        ))}
      {state.status === "handover_submitted" && <BlockerNote text="Handover submitted. Waiting for the logistics officer to validate the invoices." />}
      {state.status === "closed" && <p className="border border-[#e4e3df] bg-white p-3 text-sm font-semibold">Trip closed.</p>}
      {state.status !== "pending" && (
        <Link href={timelineHref} className={btnSecondary}>
          View trip timeline
        </Link>
      )}
    </section>
  );
}

export default function DriverAssignment() {
  const { batch_id: batchId } = useParams<{ batch_id: string }>();
  const [params] = useSearchParams();
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const detail = useAssignmentQuery(scope, batchId);
  const route = useRouteQuery(scope, batchId);
  const queue = useOfflineQueue();
  const actions = useCrewAction(scope, batchId ?? "");

  const fromHistory = params.get("from") === "history";
  const backHref = withDriverParams(fromHistory ? "/driver/history" : "/driver/today", { driver_id: scope.adminDriverId });
  const batch = detail.data?.data;
  const state = batch ? deriveBatchState(batch, queue.entries) : null;
  const canAct = !scope.isAdmin;

  const startTrip = () => void actions.run({ kind: "start", label: "Start trip", path: driverApi.paths.start(batchId), doneMessage: "Trip started" });
  const endTrip = () => {
    if (!window.confirm("End the trip? Only do this when you are back at the warehouse.")) return;
    void actions.run({ kind: "end", label: "End trip", path: driverApi.paths.end(batchId), doneMessage: "Trip ended" });
  };
  const checkIn = (eff: EffectiveOrder) =>
    void actions.run({
      kind: "check_in",
      so_id: eff.so_id,
      label: `Arrived at ${eff.order.so_number}`,
      path: driverApi.paths.checkIn(batchId, eff.so_id),
      doneMessage: `Arrived at ${eff.order.so_number}`,
    });

  return (
    <DriverLayout scope={scope} name={me.data?.name ?? null}>
      <Link href={backHref} data-testid="driver-assignment-back" className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold">
        <ArrowLeft size={18} />
        {fromHistory ? "Back to history" : "Back to today"}
      </Link>

      {scope.missingDriverId ? (
        <MissingDriverNotice />
      ) : detail.isLoading ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : detail.isError && !batch ? (
        <ErrorState message={errorText(detail.error)} onRetry={() => void detail.refetch()} />
      ) : batch && state ? (
        <div className="grid gap-3">
          <OfflineNote offline={Boolean(detail.data?.offline)} savedAt={detail.data?.saved_at} />
          <section className="border border-[#e4e3df] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#77787b]">{formatLongDate(batch.delivery_date)}</div>
                <div className="mt-1 font-mono text-2xl font-bold">{batch.vehicle}</div>
              </div>
              {batch.trip && <ChipBadge chip={state.chip} label={state.chipLabel} />}
            </div>
            {state.pendingCount > 0 && (
              <div className="mt-2 inline-flex border border-[#e6c36a] bg-[#fff6dd] px-2 py-1 text-xs font-bold text-[#6b4a00]">Pending sync ({state.pendingCount})</div>
            )}
            {state.progressText && (
              <div className="mt-3" data-testid="driver-progress">
                <div className="text-sm font-bold">{state.progressText}</div>
                <div className="mt-1 h-2 w-full bg-[#e4e3df]">
                  <div className="h-2 bg-[#33673B]" style={{ width: `${state.total > 0 ? Math.round((state.stopsDone / state.total) * 100) : 0}%` }} />
                </div>
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Orders" value={batch.so_count} />
              <Stat label="Total" value={formatKg(batch.total_kg)} />
              <Stat label="Packs" value={formatQty(batch.total_packs)} />
            </div>
            {batch.departure_time && <div className="mt-3 text-sm text-[#55565a]">Departure {batch.departure_time}</div>}
            <CrewList crew={batch.crew} helpers={batch.helpers} />
            {batch.details_loading && <div className="mt-3 text-xs font-semibold text-[#6b4a00]">Some details are still loading&hellip;</div>}
          </section>

          {scope.isAdmin && <BlockerNote text="Admin view is read only. Crew actions are done by the driver or helper." />}
          {canAct && batch.trip && (
            <PrimaryArea state={state} route={route.data?.data} scope={scope} batchId={batchId} busy={actions.busy || !actions.ready} onStart={startTrip} onEnd={endTrip} />
          )}
          {route.data?.data.warning && <p className="text-xs text-[#6b4a00]">{route.data.data.warning}</p>}

          {state.orders.length === 0 ? (
            <div className="border border-[#e4e3df] bg-white p-5 text-sm text-[#55565a]">No orders in this assignment.</div>
          ) : (
            state.orders.map((eff) => (
              <OrderCard
                key={eff.so_id}
                eff={eff}
                route={route.data?.data}
                scope={scope}
                batchId={batchId}
                canAct={canAct && Boolean(batch.trip)}
                busy={actions.busy || !actions.ready}
                onCheckIn={checkIn}
                onRetry={(id) => void queue.retry(id)}
                onDismiss={(id) => {
                  if (window.confirm("Discard this action? It was not accepted and will be lost.")) void queue.dismiss(id);
                }}
              />
            ))
          )}
          <Link href={assignmentHref(batchId, scope.adminDriverId)} className="sr-only">
            Reload
          </Link>
        </div>
      ) : null}
    </DriverLayout>
  );
}
