import { useMemo, useState } from "react";
import { CalendarDays, RefreshCw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as inventoryApi from "@/services/api/inventory";
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
    queryFn: () =>
      inventoryApi.listSalesOrders(from, to, 1, "Acknowledged", search, "unassigned"),
    retry: false,
  });
  // Both city choices and table rows use the same acknowledged, unassigned page.
  const citySource = orders;
  const cityOptions = useMemo(() => {
    const values = (citySource.data?.items ?? [])
      .map((order) => {
        const raw = (order as any).raw_json ?? {};
        return (
          (order as any).shipping_city ||
          city((order as any).shipping_address ?? raw.shipping_address)
        );
      })
      .filter((value): value is string => Boolean(value && value !== "-"));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [citySource.data]);
  const ids = useMemo(() => {
    const items = orders.data?.items ?? [];
    if (!selectedCities.length) return items.map((x) => x.id);
    return items
      .filter((order) => {
        const raw = (order as any).raw_json ?? {};
        const value =
          (order as any).shipping_city ||
          city((order as any).shipping_address ?? raw.shipping_address);
        return selectedCities.includes(value);
      })
      .map((x) => x.id);
  }, [orders.data, selectedCities]);
  const visibleOrders = useMemo(() => {
    const items = orders.data?.items ?? [];
    if (!selectedCities.length) return items;
    return items.filter((order) => {
      const raw = (order as any).raw_json ?? {};
      const value =
        (order as any).shipping_city ||
        city((order as any).shipping_address ?? raw.shipping_address);
      return selectedCities.includes(value);
    });
  }, [orders.data, selectedCities]);
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
    <div className="border border-[#e4e3df] bg-white">
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
            className="button-black col-span-2 flex h-10 items-center justify-center gap-2 rounded-[4px] px-4 text-sm disabled:opacity-60 md:col-span-1"
          >
            <RefreshCw size={15} className={orders.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
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
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((x) => (
            <div className="h-44 animate-pulse bg-[#f2f2ef]" key={x} />
          ))}
        </div>
      ) : orders.isError ? (
        <div className="p-10 text-center text-sm text-[#a32720]">
          {(orders.error as Error).message}
        </div>
      ) : visibleOrders.length ? (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {visibleOrders.map((order) => {
            const raw = (order as any).raw_json ?? {};
            const shipping =
              (order as any).shipping_address ?? raw.shipping_address;
            const products = order.products ?? [];
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
                    <br />
                    Destination city
                  </div>
                  <div>
                    <b className="block break-words text-black [overflow-wrap:anywhere]">{address(shipping)}</b>
                    <br />
                    Shipping address
                  </div>
                  <div className="min-w-0 border-t border-[#e4e3df] pt-2">
                    <div className="text-[10px] text-[#77787b]">Notes</div>
                    <div className="thin-scroll mt-1 max-h-[8.5rem] min-h-[6.5rem] min-w-0 overflow-y-auto overflow-x-hidden rounded-[3px] border border-[#e4e3df] bg-white p-2 text-xs leading-5 text-black [overflow-wrap:anywhere] [word-break:break-word]">
                      {order.notes?.trim() || "—"}
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden border-t border-[#e4e3df] pt-2">
                    <div className="grid min-w-0 max-w-full grid-cols-2 gap-x-3 gap-y-2 overflow-hidden text-[11px] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:gap-y-1">
                      <span className="font-semibold text-black">Product</span><span className="font-semibold text-black">SKU</span><span className="font-semibold text-black">Qty</span><span className="font-semibold text-black">Unit</span><span className="font-semibold text-black">Total Weight</span>
                      {(order.products ?? []).map((product, index) => <div className="contents" key={`${product.sku}-${product.name}-${index}`}><span className="min-w-0 break-words">{product.name || "—"}</span><span className="min-w-0 break-all">{product.sku || "—"}</span><span>{product.quantity}</span><span>{product.unit || "—"}</span><span>{product.total_weight_kg == null ? "—" : `${product.total_weight_kg} kg`}</span></div>)}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center text-sm text-[#77787b]">
          No unassigned orders match this date, city, or search.
        </div>
      )}
    </div>
  );
}
