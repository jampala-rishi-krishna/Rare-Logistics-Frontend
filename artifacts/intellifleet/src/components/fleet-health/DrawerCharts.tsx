import { useState } from "react";
import { BatteryCharging, Fuel, Gauge, Plus, Route } from "lucide-react";
import {
  EM_DASH,
  TONES,
  batterySystemOf,
  batteryStatusLabel,
  batteryTone,
  distanceChartData,
  formatDate,
  formatDateTime,
  formatKm,
  formatKmpl,
  formatLitres,
  formatNumber,
  formatPeso,
  formatPesoPerLitre,
  hasBatteryData,
  hasDistanceData,
} from "@/lib/fleetHealth";
import { BatteryChart, DistanceChart } from "./charts";
import { CapacityMarker, EmptyState, Pill, SectionHead, SegmentedControl, Stat, btn, btnPrimary, cx } from "./ui";
import type { DrawerCtx } from "./TruckDrawer";

function Head({ title, info, children }: { title: string; info?: string[]; children?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <SectionHead title={title} info={info} aside={children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : undefined} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ fuel
export function FuelSection({ ctx }: { ctx: DrawerCtx }) {
  const { detail, truck, perms } = ctx;
  const logs = detail.fuel_logs ?? [];
  const intervals = detail.kmpl_intervals ?? [];
  const checks = detail.fuel_checks ?? [];
  const latest = intervals[intervals.length - 1];
  const spend = logs.reduce((n, l) => n + l.amount_php, 0);
  const litres = logs.reduce((n, l) => n + l.litres, 0);
  return (
    <div className="grid gap-6">
      <div>
        <Head title="Fuel" info={["km/L = distance between two full-tank fills / litres added at the second fill.", "Fuel logs come from fill-ups entered by staff."]}>
          {truck.capacity_unconfirmed && <CapacityMarker />}
          {perms.canEnter && (
            <button type="button" className={btnPrimary} onClick={ctx.addFuel}>
              <Plus size={14} aria-hidden /> Add fill-up
            </button>
          )}
        </Head>
        {logs.length === 0 ? (
          <div className="border border-[#e4e3df] bg-white">
            <EmptyState icon={Fuel} title="No fuel logs yet" body="Add fill-ups to see km/L, spend and CO2 for this vehicle." action={perms.canEnter ? <button type="button" className={btn} onClick={ctx.addFuel}><Plus size={14} aria-hidden /> Add the first fill-up</button> : undefined} compact />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px border border-[#e4e3df] bg-[#e4e3df] md:grid-cols-4">
              <div className="bg-white p-4"><Stat label="Latest km/L" value={latest ? formatKmpl(latest.kmpl) : EM_DASH} sub={latest ? `over ${formatKm(latest.km)}` : "needs two full-tank fills"} /></div>
              <div className="bg-white p-4"><Stat label="Fills" value={logs.length} sub="last 400 days" /></div>
              <div className="bg-white p-4"><Stat label="Diesel" value={formatLitres(litres, 0)} sub="all logged fills" /></div>
              <div className="bg-white p-4"><Stat label="Spend" value={formatPeso(Math.round(spend))} sub="all logged fills" /></div>
            </div>
            <ul className="mt-4 divide-y divide-[#efeeeb] border border-[#e4e3df] bg-white" data-testid="fh-truck-fuel-logs">
              {logs.slice(0, 12).map((l) => (
                <li key={l.id} className="grid gap-1 px-4 py-3 text-[13px] sm:grid-cols-[130px_1fr_auto] sm:gap-4">
                  <div className="font-semibold">{formatDate(l.filled_at)}</div>
                  <div className="min-w-0 text-[#55565a]">
                    <span className="mono text-black">{formatLitres(l.litres)}</span> · {formatPeso(l.amount_php)} · {formatPesoPerLitre(l.price_per_litre)}
                    {l.station ? ` · ${l.station}` : ""}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#77787b]">
                    {l.odometer_km != null && <span className="mono">{formatKm(l.odometer_km)}</span>}
                    {l.full_tank && <Pill tone="info">Full</Pill>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {checks.length > 0 && (
        <div>
          <Head title="Checks" info={["Fills that look unusual are marked for a second look. They are checks, not conclusions."]} />
          <ul className="divide-y divide-[#efeeeb] border border-[#e4e3df] bg-white">
            {checks.map((c, i) => (
              <li key={`${c.fill_id}-${i}`} className="flex items-start gap-3 px-4 py-3 text-[13px]">
                <Pill tone="soon">Check</Pill>
                <div className="min-w-0">
                  <div>{c.reason}</div>
                  <div className="mt-0.5 text-xs text-[#77787b]">{formatDateTime(c.filled_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ battery
export function BatterySection({ ctx }: { ctx: DrawerCtx }) {
  const { detail, truck } = ctx;
  const series = detail.battery_series ?? [];
  const [days, setDays] = useState<"30" | "60" | "90">("30");
  const has = hasBatteryData(series);
  const system = batterySystemOf(series, truck.battery?.system ?? null);
  const latest = truck.battery;
  return (
    <div>
      <Head title="Battery" info={["Voltage is sampled from the tracker every 10 minutes.", "Parked: lowest voltage with the ignition off. Running: average with the ignition on.", "A flag is raised after one critical day or two warning days in a row."]}>
        {has && <SegmentedControl<"30" | "60" | "90"> label="Range" size="sm" value={days} onChange={setDays} options={[{ value: "30", label: "30 d" }, { value: "60", label: "60 d" }, { value: "90", label: "90 d" }]} />}
      </Head>
      {truck.kind === "no_tracker" ? (
        <div className="border border-[#e4e3df] bg-white">
          <EmptyState icon={BatteryCharging} title="No tracker, no voltage" body="Battery voltage comes from the GPS tracker, which this vehicle does not have." compact />
        </div>
      ) : !has || !system ? (
        <div className="border border-[#e4e3df] bg-white">
          <EmptyState icon={BatteryCharging} title="No battery data yet" body="No battery data yet: voltage is collected by the status sampler every 10 minutes." compact />
        </div>
      ) : (
        <div className="grid gap-4">
          {latest && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-[#e4e3df] bg-white px-4 py-3 text-[13px]">
              <Pill tone={batteryTone(latest.status)}>{batteryStatusLabel(latest.status)}</Pill>
              <span>
                Parked <strong className="mono">{latest.parked_min != null ? `${latest.parked_min.toFixed(2)} V` : EM_DASH}</strong>
              </span>
              <span>
                Running <strong className="mono">{latest.running_avg != null ? `${latest.running_avg.toFixed(2)} V` : EM_DASH}</strong>
              </span>
              <span className="text-[#77787b]">{formatDate(latest.date)}</span>
              {latest.reasons.map((r) => (
                <span key={r} className="w-full text-[#8a5a00]">
                  {r}
                </span>
              ))}
            </div>
          )}
          <div className="border border-[#e4e3df] bg-white p-3 pt-4 md:p-5">
            <BatteryChart series={series} system={system} days={Number(days)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ distance
export function DistanceSection({ ctx }: { ctx: DrawerCtx }) {
  const { detail, truck } = ctx;
  const daily = detail.daily ?? [];
  const [days, setDays] = useState<"30" | "60">("30");
  const has = hasDistanceData(daily);
  const rows = distanceChartData(daily, Number(days));
  const assigned = rows.reduce((n, r) => n + r.assigned, 0);
  const unassigned = rows.reduce((n, r) => n + r.unassigned, 0);
  const hours = rows.reduce((n, r) => n + (r.engineHours ?? 0), 0);
  return (
    <div>
      <Head title="Distance" info={["Kilometres driven per day from the tracker's trips.", "Assigned days have a driver on record; unassigned days do not and are excluded from driver scores."]}>
        {has && <SegmentedControl<"30" | "60"> label="Range" size="sm" value={days} onChange={setDays} options={[{ value: "30", label: "30 d" }, { value: "60", label: "60 d" }]} />}
      </Head>
      {truck.kind === "no_tracker" || !has ? (
        <div className="border border-[#e4e3df] bg-white">
          <EmptyState icon={truck.kind === "no_tracker" ? Gauge : Route} title={truck.kind === "no_tracker" ? "No tracker, no distance" : "No distance data yet"} body={truck.kind === "no_tracker" ? "Distance comes from the GPS tracker, which this vehicle does not have." : "Daily distance appears after the nightly job has processed this vehicle's trips."} compact />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-px border border-[#e4e3df] bg-[#e4e3df]">
            <div className="bg-white p-4"><Stat label={`Total, ${days} d`} value={formatKm(assigned + unassigned)} /></div>
            <div className="bg-white p-4"><Stat label="Assigned" value={formatKm(assigned)} sub={assigned + unassigned > 0 ? `${Math.round((assigned / (assigned + unassigned)) * 100)}% of km` : undefined} /></div>
            <div className="bg-white p-4"><Stat label="Engine hours" value={`${formatNumber(hours, 1)} h`} /></div>
          </div>
          <div className={cx("border border-[#e4e3df] bg-white p-3 pt-4 md:p-5")}>
            <DistanceChart daily={daily} days={Number(days)} />
          </div>
        </div>
      )}
    </div>
  );
}
