import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, FileText, PackageCheck, Phone, Route, Scale, X } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { telHref } from "@/lib/driver";
import { formatDuration, manilaDate, progressPct, staleLabel, stateTone, timeAgo } from "@/lib/overview";
import { formatKgPartial } from "@/lib/kgDisplay";
import { PRIORITY_TONE } from "@/lib/overviewView";
import { Avatar, Chip, ErrorNote, Skeleton, StatusChip, fmtDateTime, inputClass } from "./shared";
import TripTimeline, { RecentActivityCard, StopsTimelineCard, isDelivered, useTrip } from "./TripTimeline";

type Sub = "overview" | "stops" | "orders" | "invoices" | "issues";

function Kpi({ icon, title, children, testId }: { icon: ReactNode; title: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[8px] border border-[#e4e3df] bg-white p-3.5" data-testid={testId}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef3fc] text-[#1d4ed8]" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-[#77787b]">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e4e3df]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-1.5 rounded-full bg-[#16a34a]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function IssuesCard({ mine }: { mine: overviewApi.IssueRow[] }) {
  return (
    <section className="min-w-0 rounded-[8px] border border-[#e4e3df] bg-white p-4" aria-label="Operational issues" data-testid={mine.length > 0 ? "panel-issues" : "panel-no-issues"}>
      <h3 className="mb-3 text-sm font-bold">Operational issues</h3>
      {mine.length === 0 ? (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf6f0] text-[#1e7b44]" aria-hidden="true">
            <Check size={18} />
          </span>
          <div>
            <div className="text-[13px] font-semibold">No open issues</div>
            <div className="text-[12px] text-[#77787b]">All clear for this trip.</div>
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          {mine.map((i) => (
            <div key={i.id} className="rounded-[6px] border border-[#f0d9a8] bg-[#fff6e5] p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-mono font-bold">{i.reference}</span>
                <Chip tone={PRIORITY_TONE[i.priority] ?? "neutral"}>{i.priority}</Chip>
                <span className="font-semibold">{i.category}</span>
              </div>
              <p className="mt-1 break-words">{i.description}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function InvoicesList({ orders }: { orders: overviewApi.TimelineOrder[] }) {
  const rows = orders.map((o) => ({ o, invoice: o.stop?.checkout?.invoice_no ?? o.handover?.invoice_no ?? null })).filter((r) => r.invoice);
  if (rows.length === 0) return <p className="rounded-[8px] border border-[#e4e3df] bg-white p-4 text-center text-sm text-[#55565a]">No invoices or delivery receipts recorded for this trip yet.</p>;
  return (
    <ul className="grid gap-2" data-testid="panel-invoices">
      {rows.map(({ o, invoice }) => {
        const h = o.handover;
        return (
          <li key={o.so_id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#e4e3df] bg-white px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">Invoice/DR {invoice}</div>
              <div className="truncate text-[11px] text-[#77787b]">
                {o.customer_name ?? "—"} · <span className="font-mono">{o.so_number}</span>
              </div>
            </div>
            {h ? <Chip tone={h.handed_over ? "good" : "warn"}>{h.officer_status && h.officer_status !== "pending" ? `Officer: ${h.officer_status}` : h.handed_over ? "Handed over" : "Not handed over"}</Chip> : <Chip>Not yet handed over</Chip>}
          </li>
        );
      })}
    </ul>
  );
}

export default function DriverPanel({ staffId, date, onClose, row }: { staffId: number | string; date: string; onClose?: () => void; row?: overviewApi.BoardRow }) {
  const [mode, setMode] = useState<"day" | "history">("day");
  const [from, setFrom] = useState(manilaDate(new Date(), -6));
  const [to, setTo] = useState(manilaDate());
  const [picked, setPicked] = useState<string | null>(null);
  const [sub, setSub] = useState<Sub>("overview");
  const range = mode === "day" ? { from: date, to: date } : { from, to };
  const rangeOk = mode === "day" || (from !== "" && to !== "" && from <= to);
  const detail = useQuery({
    queryKey: ["overview-driver", String(staffId), range.from, range.to],
    queryFn: () => overviewApi.getDriver(staffId, range),
    enabled: rangeOk,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const issues = useQuery({ queryKey: ["overview-issues", "open"], queryFn: () => overviewApi.getIssues("open"), refetchInterval: 30_000, refetchIntervalInBackground: false });
  const mine = (issues.data?.issues ?? []).filter((i) => String(i.reporter.staff_id) === String(staffId));
  const person = detail.data?.person;
  const batches = detail.data?.batches ?? [];
  const active = batches.find((b) => b.batch_id === picked) ?? batches.find((b) => b.batch_id === row?.batch_id) ?? batches[0] ?? null;
  const activeIdx = active ? batches.findIndex((b) => b.batch_id === active.batch_id) : -1;
  useEffect(() => setPicked(null), [mode]);

  const trip = useTrip(active?.batch_id ?? "");
  const tripQ = active ? trip : null;
  const orders = tripQ?.data?.orders ?? [];
  const events = tripQ?.data?.events ?? [];

  // Crew of the shown trip: helpers assigned with this driver (or, for a helper, the driver they ride with).
  const uniq = (names: unknown[]) => [...new Set(names.filter((n): n is string => typeof n === "string" && n.trim() !== ""))];
  const helperNames = uniq(active && active.role === "driver" && Array.isArray(active.helpers) ? (active.helpers as unknown[]) : []);
  const driverNames = uniq([active && active.role === "helper" ? (active.driver as { name?: string } | undefined)?.name : null]);
  const tel = telHref(typeof person?.phone === "string" ? person.phone : null);
  const name = String(person?.name ?? row?.name ?? `Staff #${staffId}`);
  const boardTrip = row?.trips?.find((t) => t.batch_id === active?.batch_id) ?? null;
  const tripNo = boardTrip ? `Trip ${boardTrip.trip_number} of ${boardTrip.trips_on_date}` : batches.length > 1 && mode === "day" ? `Trip ${activeIdx + 1} of ${batches.length}` : batches.length === 1 && mode === "day" ? "Trip 1 of 1" : null;
  const vehicle = String(active?.vehicle ?? row?.vehicle ?? "") || null;
  const stale = row ? staleLabel(row) : null;
  const noRecent = row ? !row.last_action || Boolean(stale) : false;

  // KPI numbers: all derived from the selected trip's stops.
  const total = orders.length;
  const done = orders.filter((o) => o.stop?.checkout).length;
  const delivered = orders.filter(isDelivered).length;
  const partial = orders.filter((o) => (o.stop?.checkout?.outcome ?? "").toLowerCase().startsWith("partial")).length;
  const failed = orders.filter((o) => /^(failed|returned)/i.test(o.stop?.checkout?.outcome ?? "")).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : progressPct(row?.progress);
  const kg = boardTrip ? formatKgPartial(boardTrip.kg, boardTrip.kg_unknown_lines, 1) : formatKgPartial(row?.kg ?? null, row?.kg_unknown_lines ?? 0, 1);
  const t = tripQ?.data?.trip;
  const invoiceCount = orders.filter((o) => o.stop?.checkout?.invoice_no ?? o.handover?.invoice_no).length;
  const subTabs: Array<[Sub, string]> = [
    ["overview", "Overview"],
    ["stops", `Stops (${total})`],
    ["orders", `Sales Orders (${total})`],
    ["invoices", `Invoices (${invoiceCount})`],
    ["issues", `Issues (${mine.length})`],
  ];
  const segBtn = (on: boolean) => `h-7 px-2.5 text-xs font-semibold ${on ? "bg-[#1d4ed8] text-white" : "bg-white text-[#55565a] hover:bg-[#efefed]"}`;

  return (
    <aside className="@container flex min-w-0 flex-col gap-3" aria-label="Driver detail" data-testid="driver-panel">
      <div className="rounded-[8px] border border-[#e4e3df] bg-white p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Avatar name={name} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold leading-tight" data-testid="panel-name">
                  {name}
                </h2>
                {row && <StatusChip tone={stateTone(row.state)}>{row.state_label ?? row.state}</StatusChip>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-[#55565a]">
                {vehicle && <span>Vehicle: <span className="font-mono font-semibold text-black">{vehicle}</span></span>}
                {tripNo && <span>· {tripNo}</span>}
                {helperNames.length > 0 && <span data-testid="panel-helpers">· Helper{helperNames.length === 1 ? "" : "s"}: <span className="font-semibold text-black">{helperNames.join(", ")}</span></span>}
                {driverNames.length > 0 && <span data-testid="panel-driver">· Driver: <span className="font-semibold text-black">{driverNames.join(", ")}</span></span>}
                {!vehicle && !tripNo && <span className="capitalize">{String(person?.role ?? row?.role ?? "")}{person?.warehouse ? ` · ${String(person.warehouse)}` : ""}</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {row && (
              <div className="flex items-center gap-2 text-[11px] text-[#77787b]">
                <span>{row.last_action ? `Last update ${timeAgo(row.last_action.at)}` : ""}</span>
                {noRecent && <span title={stale ?? undefined}><Chip tone="bad">No recent update</Chip></span>}
              </div>
            )}
            <div className="flex items-center gap-1">
              <div className="inline-flex overflow-hidden rounded-[6px] border border-[#d8d7d2]" role="group" aria-label="Period">
                <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")} className={segBtn(mode === "day")}>Day</button>
                <button type="button" aria-pressed={mode === "history"} onClick={() => setMode("history")} data-testid="panel-history" className={`border-l border-[#d8d7d2] ${segBtn(mode === "history")}`}>History</button>
              </div>
              {tel && (
                <a href={tel} aria-label="Call" className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#d8d7d2] bg-white hover:bg-[#efefed] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40">
                  <Phone size={14} />
                </a>
              )}
              {onClose && (
                <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#d8d7d2] bg-white hover:bg-[#efefed] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        {mode === "history" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" className={`${inputClass} !h-8 !w-auto`} />
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" className={`${inputClass} !h-8 !w-auto`} />
          </div>
        )}
        {(batches.length > 1 || (mode === "history" && batches.length > 0)) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Trips">
            {batches.map((b) => {
              const on = b.batch_id === active?.batch_id;
              return (
                <button key={b.batch_id} type="button" aria-pressed={on} onClick={() => setPicked(b.batch_id)} data-testid={`panel-trip-${b.batch_id}`} className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${on ? "border-[#1d4ed8] bg-[#eef3fc] text-[#1d4ed8]" : "border-[#d8d7d2] bg-white text-[#55565a] hover:bg-[#efefed]"}`}>
                  <span className="font-mono">{String(b.vehicle ?? "-")}</span>
                  {mode === "history" && <span className="font-normal">{String(b.delivery_date ?? "")}</span>}
                  <span className="font-normal">{String(b.trip?.chip_label ?? "")}</span>
                </button>
              );
            })}
          </div>
        )}
        <div role="tablist" aria-label="Driver sections" className="-mb-3.5 mt-3 flex flex-wrap gap-x-1 overflow-x-auto border-t border-[#efeeeb]">
          {subTabs.map(([id, text]) => (
            <button key={id} type="button" role="tab" aria-selected={sub === id} data-testid={`panel-tab-${id}`} onClick={() => setSub(id)} className={`-mb-px inline-flex h-10 items-center whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 ${sub === id ? "border-[#1d4ed8] text-[#1d4ed8]" : "border-transparent text-[#77787b] hover:text-black"}`}>
              {text}
            </button>
          ))}
        </div>
      </div>
      {!rangeOk && <p className="text-xs font-semibold text-[#86000B]">The start date must be on or before the end date.</p>}

      {detail.isLoading ? (
        <div className="grid gap-2" aria-busy="true" data-testid="panel-loading"><Skeleton className="h-16" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : detail.isError ? (
        <ErrorNote error={detail.error} onRetry={() => void detail.refetch()} />
      ) : !active ? (
        <>
          <p className="rounded-[8px] border border-[#e4e3df] bg-white p-4 text-center text-sm text-[#55565a]">No trips in this period.</p>
          {(sub === "issues" || sub === "overview") && <IssuesCard mine={mine} />}
        </>
      ) : tripQ?.isLoading ? (
        <div className="grid gap-2" aria-busy="true"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>
      ) : tripQ?.isError ? (
        <ErrorNote error={tripQ.error} onRetry={() => void tripQ.refetch()} />
      ) : (
        <>
          {sub === "overview" && (
            <>
              <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4" data-testid="panel-live-metrics">
                <Kpi icon={<Route size={18} />} title="Trip progress">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold tabular-nums"><span className="text-[#16a34a]">{done} / {total}</span> <span className="font-normal text-[#55565a]">Stops completed</span></span>
                    <span className="text-[13px] font-bold text-[#16a34a] tabular-nums">{pct}%</span>
                  </div>
                  <Bar pct={pct} />
                </Kpi>
                <Kpi icon={<PackageCheck size={18} />} title="Sales orders">
                  <div className="whitespace-nowrap text-[13px] font-semibold tabular-nums">
                    {delivered} / {total} <span className="font-normal text-[#55565a]">Delivered</span>
                    <span className="ml-3">{Math.max(0, total - done)} <span className="font-normal text-[#55565a]">Pending</span></span>
                  </div>
                  {(partial > 0 || failed > 0) && <div className="mt-0.5 text-[11px] text-[#8a5a00]">{partial} partial · {failed} failed</div>}
                </Kpi>
                <Kpi icon={<Scale size={18} />} title="Total weight">
                  <div className="text-[13px] font-semibold tabular-nums">{kg.text}</div>
                  {kg.note && <div className="text-[10px] text-[#8a5a00]">{kg.note}</div>}
                </Kpi>
                <Kpi icon={<CalendarClock size={18} />} title="Started">
                  <div className="text-[13px] font-semibold">{fmtDateTime(t?.started_at)}</div>
                  <div className="text-[11px] text-[#77787b]">Trip time {formatDuration(t?.duration_minutes ?? null)}</div>
                </Kpi>
              </div>
              <div className="grid gap-3 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <StopsTimelineCard orders={orders} />
                <div className="grid min-w-0 content-start gap-3">
                  <RecentActivityCard events={events} />
                  <IssuesCard mine={mine} />
                </div>
              </div>
            </>
          )}
          {sub === "stops" && <StopsTimelineCard orders={orders} />}
          {sub === "orders" && <TripTimeline batchId={active.batch_id} />}
          {sub === "invoices" && <InvoicesList orders={orders} />}
          {sub === "issues" && <IssuesCard mine={mine} />}
          <p className="text-[11px] text-[#77787b]"><FileText size={11} className="mr-1 inline" />Updated {fmtDateTime(new Date().toISOString())}. Refreshes every 15 seconds while this tab is visible.</p>
        </>
      )}
    </aside>
  );
}
