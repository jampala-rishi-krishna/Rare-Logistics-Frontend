import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, X } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { telHref } from "@/lib/driver";
import { formatDuration, manilaDate, progressLabel, progressPct, staleLabel, stateTone, timeAgo } from "@/lib/overview";
import { formatKgPartial } from "@/lib/kgDisplay";
import { PRIORITY_TONE } from "@/lib/overviewView";
import { Chip, ErrorNote, Skeleton, fmtDateTime, inputClass } from "./shared";
import TripTimeline from "./TripTimeline";

function Total({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-[#e4e3df] bg-white px-3 py-2">
      <div className="text-lg font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 truncate text-[11px] font-medium text-[#77787b]">{label}</div>
    </div>
  );
}

export default function DriverPanel({ staffId, date, onClose, row }: { staffId: number | string; date: string; onClose?: () => void; row?: overviewApi.BoardRow }) {
  const [mode, setMode] = useState<"day" | "history">("day");
  const [from, setFrom] = useState(manilaDate(new Date(), -6));
  const [to, setTo] = useState(manilaDate());
  const [open, setOpen] = useState<string | null>(null);
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
  const totals = (detail.data?.totals ?? {}) as Record<string, number | null>;
  const batches = detail.data?.batches ?? [];
  // Crew of the shown trips: the helpers assigned with this driver (or, when this person is a helper, the driver they ride with).
  const uniq = (names: unknown[]) => [...new Set(names.filter((n): n is string => typeof n === "string" && n.trim() !== ""))];
  const helperNames = uniq(batches.flatMap((b) => (b.role === "driver" && Array.isArray(b.helpers) ? (b.helpers as unknown[]) : [])));
  const driverNames = uniq(batches.map((b) => (b.role === "helper" ? (b.driver as { name?: string } | undefined)?.name : null)));
  const tel = telHref(typeof person?.phone === "string" ? person.phone : null);
  const expanded = open ?? (mode === "day" && batches.length === 1 ? batches[0].batch_id : null);

  return (
    <aside className="flex min-w-0 flex-col gap-3" aria-label="Driver detail" data-testid="driver-panel">
      <div className="flex items-start justify-between gap-3 rounded-[8px] border border-[#e4e3df] bg-white p-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold" data-testid="panel-name">
              {String(person?.name ?? row?.name ?? `Staff #${staffId}`)}
            </h2>
            {row && <Chip tone={stateTone(row.state)}>{row.state_label ?? row.state}</Chip>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#55565a]">
            <span className="capitalize">{String(person?.role ?? row?.role ?? "")}{person?.warehouse ? ` · ${String(person.warehouse)}` : ""}</span>
            {row && <span>Vehicle: <span className="font-mono font-semibold text-black">{row.vehicle ?? "—"}</span></span>}
            {row && (row.batch_count ?? 0) > 0 && <span>{row.batch_count} {row.batch_count === 1 ? "trip" : "trips"}</span>}
            {helperNames.length > 0 && <span data-testid="panel-helpers">Helper{helperNames.length === 1 ? "" : "s"}: <span className="font-semibold text-black">{helperNames.join(", ")}</span></span>}
            {driverNames.length > 0 && <span data-testid="panel-driver">Driver: <span className="font-semibold text-black">{driverNames.join(", ")}</span></span>}
          </div>
          {row && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#77787b]">
              <span>{row.last_action ? `Last update ${timeAgo(row.last_action.at)} · ${row.last_action.label}` : "No recent update"}</span>
              {staleLabel(row) && <Chip tone="warn">{staleLabel(row)}</Chip>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {tel && (
            <a href={tel} aria-label="Call" className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#d8d7d2] bg-white hover:bg-[#efefed] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30">
              <Phone size={15} />
            </a>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#d8d7d2] bg-white hover:bg-[#efefed] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {row && row.state !== "idle" && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="panel-live-metrics">
          <div className="rounded-[8px] border border-[#e4e3df] bg-white px-3 py-2">
            <div className="text-lg font-semibold leading-none tabular-nums">{progressLabel(row.progress)}</div>
            <div className="mt-1.5 text-[11px] font-medium text-[#77787b]">Trip progress (SOs done)</div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#e4e3df]" role="progressbar" aria-valuenow={progressPct(row.progress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-1 rounded-full bg-[#1e7b44]" style={{ width: `${progressPct(row.progress)}%` }} />
            </div>
          </div>
          <Total label="Pending SOs" value={row.progress ? Math.max(0, row.progress.total - row.progress.done) : "—"} />
          <Total label="Acknowledged" value={row.acknowledged ?? 0} />
          <div className="min-w-0 rounded-[8px] border border-[#e4e3df] bg-white px-3 py-2">
            <div className="text-lg font-semibold leading-none tabular-nums">{formatKgPartial(row.kg ?? null, row.kg_unknown_lines ?? 0, 1).text}</div>
            <div className="mt-1.5 truncate text-[11px] font-medium text-[#77787b]">Total weight</div>
            {formatKgPartial(row.kg ?? null, row.kg_unknown_lines ?? 0, 1).note && <div className="text-[10px] text-[#8a5a00]">{formatKgPartial(row.kg ?? null, row.kg_unknown_lines ?? 0, 1).note}</div>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
        <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")} className={`h-8 rounded-[6px] border px-3 text-xs font-semibold ${mode === "day" ? "border-black bg-black text-white" : "border-[#d8d7d2] bg-white hover:bg-[#efefed]"}`}>
          Selected day
        </button>
        <button type="button" aria-pressed={mode === "history"} onClick={() => setMode("history")} data-testid="panel-history" className={`h-8 rounded-[6px] border px-3 text-xs font-semibold ${mode === "history" ? "border-black bg-black text-white" : "border-[#d8d7d2] bg-white hover:bg-[#efefed]"}`}>
          History
        </button>
        {mode === "history" && (
          <>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" className={`${inputClass} !w-auto`} />
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" className={`${inputClass} !w-auto`} />
          </>
        )}
      </div>
      {!rangeOk && <p className="text-xs font-semibold text-[#86000B]">The start date must be on or before the end date.</p>}

      {detail.isLoading ? (
        <div className="grid gap-2" aria-busy="true" data-testid="panel-loading"><Skeleton className="h-16" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : detail.isError ? (
        <ErrorNote error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" data-testid="panel-totals">
            <Total label="Trips" value={Number(totals.batches ?? 0)} />
            <Total label="SOs" value={Number(totals.sos ?? 0)} />
            <Total label="Acknowledged" value={Number(totals.acknowledged ?? 0)} />
            <Total label="Delivered" value={Number(totals.delivered ?? 0)} />
            <Total label="Partial" value={Number(totals.partial ?? 0)} />
            <Total label="Failed" value={Number(totals.failed ?? 0)} />
            <Total label="Avg at site" value={formatDuration((totals.avg_minutes_at_stop as number | null) ?? null)} />
            <Total label="Trip time" value={formatDuration(Number(totals.trip_minutes ?? 0) || null)} />
          </div>

          {mine.length > 0 && (
            <section aria-label="Open issues" className="grid gap-1.5" data-testid="panel-issues">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#77787b]">Open issues</h3>
              {mine.map((i) => (
                <div key={i.id} className="border border-[#f0d9a8] bg-[#fff6e5] p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-mono font-bold">{i.reference}</span>
                    <Chip tone={PRIORITY_TONE[i.priority] ?? "neutral"}>{i.priority}</Chip>
                    <span className="font-semibold">{i.category}</span>
                  </div>
                  <p className="mt-1 break-words">{i.description}</p>
                </div>
              ))}
            </section>
          )}

          <section aria-label="Trips" className="grid gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#77787b]">{mode === "day" ? "Trips on this day" : "Trips in the period"}</h3>
            {batches.length === 0 ? (
              <p className="rounded-[8px] border border-[#e4e3df] bg-white p-4 text-center text-sm text-[#55565a]">No trips in this period.</p>
            ) : (
              batches.map((b) => {
                const trip = b.trip ?? {};
                const isOpen = expanded === b.batch_id;
                return (
                  <div key={b.batch_id} className="rounded-[8px] border border-[#e4e3df] bg-white" data-testid={`panel-trip-${b.batch_id}`}>
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : b.batch_id)} className="flex min-h-[44px] w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left">
                      <span className="min-w-0">
                        <span className="font-mono text-sm font-bold">{String(b.vehicle ?? "-")}</span>
                        <span className="ml-2 text-xs text-[#55565a]">
                          {String(b.delivery_date ?? "")} {"·"} {String((b as { so_count?: number }).so_count ?? "")} SOs {"·"} {String((b as { role?: string }).role ?? "")}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Chip tone={stateTone(String((trip as { chip?: string }).chip ?? ""))}>{String(trip.chip_label ?? "")}</Chip>
                        <span className="text-xs text-[#77787b]">{formatDuration((trip.duration_minutes as number | null | undefined) ?? null)}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[#e4e3df] p-2">
                        <TripTimeline batchId={b.batch_id} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
          <p className="text-[11px] text-[#77787b]">Updated {fmtDateTime(new Date().toISOString())}. Refreshes every 15 seconds while this tab is visible.</p>
        </>
      )}
    </aside>
  );
}
