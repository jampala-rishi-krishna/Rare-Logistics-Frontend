import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Ban, BadgeCheck, ChevronRight, ClipboardCheck, Gauge, Search, Truck, Wrench } from "lucide-react";
import * as fh from "@/services/api/fleetHealth";
import type { FleetSummary, FleetTruck, MaintainedTruck, NeedsAttentionItem, TrucksResponse } from "@/services/api/fleetHealth";
import {
  EM_DASH,
  SERVICE_LABELS,
  SERVICE_ORDER,
  TONES,
  attentionReasons,
  checklistCell,
  filterAndSortTrucks,
  filterCounts,
  formatNumber,
  isMaintained,
  type FleetPermissions,
  type TruckFilter,
} from "@/lib/fleetHealth";
import { Banner, Card, CapacityMarker, EmptyState, ErrorPanel, InlineError, Pill, PlateText, RiskBadge, SectionHead, SegmentedControl, ServiceBar, ServiceLegend, Sk, TableSkeleton, TrackerPill, Tip, btn, btnGhost, btnPrimary, cx, fieldClass } from "./ui";
import { errorMessage, invalidateFleetHealth } from "./hooks";

// ------------------------------------------------------------------------------------------------ needs attention
export function NeedsAttention({ summary, loading, error, onRetry, onOpen }: { summary: FleetSummary | undefined; loading: boolean; error: unknown; onRetry: () => void; onOpen: (id: number) => void }) {
  const items = summary?.needs_attention ?? [];
  return (
    <Card className="entrance" data-testid="fh-needs-attention">
      <div className="border-b border-[#e4e3df] p-4 md:px-5">
        <SectionHead
          eyebrow="This week"
          title="Needs attention this week"
          info={["A truck lands here when any service is overdue or its risk score is 60 or more (High).", "Third-party trucks are excluded."]}
          aside={summary && items.length > 0 ? <span className="text-[13px] text-[#77787b]"><span className="mono font-semibold text-black">{items.length}</span> of {summary.kpis.maintained_trucks ?? EM_DASH} maintained vehicles</span> : undefined}
        />
      </div>
      {loading ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
          <Sk className="h-[88px] w-full" />
          <Sk className="h-[88px] w-full" />
        </div>
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} title="Could not load the attention list" className="m-4 border-dashed" />
      ) : items.length === 0 ? (
        <EmptyState icon={BadgeCheck} tone="ok" title="All clear this week" body="No truck has an overdue service or a High risk score. Keep logging pre-trip checks and services to keep it that way." compact />
      ) : (
        <ul className="grid gap-3 p-4 md:grid-cols-2 md:p-5 2xl:grid-cols-3">
          {items.map((item, i) => (
            <AttentionCard key={item.id} item={item} index={i} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AttentionCard({ item, index, onOpen }: { item: NeedsAttentionItem; index: number; onOpen: (id: number) => void }) {
  const reasons = attentionReasons(item);
  const tone = TONES[item.risk.band === "high" ? "over" : item.risk.band === "medium" ? "soon" : "ok"];
  return (
    <li className="entrance" style={{ animationDelay: `${index * 60}ms` }}>
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        data-testid={`fh-attention-${item.plate}`}
        className="group relative grid w-full gap-3 border border-[#e4e3df] bg-white p-4 pl-5 text-left transition-colors hover:border-[#0b0b0b] focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={`${item.plate}, risk ${item.risk.score}. ${reasons.join(", ")}. Open details`}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: tone.solid }} />
        <div className="flex items-center justify-between gap-3">
          <PlateText className="text-base">{item.plate}</PlateText>
          <div className="flex items-center gap-2">
            <RiskBadge risk={item.risk} withTip={false} />
            <ChevronRight size={16} className="text-[#9a9994] transition-transform group-hover:translate-x-0.5 group-hover:text-black" aria-hidden />
          </div>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <li key={r} className="rounded-[3px] border px-2 py-1 text-xs font-medium" style={{ color: TONES.over.fg, background: TONES.over.bg, borderColor: TONES.over.border }}>
              {r}
            </li>
          ))}
        </ul>
      </button>
    </li>
  );
}

// ------------------------------------------------------------------------------------------------ truck list
const FILTERS: { value: TruckFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "overdue", label: "Overdue" },
  { value: "issues", label: "Has open issues" },
];

function ChecklistCell({ truck }: { truck: MaintainedTruck }) {
  const c = checklistCell(truck.last_checklist);
  if (!truck.last_checklist) return <span className="text-xs text-[#9a9994]">{c.label}</span>;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Pill tone={c.tone}>{c.label}</Pill>
      <span className="text-[11px] text-[#77787b]">{c.sub}</span>
    </span>
  );
}

function FlagsCell({ truck }: { truck: MaintainedTruck }) {
  if (!truck.open_flags_count) return <span className="text-[#b9b8b3]">0</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold" title={truck.critical_flags_count ? `${truck.critical_flags_count} critical` : undefined}>
      {truck.critical_flags_count > 0 && (
        <span className="inline-flex items-center gap-1" aria-label={`${truck.critical_flags_count} critical`}>
          <span aria-hidden className="h-2 w-2 rounded-full bg-[#c4291f]" />
        </span>
      )}
      <span className="mono">{truck.open_flags_count}</span>
      {truck.critical_flags_count > 0 && <span className="sr-only">, including {truck.critical_flags_count} critical</span>}
    </span>
  );
}

function ServiceCell({ truck, k }: { truck: MaintainedTruck; k: (typeof SERVICE_ORDER)[number] }) {
  const state = truck.services[k];
  if (k === "reefer_service" && truck.is_reefer !== true) return <span className="block text-center text-[11px] text-[#b9b8b3]" title="Not a reefer">n/a</span>;
  if (!state || state.status === "not_tracked") return <span className="block text-[#b9b8b3]">{EM_DASH}</span>;
  return <ServiceBar service={state} label={SERVICE_LABELS[k]} />;
}

function PlateCell({ truck, onOpen }: { truck: MaintainedTruck; onOpen: (id: number) => void }) {
  return (
    <div className="min-w-0">
      <button type="button" onClick={() => onOpen(truck.id)} className="group inline-flex max-w-full items-center gap-1 text-left focus-visible:outline-2" aria-label={`Open ${truck.plate} details`} data-testid={`fh-open-${truck.plate}`}>
        <PlateText className="truncate text-[14px] underline-offset-4 group-hover:underline">{truck.plate}</PlateText>
        <ArrowUpRight size={12} className="shrink-0 text-[#9a9994] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#77787b]">
        <span>{truck.vehicle_type}</span>
        {truck.is_reefer && <span className="rounded-[2px] bg-[#eef4ef] px-1 py-px font-semibold text-[#33673B]">Reefer</span>}
        {truck.in_repair_record && <Pill tone="over">In repair</Pill>}
        {truck.locked_reason && !truck.in_repair_record && (
          <span className="rounded-[2px] border border-dashed border-[#c9c8c4] px-1 py-px">Locked: {truck.locked_reason}</span>
        )}
        {truck.capacity_unconfirmed && <CapacityMarker compact />}
      </div>
    </div>
  );
}

function RepairPrompt({ truck, canEdit, onAddRepair, onCloseDowntime, closing }: { truck: MaintainedTruck; canEdit: boolean; onAddRepair: (t: MaintainedTruck) => void; onCloseDowntime: (t: MaintainedTruck) => void; closing: boolean }) {
  if (!canEdit) return null;
  if (truck.offer_repair_record) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-[#6b4a00]" data-testid={`fh-repair-offer-${truck.plate}`}>
        <Wrench size={14} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <strong>{truck.plate}</strong> is locked "{truck.locked_reason}": add a repair record?
        </span>
        <button type="button" className={btn} onClick={() => onAddRepair(truck)}>
          Add repair record
        </button>
      </div>
    );
  }
  if (truck.in_repair_record) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-[#86000B]">
        <Wrench size={14} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <strong>{truck.plate}</strong> is in repair. Close the downtime when it is back on the road.
        </span>
        <button type="button" className={btn} onClick={() => onCloseDowntime(truck)} disabled={closing}>
          {closing ? "Closing…" : "Close downtime"}
        </button>
      </div>
    );
  }
  return null;
}

export function TruckList({
  data,
  loading,
  error,
  onRetry,
  perms,
  onOpen,
  onNewChecklist,
  onEditIntervals,
  onAddRepair,
}: {
  data: TrucksResponse | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  perms: FleetPermissions;
  onOpen: (id: number) => void;
  onNewChecklist: () => void;
  onEditIntervals: () => void;
  onAddRepair: (t: MaintainedTruck) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TruckFilter>("all");
  const qc = useQueryClient();
  const trucks = data?.trucks ?? [];
  const counts = useMemo(() => filterCounts(trucks), [trucks]);
  const rows = useMemo(() => filterAndSortTrucks(trucks, query, filter), [trucks, query, filter]);
  const maintained = rows.filter(isMaintained);
  const thirdParty = rows.filter((t) => !isMaintained(t));

  const closeDowntime = useMutation({
    mutationFn: async (truck: MaintainedTruck) => {
      const detail = await fh.getTruckDetail(truck.id);
      const open = detail.records?.find((r) => r.kind === "repair" && r.downtime_start && !r.downtime_end);
      if (!open) throw new Error("No open repair record was found for this truck.");
      const { performed_on, kind, service_type, odometer_km, engine_hours, downtime_start, reason, cost_php, vendor, notes, receipt_ref } = open;
      return fh.updateRecord(open.id, { kind, service_type, performed_on, odometer_km, engine_hours, downtime_start, downtime_end: new Date().toISOString(), reason, cost_php, vendor, notes, receipt_ref });
    },
    onSuccess: () => invalidateFleetHealth(qc, "maintenance"),
  });

  const prompts = maintained.filter((t) => (t.offer_repair_record || t.in_repair_record) && perms.canEdit);

  return (
    <Card className="entrance entrance-1" data-testid="fh-truck-list">
      <div className="grid gap-4 border-b border-[#e4e3df] p-4 md:px-5 [&>*]:min-w-0">
        <SectionHead
          eyebrow="Fleet"
          title="Vehicles"
          info={["Sorted by risk score, highest first. Risk = service + open issues + failed checks + overloads + repairs, out of 100."]}
          aside={
            <div className="flex flex-wrap gap-2">
              {perms.canEnter && (
                <button type="button" className={btnPrimary} onClick={onNewChecklist} data-testid="fh-new-checklist-top">
                  <ClipboardCheck size={14} aria-hidden /> New pre-trip check
                </button>
              )}
              {perms.canEdit && (
                <button type="button" className={btn} onClick={onEditIntervals}>
                  <Gauge size={14} aria-hidden /> Service intervals
                </button>
              )}
            </div>
          }
        />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-[280px]">
            <span className="sr-only">Search by plate</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9994]" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plate…" className={cx(fieldClass, "pl-9")} data-testid="fh-search" />
          </label>
          <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SegmentedControl<TruckFilter> label="Filter vehicles" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
          </div>
        </div>
        <ServiceLegend />
      </div>

      {prompts.length > 0 && (
        <div className="grid gap-px border-b border-[#e4e3df] bg-[#e6c36a]/40">
          {prompts.map((t) => (
            <div key={t.id} className={cx("px-4 py-3 md:px-5", t.in_repair_record ? "bg-[#fff1f0]" : "bg-[#fff6dd]")}>
              <RepairPrompt truck={t} canEdit={perms.canEdit} onAddRepair={onAddRepair} onCloseDowntime={(x) => closeDowntime.mutate(x)} closing={closeDowntime.isPending} />
            </div>
          ))}
        </div>
      )}
      {closeDowntime.isError && (
        <div className="p-4">
          <InlineError>{errorMessage(closeDowntime.error)}</InlineError>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} title="Could not load vehicles" className="m-4" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Truck} title={query || filter !== "all" ? "No vehicles match" : "No vehicles yet"} body={query || filter !== "all" ? "Try a different plate or clear the filter." : "Vehicles appear here once they are in the fleet."} action={query || filter !== "all" ? <button type="button" className={btn} onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button> : undefined} compact />
      ) : (
        <>
          <DesktopTable maintained={maintained} thirdParty={thirdParty} onOpen={onOpen} />
          <MobileCards maintained={maintained} thirdParty={thirdParty} onOpen={onOpen} />
        </>
      )}
    </Card>
  );
}

const TH = "px-2.5 py-3 text-left align-bottom font-medium";

function DesktopTable({ maintained, thirdParty, onOpen }: { maintained: MaintainedTruck[]; thirdParty: FleetTruck[]; onOpen: (id: number) => void }) {
  return (
    <div className="hidden overflow-x-auto md:block" data-testid="fh-table">
      <table className="w-full min-w-[1040px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#e4e3df] bg-[#fafaf8] text-[#77787b]">
            <th scope="col" className={cx(TH, "sticky left-0 z-[1] bg-[#fafaf8] pl-5 micro")}>Plate</th>
            <th scope="col" className={cx(TH, "micro")}>Tracker</th>
            <th scope="col" className={cx(TH, "micro text-right")}>Odometer</th>
            <th scope="col" className={cx(TH, "micro")}>Risk</th>
            {SERVICE_ORDER.map((k) => (
              <th key={k} scope="col" className={cx(TH, "micro")}>{SERVICE_LABELS[k]}</th>
            ))}
            <th scope="col" className={cx(TH, "micro")}>Flags</th>
            <th scope="col" className={cx(TH, "micro whitespace-nowrap pr-5")}>Last check</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efeeeb]">
          {maintained.map((t) => (
            <tr key={t.id} className="align-middle transition-colors hover:bg-[#fafaf8]" data-testid={`fh-row-${t.plate}`}>
              <td className="sticky left-0 z-[1] bg-white py-3.5 pl-5 pr-2.5 group-hover:bg-[#fafaf8]">
                <PlateCell truck={t} onOpen={onOpen} />
              </td>
              <td className="px-2.5 py-3.5"><TrackerPill tracker={t.tracker} /></td>
              <td className="mono px-2.5 py-3.5 text-right">{t.odometer_km == null ? <span className="text-[#b9b8b3]" title="No tracker, so no odometer">{EM_DASH}</span> : formatNumber(t.odometer_km)}</td>
              <td className="px-2.5 py-3.5"><RiskBadge risk={t.risk} size="sm" /></td>
              {SERVICE_ORDER.map((k) => (
                <td key={k} className="min-w-[70px] px-1.5 py-3.5"><ServiceCell truck={t} k={k} /></td>
              ))}
              <td className="px-2.5 py-3.5"><FlagsCell truck={t} /></td>
              <td className="px-2.5 py-3.5 pr-5"><ChecklistCell truck={t} /></td>
            </tr>
          ))}
          {thirdParty.length > 0 && (
            <tr className="bg-[#fafaf8]">
              <td colSpan={13} className="micro px-5 py-2.5 text-[#77787b]">Third-party carriers ({thirdParty.length})</td>
            </tr>
          )}
          {thirdParty.map((t) => (
            <tr key={t.id} className="text-[#77787b]" data-testid={`fh-row-${t.plate}`}>
              <td className="sticky left-0 z-[1] bg-white py-2.5 pl-5 pr-2.5">
                <button type="button" onClick={() => onOpen(t.id)} className="mono text-left text-[13px] font-medium text-[#55565a] underline-offset-4 hover:underline" aria-label={`${t.plate}, third-party`}>
                  {t.plate}
                </button>
              </td>
              <td className="px-2.5 py-2.5"><Pill tone="none">Third-party</Pill></td>
              <td colSpan={11} className="px-2.5 py-2.5 text-xs">Not maintained by RGF: no service tracking, risk or eco score.</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({ maintained, thirdParty, onOpen }: { maintained: MaintainedTruck[]; thirdParty: FleetTruck[]; onOpen: (id: number) => void }) {
  return (
    <div className="grid gap-3 p-3 md:hidden" data-testid="fh-cards">
      {maintained.map((t) => (
        <article key={t.id} className="border border-[#e4e3df] bg-white" data-testid={`fh-card-${t.plate}`}>
          <div className="flex items-start justify-between gap-3 p-4 pb-3">
            <PlateCell truck={t} onOpen={onOpen} />
            <RiskBadge risk={t.risk} size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 text-[13px]">
            <TrackerPill tracker={t.tracker} />
            <span className="text-[#55565a]">
              Odometer <span className="mono font-semibold text-black">{t.odometer_km == null ? EM_DASH : formatNumber(t.odometer_km)}</span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-3.5 border-t border-[#efeeeb] px-4 py-3.5">
            {SERVICE_ORDER.map((k) => (
              <div key={k} className="min-w-0">
                <div className="micro mb-1.5 text-[#77787b]">{SERVICE_LABELS[k]}</div>
                <ServiceCell truck={t} k={k} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#efeeeb] px-4 py-3 text-[13px]">
            <span className="flex items-center gap-2 text-[#55565a]">
              Issues <FlagsCell truck={t} />
            </span>
            <ChecklistCell truck={t} />
          </div>
          <button type="button" onClick={() => onOpen(t.id)} className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-[#e4e3df] bg-[#fafaf8] text-[13px]! font-semibold">
            View details <ChevronRight size={14} aria-hidden />
          </button>
        </article>
      ))}
      {thirdParty.length > 0 && <div className="micro mt-2 px-1 text-[#77787b]">Third-party carriers ({thirdParty.length})</div>}
      {thirdParty.map((t) => (
        <button key={t.id} type="button" onClick={() => onOpen(t.id)} className="flex min-h-12 items-center justify-between gap-3 border border-[#e4e3df] bg-[#fafaf8] px-4 py-3 text-left" data-testid={`fh-card-${t.plate}`}>
          <span className="min-w-0">
            <PlateText className="block truncate text-[13px] text-[#55565a]">{t.plate}</PlateText>
            <span className="mt-0.5 block text-[11px] text-[#77787b]">Not maintained by RGF</span>
          </span>
          <Pill tone="none">Third-party</Pill>
        </button>
      ))}
    </div>
  );
}

export function IntervalsBanner({ onReview, canEdit }: { onReview: () => void; canEdit: boolean }) {
  return (
    <Banner
      tone="soon"
      testId="fh-intervals-banner"
      className="entrance"
      action={
        canEdit ? (
          <button type="button" onClick={onReview} className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-[#6b4a00]/50 bg-white/70 px-3 text-[13px]! font-semibold text-[#6b4a00] hover:bg-white">
            Review intervals <ArrowUpRight size={13} aria-hidden />
          </button>
        ) : undefined
      }
    >
      Service intervals are placeholders — confirm with logistics
    </Banner>
  );
}

export { Ban, btnGhost, Tip };
