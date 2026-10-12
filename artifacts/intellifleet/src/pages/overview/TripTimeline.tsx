import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as overviewApi from "@/services/api/overview";
import { displayValue, formatDuration, isPhotoValue, orderIssues, stateLabel } from "@/lib/overview";
import { personName } from "@/lib/officer";
import { Chip, Empty, ErrorNote, fmtDateTime, fmtTime } from "./shared";

// Photos sit behind /api/media/{id} (bearer token + 302 to a presigned URL), so they are fetched
// through the authenticated client and shown from an object URL.
function Photo({ photoId, src }: { photoId?: number | string; src?: string }) {
  const [url, setUrl] = useState<string | null>(src && /^https?:/.test(src) ? src : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url || photoId === undefined) return;
    let objectUrl: string | null = null;
    let active = true;
    overviewApi
      .fetchMediaObjectUrl(photoId)
      .then((u) => {
        objectUrl = u;
        if (active) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId, url]);
  if (failed || (!url && photoId === undefined)) return <span className="text-xs text-[#86000B]">Photo unavailable</span>;
  if (!url) return <span className="text-xs text-[#77787b]">Loading photo...</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Delivery evidence" className="h-24 w-24 border border-[#e4e3df] object-cover" />
    </a>
  );
}

function mediaIdFromUrl(url: string | null | undefined): string | undefined {
  const m = url ? /\/api\/media\/(\d+)/.exec(url) : null;
  return m ? m[1] : undefined;
}

function AnswerRow({ a }: { a: overviewApi.TimelineAnswer }) {
  const urlId = mediaIdFromUrl(a.photo_url);
  const photoId = urlId ?? (isPhotoValue(a.type, a.value) ? a.value : undefined);
  const hasPhoto = photoId !== undefined || (typeof a.photo_url === "string" && a.photo_url.length > 0);
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
      <span className="text-[#77787b]">{a.label}:</span>
      {hasPhoto ? (
        <Photo photoId={photoId} src={a.photo_url ?? undefined} />
      ) : (
        <span className="break-words font-medium">{displayValue(a.value)}</span>
      )}
      {a.note && <span className="break-words text-[#55565a]">({a.note})</span>}
    </div>
  );
}

function Step({ title, at, children, tone = "neutral" }: { title: string; at?: string | null; children?: React.ReactNode; tone?: "neutral" | "bad" }) {
  return (
    <li className="relative pl-5">
      <span className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${tone === "bad" ? "bg-[#c4291f]" : "bg-black"}`} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {at && <span className="text-xs text-[#77787b]">{fmtTime(at)}</span>}
      </div>
      {children && <div className="mt-1 grid gap-1">{children}</div>}
    </li>
  );
}

function OrderTimeline({ order }: { order: overviewApi.TimelineOrder }) {
  const issues = orderIssues(order);
  const stop = order.stop;
  return (
    <article className={`border bg-white p-3 ${issues.length ? "border-[#e6b4b7]" : "border-[#e4e3df]"}`} data-testid={`timeline-${order.so_number}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-bold">{order.so_number}</div>
          <div className="break-words text-sm text-[#55565a]">{order.customer_name ?? "-"}</div>
          {order.address_text && <div className="break-words text-xs text-[#77787b]">{order.address_text}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stop && <Chip tone={stop.status === "checked_out" ? "good" : "neutral"}>{stop.status.replaceAll("_", " ")}</Chip>}
          {stop?.minutes_at_stop !== null && stop?.minutes_at_stop !== undefined && <Chip>{formatDuration(stop.minutes_at_stop)} at stop</Chip>}
        </div>
      </div>
      {issues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="timeline-issues">
          {issues.map((i) => (
            <Chip key={i} tone="bad">
              {i}
            </Chip>
          ))}
        </div>
      )}
      <ol className="mt-3 grid gap-3 border-l border-[#e4e3df] pl-3">
        <Step title="Assigned" />
        {order.ack ? (
          <Step title={`Acknowledged by ${personName(order.ack.by) || "-"}`} at={order.ack.at}>
            {order.ack.template_version !== null && <div className="text-xs text-[#77787b]">Checklist v{order.ack.template_version}</div>}
            {order.ack.answers.map((a, i) => (
              <AnswerRow key={`${a.label}-${i}`} a={a} />
            ))}
            {order.ack.discrepancy_note && <div className="break-words text-sm text-[#86000B]">Discrepancy: {order.ack.discrepancy_note}</div>}
          </Step>
        ) : (
          <li className="pl-5 text-sm text-[#77787b]">Not acknowledged yet</li>
        )}
        {stop?.checkin && (
          <Step title={`Checked in by ${personName(stop.checkin.by) || "-"}`} at={stop.checkin.at} tone={stop.checkin.far ? "bad" : "neutral"}>
            {stop.checkin.distance_m !== null && stop.checkin.distance_m !== undefined && (
              <div className={`text-sm ${stop.checkin.far ? "font-semibold text-[#86000B]" : "text-[#55565a]"}`}>
                {Math.round(stop.checkin.distance_m)} m from the address{stop.checkin.far ? " - far from the delivery address" : ""}
              </div>
            )}
          </Step>
        )}
        {stop?.checkout && (
          <Step title={`Checked out by ${personName(stop.checkout.by) || "-"}`} at={stop.checkout.at} tone={stop.checkout.outcome && stop.checkout.outcome !== "Delivered" ? "bad" : "neutral"}>
            <div className="text-sm">
              Outcome: <span className="font-semibold">{stop.checkout.outcome ?? "-"}</span>
              {stop.checkout.reason && <span className="break-words text-[#55565a]"> - {stop.checkout.reason}</span>}
            </div>
            {stop.checkout.answers.map((a, i) => (
              <AnswerRow key={`${a.label}-${i}`} a={a} />
            ))}
          </Step>
        )}
        {order.handover && (
          <Step title="Invoice handover" at={order.handover.checked_at}>
            <div className="text-sm">
              Crew: {order.handover.handed_over === null ? "no answer" : order.handover.handed_over ? "handed over" : "not handed over"}
              {order.handover.crew_note && <span className="break-words text-[#55565a]"> - {order.handover.crew_note}</span>}
            </div>
            <div className="text-sm">
              Officer: <span className="font-semibold">{order.handover.officer_status ?? "pending"}</span>
              {order.handover.officer_note && <span className="break-words text-[#55565a]"> - {order.handover.officer_note}</span>}
              {personName(order.handover.checked_by) && <span className="text-[#77787b]"> ({personName(order.handover.checked_by)})</span>}
            </div>
          </Step>
        )}
      </ol>
    </article>
  );
}

export default function TripTimeline({ batchId }: { batchId: string }) {
  const query = useQuery({ queryKey: ["driver-overview", "trip", batchId], queryFn: () => overviewApi.getTrip(batchId), retry: 1 });
  const [showEvents, setShowEvents] = useState(false);
  if (query.isLoading) return <Empty>Loading trip...</Empty>;
  if (query.isError) return <ErrorNote error={query.error} onRetry={() => void query.refetch()} />;
  const t = query.data;
  if (!t) return <Empty>No data for this trip.</Empty>;
  const trip = t.trip;
  return (
    <div className="grid gap-3" data-testid={`trip-${batchId}`}>
      <div className="border border-[#e4e3df] bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold">{String(t.batch.vehicle ?? "-")}</span>
          <Chip tone="info">{trip.chip_label ?? stateLabel(String(trip.status ?? ""))}</Chip>
          {trip.handover_status && <Chip>Handover: {trip.handover_status}</Chip>}
        </div>
        <div className="mt-2 grid gap-1 text-xs text-[#55565a] sm:grid-cols-2">
          <div>Crew: {t.crew.map((c) => `${c.name} (${c.role})`).join(", ") || "-"}</div>
          <div>Trip duration: {formatDuration(trip.duration_minutes ?? null)}</div>
          <div>Started: {fmtDateTime(trip.started_at)}</div>
          <div>Ended: {fmtDateTime(trip.ended_at)}</div>
        </div>
      </div>
      {t.orders.map((o) => (
        <OrderTimeline key={o.so_id} order={o} />
      ))}
      {t.events.length > 0 && (
        <div>
          <button type="button" className="text-xs font-semibold underline" onClick={() => setShowEvents((v) => !v)}>
            {showEvents ? "Hide" : "Show"} all events ({t.events.length})
          </button>
          {showEvents && (
            <ul className="mt-2 grid gap-1 border border-[#e4e3df] bg-white p-3 text-xs">
              {t.events.map((e, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {e.type.replaceAll("_", " ")}
                    {e.so_number ? ` - ${e.so_number}` : ""}
                    {personName(e.by) ? ` - ${personName(e.by)}` : ""}
                  </span>
                  <span className="text-[#77787b]">{fmtDateTime(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
