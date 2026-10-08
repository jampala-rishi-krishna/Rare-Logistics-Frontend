import { useState } from "react";
import { ChevronLeft, ChevronRight, Info, Trophy, UserX } from "lucide-react";
import type { EcoDriver, EcoDriversResponse, EcoTruckRollup, EcoTrucksResponse, EcoWeights } from "@/services/api/fleetHealth";
import {
  ECO_BAND_LABELS,
  EM_DASH,
  TONES,
  ecoFormulaLines,
  ecoSegments,
  ecoTone,
  formatKm,
  formatKmpl,
  formatLitres,
  formatMinutes,
  formatNumber,
  formatPeso,
  formatKg,
  idleSplit,
  kmSplit,
  perHundredKm,
  rollupHasNoData,
  trendMeta,
  weekRangeLabel,
  formatSeconds,
  type Segment,
} from "@/lib/fleetHealth";
import { Card, CapacityMarker, EmptyState, ErrorPanel, FormulaTip, Pill, PlateText, SectionHead, SegmentedControl, Sk, TableSkeleton, Tip, btn, cx, iconBtn } from "./ui";

const ECO_COLORS: Record<string, string> = { speeding: "#86000B", harsh: "#0b0b0b", idle: "#d89b00", kmpl: "#5b7f95" };

// ------------------------------------------------------------------------------------------------ week picker
export function WeekPicker({ weekStart, weekEnd, onPrev, onNext, onReset, canNext, isDefault, loading }: { weekStart: string | undefined; weekEnd: string | undefined; onPrev: () => void; onNext: () => void; onReset: () => void; canNext: boolean; isDefault: boolean; loading: boolean }) {
  return (
    <div className="flex items-center gap-2" data-testid="fh-week-picker">
      <button type="button" className={iconBtn} onClick={onPrev} aria-label="Previous week" disabled={!weekStart}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <div className="min-w-[188px] text-center" aria-live="polite">
        <div className="micro text-[#77787b]">Week</div>
        {loading || !weekStart || !weekEnd ? <Sk className="mx-auto mt-1.5 h-4 w-40" /> : <div className="display-face mt-0.5 text-[17px] font-bold">{weekRangeLabel(weekStart, weekEnd)}</div>}
      </div>
      <button type="button" className={iconBtn} onClick={onNext} aria-label="Next week" disabled={!canNext}>
        <ChevronRight size={16} aria-hidden />
      </button>
      {!isDefault && (
        <button type="button" className={cx(btn, "ml-1")} onClick={onReset}>
          Last full week
        </button>
      )}
    </div>
  );
}

export function EcoExplainer({ minKm }: { minKm: number }) {
  return (
    <div className="flex items-start gap-2.5 border border-[#e4e3df] bg-white px-4 py-3 text-[13px] leading-5 text-[#55565a]" data-testid="fh-eco-explainer">
      <Info size={15} className="mt-0.5 shrink-0 text-[#77787b]" aria-hidden />
      <p>
        Scores run Monday to Sunday and need <strong className="text-black">at least {minKm} km</strong> that week. Idling at stops (warehouses, customer sites) is not penalised. Days with no assignment are excluded from every driver's score.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ score badge
export function ScoreBadge({ driver, size = "lg" }: { driver: EcoDriver; size?: "lg" | "sm" }) {
  const tone = TONES[ecoTone(driver.band)];
  return (
    <span className={cx("inline-flex items-center gap-2.5", size === "sm" && "gap-2")}>
      <span className={cx("grid place-items-center border font-bold leading-none", size === "lg" ? "h-12 w-12 text-[22px]" : "h-9 w-9 text-base")} style={{ color: tone.fg, background: tone.bg, borderColor: tone.border }}>
        <span className="display-face">{driver.score}</span>
      </span>
      <span className="text-[12px] font-semibold" style={{ color: tone.fg }}>
        {ECO_BAND_LABELS[driver.band]}
      </span>
    </span>
  );
}

function PenaltyBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-2 w-24 overflow-hidden rounded-[2px] bg-[#ecebe7]" aria-hidden>
        {segments.map((s) => (
          <span key={s.key} style={{ width: `${s.width}%`, background: ECO_COLORS[s.key] ?? "#0b0b0b" }} className="border-r border-white/70 last:border-0" />
        ))}
      </span>
      <span className="mono text-[11px] text-[#77787b]">{total > 0 ? `-${Math.round(total)}` : "0"}</span>
    </span>
  );
}

function ScoreTipContent({ driver, weights }: { driver: EcoDriver; weights: EcoWeights }) {
  return (
    <div className="grid min-w-[260px] gap-2">
      <div className="font-medium">
        {driver.name}: {driver.score} / 100 ({ECO_BAND_LABELS[driver.band]})
      </div>
      <div className="grid gap-1.5">
        {driver.breakdown.map((b) => (
          <div key={b.key} className="grid gap-0.5 border-t border-white/15 pt-1.5 first:border-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span>{b.label}</span>
              <span className="mono text-[11px]">
                -{b.penalty} / max {b.cap}
              </span>
            </div>
            <div className="text-[#d6d6d1]">{b.detail}</div>
            <div className="text-[11px] text-[#a9a9a4]">{b.formula}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/15 pt-1.5 text-[11px] text-[#a9a9a4]">{ecoFormulaLines(weights)[0]}</div>
    </div>
  );
}

function ScoreCell({ driver, weights }: { driver: EcoDriver; weights: EcoWeights }) {
  const segs = ecoSegments(driver.breakdown);
  return (
    <Tip label={`${driver.name}: eco score ${driver.score}, ${ECO_BAND_LABELS[driver.band]}. Show breakdown`} content={<ScoreTipContent driver={driver} weights={weights} />}>
      <span className="grid gap-1.5">
        <ScoreBadge driver={driver} />
        <PenaltyBar segments={segs} />
      </span>
    </Tip>
  );
}

function TrendCell({ trend }: { trend: number | null }) {
  const t = trendMeta(trend);
  return (
    <span className="inline-flex items-center gap-1 font-semibold" style={{ color: TONES[t.tone].fg }} title={t.label}>
      <span aria-hidden className="text-[10px]">{t.symbol}</span>
      <span className="mono text-[13px]">{t.text}</span>
      <span className="sr-only">{t.label}</span>
    </span>
  );
}

function NotEnough({ driver }: { driver: EcoDriver }) {
  return (
    <div className="grid gap-1">
      <Pill tone="none" dashed>
        Not enough data
      </Pill>
      <span className="text-xs text-[#77787b]">{driver.reason ?? "Needs at least 50 km in the week."}</span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ summary strip
export function SummaryStrip({ data }: { data: EcoDriversResponse }) {
  const items: { label: string; value: string; sub: string; info?: string[] }[] = [
    { label: "Average score", value: data.summary.avg_score == null ? EM_DASH : String(data.summary.avg_score), sub: data.summary.avg_score == null ? "no scored drivers this week" : "of scored drivers", info: ["Mean of the scored drivers' eco scores for this week."] },
    { label: "Scored drivers", value: String(data.summary.scored), sub: `at least ${data.min_km} km this week` },
    { label: "Not enough data", value: String(data.summary.not_enough_data), sub: `under ${data.min_km} km, not ranked` },
    { label: "Unassigned km", value: formatNumber(data.unassigned.km, 0), sub: `${data.unassigned.days} days with no assignment data, idle not classified`, info: [data.unassigned.note] },
  ];
  return (
    <div className="grid grid-cols-2 gap-px border border-[#e4e3df] bg-[#e4e3df] lg:grid-cols-4" data-testid="fh-eco-summary">
      {items.map((i) => (
        <div key={i.label} className="min-w-0 bg-white p-4 md:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="micro text-[#77787b]">{i.label}</span>
            {i.info && <FormulaTip lines={i.info} />}
          </div>
          <div className="display-face mt-2.5 text-[30px] font-bold leading-none">{i.value}</div>
          <div className="mt-2 text-xs leading-4 text-[#77787b]">{i.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ leaderboard
function Speeding({ d }: { d: EcoDriver }) {
  return (
    <Tip label="Speeding details" content={<div>{d.totals.speeding_events} events, {formatSeconds(d.totals.speeding_seconds)} over the limit in {formatKm(d.totals.assigned_km)} = {perHundredKm(d.totals.speeding_seconds, d.totals.assigned_km, 0)} s per 100 km</div>}>
      <span className="grid">
        <span className="mono text-[13px] font-medium">{formatNumber(d.totals.speeding_events)}</span>
        <span className="text-[11px] text-[#77787b]">{formatSeconds(d.totals.speeding_seconds)}</span>
      </span>
    </Tip>
  );
}

export function Leaderboard({ data, loading, error, onRetry }: { data: EcoDriversResponse | undefined; loading: boolean; error: unknown; onRetry: () => void }) {
  const drivers = data?.drivers ?? [];
  return (
    <Card className="entrance entrance-1" data-testid="fh-leaderboard">
      <div className="border-b border-[#e4e3df] p-4 md:px-5">
        <SectionHead eyebrow="Eco driving" title="Driver leaderboard" info={data ? ecoFormulaLines(data.weights) : ["Score = 100 minus penalties for speeding, harsh driving, idling away from stops and poor fuel economy."]} />
      </div>
      {loading ? (
        <TableSkeleton rows={4} cols={8} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} title="Could not load driver scores" className="m-4" />
      ) : drivers.length === 0 ? (
        <EmptyState icon={UserX} title="No assigned driving this week" body="Scores are built from days where a driver was assigned to a truck. Pick another week, or check back once assignments are recorded." compact />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#e4e3df] bg-[#fafaf8] text-[#77787b]">
                  <th scope="col" className="micro w-14 py-3 pl-5 pr-2 text-left font-medium">#</th>
                  <th scope="col" className="micro px-2.5 py-3 text-left font-medium">Driver</th>
                  <th scope="col" className="micro px-2.5 py-3 text-left font-medium">Eco score</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">km</th>
                  <th scope="col" className="micro px-2.5 py-3 text-left font-medium">Speeding</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Harsh</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Idle elsewhere</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Idle at stops</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">km/L</th>
                  <th scope="col" className="micro py-3 pl-2.5 pr-5 text-left font-medium">vs last week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efeeeb]">
                {drivers.map((d) => {
                  const scored = d.status === "scored" && d.score != null;
                  return (
                    <tr key={d.staff_id} className={cx("align-middle", !scored && "bg-[#fafaf8]")} data-testid={`fh-driver-${d.staff_id}`}>
                      <td className="py-4 pl-5 pr-2">
                        {d.rank != null ? <span className="display-face text-lg font-bold">{d.rank}</span> : <span className="text-[#b9b8b3]">{EM_DASH}</span>}
                      </td>
                      <td className="min-w-[150px] px-2.5 py-4">
                        <div className="text-sm font-semibold">{d.name}</div>
                        <div className="mono mt-0.5 text-[11px] text-[#77787b]">{d.trucks.join(" · ")}</div>
                      </td>
                      <td className="px-2.5 py-4">{scored && data ? <ScoreCell driver={d} weights={data.weights} /> : <NotEnough driver={d} />}</td>
                      <td className="mono px-2.5 py-4 text-right">{formatNumber(d.totals.assigned_km, 0)}</td>
                      <td className="px-2.5 py-4">{scored ? <Speeding d={d} /> : <span className="text-[#b9b8b3]">{EM_DASH}</span>}</td>
                      <td className="mono px-2.5 py-4 text-right">{scored ? formatNumber(d.totals.harsh_events) : <span className="text-[#b9b8b3]">{EM_DASH}</span>}</td>
                      <td className="mono px-2.5 py-4 text-right">{scored ? formatMinutes(d.totals.idle_elsewhere_min) : <span className="text-[#b9b8b3]">{EM_DASH}</span>}</td>
                      <td className="px-2.5 py-4 text-right">
                        {scored ? (
                          <Tip label="Idle at stops is not penalised" content="Engine idling at warehouses and customer sites is normal for deliveries, so it is shown for information only." className="text-right">
                            <span className="grid justify-items-end">
                              <span className="mono text-[13px] text-[#9a9994]">{formatMinutes(d.totals.idle_at_stop_min)}</span>
                              <span className="text-[10px] text-[#b9b8b3]">not penalised</span>
                            </span>
                          </Tip>
                        ) : (
                          <span className="text-[#b9b8b3]">{EM_DASH}</span>
                        )}
                      </td>
                      <td className="mono px-2.5 py-4 text-right">
                        {d.kmpl == null ? (
                          <Tip label="No km/L this week" content="km/L needs two full-tank fills inside the week for this driver's trucks." className="text-right"><span className="text-[#b9b8b3]">{EM_DASH}</span></Tip>
                        ) : (
                          formatNumber(d.kmpl, 2)
                        )}
                      </td>
                      <td className="py-4 pl-2.5 pr-5">{scored ? <TrendCell trend={d.trend} /> : <span className="text-[#b9b8b3]">{EM_DASH}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 md:hidden" data-testid="fh-driver-cards">
            {drivers.map((d) => {
              const scored = d.status === "scored" && d.score != null;
              return (
                <article key={d.staff_id} className={cx("border border-[#e4e3df] p-4", scored ? "bg-white" : "bg-[#fafaf8]")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="display-face w-5 shrink-0 pt-0.5 text-lg font-bold">{d.rank ?? EM_DASH}</span>
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold">{d.name}</div>
                        <div className="mono mt-0.5 truncate text-[11px] text-[#77787b]">{d.trucks.join(" · ")}</div>
                      </div>
                    </div>
                    {scored && data ? <ScoreCell driver={d} weights={data.weights} /> : null}
                  </div>
                  {!scored ? (
                    <div className="mt-3"><NotEnough driver={d} /></div>
                  ) : (
                    <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3 border-t border-[#efeeeb] pt-3 text-[13px]">
                      <Mini label="km" value={formatNumber(d.totals.assigned_km, 0)} />
                      <Mini label="Speeding" value={`${d.totals.speeding_events}`} sub={formatSeconds(d.totals.speeding_seconds)} />
                      <Mini label="Harsh" value={`${d.totals.harsh_events}`} />
                      <Mini label="Idle elsewhere" value={formatMinutes(d.totals.idle_elsewhere_min)} />
                      <Mini label="Idle at stops" value={formatMinutes(d.totals.idle_at_stop_min)} sub="not penalised" muted />
                      <Mini label="km/L" value={d.kmpl == null ? EM_DASH : formatNumber(d.kmpl, 2)} />
                      <div className="col-span-3 flex items-center justify-between border-t border-[#efeeeb] pt-2.5">
                        <span className="micro text-[#77787b]">vs last week</span>
                        <TrendCell trend={d.trend} />
                      </div>
                    </dl>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function Mini({ label, value, sub, muted }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="micro text-[#77787b]">{label}</dt>
      <dd className={cx("mono mt-1 text-[13px] font-medium", muted && "text-[#9a9994]")}>{value}</dd>
      {sub && <div className="text-[10px] text-[#9a9994]">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ trucks view
export type RangeDays = 7 | 30 | 90;

export function RangePresets({ value, onChange }: { value: RangeDays; onChange: (v: RangeDays) => void }) {
  return (
    <SegmentedControl
      label="Date range"
      value={String(value) as "7" | "30" | "90"}
      onChange={(v) => onChange(Number(v) as RangeDays)}
      options={[
        { value: "7", label: "7 days" },
        { value: "30", label: "30 days" },
        { value: "90", label: "90 days" },
      ]}
    />
  );
}

function SplitBar({ parts }: { parts: { pct: number; color: string; label: string; value: string; dashed?: boolean }[] }) {
  return (
    <Tip
      label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}
      content={
        <div className="grid gap-1">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-[1px]" style={{ background: p.color }} />{p.label}</span>
              <span className="mono text-[11px]">{p.value}</span>
            </div>
          ))}
        </div>
      }
      className="block w-full"
    >
      <span className="flex h-2.5 w-full overflow-hidden rounded-[2px] bg-[#ecebe7]" aria-hidden>
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${p.pct}%`, background: p.color }} className="border-r border-white/70 last:border-0" />
        ))}
      </span>
    </Tip>
  );
}

function KmplCell({ r }: { r: EcoTruckRollup }) {
  if (r.kmpl == null)
    return (
      <Tip label="No km/L" content="km/L needs two full-tank fills (full-to-full) in the fuel log. Add fills to see it." className="text-right">
        <span className="text-[#b9b8b3]">{EM_DASH}</span>
      </Tip>
    );
  return (
    <Tip label={`km/L ${r.kmpl}`} content={`Full-to-full only: ${r.kmpl_intervals} interval${r.kmpl_intervals === 1 ? "" : "s"} in this range.`} className="text-right">
      <span className="mono">{formatNumber(r.kmpl, 2)}</span>
    </Tip>
  );
}

export function TruckView({ data, loading, error, onRetry, range, onRange }: { data: EcoTrucksResponse | undefined; loading: boolean; error: unknown; onRetry: () => void; range: RangeDays; onRange: (v: RangeDays) => void }) {
  const trucks = data?.trucks ?? [];
  return (
    <Card className="entrance entrance-1" data-testid="fh-truck-view">
      <div className="grid gap-3 border-b border-[#e4e3df] p-4 md:px-5">
        <SectionHead
          eyebrow="Eco driving"
          title="Truck view"
          info={["Per tracked truck for the date range. km/L uses full-to-full fills only.", "Idle at stops is not penalised; unclassified idle happened on days with no assignment data."]}
          aside={<RangePresets value={range} onChange={onRange} />}
        />
        {data && <div className="text-xs text-[#77787b]">{data.from} to {data.to}</div>}
      </div>
      {loading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} title="Could not load the truck view" className="m-4" />
      ) : trucks.length === 0 ? (
        <EmptyState icon={Trophy} title="No tracked trucks" body="Tracked trucks appear here once the tracker data has been processed." compact />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1000px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#e4e3df] bg-[#fafaf8] text-[#77787b]">
                  <th scope="col" className="micro w-[170px] py-3 pl-5 pr-2.5 text-left font-medium">Truck</th>
                  <th scope="col" className="micro px-2.5 py-3 text-left font-medium">km (assigned / unassigned)</th>
                  <th scope="col" className="micro px-2.5 py-3 text-left font-medium">Idle split</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Speeding</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Harsh</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">km/L</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Litres</th>
                  <th scope="col" className="micro px-2.5 py-3 text-right font-medium">Spend</th>
                  <th scope="col" className="micro py-3 pl-2.5 pr-5 text-right font-medium">CO2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efeeeb]">
                {trucks.map((r) => {
                  const none = rollupHasNoData(r.totals, r.litres);
                  const km = kmSplit(r.totals);
                  const idle = idleSplit(r.totals);
                  return (
                    <tr key={r.vehicle_id} className="align-middle" data-testid={`fh-eco-truck-${r.plate}`}>
                      <td className="py-4 pl-5 pr-2.5">
                        <PlateText className="text-[14px]">{r.plate}</PlateText>
                        {r.capacity_unconfirmed && <div className="mt-1.5"><CapacityMarker compact /></div>}
                      </td>
                      {none ? (
                        <td colSpan={8} className="px-2.5 py-4 text-[13px] text-[#77787b]">
                          <span className="inline-flex items-center gap-2"><Pill tone="none" dashed>No data yet</Pill> No trips or fuel logs in this range.</span>
                        </td>
                      ) : (
                        <>
                          <td className="min-w-[190px] px-2.5 py-4">
                            <div className="mono mb-1.5 text-[13px] font-medium">{formatKm(r.totals.km, 0)}</div>
                            <SplitBar parts={[
                              { pct: km.assignedPct, color: "#33673B", label: "Assigned", value: formatKm(r.totals.assigned_km, 0) },
                              { pct: km.unassignedPct, color: "#c9c8c4", label: "Unassigned", value: formatKm(r.totals.unassigned_km, 0) },
                            ]} />
                          </td>
                          <td className="min-w-[190px] px-2.5 py-4">
                            <div className="mono mb-1.5 text-[13px] font-medium">{formatMinutes(idle.total)}</div>
                            <SplitBar parts={[
                              { pct: idle.atStopPct, color: "#9a9994", label: "At stops (not penalised)", value: formatMinutes(idle.atStop) },
                              { pct: idle.elsewherePct, color: "#d89b00", label: "Elsewhere", value: formatMinutes(idle.elsewhere) },
                              { pct: idle.unclassifiedPct, color: "#e4e3df", label: "Unclassified (no assignment)", value: formatMinutes(idle.unclassified) },
                            ]} />
                          </td>
                          <td className="px-2.5 py-4 text-right">
                            <span className="mono">{formatNumber(r.totals.speeding_events)}</span>
                            <div className="text-[11px] text-[#77787b]">{formatSeconds(r.totals.speeding_seconds)}</div>
                          </td>
                          <td className="mono px-2.5 py-4 text-right">{formatNumber(r.totals.harsh_events)}</td>
                          <td className="px-2.5 py-4 text-right"><KmplCell r={r} /></td>
                          <td className="mono px-2.5 py-4 text-right">{r.litres == null ? <span className="text-[#b9b8b3]">{EM_DASH}</span> : formatLitres(r.litres)}</td>
                          <td className="mono px-2.5 py-4 text-right">{r.spend_php == null ? <span className="text-[#b9b8b3]">{EM_DASH}</span> : formatPeso(Math.round(r.spend_php))}</td>
                          <td className="mono py-4 pl-2.5 pr-5 text-right">{r.co2_kg == null ? <span className="text-[#b9b8b3]">{EM_DASH}</span> : formatKg(r.co2_kg, 0)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 md:hidden" data-testid="fh-truck-view-cards">
            {trucks.map((r) => {
              const none = rollupHasNoData(r.totals, r.litres);
              const km = kmSplit(r.totals);
              const idle = idleSplit(r.totals);
              return (
                <article key={r.vehicle_id} className="border border-[#e4e3df] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <PlateText className="text-[15px]">{r.plate}</PlateText>
                    {r.capacity_unconfirmed && <CapacityMarker compact />}
                  </div>
                  {none ? (
                    <div className="mt-3 flex items-center gap-2 text-[13px] text-[#77787b]"><Pill tone="none" dashed>No data yet</Pill> No trips or fuel logs in this range.</div>
                  ) : (
                    <div className="mt-4 grid gap-4">
                      <div>
                        <div className="mb-1.5 flex items-baseline justify-between"><span className="micro text-[#77787b]">Distance</span><span className="mono text-[13px] font-medium">{formatKm(r.totals.km, 0)}</span></div>
                        <SplitBar parts={[{ pct: km.assignedPct, color: "#33673B", label: "Assigned", value: formatKm(r.totals.assigned_km, 0) }, { pct: km.unassignedPct, color: "#c9c8c4", label: "Unassigned", value: formatKm(r.totals.unassigned_km, 0) }]} />
                      </div>
                      <div>
                        <div className="mb-1.5 flex items-baseline justify-between"><span className="micro text-[#77787b]">Idle</span><span className="mono text-[13px] font-medium">{formatMinutes(idle.total)}</span></div>
                        <SplitBar parts={[{ pct: idle.atStopPct, color: "#9a9994", label: "At stops (not penalised)", value: formatMinutes(idle.atStop) }, { pct: idle.elsewherePct, color: "#d89b00", label: "Elsewhere", value: formatMinutes(idle.elsewhere) }, { pct: idle.unclassifiedPct, color: "#e4e3df", label: "Unclassified", value: formatMinutes(idle.unclassified) }]} />
                      </div>
                      <dl className="grid grid-cols-3 gap-x-3 gap-y-3 border-t border-[#efeeeb] pt-3 text-[13px]">
                        <Mini label="Speeding" value={String(r.totals.speeding_events)} sub={formatSeconds(r.totals.speeding_seconds)} />
                        <Mini label="Harsh" value={String(r.totals.harsh_events)} />
                        <Mini label="km/L" value={r.kmpl == null ? EM_DASH : formatNumber(r.kmpl, 2)} />
                        <Mini label="Litres" value={r.litres == null ? EM_DASH : formatLitres(r.litres)} />
                        <Mini label="Spend" value={r.spend_php == null ? EM_DASH : formatPeso(Math.round(r.spend_php))} />
                        <Mini label="CO2" value={r.co2_kg == null ? EM_DASH : formatKg(r.co2_kg, 0)} />
                      </dl>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[#efeeeb] px-5 py-3 text-[11px] text-[#77787b]">
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 bg-[#33673B]" />Assigned km</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 bg-[#c9c8c4]" />Unassigned km</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 bg-[#9a9994]" />Idle at stops</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 bg-[#d89b00]" />Idle elsewhere</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 bg-[#e4e3df]" />Unclassified idle</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function ViewToggle({ value, onChange }: { value: "drivers" | "trucks"; onChange: (v: "drivers" | "trucks") => void }) {
  return (
    <SegmentedControl
      label="Eco driving view"
      value={value}
      onChange={onChange}
      options={[
        { value: "drivers", label: "Drivers" },
        { value: "trucks", label: "Trucks" },
      ]}
    />
  );
}

export { useState };
