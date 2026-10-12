import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as officerApi from "@/services/api/officer";
import { ageLabel, ageTone, alreadyDoneText, errorInfo, newActionBase, sortOutstandingOldest } from "@/lib/officer";
import OfficerLayout, { EmptyBox, ErrorBox, LoadingBox, Notice, StatusPill, fmtDate, useOfficerSession } from "./shared";

const AGE_CLASS = {
  good: "bg-[#edf6f0] text-[#1e7b44]",
  warn: "bg-[#fff6e5] text-[#8a5a00]",
  bad: "bg-[#fff1f2] text-[#86000B]",
  neutral: "bg-[#f2f2ef] text-[#55565a]",
} as const;

function OutstandingCard({ item, canAct }: { item: officerApi.OutstandingItem; canAct: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "good" | "warn" | "bad"; text: string } | null>(null);
  const resolve = useMutation({
    mutationFn: () => officerApi.resolveInvoice(item.item_id, newActionBase(), note.trim() || null),
    onSuccess: async (result) => {
      const dup = alreadyDoneText(result);
      setMessage(dup ? { tone: "warn", text: dup } : { tone: "good", text: "Marked as received." });
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["officer"] }),
        queryClient.invalidateQueries({ queryKey: ["driver-overview"] }),
      ]);
    },
    onError: (error) => setMessage({ tone: "bad", text: errorInfo(error).message }),
  });
  return (
    <article className="border border-[#e4e3df] bg-white p-4" data-testid={`outstanding-${item.item_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-base font-bold">{item.so_number}</div>
          <div className="break-words text-sm text-[#55565a]">{item.customer_name ?? "-"}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={item.officer_status ?? "pending"} />
          <span className={`px-2 py-0.5 text-xs font-bold ${AGE_CLASS[ageTone(item.age_hours)]}`} title="Age of the handover">
            {ageLabel(item.age_hours)}
          </span>
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-sm">
        <div>
          <span className="text-[#77787b]">Delivered: </span>
          {fmtDate(item.delivery_date)} - <span className="font-semibold">{item.driver?.name ?? "-"}</span>
        </div>
        {item.crew_note && <div className="break-words">Crew note: {item.crew_note}</div>}
        {item.officer_note && <div className="break-words">Officer note: {item.officer_note}</div>}
        <Link href={`/officer/handover/${encodeURIComponent(String(item.handover_id))}`} className="text-xs font-semibold underline">
          Open handover
        </Link>
      </div>
      {message && (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      {canAct && !open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-[44px] w-full border border-black px-4 text-sm font-bold sm:w-auto">
          Resolve
        </button>
      )}
      {canAct && open && (
        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-xs font-semibold">
            Note (optional)
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="border border-[#d8d7d2] bg-white p-2 text-sm font-normal outline-none focus:border-black" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={resolve.isPending} onClick={() => resolve.mutate()} className="min-h-[44px] flex-1 bg-[#1e7b44] px-4 text-sm font-bold text-white disabled:opacity-40">
              {resolve.isPending ? "Saving..." : "Mark received"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] border border-[#d8d7d2] bg-white px-4 text-sm font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function OfficerOutstanding() {
  const session = useOfficerSession();
  const query = useQuery({ queryKey: ["officer", "outstanding"], queryFn: () => officerApi.listOutstanding(), retry: 1 });
  const rows = useMemo(() => sortOutstandingOldest(query.data ?? []), [query.data]);
  return (
    <OfficerLayout title="Outstanding invoices">
      <p className="mb-4 text-sm text-[#55565a]">Every invoice that is not received yet, across all dates, oldest first.</p>
      {query.isLoading ? (
        <LoadingBox label="Loading outstanding invoices..." />
      ) : query.isError ? (
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBox>No outstanding invoices.</EmptyBox>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((item) => (
            <OutstandingCard key={String(item.item_id)} item={item} canAct={!session.readOnly} />
          ))}
        </div>
      )}
    </OfficerLayout>
  );
}
