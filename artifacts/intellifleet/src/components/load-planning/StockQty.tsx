/** Mets / Glacier available-for-sale quantity. A negative balance is shown as-is (never
 * clamped to zero) in red; a value that hasn't arrived yet shows "…" while the backend is
 * still filling stock in, otherwise "—". */
export function StockQty({ value, pending }: { value: number | null | undefined; pending?: boolean }) {
  if (value == null) return <span className="text-[#77787b]">{pending ? "…" : "—"}</span>;
  return (
    <span className={value < 0 ? "font-semibold text-[#c0392b]" : undefined} title={value < 0 ? "Negative stock in Zoho" : undefined}>
      {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
    </span>
  );
}

/** A branch's own warehouse stock (e.g. SariSuki Store Inc. Warehouse), for orders whose branch has
 * no Mets/Glacier mapping. Shows the warehouse name under the figure; "—" for every other order. */
export function BranchWarehouseStock({ value, name, pending }: { value: number | null | undefined; name?: string | null; pending?: boolean }) {
  if (value == null && !name) return <span className="text-[#77787b]">—</span>;
  return (
    <span title={name ?? undefined}>
      <StockQty value={value} pending={pending} />
      {name && <span className="block text-[10px] font-normal text-[#77787b]">{name}</span>}
    </span>
  );
}
