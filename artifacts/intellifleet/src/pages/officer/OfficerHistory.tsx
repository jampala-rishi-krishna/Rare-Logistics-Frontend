import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import * as officerApi from "@/services/api/officer";
import { personName } from "@/lib/officer";
import OfficerLayout, { EmptyBox, ErrorBox, LoadingBox, StatusPill, fmtDate, fmtDateTime } from "./shared";

export default function OfficerHistory() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ q: "", from: "", to: "" });
  const query = useQuery({
    queryKey: ["officer", "history", applied],
    queryFn: () => officerApi.listHistory({ q: applied.q.trim() || undefined, from: applied.from || undefined, to: applied.to || undefined }),
    retry: 1,
  });
  const rows = query.data ?? [];
  const input = "min-h-[44px] w-full border border-[#d8d7d2] bg-white px-3 text-sm outline-none focus:border-black";
  return (
    <OfficerLayout title="Handover history">
      <form
        className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ q, from, to });
        }}
      >
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#77787b]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SO number or driver" aria-label="Search history" className={`${input} pl-9`} />
        </label>
        <label className="grid gap-1 text-xs font-semibold sm:block">
          <span className="sm:sr-only">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className={input} />
        </label>
        <label className="grid gap-1 text-xs font-semibold sm:block">
          <span className="sm:sr-only">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className={input} />
        </label>
        <button type="submit" className="min-h-[44px] bg-black px-6 text-sm font-bold text-white">
          Search
        </button>
      </form>
      {query.isLoading ? (
        <LoadingBox label="Loading history..." />
      ) : query.isError ? (
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBox>No closed handovers match.</EmptyBox>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <Link
              key={String(row.handover_id)}
              href={`/officer/handover/${encodeURIComponent(String(row.handover_id))}`}
              className="block border border-[#e4e3df] bg-white p-4 hover:bg-[#fafaf8]"
              data-testid={`history-${row.handover_id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#77787b]">{fmtDate(row.delivery_date)}</div>
                  <div className="font-mono text-lg font-bold">{row.vehicle ?? "No vehicle"}</div>
                </div>
                <StatusPill status={row.status} />
              </div>
              <div className="mt-2 text-sm">
                <span className="text-[#77787b]">Driver: </span>
                <span className="font-semibold">{row.driver?.name ?? "-"}</span>
                {row.helpers.length > 0 && <span className="text-[#55565a]"> + {row.helpers.map(personName).join(", ")}</span>}
              </div>
              <div className="mt-1 text-xs text-[#77787b]">
                {row.totals.invoices} invoices - submitted {fmtDateTime(row.submitted_at)}
                {row.officer ? ` - officer ${row.officer.name}` : ""}
              </div>
              {(row.items ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(row.items ?? []).slice(0, 8).map((i) => (
                    <span key={String(i.item_id)} className="bg-[#f2f2ef] px-1.5 py-0.5 font-mono text-[11px]">
                      {i.so_number}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </OfficerLayout>
  );
}
