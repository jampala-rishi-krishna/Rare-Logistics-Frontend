import { useState } from "react";
import { Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as driverApi from "@/services/api/driver";
import { formatQty } from "@/lib/driver";
import { tripPath } from "@/lib/tripNav";
import type { Batch } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { dayLabel, useLang, useT } from "./i18n";
import type { Dict } from "./i18n";
import { ErrorState, MissingDriverNotice, errorText, useDriverScope } from "./shared";
import { C, Chip, Pill, Skeleton } from "./ui";
import type { ChipTone } from "./ui";

const PAGE_SIZE = 20;

function historyChip(t: Dict, b: Batch): { tone: ChipTone; label: string } {
  switch (b.trip?.status) {
    case "closed":
      return { tone: "green", label: t.chipClosedShort };
    case "returned":
    case "handover_submitted":
      return { tone: "blue", label: t.chipWaitingOfficer };
    case "on_trip":
      return { tone: "amber", label: t.chipInProgress };
    default:
      return { tone: "grey", label: t.chipNotStarted };
  }
}

function subline(t: Dict, b: Batch): string {
  const p = b.progress;
  const delivered = p ? p.delivered : (b.trip?.stops_done ?? 0);
  const parts = [t.deliveredOf(delivered, b.so_count)];
  if (p && p.failed > 0) parts.push(t.nFailed(p.failed));
  if (p && p.partial > 0) parts.push(t.nPartial(p.partial));
  if (parts.length === 1 && b.total_kg > 0) parts.push(`${formatQty(Math.round(b.total_kg * 10) / 10)} kg`);
  return parts.join(" · ");
}

export default function DriverHistory() {
  const t = useT();
  const [lang] = useLang();
  const scope = useDriverScope();
  const [days, setDays] = useState<7 | 30>(7);
  const enabled = !scope.sessionLoading && !scope.missingDriverId;
  const trips = useInfiniteQuery({
    queryKey: ["driver-trips", scope.adminDriverId, days],
    queryFn: ({ pageParam }) => driverApi.getHistoryPage({ range: { days }, status: "all", page: pageParam, pageSize: PAGE_SIZE }, scope.adminDriverId),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    enabled,
    retry: 1,
  });
  const items = trips.data?.pages.flatMap((p) => p.batches) ?? [];
  const groups: Array<{ date: string; rows: Batch[] }> = [];
  for (const b of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === b.delivery_date) last.rows.push(b);
    else groups.push({ date: b.delivery_date, rows: [b] });
  }

  return (
    <DriverLayout scope={scope} tab="history" testId="driver-history">
      <div style={{ padding: "24px 20px 8px" }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{t.history}</h1>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <Pill on={days === 7} onClick={() => setDays(7)} testId="driver-range-week">
            {t.thisWeek}
          </Pill>
          <Pill on={days === 30} onClick={() => setDays(30)} testId="driver-range-month">
            {t.thisMonth}
          </Pill>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 20px 20px" }} data-testid="driver-trips-list">
        {scope.missingDriverId ? (
          <MissingDriverNotice />
        ) : trips.isLoading ? (
          <>
            <Skeleton height={76} />
            <Skeleton height={76} />
          </>
        ) : trips.isError && items.length === 0 ? (
          <ErrorState message={errorText(trips.error)} onRetry={() => void trips.refetch()} />
        ) : items.length === 0 ? (
          <div data-testid="driver-trips-empty" style={{ background: C.card, borderRadius: 18, padding: 20, textAlign: "center", fontSize: 15, fontWeight: 700 }}>
            {t.noHistory}
          </div>
        ) : (
          <>
            {groups.map((g, gi) => (
              <div key={g.date} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginTop: gi === 0 ? 4 : 8 }}>{dayLabel(g.date, lang)}</div>
                {g.rows.map((b) => {
                  const chip = historyChip(t, b);
                  return (
                    <Link
                      key={b.batch_id}
                      href={tripPath(b.batch_id, scope.adminDriverId, { from: "history" })}
                      data-testid={`driver-trip-${b.batch_id}`}
                      style={{ background: C.card, borderRadius: 18, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, color: C.ink }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, overflowWrap: "anywhere" }}>{b.vehicle}</div>
                        <div style={{ fontSize: 14, color: C.sub }}>{subline(t, b)}</div>
                      </div>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </Link>
                  );
                })}
              </div>
            ))}
            {trips.hasNextPage && (
              <button
                type="button"
                disabled={trips.isFetchingNextPage}
                onClick={() => void trips.fetchNextPage()}
                data-testid="driver-trips-more"
                style={{ height: 56, borderRadius: 16, border: `1px solid ${C.field}`, background: "#FFFFFF", fontFamily: "inherit", fontSize: 16, fontWeight: 500, color: C.ink, marginTop: 6 }}
              >
                {trips.isFetchingNextPage ? t.loading : t.loadMore}
              </button>
            )}
          </>
        )}
      </div>
    </DriverLayout>
  );
}
