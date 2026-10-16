import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { groupByCrew, rowCrew, type BoardMode } from "@/lib/overviewCrew";
import type { TripRow, TripsResponse } from "@/services/api/overview";
import {
  crewOf,
  dayLabel,
  durationText,
  formatKg,
  groupByDate,
  isRange,
  lastActivity,
  manilaDateTime,
  outcomesOf,
  railOf,
  sortTrips,
  tileLabel,
  tileOf,
  type UrlState,
} from "@/lib/overviewModel";
import {
  AttentionChip,
  buttonClass,
  CallLink,
  ErrorLine,
  focusRing,
  Skeleton,
  useNow,
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
  const now = useNow(15000);
  const rows = sortTrips(query.data?.trips ?? []);
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
    return `✓ ${o.delivered} delivered · ◐ ${o.partial} partial · ✕ ${o.failed} not delivered`;
  };
  const groups = isRange(state) ? groupByDate(rows) : [{ date: "", rows }];
  // Driver / Helper toggle: "By helper" lists the board under each helper (a trip with no helper under "No helper").
  const [board, setBoard] = useState<BoardMode>("driver");
  const renderTrip = (r: TripRow, keyPrefix = "") => {
    const a = lastActivity(r, now, query.data?.stale_minutes ?? 30);
    const kg = formatKg([r]);
    return (
      <article
        key={`${keyPrefix}${r.batch_id}`}
        className="relative grid gap-2 rounded-lg border border-border bg-card p-4"
        data-testid="trip-row"
      >
        <button
          onClick={() => open(r)}
          className={`absolute inset-0 z-0 rounded-lg ${focusRing}`}
          aria-label={`Open ${r.vehicle ?? "truck"}, Trip ${r.trip_number}`}
        />
        <div className="pointer-events-none relative flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <strong className="text-base">{r.vehicle ?? "No vehicle"}</strong>
          <span className="text-sm">
            Trip {r.trip_number}
            {r.trips_on_date > 1 ? ` of ${r.trips_on_date}` : ""}
          </span>
          <span className="text-xs text-muted-foreground">{r.warehouse}</span>
          <div className="pointer-events-auto relative z-[1] flex flex-wrap gap-2 text-sm" data-testid="trip-row-crew">
            {crewOf(r).map((c, i) => (
              <CallLink key={i} name={c.name} role={c.role} phone={c.phone} />
            ))}
          </div>
        </div>
        <div className="pointer-events-none relative">
          <Rail row={r} />
        </div>
        <p className="pointer-events-none relative text-xs">
          {outcome(r)} · Invoices {r.invoices?.received ?? 0}/
          {r.invoices?.total ?? r.so_count} received
        </p>
        <p
          className={`pointer-events-none relative text-xs ${a.stale ? "font-semibold text-destructive" : "text-muted-foreground"}`}
        >
          {a.text} · {kg?.text} {kg?.note ? `(${kg.note})` : ""} ·{" "}
          {r.packs ?? "—"} packs
        </p>
        <div className="pointer-events-none relative flex flex-wrap gap-1">
          {r.attention?.map((f, i) => (
            <AttentionChip key={i} flag={f} />
          ))}
        </div>
      </article>
    );
  };
  return (
    <section className="grid min-w-0 gap-3" data-testid="trips-tab">
      <div className="flex flex-wrap justify-end gap-2">
        <div role="group" aria-label="List the board by" className="flex gap-1" data-testid="board-mode">
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
        <button
          className={buttonClass}
          aria-pressed={state.view === "table"}
          onClick={() =>
            set({ view: state.view === "table" ? "list" : "table" })
          }
        >
          Table view
        </button>
      </div>
      {query.isError && (
        <ErrorLine error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.isLoading ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border p-6 text-center">
          <h2 className="font-semibold">No trips match these filters</h2>
          <p className="my-2 text-sm text-muted-foreground">
            {filters.join(" · ")}
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
      ) : state.view === "table" ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full whitespace-nowrap text-left text-xs">
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
              {rows.map((r) => (
                <tr
                  key={r.batch_id}
                  tabIndex={0}
                  onClick={() => open(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open(r);
                    }
                  }}
                  className={`cursor-pointer border-t border-border hover:bg-muted ${focusRing}`}
                  data-testid="trip-row"
                >
                  {[
                    r.date,
                    rowCrew(r).driver?.name ?? "—",
                    rowCrew(r)
                      .helpers.map((h) => h.name)
                      .join(", ") || "—",
                    `${r.vehicle} · Trip ${r.trip_number} of ${r.trips_on_date}`,
                    tileLabel(tileOf(r)),
                    r.so_count,
                    r.stops_done,
                    formatKg([r])?.text,
                    r.packs ?? "—",
                    outcome(r),
                    durationText(r.duration_minutes ?? r.trip_minutes),
                    manilaDateTime(r.started_at),
                  ].map((v, i) => (
                    <td key={i} className="p-3">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : board === "helper" ? (
        groupByCrew(rows, "helper").map((g) => (
          <div key={g.key} className="grid gap-2" data-testid="helper-group">
            <h2 className="flex flex-wrap items-baseline gap-2 font-semibold">
              {g.person ? (
                <CallLink name={g.person.name} role="helper" phone={g.person.phone} />
              ) : (
                g.label
              )}
              <span className="text-xs font-normal text-muted-foreground">
                {g.rows.length} trip{g.rows.length === 1 ? "" : "s"}
              </span>
            </h2>
            {g.rows.map((r) => renderTrip(r, `${g.key}-`))}
          </div>
        ))
      ) : (
        groups.map((g) => (
          <div key={g.date} className="grid gap-2">
            {g.date && <h2 className="font-semibold">{dayLabel(g.date)}</h2>}
            {g.rows.map((r) => renderTrip(r))}
          </div>
        ))
      )}
      {!isRange(state) && state.date === today && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Not assigned today ({query.data?.not_assigned?.length ?? 0})
          </summary>
          <ul className="mt-3 grid gap-2 text-sm">
            {query.data?.not_assigned?.map((p) => (
              <li key={p.staff_id}>
                <CallLink name={p.name} phone={p.phone} /> ·{" "}
                {p.warehouse ?? "—"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
