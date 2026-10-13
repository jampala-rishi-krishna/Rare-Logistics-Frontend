import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Scale, Search } from "lucide-react";
import * as inventoryApi from "@/services/api/inventory";
import { HorizontalScrollTable } from "./HorizontalScrollTable";
import { OrderTypeBadge } from "./OrderTypeBadge";
import { FilterField, Toolbar, inputClass, primaryButtonClass } from "./ToolbarControls";
import { lastRefreshedLabel } from "@/lib/orderMerge";
import { ORDER_TYPE_STYLE } from "@/lib/orderType";

export const TRANSFER_ORDERS_KEY = "inventory-transfer-orders";

function tomorrowPht() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function dateLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
const dash = (value: unknown) => (typeof value === "string" && value.trim() ? value : "-");

const COLUMNS: [string, number][] = [
  ["Date", 120],
  ["Transfer Order#", 150],
  ["Reason", 220],
  ["Status", 100],
  ["Quantity", 100],
  ["Source Warehouse", 190],
  ["Destination Warehouse", 190],
  ["Created By", 170],
  ["Last Modified By", 170],
];

/** Inventory > TO: Draft transfer orders between Mets and Glacier. No Acknowledge for TO. */
export default function TransferOrdersTab() {
  const client = useQueryClient();
  const initial = tomorrowPht();
  const [from, setFrom] = useState(initial);
  const [to, setTo] = useState(initial);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");

  const orders = useQuery({
    queryKey: [TRANSFER_ORDERS_KEY, from, to, page, query],
    queryFn: () => inventoryApi.listTransferOrders(from, to, page, query),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    // Line details / weights fill in on the backend after the list returns: poll until they are all in.
    refetchInterval: (q) => (q.state.data?.details_pending ? 4000 : false),
  });
  useEffect(() => setPage(1), [from, to, query]);

  const hardRefresh = useMutation({
    mutationFn: () => inventoryApi.refreshTransferOrders(),
    onSuccess: async (result) => {
      setMessage(`Refreshed ${result.count} transfer order${result.count === 1 ? "" : "s"} from Zoho.`);
      await client.invalidateQueries({ queryKey: [TRANSFER_ORDERS_KEY] });
    },
    onError: (error: any) => setMessage(error?.message || "Zoho Inventory could not be refreshed."),
  });

  const items = orders.data?.items ?? [];
  const pending = Boolean(orders.data?.details_pending);
  const complete = orders.data?.weight_complete !== false;
  const total = Number(orders.data?.total_weight_kg ?? 0);
  const weightText = `${total.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${complete ? "kg" : "kg+"}`;
  const refreshedAt = lastRefreshedLabel(orders.data?.last_refreshed_at);
  const color = ORDER_TYPE_STYLE.TO.color;

  return (
    <div className="load-planning-panel min-w-0 border border-[#e4e3df] bg-white" data-testid="transfer-orders-tab">
      <Toolbar
        singleRow
        count={orders.data?.total ?? 0}
        noun="transfer orders"
        meta={
          <>
            <span data-testid="to-total-weight" className="inline-flex items-center gap-1.5 text-[13px] text-[#77787b]" title={complete ? "Total weight of the listed transfer orders" : "Some line weights are still unknown, so the real total is higher"}>
              <Scale size={13} className="shrink-0" />
              {pending ? (
                <>
                  <Loader2 size={12} className="shrink-0 animate-spin" /> Calculating…
                </>
              ) : (
                <span className="mono font-semibold text-black">{weightText}</span>
              )}
            </span>
            {refreshedAt && (
              <span data-testid="to-last-refreshed" className="text-[13px] text-[#77787b]">
                Last refreshed <span className="mono font-semibold text-black">{refreshedAt}</span>
              </span>
            )}
          </>
        }
        filters={
          <>
            <div className="relative min-w-0 sm:min-w-[220px] sm:flex-1 sm:basis-[220px]">
              <Search size={15} className="pointer-events-none absolute left-3 top-[10px] text-[#77787b]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transfer orders" aria-label="Search transfer orders" className={`${inputClass} w-full pl-9 pr-3`} />
            </div>
            <FilterField label="From">
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} w-full sm:w-[150px]`} />
            </FilterField>
            <FilterField label="To">
              <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className={`${inputClass} w-full sm:w-[150px]`} />
            </FilterField>
          </>
        }
        actions={
          <button type="button" onClick={() => hardRefresh.mutate()} disabled={hardRefresh.isPending} className={primaryButtonClass} data-testid="to-hard-refresh">
            {hardRefresh.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {hardRefresh.isPending ? "Refreshing..." : "Hard refresh"}
          </button>
        }
      />
      {message && <div className="border-b border-[#cddfd2] bg-[#edf6f0] px-4 py-2 text-xs text-[#1e7b44]">{message}</div>}
      {orders.isError ? (
        <div className="p-10 text-center text-sm text-[#a32720]">{(orders.error as Error).message}</div>
      ) : orders.isLoading ? (
        <div className="grid gap-2 p-4" aria-label="Loading transfer orders">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-10 animate-pulse bg-[#f2f2ef]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-sm text-[#77787b]">No transfer orders for this filter. Click Hard refresh to re-read Zoho.</div>
      ) : (
        <>
          <div className="grid gap-3 p-3 md:hidden">
            {items.map((order) => (
              <article key={order.id} className="min-w-0 max-w-full overflow-hidden border border-[#e4e3df] bg-[#fafaf8] p-3 text-xs [overflow-wrap:anywhere]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="mono flex items-center gap-1.5 text-sm font-semibold" style={{ color }}>
                      <OrderTypeBadge type="TO" />
                      {order.transfer_order_number ?? order.salesorder_number ?? order.id}
                    </div>
                    <div className="mt-1 text-[#55565a]">{dash(order.reason)}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#fff1d6] px-2 py-1 text-[10px] font-semibold uppercase">{dash(order.order_status)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#e4e3df] pt-3">
                  <div><div className="text-[10px] uppercase text-[#77787b]">Date</div>{dateLabel(order.expected_shipment_date)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Quantity</div>{order.total_item_quantity ?? "-"}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Source</div>{dash(order.source_warehouse)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Destination</div>{dash(order.destination_warehouse)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Created by</div>{dash(order.created_by)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Modified by</div>{dash(order.last_modified_by)}</div>
                </div>
              </article>
            ))}
          </div>
          <HorizontalScrollTable contentWidth="1400px">
            <table className="w-full min-w-[1400px] table-fixed text-left text-xs">
              <colgroup>
                {COLUMNS.map(([name, width]) => (
                  <col key={name} style={{ width: `${width}px` }} />
                ))}
              </colgroup>
              <thead className="border-b border-[#e4e3df] bg-[#f7f7f4] text-[10px] uppercase tracking-widest text-[#77787b]">
                <tr>
                  {COLUMNS.map(([name]) => (
                    <th key={name} className="whitespace-normal px-3 py-3 font-semibold leading-tight">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr key={order.id} className="border-b border-[#efeeeb] hover:bg-[#fafaf8]">
                    <td className="px-3 py-4 align-top">{dateLabel(order.expected_shipment_date)}</td>
                    <td className="px-3 py-4 align-top font-semibold" style={{ color }}>
                      <span className="mr-1.5 align-middle"><OrderTypeBadge type="TO" /></span>
                      {order.transfer_order_number ?? order.salesorder_number ?? order.id}
                    </td>
                    <td className="whitespace-normal break-words px-3 py-4 align-top">{dash(order.reason)}</td>
                    <td className="px-3 py-4 align-top capitalize">{dash(order.order_status)}</td>
                    <td className="px-3 py-4 align-top">{order.total_item_quantity ?? "-"}</td>
                    <td className="whitespace-normal px-3 py-4 align-top">{dash(order.source_warehouse)}</td>
                    <td className="whitespace-normal px-3 py-4 align-top">{dash(order.destination_warehouse)}</td>
                    <td className="whitespace-normal px-3 py-4 align-top">{dash(order.created_by)}</td>
                    <td className="whitespace-normal px-3 py-4 align-top">{dash(order.last_modified_by)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HorizontalScrollTable>
          <div className="flex items-center justify-end gap-2 border-t border-[#e4e3df] px-4 py-3">
            <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || orders.isFetching} className="border border-[#d8d7d2] px-3 py-2 text-sm disabled:opacity-40">
              Previous
            </button>
            <span className="text-xs text-[#77787b]">Page {page} of {Math.max(1, Math.ceil((orders.data?.total ?? 0) / 100))}</span>
            <button onClick={() => setPage((value) => value + 1)} disabled={!orders.data?.has_more || orders.isFetching} className="button-black px-3 py-2 text-sm disabled:opacity-40">
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
