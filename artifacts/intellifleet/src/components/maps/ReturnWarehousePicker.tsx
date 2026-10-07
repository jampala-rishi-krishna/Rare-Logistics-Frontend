import type { RouteWarehouse } from "@/services/api/routes";
import { RETURN_WAREHOUSE_HINT, returnWarehouseMissing } from "@/lib/routeCost";

/** "Return to warehouse" checkbox + the two warehouses, with nothing pre-selected. */
export function ReturnWarehousePicker({
  warehouses,
  returnToWarehouse,
  returnWarehouseId,
  onToggle,
  onSelect,
  name,
  layout = "stack",
}: {
  warehouses: RouteWarehouse[];
  returnToWarehouse: boolean;
  returnWarehouseId: string;
  onToggle: (checked: boolean) => void;
  onSelect: (id: string) => void;
  name: string;
  layout?: "stack" | "row";
}) {
  const missing = returnWarehouseMissing(returnToWarehouse, returnWarehouseId);
  return (
    <div className="border border-[#e4e3df] bg-[#fafaf8] p-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={returnToWarehouse} onChange={(event) => onToggle(event.target.checked)} />
        Return to warehouse
      </label>
      {returnToWarehouse && (
        <div className={layout === "row" ? "mt-3 flex flex-wrap gap-4 text-xs" : "mt-3 grid gap-2 text-xs"} role="radiogroup" aria-label="Return warehouse">
          {warehouses.map((warehouse) => (
            <label key={warehouse.id} className="flex items-start gap-2">
              <input type="radio" name={name} checked={returnWarehouseId === warehouse.id} onChange={() => onSelect(warehouse.id)} />
              <span>
                <span className="font-semibold">{warehouse.name}</span>
                <span className="mt-0.5 block text-[#77787b]">{warehouse.address}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {missing && <div className="mt-2 text-xs text-[#a16819]">{RETURN_WAREHOUSE_HINT}</div>}
    </div>
  );
}
