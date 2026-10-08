import { useMemo, useState } from "react";
import type { FuelLogRow, MaintainedTruck } from "@/services/api/fleetHealth";
import { addDays, isMaintained, manilaToday, mondayOf, shiftWeek, rateRange, type FleetPermissions } from "@/lib/fleetHealth";
import { EcoExplainer, Leaderboard, SummaryStrip, TruckView, ViewToggle, WeekPicker, type RangeDays } from "./EcoDrivers";
import { Co2Panel, FuelChecksPanel, FuelLogPanel } from "./FuelPanels";
import { ScorecardCard } from "./ScorecardCard";
import { FuelLogForm } from "./FuelLogForm";
import { useCo2, useEcoDrivers, useEcoTrucks, useFuelChecks, useFuelLogs, useNow, useScorecard, useStoredState, useTrucks } from "./hooks";

export function EcoTab({ perms, minKm }: { perms: FleetPermissions; minKm: number }) {
  const now = useNow();
  const [view, setView] = useStoredState<"drivers" | "trucks">("fh-eco-view", "drivers", ["drivers", "trucks"]);
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<RangeDays>(30);

  const today = manilaToday(now);
  const lastFullWeek = shiftWeek(mondayOf(today), -1);
  const drivers = useEcoDrivers(week);
  const currentWeek = drivers.data?.week_start ?? week ?? lastFullWeek;
  const last = addDays(today, -1);
  const { from, to } = rateRange(range, last);
  const trucksEco = useEcoTrucks(from, to, view === "trucks");
  const fuelLogs = useFuelLogs();
  const fuelChecks = useFuelChecks();
  const co2 = useCo2();
  const scorecard = useScorecard(week);
  const trucks = useTrucks();

  const maintained = useMemo<MaintainedTruck[]>(() => (trucks.data?.trucks ?? []).filter(isMaintained), [trucks.data]);
  const unconfirmed = useMemo(() => new Set(maintained.filter((t) => t.capacity_unconfirmed).map((t) => t.plate)), [maintained]);

  const [fuelOpen, setFuelOpen] = useState(false);
  const [editing, setEditing] = useState<FuelLogRow | null>(null);
  const addFill = () => {
    setEditing(null);
    setFuelOpen(true);
  };

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <div className="entrance flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ViewToggle value={view} onChange={setView} />
        {view === "drivers" ? (
          <WeekPicker
            weekStart={drivers.data?.week_start}
            weekEnd={drivers.data?.week_end}
            loading={drivers.isLoading}
            onPrev={() => setWeek(shiftWeek(currentWeek, -1))}
            onNext={() => setWeek(shiftWeek(currentWeek, 1))}
            onReset={() => setWeek(undefined)}
            canNext={currentWeek < lastFullWeek}
            isDefault={week === undefined || week === lastFullWeek}
          />
        ) : null}
      </div>

      {view === "drivers" ? (
        <>
          <EcoExplainer minKm={drivers.data?.min_km ?? minKm} />
          {drivers.data && <SummaryStrip data={drivers.data} />}
          <Leaderboard data={drivers.data} loading={drivers.isLoading} error={drivers.error} onRetry={() => drivers.refetch()} />
        </>
      ) : (
        <TruckView data={trucksEco.data} loading={trucksEco.isLoading} error={trucksEco.error} onRetry={() => trucksEco.refetch()} range={range} onRange={setRange} />
      )}

      <FuelLogPanel data={fuelLogs.data} loading={fuelLogs.isLoading} error={fuelLogs.error} onRetry={() => fuelLogs.refetch()} perms={perms} onAdd={addFill} onEdit={(l) => { setEditing(l); setFuelOpen(true); }} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <FuelChecksPanel data={fuelChecks.data} loading={fuelChecks.isLoading} error={fuelChecks.error} onRetry={() => fuelChecks.refetch()} unconfirmedPlates={unconfirmed} />
        <Co2Panel data={co2.data} loading={co2.isLoading} error={co2.error} onRetry={() => co2.refetch()} perms={perms} onAdd={addFill} />
      </div>

      <ScorecardCard data={scorecard.data} loading={scorecard.isLoading} error={scorecard.error} onRetry={() => scorecard.refetch()} perms={perms} week={week} />

      <FuelLogForm open={fuelOpen} onOpenChange={setFuelOpen} trucks={maintained} log={editing} />
    </div>
  );
}
