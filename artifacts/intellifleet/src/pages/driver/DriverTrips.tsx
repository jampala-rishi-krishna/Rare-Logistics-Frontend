import { useState } from "react";
import { Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight } from "lucide-react";
import * as driverApi from "@/services/api/driver";
import { formatShortDate, validateDateRange, withDriverParams } from "@/lib/driver";
import { historyStatus, routeText, tripLabel } from "@/lib/tripCards";
import type { Batch, HistoryFilter } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { ErrorState, KgValue, MissingDriverNotice, PacksValue, Skeleton, errorText, useDriverMe, useDriverScope } from "./shared";

type Mode = "7" | "30" | "custom";
const FILTERS: Array<{ value: HistoryFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];
const PAGE_SIZE = 10;

const TONE: Record<string, string> = {
  done: "border-[#33673B]/30 bg-[#f1f8f2] text-[#33673B]",
  warn: "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]",
  bad: "border-[#86000B]/30 bg-[#fff4f4] text-[#86000B]",
  idle: "border-[#d8d7d2] bg-[#f7f7f4] text-[#55565a]",
};

function TripRow({ batch, adminDriverId }: { batch: Batch; adminDriverId: string | null }) {
  const status = historyStatus(batch);
  const label = tripLabel(batch);
  const route = routeText(batch);
  return (
    <li>
      <Link
        href={withDriverParams(`/driver/assignment/${encodeURIComponent(batch.batch_id)}`, { from: "history", driver_id: adminDriverId })}
        data-testid={`driver-trip-${batch.batch_id}`}
        className="block border border-[#e4e3df] bg-white p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-lg font-bold">{batch.vehicle}</div>
            {route && <div className="break-words text-sm text-[#55565a]">{route}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className={`inline-flex border px-2 py-0.5 text-[11px] font-bold ${TONE[status.tone]}`}>{status.label}</span>
            <ChevronRight size={18} className="text-[#77787b]" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Orders</div>
            <div className="font-semibold">{batch.so_count}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Total</div>
            <KgValue kg={batch.total_kg} unknownLines={batch.kg_unknown_lines} className="font-semibold" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Packs</div>
            <div className="font-semibold">
              <PacksValue packs={batch.total_packs} />
            </div>
          </div>
          <div className="text-right text-xs text-[#55565a]">
            {formatShortDate(batch.delivery_date)}
            {label && <div>{label}</div>}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default function DriverTrips() {
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [mode, setMode] = useState<Mode>("7");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [rangeError, setRangeError] = useState("");

  const range: driverApi.HistoryRange | null = mode === "7" ? { days: 7 } : mode === "30" ? { days: 30 } : applied;
  const enabled = !scope.sessionLoading && !scope.missingDriverId && range !== null;
  const trips = useInfiniteQuery({
    queryKey: ["driver-trips", scope.adminDriverId, range, filter],
    queryFn: ({ pageParam }) => driverApi.getHistoryPage({ range: range as driverApi.HistoryRange, status: filter, page: pageParam, pageSize: PAGE_SIZE }, scope.adminDriverId),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    enabled,
    retry: 1,
  });

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateDateRange(fromInput, toInput);
    if (problem) {
      setRangeError(problem);
      return;
    }
    setRangeError("");
    setApplied({ from: fromInput, to: toInput });
  };

  const items = trips.data?.pages.flatMap((p) => p.batches) ?? [];
  const total = trips.data?.pages[0]?.total ?? 0;
  const chip = (active: boolean) => `min-h-[48px] flex-1 border-b-2 px-3 text-sm font-semibold ${active ? "border-black text-black" : "border-transparent text-[#77787b]"}`;
  const rangeChip = (value: Mode, label: string) => (
    <button type="button" key={value} onClick={() => setMode(value)} aria-pressed={mode === value} className={`min-h-[48px] border px-4 text-sm font-semibold ${mode === value ? "border-black bg-black !text-white" : "border-[#d8d7d2] bg-white"}`}>
      {label}
    </button>
  );

  return (
    <DriverLayout scope={scope} name={me.data?.name ?? null}>
      <h1 className="text-2xl font-bold leading-tight">Trips</h1>
      <p className="mt-1 text-sm text-[#55565a]">Past trips. Today&apos;s work is on the Today tab.</p>
      {scope.missingDriverId ? (
        <div className="mt-4">
          <MissingDriverNotice />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Trip status" className="mt-4 flex border-b border-[#e4e3df]">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" role="tab" aria-selected={filter === f.value} data-testid={`driver-filter-${f.value}`} onClick={() => setFilter(f.value)} className={chip(filter === f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CalendarDays size={18} className="text-[#55565a]" aria-hidden="true" />
            {rangeChip("7", "Last 7 days")}
            {rangeChip("30", "Last 30 days")}
            {rangeChip("custom", "Date range")}
          </div>
          {mode === "custom" && (
            <form onSubmit={apply} className="mt-3 grid grid-cols-2 gap-2 border border-[#e4e3df] bg-white p-3">
              <label className="grid gap-1 text-xs font-semibold">
                From
                <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} data-testid="driver-range-from" className="min-h-[48px] border border-[#d8d7d2] px-2 text-base" />
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                To
                <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} data-testid="driver-range-to" className="min-h-[48px] border border-[#d8d7d2] px-2 text-base" />
              </label>
              {rangeError && (
                <p role="alert" className="col-span-2 text-sm font-semibold text-[#86000B]">
                  {rangeError}
                </p>
              )}
              <button type="submit" data-testid="driver-range-apply" className="col-span-2 min-h-[48px] bg-black text-sm font-bold !text-white">
                Show trips
              </button>
            </form>
          )}

          <div className="mt-4">
            {range === null ? (
              <p className="border border-[#e4e3df] bg-white p-5 text-sm text-[#55565a]">Pick a start and end date, then press Show trips.</p>
            ) : trips.isLoading ? (
              <div className="grid gap-3" aria-busy="true">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : trips.isError && items.length === 0 ? (
              <ErrorState message={errorText(trips.error)} onRetry={() => void trips.refetch()} />
            ) : items.length === 0 ? (
              <p data-testid="driver-trips-empty" className="border border-[#e4e3df] bg-white p-6 text-center text-sm font-semibold">
                {filter === "all" ? "No trips in this period." : filter === "failed" ? "No failed trips in this period." : "No completed trips in this period."}
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-[#55565a]" data-testid="driver-trips-count">
                  Showing {items.length} of {total}
                </p>
                <ul className="grid gap-3" data-testid="driver-trips-list">
                  {items.map((b) => (
                    <TripRow key={b.batch_id} batch={b} adminDriverId={scope.adminDriverId} />
                  ))}
                </ul>
                {trips.hasNextPage && (
                  <button type="button" disabled={trips.isFetchingNextPage} onClick={() => void trips.fetchNextPage()} data-testid="driver-trips-more" className="mt-3 min-h-[52px] w-full border border-black bg-white text-sm font-bold disabled:opacity-50">
                    {trips.isFetchingNextPage ? "Loading..." : "Load more"}
                  </button>
                )}
                {trips.isError && <p className="mt-2 text-xs text-[#86000B]">Could not load more just now.</p>}
              </>
            )}
          </div>
        </>
      )}
    </DriverLayout>
  );
}
