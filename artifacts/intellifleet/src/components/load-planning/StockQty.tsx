/** Mets / Glacier available-for-sale quantity. A negative balance is shown as-is (never
 * clamped to zero) in red; a value that hasn't arrived yet shows "…" while the backend is
 * still filling stock in, otherwise "—". */
export function StockQty({ value, pending }: { value: number | null | undefined; pending?: boolean }) {
  if (value == null) return <span className="text-[#77787b]">{pending ? "…" : "—"}</span>;
  return (
    <span className={value < 0 ? "font-semibold text-[#c0392b]" : undefined}>
      {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
    </span>
  );
}
