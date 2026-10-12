import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import * as officerApi from "@/services/api/officer";
import { filterHandovers, personName } from "@/lib/officer";
import OfficerLayout, { EmptyBox, ErrorBox, LoadingBox, StatusPill, fmtDate, fmtDateTime } from "./shared";

const POLL_MS = 60_000;

export function HandoverCard({ row }: { row: officerApi.HandoverRow }) {
  const t = row.totals;
  const helpers = row.helpers.map(personName).filter(Boolean);
  return (
    <Link href={`/officer/handover/${encodeURIComponent(String(row.handover_id))}`} className="block border border-[#e4e3df] bg-white p-4 hover:bg-[#fafaf8]" data-testid={`handover-${row.handover_id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#77787b]">{fmtDate(row.delivery_date)}</div>
          <div className="mt-1 font-mono text-lg font-bold">{row.vehicle ?? "No vehicle"}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {row.for_me && <span className="bg-black px-2 py-0.5 text-xs font-semibold text-white">For you</span>}
          <StatusPill status={row.status} />
          <ChevronRight size={18} className="text-[#77787b]" />
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-sm">
        <div>
          <span className="text-[#77787b]">Driver: </span>
          <span className="font-semibold">{row.driver?.name ?? "-"}</span>
        </div>
        {helpers.length > 0 && (
          <div className="break-words">
            <span className="text-[#77787b]">Helpers: </span>
            {helpers.join(", ")}
          </div>
        )}
        <div className="text-xs text-[#77787b]">Submitted {fmtDateTime(row.submitted_at)}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#efeeeb] pt-3 text-xs">
        <span className="font-semibold">{t.invoices} invoice{t.invoices === 1 ? "" : "s"}</span>
        {t.handed_over > 0 && <span>{t.handed_over} handed over</span>}
        {t.not_handed_over > 0 && <span className="text-[#8a5a00]">{t.not_handed_over} not handed over</span>}
        {t.received > 0 && <span className="text-[#1e7b44]">{t.received} received</span>}
        {t.missing > 0 && <span className="text-[#86000B]">{t.missing} missing</span>}
        {t.discrepancy > 0 && <span className="text-[#8a5a00]">{t.discrepancy} discrepancy</span>}
      </div>
    </Link>
  );
}

export default function OfficerPending() {
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");
  // react-query pauses interval refetching while the tab is hidden and refetches on focus.
  const query = useQuery({
    queryKey: ["officer", "handovers", "pending"],
    queryFn: () => officerApi.listHandovers({ status: "pending" }),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const rows = useMemo(() => filterHandovers(query.data ?? [], scope, search), [query.data, scope, search]);
  const chip = (active: boolean) => `min-h-[44px] flex-1 border px-4 text-sm font-semibold sm:flex-none ${active ? "border-black bg-black text-white" : "border-[#d8d7d2] bg-white"}`;
  return (
    <OfficerLayout title="Pending handovers">
      <div className="mb-4 grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex gap-2">
          <button type="button" className={chip(scope === "all")} onClick={() => setScope("all")}>
            All
          </button>
          <button type="button" className={chip(scope === "mine")} onClick={() => setScope("mine")}>
            For me
          </button>
        </div>
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#77787b]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicle, driver, date"
            aria-label="Search handovers"
            className="min-h-[44px] w-full border border-[#d8d7d2] bg-white pl-9 pr-3 text-sm outline-none focus:border-black"
          />
        </label>
      </div>
      {query.isLoading ? (
        <LoadingBox label="Loading pending handovers..." />
      ) : query.isError ? (
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBox>{(query.data ?? []).length === 0 ? "No handovers are waiting for validation." : "No handovers match this filter."}</EmptyBox>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <HandoverCard key={String(row.handover_id)} row={row} />
          ))}
        </div>
      )}
    </OfficerLayout>
  );
}
