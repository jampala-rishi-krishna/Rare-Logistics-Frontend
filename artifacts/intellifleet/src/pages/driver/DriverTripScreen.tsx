// THE trip screen: everything for one trip on one page, with ONE big button that changes with each step:
// I have the orders -> Start trip (sheet) -> Navigate / I'm here -> Delivered (sheet) -> next stop ... -> End trip (sheet)
// -> "Give the signed invoice copies to the Logistics Officer" -> Waiting for officer -> Closed ✓.
// Opened from History (?from=history) or by an admin (?driver_id=) it is read-only.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useParams, useSearchParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MapPinOff, PackageX, PackageOpen, Snowflake, TrafficCone, Truck, UserX, CircleHelp } from "lucide-react";
import * as driverApi from "@/services/api/driver";
import { formatClock, formatQty, telHref, withDriverParams } from "@/lib/driver";
import { useOfflineQueue } from "@/lib/offlineRuntime";
import { errorInfo } from "@/lib/tripErrors";
import { buildCheckoutAnswers, checkoutItemsForOrder, initialCheckoutForm, isItemRequired, isItemVisible, mapServerErrors, usableItems, validateCheckout, INVOICE_KEY } from "@/lib/tripForms";
import type { FieldErrors, FormValue, FormValues } from "@/lib/tripForms";
import { newIdempotencyKey } from "@/lib/tripActions";
import { isRemovedByDispatch } from "@/lib/offlineQueue";
import { acknowledgePath, actionsEnabled, currentStop, directionsUrl, stopState, tripStep } from "@/lib/tripNav";
import { deriveBatchState } from "@/lib/tripState";
import type { EffectiveBatch, EffectiveOrder } from "@/lib/tripState";
import type { AutoHandover, BatchDetail, DriverOrder, DriverToday, RouteInfo, Templates } from "@/lib/tripTypes";
import type { Cached } from "@/lib/offlineCache";
import { MediaPhoto } from "./media";
import DriverLayout from "./DriverLayout";
import { DICTS, useT, driverMessage } from "./i18n";
import type { Dict } from "./i18n";
import { useAssignmentQuery, useRouteQuery, useTemplatesQuery } from "./queries";
import { ErrorState, MissingDriverNotice, OfflineNote, errorText, showToast, useDriverMe, useDriverScope } from "./shared";
import type { DriverScope } from "./shared";
import { FieldLabel, PhotoTiles, TemplateField, fieldInput } from "./fields";
import { ConfirmSheet, DispatchBanners, handoverKey, tripChip, useTripActions } from "./tripFlow";
import { PersonRow, partnersOf } from "./DriverToday";
import { ActionBar, Banner, C, Chip, FieldError, Icon, NumberDot, OutlineButton, Pill, PrimaryButton, RoundButton, Sheet, SheetTitle, Skeleton, TextButton, TypeBadge } from "./ui";
import type { IconName } from "./ui";

// ---------- small pieces ----------

function shortAddress(o: DriverOrder): string {
  if (o.order_type === "TO") return "";
  if (o.area) return o.area;
  const lines = o.address_lines ?? [];
  return lines.length > 1 ? lines.slice(-2).join(", ") : o.address_text;
}

/** TO or PO: no invoice, the order number is the reference. */
function isTo(o: Pick<DriverOrder, "order_type">): boolean {
  const kind = String(o.order_type ?? "SO").toUpperCase();
  return kind === "TO" || kind === "PO";
}

function isPo(o: Pick<DriverOrder, "order_type">): boolean {
  return String(o.order_type ?? "SO").toUpperCase() === "PO";
}

/** The grey line under a stop: TO = where it comes from; PO = pick up at the vendor -> destination warehouse; SO / WM = the area. */
function stopSubline(o: DriverOrder, t: Dict): string {
  if (isPo(o)) return t.pickupFrom(o.pickup_from ?? o.customer_name ?? "", o.destination_warehouse ?? null);
  if (isTo(o)) return o.source_warehouse ? t.transferFrom(o.source_warehouse) : o.destination_warehouse ?? "";
  return shortAddress(o);
}

function ItemsLine({ order, t, extra }: { order: DriverOrder; t: Dict; extra?: string | null }) {
  const n = order.lines.length;
  return (
    <div style={{ fontSize: 14, marginTop: 8 }}>
      {n > 0 && (
        <>
          <b>{n}</b> {t.items(n)}
        </>
      )}
      {order.total_kg > 0 && (
        <>
          {n > 0 ? " · " : ""}
          <b>{formatQty(Math.round(order.total_kg * 10) / 10)}</b> {t.kg}
        </>
      )}
      {order.total_packs !== null && order.total_packs !== undefined && (
        <>
          {" · "}
          <b>{formatQty(order.total_packs)}</b> {t.packs(order.total_packs)}
        </>
      )}
      {extra ? ` · ${extra}` : ""}
    </div>
  );
}

function OrderRef({ order }: { order: DriverOrder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <TypeBadge type={order.order_type} />
      <span style={{ fontSize: 14, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.so_number}</span>
    </div>
  );
}

// ---------- header ----------

function Header({ batch, state, t, backHref, backLabel, me, done }: { batch: BatchDetail; state: EffectiveBatch; t: Dict; backHref: string; backLabel: string; me: ReturnType<typeof useDriverMe>["data"]; done?: ReactNode }) {
  const chip = tripChip(t, state.status, state.acknowledged, state.total, state.stopsDone);
  const onTrip = state.status === "on_trip";
  const pct = state.total > 0 ? Math.round((state.stopsDone / state.total) * 100) : 0;
  return (
    <div data-testid="driver-trip-header" style={{ background: C.card, padding: "12px 20px 4px" }}>
      <RoundButton icon="back" label={backLabel} href={backHref} testId="driver-trip-back" />
      <div style={{ fontSize: 15, color: C.sub, marginTop: 12 }}>{t.tripDetails}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(28px, 8.5vw, 34px)", fontWeight: 800, letterSpacing: "-0.03em", overflowWrap: "anywhere", minWidth: 0 }}>{batch.vehicle}</h1>
        <Chip tone={chip.tone} big testId="driver-trip-chip" icon={chip.tone === "green" ? "check" : undefined}>
          {chip.label}
        </Chip>
      </div>
      {done ? (
        done
      ) : onTrip ? (
        <>
          <div data-testid="driver-progress" style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>
            {t.nOfMDone(state.stopsDone, state.total)}
          </div>
          <div style={{ height: 8, borderRadius: 4, background: C.muted, marginTop: 8, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: 8, borderRadius: 4, background: C.green, transition: "width .3s" }} />
          </div>
        </>
      ) : (
        <div style={{ fontSize: 15, color: C.sub, marginTop: 4 }}>{t.tripSummary(batch.trip_number ?? 1, state.total, me?.warehouse ?? null)}</div>
      )}
      <div data-testid="driver-step-rail" aria-label={t.stepsLabel} style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", fontSize: 14 }}>
        {[t.stepLoad, t.stepDeliver, t.stepReturn].map((label, index) => {
          const step = batch.step?.step ?? (state.status === "closed" ? "closed" : state.status === "on_trip" ? 2 : ["returned", "handover_submitted"].includes(state.status) ? 3 : 1);
          const active = step === "closed" || index + 1 <= step;
          return <span key={index} aria-current={step === index + 1 ? "step" : undefined} style={{ fontWeight: active ? 700 : 400, color: active ? C.ink : C.sub }}>{step === "closed" || (typeof step === "number" && index + 1 < step) ? "\u2713" : index + 1} {label}</span>;
        })}
      </div>
    </div>
  );
}

// ---------- trip overview: metrics, stop timeline, order summary, crew, proofs ----------

function Metrics({ batch, state, t }: { batch: BatchDetail; state: EffectiveBatch; t: Dict }) {
  const kg = batch.total_kg > 0 ? batch.total_kg : state.orders.reduce((n, e) => n + (e.order.total_kg || 0), 0);
  // A stop is a delivery point: two orders for the same customer at the same address are one stop.
  const stops = new Set(state.orders.map((e) => `${e.order.customer_name}|${e.order.address_text}`)).size;
  const cells: Array<[ReactNode, string, string]> = [
    [state.total, t.ordersLabel, "driver-metric-orders"],
    [kg > 0 ? `${formatQty(Math.round(kg * 10) / 10)} ${t.kg}` : "—", t.totalWeight, "driver-metric-kg"],
    [stops, t.stops, "driver-metric-stops"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
      {cells.map(([value, label, id]) => (
        <div key={id} data-testid={id} style={{ background: C.soft, borderRadius: 14, padding: "12px 12px", minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
          <div style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

type NodeKind = "done" | "here" | "problem" | "waiting";

function TimelineNode({ kind, n }: { kind: NodeKind; n?: number }) {
  const bg = kind === "done" ? C.green : kind === "problem" ? C.negativeBg : kind === "here" ? C.ink : C.card;
  const fg = kind === "done" || kind === "here" ? C.onInk : kind === "problem" ? C.so : C.body;
  return (
    <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 14, background: bg, color: fg, border: kind === "waiting" ? `1.5px solid ${C.field}` : 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0, position: "relative", zIndex: 1 }}>
      {kind === "done" ? <Icon name="check" size={16} color={C.onInk} width={2.6} /> : kind === "problem" ? <Icon name="info" size={16} color={C.so} /> : n ?? ""}
    </span>
  );
}

// One timeline row: node + connector on the left, content on the right, time (when known) at the end.
function TimelineRow({ node, last, lineDone, children, time, testId, dataState, dataSo }: { node: ReactNode; last: boolean; lineDone: boolean; children: ReactNode; time?: string; testId?: string; dataState?: string; dataSo?: string }) {
  return (
    <div data-testid={testId} data-state={dataState} data-so={dataSo} style={{ display: "flex", gap: 12, position: "relative", paddingBottom: last ? 0 : 16 }}>
      {!last && <span aria-hidden="true" style={{ position: "absolute", left: 13, top: 28, bottom: 0, width: 2, background: lineDone ? C.green : C.line }} />}
      {node}
      <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>{children}</div>
      {time && <div style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap", paddingTop: 5 }}>{time}</div>}
    </div>
  );
}

function stopNode(s: ReturnType<typeof stopState>): NodeKind {
  return s === "delivered" ? "done" : s === "problem" ? "problem" : s === "here" ? "here" : "waiting";
}

function Timeline({ batch, state, t, current, warehouse }: { batch: BatchDetail; state: EffectiveBatch; t: Dict; current: EffectiveOrder | null; warehouse: string | null }) {
  const startedAt = batch.trip?.started_at ?? null;
  const endedAt = batch.trip?.ended_at ?? batch.ended_at ?? null;
  const started = Boolean(startedAt) || state.status !== "pending";
  const ended = Boolean(endedAt) || ["returned", "handover_submitted", "closed"].includes(state.status);
  const rows = state.orders;
  return (
    <div data-testid="driver-stop-timeline" style={{ display: "flex", flexDirection: "column" }}>
      <TimelineRow node={<TimelineNode kind={started ? "done" : "waiting"} />} last={rows.length === 0 && !ended} lineDone={started} time={formatClock(startedAt) || undefined}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{t.startPoint}</div>
        {warehouse && <div style={{ fontSize: 14, color: C.sub, overflowWrap: "anywhere" }}>{warehouse}</div>}
      </TimelineRow>
      {rows.map((eff, i) => {
        const o = eff.order;
        const s = stopState(eff);
        const isLast = i === rows.length - 1 && !ended;
        const stop = o.workflow?.stop;
        const time = formatClock(stop?.checkout_at ?? stop?.checkin_at ?? null) || undefined;
        if (current && eff.so_id === current.so_id && state.status === "on_trip")
          return (
            <TimelineRow key={eff.so_id} node={<TimelineNode kind={stopNode(s)} n={i + 1} />} last={isLast} lineDone={false}>
              <CurrentStopCard eff={eff} t={t} here={eff.stopStatus === "checked_in"} />
            </TimelineRow>
          );
        const sub = stopSubline(o, t);
        return (
          <TimelineRow key={eff.so_id} testId={`driver-order-${o.so_number}`} dataState={s} node={<TimelineNode kind={stopNode(s)} n={i + 1} />} last={isLast} lineDone={s === "delivered"} time={time}>
            <div style={{ fontSize: 13, color: C.sub }}>{t.stopN(i + 1)}</div>
            <div style={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>{o.customer_name}</div>
            {sub && <div style={{ fontSize: 14, color: C.sub, overflowWrap: "anywhere" }}>{sub}</div>}
            <div style={{ fontSize: 13, color: s === "problem" ? C.so : C.sub, display: "flex", alignItems: "center", gap: 6, minWidth: 0, marginTop: 4 }}>
              <TypeBadge type={o.order_type} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {o.so_number} · {stateLabel(t, s)}
                {eff.stopStatus === "checked_out" && eff.outcome && !/^deliver/i.test(eff.outcome) ? ` (${/^partial/i.test(eff.outcome) ? t.partial : t.failed})` : ""}
              </span>
            </div>
          </TimelineRow>
        );
      })}
      {ended && (
        <TimelineRow node={<TimelineNode kind="done" />} last lineDone time={formatClock(endedAt) || undefined}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t.returnPoint}</div>
          {warehouse && <div style={{ fontSize: 14, color: C.sub, overflowWrap: "anywhere" }}>{warehouse}</div>}
        </TimelineRow>
      )}
    </div>
  );
}

function SectionCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} style={{ border: `1px solid ${C.line}`, borderRadius: 16, background: C.card, overflow: "hidden" }}>
      {children}
    </section>
  );
}

function SectionHead({ icon, title, open, onToggle, extra }: { icon: IconName; title: string; open?: boolean; onToggle?: () => void; extra?: ReactNode }) {
  const inner = (
    <>
      <Icon name={icon} size={20} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, textAlign: "left" }}>{title}</span>
      {extra}
      {onToggle && <Icon name={open ? "chevronDown" : "chevronRight"} size={20} color={C.sub} />}
    </>
  );
  const style = { display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 52, padding: "0 16px", border: 0, background: "transparent", fontFamily: "inherit", color: C.ink, boxSizing: "border-box" } as const;
  return onToggle ? (
    <button type="button" aria-expanded={open} onClick={onToggle} style={{ ...style, cursor: "pointer" }}>
      {inner}
    </button>
  ) : (
    <div style={style}>{inner}</div>
  );
}

function OrderSummary({ state, t }: { state: EffectiveBatch; t: Dict }) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard testId="driver-order-summary">
      <SectionHead icon="file" title={t.orderSummary} open={open} onToggle={() => setOpen((v) => !v)} />
      {open && (
        <div data-testid="driver-order-summary-list" style={{ display: "flex", flexDirection: "column", padding: "0 16px 8px" }}>
          {state.orders.map((eff, i) => (
            <div key={eff.so_id} style={{ padding: "10px 0", borderTop: i === 0 ? 0 : `1px solid ${C.line}` }}>
              <OrderRef order={eff.order} />
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, overflowWrap: "anywhere" }}>{eff.order.customer_name}</div>
              <ItemsLine order={eff.order} t={t} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function Documents({ state, t }: { state: EffectiveBatch; t: Dict }) {
  const withPhotos = state.orders.filter((e) => (e.order.workflow?.stop?.photos ?? []).length > 0);
  const count = withPhotos.reduce((n, e) => n + (e.order.workflow?.stop?.photos?.length ?? 0), 0);
  const [open, setOpen] = useState(count > 0);
  return (
    <SectionCard testId="driver-documents">
      <SectionHead icon="file" title={t.documentsProof} open={open} onToggle={() => setOpen((v) => !v)} extra={count > 0 ? <span style={{ fontSize: 14, color: C.sub }}>{count}</span> : undefined} />
      {open && (
        <div style={{ padding: "0 16px 14px" }}>
          {withPhotos.length === 0 ? (
            <div style={{ fontSize: 14, color: C.sub }}>{t.noProofYet}</div>
          ) : (
            withPhotos.map((eff) => (
              <div key={eff.so_id} style={{ marginTop: 6 }}>
                <OrderRef order={eff.order} />
                <OrderProofs order={eff.order} />
              </div>
            ))
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ---------- acknowledge list (screen 3) ----------

function AckList({ state, t }: { state: EffectiveBatch; t: Dict }) {
  return (
    <>
      <div style={{ padding: "18px 20px 6px", fontSize: 14, fontWeight: 700, color: C.sub }}>{t.checkOrders}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "6px 20px 16px" }}>
        {state.orders.map((eff, i) => {
          const o = eff.order;
          const sub = stopSubline(o, t);
          return (
            <div key={eff.so_id} data-testid={`driver-order-${o.so_number}`} style={{ background: C.card, borderRadius: 18, padding: 16, display: "flex", gap: 14 }}>
              <NumberDot n={i + 1} done={eff.acked || eff.ackPending} />
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <OrderRef order={o} />
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, overflowWrap: "anywhere" }}>{o.customer_name}</div>
                {sub && <div style={{ fontSize: 14, color: C.sub, marginTop: 2 }}>{sub}</div>}
                <ItemsLine order={o} t={t} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- stop list (screen 4) ----------

function stateLabel(t: Dict, s: ReturnType<typeof stopState>): string {
  return s === "here" ? t.stateHere : s === "delivered" ? t.stateDelivered : s === "problem" ? t.stateProblem : t.stateWaiting;
}

function CurrentStopCard({ eff, t, here }: { eff: EffectiveOrder; t: Dict; here: boolean }) {
  const o = eff.order;
  const [showItems, setShowItems] = useState(false);
  const contactName = o.contact?.person || o.contact?.attention || null;
  const tel = telHref(o.contact?.phone);
  const address = o.address_lines.length > 0 ? o.address_lines.join(", ") : o.address_text;
  const stop = o.workflow?.stop;
  return (
    <div data-testid={`driver-current-stop`} data-so={o.so_number} style={{ background: C.card, borderRadius: 20, padding: 18, border: `2px solid ${C.ink}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <OrderRef order={o} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.green, whiteSpace: "nowrap" }}>{here ? (stop?.checkin_at ? t.arrived(formatClock(stop.checkin_at)) : t.youAreHere) : t.nextStop}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 8, overflowWrap: "anywhere" }}>{o.customer_name}</div>
      {address && <div style={{ fontSize: 15, color: C.body, marginTop: 4, lineHeight: 1.4, overflowWrap: "anywhere" }}>{address}</div>}
      {isPo(o) && (
        <div data-testid="driver-po-pickup" style={{ marginTop: 10, padding: "8px 12px", borderRadius: 14, background: C.blueBg, color: C.blue, fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
          {stopSubline(o, t)}
        </div>
      )}
      {(contactName || tel) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14, padding: "10px 12px", borderRadius: 14, background: C.soft }}>
          <div style={{ fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ color: C.sub }}>{t.contact}</span> <b>{contactName ?? o.contact?.phone}</b>
          </div>
          {tel && <RoundButton icon="phone" label={t.callCustomer} href={tel} testId="driver-call-customer" />}
        </div>
      )}
      <ItemsLine order={o} t={t} />
      {o.notes && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 14, background: C.amberBg, color: C.amber, fontSize: 14 }}>
          <b>{t.notes}:</b> <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{o.notes}</span>
        </div>
      )}
      {o.lines.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setShowItems((s) => !s)} aria-expanded={showItems} style={{ minHeight: 44, border: 0, background: "transparent", padding: 0, fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: C.ink, textDecoration: "underline", cursor: "pointer" }}>
            {showItems ? t.hideItems : t.showItems(o.lines.length)}
          </button>
          {showItems && (
            <div data-testid="driver-item-lines" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {o.lines.map((line, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14, paddingTop: 6, borderTop: i === 0 ? 0 : `1px solid ${C.muted}` }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{line.name}</span>
                  <b style={{ whiteSpace: "nowrap" }}>
                    {formatQty(line.quantity)}
                    {line.unit ? ` ${line.unit}` : ""}
                  </b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {eff.attention.map((a, i) => (
        <div key={a.id ?? i} role="alert" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 14, background: C.negativeBg, color: C.so, fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
          {driverMessage(a.error, t)}
        </div>
      ))}
    </div>
  );
}

function OrderProofs({ order }: { order: DriverOrder }) {
 const t = useT();
 const photos = order.workflow?.stop?.photos ?? [];
 if (!photos.length) return null;
 return <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
  {photos.map(photo => <MediaPhoto key={photo.photo_id} photoId={photo.photo_id} alt={t.photos} meta={{ ...photo, so_number: photo.so_number ?? order.so_number }} />)}
 </div>;
}

// ---------- after End trip (screen 6) ----------

function handoverStatusLabel(t: Dict, status: string | null | undefined, closed: boolean): { text: string; color: string } {
  const s = (status ?? "").toLowerCase();
  if (closed || ["received", "validated", "ok", "checked", "accepted", "complete", "completed"].includes(s)) return { text: t.offReceived, color: C.green };
  if (s === "discrepancy") return { text: t.offWrong, color: C.so };
  if (["missing", "not_received", "rejected", "disputed"].includes(s)) return { text: t.offMissing, color: C.amber };
  return { text: t.offWaiting, color: C.sub };
}

function DoneTop({ batch, state, t }: { batch: BatchDetail; state: EffectiveBatch; t: Dict }) {
  const closed = state.status === "closed";
  const delivered = state.orders.filter((o) => o.stopStatus === "checked_out" && /^deliver/i.test((o.outcome ?? "Delivered").trim())).length;
  const back = formatClock(batch.trip?.ended_at ?? batch.ended_at ?? null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: closed ? C.green : C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="check" size={30} color={C.onInk} width={2.4} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div data-testid="driver-trip-done-title" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {closed ? t.tripClosed : t.tripDone}
          </div>
          <div style={{ fontSize: 15, color: C.sub }}>{t.deliveredOfBack(delivered, state.total, back)}</div>
        </div>
      </div>
  );
}

function DoneView({ batch, state, t, handover }: { batch: BatchDetail; state: EffectiveBatch; t: Dict; handover: AutoHandover | undefined }) {
  const closed = state.status === "closed";
  const byId = new Map<string, { invoice_no: string | null; officer_status: string | null }>((handover?.items ?? []).map((it) => [String(it.so_id), { ...it, officer_status: it.status }]));
  for (const item of batch.invoice_handover_items ?? []) byId.set(String(item.so_id), { invoice_no: item.invoice_no, officer_status: item.officer_status });
  return (
    <>
      {closed ? (
        <div data-testid="driver-closed" style={{ margin: "18px 20px 0", padding: 16, borderRadius: 18, background: C.greenBg, color: C.green, fontSize: 16, fontWeight: 700 }}>
          {t.tripClosedHint}
        </div>
      ) : (
        <div data-testid="driver-give-invoices" style={{ margin: "18px 20px 0", padding: 16, borderRadius: 18, background: C.ink, color: C.card }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{t.giveInvoices}</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginTop: 6 }}>{t.giveInvoicesHint}</div>
        </div>
      )}
      <div data-testid="driver-invoice-list" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 20px" }}>
        {state.orders.map((eff) => {
          const o = eff.order;
          const item = byId.get(eff.so_id);
          const invoice = item?.invoice_no ?? o.workflow?.stop?.invoice_no ?? null;
          const title = isTo(o) ? o.so_number : invoice ? t.invoiceN(invoice) : t.noInvoiceNo;
          const sub = isTo(o) ? o.customer_name : `${o.so_number} · ${o.customer_name}`;
          const st = handoverStatusLabel(t, item?.officer_status, closed);
          return (
            <div key={eff.so_id} style={{ background: C.card, borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>{title}</div>
                <div style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
                <OrderProofs order={o} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: st.color, whiteSpace: "nowrap" }}>{st.text}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- Delivered sheet (screen 5) = check-out ----------

type Mode = "delivered" | "partial" | "failed";

function outcomeValue(options: string[] | null | undefined, mode: Mode): string {
  const list = options ?? [];
  const re = mode === "delivered" ? /^deliver/i : mode === "partial" ? /^partial/i : /^fail/i;
  return list.find((o) => re.test(o.trim())) ?? (mode === "delivered" ? "Delivered" : mode === "partial" ? "Partially delivered" : "Failed");
}

const KNOWN_KEYS = new Set([INVOICE_KEY, "outcome", "reason", "notes"]);

function DeliveredSheet({ open, onClose, batch, eff, state, templates, scope, onSaved }: { open: boolean; onClose: () => void; batch: BatchDetail; eff: EffectiveOrder; state: EffectiveBatch; templates: Templates; scope: DriverScope; onSaved: () => void }) {
  const t = useT();
  const actions = useTripActions(scope, batch.batch_id);
  const o = eff.order;
  const to = isTo(o);
  const photoOn = Boolean(batch.photo_storage_enabled ?? templates.photo_storage_enabled);
  const template = templates.delivery_checkout;
  const items = useMemo(() => checkoutItemsForOrder(usableItems(template.items, photoOn), o.order_type), [template, photoOn, o.order_type]);
  const outcomeItem = items.find((i) => i.key === "outcome") ?? null;
  const [mode, setMode] = useState<Mode>("delivered");
  const init = useMemo(() => initialCheckoutForm(items, o), [items, o]);
  const invoiceLocked = init.locked.has(INVOICE_KEY);
  const [values, setValues] = useState<FormValues>(() => {
    const v = { ...init.values };
    if (!to && o.invoice_no_prefill && !init.locked.has(INVOICE_KEY)) v[INVOICE_KEY] = o.invoice_no_prefill;
    return v;
  });
  const [reasonIdx, setReasonIdx] = useState<number | null>(null);
  const [otherText, setOtherText] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [general, setGeneral] = useState<string | null>(null);

  const reasons = mode === "partial" ? t.reasonsPartial : t.reasonsFailed;
  const reasonsEn = mode === "partial" ? DICTS.en.reasonsPartial : DICTS.en.reasonsFailed;
  const reasonText = reasonIdx === null ? "" : reasonIdx === reasonsEn.length - 1 ? otherText.trim() : reasonsEn[reasonIdx];
  const current: FormValues = { ...values, ...(outcomeItem ? { outcome: outcomeValue(outcomeItem.options, mode) } : {}), ...(mode !== "delivered" ? { reason: reasonText } : { reason: "" }) };
  const photoItem = items.find((i) => (i.item_type === "photo") && isItemVisible(i, items, current)) ?? null;
  const photoRequired = photoItem ? isItemRequired(photoItem, items, current) : false;
  const extras = items.filter((i) => !KNOWN_KEYS.has(i.key) && i !== photoItem && isItemVisible(i, items, current) && isItemRequired(i, items, current));
  const invoiceItem = items.find((i) => i.key === INVOICE_KEY) ?? null;
  const stopIndex = state.orders.findIndex((x) => x.so_id === eff.so_id) + 1;
  const set = (k: string, v: FormValue) => {
    setValues((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      if (!(k in p)) return p;
      const n = { ...p };
      delete n[k];
      return n;
    });
  };

  const submit = async () => {
    setGeneral(null);
    const errs = validateCheckout(items, current);
    const shown: FieldErrors = {};
    for (const [k, msg] of Object.entries(errs)) {
      if (k === INVOICE_KEY) shown[k] = /digit/i.test(msg) ? t.digitsOnly : t.needInvoice;
      else if (photoItem && k === photoItem.key) shown[k] = t.needPhoto;
      else if (k === "reason") shown[k] = t.needReason;
      else shown[k] = driverMessage(msg, t);
    }
    setErrors(shown);
    if (Object.keys(shown).length > 0) return;
    const built = buildCheckoutAnswers(items, current, newIdempotencyKey);
    const out = await actions.run({
      kind: "check_out",
      so_id: eff.so_id,
      label: `Delivered ${o.so_number}`,
      path: driverApi.paths.checkOut(batch.batch_id, eff.so_id),
      extra: { template_id: template.id, answers: built.answers },
      blobs: built.blobs,
      doneMessage: `${o.so_number} ✓`,
    });
    if (!out) return;
    if (out.status === "done" || out.status === "queued") {
      onSaved();
      return;
    }
    if (out.status === "rejected") {
      if (isRemovedByDispatch(out.info.code)) {
        onClose();
        return;
      }
      const mapped = mapServerErrors(out.info.errors, items);
      setErrors(Object.fromEntries(Object.entries(mapped.fields).map(([k, message]) => [k, driverMessage(message, t)])));
      setGeneral(driverMessage([out.info.message, ...mapped.general].join(" "), t));
    }
  };

  const busy = actions.busy;
  const context = (
    <>
      <div style={{ fontSize: 14, opacity: 0.85 }}>{t.stopKofN(batch.vehicle, stopIndex, state.total)}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, overflowWrap: "anywhere" }}>{o.customer_name}</div>
      {o.workflow?.stop?.checkin_at && (
        <div style={{ display: "inline-flex", marginTop: 10, padding: "5px 10px", borderRadius: 999, background: C.greenBg, color: C.green, fontSize: 13, fontWeight: 700 }}>{t.arrived(formatClock(o.workflow.stop.checkin_at))}</div>
      )}
    </>
  );

  const invoiceField = to ? (
    <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, fontWeight: 700 }}>
      {isPo(o) ? t.poNumber : t.toNumber}
      <input data-testid="driver-invoice-input" type="text" readOnly value={o.invoice_no_prefill ?? o.order_reference ?? o.so_number} style={{ height: 58, borderRadius: 14, border: `1.5px solid ${C.field}`, background: C.soft, padding: "0 16px", fontSize: 22, fontWeight: 700, letterSpacing: "0.04em", fontFamily: "inherit", color: C.body, width: "100%", boxSizing: "border-box" }} />
    </label>
  ) : invoiceItem ? (
    <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, fontWeight: 700 }}>
      {t.invoiceOrDr}
      <input
        data-testid="driver-invoice-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={typeof values[INVOICE_KEY] === "string" ? (values[INVOICE_KEY] as string) : ""}
        readOnly={invoiceLocked}
        onChange={(e) => set(INVOICE_KEY, e.target.value.replace(/[^0-9]/g, ""))}
        style={{ height: 58, borderRadius: 14, border: `1.5px solid ${errors[INVOICE_KEY] ? C.so : C.ink}`, background: invoiceLocked ? C.soft : C.card, padding: "0 16px", fontSize: 22, fontWeight: 700, letterSpacing: "0.04em", fontFamily: "inherit", color: C.ink, width: "100%", boxSizing: "border-box" }}
      />
      <FieldError>{errors[INVOICE_KEY]}</FieldError>
    </label>
  ) : null;

  const photoBlock = photoItem ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <FieldLabel>{photoRequired ? t.photoOfDelivery : t.photoOptional}</FieldLabel>
      <PhotoTiles value={values[photoItem.key]} onChange={(v) => set(photoItem.key, v)} context={{ batch_id: batch.batch_id, so_id: eff.so_id, so_number: o.so_number, field_key: photoItem.key, kind: mode }} />
      <FieldError>{errors[photoItem.key]}</FieldError>
    </div>
  ) : !photoOn ? (
    <div data-testid="driver-photo-not-available" style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>
      {t.photoNotAvailable}
    </div>
  ) : null;

  return (
    <Sheet open={open} onClose={onClose} busy={busy} context={context} testId="driver-delivered-sheet">
      <SheetTitle>{mode === "delivered" ? t.deliveredQ : t.notFullyTitle}</SheetTitle>
      {mode !== "delivered" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <Pill height={52} on={mode === "partial"} onClick={() => (setMode("partial"), setReasonIdx(null))} testId="driver-outcome-partial">
            {t.partial}
          </Pill>
          <Pill height={52} on={mode === "failed"} onClick={() => (setMode("failed"), setReasonIdx(null))} testId="driver-outcome-failed">
            {t.failed}
          </Pill>
        </div>
      )}
      {invoiceField}
      {mode !== "delivered" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FieldLabel>{t.whatHappened}</FieldLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {reasons.map((r, i) => (
              <Pill key={r} on={reasonIdx === i} onClick={() => setReasonIdx(i)} testId={`driver-reason-${i}`}>
                {r}
              </Pill>
            ))}
          </div>
          {reasonIdx === reasons.length - 1 && <input type="text" value={otherText} placeholder={t.otherReason} onChange={(e) => setOtherText(e.target.value)} style={fieldInput} data-testid="driver-reason-other" />}
          <FieldError>{errors.reason}</FieldError>
        </div>
      )}
      {photoBlock}
      {extras.map((item) => (
        <TemplateField key={item.key} item={item} value={values[item.key]} onChange={(v) => set(item.key, v)} required error={errors[item.key]} />
      ))}
      {general && <FieldError>{general}</FieldError>}
      <PrimaryButton icon="check" height={62} fontSize={19} disabled={busy || !actions.ready} onClick={() => void submit()} testId="driver-delivered-submit">
        {busy ? t.saving : mode === "delivered" ? t.deliveredBtn : t.saveOutcome}
      </PrimaryButton>
      {outcomeItem && (
        <TextButton testId="driver-not-fully" onClick={() => (mode === "delivered" ? (setMode("partial"), setReasonIdx(null)) : setMode("delivered"))} disabled={busy}>
          {mode === "delivered" ? t.notFullyDelivered : t.backToDelivered}
        </TextButton>
      )}
    </Sheet>
  );
}

// ---------- Problem? sheet (goes to /api/driver/issues as before) ----------

const ISSUE_CHOICES: Array<{ cat: string; icon: typeof Clock; priority: "normal" | "high" }> = [
  { cat: "Customer unavailable", icon: UserX, priority: "normal" },
  { cat: "Incorrect address", icon: MapPinOff, priority: "normal" },
  { cat: "Damaged goods", icon: PackageOpen, priority: "normal" },
  { cat: "Missing goods", icon: PackageX, priority: "normal" },
  { cat: "Delivery delay", icon: Clock, priority: "normal" },
  { cat: "Vehicle breakdown", icon: Truck, priority: "high" },
  { cat: "Refrigeration or cargo handling", icon: Snowflake, priority: "high" },
  { cat: "Other", icon: CircleHelp, priority: "normal" },
];

function ProblemSheet({ open, onClose, batch, orders, defaultSoId, photoOn, scope }: { open: boolean; onClose: () => void; batch: BatchDetail; orders: EffectiveOrder[]; defaultSoId: string | null; photoOn: boolean; scope: DriverScope }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [cat, setCat] = useState<string | null>(null);
  const [soId, setSoId] = useState<string | null>(defaultSoId);
  const [photo, setPhoto] = useState<FormValue>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const actions = useTripActions(scope, batch.batch_id);
  const key = useRef(newIdempotencyKey());
  const photoKey = useRef(newIdempotencyKey());
  useEffect(() => {
    if (open) {
      setSoId(defaultSoId);
      setErr(null);
    }
  }, [open, defaultSoId]);

  const send = async () => {
    if (!cat || busy) {
      if (!cat) setErr(t.needReason);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const choice = ISSUE_CHOICES.find((c) => c.cat === cat);
      const description = note.trim().length >= 5 ? note.trim() : `${cat}${note.trim() ? `: ${note.trim()}` : ""}`;
      const blobs = photo && typeof photo === "object" && "blob" in photo ? [{ ...photo, field_key: "photo_ids", server_field_key: "issue_photo", upload_key: photo.upload_key ?? photoKey.current }] : [];
      const out = await actions.run({ kind: "issue", label: t.problemKind, path: driverApi.paths.issues, so_id: soId, blobs,
        extra: { idempotency_key: key.current, category: cat, priority: choice?.priority ?? "normal", description, batch_id: batch.batch_id, so_id: soId, photo_ids: [] }, doneMessage: t.sent });
      if (!out || (out.status !== "done" && out.status !== "queued")) return;
      key.current = newIdempotencyKey();
      photoKey.current = newIdempotencyKey();
      setCat(null);
      setPhoto(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["driver-alerts"] });
      onClose();
    } catch (e) {
      const info = errorInfo(e);
      setErr(info.network ? t.noSignal : isRemovedByDispatch(info.code) ? t.orderRemovedByDispatch : info.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} busy={busy} testId="driver-problem-sheet">
      <SheetTitle sub={t.problemHint}>{t.problemTitle}</SheetTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {ISSUE_CHOICES.map(({ cat: c, icon: I }) => {
          const on = cat === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              data-testid={`driver-problem-${c.split(" ")[0].toLowerCase()}`}
              onClick={() => setCat(c)}
              style={{ minHeight: 84, borderRadius: 14, border: on ? `1.5px solid ${C.ink}` : `1px solid ${C.field}`, background: on ? C.ink : C.card, color: on ? C.card : C.ink, fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 4px", lineHeight: 1.2, cursor: "pointer" }}
            >
              <I size={24} strokeWidth={2} aria-hidden="true" />
              {t.issueCats[c] ?? c}
            </button>
          );
        })}
      </div>
      {orders.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FieldLabel>{t.whichOrder}</FieldLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill on={soId === null} onClick={() => setSoId(null)}>
              {t.wholeTrip}
            </Pill>
            {orders.map((o) => (
              <Pill key={o.so_id} on={soId === o.so_id} onClick={() => setSoId(o.so_id)}>
                {o.order.so_number}
              </Pill>
            ))}
          </div>
        </div>
      )}
      {photoOn ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FieldLabel>{t.photoOptional}</FieldLabel>
          <PhotoTiles value={photo} onChange={setPhoto} testId="driver-problem-photo" context={{ batch_id: batch.batch_id, so_id: soId, so_number: orders.find(o => o.so_id === soId)?.order.so_number, field_key: "issue_photo", kind: "problem" }} />
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>{t.photoNotAvailable}</div>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <FieldLabel>{t.addNote}</FieldLabel>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} style={{ ...fieldInput, height: "auto", padding: "12px 16px" }} data-testid="driver-problem-note" />
      </label>
      {err && <FieldError>{err}</FieldError>}
      <PrimaryButton icon="arrowRight" height={62} fontSize={19} disabled={busy} onClick={() => void send()} testId="driver-problem-send">
        {busy ? t.saving : t.send}
      </PrimaryButton>
      <TextButton onClick={onClose} disabled={busy}>
        {t.cancel}
      </TextButton>
    </Sheet>
  );
}

// ---------- the screen ----------

type SheetName = "start" | "deliver" | "end" | "problem" | null;

function TripBody({ batch, state, scope, readOnly, backHref, backLabel, offline, savedAt }: { batch: BatchDetail; state: EffectiveBatch; scope: DriverScope; readOnly: boolean; backHref: string; backLabel: string; offline: boolean; savedAt: number | null }) {
  const t = useT();
  const me = useDriverMe(scope);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const actions = useTripActions(scope, batch.batch_id);
  const templates = useTemplatesQuery(scope);
  // Same GET .../route as before; now also read before the start so an active trip can open its full route in Google Maps.
  const active = !readOnly && (state.status === "on_trip" || state.status === "pending");
  const route = useRouteQuery(scope, batch.batch_id, active);
  const routeInfo = route.data?.data as RouteInfo | undefined;
  const fullRouteUrl = active ? routeInfo?.maps_links?.[0]?.url ?? null : null;
  const partners = partnersOf(batch, me.data);
  const handover = useQuery<AutoHandover | undefined>({ queryKey: handoverKey(batch.batch_id), queryFn: () => queryClient.getQueryData<AutoHandover>(handoverKey(batch.batch_id)), enabled: false, initialData: () => queryClient.getQueryData<AutoHandover>(handoverKey(batch.batch_id)) });
  const [sheet, setSheet] = useState<SheetName>(null);
  const step = tripStep(state);
  const current = currentStop(state.orders);
  const tpl: Templates | undefined = templates.data?.data;
  const photoOn = Boolean(batch.photo_storage_enabled ?? tpl?.photo_storage_enabled);
  const busy = actions.busy || !actions.ready;
  const today = queryClient.getQueryData<Cached<DriverToday>>(["driver-today", scope.adminDriverId])?.data;
  const changes = [...(batch.dispatch_changes ?? []), ...(today?.dispatch_changes ?? []).filter((c) => !(batch.dispatch_changes ?? []).some((b) => b.at === c.at && b.so_id === c.so_id))];

  // The Delivered sheet's order was removed by dispatch while open: close it and say so.
  useEffect(() => {
    if (sheet === "deliver" && (!current || current.stopStatus !== "checked_in")) setSheet(null);
  }, [sheet, current]);

  const routeStop = current ? routeInfo?.stops.find((s) => String(s.so_id) === current.so_id) ?? null : null;
  const navUrl = current ? directionsUrl(current.order, routeStop) : null;

  let bar: ReactNode = null;
  if (readOnly) {
    bar = null;
  } else if (step === "acknowledge") {
    bar = (
      <>
        {/* Acknowledging happens only in the Acknowledge tab: this button takes the driver there, on this trip. */}
        <PrimaryButton icon="check" onClick={() => setLocation(acknowledgePath(scope.adminDriverId, { batch: batch.batch_id }))} testId="driver-ack-all">
          {t.acknowledgeOrders}
        </PrimaryButton>
        <TextButton onClick={() => setSheet("problem")} testId="driver-problem">
          {t.problemWithOrder}
        </TextButton>
      </>
    );
  } else if (step === "start") {
    bar = (
      <>
        <PrimaryButton icon="play" disabled={busy} onClick={() => setSheet("start")} testId="driver-start-trip">
          {t.startTrip}
        </PrimaryButton>
        <TextButton onClick={() => setSheet("problem")} testId="driver-problem">
          {t.problem}
        </TextButton>
      </>
    );
  } else if (step === "arrive" && current) {
    bar = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <OutlineButton icon="navigate" href={navUrl ?? undefined} external fontSize={17} disabled={!navUrl} testId="driver-navigate">
            {t.navigate}
          </OutlineButton>
          <PrimaryButton icon="pin" fontSize={17} disabled={busy} onClick={() => void actions.checkIn(current.so_id, current.order.so_number)} testId="driver-im-here">
            {actions.busy ? "..." : t.imHere}
          </PrimaryButton>
        </div>
        <TextButton onClick={() => setSheet("problem")} testId="driver-problem">
          {t.problem}
        </TextButton>
      </>
    );
  } else if (step === "deliver" && current) {
    bar = (
      <>
        <PrimaryButton icon="check" disabled={busy || !tpl} onClick={() => setSheet("deliver")} testId="driver-delivered">
          {t.deliveredBtn}
        </PrimaryButton>
        <TextButton onClick={() => setSheet("problem")} testId="driver-problem">
          {t.problem}
        </TextButton>
      </>
    );
  } else if (step === "end") {
    bar = (
      <>
        <PrimaryButton icon="warehouse" disabled={busy} onClick={() => setSheet("end")} testId="driver-end-trip">
          {t.endTrip}
        </PrimaryButton>
        <TextButton onClick={() => setSheet("problem")} testId="driver-problem">
          {t.problem}
        </TextButton>
      </>
    );
  }
  if (step === "waiting" || step === "closed") {
    bar = (
      <OutlineButton href={backHref} testId="driver-back-today">
        {backLabel}
      </OutlineButton>
    );
  }

  return (
    <>
      <Header batch={batch} state={state} t={t} backHref={backHref} backLabel={backLabel} me={me.data} done={step === "waiting" || step === "closed" ? <DoneTop batch={batch} state={state} t={t} /> : undefined} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 20px 0" }}>
        {scope.isAdmin && <Banner tone="blue">{t.adminReadOnly}</Banner>}
        <DispatchBanners changes={changes} batchId={batch.batch_id} />
        <OfflineNote offline={offline} savedAt={savedAt} />
      </div>
      {step === "waiting" || step === "closed" ? <DoneView batch={batch} state={state} t={t} handover={handover.data} /> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 20px 0" }}>
        <Metrics batch={batch} state={state} t={t} />
        {fullRouteUrl && (
          <OutlineButton icon="navigate" href={fullRouteUrl} external height={52} fontSize={16} testId="driver-full-route">
            {t.viewRouteNavigate}
          </OutlineButton>
        )}
      </div>
      {step === "acknowledge" && !readOnly ? (
        <AckList state={state} t={t} />
      ) : (
        <div style={{ padding: "18px 20px 0" }}>
          <Timeline batch={batch} state={state} t={t} current={current} warehouse={routeInfo?.origin?.name ?? me.data?.warehouse ?? null} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 20px 20px" }}>
        <OrderSummary state={state} t={t} />
        {partners.map((p) => (
          <PersonRow key={String(p.id)} person={p} t={t} boxed />
        ))}
        {step !== "waiting" && step !== "closed" && step !== "acknowledge" && <Documents state={state} t={t} />}
      </div>
      <div style={{ flexGrow: 1 }} />
      {bar && <ActionBar>{bar}</ActionBar>}

      {!readOnly && (
        <>
          <ConfirmSheet
            open={sheet === "start"}
            testId="driver-start-sheet"
            title={t.startTripNow}
            sub={t.startHint(state.total)}
            confirmLabel={t.start}
            icon="play"
            busy={actions.busy}
            onClose={() => setSheet(null)}
            onConfirm={async () => {
              await actions.start();
              setSheet(null);
            }}
          />
          <ConfirmSheet
            open={sheet === "end"}
            testId="driver-end-sheet"
            title={t.endTripNow}
            sub={t.endHint}
            confirmLabel={t.endBtn}
            icon="warehouse"
            busy={actions.busy}
            onClose={() => setSheet(null)}
            onConfirm={async () => {
              await actions.end();
              setSheet(null);
              window.scrollTo(0, 0);
            }}
          />
          {sheet === "deliver" && current && tpl && (
            <DeliveredSheet
              key={current.so_id}
              open
              onClose={() => setSheet(null)}
              batch={batch}
              eff={current}
              state={state}
              templates={tpl}
              scope={scope}
              onSaved={() => {
                // Auto-advance: the next stop becomes the current one as soon as this one is checked out.
                setSheet(null);
                window.scrollTo(0, 0);
              }}
            />
          )}
          <ProblemSheet scope={scope} open={sheet === "problem"} onClose={() => setSheet(null)} batch={batch} orders={state.orders} defaultSoId={current?.so_id ?? (state.orders.length === 1 ? state.orders[0].so_id : null)} photoOn={photoOn} />
        </>
      )}
    </>
  );
}

function RemovedState({ backHref, t }: { backHref: string; t: Dict }) {
  return (
    <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <Banner testId="driver-dispatch-trip_removed">{t.removedTrip}</Banner>
      <div style={{ fontSize: 15, color: C.sub }}>{t.tripGone}</div>
      <OutlineButton href={backHref}>{t.backToToday}</OutlineButton>
    </div>
  );
}

export default function DriverTripScreen() {
  const { batch_id: batchId } = useParams<{ batch_id: string }>();
  const [params] = useSearchParams();
  const t = useT();
  const scope = useDriverScope();
  const fromHistory = params.get("from") === "history";
  const detail = useAssignmentQuery(scope, batchId, !fromHistory);
  const queue = useOfflineQueue();
  const batch = detail.data?.data;
  const state = useMemo(() => (batch ? deriveBatchState(batch, queue.entries) : null), [batch, queue.entries]);
  const readOnly = !actionsEnabled(scope, batch) || fromHistory;
  const backHref = withDriverParams(fromHistory ? "/driver/history" : "/driver/today", { driver_id: scope.adminDriverId });
  const backLabel = fromHistory ? t.backToHistory : t.backToToday;
  const err = detail.isError ? errorInfo(detail.error) : null;
  const removed = Boolean(err && (err.status === 404 || err.code === "trip_removed" || err.code === "not_found"));

  let body: ReactNode;
  if (scope.missingDriverId)
    body = (
      <div style={{ padding: "20px" }}>
        <MissingDriverNotice />
      </div>
    );
  else if (removed && !fromHistory) body = <RemovedState backHref={backHref} t={t} />;
  else if (batch && state)
    body = <TripBody batch={batch} state={state} scope={scope} readOnly={readOnly} backHref={backHref} backLabel={backLabel} offline={Boolean(detail.data?.offline)} savedAt={detail.data?.saved_at ?? null} />;
  else if (detail.isError)
    body = (
      <div style={{ padding: "20px" }}>
        <ErrorState message={errorText(detail.error)} onRetry={() => void detail.refetch()} />
      </div>
    );
  else
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20 }} aria-busy="true">
        <Skeleton height={140} radius={20} />
        <Skeleton height={220} radius={20} />
      </div>
    );

  return (
    <DriverLayout scope={scope} testId="driver-trip">
      {body}
    </DriverLayout>
  );
}

