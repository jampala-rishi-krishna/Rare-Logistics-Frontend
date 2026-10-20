import { useState } from "react";
import {
  INVOICE_CHIPS,
  INVOICE_TONE,
  invoiceWord,
  sinceText,
  manilaDateTime,
  type UrlState,
} from "@/lib/overviewModel";
import { useHardCopies } from "./queries";
import {
  buttonClass,
  Chip,
  ErrorLine,
  focusRing,
  Skeleton,
  useNow,
} from "./shared";
import { DateScope } from "./IssuesTab";
import { ReceiveInvoiceButton } from "./ReceiveInvoiceButton";
export default function HandoverTab({
  state,
  set,
}: {
  state: UrlState;
  set: (p: Partial<UrlState>) => void;
}) {
  const [show, filter] = useState("");
  const query = useHardCopies(state);
  const now = useNow(15000);
  const rows = (query.data?.rows ?? []).filter(
    (r) => !show || r.state === show,
  );
  return (
    <section className="grid min-w-0 gap-3" data-testid="invoices-tab">
      <DateScope
        state={state}
        set={set}
        label="All dates — anything not yet received"
      />
      <div
        role="group"
        aria-label="Invoice status"
        className="flex flex-wrap gap-1"
      >
        {INVOICE_CHIPS.map(([s, label]) => (
          <button
            key={s}
            className={buttonClass}
            aria-pressed={show === s}
            onClick={() => filter(s)}
          >
            {label} (
            {s ? (query.data?.counts[s] ?? 0) : (query.data?.total ?? 0)})
          </button>
        ))}
      </div>
      {query.isLoading ? (
        <Skeleton className="h-48" />
      ) : query.isError ? (
        <ErrorLine error={query.error} onRetry={() => void query.refetch()} />
      ) : !rows.length ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm">
          No invoices to collect in this view.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted">
              <tr>
                {[
                  "SO / TO",
                  "Invoice/DR",
                  "Customer",
                  "Truck/driver",
                  "Status",
                  "Since",
                  "Note",
                  "Action",
                ].map((h) => (
                  <th className="p-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.batch_id}-${r.so_number}-${i}`}
                  tabIndex={0}
                  onClick={() =>
                    set({
                      trip: r.batch_id,
                      stop: r.so_id ?? r.so_number ?? "",
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      set({
                        trip: r.batch_id,
                        stop: r.so_id ?? r.so_number ?? "",
                      });
                    }
                  }}
                  className={`cursor-pointer border-t border-border hover:bg-muted ${focusRing}`}
                >
                  <td className="p-3 font-mono">{r.so_number}</td>
                  <td className="p-3">{r.invoice_no ?? "—"}</td>
                  <td className="p-3">{r.customer_name}</td>
                  <td className="p-3">
                    {r.vehicle} {r.holder}
                  </td>
                  <td className="p-3">
                    <Chip tone={INVOICE_TONE[r.state] ?? "neutral"}>
                      {invoiceWord(r.state)}
                    </Chip>
                  </td>
                  <td className="p-3" title={manilaDateTime(r.since)}>
                    {sinceText(r.since, now)}
                    <span className="block text-muted-foreground">
                      {manilaDateTime(r.since)}
                    </span>
                  </td>
                  <td className="max-w-48 break-words p-3">{r.note}</td>
                  <td className="p-3"><ReceiveInvoiceButton itemId={r.item_id} handedOver={r.handed_over} status={r.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
