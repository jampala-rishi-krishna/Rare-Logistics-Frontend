import { useMemo, useState } from "react";
import { CalendarDays, Loader2, RefreshCw, Scale, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as inventoryApi from "@/services/api/inventory";
import { StockQty } from "./StockQty";

type Order = inventoryApi.SalesOrderSummary;
type Product = NonNullable<Order["products"]>[number];

function tomorrowPht() {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + 86400000));
  const v = Object.fromEntries(
    p.filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
  );
  return `${v.year}-${v.month}-${v.day}`;
}
function address(v: any) {
  const a = Array.isArray(v) ? v[0] : v;
  return a && typeof a === "object"
    ? [a.address, a.street_address, a.state, a.zip, a.country]
        .filter(Boolean)
        .join(", ") || "-"
    : "-";
}
function city(v: any) {
  const a = Array.isArray(v) ? v[0] : v;
  return a?.city || "-";
}
function orderCity(order: Order) {
  const raw = (order as any).raw_json ?? {};
  return (order as any).shipping_city || city((order as any).shipping_address ?? raw.shipping_address);
}
function dateLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function kg(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}
function lineWarehouse(order: Order, product: Product | null) {
  const lines: any[] = (order as any).raw_json?.line_items ?? [];
  const match = product ? lines.find((line) => (product.line_item_id && line.line_item_id === product.line_item_id) || (product.item_id && line.item_id === product.item_id)) : null;
  const names = match ? [match.location_name ?? match.warehouse_name] : lines.map((line) => line.location_name ?? line.warehouse_name);
  return Array.from(new Set(names.filter(Boolean))).join(", ") || "-";
}

const COLUMNS: [string, number][] = [
  ["", 44],
  ["Expected Shipment Date", 120],
  ["Sales Order#", 130],
  ["Customer Name", 210],
  ["Product", 220],
  ["SKU", 110],
  ["Quantity", 80],
  ["Unit", 70],
  ["Total Weight", 100],
  ["City", 110],
  ["Shipping Address", 280],
  ["Notes", 260],
  ["Mets Avail.", 90],
  ["Glacier Avail.", 100],
  ["Warehouse", 150],
];
const STICKY_LEFT = ["left-0", "left-[44px]", "left-[164px]", "left-[294px]"];

export default function LoadPlanningAssignmentTab() {
  const [, navigate] = useLocation();
  const [from, setFrom] = useState(tomorrowPht());
  const [to, setTo] = useState(tomorrowPht());
  const [search, setSearch] = useState("");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const orders = useQuery({
    queryKey: ["load-planning-unassigned", from, to, search],
    // Load every page so the city filter and the total weight cover all filtered orders.
    queryFn: async () => {
      const first = await inventoryApi.listSalesOrders(from, to, 1, "Acknowledged", search, "unassigned");
      let items = first.items;
      let last = first;
      for (let page = 2; last.has_more && page <= 20; page += 1) {
        last = await inventoryApi.listSalesOrders(from, to, page, "Acknowledged", search, "unassigned");
        items = [...items, ...last.items];
      }
      return { ...first, items, has_more: false, stock_pending: last.stock_pending };
    },
    retry: false,
    // Stock and item weights are filled in by the backend after the list returns - poll
    // lightly until they're all in so the total weight settles by itself.
    refetchInterval: (query) => (query.state.data?.stock_pending ? 4000 : false),
  });
  // Both city choices and table rows use the same acknowledged, unassigned list.
  const citySource = orders;
  const cityOptions = useMemo(() => {
    const values = (citySource.data?.items ?? [])
      .map(orderCity)
      .filter((value): value is string => Boolean(value && value !== "-"));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [citySource.data]);
  const visibleOrders = useMemo(() => {
    const items = orders.data?.items ?? [];
    if (!selectedCities.length) return items;
    return items.filter((order) => selectedCities.includes(orderCity(order)));
  }, [orders.data, selectedCities]);
  const ids = useMemo(() => visibleOrders.map((x) => x.id), [visibleOrders]);
  // Total weight of exactly what the filters leave on screen.
  const weight = useMemo(() => {
    let total = 0;
    let unknown = 0;
    for (const order of visibleOrders) {
      for (const product of order.products ?? []) {
        if (product.total_weight_kg == null) unknown += 1;
        else total += Number(product.total_weight_kg);
      }
    }
    return { total, unknown };
  }, [visibleOrders]);
  const calculating = orders.isLoading || Boolean(orders.data?.stock_pending);
  const rows = useMemo(
    () =>
      visibleOrders.flatMap((order) => {
        const products = order.products?.length ? order.products : [null];
        return products.map((product, index) => ({ order, product, key: `${order.id}-${product?.line_item_id ?? index}` }));
      }),
    [visibleOrders],
  );
  const all = ids.length > 0 && ids.every((id) => selected.includes(id));
  const toggleAll = () =>
    setSelected(
      all
        ? selected.filter((id) => !ids.includes(id))
        : Array.from(new Set([...selected, ...ids])),
    );
  const toggle = (id: string) =>
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
  return (
    <div className="load-planning-panel min-w-0 border border-[#e4e3df] bg-white">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 border-b border-[#e4e3df] p-3 sm:p-4">
        <div className="w-full min-w-0">
          <div className="micro text-[#77787b]">Truck assignment queue</div>
          <h2 className="display-face mt-1 text-xl font-bold sm:text-2xl">
            Acknowledged Sales Orders{" "}
            <span className="ml-2 text-sm font-normal text-[#77787b]">
              {visibleOrders.length}
            </span>
          </h2>
        </div>
        <div className="grid w-full min-w-0 grid-cols-2 items-end gap-3 md:flex md:w-auto md:flex-wrap">
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-[#77787b]">
            <span className="flex items-center gap-1">
              <CalendarDays size={13} /> Date from
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="min-w-0 w-full border px-2 py-2 text-sm text-black"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-[#77787b]">
            <span>Date to</span>
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-w-0 w-full border px-2 py-2 text-sm text-black"
            />
          </label>
          <label className="col-span-2 grid min-w-0 gap-1 text-xs font-semibold text-[#77787b] md:col-span-1">
            <span>Destination cities</span>
            <div className="relative min-w-0 w-full md:min-w-48">
              <button
                type="button"
                onClick={() => setCitiesOpen((value) => !value)}
                className="flex h-10 w-full items-center justify-between border bg-white px-3 text-left text-sm font-medium text-black"
              >
                <span>
                  {selectedCities.length
                    ? `${selectedCities.length} city${selectedCities.length === 1 ? "" : "ies"} selected`
                    : "All cities"}
                </span>
                <span>▾</span>
              </button>
              {citiesOpen && (
                <div className="absolute left-0 top-11 z-20 max-h-64 w-full min-w-56 overflow-y-auto border border-[#d8d7d2] bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    className="mb-2 text-xs font-semibold underline"
                    onClick={() => setSelectedCities([])}
                  >
                    Clear
                  </button>
                  {citySource.isLoading && (
                    <div className="py-2 text-xs text-[#77787b]">
                      Loading cities…
                    </div>
                  )}
                  {!citySource.isLoading && !cityOptions.length && (
                    <div className="py-2 text-xs text-[#77787b]">
                      No city data found
                    </div>
                  )}
                  {cityOptions.map((value) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCities.includes(value)}
                        onChange={() =>
                          setSelectedCities((current) =>
                            current.includes(value)
                              ? current.filter((cityName) => cityName !== value)
                              : [...current, value],
                          )
                        }
                      />
                      {value}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </label>
          <div className="relative col-span-2 min-w-0 md:col-span-1">
            <Search
              size={15}
              className="absolute left-3 top-2.5 text-[#77787b]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders"
              className="w-full border py-2 pl-9 pr-3 text-sm md:w-auto"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void orders.refetch();
            }}
            disabled={orders.isFetching || citySource.isFetching}
            className="button-black col-span-1 flex h-10 items-center justify-center gap-2 rounded-[4px] px-4 text-sm disabled:opacity-60 md:col-span-1"
          >
            <RefreshCw size={15} className={orders.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
          <div
            data-testid="load-planning-total-weight"
            className="col-span-1 flex h-10 min-w-0 items-center gap-2 border border-[#d8d7d2] bg-[#fafaf8] px-3 md:col-span-1"
            title={
              calculating
                ? "Item weights are still loading from Zoho"
                : weight.unknown
                  ? `${weight.unknown} line${weight.unknown === 1 ? " has" : "s have"} no weight in Zoho and ${weight.unknown === 1 ? "is" : "are"} not included`
                  : "Total weight of the filtered sales orders"
            }
          >
            <Scale size={14} className="shrink-0 text-[#77787b]" />
            {calculating ? (
              <>
                <Loader2 size={13} className="shrink-0 animate-spin text-[#77787b]" />
                <span className="truncate text-xs text-[#77787b]">Calculating…</span>
              </>
            ) : (
              <>
                <span className="mono truncate text-sm font-semibold">{kg(weight.total)}</span>
                {weight.unknown > 0 && <span className="shrink-0 text-xs font-semibold text-[#b07b12]">*</span>}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e3df] bg-[#fafaf8] px-3 py-3 text-sm sm:px-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={all} onChange={toggleAll} />
          Select all visible
        </label>
        <button
          disabled={!selected.length}
          onClick={() =>
            navigate(
              `/app/routes?assign=${encodeURIComponent(selected.join(","))}`,
            )
          }
          className="button-black w-full rounded-[4px] px-4 py-2 text-sm disabled:opacity-40 sm:w-auto"
        >
          Assign Selected ({selected.length})
        </button>
      </div>
      {orders.isLoading ? (
        <div className="grid gap-2 p-4" aria-label="Loading acknowledged orders">
          {[1, 2, 3, 4, 5, 6].map((x) => (
            <div className="h-10 animate-pulse bg-[#f2f2ef]" key={x} />
          ))}
        </div>
      ) : orders.isError ? (
        <div className="p-10 text-center text-sm text-[#a32720]">
          {(orders.error as Error).message}
        </div>
      ) : visibleOrders.length ? (
        <>
          <div className="grid gap-3 p-3 md:hidden">
            {visibleOrders.map((order) => {
              const raw = (order as any).raw_json ?? {};
              const shipping =
                (order as any).shipping_address ?? raw.shipping_address;
              return (
                <article
                  key={order.id}
                  className={`min-w-0 w-full max-w-full overflow-hidden [overflow-wrap:anywhere] [word-break:break-word] border bg-[#fafaf8] p-3 sm:p-4 ${selected.includes(order.id) ? "border-black" : "border-[#e4e3df]"}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(order.id)}
                      onChange={() => toggle(order.id)}
                      aria-label={`Select ${order.salesorder_number ?? order.id}`}
                    />
                    <div className="min-w-0 max-w-full flex-1 [overflow-wrap:anywhere] [word-break:break-word]">
                      <div className="mono text-xs text-[#77787b]">
                        {order.salesorder_number ?? order.id}
                      </div>
                      <h3 className="mt-1 break-words font-semibold">
                        {order.customer_name ?? "Unnamed customer"}
                      </h3>
                    </div>
                    <span className="max-w-[45%] shrink-0 break-words rounded-full bg-[#fff1d6] px-2 py-1 text-center text-[10px] font-semibold uppercase">
                      Acknowledged
                    </span>
                  </div>
                  <div className="mt-4 grid min-w-0 max-w-full gap-2 overflow-hidden border-t pt-3 text-xs text-[#55565a]">
                    <div>
                      <b className="block break-words text-black [overflow-wrap:anywhere]">{city(shipping)}</b>
                      Destination city
                    </div>
                    <div>
                      <b className="block break-words text-black [overflow-wrap:anywhere]">{address(shipping)}</b>
                      Shipping address
                    </div>
                    <div className="min-w-0 border-t border-[#e4e3df] pt-2">
                      <div className="text-[10px] text-[#77787b]">Notes</div>
                      <div className="thin-scroll mt-1 max-h-[8.5rem] min-h-[6.5rem] min-w-0 overflow-y-auto overflow-x-hidden rounded-[3px] border border-[#e4e3df] bg-white p-2 text-xs leading-5 text-black [overflow-wrap:anywhere] [word-break:break-word]">
                        {order.notes?.trim() || "—"}
                      </div>
                    </div>
                    <div className="min-w-0 overflow-hidden border-t border-[#e4e3df] pt-2">
                      <div className="grid min-w-0 max-w-full grid-cols-2 gap-x-3 gap-y-2 overflow-hidden text-[11px]">
                        <span className="font-semibold text-black">Product</span><span className="font-semibold text-black">Qty / Weight</span>
                        {(order.products ?? []).map((product, index) => (
                          <div className="contents" key={`${product.sku}-${product.name}-${index}`}>
                            <span className="min-w-0 break-words">{product.name || "—"}<span className="block text-[#77787b]">{product.sku || "—"}</span></span>
                            <span>{product.quantity} {product.unit || ""}<span className="block text-[#77787b]">{product.total_weight_kg == null ? "—" : kg(Number(product.total_weight_kg))}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="load-planning-table-wrap relative hidden max-h-[calc(100vh-330px)] overflow-auto overscroll-x-contain md:block">
            <table className="w-full min-w-[2000px] table-fixed text-left text-xs">
              <colgroup>
                {COLUMNS.map(([name, width]) => (
                  <col key={name || "select"} style={{ width: `${width}px` }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-[3] border-b border-[#e4e3df] bg-[#f7f7f4] text-[10px] uppercase tracking-widest text-[#77787b]">
                <tr>
                  {COLUMNS.map(([name], index) => (
                    <th
                      key={name || "select"}
                      className={`px-3 py-3 font-semibold leading-tight ${index < 4 ? `sticky z-[4] whitespace-nowrap bg-[#f7f7f4] ${STICKY_LEFT[index]}` : "whitespace-normal"}`}
                    >
                      {index === 0 ? <input type="checkbox" aria-label="Select all visible sales orders" checked={all} onChange={toggleAll} /> : name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ order, product, key }) => {
                  const raw = (order as any).raw_json ?? {};
                  const shipping = (order as any).shipping_address ?? raw.shipping_address;
                  const picked = selected.includes(order.id);
                  return (
                    <tr key={key} className={`border-b border-[#efeeeb] hover:bg-[#fafaf8] ${picked ? "bg-[#f4f4f0]" : ""}`}>
                      <td className="sticky left-0 z-[2] bg-white px-3 py-4 align-top"><input type="checkbox" aria-label={`Select ${order.salesorder_number ?? order.id}`} checked={picked} onChange={() => toggle(order.id)} /></td>
                      <td className="sticky left-[44px] z-[1] bg-white px-3 py-4 align-top">{dateLabel(order.expected_shipment_date)}</td>
                      <td className="sticky left-[164px] z-[1] bg-white px-3 py-4 align-top font-semibold">{order.salesorder_number ?? order.id}</td>
                      <td className="sticky left-[294px] z-[1] bg-white px-3 py-4 align-top">{order.customer_name ?? "-"}</td>
                      <td className="whitespace-normal break-words px-3 py-4 align-top font-semibold">{product?.name || "Details unavailable"}</td>
                      <td className="px-3 py-4 align-top">{product?.sku ?? "-"}</td>
                      <td className="px-3 py-4 align-top">{product?.quantity ?? "-"}</td>
                      <td className="px-3 py-4 align-top">{product?.unit ?? "-"}</td>
                      <td className="whitespace-nowrap px-3 py-4 align-top font-semibold">
                        {product?.total_weight_kg == null ? (calculating ? "…" : "—") : kg(Number(product.total_weight_kg))}
                      </td>
                      <td className="px-3 py-4 align-top">{city(shipping)}</td>
                      <td className="whitespace-normal break-words px-3 py-4 align-top leading-5" title={address(shipping)}>{address(shipping)}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="thin-scroll max-h-[4.5rem] overflow-y-auto whitespace-pre-wrap break-words pr-1 leading-5">
                          {order.notes?.trim() || "—"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right align-top"><StockQty value={product?.mets_qty_available_for_sale ?? order.mets_qty_available_for_sale} pending={orders.data?.stock_pending} /></td>
                      <td className="whitespace-nowrap px-3 py-4 text-right align-top"><StockQty value={product?.glacier_qty_available_for_sale ?? order.glacier_qty_available_for_sale} pending={orders.data?.stock_pending} /></td>
                      <td className="whitespace-normal px-3 py-4 align-top">{lineWarehouse(order, product)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {weight.unknown > 0 && !calculating && (
            <div className="border-t border-[#e4e3df] bg-[#fffaf0] px-4 py-2 text-xs text-[#7a5b00]">
              * {weight.unknown} line{weight.unknown === 1 ? "" : "s"} {weight.unknown === 1 ? "has" : "have"} no package weight in Zoho, so {weight.unknown === 1 ? "it is" : "they are"} not included in the total.
            </div>
          )}
        </>
      ) : (
        <div className="p-12 text-center text-sm text-[#77787b]">
          No unassigned orders match this date, city, or search.
        </div>
      )}
    </div>
  );
}
