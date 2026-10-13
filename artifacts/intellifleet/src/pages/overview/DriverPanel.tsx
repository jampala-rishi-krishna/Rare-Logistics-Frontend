import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, X } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { telHref } from "@/lib/driver";
import { formatDuration, manilaDate, stateTone } from "@/lib/overview";
import { PRIORITY_TONE } from "@/lib/overviewView";
import { Chip, ErrorNote, Skeleton, fmtDateTime, inputClass } from "./shared";
import TripTimeline from "./TripTimeline";

function Total({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 border border-[#e4e3df] bg-white px-2 py-1.5">
      <div className="text-base font-bold leading-none">{value}</div>
      <div className="mt-1 truncate text-[10px] font-semibold uppercase text-[#77787b]">{label}</div>
    </div>
  );
}

export default function DriverPanel({ staffId, date, onClose }: { staffId: number | string; date: string; onClose?: () => void }) {
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
  const tel = telHref(typeof person?.phone === "string" ? person.phone : null);
  const expanded = open ?? (mode === "day" && batches.length === 1 ? batches[0].batch_id : null);

  return (
    <aside className="flex min-w-0 flex-col gap-3" aria-label="Driver detail" data-testid="driver-panel">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold" data-testid="panel-name">
            {String(person?.name ?? `Staff #${staffId}`)}
          </h2>
          <div className="text-xs capitalize text-[#55565a]">
            {String(person?.role ?? "")} {person?.warehouse ? `· ${String(person.warehouse)}` : ""} {person?.title ? `· ${String(person.title)}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {tel && (
            <a href={tel} aria-label="Call" className="inline-flex h-9 w-9 items-center justify-center border border-[#d8d7d2] bg-white">
              <Phone size={15} />
            </a>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center border border-[#d8d7d2] bg-white">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
        <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")} className={`min-h-[34px] border px-3 text-xs font-semibold ${mode === "day" ? "border-black bg-black text-white" : "border-[#d8d7d2] bg-white"}`}>
          Selected day
        </button>
        <button type="button" aria-pressed={mode === "history"} onClick={() => setMode("history")} data-testid="panel-history" className={`min-h-[34px] border px-3 text-xs font-semibold ${mode === "history" ? "border-black bg-black text-white" : "border-[#d8d7d2] bg-white"}`}>
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
        <Skeleton className="h-24" />
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
              <h3 className="text-xs font-bold uppercase text-[#77787b]">Open issues</h3>
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
            <h3 className="text-xs font-bold uppercase text-[#77787b]">{mode === "day" ? "Trips on this day" : "Trips in the period"}</h3>
            {batches.length === 0 ? (
              <p className="border border-[#e4e3df] bg-white p-4 text-sm text-[#55565a]">No trips in this period.</p>
            ) : (
              batches.map((b) => {
                const trip = b.trip ?? {};
                const isOpen = expanded === b.batch_id;
                return (
                  <div key={b.batch_id} className="border border-[#e4e3df] bg-[#fafaf8]" data-testid={`panel-trip-${b.batch_id}`}>
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
