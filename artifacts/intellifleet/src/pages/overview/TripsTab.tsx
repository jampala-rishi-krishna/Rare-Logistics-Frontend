import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as overviewApi from "@/services/api/overview";
import { formatDuration, isValidRange, manilaDate, stateTone } from "@/lib/overview";
import { matchesSearch } from "@/lib/overviewView";
import { formatKgPartial } from "@/lib/kgDisplay";
import { Chip, Empty, ErrorNote, Skeleton, fmtDateTime, inputClass } from "./shared";
import TripTimeline from "./TripTimeline";
import type { TopFilter } from "./LiveTab";

// Every trip (one row per assignment batch) in a date range, from the same shared read model as the app and Load Planning.
export default function TripsTab({ filter }: { filter: TopFilter }) {
  const [from, setFrom] = useState(manilaDate(new Date(), -6));
  const [to, setTo] = useState(manilaDate());
  const [open, setOpen] = useState<string | null>(null);
  const ok = isValidRange(from, to);
  const trips = useQuery({
    queryKey: ["overview-trips", from, to, filter.warehouse],
    queryFn: () => overviewApi.getTrips({ from, to, warehouse: filter.warehouse || undefined }),
    enabled: ok,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const rows = (trips.data?.trips ?? []).filter((t) => (!filter.status || t.state === filter.status) && matchesSearch({ name: t.driver_name ?? "", vehicle: t.vehicle, so_numbers: [] }, filter.search));
  const head = "px-2 py-2 text-left text-[11px] font-bold uppercase text-[#77787b]";
  const cell = "px-2 py-2 align-top text-sm";
  return (
    <section className="grid gap-3" data-testid="trips-tab">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputClass} data-testid="trips-from" />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} data-testid="trips-to" />
        </label>
        {trips.data && (
          <span className="pb-2 text-xs text-[#55565a]">
            {rows.length} of {trips.data.total} trips
          </span>
        )}
      </div>
      {!ok && <p className="text-sm font-semibold text-[#86000B]">The start date must be on or before the end date.</p>}
      {trips.isLoading ? (
        <Skeleton className="h-40" />
      ) : trips.isError ? (
        <ErrorNote error={trips.error} onRetry={() => void trips.refetch()} />
      ) : rows.length === 0 ? (
        <Empty>No trips in this period.</Empty>
      ) : (
        <div className="overflow-x-auto border border-[#e4e3df] bg-white">
          <table className="w-full min-w-[900px] border-collapse" data-testid="trips-table">
            <thead>
              <tr className="border-b border-[#e4e3df]">
                {["Date", "Driver", "Vehicle", "Status", "SOs", "Done", "Weight", "Packs", "Outcomes", "Trip length", "Started"].map((h) => (
                  <th key={h} className={head}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const kg = formatKgPartial(t.kg, t.kg_unknown_lines, 1);
                const isOpen = open === t.batch_id;
                return (
                  <Fragment key={t.batch_id}>
                    <tr className="cursor-pointer border-b border-[#efeeeb] hover:bg-[#fafaf8]" onClick={() => setOpen(isOpen ? null : t.batch_id)} data-testid={`trip-row-${t.batch_id}`}>
                      <td className={cell}>{t.date}</td>
                      <td className={cell}>
                        <div className="font-semibold">{t.driver_name ?? "-"}</div>
                        <div className="text-xs text-[#77787b]">{t.helpers.filter(Boolean).join(", ")}</div>
                      </td>
                      <td className={`${cell} font-mono`}>
                        {t.vehicle ?? "-"}
                        {t.trips_on_date > 1 ? <div className="font-sans text-xs text-[#77787b]">Trip {t.trip_number} of {t.trips_on_date}</div> : null}
                      </td>
                      <td className={cell}>
                        <Chip tone={stateTone(t.state)}>{t.state_label}</Chip>
                      </td>
                      <td className={cell}>{t.so_count}</td>
                      <td className={cell}>
                        {t.stops_done} / {t.so_count}
                      </td>
                      <td className={cell}>
                        {kg.text}
                        {kg.note && <div className="text-[10px] text-[#8a5a00]">{kg.note}</div>}
                      </td>
                      <td className={cell}>{t.packs === null ? "—" : t.packs}</td>
                      <td className={cell}>
                        <span className="text-[#1e7b44]">{t.delivered} delivered</span>
                        {t.partial > 0 && <span className="ml-1 text-[#8a5a00]">{t.partial} partial</span>}
                        {t.failed > 0 && <span className="ml-1 text-[#c4291f]">{t.failed} failed</span>}
                      </td>
                      <td className={cell}>{formatDuration(t.trip_minutes)}</td>
                      <td className={cell}>{fmtDateTime(t.started_at)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-[#e4e3df] bg-[#fafaf8]">
                        <td colSpan={11} className="p-3">
                          <TripTimeline batchId={t.batch_id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
