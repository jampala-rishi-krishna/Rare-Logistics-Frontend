import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type { MaintainedTruck } from "@/services/api/fleetHealth";
import { buildKpiTiles, formatDateTime, isMaintained } from "@/lib/fleetHealth";
import { ErrorPanel, KpiSkeleton, KpiTile, SegmentedControl, btn, cx } from "./ui";
import { IntervalsBanner, NeedsAttention, TruckList } from "./MaintenanceTab";
import { EcoTab } from "./EcoTab";
import { TruckDrawer } from "./TruckDrawer";
import { ChecklistForm } from "./ChecklistForm";
import { IntervalEditor } from "./IntervalEditor";
import { RecordForm } from "./RecordForm";
import { fhKeys, useSessionRole, useStoredState, useSummary, useTrucks } from "./hooks";
import { TooltipProvider } from "@/components/ui/tooltip";

type TabKey = "maintenance" | "eco";
const TABS: readonly TabKey[] = ["maintenance", "eco"];

/** Fleet Health: maintenance and eco driving. Rendered inside AppShell. */
export default function FleetHealthPage() {
  const qc = useQueryClient();
  const perms = useSessionRole();
  const summary = useSummary();
  const trucks = useTrucks();
  const [tab, setTab] = useStoredState<TabKey>("fh-tab", "maintenance", TABS);

  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [repairTruck, setRepairTruck] = useState<MaintainedTruck | null>(null);

  const maintained = useMemo(() => (trucks.data?.trucks ?? []).filter(isMaintained), [trucks.data]);
  const drawerTruck = maintained.find((t) => t.id === drawerId) ?? null;
  const tiles = useMemo(() => (summary.data ? buildKpiTiles(summary.data.kpis, summary.data.co2_kg_per_litre, summary.data.eco_min_km) : null), [summary.data]);

  const refresh = useMutation({
    mutationFn: async () => {
      await qc.invalidateQueries({ queryKey: ["fh"] });
    },
  });
  const unconfirmed = summary.data?.intervals_unconfirmed || trucks.data?.intervals_unconfirmed;

  return (
    <TooltipProvider delayDuration={120}>
      <div data-testid="fleet-health-page" className="min-w-0">
        <div className="entrance mb-7 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="micro mb-3 text-[#77787b]">Workspace / Fleet Health</div>
            <h1 className="display-face max-w-3xl text-4xl font-bold leading-[.98] md:text-5xl">Fleet Health</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-6 text-[#55565a]">Service status, open issues and risk for every maintained vehicle, plus eco-driving scores, fuel use and CO2.</p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <SegmentedControl
              label="Fleet Health view"
              value={tab}
              onChange={setTab}
              options={[
                { value: "maintenance", label: "Maintenance" },
                { value: "eco", label: "Eco driving" },
              ]}
            />
          </div>
        </div>

        <div className="grid gap-5">
          {unconfirmed && <IntervalsBanner canEdit={perms.canEdit} onReview={() => setIntervalOpen(true)} />}

          <section aria-label="Key numbers" className="grid gap-2">
            {summary.isLoading ? (
              <KpiSkeleton />
            ) : summary.isError || !tiles ? (
              <ErrorPanel error={summary.error} onRetry={() => summary.refetch()} title="Could not load the key numbers" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {tiles.map((t, i) => (
                    <KpiTile key={t.key} tile={t} index={i} />
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#77787b]">
                  <span>
                    Data through {summary.data?.data_through}. Updated {formatDateTime(summary.data?.generated_at)}. Third-party trucks are excluded from fleet numbers.
                  </span>
                  <button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending || summary.isFetching} className={cx(btn, "h-9! md:h-8!")} aria-label="Refresh data">
                    <RefreshCw size={13} className={summary.isFetching ? "animate-spin" : ""} aria-hidden /> Refresh
                  </button>
                </div>
              </>
            )}
          </section>

          {tab === "maintenance" ? (
            <div className="grid gap-5">
              <NeedsAttention summary={summary.data} loading={summary.isLoading} error={summary.isError ? summary.error : null} onRetry={() => summary.refetch()} onOpen={setDrawerId} />
              <TruckList
                data={trucks.data}
                loading={trucks.isLoading}
                error={trucks.isError ? trucks.error : null}
                onRetry={() => trucks.refetch()}
                perms={perms}
                onOpen={setDrawerId}
                onNewChecklist={() => setChecklistOpen(true)}
                onEditIntervals={() => setIntervalOpen(true)}
                onAddRepair={setRepairTruck}
              />
            </div>
          ) : (
            <EcoTab perms={perms} minKm={summary.data?.eco_min_km ?? 50} />
          )}
        </div>

        <TruckDrawer truckId={drawerId} initial={drawerTruck} onClose={() => setDrawerId(null)} perms={perms} allTrucks={maintained} />
        <ChecklistForm open={checklistOpen} onOpenChange={setChecklistOpen} trucks={maintained} initialTruckId={null} />
        <IntervalEditor open={intervalOpen} onOpenChange={setIntervalOpen} truck={null} trucks={maintained} />
        {repairTruck && (
          <RecordForm
            open
            onOpenChange={(o) => !o && setRepairTruck(null)}
            truck={{ id: repairTruck.id, plate: repairTruck.plate, odometer_km: repairTruck.odometer_km }}
            preset={{ kind: "repair", downtimeStartNow: true, reason: repairTruck.locked_reason ?? undefined }}
            showReefer={repairTruck.is_reefer === true}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export { fhKeys };
