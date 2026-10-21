import { greetingPart } from "@/lib/driver";
import { useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as driverApi from "@/services/api/driver";
import { firstName, formatQty, telHref, withDriverParams } from "@/lib/driver";
import { acknowledgePath, alertTarget } from "@/lib/tripNav";
import { tripPath } from "@/lib/tripNav";
import type { TripInfo } from "@/lib/tripTypes";
import type { AlertItem, Batch, DriverMe } from "@/lib/tripTypes";
import { crewCalls, normalizeCrew, viewerRoleOf } from "@/lib/crewCalls";
import type { CrewCall } from "@/lib/crewCalls";
import DriverLayout from "./DriverLayout";
import { dayLabel, useLang, useT } from "./i18n";
import type { Dict } from "./i18n";
import { useAlertsQuery, useToday } from "./queries";
import { ErrorState, MissingDriverNotice, OfflineNote, errorText, useDriverMe, useDriverScope } from "./shared";
import type { DriverScope } from "./shared";
import { ConfirmSheet, DispatchBanners, chipOfTrip, useTripActions } from "./tripFlow";
import { alpha } from "@/lib/themeTokens";
import { canStartOnDay, dayOf, daySections, groupTripDays, nextYmd } from "@/lib/tripDays";
import { Avatar, Banner, C, Chip, Icon, RoundButton, Skeleton } from "./ui";
import type { ChipTone, IconName } from "./ui";

const FINISHED = new Set(["returned", "handover_submitted", "closed"]);

export function isFinished(batch: Pick<Batch, "trip">): boolean {
  return Boolean(batch.trip && FINISHED.has(batch.trip.status));
}

// The crew members the signed-in person can call (helper sees "Call driver" + any other helper; driver sees the helper).
export function crewCallsOf(batch: Pick<Batch, "crew" | "helpers" | "viewer_role">, me: Pick<DriverMe, "driver_id" | "staff_id" | "role" | "viewer_role"> | null | undefined): CrewCall[] {
  return crewCalls(normalizeCrew(batch.crew, batch.helpers), viewerRoleOf(batch, me), [me?.staff_id, me?.driver_id]);
}

// Crew contact: "Driver: <name>" / "Helper: <name>" with the number, and a labelled call button when it is dialable.
export function PersonRow({ call, t, boxed = false }: { call: CrewCall; t: Dict; boxed?: boolean }) {
  const tel = telHref(call.phone);
  const label = call.kind === "call_driver" ? t.callDriver : t.callPerson(call.name);
  return (
    <div data-testid={`driver-crew-${call.role}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", ...(boxed ? { padding: "12px 14px", borderRadius: 16, border: `1px solid ${C.line}`, background: C.card } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 160px" }}>
        <span aria-hidden="true" style={{ width: boxed ? 44 : 36, height: boxed ? 44 : 36, borderRadius: 22, background: C.soft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="user" size={boxed ? 22 : 18} color={C.body} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: boxed ? 17 : 15, fontWeight: 700, overflowWrap: "anywhere" }}>{call.role === "driver" ? t.driverNamed(call.name) : t.helperNamed(call.name)}</div>
          {call.phone && <div style={{ fontSize: 13, color: C.sub }}>{call.phone}</div>}
        </div>
      </div>
      {tel && (
        <a
          href={tel}
          aria-label={call.phone ? `${label} ${call.phone}` : label}
          data-testid="driver-call-crew"
          data-kind={call.kind}
          onClick={(e) => e.stopPropagation()}
          style={{ height: 44, padding: "0 16px", borderRadius: 22, border: `1px solid ${C.field}`, background: C.card, color: C.ink, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, flexShrink: 0, textDecoration: "none" }}
        >
          <Icon name="phone" size={18} />
          {label}
        </a>
      )}
    </div>
  );
}

export function Fact({ icon, children, color = C.body, testId }: { icon: IconName; children: ReactNode; color?: string; testId?: string }) {
  return (
    <span data-testid={testId} style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <Icon name={icon} size={18} color={color} />
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
    </span>
  );
}

function Stats({ batch, t, route }: { batch: Batch; t: Dict; route: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, fontSize: 15 }}>
      {route && (
        <Fact icon="pin" color={C.so} testId="driver-route-line">
          {route}
        </Fact>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 20, rowGap: 8 }}>
        <Fact icon="box">
          <b>{batch.so_count}</b> {t.orders(batch.so_count)}
        </Fact>
        {Number.isFinite(batch.total_kg) && batch.total_kg > 0 && (
          <Fact icon="weight" testId="driver-kg">
            <b>{formatQty(Math.round(batch.total_kg * 10) / 10)}</b> {t.kg}
          </Fact>
        )}
        {batch.total_packs !== null && batch.total_packs !== undefined && (
          <span data-testid="driver-packs">
            <b>{formatQty(batch.total_packs)}</b> {t.packs(batch.total_packs)}
          </span>
        )}
      </div>
    </div>
  );
}

function routeLine(batch: Batch, warehouse: string | null | undefined): string | null {
  const areas = [batch.first_area, batch.last_area].filter((a): a is string => Boolean(a));
  const uniq = [...new Set(areas)];
  if (uniq.length === 0) return warehouse ?? null;
  return warehouse ? `${warehouse} → ${uniq.join(", ")}` : uniq.join(" → ");
}

// Today's chip: a trip whose stops are all done reads "Delivered" (or "Closed ✓"); "Waiting for officer" stays inside the trip screen.
function todayChip(t: Dict, trip: TripInfo | null | undefined): { tone: ChipTone; label: string } | null {
  // Back at the warehouse but the signed invoices are not checked yet: still an open action (amber), not "completed".
  if (trip?.status === "returned" || trip?.status === "handover_submitted") return { tone: "amber", label: t.chipBackInvoices };
  if (trip?.status === "closed") return { tone: "green", label: t.chipClosed };
  return chipOfTrip(t, trip);
}

export function deliveredCount(b: Pick<Batch, "progress" | "trip">): number {
  return b.trip?.stops_done ?? ((b.progress?.delivered ?? 0) + (b.progress?.partial ?? 0) + (b.progress?.failed ?? 0));
}

function TripCard({ batch, scope, me, index, total, active, waitFor }: { batch: Batch; scope: DriverScope; me: DriverMe | undefined; index: number; total: number; active: boolean; waitFor: number | null }) {
  const t = useT();
  const [lang] = useLang();
  // Next-day assignment: acknowledge today, Start trip only on the delivery morning.
  const startable = canStartOnDay(batch);
  const overdue = dayOf(batch) === "overdue";
  const [, setLocation] = useLocation();
  const actions = useTripActions(scope, batch.batch_id);
  const [startOpen, setStartOpen] = useState(false);
  const href = tripPath(batch.batch_id, scope.adminDriverId);
  const chip = waitFor !== null ? { tone: "grey" as const, label: t.afterTrip(waitFor) } : todayChip(t, batch.trip);
  const status = batch.trip?.status ?? "pending";
  const left = batch.trip ? Math.max(batch.trip.total - batch.trip.acknowledged, 0) : 0;
  const finished = isFinished(batch);
  const crew = !scope.isAdmin && Boolean(batch.trip);
  const partners = crewCallsOf(batch, me);
  const tripNo = batch.trip_number ?? index + 1;

  // Acknowledging happens only in the Acknowledge tab: the card just takes the driver there (to this trip).
  let button: { label: string; testId: string; run: () => void; secondary?: boolean } | null = null;
  if (crew && status === "pending" && left > 0)
    button = { label: t.acknowledgeOrdersN(left), testId: "driver-card-action-acknowledge", secondary: startable && !active, run: () => setLocation(acknowledgePath(scope.adminDriverId, { batch: batch.batch_id })) };
  else if (active && crew && startable) {
    if (status === "pending") button = { label: t.startTrip, testId: "driver-card-action-start", run: () => setStartOpen(true) };
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
      style={{ display: "block", background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, color: C.ink, cursor: "pointer" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 13, color: C.sub, fontWeight: 500, whiteSpace: "nowrap" }}>
          {t.tripNofM(tripNo, total)}
          {overdue && (
            <span data-testid="driver-card-overdue" style={{ marginLeft: 8, color: C.so, fontWeight: 700 }}>
              {t.overdue}
            </span>
          )}
        </div>
        {chip && (
          <Chip tone={chip.tone} testId="driver-trip-chip" icon={chip.tone === "green" ? "check" : undefined}>
            {chip.label}
          </Chip>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4, overflowWrap: "anywhere" }}>{batch.vehicle}</div>
      <div data-testid="trip-viewer-role" style={{ fontSize: 14, color: C.sub, marginTop: 4 }}>{t.yourTripRole(viewerRoleOf(batch, me))}</div>
      {finished && (
        <div data-testid="driver-card-delivered" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 16, fontWeight: 700, color: C.green }}>
          <Icon name="check" size={20} color={C.green} width={2.4} />
          {t.nOfMDone(deliveredCount(batch), batch.so_count)}
        </div>
      )}
      <Stats batch={batch} t={t} route={routeLine(batch, me?.warehouse)} />
      {partners.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }} onClick={(e) => e.stopPropagation()}>
          {partners.map((p) => (
            <PersonRow key={p.key} call={p} t={t} />
          ))}
        </div>
      )}
      {!startable && crew && !finished && (
        <div data-testid="driver-card-start-later" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "10px 12px", borderRadius: 12, background: C.soft, color: C.body, fontSize: 14, fontWeight: 700 }}>
          <Icon name="play" size={18} color={C.sub} />
          {t.startOnMorning(dayLabel(batch.delivery_date, lang))}
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
          style={{ width: "100%", height: 52, marginTop: 14, borderRadius: 12, border: button.secondary ? `1.5px solid ${C.ink}` : 0, background: button.secondary ? C.card : C.ink, color: button.secondary ? C.ink : C.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, fontFamily: "inherit", opacity: actions.busy ? 0.6 : 1, cursor: "pointer" }}
        >
          {actions.busy ? t.gettingLocation : button.label}
        </button>
      )}
      <button
        type="button"
        data-testid="driver-card-view-details"
        onClick={(e) => {
          e.stopPropagation();
          setLocation(href);
        }}
        style={{ width: "100%", height: 48, marginTop: button ? 10 : 14, borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
      >
        {t.viewTripDetails}
        <Icon name="arrowRight" size={18} />
      </button>
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

// The day at a glance: stops completed out of all stops (0 stops = empty bar, never a division by zero) and three counts.
function DailyProgress({ trips, stops, done, failed, t }: { trips: number; stops: number; done: number; failed: number; t: Dict }) {
  const pct = stops > 0 ? Math.min(100, Math.round((done / stops) * 100)) : 0;
  const soft = alpha("onInk", 0.7);
  const stats: Array<[number, string, string, IconName]> = [
    [trips, t.trips, "kpi-trips", "box"],
    [stops, t.totalStops, "kpi-stops", "pin"],
    [done, t.completed, "kpi-done", "check"],
  ];
  return (
    <section data-testid="driver-kpis" aria-label={t.todaysProgress} style={{ margin: "14px 20px 0", padding: 18, borderRadius: 18, background: C.ink, color: C.onInk }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: soft }}>
          {t.todaysProgress}
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: C.green }} />
        </div>
        {failed > 0 ? (
          <span style={{ padding: "4px 10px", borderRadius: 999, background: C.negativeBg, color: C.so, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{t.nNotDelivered(failed)}</span>
        ) : stops > 0 && done >= stops ? (
          <span style={{ padding: "4px 10px", borderRadius: 999, background: C.greenBg, color: C.green, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{t.allDone}</span>
        ) : null}
      </div>
      <div id="driver-day-progress" data-testid="driver-day-progress" style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 6 }}>{t.stopsCompletedOf(done, stops)}</div>
      <div role="progressbar" aria-labelledby="driver-day-progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 8, borderRadius: 4, background: alpha("onInk", 0.16), marginTop: 12, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: C.green, transition: "width .3s" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 16 }}>
        {stats.map(([value, label, id, icon]) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 17, background: alpha("onInk", 0.12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name={icon} size={17} color={C.onInk} />
            </span>
            <div data-testid={id} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
              <div style={{ fontSize: 12, color: soft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
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
        setLocation(alertTarget(first, scope.adminDriverId));
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
  const alerts = useAlertsQuery(scope);

  const data = today.data?.data;
  const name = me.data?.name ?? data?.driver.name ?? null;
  const dispatchTel = telHref(me.data?.dispatch_phone);
  const allBatches = data?.batches ?? [];
  // Today's (and overdue) trips are delivered now; tomorrow's are acknowledge-only. Progress counts today's only.
  const groups = groupTripDays(allBatches);
  const batches = groups.today;
  const stops = batches.reduce((n, b) => n + (b.so_count ?? 0), 0);
  const done = batches.reduce((n, b) => n + deliveredCount(b), 0);
  const failed = batches.reduce((n, b) => n + (b.progress?.failed ?? 0), 0);
  const unread = alerts.data?.unread ?? 0;
  const firstOpen = batches.findIndex((b) => !isFinished(b));
  const todayYmd = me.data?.today ?? data?.date ?? "";
  const tomorrowYmd = groups.tomorrowDate ?? nextYmd(todayYmd);
  const sections = daySections(groups);
  const split = groups.tomorrow.length > 0;

  return (
    <DriverLayout scope={scope} tab="today" testId="driver-today">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "20px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Avatar name={name} size={52} />
          <div data-testid="driver-greeting" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.greet(greetingPart(new Date().getHours()), "")}
              {firstName(name) ? "," : ""}
            </div>
            {firstName(name) && <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firstName(name)}</div>}
            <div style={{ fontSize: 13, color: C.sub, marginTop: 1 }}>{dayLabel(me.data?.today ?? data?.date ?? null, lang)}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {!scope.isAdmin && (
            <span style={{ position: "relative", display: "inline-flex" }}>
              <RoundButton icon="bell" label={t.openAlerts(unread)} href={withDriverParams("/driver/alerts", { driver_id: scope.adminDriverId })} size={48} testId="driver-bell" />
              {unread > 0 && (
                <span data-testid="driver-unread" aria-hidden="true" style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: C.so, color: C.card, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", pointerEvents: "none" }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
          )}
          {dispatchTel && !scope.isAdmin && <RoundButton icon="phone" label={t.callDispatch} href={dispatchTel} size={48} testId="driver-call-dispatch" />}
        </div>
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
              <DailyProgress trips={batches.length} stops={stops} done={done} failed={failed} t={t} />
              {allBatches.length === 0 ? (
                <div data-testid="driver-empty-today" style={{ margin: "16px 20px 0", background: C.card, borderRadius: 20, padding: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{t.noTripsToday}</div>
                  <div style={{ fontSize: 14, color: C.sub, marginTop: 4 }}>{t.noTripsHint}</div>
                </div>
              ) : (
                sections.map((sec) => {
                  const list = sec.items;
                  const isTomorrow = sec.day === "tomorrow";
                  const title = !split ? t.yourTrips : isTomorrow ? t.tomorrowSection(dayLabel(tomorrowYmd, lang)) : t.todaySection(dayLabel(todayYmd, lang));
                  return (
                    <section key={sec.day} data-testid={`driver-day-${sec.day}`} aria-label={title}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "22px 20px 0" }}>
                        <h2 style={{ margin: 0, fontSize: split ? 18 : 20, fontWeight: 800, letterSpacing: "-0.02em", minWidth: 0, overflowWrap: "anywhere" }}>{title}</h2>
                        {list.length > 0 && <span style={{ fontSize: 14, color: C.sub, whiteSpace: "nowrap" }}>{t.nAssigned(list.length)}</span>}
                      </div>
                      {list.length === 0 ? (
                        <div data-testid="driver-empty-today" style={{ margin: "12px 20px 0", background: C.card, borderRadius: 20, padding: 20, textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{t.noTripsToday}</div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "12px 20px 20px" }}>
                          {list.map((b, i) => (
                            <TripCard
                              key={b.batch_id}
                              batch={b}
                              scope={scope}
                              me={me.data}
                              index={i}
                              total={list.length}
                              active={!isTomorrow && i === firstOpen}
                              waitFor={!isTomorrow && firstOpen >= 0 && i > firstOpen && !isFinished(b) && (b.trip?.status ?? "pending") === "pending" ? (batches[firstOpen].trip_number ?? firstOpen + 1) : null}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </>
          )}
        </>
      )}
    </DriverLayout>
  );
}
