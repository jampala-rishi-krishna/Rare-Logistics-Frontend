import { FilterField, inputClass } from "./ToolbarControls";
import type { TypeFilter } from "../../lib/orderMerge";

export type InventoryOrderKind = "SO" | "PO" | "TO";

/** [ SO | PO | TO ] segmented switch at the top of the Inventory tab. PO is postponed: disabled, "Coming soon". */
export function OrderTypeSwitch({ value, onChange }: { value: InventoryOrderKind; onChange: (value: InventoryOrderKind) => void }) {
  const segment = (kind: InventoryOrderKind, label: string, disabled = false) => (
    <button
      key={kind}
      type="button"
      disabled={disabled}
      aria-pressed={value === kind}
      title={disabled ? "Coming soon" : label}
      data-testid={`order-kind-${kind}`}
      onClick={() => onChange(kind)}
      className={`h-full min-w-[72px] whitespace-nowrap px-3 text-xs! font-semibold leading-none! transition-colors ${
        value === kind ? "bg-[#0b0b0b] text-white" : disabled ? "cursor-not-allowed bg-[#f4f4f1] text-[#a3a39f]" : "bg-white text-[#55565a] hover:bg-[#f2f2ef]"
      }`}
    >
      {label}
      {disabled && <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wide">Coming soon</span>}
    </button>
  );
  return (
    <div role="group" aria-label="Order type" className="inline-flex h-8 shrink-0 items-stretch divide-x divide-[#d8d7d2] overflow-hidden rounded-[4px] border border-[#d8d7d2] bg-white" data-testid="order-kind-switch">
      {segment("SO", "SO")}
      {segment("PO", "PO", true)}
      {segment("TO", "TO")}
    </div>
  );
}

/** All / SO / TO filter for the combined lists (Load Planning, Confirmed Orders). */
export function TypeFilterSelect({ value, onChange }: { value: TypeFilter; onChange: (value: TypeFilter) => void }) {
  return (
    <FilterField label="Type">
      <select value={value} onChange={(event) => onChange(event.target.value as TypeFilter)} aria-label="Order type filter" data-testid="order-type-filter" className={`${inputClass} w-full sm:w-[110px]`}>
        <option value="all">All</option>
        <option value="SO">SO</option>
        <option value="TO">TO</option>
      </select>
    </FilterField>
  );
}
