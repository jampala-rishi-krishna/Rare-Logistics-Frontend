import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { progressLabel, progressPct, stateTone, staleLabel, timeAgo } from "@/lib/overview";
import { matchesSearch } from "@/lib/overviewView";
import { formatKgPartial } from "@/lib/kgDisplay";
import { Chip, Empty, ErrorNote, Skeleton } from "./shared";
import DriverPanel from "./DriverPanel";

export interface TopFilter {
  date: string;
  warehouse: string;
  status: string;
  search: string;
}

const POLL = { refetchInterval: 15_000, refetchIntervalInBackground: false } as const;

function Row({ row, selected, onSelect }: { row: overviewApi.BoardRow; selected: boolean; onSelect: () => void }) {
  const stale = staleLabel(row);
  const pct = progressPct(row.progress);
  const kg = formatKgPartial(row.kg ?? null, row.kg_unknown_lines ?? 0, 1);
  return (
    <li>
      <button type="button" onClick={onSelect} aria-pressed={selected} data-testid={`live-row-${row.staff_id}`} className={`block w-full rounded-[8px] border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 ${selected ? "border-black bg-[#fafaf8] shadow-[inset_3px_0_0_#000]" : "border-[#e4e3df] bg-white hover:border-[#b8b7b2] hover:bg-[#fafaf8]"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{row.name}</div>
            <div className="truncate text-xs text-[#55565a]">
              {row.vehicle ?? "No vehicle"}
              {row.role === "helper" ? " · helper" : ""}
              {(row.batch_count ?? 0) > 1 ? ` · ${row.batch_count} trips` : ""}
            </div>
          </div>
          <Chip tone={stateTone(row.state)}>{row.state_label ?? row.state}</Chip>
        </div>
        {row.state !== "idle" && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#55565a]">
              <span>
                {progressLabel(row.progress)} SOs done {"·"} {row.acknowledged ?? 0} acknowledged
              </span>
              <span>{kg.text}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#e4e3df]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-1 rounded-full bg-[#1e7b44]" style={{ width: `${pct}%` }} />
            </div>
            {kg.note && <div className="mt-0.5 text-[10px] text-[#8a5a00]">{kg.note}</div>}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#77787b]">
          <span className="min-w-0 truncate">{row.last_action ? `${row.last_action.label} · ${timeAgo(row.last_action.at)}` : "No recent update"}</span>
          {stale && <Chip tone="bad">{stale}</Chip>}
        </div>
      </button>
    </li>
  );
}

export default function LiveTab({ filter }: { filter: TopFilter }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");
  const base = { date: filter.date, warehouse: filter.warehouse || undefined };
  const board = useQuery({ queryKey: ["overview-board", filter.date, filter.warehouse, filter.status], queryFn: () => overviewApi.getBoard({ ...base, status: filter.status || undefined }), ...POLL });
  const rows = useMemo(() => (board.data?.rows ?? []).filter((r) => matchesSearch({ name: r.name, vehicle: r.vehicle, so_numbers: r.so_numbers }, filter.search) && matchesSearch({ name: r.name, vehicle: r.vehicle, so_numbers: r.so_numbers }, listSearch)), [board.data, filter.search, listSearch]);
  const chosen = rows.find((r) => String(r.staff_id) === selected) ?? null;

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[340px_minmax(0,1fr)]" data-testid="live-tab">
      <section className="flex min-w-0 flex-col gap-2 lg:max-h-[calc(100vh-305px)]" aria-label="Drivers">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Drivers ({rows.length})</h2>
          <span className="text-[11px] text-[#77787b]">Live monitor</span>
        </div>
        <label className="relative block">
          <span className="sr-only">Search drivers</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#77787b]" />
          <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Search drivers" className="h-9 w-full rounded-[6px] border border-[#d8d7d2] bg-white pl-8 pr-2.5 text-[13px] outline-none focus:border-black focus:ring-2 focus:ring-black/10" data-testid="live-search" />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {board.isLoading ? (
          <Skeleton className="h-40" />
        ) : board.isError ? (
          <ErrorNote error={board.error} onRetry={() => void board.refetch()} />
        ) : rows.length === 0 ? (
          <Empty>{filter.search || filter.status || listSearch ? "No driver matches these filters." : "No drivers or assignments for this day."}</Empty>
        ) : (
          <ul className="grid gap-2" data-testid="live-list">
            {rows.map((r) => (
              <Row key={String(r.staff_id)} row={r} selected={String(r.staff_id) === selected} onSelect={() => setSelected(String(r.staff_id) === selected ? null : String(r.staff_id))} />
            ))}
          </ul>
        )}
        </div>
      </section>

      <section className="min-w-0 rounded-[8px] border border-[#e4e3df] bg-[#fafaf8] p-4 lg:self-start lg:max-h-[calc(100vh-305px)] lg:overflow-y-auto" aria-label="Selected driver">
        {chosen ? (
          <DriverPanel key={String(chosen.staff_id)} row={chosen} staffId={chosen.staff_id} date={filter.date} onClose={() => setSelected(null)} />
        ) : (
          <div className="grid min-h-[220px] place-items-center px-6 py-10 text-center" data-testid="panel-empty">
            <div>
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-[#d8d7d2] bg-white text-[#55565a]">
                <ClipboardList size={18} />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-black">Select a driver</h3>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-[#55565a]">View trip progress, delivery activity and operational exceptions.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
