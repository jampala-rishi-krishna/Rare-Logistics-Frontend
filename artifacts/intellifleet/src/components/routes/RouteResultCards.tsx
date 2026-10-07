import type { ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { RoutePlanResult } from "@/services/api/routes";
import { buildCostTableRows, peso, rateChips, tollCellState, type CostTableRow, type TollOption } from "@/lib/routeCost";

// Presentation only: every number comes from the plan the parent already resolved. Styles live in index.css (.rc-*, .ro-*, .rk-*, .rt-*).

const dash = <span className="rc-dash">–</span>;
const money = (value: number) => (value === 0 ? dash : peso(value));

function TollCell({ row }: { row: CostTableRow }) {
  const state = tollCellState(row);
  if (state.kind === "unknown")
    return (
      <>
        {state.amount > 0 && <>{peso(state.amount)} </>}
        <span className="rc-pill" title="Toll applies, fee not available from Google">Unknown</span>
      </>
    );
  if (state.kind === "manual") return <>{peso(state.amount)}<span className="rc-tag">manual</span></>;
  if (state.kind === "known") return <>{peso(state.amount)}</>;
  return dash;
}

function TotalCell({ row, grand }: { row: CostTableRow; grand?: boolean }) {
  return (
    <>
      {peso(row.total)}
      {grand && row.tollUnknown && <span className="rc-sub">+ tolls (unknown)</span>}
    </>
  );
}

export function RouteCostCard({
  plan,
  tollDataAvailable,
  calculatedLabel,
  manualToll,
}: {
  plan: RoutePlanResult;
  tollDataAvailable: boolean;
  calculatedLabel: string;
  /** The "Tolls (₱)" entry for single-route mode (compare mode has it on the card). */
  manualToll?: ReactNode;
}) {
  const showTolls = Boolean(plan.tollsEnabled);
  const rows = plan.roundTrip ? buildCostTableRows(plan.roundTrip, plan.returnWarehouse?.name) : [];
  const provider = plan.routing?.provider ? plan.routing.provider.charAt(0).toUpperCase() + plan.routing.provider.slice(1) : "";
  const widths = showTolls ? [14, 9.5, 9.5, 10, 9.5, 11, 12.5, 10, 14] : [16, 10, 10, 11, 11, 13, 14, 15];
  const legSub = (row: CostTableRow) => (row.key === "return" && plan.returnWarehouse?.address ? plan.returnWarehouse.address : null);
  const noteTollsMissing = showTolls && plan.activeOption !== "avoid" && !tollDataAvailable && !plan.toll?.manual;
  return (
    <section className="rc-card" data-testid="route-cost-table" aria-label="Cost breakdown">
      <div className="rc-head">
        <h3 className="rc-title">Cost breakdown</h3>
        <div className="rc-meta">
          <span>
            {plan.routing?.trafficAware ? "Traffic-aware" : "Traffic unavailable"}
            {provider && <> · {provider}</>} · calculated {calculatedLabel} · {plan.stops.length + 2} stops
          </span>
          {plan.routing?.fallback && <strong style={{ color: "#a16819" }}>Fallback provider used</strong>}
          {plan.returnToWarehouse && plan.returnWarehouse && (
            <a href={plan.returnWarehouse.map_url} target="_blank" rel="noreferrer">
              Open {plan.returnWarehouse.name} in Google Maps <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="rc-scroll">
            <table className="rc-table">
              <colgroup>
                {widths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
              </colgroup>
              <thead>
                <tr className="rc-groups">
                  <th aria-hidden />
                  <th colSpan={2} className="rc-sep">Trip</th>
                  <th colSpan={showTolls ? 5 : 4} className="rc-sep">Cost breakdown</th>
                  <th className="rc-sep">Total</th>
                </tr>
                <tr className="rc-cols">
                  <th scope="col">Leg</th>
                  <th scope="col" className="rc-sep">Distance</th>
                  <th scope="col">Time</th>
                  <th scope="col" className="rc-sep">Distance</th>
                  <th scope="col">Time</th>
                  <th scope="col">Fuel</th>
                  <th scope="col">Refrigeration</th>
                  {showTolls && <th scope="col">Tolls</th>}
                  <th scope="col" className="rc-sep">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const total = row.key === "total";
                  return (
                    <tr key={row.key} className={total ? "rc-total" : undefined}>
                      <th scope="row" className="rc-leg">
                        {row.label}
                        {legSub(row) && <span className="rc-sub">{legSub(row)}</span>}
                      </th>
                      <td className="rc-num rc-sep">{row.distanceKm.toFixed(1)} km</td>
                      <td className="rc-num">{Math.round(row.durationMin)} min</td>
                      <td className="rc-num rc-sep">{money(row.distanceCost)}</td>
                      <td className="rc-num">{money(row.timeCost)}</td>
                      <td className="rc-num">{money(row.fuel)}</td>
                      <td className="rc-num">{money(row.refrigeration)}</td>
                      {showTolls && <td className="rc-num"><TollCell row={row} /></td>}
                      <td className={`rc-num rc-sep rc-grand${total ? " is-grand" : ""}`}><TotalCell row={row} grand={total} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rc-cards" data-testid="route-cost-cards">
            {rows.map((row) => {
              const lines: [string, ReactNode][] = [
                ["Distance cost", money(row.distanceCost)],
                ["Time cost", money(row.timeCost)],
                ["Fuel", money(row.fuel)],
                ["Refrigeration", money(row.refrigeration)],
                ...(showTolls ? ([["Tolls", <TollCell key="t" row={row} />]] as [string, ReactNode][]) : []),
              ];
              const total = row.key === "total";
              return (
                <article key={row.key} className={`rl-card${total ? " is-total" : ""}`}>
                  <div className="rl-name">{row.label}</div>
                  {legSub(row) && <div className="rc-sub">{legSub(row)}</div>}
                  <div className="rl-sub">{row.distanceKm.toFixed(1)} km · {Math.round(row.durationMin)} min</div>
                  <dl className="rl-lines">
                    {lines.map(([label, value]) => (
                      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                    ))}
                  </dl>
                  <div className="rl-total">
                    <span className="rl-total-label">Total</span>
                    <span className="rl-total-value"><TotalCell row={row} grand={total} /></span>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {manualToll && <div className="rc-extra">{manualToll}</div>}
      {noteTollsMissing && (
        <p className="rc-note">
          Google returned no toll information for this route; Philippine expressways are often not covered, so tolls may still apply. Enter the known toll amount if you have it.
        </p>
      )}
      {plan.warnings.map((warning) => (
        <p className="rc-note" key={warning}>Warning: {warning}</p>
      ))}

      {plan.rates && (
        <details className="rc-how">
          <summary>
            How this is calculated
            <ChevronDown size={16} className="rc-chev" aria-hidden />
          </summary>
          <ul className="rc-chips">
            {rateChips(plan.rates, plan.costAssumptions).map((chip) => (
              <li className="rc-chip" key={chip.label}>
                <b>{chip.label}</b>
                <span>{chip.value}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function RouteOptionCards({
  options,
  activeKey,
  badges,
  tollsEnabled,
  noTollFreeAlternative,
  onPick,
  manualInput,
}: {
  options: TollOption[];
  activeKey: string | undefined;
  badges: { cheapest: string | null; fastest: string | null };
  tollsEnabled: boolean;
  noTollFreeAlternative: boolean;
  onPick: (key: string) => void;
  manualInput: (key: string) => ReactNode;
}) {
  return (
    <div className="ro-grid" data-testid="toll-options">
      {options.map((option) => {
        const active = activeKey === option.key;
        const tolls = option.costBreakdown.tolls ?? 0;
        const pills = [badges.cheapest === option.key ? "Cheapest" : null, badges.fastest === option.key ? "Fastest" : null].filter(Boolean) as string[];
        return (
          <div
            key={option.key}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            onClick={() => onPick(option.key)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onPick(option.key);
              }
            }}
            className={`ro-card${active ? " is-active" : ""}`}
          >
            <div className="ro-head">
              <strong className="ro-title">{option.label}</strong>
              <div className="ro-badges">
                {pills.map((pill) => <span key={pill} className="ro-pill">{pill}</span>)}
                {active && <span className="ro-pill is-active">Active</span>}
              </div>
            </div>
            <dl className="ro-stats">
              <div><dt>Distance</dt><dd>{option.distanceKm.toFixed(1)} km</dd></div>
              <div><dt>Time</dt><dd>{Math.round(option.durationMin)} min</dd></div>
              <div><dt>Total</dt><dd>{peso(option.cost)}{option.toll.unknown ? <span className="rc-sub">+ tolls</span> : null}</dd></div>
            </dl>
            <div className="ro-toll">
              <span>Tolls</span>
              {option.toll.unknown ? (
                <>
                  {tolls > 0 && <b>{peso(tolls)} +</b>}
                  <span className="rc-pill" title="Toll applies, fee not available from Google">Unknown</span>
                </>
              ) : option.toll.manual ? (
                <><b>{peso(tolls)}</b><span className="rc-tag">manual</span></>
              ) : option.toll.present || tolls > 0 ? (
                <b>{peso(tolls)}</b>
              ) : (
                <b className="rc-dash">–</b>
              )}
            </div>
            {option.toll.unknown && !option.toll.manual && (
              <p className="rc-note">
                Toll applies, fee unknown{option.toll.inferred ? " (Google gave no toll data; this route differs from the toll-free one)" : ""}. Not eligible for Cheapest.
              </p>
            )}
            {tollsEnabled && option.key !== "avoid" && manualInput(option.key)}
          </div>
        );
      })}
      {noTollFreeAlternative && (
        <div className="ro-card is-empty" data-testid="no-toll-free-alternative">
          <strong className="ro-title">Avoid tolls</strong>
          <p className="rc-note" style={{ marginTop: 8 }}>No toll-free alternative found. Google returned the same route with and without tolls.</p>
        </div>
      )}
    </div>
  );
}

export function RouteKpis({ plan }: { plan: RoutePlanResult | null }) {
  const items: { label: string; value: string; sub?: string }[] = [
    { label: "Distance", value: plan ? `${plan.distanceKm.toFixed(1)} km` : "-" },
    { label: "Driving time", value: plan ? `${Math.round(plan.durationMin)} min` : "-" },
    {
      label: "Estimated operating cost",
      value: plan ? `₱${plan.cost.toLocaleString()}` : "-",
      sub: plan?.toll?.unknown ? "+ tolls (unknown)" : undefined,
    },
  ];
  return (
    <div className="rk-grid">
      {items.map((item) => (
        <div className="rk-card" key={item.label}>
          <div className="rk-label">{item.label}</div>
          <div className="rk-value">{item.value}</div>
          {item.sub && <div className="rk-sub">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function RouteTimeline({ plan, returnEta }: { plan: RoutePlanResult; returnEta: string | null }) {
  const hasReturn = Boolean(plan.returnToWarehouse && plan.returnWarehouse && plan.roundTrip?.return);
  return (
    <section className="rt-card" aria-label="Route timeline">
      <div className="micro" style={{ color: "var(--ink-muted)" }}>Route timeline</div>
      <ol className="rt-list">
        <li className="rt-item is-start">
          <span className="rt-label">Start</span>
          <span className="rt-addr">{plan.origin.label}</span>
        </li>
        {plan.stops.map((stop, index) => (
          <li className="rt-item" key={`${stop.label}-${index}`}>
            <span className="rt-label">Stop {index + 1}</span>
            <span className="rt-addr">{stop.label}</span>
            <span className="rt-meta">Service time assumed: {plan.costAssumptions?.serviceMinPerStop ?? 30} min</span>
          </li>
        ))}
        <li className="rt-item is-end">
          <span className="rt-label">{hasReturn ? "Last delivery" : "End"}</span>
          <span className="rt-addr">{plan.destination.label}</span>
        </li>
        {hasReturn && plan.returnWarehouse && (
          <li className="rt-item is-return">
            <span className="rt-label">Return</span>
            <span className="rt-addr">Arrive back at {plan.returnWarehouse.name}</span>
            {returnEta && <span className="rt-meta">ETA {returnEta}</span>}
          </li>
        )}
      </ol>
    </section>
  );
}
