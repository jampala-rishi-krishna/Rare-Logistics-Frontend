import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ClipboardCheck, ExternalLink, Gauge, History, Pencil, Plus, Siren, Trash2, Wrench } from "lucide-react";
import * as fh from "@/services/api/fleetHealth";
import type { Flag, MaintenanceRecord, ServiceKey } from "@/services/api/fleetHealth";
import {
  EM_DASH,
  SERVICE_LABELS,
  SERVICE_LONG_LABELS,
  SERVICE_ORDER,
  TONES,
  checklistItemLabel,
  flagSourceLabel,
  formatDate,
  formatDateTime,
  formatDowntime,
  formatKm,
  formatNumber,
  formatPeso,
  intervalText,
  serviceStatusLabel,
  serviceTone,
  severityTone,
  usageBarFill,
  SEVERITY_LABELS,
  type Tone,
} from "@/lib/fleetHealth";
import { ConfirmDialog } from "./Modal";
import { EmptyState, InlineError, Pill, SectionHead, btn, btnDanger, btnGhost, btnPrimary, cx, textareaClass } from "./ui";
import { errorMessage, invalidateFleetHealth } from "./hooks";
import type { DrawerCtx } from "./TruckDrawer";

function Head({ title, info, children }: { title: string; info?: string[]; children?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <SectionHead title={title} info={info} aside={children ? <div className="flex flex-wrap gap-2">{children}</div> : undefined} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ services
function LargeBar({ pct, tone, measured }: { pct: number | null; tone: Tone; measured: boolean }) {
  const t = TONES[tone];
  return (
    <div className="relative pb-5">
      <div className={cx("relative h-3 w-full overflow-hidden rounded-[2px]", measured ? "bg-[#ecebe7]" : "border border-dashed border-[#c9c8c4]")} aria-hidden>
        {measured && <div className="absolute inset-y-0 left-0 transition-[width] duration-500" style={{ width: `${usageBarFill(pct)}%`, background: t.solid }} />}
        {measured && <div className="absolute inset-y-0 left-[80%] w-px bg-black/30" />}
      </div>
      {measured && (
        <>
          <span className="absolute top-3.5 text-[10px] text-[#9a9994]" style={{ left: "80%", transform: "translateX(-50%)" }}>
            80% due soon
          </span>
          <span className="absolute right-0 top-3.5 text-[10px] text-[#9a9994]">100% overdue</span>
        </>
      )}
    </div>
  );
}

export function ServicesSection({ ctx }: { ctx: DrawerCtx }) {
  const { truck, detail, perms } = ctx;
  const keys = SERVICE_ORDER.filter((k) => truck.services[k] && (k !== "reefer_service" || truck.is_reefer));
  const records = detail.records ?? [];
  return (
    <div>
      <Head title="Services and intervals" info={["Usage = distance, engine hours or time since the last service, as a % of its interval.", "Due soon from 80%, overdue past 100%. The limit reached first decides."]}>
        {perms.canEdit && (
          <button type="button" className={btn} onClick={ctx.editIntervals} data-testid="fh-edit-intervals">
            <Gauge size={14} aria-hidden /> Edit intervals
          </button>
        )}
      </Head>
      {truck.kind === "no_tracker" && <p className="mb-4 border border-[#e4e3df] bg-white px-4 py-3 text-[13px] leading-5 text-[#55565a]">This vehicle has no tracker, so services are measured by days since the last record. Distance and engine hours are not available.</p>}
      <div className="grid gap-3">
        {keys.map((k) => {
          const s = truck.services[k]!;
          const tone = serviceTone(s.status);
          const measured = s.usage_pct != null && s.status !== "no_record";
          const last = records.find((r) => r.kind === "service" && r.service_type === k);
          return (
            <article key={k} className="border border-[#e4e3df] bg-white p-4" data-testid={`fh-service-${k}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-semibold">{SERVICE_LONG_LABELS[k]}</h3>
                  <Pill tone={tone} dashed={s.status === "no_record"}>
                    {serviceStatusLabel(s.status)}
                    {measured ? `, ${Math.round(s.usage_pct!)}%` : ""}
                  </Pill>
                  {s.interval && !s.interval.confirmed && (
                    <Pill tone="soon" dashed>
                      Placeholder interval
                    </Pill>
                  )}
                </div>
                {perms.canEdit && (
                  <button type="button" className={btn} onClick={() => ctx.logService({ kind: "service", serviceType: k })}>
                    <Plus size={14} aria-hidden /> Log service
                  </button>
                )}
              </div>
              <div className="mt-4">
                <LargeBar pct={s.usage_pct} tone={tone} measured={measured} />
              </div>
              {measured ? (
                <div className="mt-1 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                  {(["km", "engine_hours", "days"] as const).map((c) => {
                    const comp = s.components[c];
                    if (!comp) return null;
                    const unit = c === "km" ? "km" : c === "engine_hours" ? "engine h" : "days";
                    return (
                      <div key={c} className={cx("min-w-0 text-[13px]", s.driven_by === c && "font-semibold")}>
                        <div className="micro text-[#77787b]">
                          {c === "km" ? "Distance" : c === "engine_hours" ? "Engine hours" : "Time"}
                          {s.driven_by === c ? " · limiting" : ""}
                        </div>
                        <div className="mt-1">
                          <span className="mono">{formatNumber(comp.since, c === "engine_hours" ? 1 : 0)}</span>
                          <span className="text-[#77787b]">
                            {" "}
                            of {formatNumber(comp.interval)} {unit}
                          </span>
                        </div>
                        <div className="mono text-xs text-[#77787b]">{Math.round(comp.pct)}%</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1 text-[13px] text-[#77787b]">No service recorded yet, so usage cannot be measured. {perms.canEdit ? "Log the last service to start tracking." : ""}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[#efeeeb] pt-3 text-xs text-[#77787b]">
                <span>
                  {last ? (
                    <>
                      Last service <strong className="font-semibold text-black">{formatDate(last.performed_on)}</strong>
                      {last.odometer_km != null && <> at {formatKm(last.odometer_km)}</>}
                    </>
                  ) : s.last_service_on ? (
                    <>Last service {formatDate(s.last_service_on)}</>
                  ) : (
                    "No service logged"
                  )}
                </span>
                <span>
                  Interval: {intervalText(s.interval ? { km: s.interval.km, engine_hours: s.interval.engine_hours, days: s.interval.days } : null)} ({s.interval?.scope === "truck" ? "this truck" : "fleet default"}, {s.interval?.confirmed ? "confirmed" : "not confirmed"})
                </span>
              </div>
              {s.engine_hours_partial && measured && <p className="mt-2 text-[11px] text-[#9a9994]">Engine hours are counted from the first day of tracker data, so they can undercount.</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ history
const KIND_TONE: Record<MaintenanceRecord["kind"], Tone> = { service: "info", repair: "over", inspection: "none" };

export function HistorySection({ ctx }: { ctx: DrawerCtx }) {
  const { detail, perms, now } = ctx;
  const records = detail.records ?? [];
  const downtimes = records.filter((r) => r.downtime_start);
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<MaintenanceRecord | null>(null);
  const del = useMutation({
    mutationFn: (r: MaintenanceRecord) => fh.deleteRecord(r.id),
    onSuccess: () => {
      invalidateFleetHealth(qc, "maintenance");
      setDeleting(null);
    },
  });
  return (
    <div className="grid gap-8">
      <div>
        <Head title="Maintenance records">
          {perms.canEdit && (
            <button type="button" className={btnPrimary} onClick={() => ctx.logService()}>
              <Plus size={14} aria-hidden /> Add record
            </button>
          )}
        </Head>
        {records.length === 0 ? (
          <div className="border border-[#e4e3df] bg-white">
            <EmptyState icon={History} title="No records yet" body="Services, repairs and inspections you log will appear here, newest first." action={perms.canEdit ? <button type="button" className={btn} onClick={() => ctx.logService()}><Plus size={14} aria-hidden /> Log the first service</button> : undefined} compact />
          </div>
        ) : (
          <ul className="divide-y divide-[#efeeeb] border border-[#e4e3df] bg-white" data-testid="fh-records">
            {records.map((r) => (
              <li key={r.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[96px_1fr_auto] sm:gap-4">
                <div className="text-[13px]">
                  <div className="font-semibold">{formatDate(r.performed_on)}</div>
                  <div className="mt-1.5">
                    <Pill tone={KIND_TONE[r.kind]}>{r.kind === "service" ? "Service" : r.kind === "repair" ? "Repair" : "Inspection"}</Pill>
                  </div>
                </div>
                <div className="min-w-0 text-[13px]">
                  <div className="text-sm font-semibold">{r.kind === "service" && r.service_type ? SERVICE_LONG_LABELS[r.service_type] : r.reason || (r.kind === "repair" ? "Repair" : "Inspection")}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[#55565a]">
                    <span>Odometer {r.odometer_km == null ? EM_DASH : formatKm(r.odometer_km)}</span>
                    <span>Cost {r.cost_php == null ? EM_DASH : formatPeso(r.cost_php)}</span>
                    <span>Vendor {r.vendor || EM_DASH}</span>
                  </div>
                  {r.notes && <div className="mt-1.5 text-[#77787b]">{r.notes}</div>}
                  {r.receipt_ref && (
                    <div className="mt-1 text-xs text-[#77787b]">
                      Receipt: <RefText value={r.receipt_ref} />
                    </div>
                  )}
                </div>
                {perms.canEdit && (
                  <div className="flex gap-1 sm:justify-end">
                    <button type="button" className={btnGhost} onClick={() => ctx.editRecord(r)} aria-label={`Edit record from ${formatDate(r.performed_on)}`}>
                      <Pencil size={13} aria-hidden /> Edit
                    </button>
                    <button type="button" className={cx(btnGhost, "hover:text-[#86000B]")} onClick={() => setDeleting(r)} aria-label={`Delete record from ${formatDate(r.performed_on)}`}>
                      <Trash2 size={13} aria-hidden /> Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Head title="Downtime" info={["Time between the start and end of a repair record.", "An open repair counts until it is closed."]} />
        {downtimes.length === 0 ? (
          <div className="border border-[#e4e3df] bg-white">
            <EmptyState icon={Wrench} title="No downtime recorded" body="Repairs with a downtime start show up here with how long the truck was out." compact />
          </div>
        ) : (
          <ul className="divide-y divide-[#efeeeb] border border-[#e4e3df] bg-white">
            {downtimes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-[13px]">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{r.reason || "Repair"}</div>
                  <div className="mt-1 text-[#55565a]">
                    {formatDateTime(r.downtime_start)} to {r.downtime_end ? formatDateTime(r.downtime_end) : "still open"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="display-face text-lg font-bold">{formatDowntime(r.downtime_start, r.downtime_end, now)}</span>
                  {!r.downtime_end && <Pill tone="over">Open</Pill>}
                  {!r.downtime_end && perms.canEdit && (
                    <button type="button" className={btn} disabled={ctx.closing} onClick={() => ctx.closeDowntime(r)}>
                      Close downtime
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {ctx.closeError && <div className="mt-3"><InlineError>{ctx.closeError}</InlineError></div>}
      </div>

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this record?"
        body={deleting ? `${formatDate(deleting.performed_on)}, ${deleting.kind === "service" && deleting.service_type ? SERVICE_LABELS[deleting.service_type as ServiceKey] : deleting.kind}. Service bars and the risk score are recalculated.` : ""}
        confirmLabel="Delete record"
        danger
        busy={del.isPending}
        error={del.isError ? errorMessage(del.error) : null}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </div>
  );
}

function RefText({ value }: { value: string }) {
  if (/^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#33673B] underline underline-offset-2">
        Open link <ExternalLink size={11} aria-hidden />
      </a>
    );
  }
  return <span className="mono">{value}</span>;
}

// ------------------------------------------------------------------------------------------------ issues
function FlagItem({ flag, canResolve, onDone }: { flag: Flag; canResolve: boolean; onDone: () => void }) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const tone = severityTone(flag.severity);
  const t = TONES[tone];
  const qc = useQueryClient();
  const resolve = useMutation({
    mutationFn: () => fh.resolveFlag(flag.id, note.trim()),
    onSuccess: () => {
      invalidateFleetHealth(qc, "maintenance");
      onDone();
    },
  });
  const resolved = Boolean(flag.resolved_at);
  return (
    <li className="grid gap-2 px-4 py-3.5" data-testid={`fh-flag-${flag.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: t.fg }}>
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: t.solid }} />
          {SEVERITY_LABELS[flag.severity]}
        </span>
        <span className="rounded-[3px] border border-[#d8d7d2] bg-[#fafaf8] px-1.5 py-[3px] text-[10px] font-semibold uppercase leading-none tracking-wide text-[#55565a]">{flagSourceLabel(flag.source)}</span>
        {resolved && <Pill tone="ok" icon={Check}>Resolved</Pill>}
      </div>
      <p className="text-sm leading-6">{flag.message}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#77787b]">
        <span>{flag.reported_by ? `By ${flag.reported_by}` : "Reporter unknown"}</span>
        <span>{formatDateTime(flag.occurred_at || flag.created_at)}</span>
        {flag.ref && <span className="mono">Ref {flag.ref}</span>}
        {flag.photo_ref && <RefText value={flag.photo_ref} />}
      </div>
      {resolved && flag.resolution_note && <div className="border-l-2 border-[#bfdcc9] pl-3 text-[13px] text-[#55565a]">Resolution: {flag.resolution_note}</div>}
      {!resolved && canResolve && (
        <div>
          {!resolving ? (
            <button type="button" className={btn} onClick={() => setResolving(true)}>
              <Check size={14} aria-hidden /> Resolve
            </button>
          ) : (
            <div className="grid gap-2 border border-[#e4e3df] bg-[#fafaf8] p-3">
              <label className="text-[13px] font-semibold" htmlFor={`note-${flag.id}`}>
                Resolution note <span className="font-normal text-[#77787b]">optional</span>
              </label>
              <textarea id={`note-${flag.id}`} value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} rows={2} placeholder="What was done?" />
              {resolve.isError && <InlineError>{errorMessage(resolve.error)}</InlineError>}
              <div className="flex gap-2">
                <button type="button" className={btnPrimary} onClick={() => resolve.mutate()} disabled={resolve.isPending}>
                  {resolve.isPending ? "Resolving…" : "Mark resolved"}
                </button>
                <button type="button" className={btn} onClick={() => setResolving(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function IssuesSection({ ctx }: { ctx: DrawerCtx }) {
  const { detail, perms } = ctx;
  const flags = detail.flags ?? [];
  const open = flags.filter((f) => !f.resolved_at);
  const resolved = flags.filter((f) => f.resolved_at);
  return (
    <div>
      <Head title="Issues">
        {perms.canEnter && (
          <button type="button" className={btnPrimary} onClick={ctx.reportIssue} data-testid="fh-report-issue">
            <Siren size={14} aria-hidden /> Report an issue
          </button>
        )}
      </Head>
      {open.length === 0 ? (
        <div className="border border-[#e4e3df] bg-white">
          <EmptyState icon={Check} tone="ok" title="No open issues" body="Reports from checklists, battery checks, drivers and staff land here until they are resolved." compact />
        </div>
      ) : (
        <ul className="divide-y divide-[#efeeeb] border border-[#e4e3df] bg-white" data-testid="fh-open-flags">
          {open.map((f) => (
            <FlagItem key={f.id} flag={f} canResolve={perms.canEdit} onDone={() => undefined} />
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <details className="group mt-5 border border-[#e4e3df] bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
            <span>Resolved ({resolved.length})</span>
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y divide-[#efeeeb] border-t border-[#e4e3df]">
            {resolved.map((f) => (
              <FlagItem key={f.id} flag={f} canResolve={false} onDone={() => undefined} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ checklists
export function ChecklistSection({ ctx }: { ctx: DrawerCtx }) {
  const { detail, perms } = ctx;
  const list = detail.checklists ?? [];
  return (
    <div>
      <Head title="Pre-trip checklists">
        {perms.canEnter && (
          <button type="button" className={btnPrimary} onClick={ctx.newChecklist} data-testid="fh-new-checklist">
            <ClipboardCheck size={14} aria-hidden /> New pre-trip check
          </button>
        )}
      </Head>
      {list.length === 0 ? (
        <div className="border border-[#e4e3df] bg-white">
          <EmptyState icon={ClipboardCheck} title="No checklists in the last 45 days" body="A quick walk-around before each trip keeps small problems from becoming breakdowns." action={perms.canEnter ? <button type="button" className={btn} onClick={ctx.newChecklist}><Plus size={14} aria-hidden /> Start a pre-trip check</button> : undefined} compact />
        </div>
      ) : (
        <ul className="divide-y divide-[#efeeeb] border border-[#e4e3df] bg-white">
          {list.map((c) => {
            const failed = Object.entries(c.items).filter(([, v]) => v === "issue").map(([k]) => k);
            return (
              <li key={c.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[150px_1fr] sm:gap-4">
                <div>
                  <div className="text-[13px] font-semibold">{formatDateTime(c.checked_at)}</div>
                  <div className="mt-1.5">{c.passed ? <Pill tone="ok" icon={Check}>Pass</Pill> : <Pill tone="over">Fail</Pill>}</div>
                </div>
                <div className="min-w-0 text-[13px]">
                  {failed.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {failed.map((k) => (
                        <span key={k} className="rounded-[3px] border border-[#f0c4c1] bg-[#fdeeed] px-2 py-1 text-xs font-medium text-[#86000B]">
                          {checklistItemLabel(k)}: issue
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[#55565a]">All items OK or not applicable.</span>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-[#77787b]">
                    {c.reefer_temp_c != null && <span>Reefer {c.reefer_temp_c} °C</span>}
                    {c.notes && <span>{c.notes}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
