import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type {
  TimelineOrder,
  TimelineAnswer,
  Gps as GpsType,
  TripRow,
} from "@/services/api/overview";
import {
  crewOf,
  durationText,
  formatKg,
  INVOICE_TONE,
  invoiceWord,
  manilaDateTime,
  manilaTime,
  outcomesOf,
  personName,
  sentence,
  stopPhotos,
  type UrlState,
} from "@/lib/overviewModel";
import { activityParts, activityText, displayValue, eventLabel } from "@/lib/overview";
import { actorLine, personWithRole } from "@/lib/overviewCrew";
import { useTripDetail } from "./queries";
import {
  AttentionChip,
  buttonClass,
  CallLink,
  Chip,
  ErrorLine,
  iconButtonClass,
  OutcomeChip,
  Skeleton,
  Thumb,
  useFocusTrap,
  usePhotoViewer,
} from "./shared";
import { Rail } from "./TripsTab";
import { IssueCard } from "./IssuesTab";
function Gps({ value }: { value: GpsType | null | undefined }) {
  if (typeof value?.lat === "number" && typeof value.lng === "number")
    return (
      <a
        href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=18/${value.lat}/${value.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        {typeof value.accuracy_m === "number"
          ? ` (±${Math.round(value.accuracy_m)} m)`
          : ""}
      </a>
    );
  return (
    <span className="text-[hsl(var(--status-warning))]">
      No GPS{value?.reason ? `: ${String(value.reason)}` : ""}
    </span>
  );
}
function Time({
  at,
  received,
}: {
  at: string | null | undefined;
  received?: string | null;
}) {
  return (
    <span>
      {manilaDateTime(at)}
      {received && received !== at
        ? ` · Received ${manilaDateTime(received)}`
        : ""}
    </span>
  );
}
function Answers({ answers }: { answers: TimelineAnswer[] }) {
  return (
    <dl className="grid gap-1">
      {answers
        .filter(
          (a) => a.type !== "photo" && a.type !== "signature" && !a.photo_url,
        )
        .map((a, i) => (
          <div key={i}>
            <dt className="inline font-medium">{a.label}: </dt>
            <dd className="inline break-words">
              {displayValue(a.value)}
              {a.note ? ` (${a.note})` : ""}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export default function TripDrawer({
  state,
  set,
  rows,
}: {
  state: UrlState;
  set: (p: Partial<UrlState>) => void;
  rows: TripRow[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const viewer = usePhotoViewer();
  useFocusTrap(ref, !viewer.isOpen);
  const query = useTripDetail(state.trip);
  const t = query.data;
  const row = rows.find((r) => r.batch_id === state.trip);
  const index = rows.findIndex((r) => r.batch_id === state.trip);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !viewer.isOpen) set({ trip: "" });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [set, viewer.isOpen]);
  useEffect(() => {
    if (!state.stop || !t) return;
    const node = document.getElementById(
      `stop-${t.orders.find((o) => o.so_id === state.stop || o.so_number === state.stop)?.so_id ?? state.stop}`,
    ) as HTMLDetailsElement | null;
    if (node) {
      node.open = true;
      node.scrollIntoView({ block: "start" });
    }
  }, [state.stop, t]);
  const openStop = (so: string) => {
    const node = document.getElementById(
      `stop-${t?.orders.find((o) => o.so_id === so || o.so_number === so)?.so_id ?? so}`,
    ) as HTMLDetailsElement | null;
    if (node) {
      node.open = true;
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const openEvent = (id?: string | number | null) => {
    const log = document.getElementById(
      "trip-activity",
    ) as HTMLDetailsElement | null;
    if (log) log.open = true;
    (id ? document.getElementById(`event-${id}`) : log)?.scrollIntoView({
      block: "center",
    });
  };
  const allPhotos = t?.orders.flatMap(stopPhotos) ?? [];
  const stop = (o: TimelineOrder, i: number) => {
    const ack = o.ack;
    const checkin = o.stop?.checkin;
    const out = o.stop?.checkout;
    const hand = o.handover;
    const photos = stopPhotos(o);
    return (
      <section
        key={o.so_id}
        className="rounded-lg border border-border bg-card"
      >
        <details
          id={`stop-${o.so_id}`}
          open={state.stop === o.so_id || state.stop === o.so_number}
          className="scroll-mt-4"
          data-testid={`stop-${o.so_number}`}
        >
          <summary className="cursor-pointer list-none p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <strong>{o.stop?.sequence ?? i + 1}.</strong>
              <Chip>{o.order_type ?? "SO"}</Chip>
              <strong className="font-mono text-xs">{o.so_number}</strong>
              <OutcomeChip outcome={out?.outcome} />
              {o.removed && <Chip tone="warn">Removed by dispatch</Chip>}
            </div>
            <p className="mt-1 text-sm font-semibold">
              {o.customer_name ?? "Unknown customer"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {manilaTime(checkin?.at)} → {manilaTime(out?.at)} · Invoice/DR{" "}
              {out?.invoice_no ?? hand?.invoice_no ?? o.order_reference ?? "—"}{" "}
              · {invoiceWord(hand?.officer_status)}
            </p>
            <p className="mt-1 text-xs underline">
              Show stop details
              {photos.length ? ` · ${photos.length} proof photo(s)` : ""}
            </p>
          </summary>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border p-3">
              {photos.map((p) => (
                <Thumb
                  key={p.photo_id}
                  photo={p}
                  onOpen={() =>
                    viewer.open(
                      allPhotos,
                      allPhotos.findIndex((a) => a.photo_id === p.photo_id),
                    )
                  }
                />
              ))}
            </div>
          )}
          <div className="grid gap-4 border-t border-border p-3 text-xs">
            <p className="break-words">
              {o.address_text ?? "Address not available"}
              {o.destination_warehouse
                ? ` · Destination ${o.destination_warehouse}`
                : ""}
            </p>
            <section>
              <h4 className="font-bold">Loaded (acknowledged)</h4>
              {ack ? (
                <>
                  <p>
                    <Time at={ack.at} received={ack.received_at} /> · By{" "}
                    {personWithRole(ack.by) || "crew"}
                  </p>
                  <p>
                    GPS: <Gps value={ack.gps} />
                  </p>
                  <p>Checklist version {ack.template_version ?? "—"}</p>
                  <Answers answers={ack.answers} />
                  {ack.discrepancy_note && (
                    <p>Loading note: {ack.discrepancy_note}</p>
                  )}
                </>
              ) : (
                <p>Not loaded yet</p>
              )}
            </section>
            {checkin && (
              <section>
                <h4 className="font-bold">Arrived</h4>
                <p>
                  <Time at={checkin.at} received={checkin.received_at} /> · By{" "}
                  {personWithRole(checkin.by) || "crew"}
                </p>
                <p>
                  GPS: <Gps value={checkin.gps} />
                </p>
                <p>
                  Distance from customer:{" "}
                  {checkin.distance_m === null
                    ? "Unknown"
                    : `${Math.round(checkin.distance_m)} m`}
                  {checkin.far ? " · Far from customer" : ""}
                  {!o.stop?.address_gps && checkin.distance_m === null
                    ? " · Address has no coordinates"
                    : ""}
                </p>
              </section>
            )}
            {out && (
              <section>
                <h4 className="font-bold">Left</h4>
                <p>
                  <Time at={out.at} received={out.received_at} /> · By{" "}
                  {personWithRole(out.by) || "crew"}
                </p>
                <p>
                  GPS: <Gps value={out.gps} />
                </p>
                <p>
                  Outcome: {out.outcome} · Reason: {out.reason ?? "—"}
                </p>
                <p>
                  Form: {out.template_name ?? "Delivery form"} · version{" "}
                  {out.template_version ?? "—"}
                </p>
                <Answers answers={out.answers} />
                <p>Time at site: {durationText(o.stop?.minutes_at_stop)}</p>
              </section>
            )}
            {hand && (
              <section>
                <h4 className="font-bold">
                  Invoice/DR {hand.invoice_no ?? out?.invoice_no ?? "—"}
                </h4>
                <p>
                  {hand.handed_over ? "Handed to officer" : "Not handed over"} ·{" "}
                  {invoiceWord(hand.officer_status)}
                </p>
                <p>Crew note: {hand.crew_note ?? "—"}</p>
                <p>
                  Checked by {personName(hand.checked_by) || "—"} ·{" "}
                  {manilaDateTime(hand.checked_at)}
                </p>
                <p>Officer note: {hand.officer_note ?? "—"}</p>
                {hand.resolved_at && (
                  <p>Resolved {manilaDateTime(hand.resolved_at)}</p>
                )}
              </section>
            )}
            {t?.issues
              ?.filter(
                (issue) =>
                  issue.so_id === o.so_id || issue.so_number === o.so_number,
              )
              .map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onTrip={(trip, so) => set({ trip, stop: so ?? "" })}
                />
              ))}
          </div>
        </details>
        {photos[0] && (
          <div className="border-t border-border p-3">
            <Thumb
              photo={photos[0]}
              small
              onOpen={() =>
                viewer.open(
                  allPhotos,
                  allPhotos.findIndex((p) => p.photo_id === photos[0].photo_id),
                )
              }
            />
          </div>
        )}
      </section>
    );
  };
  return (
    <>
      <div
        className="fixed inset-0 z-[999] bg-foreground/30"
        onClick={() => set({ trip: "" })}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Trip details"
        className="fixed inset-y-0 right-0 z-[1000] flex w-full flex-col bg-background text-foreground shadow-xl sm:max-w-[560px]"
        data-testid="trip-drawer"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
          <h2 className="font-bold">Trip details</h2>
          <div className="flex gap-1">
            <button
              className={iconButtonClass}
              aria-label="Previous trip"
              disabled={index <= 0}
              onClick={() => set({ trip: rows[index - 1].batch_id, stop: "" })}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className={iconButtonClass}
              aria-label="Next trip"
              disabled={index < 0 || index >= rows.length - 1}
              onClick={() => set({ trip: rows[index + 1].batch_id, stop: "" })}
            >
              <ChevronRight size={16} />
            </button>
            <button
              className={iconButtonClass}
              data-autofocus
              aria-label="Close trip"
              onClick={() => set({ trip: "" })}
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {query.isLoading ? (
            <Skeleton className="h-48" />
          ) : query.isError ? (
            <ErrorLine
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : (
            t && (
              <div className="grid gap-5">
                <section className="grid gap-3">
                  <h3 className="text-xl font-bold">
                    {String(t.batch.vehicle ?? row?.vehicle ?? "No vehicle")} ·
                    Trip {row?.trip_number ?? String(t.batch.trip_number ?? 1)}
                    {row && row.trips_on_date > 1
                      ? ` of ${row.trips_on_date}`
                      : ""}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {String(t.batch.delivery_date ?? row?.date ?? "—")} ·{" "}
                    {String(t.batch.warehouse ?? row?.warehouse ?? "—")}
                  </p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {crewOf({ batch_id: state.trip, crew: t.crew }).map(
                      (c, i) => (
                        <CallLink
                          key={i}
                          name={c.name}
                          role={c.role}
                          phone={c.phone}
                        />
                      ),
                    )}
                  </div>
                  <Rail
                    row={
                      row ?? {
                        batch_id: state.trip,
                        state: t.trip.status,
                        step: t.step,
                        so_count: t.orders.length,
                        stops_done: t.trip.stops_done,
                        acknowledged: t.trip.acknowledged,
                      }
                    }
                  />
                  <div className="flex flex-wrap gap-1">
                    {t.attention?.map((flag, i) => (
                      <AttentionChip
                        key={i}
                        flag={flag}
                        onClick={() =>
                          flag.stop_so_id
                            ? openStop(flag.stop_so_id)
                            : openEvent(flag.event_id)
                        }
                      />
                    ))}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Assigned</dt>
                      <dd>{manilaDateTime(t.batch.assigned_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Trip length</dt>
                      <dd>{durationText(t.trip.duration_minutes)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Started</dt>
                      <dd>
                        {manilaDateTime(t.trip.started_at)} ·{" "}
                        {personWithRole(t.trip.started_by)}
                      </dd>
                      <dd>
                        GPS: <Gps value={t.trip.started_gps} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Ended</dt>
                      <dd>
                        {manilaDateTime(t.trip.ended_at)} ·{" "}
                        {personWithRole(t.trip.ended_by)}
                      </dd>
                      <dd>
                        GPS: <Gps value={t.trip.ended_gps} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Weight / packs</dt>
                      <dd>
                        {row
                          ? formatKg([row])?.text
                          : String(t.batch.kg ?? "—")}{" "}
                        · {row?.packs ?? String(t.batch.packs ?? "—")} packs
                      </dd>
                      {row && formatKg([row])?.note && (
                        <dd>{formatKg([row])?.note}</dd>
                      )}
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Back at warehouse
                      </dt>
                      <dd>
                        {typeof t.trip.end_distance_m === "number"
                          ? `${Math.round(t.trip.end_distance_m)} m from warehouse`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Stops done</dt>
                      <dd>
                        {t.trip.stops_done ?? row?.stops_done ?? 0}/
                        {t.orders.filter((o) => !o.removed).length} ·{" "}
                        {Math.round(
                          ((t.trip.stops_done ?? row?.stops_done ?? 0) /
                            Math.max(
                              1,
                              t.orders.filter((o) => !o.removed).length,
                            )) *
                            100,
                        )}
                        %
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Closed</dt>
                      <dd>{manilaDateTime(t.trip.closed_at)}</dd>
                    </div>
                  </dl>
                  {row && (
                    <p className="text-xs">
                      {Object.entries(outcomesOf(row))
                        .map(
                          ([k, v]) =>
                            `${v} ${k === "failed" ? "not delivered" : k}`,
                        )
                        .join(" · ")}
                    </p>
                  )}
                  {t.handover && (
                    <p className="text-xs">
                      Invoice handover:{" "}
                      {sentence(
                        t.handover.status ??
                          t.trip.handover_status ??
                          "pending",
                      )}{" "}
                      · Submitted {manilaDateTime(t.handover.submitted_at)} by{" "}
                      {personWithRole(t.handover.submitted_by)} · Officer{" "}
                      {personName(t.handover.officer)} · Acknowledged{" "}
                      {manilaDateTime(t.handover.officer_acknowledged_at)} ·{" "}
                      {t.handover.note}
                    </p>
                  )}
                </section>
                <section className="grid gap-2">
                  <h3 className="font-bold">Stops ({t.orders.length})</h3>
                  {[...t.orders]
                    .sort(
                      (a, b) =>
                        (a.stop?.sequence ?? 99999) -
                        (b.stop?.sequence ?? 99999),
                    )
                    .map(stop)}
                </section>
                <section className="grid gap-2">
                  <h3 className="font-bold">Invoices for this trip</h3>
                  {(
                    t.invoices ??
                    t.orders.map((o) => ({
                      so_id: o.so_id,
                      so_number: o.so_number,
                      invoice_no:
                        o.handover?.invoice_no ??
                        o.stop?.checkout?.invoice_no ??
                        null,
                      status:
                        o.handover?.officer_status ??
                        (o.handover?.handed_over
                          ? "with_officer"
                          : "with_driver"),
                    }))
                  ).map((inv) => (
                    <button
                      key={inv.so_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-left text-xs"
                      onClick={() => openStop(inv.so_id)}
                    >
                      <span>
                        {inv.so_number} · {inv.invoice_no ?? "—"}
                      </span>
                      <Chip tone={INVOICE_TONE[inv.status] ?? "neutral"}>
                        {invoiceWord(inv.status)}
                      </Chip>
                    </button>
                  ))}
                </section>
                <section className="grid gap-2">
                  <h3 className="font-bold">Issues on this trip</h3>
                  {t.issues?.length ? (
                    t.issues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onTrip={(trip, so) => set({ trip, stop: so ?? "" })}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No issues reported.
                    </p>
                  )}
                </section>
                <details
                  id="trip-activity"
                  className="rounded-lg border border-border p-3"
                >
                  <summary className="cursor-pointer font-semibold">
                    Activity log ({t.events.length})
                  </summary>
                  <ul className="mt-3 grid gap-3 text-xs">
                    {t.events.map((e, i) => (
                      <li
                        key={e.id ?? i}
                        id={`event-${e.id ?? i}`}
                        data-testid={
                          e.type === "order_unassigned"
                            ? "activity-unassigned"
                            : undefined
                        }
                      >
                        <strong>
                          {e.type === "order_unassigned"
                            ? activityText(
                                activityParts(e, personName(e.by)),
                                " · ",
                              )
                            : (actorLine(eventLabel(e.type), e, manilaTime(e.at)) ??
                              sentence(e.type))}
                        </strong>
                        <p>
                          {e.so_number} · {manilaDateTime(e.at)} ·{" "}
                          {personWithRole(e.actor_name, e.actor_role) ||
                            personWithRole(e.by)}
                        </p>
                        {e.received_at && (
                          <p>Received {manilaDateTime(e.received_at)}</p>
                        )}
                        {e.gps && (
                          <p>
                            GPS: <Gps value={e.gps} />
                          </p>
                        )}
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">
                            Full event details
                          </summary>
                          <pre className="whitespace-pre-wrap break-all">
                            {JSON.stringify(e, null, 2)}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ul>
                </details>
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer font-semibold">
                    Other days for this crew (last 7 days)
                  </summary>
                  <div className="mt-3 grid gap-2">
                    {t.other_days?.length ? (
                      t.other_days.map((day) => (
                        <button
                          className={`${buttonClass} h-auto justify-start py-2`}
                          key={day.batch_id}
                          onClick={() => set({ trip: day.batch_id, stop: "" })}
                        >
                          {day.date} · {day.vehicle} · Trip{" "}
                          {day.trip_number ?? 1}
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No other trips in the last 7 days.
                      </p>
                    )}
                  </div>
                </details>
              </div>
            )
          )}
        </div>
      </div>
      {viewer.node}
    </>
  );
}
