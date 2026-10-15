import { FilterField, inputClass } from "./ToolbarControls";
import type { TypeFilter } from "../../lib/orderMerge";
import { ORDER_TYPES, type OrderType } from "../../lib/orderType";

export type InventoryOrderKind = OrderType;

export const ORDER_KIND_LABEL: Record<InventoryOrderKind, string> = { SO: "Sales Orders", WM: "Wet Market", PO: "Purchase Orders", TO: "Transfer Orders" };

/** One compact connected segmented control: Sales Orders | Wet Market | Purchase Orders | Transfer Orders. */
export function OrderTypeSwitch({ value, onChange }: { value: InventoryOrderKind; onChange: (value: InventoryOrderKind) => void }) {
  const segment = (kind: InventoryOrderKind) => {
    const selected = value === kind;
    const label = ORDER_KIND_LABEL[kind];
    return (
      <button
        key={kind}
        type="button"
        aria-pressed={selected}
        aria-label={label}
        title={label}
        data-testid={`order-kind-${kind}`}
        onClick={() => onChange(kind)}
        className={`inline-flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-xs! font-semibold leading-none! transition-colors sm:w-[124px] sm:flex-none ${
          selected ? "bg-[#0b0b0b] text-white" : "bg-white text-[#55565a] hover:bg-[#f2f2ef]"
        }`}
      >
        <span className="sm:hidden">{kind}</span>
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  };
  return (
    <div role="group" aria-label="Order type" className="inline-flex h-8 w-full shrink-0 items-stretch divide-x divide-[#d8d7d2] overflow-hidden rounded-[4px] border border-[#d8d7d2] bg-white sm:w-fit" data-testid="order-kind-switch">
      {ORDER_TYPES.map((kind) => segment(kind))}
    </div>
  );
}

/** All / SO / WM / PO / TO filter for the combined lists (Load Planning, Confirmed Orders). */
export function TypeFilterSelect({ value, onChange }: { value: TypeFilter; onChange: (value: TypeFilter) => void }) {
  return (
    <FilterField label="Type">
      <select value={value} onChange={(event) => onChange(event.target.value as TypeFilter)} aria-label="Order type filter" data-testid="order-type-filter" className={`${inputClass} w-full sm:w-[110px]`}>
        <option value="all">All</option>
        {ORDER_TYPES.map((kind) => (
          <option key={kind} value={kind}>
            {kind}
          </option>
        ))}
      </select>
    </FilterField>
  );
}
