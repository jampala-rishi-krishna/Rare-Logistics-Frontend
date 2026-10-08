import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Fuel, Leaf, Pencil, Plus, ScanSearch, Trash2 } from "lucide-react";
import * as fh from "@/services/api/fleetHealth";
import type { Co2Response, FuelChecksResponse, FuelLogRow, FuelLogsResponse } from "@/services/api/fleetHealth";
import {
  EM_DASH,
  co2Formula,
  formatDate,
  formatDateTime,
  formatKg,
  formatLitres,
  formatKmpl,
  formatMonth,
  formatNumber,
  formatPeso,
  formatPesoPerLitre,
  type FleetPermissions,
} from "@/lib/fleetHealth";
import { ConfirmDialog } from "./Modal";
import { Card, CapacityMarker, EmptyState, ErrorPanel, Pill, PlateText, SectionHead, SegmentedControl, Stat, TableSkeleton, ChartSkeleton, Tip, btn, btnGhost, btnPrimary, cx } from "./ui";
import { Co2Chart } from "./charts";
import { errorMessage, invalidateFleetHealth } from "./hooks";

// ------------------------------------------------------------------------------------------------ fuel log
const PAGE = 10;

export function FuelLogPanel({ data, loading, error, onRetry, perms, onAdd, onEdit }: { data: FuelLogsResponse | undefined; loading: boolean; error: unknown; onRetry: () => void; perms: FleetPermissions; onAdd: () => void; onEdit: (log: FuelLogRow) => void }) {
  const qc = useQueryClient();
  const [shown, setShown] = useState(PAGE);
  const [deleting, setDeleting] = useState<FuelLogRow | null>(null);
  const del = useMutation({
    mutationFn: (l: FuelLogRow) => fh.deleteFuelLog(l.id),
    onSuccess: () => {
      invalidateFleetHealth(qc, "fuel");
      setDeleting(null);
    },
  });
  const logs = data?.logs ?? [];
  const visible = logs.slice(0, shown);
  return (
    <Card className="entrance entrance-2" data-testid="fh-fuel-log">
      <div className="border-b border-[#e4e3df] p-4 md:px-5">
        <SectionHead
          eyebrow="Fuel"
          title="Fuel log"
          info={["Every fill-up entered by staff, newest first.", "₱/L = amount paid / litres. km/L is measured between two full-tank fills."]}
          aside={
            perms.canEnter ? (
              <button type="button" className={btnPrimary} onClick={onAdd} data-testid="fh-add-fuel">
                <Plus size={14} aria-hidden /> Add fill-up
              </button>
            ) : undefined
          }
        />
      </div>
      {loading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} title="Could not load the fuel log" className="m-4" />
      ) : logs.length === 0 ? (
        <EmptyState icon={Fuel} title="No fuel fills yet" body="Add fill-ups to see km/L, fuel spend and CO2 for each truck." action={perms.canEnter ? <button type="button" className={btn} onClick={onAdd}><Plus size={14} aria-hidden /> Add the first fill-up</button> : undefined} compact />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#e4e3df] bg-[#fafaf8] text-[#77787b]">
                  <th scope="col" className="micro py-3 pl-5 pr-2.5 text-left font-medium">Date</th>
                  <th scope="col" className="micro px-2.5 py-3 text-left font-medium">Truck</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Litres</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">₱/L</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Odometer</th>
                  <th scope="col" className="micro px-2.5 py-3 text-left font-medium">Full</th>
                  <th scope="col" className="micro px-2.5 py-3 text-left font-medium">Station</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">km/L</th>
                  <th scope="col" className={cx("micro py-3 pl-2.5 text-left font-medium", perms.canEdit ? "" : "pr-5")}>Check</th>
                  {perms.canEdit && <th scope="col" className="w-[84px] py-3 pr-5"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efeeeb]">
                {visible.map((l) => (
                  <tr key={l.id} className="align-middle" data-testid={`fh-fill-${l.id}`}>
                    <td className="whitespace-nowrap py-3 pl-5 pr-2.5">{formatDate(l.filled_at)}</td>
                    <td className="px-2.5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PlateText>{l.plate ?? EM_DASH}</PlateText>
                        {l.capacity_unconfirmed && <CapacityMarker compact />}
                      </div>
                    </td>
                    <td className="mono px-2.5 py-3 text-right">{formatNumber(l.litres, 1)}</td>
                    <td className="mono px-2.5 py-3 text-right">{formatPeso(l.amount_php)}</td>
                    <td className="mono px-2.5 py-3 text-right text-[#55565a]">{formatNumber(l.price_per_litre, 2)}</td>
                    <td className="mono px-2.5 py-3 text-right">{l.odometer_km == null ? <span className="text-[#b9b8b3]">{EM_DASH}</span> : formatNumber(l.odometer_km)}</td>
                    <td className="px-2.5 py-3">{l.full_tank ? <Pill tone="info">Full</Pill> : <span className="text-[#b9b8b3]">{EM_DASH}</span>}</td>
                    <td className="max-w-[140px] truncate px-2.5 py-3 text-[#55565a]" title={l.station ?? undefined}>{l.station || <span className="text-[#b9b8b3]">{EM_DASH}</span>}</td>
                    <td className="mono px-2.5 py-3 text-right">
                      {l.kmpl == null ? (
                        <span className="text-[#b9b8b3]">{EM_DASH}</span>
                      ) : (
                        <Tip label={`${l.kmpl} km per litre`} content={`Closes a full-to-full interval: ${formatNumber(l.interval_km, 0)} km since the previous full-tank fill.`} className="text-right"><span>{formatNumber(l.kmpl, 2)}</span></Tip>
                      )}
                    </td>
                    <td className={cx("py-3 pl-2.5", perms.canEdit ? "" : "pr-5")}>
                      {l.check ? (
                        <Tip label="Check: show reason" content={l.check}><Pill tone="soon">Check</Pill></Tip>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#1e7b44]"><Check size={14} aria-hidden /><span className="sr-only">OK</span></span>
                      )}
                    </td>
                    {perms.canEdit && (
                      <td className="py-3 pr-5">
                        <div className="flex justify-end gap-0.5">
                          <button type="button" className={cx(btnGhost, "h-8 px-2")} onClick={() => onEdit(l)} aria-label={`Edit fill-up for ${l.plate} on ${formatDate(l.filled_at)}`}><Pencil size={13} aria-hidden /></button>
                          <button type="button" className={cx(btnGhost, "h-8 px-2 hover:text-[#86000B]")} onClick={() => setDeleting(l)} aria-label={`Delete fill-up for ${l.plate} on ${formatDate(l.filled_at)}`}><Trash2 size={13} aria-hidden /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-[#efeeeb] md:hidden" data-testid="fh-fuel-cards">
            {visible.map((l) => (
              <li key={l.id} className="grid gap-2 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PlateText className="text-[15px]">{l.plate ?? EM_DASH}</PlateText>
                      {l.capacity_unconfirmed && <CapacityMarker compact />}
                    </div>
                    <div className="mt-1 text-xs text-[#77787b]">{formatDate(l.filled_at)}{l.station ? ` · ${l.station}` : ""}</div>
                  </div>
                  {l.check ? <Tip label="Check: show reason" content={l.check}><Pill tone="soon">Check</Pill></Tip> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e7b44]"><Check size={14} aria-hidden />OK</span>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-[13px]">
                  <Stat label="Litres" value={<span className="mono">{formatNumber(l.litres, 1)}</span>} />
                  <Stat label="Amount" value={<span className="mono">{formatPeso(l.amount_php)}</span>} sub={formatPesoPerLitre(l.price_per_litre)} />
                  <Stat label="km/L" value={<span className="mono">{l.kmpl == null ? EM_DASH : formatNumber(l.kmpl, 2)}</span>} sub={l.full_tank ? "Full tank" : undefined} />
                </div>
                {l.check && <div className="text-xs leading-4 text-[#8a5a00]">{l.check}</div>}
                {perms.canEdit && (
                  <div className="flex gap-2 pt-1">
                    <button type="button" className={btn} onClick={() => onEdit(l)}><Pencil size={13} aria-hidden /> Edit</button>
                    <button type="button" className={cx(btn, "text-[#86000B]")} onClick={() => setDeleting(l)}><Trash2 size={13} aria-hidden /> Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {logs.length > shown && (
            <div className="border-t border-[#efeeeb] p-3 text-center">
              <button type="button" className={btn} onClick={() => setShown((n) => n + PAGE)}>
                Show more ({logs.length - shown} left)
              </button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this fill-up?"
        body={deleting ? `${deleting.plate}, ${formatLitres(deleting.litres)} on ${formatDate(deleting.filled_at)}. km/L, spend and CO2 are recalculated.` : ""}
        confirmLabel="Delete fill-up"
        danger
        busy={del.isPending}
        error={del.isError ? errorMessage(del.error) : null}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ fuel checks
export function FuelChecksPanel({ data, loading, error, onRetry, unconfirmedPlates }: { data: FuelChecksResponse | undefined; loading: boolean; error: unknown; onRetry: () => void; unconfirmedPlates: Set<string> }) {
  const sensor = data?.sensor_checks ?? [];
  const log = data?.log_checks ?? [];
  const none = data && sensor.length === 0 && log.length === 0;
  return (
    <Card className="entrance entrance-2" data-testid="fh-fuel-checks">
      <div className="border-b border-[#e4e3df] p-4 md:px-5">
        <SectionHead eyebrow="Fuel" title="Sensor fuel checks" info={["Estimates from the analog fuel sensor, not conclusions.", "A drop while parked can also be sensor noise, a slope or a refuel that was not logged."]} />
        <p className="mt-3 text-[13px] leading-5 text-[#77787b]">{data?.label ?? "Estimates from the analog fuel sensor: they are checks, not conclusions."} Last {data?.days ?? 30} days.</p>
      </div>
      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} title="Could not load fuel checks" className="m-4" />
      ) : none ? (
        <EmptyState icon={ScanSearch} tone="ok" title="Nothing to check" body="No unusual fuel movements or fill sizes in the last 30 days." compact />
      ) : (
        <div className="grid gap-0">
          {sensor.length > 0 && (
            <div>
              <div className="micro border-b border-[#efeeeb] bg-[#fafaf8] px-5 py-2.5 text-[#77787b]">From the fuel sensor (estimates)</div>
              <ul className="divide-y divide-[#efeeeb]">
                {sensor.map((c, i) => (
                  <li key={`${c.plate}-${c.date}-${c.kind}-${i}`} className="grid gap-1.5 px-4 py-3.5 md:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlateText className="text-[13px]">{c.plate}</PlateText>
                      <span className="text-xs text-[#77787b]">{formatDate(c.date)}</span>
                      <Pill tone={c.kind === "parked_drop" ? "soon" : "info"}>{c.kind === "parked_drop" ? "Parked drop" : "Refuel"} · est. {formatNumber(c.litres_est, 0)} L</Pill>
                      {c.plate && unconfirmedPlates.has(c.plate) && <CapacityMarker compact />}
                    </div>
                    <p className="text-[13px] leading-5 text-[#55565a]">{c.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {log.length > 0 && (
            <div>
              <div className="micro border-y border-[#efeeeb] bg-[#fafaf8] px-5 py-2.5 text-[#77787b]">From the fuel log</div>
              <ul className="divide-y divide-[#efeeeb]">
                {log.map((c) => (
                  <li key={`${c.fill_id}-${c.filled_at}`} className="grid gap-1.5 px-4 py-3.5 md:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlateText className="text-[13px]">{c.plate}</PlateText>
                      <span className="text-xs text-[#77787b]">{formatDateTime(c.filled_at)}</span>
                      <Pill tone="soon">Check</Pill>
                      {c.plate && unconfirmedPlates.has(c.plate) && <CapacityMarker compact />}
                    </div>
                    <p className="text-[13px] leading-5 text-[#55565a]">{c.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ CO2
export function Co2Panel({ data, loading, error, onRetry, perms, onAdd }: { data: Co2Response | undefined; loading: boolean; error: unknown; onRetry: () => void; perms: FleetPermissions; onAdd: () => void }) {
  const [mode, setMode] = useState<"fleet" | "trucks">("fleet");
  const months = data?.months ?? [];
  const last = months[months.length - 1];
  return (
    <Card className="entrance entrance-3" data-testid="fh-co2">
      <div className="border-b border-[#e4e3df] p-4 md:px-5">
        <SectionHead
          eyebrow="Emissions"
          title="CO2 from diesel"
          info={[data?.formula ?? co2Formula(), "Based on litres in the fuel log, by month (Manila time)."]}
          aside={months.length > 0 ? <SegmentedControl<"fleet" | "trucks"> label="CO2 view" size="sm" value={mode} onChange={setMode} options={[{ value: "fleet", label: "Fleet" }, { value: "trucks", label: "By truck" }]} /> : undefined}
        />
      </div>
      {loading ? (
        <div className="p-5"><ChartSkeleton /></div>
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} title="Could not load CO2" className="m-4" />
      ) : months.length === 0 ? (
        <EmptyState icon={Leaf} title="Add fuel fills to see CO2" body={`CO2 is worked out from diesel litres in the fuel log. ${co2Formula(data?.kg_per_litre ?? 2.68)}.`} action={perms.canEnter ? <button type="button" className={btn} onClick={onAdd}><Plus size={14} aria-hidden /> Add a fill-up</button> : undefined} compact />
      ) : (
        <div className="grid gap-4 p-4 md:p-5">
          {last && (
            <div className="grid grid-cols-3 gap-px border border-[#e4e3df] bg-[#e4e3df]">
              <div className="bg-white p-3.5"><Stat label={formatMonth(last.month)} value={formatKg(last.co2_kg, 0)} sub="CO2" /></div>
              <div className="bg-white p-3.5"><Stat label="Diesel" value={formatLitres(last.litres, 0)} sub="that month" /></div>
              <div className="bg-white p-3.5"><Stat label="Factor" value={`${data?.kg_per_litre ?? 2.68}`} sub="kg CO2 per litre" /></div>
            </div>
          )}
          <Co2Chart months={months} mode={mode} kgPerLitre={data?.kg_per_litre ?? 2.68} />
          <p className="text-xs text-[#77787b]">{data?.formula ?? co2Formula()}</p>
        </div>
      )}
    </Card>
  );
}

export { formatKmpl };
