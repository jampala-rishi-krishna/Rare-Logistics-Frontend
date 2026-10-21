import { useEffect, useState } from "react";
import {
  COLUMN_PREFS_STORAGE_KEY,
  ORDER_FIELD_COLUMNS,
  parseColumnPrefs,
  visibleOrderFieldColumns,
  orderFieldValue,
  type ColumnPrefs,
  type OrderFieldKey,
} from "@/lib/orderColumns";

const KEYS = ORDER_FIELD_COLUMNS.map((column) => column.key);
const CHANGE_EVENT = "intellifleet:order-columns";

function readPrefs(): ColumnPrefs {
  try {
    return parseColumnPrefs(window.localStorage.getItem(COLUMN_PREFS_STORAGE_KEY), KEYS);
  } catch {
    return parseColumnPrefs(null, KEYS);
  }
}

/** Column settings for Delivery Method / Fulfillment Type, shared by every order table and kept in localStorage (per viewer).
 * Both are on by default; a column the stored prefs do not know about is shown. */
export function useOrderFieldColumns() {
  const [prefs, setPrefs] = useState<ColumnPrefs>(readPrefs);
  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = (key: OrderFieldKey) => {
    const next = { ...prefs, [key]: prefs[key] === false };
    setPrefs(next);
    try {
      const stored = JSON.parse(window.localStorage.getItem(COLUMN_PREFS_STORAGE_KEY) || "{}");
      window.localStorage.setItem(COLUMN_PREFS_STORAGE_KEY, JSON.stringify({ ...(stored && typeof stored === "object" ? stored : {}), ...next }));
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  const visible = visibleOrderFieldColumns(prefs);
  return {
    prefs,
    toggle,
    visible,
    /** [heading, width] pairs, for tables that build their header from a COLUMNS array. */
    headers: visible.map((column) => [column.label, column.width] as [string, number]),
    widths: visible.map((column) => column.width),
    contentExtra: visible.reduce((sum, column) => sum + column.width, 0),
  };
}

export function OrderFieldCells({ order, columns, className = "whitespace-normal break-words px-3 py-4 align-top" }: {
  order: { delivery_method?: string | null; fulfillment_type?: string | null };
  columns: { key: OrderFieldKey }[];
  className?: string;
}) {
  return (
    <>
      {columns.map((column) => (
        <td key={column.key} className={className}>
          {orderFieldValue(order, column.key)}
        </td>
      ))}
    </>
  );
}

export function OrderFieldColumnSettings({ prefs, onToggle }: { prefs: ColumnPrefs; onToggle: (key: OrderFieldKey) => void }) {
  return (
    <details className="relative text-xs">
      <summary className="cursor-pointer select-none border border-[#d8d7d2] bg-white px-3 py-2 font-semibold">Column settings</summary>
      <div className="absolute right-0 z-20 mt-1 grid min-w-[200px] gap-2 border border-[#e4e3df] bg-white p-3 shadow-sm">
        {ORDER_FIELD_COLUMNS.map((column) => (
          <label key={column.key} className="flex items-center gap-2">
            <input type="checkbox" checked={prefs[column.key] !== false} onChange={() => onToggle(column.key)} />
            {column.label}
          </label>
        ))}
      </div>
    </details>
  );
}
