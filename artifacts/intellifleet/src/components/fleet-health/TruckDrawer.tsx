import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, ClipboardCheck, Gauge, Plus, Siren, Wrench } from "lucide-react";
import * as fh from "@/services/api/fleetHealth";
import type { MaintainedTruck, MaintenanceRecord, TruckDetail } from "@/services/api/fleetHealth";
import {
  EM_DASH,
  TONES,
  batteryStatusLabel,
  batteryTone,
  checklistCell,
  formatDate,
  formatDateTime,
  formatKm,
  formatNumber,
  isMaintained,
  relativeDay,
  riskSegments,
  toManilaInputValue,
  riskTone,
  RISK_BAND_LABELS,
} from "@/lib/fleetHealth";
import { Modal } from "./Modal";
import { CapacityMarker, EmptyState, ErrorPanel, InlineError, Pill, PlateText, RiskBadge, Sk, Stat, TrackerPill, btn, btnGhost, btnPrimary, cx } from "./ui";
import { errorMessage, invalidateFleetHealth, useNow, useTruckDetail, useStoredState } from "./hooks";
import type { FleetPermissions } from "@/lib/fleetHealth";
import { RecordForm, formToBody, recordToForm, type RecordPreset } from "./RecordForm";
import { IntervalEditor } from "./IntervalEditor";
import { IssueForm } from "./IssueForm";
import { ChecklistForm } from "./ChecklistForm";
import { FuelLogForm } from "./FuelLogForm";
import { ChecklistSection, HistorySection, IssuesSection, ServicesSection } from "./DrawerSections";
import { BatterySection, DistanceSection, FuelSection } from "./DrawerCharts";

type SectionKey = "overview" | "services" | "history" | "issues" | "checklists" | "fuel" | "battery" | "distance";
const SECTIONS: readonly SectionKey[] = ["overview", "services", "history", "issues", "checklists", "fuel", "battery", "distance"];

const FACTOR_COLORS: Record<string, string> = { service: "#0b0b0b", flags: "#86000B", checklists: "#d89b00", overloads: "#5b7f95", repairs: "#9a9994" };

export interface DrawerCtx {
  detail: TruckDetail;
  truck: MaintainedTruck;
  perms: FleetPermissions;
  now: Date;
  allTrucks: MaintainedTruck[];
  logService: (preset?: RecordPreset) => void;
  editRecord: (record: MaintenanceRecord) => void;
  editIntervals: () => void;
  reportIssue: () => void;
  newChecklist: () => void;
  addFuel: () => void;
  closeDowntime: (record: MaintenanceRecord) => void;
  closing: boolean;
  closeError: string;
}

export function TruckDrawer({ truckId, initial, onClose, perms, allTrucks }: { truckId: number | null; initial: MaintainedTruck | null; onClose: () => void; perms: FleetPermissions; allTrucks: MaintainedTruck[] }) {
  const open = truckId != null;
  const query = useTruckDetail(truckId);
  const now = useNow();
  const qc = useQueryClient();
  const [section, setSection] = useStoredState<SectionKey>("fh-drawer-section", "overview", SECTIONS);

  const [recordFormOpen, setRecordFormOpen] = useState(false);
  const [recordEditing, setRecordEditing] = useState<MaintenanceRecord | null>(null);
  const [preset, setPreset] = useState<RecordPreset | null>(null);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);

  const detail = query.data;
  const truck = detail && isMaintained(detail.truck) ? detail.truck : initial;
  const thirdParty = detail && !isMaintained(detail.truck) ? detail.truck : null;

  const close = useMutation({
    mutationFn: (record: MaintenanceRecord) => {
      const form = recordToForm(record);
      const body = formToBody({ ...form, downtimeEnd: toManilaInputValue(new Date()) }, undefined);
      return fh.updateRecord(record.id, body);
    },
    onSuccess: () => invalidateFleetHealth(qc, "maintenance"),
  });

  const ctx: DrawerCtx | null =
    detail && truck && detail.records
      ? {
          detail,
          truck,
          perms,
          now,
          allTrucks,
          logService: (p) => {
            setRecordEditing(null);
            setPreset(p ?? null);
            setRecordFormOpen(true);
          },
          editRecord: (r) => {
            setRecordEditing(r);
            setPreset(null);
            setRecordFormOpen(true);
          },
          editIntervals: () => setIntervalOpen(true),
          reportIssue: () => setIssueOpen(true),
          newChecklist: () => setChecklistOpen(true),
          addFuel: () => setFuelOpen(true),
          closeDowntime: (r) => close.mutate(r),
          closing: close.isPending,
          closeError: close.isError ? errorMessage(close.error) : "",
        }
      : null;

  const openFlags = detail?.flags?.filter((f) => !f.resolved_at).length ?? truck?.open_flags_count ?? 0;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(o) => !o && onClose()}
        variant="drawer"
        testId="fh-truck-drawer"
        eyebrow="Fleet Health / Vehicle"
        title={<PlateText>{truck?.plate ?? thirdParty?.plate ?? "Vehicle"}</PlateText>}
        headerExtra={
          truck ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <TrackerPill tracker={truck.tracker} />
              <span className="text-[13px] text-[#55565a]">
                Odometer <strong className="mono font-semibold text-black">{truck.odometer_km == null ? EM_DASH : formatKm(truck.odometer_km)}</strong>
              </span>
              <RiskBadge risk={truck.risk} />
              {truck.capacity_unconfirmed && <CapacityMarker />}
              {truck.in_repair_record && <Pill tone="over">In repair</Pill>}
              {truck.locked_reason && <Pill tone="none" dashed>Locked: {truck.locked_reason}</Pill>}
            </div>
          ) : thirdParty ? (
            <div className="mt-3">
              <Pill tone="none">Third-party</Pill>
            </div>
          ) : null
        }
      >
        {query.isLoading && !truck ? (
          <DrawerSkeleton />
        ) : thirdParty ? (
          <EmptyState icon={Ban} title="Third-party truck" body={thirdParty.message || "Not maintained by RGF, so it has no service tracking, risk score or eco score."} className="py-20" />
        ) : query.isError ? (
          <div className="p-4 md:p-6">
            <ErrorPanel error={query.error} onRetry={() => query.refetch()} title="Could not load this vehicle" />
          </div>
        ) : !ctx ? (
          <DrawerSkeleton />
        ) : (
          <div className="flex min-h-full flex-col">
            <nav className="sticky top-0 z-10 flex gap-0.5 overflow-x-auto border-b border-[#e4e3df] bg-[#fafaf8]/95 px-3 backdrop-blur md:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Vehicle sections" role="tablist">
              {SECTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={section === s}
                  onClick={() => setSection(s)}
                  data-testid={`fh-drawer-tab-${s}`}
                  className={cx(
                    "relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[13px]! font-semibold transition-colors",
                    section === s ? "text-black" : "text-[#77787b] hover:text-black",
                  )}
                >
                  {SECTION_LABELS[s]}
                  {s === "issues" && openFlags > 0 && <span className="mono rounded-full bg-[#86000B] px-1.5 py-0.5 text-[10px] leading-none text-white">{openFlags}</span>}
                  {section === s && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[2px] bg-black" />}
                </button>
              ))}
            </nav>
            <div className="entrance min-w-0 flex-1 p-4 md:p-6" key={section}>
              {section === "overview" && <Overview ctx={ctx} />}
              {section === "services" && <ServicesSection ctx={ctx} />}
              {section === "history" && <HistorySection ctx={ctx} />}
              {section === "issues" && <IssuesSection ctx={ctx} />}
              {section === "checklists" && <ChecklistSection ctx={ctx} />}
              {section === "fuel" && <FuelSection ctx={ctx} />}
              {section === "battery" && <BatterySection ctx={ctx} />}
              {section === "distance" && <DistanceSection ctx={ctx} />}
            </div>
          </div>
        )}
      </Modal>

      {truck && (
        <>
          <RecordForm open={recordFormOpen} onOpenChange={setRecordFormOpen} truck={{ id: truck.id, plate: truck.plate, odometer_km: truck.odometer_km }} record={recordEditing} preset={preset} showReefer={truck.is_reefer === true} />
          <IntervalEditor open={intervalOpen} onOpenChange={setIntervalOpen} truck={{ id: truck.id, plate: truck.plate }} pairs={detail?.intervals} trucks={allTrucks} />
          <IssueForm open={issueOpen} onOpenChange={setIssueOpen} truck={{ id: truck.id, plate: truck.plate }} />
          <ChecklistForm open={checklistOpen} onOpenChange={setChecklistOpen} trucks={allTrucks} initialTruckId={truck.id} />
          <FuelLogForm open={fuelOpen} onOpenChange={setFuelOpen} trucks={allTrucks} initialTruckId={truck.id} />
        </>
      )}
    </>
  );
}

const SECTION_LABELS: Record<SectionKey, string> = {
  overview: "Overview",
  services: "Services",
  history: "History",
  issues: "Issues",
  checklists: "Checklists",
  fuel: "Fuel",
  battery: "Battery",
  distance: "Distance",
};

function DrawerSkeleton() {
  return (
    <div className="grid gap-4 p-4 md:p-6" aria-busy="true" aria-label="Loading vehicle">
      <Sk className="h-9 w-full" />
      <Sk className="h-6 w-1/2" />
      <Sk className="h-24 w-full" />
      <Sk className="h-40 w-full" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ overview
function Overview({ ctx }: { ctx: DrawerCtx }) {
  const { truck, detail, perms, now } = ctx;
  const risk = truck.risk;
  const segs = riskSegments(risk.breakdown);
  const tone = TONES[riskTone(risk.band)];
  const lastCheck = checklistCell(truck.last_checklist);
  const openRepair = detail.records?.find((r) => r.kind === "repair" && r.downtime_start && !r.downtime_end);
  return (
    <div className="grid gap-6">
      {truck.offer_repair_record && perms.canEdit && (
        <div className="flex flex-wrap items-center gap-3 border border-[#e6c36a] bg-[#fff6dd] px-4 py-3 text-sm text-[#6b4a00]" data-testid="fh-repair-prompt">
          <Wrench size={16} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Locked "{truck.locked_reason}": add a repair record?
          </span>
          <button type="button" className={btn} onClick={() => ctx.logService({ kind: "repair", downtimeStartNow: true, reason: truck.locked_reason ?? undefined })}>
            <Plus size={14} aria-hidden /> Add repair record
          </button>
        </div>
      )}
      {truck.in_repair_record && openRepair && (
        <div className="flex flex-wrap items-center gap-3 border border-[#f0c4c1] bg-[#fdeeed] px-4 py-3 text-sm text-[#86000B]">
          <Wrench size={16} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            In repair since {formatDate(openRepair.downtime_start)}
            {openRepair.reason ? `: ${openRepair.reason}` : ""}
          </span>
          {perms.canEdit && (
            <button type="button" className={btn} disabled={ctx.closing} onClick={() => ctx.closeDowntime(openRepair)}>
              {ctx.closing ? "Closing…" : "Close downtime"}
            </button>
          )}
        </div>
      )}
      {ctx.closeError && <InlineError>{ctx.closeError}</InlineError>}

      <section aria-labelledby="risk-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 id="risk-h" className="display-face text-xl font-bold">
            Risk breakdown
          </h3>
          <span className="text-sm">
            <span className="display-face text-3xl font-bold" style={{ color: tone.fg }}>
              {risk.score}
            </span>
            <span className="ml-1 text-[#77787b]">/ 100 · {RISK_BAND_LABELS[risk.band]}</span>
          </span>
        </div>
        <div className="flex h-3.5 w-full overflow-hidden border border-[#d8d7d2] bg-[#f2f2ef]" role="img" aria-label={`Risk ${risk.score} out of 100: ${risk.breakdown.filter((b) => b.points > 0).map((b) => `${b.label} ${b.points}`).join(", ") || "no risk factors"}`}>
          {segs.map((s) => (
            <span key={s.key} title={`${s.label}: ${s.value} points`} style={{ width: `${s.width}%`, background: FACTOR_COLORS[s.key] ?? "#0b0b0b" }} className="border-r border-white/70 last:border-0" />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-[#9a9994]">
          <span>0</span>
          <span style={{ marginLeft: "30%" }}>30 medium</span>
          <span style={{ marginRight: "10%" }}>60 high</span>
          <span>100</span>
        </div>
        <ul className="mt-4 divide-y divide-[#efeeeb] border border-[#e4e3df] bg-white">
          {risk.breakdown.map((b) => (
            <li key={b.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-x-6">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: FACTOR_COLORS[b.key] ?? "#0b0b0b", opacity: b.points > 0 ? 1 : 0.3 }} />
                {b.label}
              </div>
              <div className="mono text-sm sm:text-right">
                <span className={b.points > 0 ? "font-semibold" : "text-[#9a9994]"}>{b.points}</span>
                <span className="text-[#9a9994]"> / {b.max}</span>
              </div>
              <div className="text-[13px] text-[#55565a] sm:col-span-1">{b.detail}</div>
              <div className="text-[11px] text-[#9a9994] sm:col-span-2">{b.formula}</div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[#77787b]">High risk starts at 60. A truck also needs attention as soon as any service is overdue.</p>
      </section>

      <section aria-labelledby="facts-h">
        <h3 id="facts-h" className="display-face mb-3 text-xl font-bold">
          At a glance
        </h3>
        <div className="grid grid-cols-2 gap-px border border-[#e4e3df] bg-[#e4e3df] md:grid-cols-3">
          <Fact>
            <Stat label="Last signal" value={truck.tracker.last_seen ? relativeDay(truck.tracker.last_seen, now) : EM_DASH} sub={truck.tracker.last_seen ? formatDate(truck.tracker.last_seen) : truck.tracker.label} />
          </Fact>
          <Fact>
            <Stat label="Open issues" value={truck.open_flags_count} sub={truck.critical_flags_count ? `${truck.critical_flags_count} critical` : "none critical"} />
          </Fact>
          <Fact>
            <Stat label="Last pre-trip check" value={<span style={{ color: TONES[lastCheck.tone].fg }}>{lastCheck.label}</span>} sub={lastCheck.sub || "No check logged recently"} />
          </Fact>
          <Fact>
            <Stat label="Failed checks (7 d)" value={truck.failed_checklists_7d} />
          </Fact>
          <Fact>
            <Stat
              label="Battery (latest)"
              value={truck.battery ? <span style={{ color: TONES[batteryTone(truck.battery.status)].fg }}>{batteryStatusLabel(truck.battery.status)}</span> : EM_DASH}
              sub={truck.battery ? `${truck.battery.parked_min != null ? `${truck.battery.parked_min.toFixed(2)} V parked` : "no parked reading"} · ${truck.battery.system ?? "?"} V` : "No data yet"}
            />
          </Fact>
          <Fact>
            <Stat label="Vehicle" value={truck.vehicle_type} sub={truck.is_reefer ? "Reefer" : truck.is_reefer === false ? "Dry" : undefined} />
          </Fact>
        </div>
      </section>

      <section className="flex flex-wrap gap-2" aria-label="Actions">
        {perms.canEdit && (
          <button type="button" className={btnPrimary} onClick={() => ctx.logService()} data-testid="fh-log-service">
            <Wrench size={14} aria-hidden /> Log service
          </button>
        )}
        {perms.canEnter && (
          <button type="button" className={btn} onClick={ctx.newChecklist}>
            <ClipboardCheck size={14} aria-hidden /> New pre-trip check
          </button>
        )}
        {perms.canEnter && (
          <button type="button" className={btn} onClick={ctx.reportIssue}>
            <Siren size={14} aria-hidden /> Report an issue
          </button>
        )}
        {perms.canEdit && (
          <button type="button" className={btn} onClick={ctx.editIntervals}>
            <Gauge size={14} aria-hidden /> Service intervals
          </button>
        )}
        {perms.readOnly && <span className="inline-flex items-center gap-2 text-[13px] text-[#77787b]"><CalendarClock size={14} aria-hidden /> You have read-only access.</span>}
      </section>
    </div>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return <div className="bg-white p-4">{children}</div>;
}

