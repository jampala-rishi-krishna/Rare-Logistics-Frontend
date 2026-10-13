import { useState } from "react";
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
  const head = "px-2 py-2 text-left text-[11px] font-bold uppercase text-[#77787b]";
  const cell = "px-2 py-2 align-top text-sm";
  return (
    <section className="grid gap-3" data-testid="handover-tab">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold">
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
        {query.data && <span className="text-xs text-[#55565a]">{query.data.total} hard copies outstanding</span>}
      </div>
      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorNote error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <Empty>No outstanding invoice copies.</Empty>
      ) : (
        <div className="overflow-x-auto border border-[#e4e3df] bg-white">
          <table className="w-full min-w-[820px] border-collapse" data-testid="handover-table">
            <thead>
              <tr className="border-b border-[#e4e3df]">
                {["SO", "Invoice / DR no.", "Customer", "Status", "Held by", "Since", "Note"].map((h) => (
                  <th key={h} className={head}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.batch_id}-${r.so_number}-${i}`} className="border-b border-[#efeeeb]">
                  <td className={`${cell} font-mono`}>{r.so_number}</td>
                  <td className={`${cell} font-mono font-semibold`}>{r.invoice_no ?? "—"}</td>
                  <td className={cell}>{r.customer_name}</td>
                  <td className={cell}>
                    <Chip tone={HARD_COPY_TONE[r.state] ?? "neutral"}>{r.state_label}</Chip>
                  </td>
                  <td className={`${cell} font-semibold`}>{r.holder ?? "-"}</td>
                  <td className={cell}>
                    {fmtDateTime(r.since)}
                    <div className="text-xs text-[#77787b]">{timeAgo(r.since)}</div>
                  </td>
                  <td className={`${cell} max-w-[240px] break-words text-xs`}>{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
