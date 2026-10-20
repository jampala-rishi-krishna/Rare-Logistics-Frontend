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
  const collected = state.tab === "collected";
  const query = useHardCopies(state, collected);
  const now = useNow(15000);
  const outcome = (value?: string | null) =>
    /^partial/i.test(value ?? "")
      ? "partial"
      : /^deliver/i.test(value ?? "")
        ? "delivered"
        : /fail|return/i.test(value ?? "")
          ? "failed"
          : "unknown";
  const chips: ReadonlyArray<[string, string]> = collected
    ? [
        ["", "All collected"],
        ["delivered", "Delivered"],
        ["partial", "Partly delivered"],
        ["failed", "Not delivered"],
      ]
    : INVOICE_CHIPS;
  const rows = (query.data?.rows ?? []).filter(
    (r) =>
      (!collected || r.state === "received") &&
      (!show ||
        (collected ? outcome(r.delivery_outcome) === show : r.state === show)),
  );
  return (
    <section className="grid min-w-0 gap-3" data-testid="invoices-tab">
      <DateScope
        state={state}
        set={set}
        label={
          collected
            ? "All delivery dates - collected invoices"
            : "All dates — anything not yet received"
        }
      />
      <div
        role="group"
        aria-label="Invoice status"
        className="flex flex-wrap gap-1"
      >
        {chips.map(([s, label]) => (
          <button
            key={s}
            className={buttonClass}
            aria-pressed={show === s}
            onClick={() => filter(s)}
          >
            {label} (
            {s
              ? collected
                ? (query.data?.rows ?? []).filter(
                    (r) => outcome(r.delivery_outcome) === s,
                  ).length
                : (query.data?.counts[s] ?? 0)
              : (query.data?.total ?? 0)}
            )
          </button>
        ))}
      </div>
      {query.data?.truncated && (
        <p role="status" className="text-sm text-muted-foreground">
          Showing the latest 500 collected invoices. Narrow the date or search
          to find older receipts.
        </p>
      )}
      {query.isLoading ? (
        <Skeleton className="h-48" />
      ) : query.isError ? (
        <ErrorLine error={query.error} onRetry={() => void query.refetch()} />
      ) : !rows.length ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm">
          {collected
            ? "No collected invoices match these filters."
            : "No invoices to collect in this view."}
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
                  "Delivery date",
                  "Delivery result",
                  "Invoice status",
                  collected ? "Collected at" : "Since",
                  collected ? "Collected by" : "Note",
                  ...(collected ? [] : ["Action"]),
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
                    {r.vehicle} {r.driver_name ?? r.holder}
                  </td>
                  <td className="p-3">{r.delivery_date}</td>
                  <td className="p-3">
                    {r.delivery_outcome ?? "Not recorded"}
                  </td>
                  <td className="p-3">
                    <Chip tone={INVOICE_TONE[r.state] ?? "neutral"}>
                      {collected ? "Collected" : invoiceWord(r.state)}
                    </Chip>
                  </td>
                  <td className="p-3" title={manilaDateTime(r.since)}>
                    {sinceText(r.since, now)}
                    <span className="block text-muted-foreground">
                      {manilaDateTime(r.since)}
                    </span>
                  </td>
                  <td className="max-w-48 break-words p-3">
                    {collected ? (r.received_by ?? r.holder) : r.note}
                  </td>
                  {!collected && (
                    <td className="p-3">
                      <ReceiveInvoiceButton
                        itemId={r.item_id}
                        handedOver={r.handed_over}
                        status={r.state}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
