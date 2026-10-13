import { useState } from "react";
import { OrderTypeBadge } from "@/components/load-planning/OrderTypeBadge";
import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { formatDateTimeShort, formatLongDate, personName } from "@/lib/driver";
import { displayValue, eventLabel, formatDuration, isPhotoValue, orderIssues } from "@/lib/overview";
import { assignmentPath } from "@/lib/tripNav";
import type { Timeline, TimelineAnswer, TimelineOrder } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { useTimelineQuery } from "./queries";
import { ChipBadge, CrewList, ErrorState, MissingDriverNotice, OfflineNote, Skeleton, btnSecondary, errorText, useDriverMe, useDriverScope } from "./shared";
import { MediaPhoto } from "./media";

function mediaIdFromUrl(url: string | null | undefined): string | undefined {
  const m = url ? /\/api\/media\/(\d+)/.exec(url) : null;
  return m ? m[1] : undefined;
}

function AnswerRow({ a }: { a: TimelineAnswer }) {
  const photoId = mediaIdFromUrl(a.photo_url) ?? (isPhotoValue(a.type, a.value) ? a.value : undefined);
  return (
    <div className="grid gap-1 text-sm">
      <span className="text-xs text-[#77787b]">{a.label}</span>
      {photoId !== undefined ? <MediaPhoto photoId={photoId} alt={a.label} /> : <span className="break-words font-medium">{displayValue(a.value)}</span>}
      {a.note && <span className="break-words text-xs text-[#55565a]">Note: {a.note}</span>}
    </div>
  );
}

function Step({ title, at, tone = "neutral", children }: { title: string; at?: string | null; tone?: "neutral" | "bad"; children?: ReactNode }) {
  return (
    <li className="relative pl-5">
      <span className={`absolute left-0 top-2 h-2.5 w-2.5 rounded-full ${tone === "bad" ? "bg-[#c4291f]" : "bg-black"}`} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="min-w-0 break-words text-sm font-semibold">{title}</span>
        {at && <span className="text-xs text-[#77787b]">{formatDateTimeShort(at)}</span>}
      </div>
      {children && <div className="mt-1 grid gap-2">{children}</div>}
    </li>
  );
}

function gpsText(gps: { accuracy_m: number | null } | null | undefined): string | null {
  if (gps === undefined) return null;
  if (gps === null) return "No GPS recorded";
  return gps.accuracy_m !== null && gps.accuracy_m !== undefined ? `GPS accuracy about ${Math.round(gps.accuracy_m)} m` : "GPS recorded";
}

function OrderTimeline({ order }: { order: TimelineOrder }) {
  const issues = orderIssues(order);
  const stop = order.stop;
  const h = order.handover;
  return (
    <article className={`border bg-white p-4 ${issues.length ? "border-[#e6b4b7]" : "border-[#e4e3df]"}`} data-testid={`driver-timeline-${order.so_number}`}>
      <div className="font-mono text-xs font-semibold text-[#77787b]">
        {stop ? `Stop ${stop.sequence} · ` : ""}
        <OrderTypeBadge type={order.order_type} className="mr-1.5 align-middle" />
        {order.so_number}
      </div>
      <h2 className="break-words text-base font-bold leading-snug">{order.customer_name}</h2>
      {order.address_text && <p className="break-words text-xs text-[#77787b]">{order.address_text}</p>}
      {stop?.minutes_at_stop !== null && stop?.minutes_at_stop !== undefined && <p className="mt-1 text-xs text-[#55565a]">{formatDuration(stop.minutes_at_stop)} at stop</p>}
      {issues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {issues.map((i) => (
            <span key={i} className="border border-[#f0c4c7] bg-[#fff1f2] px-2 py-0.5 text-xs font-semibold text-[#86000B]">
              {i}
            </span>
          ))}
        </div>
      )}
      <ol className="mt-3 grid gap-3 border-l border-[#e4e3df] pl-3">
        {order.ack ? (
          <Step title={`Acknowledged by ${personName(order.ack.by) || "-"}`} at={order.ack.at}>
            {order.ack.template_version !== undefined && order.ack.template_version !== null && <div className="text-xs text-[#77787b]">Checklist v{order.ack.template_version}</div>}
            {order.ack.answers.map((a, i) => (
              <AnswerRow key={`${a.label}-${i}`} a={a} />
            ))}
            {order.ack.discrepancy_note && <div className="break-words text-sm font-semibold text-[#86000B]">Discrepancy: {order.ack.discrepancy_note}</div>}
          </Step>
        ) : (
          <li className="pl-5 text-sm text-[#77787b]">Not acknowledged yet</li>
        )}
        {stop?.checkin && (
          <Step title={`Arrived - ${personName(stop.checkin.by) || "-"}`} at={stop.checkin.at} tone={stop.checkin.far ? "bad" : "neutral"}>
            {stop.checkin.distance_m !== null && stop.checkin.distance_m !== undefined && (
              <div className={`text-sm ${stop.checkin.far ? "font-semibold text-[#86000B]" : "text-[#55565a]"}`}>
                {Math.round(stop.checkin.distance_m)} m from the address{stop.checkin.far ? " - far from the delivery address" : ""}
              </div>
            )}
            <div className="text-xs text-[#77787b]">{gpsText(stop.checkin.gps)}</div>
          </Step>
        )}
        {stop?.checkout && (
          <Step title={`Checked out - ${personName(stop.checkout.by) || "-"}`} at={stop.checkout.at} tone={stop.checkout.outcome && stop.checkout.outcome !== "Delivered" ? "bad" : "neutral"}>
            <div className="text-sm">
              Outcome: <span className="font-semibold">{stop.checkout.outcome ?? "-"}</span>
              {stop.checkout.reason && <span className="break-words text-[#55565a]"> - {stop.checkout.reason}</span>}
            </div>
            {stop.checkout.answers.map((a, i) => (
              <AnswerRow key={`${a.label}-${i}`} a={a} />
            ))}
            <div className="text-xs text-[#77787b]">{gpsText(stop.checkout.gps)}</div>
          </Step>
        )}
        {h && (
          <Step title="Invoice handover" at={h.checked_at}>
            <div className="text-sm">
              Crew: {h.handed_over ? "handed over" : "not handed over"}
              {h.crew_note && <span className="break-words text-[#55565a]"> - {h.crew_note}</span>}
            </div>
            <div className="text-sm">
              Officer: <span className="font-semibold">{h.officer_status ?? "pending"}</span>
              {h.officer_note && <span className="break-words text-[#55565a]"> - {h.officer_note}</span>}
              {personName(h.checked_by) && <span className="text-[#77787b]"> ({personName(h.checked_by)})</span>}
            </div>
          </Step>
        )}
      </ol>
    </article>
  );
}

function TimelineBody({ t }: { t: Timeline }) {
  const [showEvents, setShowEvents] = useState(false);
  const trip = t.trip;
  return (
    <div className="grid gap-3">
      <section className="border border-[#e4e3df] bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#77787b]">{t.batch.delivery_date ? formatLongDate(t.batch.delivery_date) : ""}</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-2xl font-bold">{t.batch.vehicle}</span>
          <ChipBadge chip={trip.chip} label={trip.chip_label} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-[#55565a]">
          <div>Started: {formatDateTimeShort(trip.started_at) || "-"}</div>
          <div>Ended: {formatDateTimeShort(trip.ended_at) || "-"}</div>
          <div>Duration: {formatDuration(trip.duration_minutes ?? null)}</div>
          {trip.handover_status && <div>Handover: {trip.handover_status.replaceAll("_", " ")}</div>}
          {trip.officer && <div>Officer: {trip.officer.name}</div>}
        </div>
        <CrewList crew={t.crew} />
      </section>
      {t.orders.length === 0 ? (
        <div className="border border-[#e4e3df] bg-white p-5 text-sm text-[#55565a]">No orders in this trip.</div>
      ) : (
        t.orders.map((o) => <OrderTimeline key={String(o.so_id)} order={o} />)
      )}
      {t.events.length > 0 && (
        <section>
          <button type="button" className={btnSecondary} onClick={() => setShowEvents((v) => !v)} aria-expanded={showEvents}>
            {showEvents ? "Hide" : "Show"} all events ({t.events.length})
          </button>
          {showEvents && (
            <ul className="mt-2 grid divide-y divide-[#efeeeb] border border-[#e4e3df] bg-white px-3 text-sm" data-testid="driver-events">
              {t.events.map((e, i) => (
                <li key={i} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="min-w-0 break-words font-semibold">
                      {eventLabel(e.type)}
                      {e.so_number ? ` - ${e.so_number}` : ""}
                    </span>
                    <span className="text-xs text-[#77787b]">{formatDateTimeShort(e.at)}</span>
                  </div>
                  <div className="text-xs text-[#55565a]">
                    {personName(e.by) || "-"}
                    {e.gps === null ? " - no GPS" : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default function DriverTrip() {
  const { batch_id: batchId } = useParams<{ batch_id: string }>();
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const timeline = useTimelineQuery(scope, batchId);
  const t = timeline.data?.data;
  return (
    <DriverLayout scope={scope} name={me.data?.name ?? null}>
      <Link href={assignmentPath(batchId, scope.adminDriverId)} data-testid="driver-sub-back" className="mb-3 inline-flex min-h-[48px] items-center gap-2 text-sm font-semibold">
        <ArrowLeft size={18} />
        Back to assignment
      </Link>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight">Trip timeline</h1>
        <button type="button" onClick={() => void timeline.refetch()} disabled={timeline.isFetching} aria-label="Refresh" className="inline-flex min-h-[48px] min-w-[44px] items-center justify-center border border-[#d8d7d2] bg-white disabled:opacity-40">
          <RefreshCw size={16} className={timeline.isFetching ? "animate-spin" : ""} />
        </button>
      </div>
      {scope.missingDriverId ? (
        <MissingDriverNotice />
      ) : t ? (
        <>
          <OfflineNote offline={Boolean(timeline.data?.offline)} savedAt={timeline.data?.saved_at} />
          <TimelineBody t={t} />
        </>
      ) : timeline.isError ? (
        <ErrorState message={errorText(timeline.error)} onRetry={() => void timeline.refetch()} />
      ) : (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
    </DriverLayout>
  );
}
