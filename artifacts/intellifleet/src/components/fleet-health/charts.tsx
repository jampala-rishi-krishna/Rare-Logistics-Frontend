import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BatteryPoint, Co2Month, DailyPoint } from "@/services/api/fleetHealth";
import {
  BATTERY_LIMITS,
  TONES,
  batteryChartData,
  batteryDomain,
  batteryStatusLabel,
  batteryTone,
  co2ChartData,
  co2Formula,
  co2PlateKeys,
  distanceChartData,
  formatDate,
  formatKg,
  formatKm,
  formatLitres,
  formatMonth,
  formatNumber,
  type BatteryChartPoint,
  type DistancePoint,
} from "@/lib/fleetHealth";
import { useIsMobile } from "./hooks";

const AXIS = { fontSize: 11, fill: "#77787b", fontFamily: "'DM Mono', ui-monospace, monospace" } as const;
const GRID = "#efeeeb";

export const PLATE_COLORS = ["#33673B", "#0b0b0b", "#86000B", "#d89b00", "#5b7f95", "#9a9994", "#7a5c9e", "#b36b2e"];

function TipCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[170px] max-w-[260px] border border-[#0b0b0b] bg-white px-3 py-2.5 text-xs shadow-lg">
      <div className="micro mb-2 text-[#77787b]">{title}</div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function Row({ swatch, label, value, dashed }: { swatch?: string; label: string; value: React.ReactNode; dashed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-[#55565a]">
        {swatch && <span aria-hidden className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: dashed ? "transparent" : swatch, border: dashed ? `1.5px dashed ${swatch}` : undefined }} />}
        {label}
      </span>
      <span className="mono font-medium text-black">{value}</span>
    </div>
  );
}

export function LegendItem({ color, label, dashed, line }: { color: string; label: string; dashed?: boolean; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#55565a]">
      <span aria-hidden className={line ? "h-0 w-5 border-t-2" : "h-2.5 w-2.5 rounded-[1px]"} style={line ? { borderColor: color, borderStyle: dashed ? "dashed" : "solid" } : { background: color }} />
      {label}
    </span>
  );
}

// ------------------------------------------------------------------------------------------------ battery
function BatteryDot(props: { cx?: number; cy?: number; payload?: BatteryChartPoint; value?: number | null }) {
  const { cx, cy, payload, value } = props;
  if (cx == null || cy == null || value == null || !payload) return null;
  const tone = TONES[batteryTone(payload.status)];
  return <circle cx={cx} cy={cy} r={payload.status === "warning" || payload.status === "critical" ? 4.5 : 2.5} fill={tone.solid} stroke="#fff" strokeWidth={1.5} />;
}

export function BatteryChart({ series, system, days }: { series: BatteryPoint[]; system: 12 | 24; days: number }) {
  const mobile = useIsMobile();
  const data = useMemo(() => batteryChartData(series, days), [series, days]);
  const limits = BATTERY_LIMITS[system];
  const [lo, hi] = batteryDomain(data, system);
  const step = system === 24 ? 1 : 0.5;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return (
    <div>
      <div className="h-[260px] w-full" role="img" aria-label={`Battery voltage for the last ${days} days on a ${system} volt system`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: mobile ? 4 : 12, bottom: 0, left: mobile ? 0 : -4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <ReferenceArea y1={limits.runningLow} y2={limits.runningHigh} fill="#33673B" fillOpacity={0.06} ifOverflow="extendDomain" />
            <ReferenceLine y={limits.parkedWarn} stroke="#d89b00" strokeDasharray="5 4" strokeWidth={1.25} ifOverflow="extendDomain" />
            <ReferenceLine y={limits.parkedCritical} stroke="#c4291f" strokeDasharray="5 4" strokeWidth={1.25} ifOverflow="extendDomain" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#d8d7d2" }} minTickGap={mobile ? 28 : 18} tickMargin={8} />
            <YAxis domain={[lo, hi]} ticks={ticks} interval={0} tick={AXIS} tickLine={false} axisLine={false} width={mobile ? 46 : 50} tickFormatter={(v: number) => `${v.toFixed(1)}V`} />
            <Tooltip
              cursor={{ stroke: "#0b0b0b", strokeOpacity: 0.2 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as BatteryChartPoint;
                return (
                  <TipCard title={formatDate(p.date)}>
                    <Row swatch="#0b0b0b" label="Parked (lowest)" value={p.parked == null ? "no data" : `${p.parked.toFixed(2)} V`} />
                    <Row swatch="#33673B" label="Running (avg)" value={p.running == null ? "no data" : `${p.running.toFixed(2)} V`} />
                    <Row label="Day status" value={batteryStatusLabel(p.status)} />
                    {p.reasons.map((r) => (
                      <div key={r} className="mt-1 border-t border-[#efeeeb] pt-1.5 leading-4 text-[#55565a]">
                        {r}
                      </div>
                    ))}
                  </TipCard>
                );
              }}
            />
            <Line type="monotone" dataKey="parked" stroke="#0b0b0b" strokeWidth={2} dot={<BatteryDot />} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} name="Parked" />
            <Line type="monotone" dataKey="running" stroke="#33673B" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} name="Running" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        <LegendItem line color="#0b0b0b" label="Parked, lowest of the day" />
        <LegendItem line color="#33673B" label="Running, average" />
        <LegendItem line dashed color="#d89b00" label={`Parked warning below ${limits.parkedWarn} V`} />
        <LegendItem line dashed color="#c4291f" label={`Parked critical below ${limits.parkedCritical} V`} />
        <LegendItem color="#e4efe7" label={`Running normal ${limits.runningLow}-${limits.runningHigh} V`} />
      </div>
      <p className="mt-2 text-xs text-[#77787b]">{system} V system, inferred from the running voltage. Dots turn amber or red on days outside the limits.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ distance
export function DistanceChart({ daily, days }: { daily: DailyPoint[]; days: number }) {
  const mobile = useIsMobile();
  const data = useMemo(() => distanceChartData(daily, days), [daily, days]);
  return (
    <div>
      <div className="h-[240px] w-full" role="img" aria-label={`Kilometres driven per day for the last ${days} days`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: mobile ? 4 : 12, bottom: 0, left: mobile ? 0 : -4 }} barCategoryGap={mobile ? 2 : 3}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#d8d7d2" }} minTickGap={mobile ? 28 : 18} tickMargin={8} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={mobile ? 40 : 46} tickFormatter={(v: number) => formatNumber(v)} />
            <Tooltip
              cursor={{ fill: "#0b0b0b", fillOpacity: 0.05 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as DistancePoint;
                return (
                  <TipCard title={formatDate(p.date)}>
                    <Row swatch="#33673B" label="Assigned" value={formatKm(p.assigned, 1)} />
                    <Row swatch="#c9c8c4" label="Unassigned" value={formatKm(p.unassigned, 1)} />
                    <Row label="Engine hours" value={p.engineHours == null ? "—" : `${formatNumber(p.engineHours, 1)} h`} />
                    <Row label="Trips" value={p.trips == null ? "—" : formatNumber(p.trips)} />
                    {p.partial && <div className="mt-1 border-t border-[#efeeeb] pt-1.5 text-[#8a5a00]">Partial day: the tracker had gaps.</div>}
                  </TipCard>
                );
              }}
            />
            <Bar dataKey="assigned" stackId="km" fill="#33673B" name="Assigned" isAnimationActive={false} />
            <Bar dataKey="unassigned" stackId="km" fill="#c9c8c4" name="Unassigned" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        <LegendItem color="#33673B" label="Driven on an assigned day" />
        <LegendItem color="#c9c8c4" label="Unassigned day (no driver on record)" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ CO2
export function Co2Chart({ months, mode, kgPerLitre }: { months: Co2Month[]; mode: "fleet" | "trucks"; kgPerLitre: number }) {
  const mobile = useIsMobile();
  const data = useMemo(() => co2ChartData(months), [months]);
  const plates = useMemo(() => co2PlateKeys(months), [months]);
  return (
    <div>
      <div className="h-[260px] w-full" role="img" aria-label="Monthly CO2 emissions from diesel use">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: mobile ? 4 : 12, bottom: 0, left: mobile ? -10 : 0 }} barCategoryGap={mobile ? "18%" : "28%"}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#d8d7d2" }} tickMargin={8} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={mobile ? 44 : 52} tickFormatter={(v: number) => `${formatNumber(v)}`} />
            <Tooltip
              cursor={{ fill: "#0b0b0b", fillOpacity: 0.05 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as ReturnType<typeof co2ChartData>[number];
                return (
                  <TipCard title={formatMonth(row.month)}>
                    <Row label="CO2" value={formatKg(row.total as number, 1)} />
                    <Row label="Diesel" value={formatLitres(row.litres as number)} />
                    {mode === "trucks" &&
                      plates
                        .filter((p) => (row[p] as number) > 0)
                        .map((p) => <Row key={p} swatch={PLATE_COLORS[plates.indexOf(p) % PLATE_COLORS.length]} label={p} value={formatKg(row[p] as number, 1)} />)}
                    <div className="mt-1 border-t border-[#efeeeb] pt-1.5 text-[11px] text-[#77787b]">{co2Formula(kgPerLitre)}</div>
                  </TipCard>
                );
              }}
            />
            {mode === "fleet" ? (
              <Bar dataKey="total" name="CO2 (kg)" fill="#33673B" isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.month} fill="#33673B" />
                ))}
              </Bar>
            ) : (
              plates.map((p, i) => <Bar key={p} dataKey={p} stackId="co2" fill={PLATE_COLORS[i % PLATE_COLORS.length]} name={p} isAnimationActive={false} />)
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {mode === "trucks" && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {plates.map((p, i) => (
            <LegendItem key={p} color={PLATE_COLORS[i % PLATE_COLORS.length]} label={p} />
          ))}
        </div>
      )}
    </div>
  );
}
