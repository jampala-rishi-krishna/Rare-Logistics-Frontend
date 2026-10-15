import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Scale, Search } from "lucide-react";
import * as inventoryApi from "@/services/api/inventory";
import { HorizontalScrollTable } from "./HorizontalScrollTable";
import { OrderTypeBadge } from "./OrderTypeBadge";
import { BranchBadge } from "./BranchControls";
import { EmptyState, FilterField, ListError, Toolbar, buttonClass, inputClass, primaryButtonClass } from "./ToolbarControls";
import { lastRefreshedLabel } from "@/lib/orderMerge";
import { ORDER_TYPE_STYLE } from "@/lib/orderType";
import { poStatusLabel, poStatusOptions } from "@/lib/purchaseOrders";

export const PURCHASE_ORDERS_KEY = "inventory-purchase-orders";

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
function money(value: unknown) {
  return typeof value === "number" ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
}
function orderKg(order: inventoryApi.SalesOrderSummary, pending: boolean) {
  const products = order.products ?? [];
  if (!order.lines_loaded) return pending ? "…" : "-";
  const known = products.filter((p) => p.total_weight_kg != null).reduce((sum, p) => sum + Number(p.total_weight_kg), 0);
  const unknown = products.some((p) => p.total_weight_kg == null);
  return `${known.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${unknown ? "kg+" : "kg"}`;
}
const dash = (value: unknown) => (typeof value === "string" && value.trim() ? value : "-");

const COLUMNS: [string, number][] = [
  ["Date", 120],
  ["Expected Delivery", 150],
  ["PO#", 170],
  ["Vendor", 220],
  ["Status", 140],
  ["Amount", 120],
  ["Branch", 150],
  ["Destination Warehouse", 190],
  ["Quantity", 90],
  ["Weight", 110],
];

/** Inventory > PO: PO- purchase orders (never "SS PO-", never SariSuki). No Acknowledge for PO. */
export default function PurchaseOrdersTab() {
  const client = useQueryClient();
  const initial = tomorrowPht();
  const [from, setFrom] = useState(initial);
  const [to, setTo] = useState(initial);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [message, setMessage] = useState("");

  const orders = useQuery({
    queryKey: [PURCHASE_ORDERS_KEY, from, to, page, query, statuses.join(",")],
    queryFn: () => inventoryApi.listPurchaseOrders(from, to, page, query, undefined, statuses),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (q) => (q.state.data?.details_pending ? 4000 : false),
  });
  useEffect(() => setPage(1), [from, to, query, statuses]);

  const hardRefresh = useMutation({
    mutationFn: () => inventoryApi.refreshPurchaseOrders(),
    onSuccess: async (result) => {
      setMessage(`Refreshed ${result.count} purchase order${result.count === 1 ? "" : "s"} from Zoho.`);
      await client.invalidateQueries({ queryKey: [PURCHASE_ORDERS_KEY] });
    },
    onError: (error: any) => setMessage(error?.message || "Zoho Inventory could not be refreshed."),
  });

  const items = orders.data?.items ?? [];
  const pending = Boolean(orders.data?.details_pending);
  const complete = orders.data?.weight_complete !== false;
  const total = Number(orders.data?.total_weight_kg ?? 0);
  const weightText = `${total.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${complete ? "kg" : "kg+"}`;
  const refreshedAt = lastRefreshedLabel(orders.data?.last_refreshed_at);
  const color = ORDER_TYPE_STYLE.PO.color;
  const options = useMemo(() => poStatusOptions(orders.data?.status_counts, statuses), [orders.data?.status_counts, statuses]);
  const statusText = statuses.length ? statuses.map(poStatusLabel).join(", ") : "All except Cancelled / Closed";

  const number = (order: inventoryApi.SalesOrderSummary) => order.purchaseorder_number ?? order.salesorder_number ?? order.id;
  const expected = (order: inventoryApi.SalesOrderSummary) =>
    order.no_expected_date ? (
      <span data-testid="po-no-expected-date" className="rounded-[3px] bg-[#fff1d6] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#7a5b00]" title="No Expected Delivery Date in Zoho: planned on the PO date">
        No expected date
      </span>
    ) : (
      dateLabel(order.expected_delivery_date ?? order.expected_shipment_date)
    );

  return (
    <div className="load-planning-panel min-w-0 border border-[#e4e3df] bg-white" data-testid="purchase-orders-tab">
      <Toolbar
        title="Purchase Orders"
        count={orders.data?.total ?? 0}
        noun="orders"
        meta={
          <span data-testid="po-total-weight" className="inline-flex items-center gap-1.5 text-[13px] text-[#77787b]" title={complete ? "Total weight of the listed purchase orders" : "Some line weights are still unknown, so the real total is higher"}>
            <Scale size={13} className="shrink-0" />
            {pending ? (
              <>
                <Loader2 size={12} className="shrink-0 animate-spin" /> Calculating…
              </>
            ) : (
              <span className="mono font-semibold text-black">{weightText}</span>
            )}
          </span>
        }
        filters={
          <>
            <FilterField label="Search" className="@[1000px]:w-[250px]">
              <div className="relative min-w-0">
                <Search size={15} className="pointer-events-none absolute left-3 top-[10px] text-[#77787b]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search purchase orders" aria-label="Search purchase orders" className={`${inputClass} w-full pl-9 pr-3`} />
              </div>
            </FilterField>
            <FilterField label="From" className="@[1000px]:w-[150px]">
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} w-full`} />
            </FilterField>
            <FilterField label="To" className="@[1000px]:w-[150px]">
              <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className={`${inputClass} w-full`} />
            </FilterField>
            <FilterField label="Status" className="@[1000px]:w-[230px]">
              <div className="relative min-w-0">
                <button type="button" onClick={() => setStatusOpen((open) => !open)} className={`${buttonClass} w-full !justify-between text-left font-medium text-black`} data-testid="po-status-filter" aria-expanded={statusOpen}>
                  <span className="truncate">{statusText}</span>
                  <span>▾</span>
                </button>
                {statusOpen && (
                  <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full min-w-56 overflow-y-auto border border-[#d8d7d2] bg-white p-2 shadow-lg">
                    <button type="button" className="mb-2 text-xs font-semibold underline" onClick={() => setStatuses([])}>
                      Default (hide Cancelled / Closed)
                    </button>
                    {options.map((option) => (
                      <label key={option.value} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={statuses.includes(option.value)}
                          onChange={() => setStatuses((current) => (current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value]))}
                        />
                        <span className="flex-1">{option.label}</span>
                        <span className="mono text-xs text-[#77787b]">{option.count}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </FilterField>
          </>
        }
        headerActions={
          <>
            {refreshedAt && (
              <span data-testid="po-last-refreshed" className="text-xs text-[#77787b]">
                Last refreshed <span className="mono font-semibold text-black">{refreshedAt}</span>
              </span>
            )}
            <button type="button" onClick={() => hardRefresh.mutate()} disabled={hardRefresh.isPending} className={primaryButtonClass} data-testid="po-hard-refresh">
              {hardRefresh.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {hardRefresh.isPending ? "Refreshing..." : "Hard refresh"}
            </button>
          </>
        }
        actions={null}
      />
      {message && <div className="border-b border-[#cddfd2] bg-[#edf6f0] px-4 py-2 text-xs text-[#1e7b44]">{message}</div>}
      {orders.isError ? (
        <ListError message={(orders.error as Error).message} />
      ) : orders.isLoading ? (
        <div className="grid gap-2 p-4" aria-label="Loading purchase orders">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-10 animate-pulse bg-[#f2f2ef]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No orders found" hint={query || statuses.length ? "No purchase orders match these filters. Try widening the dates or the status filter." : "No PO- purchase orders expected for this date."} />
      ) : (
        <>
          <div className="grid gap-3 p-3 md:hidden">
            {items.map((order) => (
              <article key={order.id} className="min-w-0 max-w-full overflow-hidden border border-[#e4e3df] bg-[#fafaf8] p-3 text-xs [overflow-wrap:anywhere]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="mono flex items-center gap-1.5 text-sm font-semibold" style={{ color }}>
                      <OrderTypeBadge type="PO" />
                      {number(order)}
                    </div>
                    <div className="mt-1 font-semibold text-black">{dash(order.vendor_name ?? order.customer_name)}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#fff1d6] px-2 py-1 text-[10px] font-semibold uppercase">{order.status_label ?? poStatusLabel(order.order_status)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#e4e3df] pt-3">
                  <div><div className="text-[10px] uppercase text-[#77787b]">Date</div>{dateLabel(order.po_date ?? order.order_date)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Expected delivery</div>{expected(order)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Amount</div>{money(order.total)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Branch</div>{dash(order.branch_name)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Destination</div>{dash(order.destination_warehouse)}</div>
                  <div><div className="text-[10px] uppercase text-[#77787b]">Qty / Weight</div>{order.total_item_quantity ?? "-"} · {orderKg(order, pending)}</div>
                </div>
              </article>
            ))}
          </div>
          <HorizontalScrollTable contentWidth="1460px">
            <table className="w-full min-w-[1460px] table-fixed text-left text-xs">
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
                  <tr key={order.id} className="border-b border-[#efeeeb] hover:bg-[#fafaf8]" data-testid={`po-row-${number(order)}`}>
                    <td className="px-3 py-4 align-top">{dateLabel(order.po_date ?? order.order_date)}</td>
                    <td className="px-3 py-4 align-top">{expected(order)}</td>
                    <td className="px-3 py-4 align-top font-semibold" style={{ color }}>
                      <span className="mr-1.5 align-middle"><OrderTypeBadge type="PO" /></span>
                      {number(order)}
                    </td>
                    <td className="whitespace-normal break-words px-3 py-4 align-top">{dash(order.vendor_name ?? order.customer_name)}</td>
                    <td className="px-3 py-4 align-top">{order.status_label ?? poStatusLabel(order.order_status)}</td>
                    <td className="px-3 py-4 text-right align-top">{money(order.total)}</td>
                    <td className="whitespace-normal px-3 py-4 align-top">{order.branch_name ? <>{order.branch_name}<BranchBadge code={order.branch_code} name={order.branch_name} /></> : "-"}</td>
                    <td className="whitespace-normal px-3 py-4 align-top">{dash(order.destination_warehouse)}</td>
                    <td className="px-3 py-4 align-top">{order.total_item_quantity ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-4 align-top font-semibold">{orderKg(order, pending)}</td>
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
