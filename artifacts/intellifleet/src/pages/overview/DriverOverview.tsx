import { useState } from "react";
import { Download } from "lucide-react";
import {
  activeFilters,
  groupByDate,
  isRange,
  rangeError,
  sortTrips,
  updatedAgo,
} from "@/lib/overviewModel";
import * as api from "@/services/api/overview";
import FilterBar from "./FilterBar";
import StatusTiles from "./StatusTiles";
import TripsTab from "./TripsTab";
import HandoverTab from "./HandoverTab";
import IssuesTab from "./IssuesTab";
import TripDrawer from "./TripTimeline";
import { useOverviewUrl } from "./useOverviewUrl";
import { tripsFilter, useTrips, useHardCopies, useIssues } from "./queries";
import { buttonClass, ErrorLine, useNow } from "./shared";
export default function DriverOverview() {
  const { state, set, today } = useOverviewUrl();
  const trips = useTrips(state);
  const invoices = useHardCopies({ ...state, only: false });
  const issues = useIssues(state, "open", false);
  const now = useNow();
  const [exporting, busy] = useState(false);
  const [filename, file] = useState("");
  const [error, fail] = useState<unknown>(null);
  async function download() {
    busy(true);
    fail(null);
    file("");
    try {
      const r = await api.downloadExport(tripsFilter(state));
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      file(r.filename);
    } catch (e) {
      fail(e);
    } finally {
      busy(false);
    }
  }
  const tabs = [
    ["trips", `Trips (${trips.data?.total ?? 0})`],
    ["invoices", `Invoices to collect (${invoices.data?.total ?? 0})`],
    ["issues", `Issues (${issues.data?.issues.length ?? 0} open)`],
  ] as const;
  return (
    <div
      className="grid min-w-0 gap-4 text-foreground"
      data-testid="driver-overview"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Driver Overview</h1>
          <p className="text-xs text-muted-foreground">
            {updatedAgo(trips.dataUpdatedAt, now.getTime())} · refreshes every
            15 s
          </p>
        </div>
        <button
          className={buttonClass}
          onClick={() => void download()}
          disabled={
            exporting ||
            (isRange(state) && Boolean(rangeError(state.from, state.to)))
          }
          data-testid="export-csv"
          title="Exports current date/range, warehouse, search and status. CSV columns: date, batch, driver, helpers, vehicle, so_number, customer, acknowledged_at, acknowledged_by, arrived_at, distance_m, departed_at, invoice_dr_number, outcome, reason, minutes_at_stop, trip_started, trip_ended, handover_status, invoice_status, officer, validated_at. Times are Manila time."
        >
          <Download size={14} />
          {exporting ? "Preparing…" : "Export CSV"}
        </button>
      </header>
      {filename && (
        <p role="status" className="break-all text-xs">
          Downloaded {filename}
        </p>
      )}
      {error ? <ErrorLine error={error} /> : null}
      <FilterBar state={state} set={set} today={today} />
      <StatusTiles
        data={trips.data}
        tile={state.tile}
        onTile={(tile) => set({ tile, tab: "trips" })}
        loading={trips.isLoading}
      />
      <nav
        role="tablist"
        aria-label="Driver Overview sections"
        className="flex flex-wrap border-b border-border"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={state.tab === id}
            onClick={() => set({ tab: id })}
            data-testid={`tab-${id}`}
            className={`min-h-11 border-b-2 px-3 text-sm font-semibold ${state.tab === id ? "border-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {state.tab === "trips" && (
        <TripsTab
          state={state}
          set={set}
          query={trips}
          today={today}
          filters={activeFilters(state, today)}
        />
      )}
      {state.tab === "invoices" && <HandoverTab state={state} set={set} />}
      {state.tab === "issues" && <IssuesTab state={state} set={set} />}
      {state.trip && (
        <TripDrawer
          state={state}
          set={set}
          rows={
            isRange(state)
              ? groupByDate(trips.data?.trips ?? []).flatMap((g) => g.rows)
              : sortTrips(trips.data?.trips ?? [])
          }
        />
      )}
    </div>
  );
}
