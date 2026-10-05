import { Lock } from "lucide-react";
import type { SalesOrderSummary } from "@/services/api/inventory";
import { formatAddress } from "@/lib/address";
import { CARDS_PER_PAGE, pageOfCards, type ViewMode } from "@/lib/loadPlanningView";

const KPI_LABEL = "KPI view";
const SPREADSHEET_LABEL = "Spreadsheet view";

/** One small segmented control: two buttons in a single box, the active one highlighted. */
export function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const button = (value: ViewMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => onChange(value)}
      className={`px-2.5 py-1 text-xs font-semibold leading-tight transition-colors ${mode === value ? "bg-[#0b0b0b] text-white" : "text-[#55565a] hover:bg-[#f2f2ef]"}`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Confirmed SO view" className="inline-flex shrink-0 items-stretch overflow-hidden rounded-[4px] border border-[#d8d7d2] bg-white">
      {button("kpi", KPI_LABEL)}
      {button("spreadsheet", SPREADSHEET_LABEL)}
    </div>
  );
}

function dateLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function orderWeight(order: SalesOrderSummary): { total: number | null; partial: boolean } {
  const weights = (order.products ?? []).map((product) => product.total_weight_kg);
  const known = weights.filter((value): value is number => value != null);
  return { total: known.length ? known.reduce((sum, value) => sum + Number(value), 0) : null, partial: known.length > 0 && known.length < weights.length };
}

function warehouses(order: SalesOrderSummary) {
  const lines: any[] = (order as any).raw_json?.line_items ?? [];
  return Array.from(new Set(lines.map((line) => line.location_name ?? line.warehouse_name).filter(Boolean))).join(", ") || "-";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-[#77787b]">{label}</div>
      <div className="break-words font-semibold text-black">{children}</div>
    </div>
  );
}

export function SalesOrderCard({
  order,
  selected,
  error,
  showAssignment,
  onToggle,
  onOpen,
  onEdit,
  onUnassign,
}: {
  order: SalesOrderSummary;
  selected: boolean;
  error?: string;
  showAssignment?: boolean;
  onToggle: (id: string) => void;
  onOpen: (order: SalesOrderSummary) => void;
  onEdit?: (order: SalesOrderSummary) => void;
  onUnassign?: (order: SalesOrderSummary) => void;
}) {
  const weight = orderWeight(order);
  const raw = (order as any).raw_json ?? {};
  const location = (order as any).shipping_city || (Array.isArray(raw.shipping_address) ? raw.shipping_address[0]?.city : raw.shipping_address?.city) || "-";
  const lock = order.zoho_lock;
  return (
    <article
      data-testid="sales-order-card"
      data-order-id={order.id}
      className={`min-w-0 w-full max-w-full overflow-hidden border bg-[#fafaf8] p-3 text-xs [overflow-wrap:anywhere] [word-break:break-word] sm:p-4 ${selected ? "border-black" : "border-[#e4e3df]"}`}
    >
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={() => onToggle(String(order.id))} aria-label={`Select ${order.salesorder_number ?? order.id}`} className="mt-1" />
        <button type="button" onClick={() => onOpen(order)} className="min-w-0 max-w-full flex-1 text-left">
          <div className="mono text-xs text-[#77787b]">{order.salesorder_number ?? order.id}</div>
          <h3 className="mt-1 break-words text-sm font-semibold text-black">{order.customer_name ?? "Unnamed customer"}</h3>
        </button>
        <div className="flex max-w-[45%] shrink-0 flex-col items-end gap-1">
          <span className="break-words rounded-full bg-[#fff1d6] px-2 py-1 text-center text-[10px] font-semibold uppercase">{(order.order_status ?? "-").replaceAll("_", " ")}</span>
          {lock?.is_locked && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#1e7b44]" title={[lock.config_name, lock.locked_by, lock.lock_time].filter(Boolean).join(" - ")}>
              <Lock size={11} /> {lock.config_name || "Locked"}
            </span>
          )}
        </div>
      </div>
      {error && <div className="mt-2 text-[11px] text-[#a32720]">{error}</div>}
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-[#e4e3df] pt-3">
        <Field label="Delivery date">{dateLabel(order.expected_shipment_date)}</Field>
        <Field label="Weight">
          {weight.total == null ? "—" : `${weight.total.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg${weight.partial ? " *" : ""}`}
        </Field>
        <Field label="Warehouse">{warehouses(order)}</Field>
        <Field label="City">{location}</Field>
        {showAssignment && (
          <>
            <Field label="Truck">{order.vehicle_id ?? "-"}</Field>
            <Field label="Driver">{order.driver_name ?? (order.driver_id ? `Driver #${order.driver_id}` : "-")}</Field>
          </>
        )}
        <div className="col-span-2 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-[#77787b]">Shipping address</div>
          <div className="whitespace-pre-line break-words">{formatAddress((order as any).shipping_address ?? raw.shipping_address) || "-"}</div>
        </div>
      </div>
      {showAssignment && (onEdit || onUnassign) && (
        <div className="mt-3 flex items-center gap-4 border-t border-[#e4e3df] pt-3">
          {onEdit && (
            <button type="button" className="text-xs font-semibold underline" onClick={() => onEdit(order)}>
              Edit
            </button>
          )}
          {onUnassign && order.assignment_status === "assigned" && (
            <button type="button" className="text-xs font-semibold text-[#86000B] underline" onClick={() => onUnassign(order)}>
              Unassign
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * KPI view: the Confirmed SO list as cards, 2 columns x 2 rows per page (1 column on narrow
 * screens). It renders exactly the orders it is given - the same filtered, searched and sorted
 * set the spreadsheet shows - and paginates them 4 at a time.
 */
export function SalesOrderCardGrid({
  orders,
  page,
  onPageChange,
  selectedIds,
  errors,
  showAssignment,
  onToggle,
  onOpen,
  onEdit,
  onUnassign,
}: {
  orders: SalesOrderSummary[];
  page: number;
  onPageChange: (page: number) => void;
  selectedIds: string[];
  errors?: Record<string, string>;
  showAssignment?: boolean;
  onToggle: (id: string) => void;
  onOpen: (order: SalesOrderSummary) => void;
  onEdit?: (order: SalesOrderSummary) => void;
  onUnassign?: (order: SalesOrderSummary) => void;
}) {
  const view = pageOfCards(orders, page);
  return (
    <>
      <div data-testid="sales-order-card-grid" className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 sm:p-4">
        {view.items.map((order) => (
          <SalesOrderCard
            key={order.id}
            order={order}
            selected={selectedIds.includes(String(order.id))}
            error={errors?.[String(order.id)]}
            showAssignment={showAssignment}
            onToggle={onToggle}
            onOpen={onOpen}
            onEdit={onEdit}
            onUnassign={onUnassign}
          />
        ))}
      </div>
      {orders.length > CARDS_PER_PAGE && (
        <div className="flex items-center justify-end gap-2 border-t border-[#e4e3df] px-4 py-3">
          <button type="button" onClick={() => onPageChange(view.page - 1)} disabled={view.page <= 1} className="border border-[#d8d7d2] px-3 py-2 text-sm disabled:opacity-40">
            Previous
          </button>
          <span className="text-xs text-[#77787b]">
            Cards {(view.page - 1) * CARDS_PER_PAGE + 1}-{Math.min(view.page * CARDS_PER_PAGE, orders.length)} of {orders.length} · Page {view.page} of {view.pageCount}
          </span>
          <button type="button" onClick={() => onPageChange(view.page + 1)} disabled={view.page >= view.pageCount} className="button-black px-3 py-2 text-sm disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </>
  );
}
