import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { formatDuration, isValidRange, progressLabel, progressPct, staleLabel, stateLabel, stateTone, timeAgo } from "@/lib/overview";
import { Chip, Empty, ErrorNote, buttonClass, inputClass } from "./shared";
import TripTimeline from "./TripTimeline";

export interface BoardProps {
  rows: overviewApi.BoardRow[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  range: { from: string; to: string };
}

function PersonCard({ row, onOpen }: { row: overviewApi.BoardRow; onOpen: () => void }) {
  const stale = staleLabel(row);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`board-${row.staff_id}`}
      className={`block w-full border bg-white p-3 text-left hover:bg-[#fafaf8] ${row.stale ? "border-[#e6b4b7]" : "border-[#e4e3df]"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Chip tone={row.role === "driver" ? "neutral" : "info"}>{row.role === "driver" ? "Driver" : "Helper"}</Chip>
            {row.warehouse && <span className="text-xs text-[#77787b]">{row.warehouse}</span>}
          </div>
        </div>
        <Chip tone={stateTone(row.state)}>{stateLabel(row.state)}</Chip>
      </div>
      {stale && (
        <div className="mt-2 border border-[#f0c4c7] bg-[#fff1f2] px-2 py-1 text-xs font-bold text-[#c4291f]" data-testid="stale-flag">
          {stale}
        </div>
      )}
      <div className="mt-3 grid gap-1 text-sm">
        <div>
          <span className="text-[#77787b]">Vehicle: </span>
          <span className="font-mono font-semibold">{row.vehicle ?? "-"}</span>
        </div>
        <div className="break-words">
          <span className="text-[#77787b]">Stop: </span>
          {row.current_stop ?? "-"}
        </div>
      </div>
      {row.progress && row.progress.total > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-[#55565a]">{progressLabel(row.progress)} stops done</div>
          <div className="h-2 w-full bg-[#efeeeb]" role="progressbar" aria-valuenow={progressPct(row.progress)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 bg-black" style={{ width: `${progressPct(row.progress)}%` }} />
          </div>
        </div>
      )}
      <div className="mt-3 grid gap-0.5 border-t border-[#efeeeb] pt-2 text-xs text-[#55565a]">
        <div className="break-words">
          Last action: {row.last_action ? `${row.last_action.label} - ${timeAgo(row.last_action.at)}` : "-"}
        </div>
        <div>Last GPS: {row.last_gps_at ? timeAgo(row.last_gps_at) : "-"}</div>
      </div>
    </button>
  );
}

function DetailPanel({ row, range, onClose }: { row: overviewApi.BoardRow; range: { from: string; to: string }; onClose: () => void }) {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [openBatch, setOpenBatch] = useState<string | null>(row.batch_id);
  useEffect(() => {
    setFrom(range.from);
    setTo(range.to);
    setOpenBatch(row.batch_id);
  }, [row.staff_id, row.batch_id, range.from, range.to]);
  const valid = isValidRange(from, to);
  const query = useQuery({
    queryKey: ["driver-overview", "driver", String(row.staff_id), from, to],
    queryFn: () => overviewApi.getDriver(row.staff_id, { from, to }),
    enabled: valid,
    retry: 1,
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const batches = query.data?.batches ?? [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={onClose} data-testid="driver-detail">
      <aside className="flex h-full w-full max-w-[720px] flex-col bg-[#fafaf8] shadow-2xl" role="dialog" aria-modal="true" aria-label={`Details for ${row.name}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[#e4e3df] bg-white p-4">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{row.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Chip>{row.role === "driver" ? "Driver" : "Helper"}</Chip>
              <Chip tone={stateTone(row.state)}>{stateLabel(row.state)}</Chip>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="p-2 hover:bg-[#efefed]">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-[#e4e3df] bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-xs font-semibold">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </label>
          <div className="col-span-2 self-end text-xs text-[#77787b] sm:col-span-1">{valid ? `${batches.length} batch${batches.length === 1 ? "" : "es"}` : "Pick a valid range"}</div>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto p-4">
          {!valid ? (
            <Empty>The From date must not be after the To date.</Empty>
          ) : query.isLoading ? (
            <Empty>Loading...</Empty>
          ) : query.isError ? (
            <ErrorNote error={query.error} onRetry={() => void query.refetch()} />
          ) : batches.length === 0 ? (
            <Empty>No batches in this range.</Empty>
          ) : (
            <div className="grid gap-3">
              {batches.map((b) => {
                const open = openBatch === b.batch_id;
                return (
                  <section key={b.batch_id} className="border border-[#e4e3df] bg-white">
                    <button type="button" onClick={() => setOpenBatch(open ? null : b.batch_id)} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left">
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-bold">{String(b.vehicle ?? "-")}</div>
                        <div className="text-xs text-[#77787b]">{b.delivery_date ?? ""}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {b.trip?.chip_label && <Chip tone="info">{b.trip.chip_label}</Chip>}
                        {b.trip?.duration_minutes !== undefined && b.trip.duration_minutes !== null && <Chip>{formatDuration(b.trip.duration_minutes)}</Chip>}
                        <span className="text-xs font-semibold">{open ? "Hide" : "Open"}</span>
                      </div>
                    </button>
                    {open && (
                      <div className="border-t border-[#efeeeb] bg-[#fafaf8] p-3">
                        <TripTimeline batchId={b.batch_id} />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-[#e4e3df] bg-white p-3">
          <button type="button" onClick={onClose} className={`${buttonClass} w-full sm:w-auto`}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function BoardTab({ rows, isLoading, error, onRetry, range }: BoardProps) {
  const [selected, setSelected] = useState<overviewApi.BoardRow | null>(null);
  if (isLoading) return <Empty>Loading board...</Empty>;
  if (error) return <ErrorNote error={error} onRetry={onRetry} />;
  if (rows.length === 0) return <Empty>No drivers or helpers match these filters.</Empty>;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map((row) => (
          <PersonCard key={`${row.role}-${row.staff_id}`} row={row} onOpen={() => setSelected(row)} />
        ))}
      </div>
      {selected && <DetailPanel row={selected} range={range} onClose={() => setSelected(null)} />}
    </>
  );
}
