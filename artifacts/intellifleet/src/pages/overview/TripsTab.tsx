import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { groupByCrew, rowCrew, type BoardMode } from "@/lib/overviewCrew";
import type { TripRow, TripsResponse } from "@/services/api/overview";
import {
  durationText,
  formatKg,
  isRange,
  manilaDateTime,
  outcomesOf,
  railOf,
  sortTrips,
  tileLabel,
  tileOf,
  type UrlState,
} from "@/lib/overviewModel";
import {
  buttonClass,
  CallLink,
  ErrorLine,
  focusRing,
  Skeleton,
} from "./shared";
export function Rail({ row }: { row: Parameters<typeof railOf>[0] }) {
  const rail = railOf(row);
  return (
    <div
      aria-label={`Trip progress: ${rail.word}`}
      className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
    >
      {rail.steps.map((s, i) => (
        <span
          key={s.key}
          className={
            s.state === "todo" ? "text-muted-foreground" : "text-foreground"
          }
        >
          <strong>
            {s.state === "done" ? "✓" : `${i + 1}.`} {s.label}
          </strong>{" "}
          {s.sub}
        </span>
      ))}
      {rail.closed && <strong>✓ Closed</strong>}
    </div>
  );
}
export default function TripsTab({
  state,
  set,
  query,
  today,
  filters,
}: {
  state: UrlState;
  set: (p: Partial<UrlState>) => void;
  query: UseQueryResult<TripsResponse, Error>;
  today: string;
  filters: string[];
}) {
  const rows = sortTrips(query.data?.trips ?? []);
  const [board, setBoard] = useState<BoardMode>("driver");
  const open = (r: TripRow) =>
    set({
      trip: r.batch_id,
      stop: state.q.trim()
        ? (r.so_numbers?.find((n) =>
            n.toLowerCase().includes(state.q.trim().toLowerCase()),
          ) ?? "")
        : "",
    });
  const outcome = (r: TripRow) => {
    const o = outcomesOf(r);
    return `${o.delivered} delivered ? ${o.partial} partial ? ${o.failed} not delivered`;
  };
  return (
    <section className="grid min-w-0 gap-3" data-testid="trips-tab">
      <div
        role="group"
        aria-label="List the board by"
        className="flex justify-end gap-1"
        data-testid="board-mode"
      >
        {(["driver", "helper"] as const).map((m) => (
          <button
            key={m}
            className={buttonClass}
            aria-pressed={board === m}
            data-testid={`board-mode-${m}`}
            onClick={() => setBoard(m)}
          >
            {m === "driver" ? "By driver" : "By helper"}
          </button>
        ))}
      </div>
      {query.isError && (
        <ErrorLine error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.isLoading ? (
        <Skeleton className="h-48" />
      ) : !rows.length ? (
        <div className="rounded-lg border border-border p-6 text-center">
          <h2 className="font-semibold">No trips match these filters</h2>
          <p className="my-2 text-sm text-muted-foreground">
            {filters.join(" ? ")}
          </p>
          <button
            className={buttonClass}
            onClick={() =>
              set({ date: today, from: "", to: "", wh: "", q: "", tile: "" })
            }
          >
            Clear filters
          </button>
        </div>
      ) : (
        groupByCrew(rows, board).map((g) => (
          <div
            key={g.key}
            className="grid min-w-0 gap-2"
            data-testid={`${board}-group`}
          >
            <h2 className="flex flex-wrap items-baseline gap-2 font-semibold">
              {g.person ? (
                <CallLink
                  name={g.person.name}
                  role={board}
                  phone={g.person.phone}
                />
              ) : (
                g.label
              )}
              <span className="text-xs font-normal text-muted-foreground">
                {g.rows.length} trip{g.rows.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table
                className="w-full whitespace-nowrap text-left text-xs"
                aria-label={`${g.label} trips`}
              >
                <thead className="bg-muted">
                  <tr>
                    {[
                      "Date",
                      "Driver",
                      "Helper",
                      "Vehicle",
                      "Status",
                      "SOs",
                      "Done",
                      "Weight",
                      "Packs",
                      "Outcomes",
                      "Trip length",
                      "Started",
                    ].map((h) => (
                      <th key={h} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr
                      key={r.batch_id}
                      tabIndex={0}
                      onClick={() => open(r)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open(r);
                        }
                      }}
                      className={`cursor-pointer border-t border-border hover:bg-muted ${focusRing}`}
                      data-testid="trip-row"
                      aria-label={`Open ${r.vehicle ?? "truck"}, Trip ${r.trip_number}`}
                    >
                      {[
                        r.date,
                        rowCrew(r).driver?.name ?? "?",
                        rowCrew(r)
                          .helpers.map((h) => h.name)
                          .join(", ") || "?",
                        `${r.vehicle} ? Trip ${r.trip_number} of ${r.trips_on_date}`,
                        tileLabel(tileOf(r)),
                        r.so_count,
                        r.stops_done,
                        formatKg([r])?.text,
                        r.packs ?? "?",
                        outcome(r),
                        durationText(r.duration_minutes ?? r.trip_minutes),
                        manilaDateTime(r.started_at),
                      ].map((v, i) => (
                        <td key={i} className="p-3">
                          {i === 3 ? (
                            <button
                              type="button"
                              className="min-h-11 underline-offset-2 hover:underline"
                              aria-label={`Open ${r.vehicle ?? "truck"}, Trip ${r.trip_number}`}
                            >
                              {v}
                            </button>
                          ) : (
                            v
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {!isRange(state) && state.date === today && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Not assigned today ({query.data?.not_assigned?.length ?? 0})
          </summary>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Staff</th>
                <th className="p-2">Warehouse</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.not_assigned?.map((p) => (
                <tr key={p.staff_id}>
                  <td className="p-2">
                    <CallLink name={p.name} phone={p.phone} />
                  </td>
                  <td className="p-2">{p.warehouse ?? "?"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
