import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { STATUS_FILTERS, kpiCards, manilaDate } from "@/lib/overview";
import type { KpiCard, Tone } from "@/lib/overview";
import { formatKgPartial } from "@/lib/kgDisplay";
import ExportTab from "./ExportTab";
import HandoverTab from "./HandoverTab";
import IssuesTab from "./IssuesTab";
import LiveTab from "./LiveTab";
import TripsTab from "./TripsTab";
import type { TopFilter } from "./LiveTab";
import { ErrorNote, Skeleton, inputClass } from "./shared";

type Tab = "live" | "trips" | "handover" | "issues" | "export";
const TABS: Array<[Tab, string]> = [
  ["live", "Live"],
  ["trips", "Trips"],
  ["handover", "Invoices & handover"],
  ["issues", "Issues"],
  ["export", "Export CSV"],
];

const TONE: Record<Tone, string> = { good: "text-[#1e7b44]", warn: "text-[#8a5a00]", bad: "text-[#c4291f]", info: "text-[#1d4ed8]", neutral: "text-black" };

function Kpis({ cards, totals }: { cards: KpiCard[]; totals: { kg: string; note: string | null } | null }) {
  const groups: Array<KpiCard["group"]> = ["Drivers", "Sales orders", "Handover"];
  return (
    <section className="grid gap-2 lg:grid-cols-[auto_auto_auto]" aria-label="Key numbers" data-testid="kpi-strip">
      {groups.map((g) => (
        <div key={g} className="min-w-0 border border-[#e4e3df] bg-white p-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#77787b]">
            {g === "Drivers" ? "Drivers" : g === "Sales orders" ? "Sales orders" : "Handover and issues"}
            {g === "Sales orders" && totals ? ` · ${totals.kg}` : ""}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {cards
              .filter((c) => c.group === g)
              .map((c) => (
                <div key={c.id} data-testid={`kpi-${c.id}`} className="min-w-[64px]">
                  <div className={`text-xl font-bold leading-none ${TONE[c.tone]}`}>{c.value}</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-[#55565a]">
                    {c.label}
                    {c.hint ? <span className="font-normal text-[#77787b]"> ({c.hint})</span> : null}
                  </div>
                </div>
              ))}
          </div>
          {g === "Sales orders" && totals?.note && <div className="mt-1 text-[10px] text-[#8a5a00]">{totals.note}</div>}
        </div>
      ))}
    </section>
  );
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function DriverOverview() {
  const today = manilaDate();
  const [tab, setTab] = useState<Tab>("live");
  const [date, setDate] = useState(today);
  const [warehouse, setWarehouse] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const filter: TopFilter = { date, warehouse, status, search };
  const summary = useQuery({
    queryKey: ["overview-summary", date, warehouse],
    queryFn: () => overviewApi.getSummary({ date, warehouse: warehouse || undefined }),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const cards = summary.data ? kpiCards(summary.data.kpis) : [];
  const k = summary.data?.kpis;
  const kg = k ? formatKgPartial(k.kg ?? 0, k.kg_unknown_lines ?? 0, 0) : null;

  return (
    <div className="grid min-w-0 gap-3" data-testid="driver-overview">
      <div className="flex flex-wrap items-end gap-2 border border-[#e4e3df] bg-white p-2" role="search" aria-label="Filters">
        <div className="flex items-end gap-1">
          <button type="button" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))} className="inline-flex h-[38px] w-9 items-center justify-center border border-[#d8d7d2] bg-white">
            <ChevronLeft size={16} />
          </button>
          <label className="grid gap-1 text-[11px] font-semibold">
            Date (Manila)
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={`${inputClass} !w-auto`} data-testid="top-date" />
          </label>
          <button type="button" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))} className="inline-flex h-[38px] w-9 items-center justify-center border border-[#d8d7d2] bg-white">
            <ChevronRight size={16} />
          </button>
          {date !== today && (
            <button type="button" onClick={() => setDate(today)} className="h-[38px] border border-[#d8d7d2] bg-white px-3 text-sm font-semibold">
              Today
            </button>
          )}
        </div>
        <label className="grid gap-1 text-[11px] font-semibold">
          Warehouse
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className={`${inputClass} !w-auto`} data-testid="top-warehouse">
            <option value="">All</option>
            <option value="METS">METS</option>
            <option value="GLACIER">GLACIER</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-semibold">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} !w-auto`} data-testid="top-status">
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="relative grid min-w-[200px] flex-1 gap-1 text-[11px] font-semibold">
          Search driver, truck or SO
          <Search size={14} className="pointer-events-none absolute bottom-3 left-2.5 text-[#77787b]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, plate or SO number" className={`${inputClass} pl-8`} data-testid="top-search" />
        </label>
      </div>

      {summary.isLoading ? <Skeleton className="h-16" /> : summary.isError ? <ErrorNote error={summary.error} onRetry={() => void summary.refetch()} /> : <Kpis cards={cards} totals={kg ? { kg: kg.text, note: kg.note } : null} />}

      <div role="tablist" aria-label="Driver Overview sections" className="flex flex-wrap border-b border-[#e4e3df]">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)} className={`min-h-[40px] border-b-2 px-4 text-sm font-semibold ${tab === id ? "border-black text-black" : "border-transparent text-[#77787b] hover:text-black"}`}>
            {label}
            {id === "issues" && (k?.issues_open ?? 0) > 0 ? <span className="ml-1.5 rounded-full bg-[#8a5a00] px-1.5 text-[10px] text-white">{k?.issues_open}</span> : null}
          </button>
        ))}
      </div>

      {tab === "live" && <LiveTab filter={filter} />}
      {tab === "trips" && <TripsTab filter={filter} />}
      {tab === "handover" && <HandoverTab filter={filter} />}
      {tab === "issues" && <IssuesTab filter={filter} />}
      {tab === "export" && <ExportTab filter={filter} />}
    </div>
  );
}
