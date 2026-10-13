import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, MapPin } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { personName } from "@/lib/officer";
import { displayValue, formatDuration, isPhotoValue, stateLabel } from "@/lib/overview";
import { formatMeters, gpsReason, hasGps } from "@/lib/overviewView";
import { Chip, ErrorNote, Skeleton, fmtDateTime, fmtTime } from "./shared";

const OSM = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

function Gps({ gps }: { gps: (overviewApi.Gps & { lat?: number; lng?: number; accuracy_m?: number }) | null | undefined }) {
  if (hasGps(gps)) {
    return (
      <a href={OSM(gps.lat, gps.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
        <MapPin size={12} />
        {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
        {typeof gps.accuracy_m === "number" ? ` (±${Math.round(gps.accuracy_m)} m)` : ""}
      </a>
    );
  }
  const reason = gpsReason(gps as { reason?: unknown } | null);
  return <span className="text-[#8a5a00]">No GPS{reason ? `: ${reason}` : ""}</span>;
}

function Photo({ id }: { id: number | string }) {
  const [wanted, setWanted] = useState(false);
  const photo = useQuery({ queryKey: ["overview-photo", String(id)], queryFn: () => overviewApi.fetchMediaObjectUrl(id), enabled: wanted, staleTime: 8 * 60_000, retry: 1 });
  if (!wanted)
    return (
      <button type="button" onClick={() => setWanted(true)} className="inline-flex min-h-[32px] items-center gap-1 border border-[#d8d7d2] bg-white px-2 text-xs font-semibold">
        <Camera size={13} /> Show photo
      </button>
    );
  if (photo.isError) return <span className="text-xs text-[#86000B]">Photo could not be loaded.</span>;
  if (!photo.data) return <span className="text-xs text-[#77787b]">Loading photo...</span>;
  return <img src={photo.data} alt="Photo from the driver" className="max-h-48 border border-[#e4e3df] object-contain" />;
}

function Row({ time, title, children }: { time: string | null | undefined; title: string; children?: React.ReactNode }) {
  return (
    <li className="relative border-l-2 border-[#d8d7d2] pb-3 pl-4 last:pb-0">
      <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-black" aria-hidden="true" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-[#77787b]">{time ? fmtTime(time) : ""}</span>
      </div>
      {children && <div className="mt-0.5 grid gap-0.5 text-xs text-[#55565a]">{children}</div>}
    </li>
  );
}

function outcomeTone(outcome: string | null | undefined) {
  const o = (outcome ?? "").toLowerCase();
  return o.startsWith("delivered") ? "good" : o.startsWith("partial") ? "warn" : o.startsWith("failed") || o.startsWith("returned") ? "bad" : "neutral";
}

function OrderTimeline({ order }: { order: overviewApi.TimelineOrder }) {
  const { ack, stop, handover } = order;
  const out = stop?.checkout;
  const arrivedFar = stop?.checkin?.far;
  const addr = stop?.address_gps ?? null;
  return (
    <section className="border border-[#e4e3df] bg-white" data-testid={`timeline-so-${order.so_number}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[#efeeeb] px-3 py-2">
        <div className="min-w-0">
          <div className="font-mono text-xs text-[#77787b]">
            {stop?.sequence ? `Stop ${stop.sequence} · ` : ""}
            {order.so_number}
            {out?.invoice_no ? ` · Invoice/DR ${out.invoice_no}` : ""}
          </div>
          <div className="break-words text-sm font-bold">{order.customer_name ?? "-"}</div>
          {order.address_text && <div className="break-words text-xs text-[#55565a]">{order.address_text}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {out?.outcome && <Chip tone={outcomeTone(out.outcome)}>{out.outcome}</Chip>}
          {typeof stop?.minutes_at_stop === "number" && <Chip>At site {formatDuration(stop.minutes_at_stop)}</Chip>}
        </div>
      </header>
      <ul className="grid p-3">
        {ack ? (
          <Row time={ack.at} title="Acknowledged (checklist complete)">
            <span>
              By {personName(ack.by) || "crew"} &middot; checklist v{ack.template_version ?? "?"}
            </span>
            {ack.answers.map((a, i) => (
              <span key={i} className="break-words">
                {a.label}: <strong>{isPhotoValue(a.type, a.value) ? <Photo id={a.value as number | string} /> : displayValue(a.value)}</strong>
                {a.note ? ` (${a.note})` : ""}
              </span>
            ))}
            {ack.discrepancy_note && <span className="text-[#8a5a00]">Discrepancy: {ack.discrepancy_note}</span>}
          </Row>
        ) : (
          <Row time={null} title="Not acknowledged yet" />
        )}
        {stop?.checkin && (
          <Row time={stop.checkin.at} title="Arrived at site">
            <span>By {personName(stop.checkin.by) || "crew"}</span>
            <span>
              GPS: <Gps gps={stop.checkin.gps} />
            </span>
            <span className={arrivedFar ? "font-semibold text-[#8a5a00]" : ""}>
              Distance from the address: {formatMeters(stop.checkin.distance_m)}
              {arrivedFar ? " (far from the address)" : ""}
              {!addr && stop.checkin.distance_m === null ? " (the address has no coordinates)" : ""}
            </span>
          </Row>
        )}
        {out && (
          <Row time={out.at} title="Departed from site">
            <span>By {personName(out.by) || "crew"}</span>
            <span>
              GPS: <Gps gps={out.gps} />
            </span>
            <span>
              Invoice/DR no.: <strong>{out.invoice_no ?? "—"}</strong> &middot; Outcome: <strong>{out.outcome ?? "—"}</strong>
              {out.reason ? ` · Reason: ${out.reason}` : ""}
            </span>
            {out.answers
              .filter((a) => !["invoice_dr_number", "outcome", "reason"].includes(String((a as { key?: string }).key ?? "")))
              .map((a, i) => (
                <span key={i} className="break-words">
                  {a.label}: <strong>{a.photo_url || isPhotoValue(a.type, a.value) ? <Photo id={a.value as number | string} /> : displayValue(a.value)}</strong>
                </span>
              ))}
            <span>Time at site: {formatDuration(stop?.minutes_at_stop ?? null)}</span>
          </Row>
        )}
        {handover && (
          <Row time={handover.checked_at} title={handover.officer_status && handover.officer_status !== "pending" ? `Officer: ${handover.officer_status}` : "Handover to the officer"}>
            <span>
              Carbon copy {handover.invoice_no ? `(Invoice/DR ${handover.invoice_no}) ` : ""}
              {handover.handed_over ? "handed over" : "NOT handed over"}
              {handover.crew_note ? `: ${handover.crew_note}` : ""}
            </span>
            {handover.officer_status && handover.officer_status !== "pending" && (
              <span>
                Validated by {personName(handover.checked_by) || "officer"}
                {handover.officer_note ? `: ${handover.officer_note}` : ""}
              </span>
            )}
          </Row>
        )}
      </ul>
    </section>
  );
}

export default function TripTimeline({ batchId }: { batchId: string }) {
  const [showEvents, setShowEvents] = useState(false);
  const query = useQuery({ queryKey: ["overview-trip", batchId], queryFn: () => overviewApi.getTrip(batchId), refetchInterval: 15_000, refetchIntervalInBackground: false });
  if (query.isLoading) return <Skeleton className="h-24" />;
  if (query.isError || !query.data) return <ErrorNote error={query.error} onRetry={() => void query.refetch()} />;
  const t = query.data;
  const trip = t.trip;
  const assigned = (t.batch as { assigned_at?: string | null }).assigned_at;
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
          <div>Trip length: {formatDuration(trip.duration_minutes ?? null)}</div>
          <div>Assigned: {fmtDateTime(assigned)}</div>
          <div>Trip started: {fmtDateTime(trip.started_at)}</div>
          <div>Trip ended: {fmtDateTime(trip.ended_at)}</div>
          <div>Back at warehouse: {typeof trip.end_distance_m === "number" ? `${formatMeters(trip.end_distance_m as number)} from the warehouse` : "-"}</div>
        </div>
      </div>
      {t.orders.map((o) => (
        <OrderTimeline key={o.so_id} order={o} />
      ))}
      {t.events.length > 0 && (
        <div>
          <button type="button" className="min-h-[36px] text-xs font-semibold underline" onClick={() => setShowEvents((v) => !v)}>
            {showEvents ? "Hide" : "Show"} audit log ({t.events.length})
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
