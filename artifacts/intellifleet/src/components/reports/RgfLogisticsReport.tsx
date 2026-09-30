import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";
import * as reportsApi from "@/services/api/reports";
import type { RgfInventoryAdjustment, RgfInvoiceRow, RgfPurchaseReceiveRow, RgfSoRow, RgfTransferOrder, RgfWarehouseGroup, RgfReportSection } from "@/services/api/reports";

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" ");
const QUERY_KEY = ["rgf-logistics-report"];

type DrawerTarget = { kind: "sales-order"; id: string; label: string } | null;
type SoColumn = "customer" | "fulfillment_type" | "due_date" | "delivery_date" | "shipped_date";

function formatAsOf(iso: string | null | undefined) {
  if (!iso) return "-";
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso))} PHT`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(d);
}

function useRgfReport() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => reportsApi.fetchRgfLogisticsReport(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}

function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="animate-pulse p-5">
      <div className="h-3 w-32 bg-[#efeeeb]" />
      <div className="mt-4 grid gap-2">
        {Array.from({ length: lines }).map((_, i) => <div key={i} className="h-8 bg-[#f2f2ef]" />)}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-6 text-sm text-[#55565a]">
      <Check size={15} className="text-black" />
      {label}
    </div>
  );
}

function CardShell({
  title, subtitle, count, onRefresh, refreshing, children, action, unavailableReason,
}: { title: string; subtitle?: string; count?: number | null; onRefresh: () => void; refreshing: boolean; children: React.ReactNode; action?: React.ReactNode; unavailableReason?: string }) {
  return (
    <div className="flex flex-col border border-[#e4e3df] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e4e3df] px-5 py-4">
        <div className="flex items-center gap-2">
          {count !== undefined && count !== null && <span className="grid h-6 min-w-[24px] place-items-center rounded-full bg-black px-1.5 text-[11px] font-bold text-white">{count}</span>}
          <div>
            <div className="text-sm font-bold">{title}</div>
            {subtitle && <div className="text-[11px] text-[#77787b]">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            data-testid={`button-refresh-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`}
            onClick={onRefresh}
            title="Refresh this card"
            className="grid h-7 w-7 place-items-center border border-[#d8d7d2] text-[#55565a] hover:border-black hover:text-black"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {unavailableReason ? (
        <div className="flex items-center gap-2 bg-[#f7f7f4] px-5 py-3 text-xs text-[#55565a]">
          <AlertTriangle size={13} />
          {unavailableReason}
        </div>
      ) : (
        <div className="flex-1">{children}</div>
      )}
    </div>
  );
}

function SoRow({ row, columns, onOpen, today }: { row: RgfSoRow; columns: SoColumn[]; onOpen: () => void; today?: string }) {
  const overdue = !!today && !!row.due_date && row.due_date < today;
  const lateDeliveryDate = !!today && !!row.delivery_date && row.delivery_date < today;
  return (
    <tr className="hover:bg-[#fafaf8]">
      <td className="px-4 py-2.5">
        <button onClick={onOpen} disabled={!row.id} className="text-link mono text-xs font-semibold text-black disabled:no-underline">
          {row.so_number || row.id || "-"}
        </button>
      </td>
      {columns.includes("customer") && <td className="px-4 py-2.5 text-xs text-[#55565a]">{row.customer || "-"}</td>}
      {columns.includes("fulfillment_type") && <td className="px-4 py-2.5 text-xs text-[#55565a]">{row.fulfillment_type || "-"}</td>}
      {columns.includes("due_date") && <td className={cx("px-4 py-2.5 text-xs", overdue && "font-bold text-[#9a5b00]")}>{formatDate(row.due_date)}</td>}
      {columns.includes("delivery_date") && <td className={cx("px-4 py-2.5 text-xs", lateDeliveryDate && "font-bold text-[#9a5b00]")}>{formatDate(row.delivery_date)}</td>}
      {columns.includes("shipped_date") && <td className="px-4 py-2.5 text-xs">{formatDate(row.shipped_date)}</td>}
    </tr>
  );
}

function WarehouseGroupedTable({
  groups, emptyLabel, columns, onOpen, today,
}: { groups: RgfWarehouseGroup[]; emptyLabel: string; columns: SoColumn[]; onOpen: (row: RgfSoRow) => void; today?: string }) {
  if (!groups.length || groups.every((g) => g.count === 0)) return <EmptyState label={emptyLabel} />;
  return (
    <div className="thin-scroll max-h-[340px] overflow-auto">
      {groups.filter((g) => g.count > 0).map((group) => (
        <div key={group.warehouse}>
          <div className="flex items-center justify-between border-b border-[#e4e3df] bg-[#f7f7f4] px-4 py-2 text-xs font-semibold text-black">
            <span>{group.warehouse}</span>
            <span>{group.count}</span>
          </div>
          <table className="w-full text-left">
            <tbody className="divide-y divide-[#efeeeb]">
              {group.orders.map((row, i) => <SoRow key={`${row.id}-${row.package_id ?? ""}-${i}`} row={row} columns={columns} today={today} onOpen={() => onOpen(row)} />)}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function FlatSoTable({
  orders, emptyLabel, columns, onOpen, today,
}: { orders: RgfSoRow[]; emptyLabel: string; columns: SoColumn[]; onOpen: (row: RgfSoRow) => void; today?: string }) {
  if (!orders.length) return <EmptyState label={emptyLabel} />;
  return (
    <div className="thin-scroll max-h-[340px] overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 border-b border-[#e4e3df] bg-[#f7f7f4] text-[11px] uppercase tracking-wider text-[#77787b]">
          <tr>
            <th className="px-4 py-2">SO #</th>
            {columns.includes("customer") && <th className="px-4 py-2">Customer</th>}
            {columns.includes("delivery_date") && <th className="px-4 py-2">Del. Date</th>}
            {columns.includes("shipped_date") && <th className="px-4 py-2">Shipped</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efeeeb]">
          {orders.map((row, i) => <SoRow key={`${row.id}-${row.package_id ?? ""}-${i}`} row={row} columns={columns} today={today} onOpen={() => onOpen(row)} />)}
        </tbody>
      </table>
    </div>
  );
}

function DetailDrawer({ target, onClose }: { target: DrawerTarget; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["rgf-logistics-detail", target?.id],
    queryFn: () => reportsApi.getRgfSalesOrderDetail(target!.id),
    enabled: !!target,
    retry: false,
  });
  if (!target) return null;
  const record = (query.data && ((query.data as any).salesorder || query.data)) || null;
  return (
    <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="absolute bottom-0 right-0 top-0 w-full max-w-[460px] overflow-auto border-l border-[#e4e3df] bg-white p-6 shadow-xl">
        <div className="flex justify-between">
          <div>
            <div className="micro text-[#77787b]">Sales order detail</div>
            <h2 className="display-face mt-2 text-2xl font-bold">{target.label}</h2>
          </div>
          <button onClick={onClose} aria-label="Close detail"><X size={18} /></button>
        </div>
        <div className="mt-6">
          {query.isLoading && <div className="text-xs text-[#77787b]">Loading from Zoho Inventory...</div>}
          {query.isError && <div className="border border-[#c4291f] bg-[#fbeceb] p-3 text-xs text-[#c4291f]">Could not load this record from Zoho.</div>}
          {record && (
            <div className="grid gap-3 border-t border-[#e4e3df] pt-5 text-xs">
              {Object.entries(record)
                .filter(([key, value]) => value !== null && typeof value !== "object" && key !== "raw_json")
                .slice(0, 24)
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 border-b border-[#efeeeb] pb-2">
                    <span className="text-[#77787b]">{key.replaceAll("_", " ")}</span>
                    <span className="text-right font-semibold">{String(value)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="border border-[#e4e3df] bg-white p-4">
      <div className="display-face text-3xl font-bold text-black">{value ?? "-"}</div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[.1em] text-[#77787b]">{label}</div>
    </div>
  );
}

function ReportLoadingBar({ active }: { active: boolean }) {
  return (
    <div className="h-1 overflow-hidden border-b border-[#e4e3df] bg-[#f7f7f4]" aria-hidden={!active}>
      {active && (
        <>
          <style>{`@keyframes rgf-report-loading { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }`}</style>
          <div className="h-full w-1/3 bg-black" style={{ animation: "rgf-report-loading 1.1s ease-in-out infinite" }} />
        </>
      )}
    </div>
  );
}

export function RgfLogisticsReportView() {
  const query = useRgfReport();
  const queryClient = useQueryClient();
  const [drawer, setDrawer] = useState<DrawerTarget>(null);
  const [refreshingCard, setRefreshingCard] = useState<string | null>(null);
  const [packedFilter, setPackedFilter] = useState<"all" | "not-shipped" | "pickups">("all");
  const [reloading, setReloading] = useState(false);

  const refetchCombined = async () => {
    await queryClient.fetchQuery({ queryKey: QUERY_KEY, queryFn: () => reportsApi.fetchRgfLogisticsReport(true) });
  };
  const reloadAll = async () => {
    setReloading(true);
    try { await refetchCombined(); } finally { setReloading(false); }
  };
  const refreshCard = async (card: string, section: RgfReportSection) => {
    setRefreshingCard(card);
    try {
      const fresh = await reportsApi.fetchRgfLogisticsReport(true, section);
      queryClient.setQueryData(QUERY_KEY, (current: reportsApi.RgfLogisticsReport | undefined) => current ? ({
        ...current,
        as_of: fresh.as_of,
        errors: { ...current.errors, ...fresh.errors },
        unavailable: Array.from(new Set([...current.unavailable, ...fresh.unavailable])),
        kpis: { ...current.kpis, ...fresh.kpis },
        order_fulfillment: { ...current.order_fulfillment, ...fresh.order_fulfillment },
        transactions: { ...current.transactions, ...fresh.transactions },
      }) : fresh);
    } finally { setRefreshingCard(null); }
  };

  const data = query.data;
  const loading = query.isFetching || reloading || refreshingCard !== null;
  const openSo = (row: RgfSoRow) => {
    if (row.id) setDrawer({ kind: "sales-order", id: row.id, label: row.so_number || row.id });
  };
  const packedGroups = (data?.order_fulfillment.packed_not_shipped.groups ?? [])
    .map((group) => {
      const orders = group.orders.filter((row) => {
        if (packedFilter === "all") return true;
        const value = row.fulfillment_type || "";
        return packedFilter === "not-shipped" ? /company delivery/i.test(value) : /pick\s*-?\s*up/i.test(value);
      });
      return { ...group, count: orders.length, orders };
    })
    .filter((group) => group.count > 0);

  return (
    <div>
      <ReportLoadingBar active={loading} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-[#e4e3df] py-3">
        <span className="mono text-xs text-[#77787b]">as of {formatAsOf(data?.as_of)} / today {data?.today ?? "-"}</span>
        <button data-testid="button-reload-all" onClick={reloadAll} disabled={reloading} className="button-black inline-flex items-center gap-2 rounded-[4px] px-4 py-2 text-xs font-semibold disabled:opacity-50">
          <RefreshCw size={13} className={reloading ? "animate-spin" : ""} />
          {reloading ? "Reloading..." : "Reload all"}
        </button>
      </div>

      {query.isError && (
        <div className="mb-5 flex items-center justify-between gap-4 border border-[#c4291f] bg-[#fbeceb] px-4 py-3 text-sm text-[#c4291f]">
          <span className="flex items-center gap-2"><AlertTriangle size={15} /> {(query.error as any)?.message || "Could not load the Zoho Inventory snapshot."}</span>
          <button onClick={() => query.refetch()} className="font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      {!!data?.unavailable.length && (
        <div className="mb-5 border border-[#d8d7d2] bg-[#f7f7f4] px-4 py-3 text-xs text-[#55565a]">
          <div className="flex items-center gap-2 font-semibold text-black"><AlertTriangle size={13} /> Some sections are unavailable</div>
          <p className="mt-1">The connected Zoho Inventory account has not authorized read access for: <strong>{data.unavailable.join(", ")}</strong>.</p>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {query.isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[86px] animate-pulse border border-[#e4e3df] bg-[#f7f7f4]" />) : (
          <>
            <KpiTile label="Due / Past Due, Not Packed" value={data?.kpis.due_past_due_not_packed ?? null} />
            <KpiTile label="Packed, Not Shipped" value={data?.kpis.packed_not_shipped ?? null} />
            <KpiTile label="Shipped, Not Delivered" value={data?.kpis.shipped_not_delivered ?? null} />
            <KpiTile label="Delivered Today" value={data?.kpis.delivered_today ?? null} />
            <KpiTile label="Transfers Pending" value={data?.kpis.transfers_pending ?? null} />
            <KpiTile label="IAs Pending Approval" value={data?.kpis.ia_pending_approval ?? null} />
          </>
        )}
      </div>

      <div className="micro mb-3 mt-8 text-[#77787b]">Order Fulfillment</div>
      <div className="grid gap-4 md:grid-cols-2">
        <CardShell title="Due Today & Past Due, Not Yet Packed" count={data?.kpis.due_past_due_not_packed} onRefresh={() => refreshCard("due-past-due", "sales-orders")} refreshing={refreshingCard === "due-past-due"} unavailableReason={data?.errors.sales_orders}>
          {query.isLoading ? <CardSkeleton /> : <WarehouseGroupedTable groups={data?.order_fulfillment.due_past_due_not_packed.groups ?? []} emptyLabel="No orders due or past due without a package." columns={["customer", "fulfillment_type", "due_date"]} today={data?.today} onOpen={openSo} />}
        </CardShell>

        <CardShell
          title="Packed, Not Shipped"
          subtitle="by warehouse"
          count={data?.kpis.packed_not_shipped}
          onRefresh={() => refreshCard("packed-not-shipped", "packages")}
          refreshing={refreshingCard === "packed-not-shipped"}
          unavailableReason={data?.errors.packages}
          action={
            <div className="flex gap-1">
              {(["not-shipped", "pickups"] as const).map((p) => (
                <button key={p} onClick={() => setPackedFilter(packedFilter === p ? "all" : p)} className={cx("border px-2 py-1 text-[10px] font-semibold", packedFilter === p ? "border-black bg-black text-white" : "border-[#d8d7d2] text-[#77787b]")}>
                  {p === "not-shipped" ? "#not-shipped" : "Pick-ups"}
                </button>
              ))}
            </div>
          }
        >
          {query.isLoading ? <CardSkeleton /> : <WarehouseGroupedTable groups={packedGroups} emptyLabel="No packages waiting on a shipment." columns={["customer", "fulfillment_type", "delivery_date"]} today={data?.today} onOpen={openSo} />}
        </CardShell>

        <CardShell title="Shipped, Not Yet Delivered" count={data?.kpis.shipped_not_delivered} onRefresh={() => refreshCard("shipped-not-delivered", "packages")} refreshing={refreshingCard === "shipped-not-delivered"} unavailableReason={data?.errors.packages}>
          {query.isLoading ? <CardSkeleton /> : <FlatSoTable orders={data?.order_fulfillment.shipped_not_delivered.orders ?? []} emptyLabel="Nothing shipped is awaiting delivery." columns={["customer", "delivery_date", "shipped_date"]} today={data?.today} onOpen={openSo} />}
        </CardShell>

        <CardShell title="Shipped Today, Delivered" count={data?.kpis.delivered_today} onRefresh={() => refreshCard("delivered-today", "packages")} refreshing={refreshingCard === "delivered-today"} unavailableReason={data?.errors.packages}>
          {query.isLoading ? <CardSkeleton /> : <FlatSoTable orders={data?.order_fulfillment.delivered_today.orders ?? []} emptyLabel="No deliveries completed yet today." columns={["customer"]} onOpen={openSo} />}
        </CardShell>
      </div>

      <div className="micro mb-3 mt-8 text-[#77787b]">Transactions</div>
      <div className="grid gap-4 md:grid-cols-2">
        <CardShell title="Inventory Adjustments - pending" subtitle="pending approval, last 90 days" count={data?.kpis.ia_pending_approval} onRefresh={() => refreshCard("ia-pending", "inventory-adjustments")} refreshing={refreshingCard === "ia-pending"} unavailableReason={data?.errors.inventory_adjustments}>
          {query.isLoading ? <CardSkeleton /> : !(data?.transactions.inventory_adjustments_pending.length) ? <EmptyState label="No pending inventory adjustments." /> : (
            <div className="thin-scroll max-h-[300px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-[#e4e3df] bg-[#f7f7f4] text-[11px] uppercase tracking-wider text-[#77787b]">
                  <tr><th className="px-4 py-2">IA Type</th><th className="px-4 py-2">Qty</th><th className="px-4 py-2">Whse</th><th className="px-4 py-2">Date</th></tr>
                </thead>
                <tbody className="divide-y divide-[#efeeeb]">
                  {data!.transactions.inventory_adjustments_pending.map((ia: RgfInventoryAdjustment) => (
                    <tr key={ia.id}>
                      <td className="px-4 py-2.5 text-xs">{ia.ia_type || "-"}</td>
                      <td className={cx("px-4 py-2.5 mono text-xs font-semibold", Number(ia.qty ?? 0) < 0 ? "text-[#c4291f]" : "text-[#1e7b44]")}>{ia.qty ?? "-"}</td>
                      <td className="px-4 py-2.5"><span className="border border-[#d8d7d2] px-1.5 py-0.5 text-[10px]">{ia.warehouse}</span></td>
                      <td className="px-4 py-2.5 text-xs">{formatDate(ia.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>

        <CardShell title="Transfer Orders" subtitle="draft / pending / approved / in transit" count={data?.kpis.transfers_pending} onRefresh={() => refreshCard("transfer-orders", "transfer-orders")} refreshing={refreshingCard === "transfer-orders"} unavailableReason={data?.errors.transfer_orders}>
          {query.isLoading ? <CardSkeleton /> : !(data?.transactions.transfer_orders.length) ? <EmptyState label="No open transfer orders." /> : (
            <div className="thin-scroll max-h-[300px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-[#e4e3df] bg-[#f7f7f4] text-[11px] uppercase tracking-wider text-[#77787b]">
                  <tr><th className="px-4 py-2">TO #</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">From / To</th><th className="px-4 py-2">Qty</th><th className="px-4 py-2">Date</th></tr>
                </thead>
                <tbody className="divide-y divide-[#efeeeb]">
                  {data!.transactions.transfer_orders.map((to: RgfTransferOrder) => (
                    <tr key={to.id}>
                      <td className="px-4 py-2.5 mono text-xs font-semibold">{to.to_number}</td>
                      <td className="px-4 py-2.5"><span className="status-chip status-neutral capitalize">{to.status.replaceAll("_", " ")}</span></td>
                      <td className="px-4 py-2.5 text-xs text-[#55565a]">{to.from || "-"} / {to.to || "-"}</td>
                      <td className="px-4 py-2.5 mono text-xs">{to.qty ?? "-"}</td>
                      <td className="px-4 py-2.5 text-xs">{formatDate(to.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>

        <CardShell title="Purchase Receives" subtitle="not billed / no attachment" onRefresh={() => refreshCard("purchase-receives", "purchase-receives")} refreshing={refreshingCard === "purchase-receives"} unavailableReason={data?.errors.purchase_receives}>
          {query.isLoading ? <CardSkeleton lines={2} /> : (
            <div className="grid grid-cols-2 gap-3 p-5">
              <div className="border border-[#e4e3df] p-4 text-center">
                <div className={cx("display-face text-3xl font-bold", (data?.transactions.purchase_receives.not_billed ?? 0) > 0 ? "text-[#c4291f]" : "text-[#1e7b44]")}>{data?.transactions.purchase_receives.not_billed ?? 0}</div>
                <div className="mt-2 text-[11px] uppercase tracking-[.1em] text-[#77787b]">Not billed</div>
              </div>
              <div className="border border-[#e4e3df] p-4 text-center">
                <div className={cx("display-face text-3xl font-bold", (data?.transactions.purchase_receives.no_attachment ?? 0) > 0 ? "text-[#c4291f]" : "text-[#1e7b44]")}>{data?.transactions.purchase_receives.no_attachment ?? 0}</div>
                <div className="mt-2 text-[11px] uppercase tracking-[.1em] text-[#77787b]">No attachment</div>
              </div>
              <div className="col-span-2 thin-scroll max-h-[240px] overflow-auto border-t border-[#e4e3df] pt-3">
                {!(data?.transactions.purchase_receives.rows.length) ? <EmptyState label="No purchase receives in these buckets." /> : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 border-b border-[#e4e3df] bg-white text-[11px] uppercase tracking-wider text-[#77787b]">
                      <tr><th className="px-2 py-2">PR #</th><th className="px-2 py-2">Bucket</th><th className="px-2 py-2">Vendor</th><th className="px-2 py-2">Created By</th><th className="px-2 py-2">Date</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#efeeeb]">
                      {data!.transactions.purchase_receives.rows.map((pr: RgfPurchaseReceiveRow) => (
                        <tr key={pr.id}>
                          <td className="px-2 py-2 mono text-xs font-semibold">{pr.pr_number || pr.id}</td>
                          <td className="px-2 py-2 text-xs">{pr.buckets.join(", ")}</td>
                          <td className="px-2 py-2 text-xs text-[#55565a]">{pr.vendor || "-"}</td>
                          <td className="px-2 py-2 text-xs text-[#55565a]">{pr.created_by || "-"}</td>
                          <td className="px-2 py-2 text-xs">{formatDate(pr.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="mt-3 text-[11px] text-[#77787b]">Total PRs scanned: {data?.transactions.purchase_receives.scanned ?? 0}</div>
              </div>
            </div>
          )}
        </CardShell>

        <CardShell title="Invoices - Draft" onRefresh={() => refreshCard("invoices-draft", "invoices")} refreshing={refreshingCard === "invoices-draft"} unavailableReason={data?.errors.invoices}>
          {query.isLoading ? <CardSkeleton lines={1} /> : (data?.transactions.invoices_draft.count ?? 0) === 0 ? <EmptyState label="No draft invoices." /> : (
            <div className="thin-scroll max-h-[300px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-[#e4e3df] bg-[#f7f7f4] text-[11px] uppercase tracking-wider text-[#77787b]">
                  <tr><th className="px-4 py-2">Inv #</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">SO #</th><th className="px-4 py-2">Date</th></tr>
                </thead>
                <tbody className="divide-y divide-[#efeeeb]">
                  {data!.transactions.invoices_draft.orders.map((inv: RgfInvoiceRow) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-2.5 mono text-xs font-semibold">{inv.invoice_number || inv.id}</td>
                      <td className="px-4 py-2.5 text-xs text-[#55565a]">{inv.customer || "-"}</td>
                      <td className="px-4 py-2.5 mono text-xs">{inv.so_number || "-"}</td>
                      <td className="px-4 py-2.5 text-xs">{formatDate(inv.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>
      </div>

      <DetailDrawer target={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
