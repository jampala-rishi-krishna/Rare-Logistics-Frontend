import { useState } from "react";
import { OrderTypeBadge } from "@/components/load-planning/OrderTypeBadge";
import { useQuery } from "@tanstack/react-query";
import * as overviewApi from "@/services/api/overview";
import { HARD_COPY_TONE, sortHardCopies } from "@/lib/overviewView";
import { timeAgo } from "@/lib/overview";
import { Chip, Empty, ErrorNote, Skeleton, fmtDateTime, inputClass } from "./shared";
import type { TopFilter } from "./LiveTab";

const FILTERS: Array<[string, string]> = [
  ["", "All outstanding"],
  ["with_driver", "With the driver"],
  ["with_officer", "With the officer"],
  ["not_handed_over", "Not handed over"],
  ["missing", "Missing"],
  ["discrepancy", "Discrepancy"],
];

// Outstanding signed carbon-copy invoices, ALL dates: who holds each one and since when.
export default function HandoverTab({ filter }: { filter: TopFilter }) {
  const [state, setState] = useState("");
  const query = useQuery({ queryKey: ["overview-hardcopies", filter.warehouse], queryFn: () => overviewApi.getHardCopies({ warehouse: filter.warehouse || undefined }), refetchInterval: 15_000, refetchIntervalInBackground: false });
  const needle = filter.search.trim().toLowerCase();
  const rows = sortHardCopies(query.data?.rows ?? []).filter(
    (r) => (!state || r.state === state) && (!needle || [r.so_number, r.invoice_no, r.holder, r.customer_name].some((v) => String(v ?? "").toLowerCase().includes(needle))),
  );
  const head = "whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#77787b]";
  const cell = "px-3 py-2.5 align-middle text-[13px]";
  return (
    <section className="grid gap-3" data-testid="handover-tab">
      <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[#e4e3df] bg-white p-2.5">
        <label className="flex items-center gap-2 text-[11px] font-medium text-[#55565a]">
          Show
          <select value={state} onChange={(e) => setState(e.target.value)} className={`${inputClass} !w-auto`} data-testid="handover-filter">
            {FILTERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
                {v && query.data ? ` (${query.data.counts[v] ?? 0})` : ""}
              </option>
            ))}
          </select>
        </label>
        {query.data && <span className="ml-auto text-xs font-medium text-[#55565a]">{query.data.total} hard copies outstanding</span>}
      </div>
      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorNote error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <Empty>{state || needle ? "No matching invoices found." : "All caught up. No outstanding invoice handovers."}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-[8px] border border-[#e4e3df] bg-white">
          <table className="w-full min-w-[820px] border-collapse" data-testid="handover-table">
            <thead>
              <tr className="border-b border-[#e4e3df] bg-[#fafaf8]">
                {["SO", "Invoice / DR no.", "Customer", "Status", "Held by", "Since", "Note"].map((h) => (
                  <th key={h} className={head}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.batch_id}-${r.so_number}-${i}`} className="border-b border-[#efeeeb] hover:bg-[#fafaf8]">
                  <td className={`${cell} font-mono`}><OrderTypeBadge type={r.order_type} className="mr-1.5 align-middle" />{r.so_number}</td>
                  <td className={`${cell} font-mono text-sm font-bold`}>{r.invoice_no ?? "—"}</td>
                  <td className={cell}>{r.customer_name}</td>
                  <td className={cell}>
                    <Chip tone={r.state === "with_driver" ? "info" : HARD_COPY_TONE[r.state] ?? "neutral"}>{r.state_label}</Chip>
                  </td>
                  <td className={`${cell} font-semibold`}>{r.holder ?? "—"}</td>
                  <td className={cell}>
                    {fmtDateTime(r.since)}
                    <div className="text-xs text-[#77787b]">{timeAgo(r.since)}</div>
                  </td>
                  <td className={`${cell} max-w-[240px] text-xs text-[#55565a]`}><span className="line-clamp-2 break-words" title={r.note ?? undefined}>{r.note || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
