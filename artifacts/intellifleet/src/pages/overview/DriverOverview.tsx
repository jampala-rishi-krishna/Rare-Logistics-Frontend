import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as overviewApi from "@/services/api/overview";
import * as dispatchApi from "@/services/api/dispatch";
import {
  DEFAULT_STALE_MINUTES,
  STALE_STORAGE_KEY,
  STATUS_FILTERS,
  isValidRange,
  kpiCards,
  manilaDate,
  parseStaleMinutes,
  type Tone,
} from "@/lib/overview";
import BoardTab from "./BoardTab";
import MapTab from "./MapTab";
import ExportTab from "./ExportTab";
import ChecklistTab from "./ChecklistTab";
import { Empty, ErrorNote, inputClass } from "./shared";

const POLL_MS = 30_000;
type Tab = "board" | "map" | "drivers" | "export" | "checklist";
const TABS: Array<[Tab, string]> = [
  ["board", "Board"],
  ["map", "Map"],
  ["drivers", "Drivers"],
  ["export", "Export"],
  ["checklist", "Checklist settings"],
];

function readStale(): number {
  try {
    return parseStaleMinutes(window.localStorage.getItem(STALE_STORAGE_KEY));
  } catch {
    return DEFAULT_STALE_MINUTES;
  }
}

const KPI_TONE: Record<Tone, string> = {
  good: "text-[#1e7b44]",
  warn: "text-[#8a5a00]",
  bad: "text-[#c4291f]",
  info: "text-[#1d4ed8]",
  neutral: "text-black",
};

export default function DriverOverview() {
  const today = manilaDate();
  const [tab, setTab] = useState<Tab>("board");
  const [mode, setMode] = useState<"day" | "range">("day");
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [warehouse, setWarehouse] = useState("");
  const [driverId, setDriverId] = useState("");
  const [status, setStatus] = useState("");
  const [stale, setStale] = useState<number>(readStale);

  useEffect(() => {
    try {
      window.localStorage.setItem(STALE_STORAGE_KEY, String(stale));
    } catch {
      /* storage unavailable: the setting just is not remembered */
    }
  }, [stale]);

  const rangeOk = mode === "day" || isValidRange(from, to);
  const range = mode === "day" ? { from: date, to: date } : { from, to };
  const baseFilter: overviewApi.OverviewFilter = useMemo(
    () => ({
      ...(mode === "day" ? { date } : { from, to }),
      warehouse: warehouse || undefined,
      driver_id: driverId || undefined,
    }),
    [mode, date, from, to, warehouse, driverId],
  );

  // Interval polling pauses while the tab is hidden and refetches when it becomes visible again.
  const summary = useQuery({
    queryKey: ["driver-overview", "summary", baseFilter],
    queryFn: () => overviewApi.getSummary(baseFilter),
    enabled: rangeOk,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  // The board is a single-day view; for a range it shows the range end.
  const boardDate = mode === "day" ? date : to;
  const board = useQuery({
    queryKey: ["driver-overview", "board", { ...baseFilter, date: boardDate, status, stale }],
    queryFn: () =>
      overviewApi.getBoard({
        date: boardDate,
        warehouse: warehouse || undefined,
        driver_id: driverId || undefined,
        status: status || undefined,
        stale_minutes: stale,
      }),
    enabled: rangeOk,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const staff = useQuery({ queryKey: ["dispatch-staff-all"], queryFn: () => dispatchApi.listStaff(), staleTime: 10 * 60_000, retry: 1 });
  const driverOptions = useMemo(() => {
    const fromStaff = (staff.data ?? []).filter((s) => s.active && /driver/i.test(s.title ?? "")).map((s) => ({ id: String(s.id), name: s.name }));
    if (fromStaff.length > 0) return fromStaff;
    return (board.data?.rows ?? []).filter((r) => r.role === "driver").map((r) => ({ id: String(r.staff_id), name: r.name }));
  }, [staff.data, board.data]);

  const cards = summary.data ? kpiCards(summary.data.kpis) : [];
  const groups = ["Drivers", "Sales orders", "Handover"] as const;
  const drivers = (board.data?.rows ?? []).filter((r) => r.role === "driver");

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 border border-[#e4e3df] bg-white p-3" aria-label="Filters">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <label className="grid gap-1 text-xs font-semibold">
            Dates
            <select value={mode} onChange={(e) => setMode(e.target.value as "day" | "range")} className={inputClass}>
              <option value="day">Single day</option>
              <option value="range">Date range</option>
            </select>
          </label>
          {mode === "day" ? (
            <label className="grid gap-1 text-xs font-semibold">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value || today)} className={inputClass} />
            </label>
          ) : (
            <>
              <label className="grid gap-1 text-xs font-semibold">
                From
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                To
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </label>
            </>
          )}
          <label className="grid gap-1 text-xs font-semibold">
            Warehouse
            <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className={inputClass}>
              <option value="">All</option>
              <option value="METS">METS</option>
              <option value="GLACIER">GLACIER</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Driver
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputClass}>
              <option value="">All drivers</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Stale after (min)
            <input
              type="number"
              min={1}
              max={1440}
              value={stale}
              onChange={(e) => setStale(parseStaleMinutes(e.target.value))}
              className={inputClass}
              data-testid="stale-minutes"
            />
          </label>
        </div>
        {!rangeOk && <div className="text-xs text-[#86000B]">The From date must not be after the To date.</div>}
        {mode === "range" && rangeOk && <div className="text-xs text-[#77787b]">The live board shows the range end date ({to}); KPIs and the map cover the whole range.</div>}
      </section>

      {summary.isError ? (
        <ErrorNote error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <section className="grid gap-3 lg:grid-cols-3" aria-label="Key figures">
          {groups.map((g) => (
            <div key={g} className="border border-[#e4e3df] bg-white p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#77787b]">{g}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {summary.isLoading
                  ? Array.from({ length: g === "Handover" ? 2 : g === "Drivers" ? 4 : 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse bg-[#f2f2ef]" />)
                  : cards
                      .filter((c) => c.group === g)
                      .map((c) => (
                        <div key={c.id} data-testid={`kpi-${c.id}`}>
                          <div className={`text-2xl font-bold ${KPI_TONE[c.tone]}`}>{c.value}</div>
                          <div className="text-xs text-[#55565a]">
                            {c.label}
                            {c.hint ? <span className="text-[#77787b]"> ({c.hint})</span> : null}
                          </div>
                        </div>
                      ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-[#e4e3df]" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`overview-tab-${id}`}
            className={`min-h-[40px] shrink-0 border-b-2 px-3 text-sm font-semibold ${tab === id ? "border-black" : "border-transparent text-[#77787b]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "board" && (
        <BoardTab rows={board.data?.rows ?? []} isLoading={board.isLoading} error={board.isError ? board.error : null} onRetry={() => void board.refetch()} range={range} />
      )}
      {tab === "map" && (rangeOk ? <MapTab filter={baseFilter} /> : <Empty>Pick a valid date range.</Empty>)}
      {tab === "drivers" && (
        <div className="overflow-x-auto border border-[#e4e3df] bg-white">
          {board.isError ? (
            <div className="p-3">
              <ErrorNote error={board.error} onRetry={() => void board.refetch()} />
            </div>
          ) : drivers.length === 0 ? (
            <Empty>No drivers match these filters.</Empty>
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-[#f2f2ef] text-xs uppercase text-[#55565a]">
                <tr>
                  <th className="px-3 py-2">Driver</th>
                  <th>Warehouse</th>
                  <th>Vehicle</th>
                  <th>State</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((r) => (
                  <tr key={String(r.staff_id)} className="border-t border-[#efeeeb]">
                    <td className="px-3 py-2 font-semibold">{r.name}</td>
                    <td>{r.warehouse ?? "-"}</td>
                    <td className="font-mono text-xs">{r.vehicle ?? "-"}</td>
                    <td>{r.state.replaceAll("_", " ")}</td>
                    <td>{r.progress && r.progress.total > 0 ? `${r.progress.done} of ${r.progress.total}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === "export" && <ExportTab defaultFrom={range.from} defaultTo={range.to} warehouse={warehouse} driverId={driverId} />}
      {tab === "checklist" && <ChecklistTab />}
    </div>
  );
}
