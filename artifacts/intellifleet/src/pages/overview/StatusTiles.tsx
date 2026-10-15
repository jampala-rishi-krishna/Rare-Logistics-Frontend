// Five tiles = the status filter (click = filter, click again = clear). They count TRIPS (batches) in the date / warehouse /
// search scope, from the server's tile_counts (the same code path that filters the rows, so a tile number = rows shown).
import { AlertTriangle } from "lucide-react";
import {
  TILES,
  crewOf,
  formatKg,
  ordersLineText,
  tileOf,
} from "@/lib/overviewModel";
import type { TileId } from "@/lib/overviewModel";
import type { TripsResponse } from "@/services/api/overview";
import { Skeleton, focusRing } from "./shared";

export default function StatusTiles({
  data,
  tile,
  onTile,
  loading,
}: {
  data: TripsResponse | undefined;
  tile: TileId | "";
  onTile: (t: TileId | "") => void;
  loading: boolean;
}) {
  const counts = data?.tile_counts;
  const kgShown = formatKg(data?.trips ?? []);
  const primaryDrivers = (status: string) =>
    new Set(
      (data?.trips ?? [])
        .filter((r) => tileOf(r) === status)
        .flatMap((r) =>
          crewOf(r)
            .filter((c) => c.role === "driver")
            .map((c) => c.id ?? c.name),
        ),
    ).size;
  return (
    <section aria-label="Trips by status" className="grid gap-2">
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        data-testid="tiles"
      >
        {TILES.map((t) => {
          const on = tile === t.id;
          const value = counts ? counts[t.id] : undefined;
          const attention = t.id === "attention";
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => onTile(on ? "" : t.id)}
              data-testid={`tile-${t.id}`}
              title={t.hint}
              className={`grid min-h-[76px] content-between gap-1 rounded-[8px] border px-3 py-2.5 text-left transition-colors ${focusRing} ${
                on
                  ? "border-foreground bg-muted shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                  : "border-border bg-card hover:bg-muted"
              } ${attention ? "col-span-2 sm:col-span-1" : ""}`}
            >
              <span
                className={`flex items-center gap-1.5 text-[13px] font-semibold ${attention && (value ?? 0) > 0 ? "text-destructive" : "text-foreground"}`}
              >
                {attention && <AlertTriangle size={14} aria-hidden />}
                {t.label}
              </span>
              <span className="flex items-baseline justify-between gap-2">
                {loading && value === undefined ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  <span
                    className="text-[28px] font-semibold leading-none tabular-nums text-foreground"
                    data-testid={`tile-count-${t.id}`}
                  >
                    {value ?? "—"}
                  </span>
                )}
                <span className="text-[12px] text-muted-foreground">
                  {on
                    ? "Showing · click to clear"
                    : value === 1
                      ? "trip"
                      : "trips"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p
        className="text-[13px] tabular-nums text-muted-foreground"
        data-testid="orders-line"
      >
        {data?.orders_line
          ? ordersLineText(data.orders_line)
          : loading
            ? " "
            : "—"}
        {kgShown ? (
          <span>
            {" "}
            · {kgShown.text} on {tile ? "these" : "all"} trips
            {kgShown.note ? ` (${kgShown.note})` : ""}
          </span>
        ) : null}
      </p>
      {data && (
        <details className="text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer">
            Crew and loading totals
          </summary>
          <p className="mt-1">
            {
              new Set(
                data.trips.flatMap((r) =>
                  crewOf(r)
                    .filter((c) => c.role === "driver")
                    .map((c) => c.id ?? c.name),
                ),
              ).size
            }{" "}
            primary drivers on shown trips · {primaryDrivers("on_road")} primary
            drivers on the road · {primaryDrivers("back")} primary drivers back
            · {data.not_assigned?.length ?? 0} not assigned ·{" "}
            {data.trips.reduce((n, r) => n + r.acknowledged, 0)} orders loaded
            (acknowledged) · {data.trips.reduce((n, r) => n + r.stops_done, 0)}{" "}
            stops done · {data.trips.reduce((n, r) => n + (r.packs ?? 0), 0)}{" "}
            packs
          </p>
        </details>
      )}
    </section>
  );
}
