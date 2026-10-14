import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as driverApi from "@/services/api/driver";
import { firstName, formatQty, telHref, withDriverParams } from "@/lib/driver";
import { tripPath } from "@/lib/tripNav";
import type { AlertItem, Batch, CrewMember, DriverMe } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { dayLabel, useLang, useT } from "./i18n";
import type { Dict } from "./i18n";
import { useAlertsQuery, useTemplatesQuery, useToday } from "./queries";
import { ErrorState, MissingDriverNotice, OfflineNote, errorText, useDriverMe, useDriverScope } from "./shared";
import type { DriverScope } from "./shared";
import { ConfirmSheet, DispatchBanners, checklistOf, chipOfTrip, useTripActions } from "./tripFlow";
import { Avatar, Banner, C, Chip, RoundButton, Skeleton } from "./ui";

const FINISHED = new Set(["returned", "handover_submitted", "closed"]);

export function isFinished(batch: Pick<Batch, "trip">): boolean {
  return Boolean(batch.trip && FINISHED.has(batch.trip.status));
}

// The other crew member(s) of a trip, from the point of view of the signed-in person (driver sees helpers, helper sees driver).
export function partnersOf(batch: Pick<Batch, "crew" | "helpers">, me: Pick<DriverMe, "driver_id" | "staff_id" | "role"> | null | undefined): CrewMember[] {
  const crew: CrewMember[] = batch.crew && batch.crew.length > 0 ? batch.crew : (batch.helpers ?? []).map((h) => ({ id: h.id, name: h.name, role: "helper", phone: h.phone }));
  const myIds = new Set([me?.driver_id, me?.staff_id].filter((x) => x !== undefined && x !== null).map(String));
  const others = crew.filter((p) => !myIds.has(String(p.id)));
  return others.length > 0 ? others : crew.filter((p) => p.role !== (me?.role ?? "driver"));
}

export function PersonRow({ person, t }: { person: CrewMember; t: Dict }) {
  const tel = telHref(person.phone);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 14, background: C.soft }}>
      <div style={{ fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ color: C.sub }}>{person.role === "driver" ? t.driver : t.helper}</span> <b>{person.name}</b>
      </div>
      {tel && <RoundButton icon="phone" label={t.callPerson(person.name)} href={tel} testId="driver-call-crew" />}
    </div>
  );
}

function Stats({ batch, t, route }: { batch: Batch; t: Dict; route: string | null }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: 18, rowGap: 4, marginTop: 10, fontSize: 15 }}>
      <span>
        <b>{batch.so_count}</b> {t.orders(batch.so_count)}
      </span>
      {Number.isFinite(batch.total_kg) && batch.total_kg > 0 && (
        <span data-testid="driver-kg">
          <b>{formatQty(Math.round(batch.total_kg * 10) / 10)}</b> kg
        </span>
      )}
      {batch.total_packs !== null && batch.total_packs !== undefined && (
        <span data-testid="driver-packs">
          <b>{formatQty(batch.total_packs)}</b> {t.packs(batch.total_packs)}
        </span>
      )}
      {route && <span style={{ color: C.sub }}>{route}</span>}
    </div>
  );
}

function routeLine(batch: Batch, warehouse: string | null | undefined): string | null {
  const areas = [batch.first_area, batch.last_area].filter((a): a is string => Boolean(a));
  const uniq = [...new Set(areas)];
  if (uniq.length === 0) return warehouse ?? null;
  return warehouse ? `${warehouse} → ${uniq.join(", ")}` : uniq.join(" → ");
}

function TripCard({ batch, scope, me, index, total, active, waitFor, checklistOn }: { batch: Batch; scope: DriverScope; me: DriverMe | undefined; index: number; total: number; active: boolean; waitFor: number | null; checklistOn: boolean }) {
  const t = useT();
  const [, setLocation] = useLocation();
  const actions = useTripActions(scope, batch.batch_id);
  const [startOpen, setStartOpen] = useState(false);
  const href = tripPath(batch.batch_id, scope.adminDriverId);
  const chip = waitFor !== null ? { tone: "grey" as const, label: t.afterTrip(waitFor) } : chipOfTrip(t, batch.trip);
  const status = batch.trip?.status ?? "pending";
  const acked = batch.trip ? batch.trip.acknowledged >= batch.trip.total && batch.trip.total > 0 : false;
  const crew = !scope.isAdmin && Boolean(batch.trip);
  const partners = partnersOf(batch, me);
  const tripNo = batch.trip_number ?? index + 1;

  let button: { label: string; testId: string; run: () => void } | null = null;
  if (active && crew) {
    if (status === "pending" && !acked)
      button = {
        label: t.haveOrders,
        testId: "driver-card-action-acknowledge",
        run: () => {
          if (checklistOn) setLocation(withDriverParams(href, { do: "ack" }));
          else void actions.acknowledgeAll(batch.so_count);
        },
      };
    else if (status === "pending") button = { label: t.startTrip, testId: "driver-card-action-start", run: () => setStartOpen(true) };
    else if (status === "on_trip") button = { label: t.continueTrip, testId: "driver-card-action-continue", run: () => setLocation(href) };
  }

  return (
    <article
      data-testid={`driver-batch-${batch.batch_id}`}
      role="link"
      tabIndex={0}
      aria-label={`${batch.vehicle}, ${t.tripNofM(tripNo, total)}`}
      onClick={() => setLocation(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setLocation(href);
      }}
      style={{ display: "block", background: C.card, borderRadius: 20, padding: 18, color: C.ink, cursor: "pointer" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>{t.tripNofM(tripNo, total)}</div>
        {chip && (
          <Chip tone={chip.tone} testId="driver-trip-chip">
            {chip.label}
          </Chip>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 6, overflowWrap: "anywhere" }}>{batch.vehicle}</div>
      <Stats batch={batch} t={t} route={routeLine(batch, me?.warehouse)} />
      {partners.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
          {partners.map((p) => (
            <PersonRow key={String(p.id)} person={p} t={t} />
          ))}
        </div>
      )}
      {button && (
        <button
          type="button"
          data-testid={button.testId}
          disabled={actions.busy || !actions.ready}
          onClick={(e) => {
            e.stopPropagation();
            button?.run();
          }}
          style={{ width: "100%", height: 56, marginTop: 16, borderRadius: 14, border: 0, background: C.ink, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, fontFamily: "inherit", opacity: actions.busy ? 0.6 : 1, cursor: "pointer" }}
        >
          {actions.busy ? t.gettingLocation : button.label}
        </button>
      )}
      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmSheet
          open={startOpen}
          testId="driver-start-sheet"
          title={t.startTripNow}
          sub={t.startHint(batch.so_count)}
          confirmLabel={t.start}
          icon="play"
          busy={actions.busy}
          onClose={() => setStartOpen(false)}
          onConfirm={async () => {
            const out = await actions.start();
            setStartOpen(false);
            if (out && (out.status === "done" || out.status === "queued")) setLocation(href);
          }}
        />
      </div>
    </article>
  );
}

function AlertBanner({ alerts, scope }: { alerts: AlertItem[]; scope: DriverScope }) {
  const t = useT();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: (keys: string[]) => driverApi.markAlertsRead({ keys }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["driver-alerts"] }),
  });
  const unread = alerts.filter((a) => !a.read);
  if (unread.length === 0 || scope.isAdmin) return null;
  const first = unread[0];
  return (
    <Banner
      testId="driver-alert-banner"
      onClick={() => {
        markRead.mutate([first.key]);
        if (first.link) setLocation(first.link);
      }}
      onDismiss={() => markRead.mutate([first.key])}
      dismissLabel={t.dismiss}
    >
      {first.title}
      {first.body ? `: ${first.body}` : ""}
      {unread.length > 1 ? ` · ${t.moreAlerts(unread.length - 1)}` : ""}
    </Banner>
  );
}

export default function DriverToday() {
  const t = useT();
  const [lang] = useLang();
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const today = useToday(scope);
  const templates = useTemplatesQuery(scope);
  const alerts = useAlertsQuery(scope);

  const data = today.data?.data;
  const name = me.data?.name ?? data?.driver.name ?? null;
  const dispatchTel = telHref(me.data?.dispatch_phone);
  const batches = data?.batches ?? [];
  const stops = batches.reduce((n, b) => n + (b.so_count ?? 0), 0);
  const done = batches.reduce((n, b) => n + (b.trip?.stops_done ?? b.progress?.stops_done ?? 0), 0);
  const firstOpen = batches.findIndex((b) => !isFinished(b));
  const flag = data?.acknowledge_checklist_enabled ?? templates.data?.data.acknowledge_checklist_enabled;
  const checklistOn = Boolean(checklistOf(flag, templates.data?.data.acknowledge_checklist));

  return (
    <DriverLayout scope={scope} tab="today" testId="driver-today">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "20px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Avatar name={name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.sub }}>{dayLabel(me.data?.today ?? data?.date ?? null, lang)}</div>
            <div data-testid="driver-greeting" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.hi(firstName(name))}
            </div>
          </div>
        </div>
        {dispatchTel && !scope.isAdmin && <RoundButton icon="phone" label={t.callDispatch} href={dispatchTel} size={48} testId="driver-call-dispatch" />}
      </div>

      {scope.missingDriverId ? (
        <div style={{ padding: "16px 20px" }}>
          <MissingDriverNotice />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 20px 0" }}>
            {scope.isAdmin && <Banner tone="blue">{t.adminReadOnly}</Banner>}
            <DispatchBanners changes={data?.dispatch_changes} batchId={null} />
            <AlertBanner alerts={alerts.data?.alerts ?? []} scope={scope} />
            <OfflineNote offline={Boolean(today.data?.offline)} savedAt={today.data?.saved_at} />
          </div>

          {today.isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 20px" }} aria-busy="true">
              <Skeleton height={80} radius={16} />
              <Skeleton height={200} radius={20} />
            </div>
          ) : today.isError && !data ? (
            <div style={{ padding: "16px 20px" }}>
              <ErrorState message={errorText(today.error)} onRetry={() => void today.refetch()} />
            </div>
          ) : (
            <>
              <div data-testid="driver-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, padding: "16px 20px 4px" }}>
                {[
                  [batches.length, t.trips, "kpi-trips"],
                  [stops, t.stops, "kpi-stops"],
                  [done, t.done, "kpi-done"],
                ].map(([value, label, id]) => (
                  <div key={String(id)} data-testid={String(id)} style={{ background: C.card, borderRadius: 16, padding: 14, minWidth: 0 }}>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
                    <div style={{ fontSize: 13, color: C.sub }}>{label}</div>
                  </div>
                ))}
              </div>
              {batches.length === 0 ? (
                <div data-testid="driver-empty-today" style={{ margin: "16px 20px 0", background: C.card, borderRadius: 20, padding: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{t.noTripsToday}</div>
                  <div style={{ fontSize: 14, color: C.sub, marginTop: 4 }}>{t.noTripsHint}</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 20px 20px" }}>
                  {batches.map((b, i) => (
                    <TripCard
                      key={b.batch_id}
                      batch={b}
                      scope={scope}
                      me={me.data}
                      index={i}
                      total={batches.length}
                      active={i === firstOpen}
                      waitFor={firstOpen >= 0 && i > firstOpen && !isFinished(b) && (b.trip?.status ?? "pending") === "pending" ? (batches[firstOpen].trip_number ?? firstOpen + 1) : null}
                      checklistOn={checklistOn}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </DriverLayout>
  );
}
