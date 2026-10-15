// The Acknowledge tab: the ONLY place orders are acknowledged. Orders grouped by trip; one big button per trip
// ("Acknowledge N orders" -> POST acknowledge-all, with the checklist sheet first when an admin turned it on).
// A date filter shows past days read-only.
// Data: today = GET /api/driver/today; a past date = GET /api/driver/history?from=D&to=D. The orders and their
// acknowledgement (workflow.ack: who / when) come from GET /api/driver/assignments/{batch_id} for each trip.
// No new endpoint.
import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "wouter";
import * as driverApi from "@/services/api/driver";
import { formatClock, formatQty, personName } from "@/lib/driver";
import { fetchWithCache, useOfflineQueue } from "@/lib/offlineRuntime";
import { acknowledgePath, actionsEnabled, shiftYmd } from "@/lib/tripNav";
import { deriveBatchState } from "@/lib/tripState";
import type { EffectiveOrder } from "@/lib/tripState";
import type { Batch, BatchDetail, DriverOrder } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { dayLabel, useLang, useT } from "./i18n";
import type { Dict } from "./i18n";
import { LIVE_REFRESH_MS, useTemplatesQuery, useToday } from "./queries";
import { ErrorState, MissingDriverNotice, OfflineNote, errorText, useDriverMe, useDriverScope } from "./shared";
import type { DriverScope } from "./shared";
import { ChecklistSheet, checklistOf, useTripActions } from "./tripFlow";
import { Banner, C, Chip, Icon, NumberDot, Pill, PrimaryButton, Skeleton, TypeBadge } from "./ui";

function shortAddress(o: DriverOrder, t: Dict): string {
  if (String(o.order_type ?? "SO").toUpperCase() === "PO") return t.pickupFrom(o.pickup_from ?? o.customer_name ?? "", o.destination_warehouse ?? null);
  if (String(o.order_type ?? "SO").toUpperCase() === "TO") return o.source_warehouse ? t.transferFrom(o.source_warehouse) : (o.destination_warehouse ?? "");
  if (o.area) return o.area;
  const lines = o.address_lines ?? [];
  return lines.length > 1 ? lines.slice(-2).join(", ") : o.address_text;
}

function OrderCard({ eff, n, t }: { eff: EffectiveOrder; n: number; t: Dict }) {
  const o = eff.order;
  const ack = o.workflow?.ack ?? null;
  const done = eff.acked || eff.ackPending;
  const sub = shortAddress(o, t);
  return (
    <div data-testid={`driver-ack-order-${o.so_number}`} data-acked={done ? "true" : "false"} style={{ background: C.card, borderRadius: 18, padding: 16, display: "flex", gap: 14 }}>
      <NumberDot n={n} done={done} />
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <TypeBadge type={o.order_type} />
          <span style={{ fontSize: 14, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.so_number}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, overflowWrap: "anywhere" }}>{o.customer_name}</div>
        {sub && <div style={{ fontSize: 14, color: C.sub, marginTop: 2 }}>{sub}</div>}
        <div style={{ fontSize: 14, marginTop: 8 }}>
          {o.lines.length > 0 && (
            <>
              <b>{o.lines.length}</b> {t.items(o.lines.length)}
            </>
          )}
          {o.total_kg > 0 && (
            <>
              {o.lines.length > 0 ? " · " : ""}
              <b>{formatQty(Math.round(o.total_kg * 10) / 10)}</b> {t.kg}
            </>
          )}
          {o.total_packs !== null && o.total_packs !== undefined && (
            <>
              {" · "}
              <b>{formatQty(o.total_packs)}</b> {t.packs(o.total_packs)}
            </>
          )}
        </div>
        {done ? (
          <div data-testid="driver-acked-line" style={{ fontSize: 13, fontWeight: 700, color: C.green, marginTop: 8 }}>
            {eff.acked && ack ? t.ackedAt(formatClock(ack.at), personName(ack.by)) : t.ackedWaiting}
          </div>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 500, color: C.amber, marginTop: 8 }}>{t.notAcked}</div>
        )}
      </div>
    </div>
  );
}

function TripGroup({ batch, detail, index, total, scope, readOnly, highlight }: { batch: Batch; detail: BatchDetail | undefined; index: number; total: number; scope: DriverScope; readOnly: boolean; highlight: boolean }) {
  const t = useT();
  const queue = useOfflineQueue();
  const templates = useTemplatesQuery(scope);
  const actions = useTripActions(scope, batch.batch_id);
  const [sheet, setSheet] = useState(false);
  const state = useMemo(() => (detail ? deriveBatchState(detail, queue.entries) : null), [detail, queue.entries]);
  const toAck = state ? state.orders.filter((o) => !o.acked && !o.ackPending) : [];
  const tpl = templates.data?.data;
  const photoOn = Boolean(detail?.photo_storage_enabled ?? tpl?.photo_storage_enabled);
  const checklist = checklistOf(detail?.acknowledge_checklist_enabled ?? tpl?.acknowledge_checklist_enabled, tpl?.acknowledge_checklist);
  const canAct = !readOnly && actionsEnabled(scope, detail) && state?.status === "pending" && toAck.length > 0;

  return (
    <section id={`ack-${batch.batch_id}`} data-testid={`driver-ack-trip-${batch.batch_id}`} data-focus={highlight ? "true" : undefined} style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>{t.tripNofM(batch.trip_number ?? index + 1, batch.trips_on_date ?? total)}</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}>{batch.vehicle}</div>
        </div>
        {state && (toAck.length > 0 ? <Chip tone="amber">{t.chipToAck}</Chip> : <Chip tone="green">{t.ackDone}</Chip>)}
      </div>
      {!detail ? (
        <Skeleton height={130} />
      ) : (
        state?.orders.map((eff, i) => <OrderCard key={eff.so_id} eff={eff} n={i + 1} t={t} />)
      )}
      {canAct && (
        <PrimaryButton
          icon="check"
          disabled={actions.busy || !actions.ready}
          testId={`driver-ack-trip-button-${batch.batch_id}`}
          onClick={() => {
            if (checklist) setSheet(true);
            else void actions.acknowledgeAll(toAck.length);
          }}
        >
          {actions.busy ? t.gettingLocation : t.acknowledgeNOrders(toAck.length)}
        </PrimaryButton>
      )}
      {checklist && state && (
        <ChecklistSheet
          open={sheet}
          template={checklist}
          photoStorage={photoOn}
          orderIds={toAck.map((o) => o.so_id)}
          busy={actions.busy}
          confirmLabel={t.acknowledgeNOrders(toAck.length)}
          onClose={() => setSheet(false)}
          onDone={async (answers, blobs) => {
            await actions.acknowledgeAll(toAck.length, { templateId: checklist.id, answers, blobs });
            setSheet(false);
          }}
        />
      )}
    </section>
  );
}

export default function DriverAcknowledge() {
  const t = useT();
  const [lang] = useLang();
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const today = useToday(scope);
  const queue = useOfflineQueue();
  const [params] = useSearchParams();
  const [, setLocation] = useLocation();
  const todayYmd = me.data?.today ?? today.data?.data.date ?? "";
  const date = params.get("date") || todayYmd;
  const isToday = !params.get("date") || date === todayYmd;
  const focusBatch = params.get("batch");
  const enabled = !scope.sessionLoading && !scope.missingDriverId;

  const past = useQuery({
    queryKey: ["driver-ack-day", scope.adminDriverId, date],
    queryFn: () => driverApi.getHistoryPage({ range: { from: date, to: date }, status: "all", page: 1, pageSize: 50 }, scope.adminDriverId),
    enabled: enabled && !isToday && Boolean(date),
    retry: 1,
  });
  const batches: Batch[] = isToday ? (today.data?.data.batches ?? []) : (past.data?.batches ?? []).filter((b) => !b.delivery_date || b.delivery_date === date);
  const details = useQueries({
    queries: batches.map((b) => ({
      queryKey: ["driver-assignment", b.batch_id, scope.adminDriverId],
      queryFn: () => fetchWithCache("batch", b.batch_id, scope.adminDriverId, () => driverApi.getAssignment(b.batch_id, scope.adminDriverId)),
      enabled,
      retry: 1,
      refetchInterval: isToday ? LIVE_REFRESH_MS : (false as const),
      refetchOnWindowFocus: isToday ? ("always" as const) : true,
    })),
  });
  const loadedAll = details.every((d) => d.data);
  const leftCount = details.reduce((n, d) => {
    const detail = d.data?.data;
    if (!detail) return n;
    const s = deriveBatchState(detail, queue.entries);
    return n + s.orders.filter((o) => !o.acked && !o.ackPending).length;
  }, 0);
  const anyOrders = details.some((d) => (d.data?.data.orders.length ?? 0) > 0);
  const listLoading = isToday ? today.isLoading : past.isLoading;
  const listError = isToday ? (today.isError && !today.data ? today.error : null) : past.isError ? past.error : null;

  // Opened for one trip (Today card / trip screen): bring that trip into view once its orders are on screen.
  const [scrolled, setScrolled] = useState<string | null>(null);
  const focusLoaded = Boolean(focusBatch && details[batches.findIndex((b) => b.batch_id === focusBatch)]?.data);
  useEffect(() => {
    if (!focusBatch || !focusLoaded || scrolled === focusBatch) return;
    document.getElementById(`ack-${focusBatch}`)?.scrollIntoView({ block: "start" });
    setScrolled(focusBatch);
  }, [focusBatch, focusLoaded, scrolled]);

  const go = (d: string | null) => setLocation(acknowledgePath(scope.adminDriverId, { date: d && d !== todayYmd ? d : null }), { replace: true });
  const yesterday = todayYmd ? shiftYmd(todayYmd, -1) : "";

  return (
    <DriverLayout scope={scope} tab="acknowledge" testId="driver-acknowledge">
      <div style={{ padding: "24px 20px 8px" }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{t.ackTitle}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 14 }}>
          <Pill on={isToday} onClick={() => go(null)} testId="driver-ack-date-today">
            {t.dateToday}
          </Pill>
          <Pill on={!isToday && date === yesterday} onClick={() => go(yesterday)} testId="driver-ack-date-yesterday">
            {t.dateYesterday}
          </Pill>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 6px 0 14px", borderRadius: 22, border: `1px solid ${!isToday && date !== yesterday ? C.ink : C.field}`, background: C.card, fontSize: 14, fontWeight: 500, minWidth: 0 }}>
            <Icon name="clock" size={18} />
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t.pickDate}</span>
            <input
              type="date"
              data-testid="driver-ack-date-input"
              value={date}
              max={todayYmd || undefined}
              onChange={(e) => e.target.value && go(e.target.value)}
              style={{ height: 40, border: 0, background: "transparent", fontFamily: "inherit", fontSize: 14, color: C.ink, minWidth: 0, maxWidth: 150 }}
            />
          </label>
        </div>
        {!isToday && <div style={{ fontSize: 13, color: C.sub, marginTop: 10 }}>{`${dayLabel(date, lang)} · ${t.pastReadOnly}`}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "12px 20px 20px" }}>
        {scope.missingDriverId ? (
          <MissingDriverNotice />
        ) : listLoading ? (
          <>
            <Skeleton height={60} />
            <Skeleton height={140} />
          </>
        ) : listError ? (
          <ErrorState message={errorText(listError)} onRetry={() => void (isToday ? today.refetch() : past.refetch())} />
        ) : batches.length === 0 ? (
          <div data-testid="driver-ack-empty" style={{ background: C.card, borderRadius: 18, padding: 20, textAlign: "center", fontSize: 15, fontWeight: 700 }}>
            {t.noOrdersDate}
          </div>
        ) : (
          <>
            {isToday && <OfflineNote offline={Boolean(today.data?.offline)} savedAt={today.data?.saved_at} />}
            {scope.isAdmin && <Banner tone="blue">{t.adminReadOnly}</Banner>}
            {loadedAll && anyOrders && leftCount === 0 && (
              <div data-testid="driver-all-acked" role="status" style={{ padding: "14px 16px", borderRadius: 16, background: C.greenBg, color: C.green, fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name="check" size={22} color={C.green} width={2.4} />
                {t.allAcked}
              </div>
            )}
            {batches.map((b, i) => (
              <TripGroup key={b.batch_id} batch={b} detail={details[i]?.data?.data} index={i} total={batches.length} scope={scope} readOnly={!isToday} highlight={b.batch_id === focusBatch} />
            ))}
          </>
        )}
      </div>
    </DriverLayout>
  );
}
