import { useState } from "react";
import { Download } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { isValidRange, manilaDate } from "@/lib/overview";
import { ErrorNote, inputClass, primaryButtonClass } from "./shared";
import type { TopFilter } from "./LiveTab";

const COLUMNS = [
  "date", "batch", "driver", "helpers", "vehicle", "so_number", "customer", "acknowledged_at", "acknowledged_by", "arrived_at", "distance_m", "departed_at", "invoice_dr_number",
  "outcome", "reason", "minutes_at_stop", "trip_started", "trip_ended", "handover_status", "invoice_status", "officer", "validated_at",
];

// CSV of every sales order in a date range: one row per SO with arrival / departure times, the Invoice/DR number, outcome and officer validation.
export default function ExportTab({ filter }: { filter: TopFilter }) {
  const [from, setFrom] = useState(manilaDate(new Date(), -6));
  const [to, setTo] = useState(manilaDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const valid = isValidRange(from, to);

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      // Authenticated fetch -> blob -> download. The token is never placed in a URL.
      const { blob, filename } = await overviewApi.downloadExport({ from, to, warehouse: filter.warehouse || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(`Downloaded ${filename}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid max-w-[720px] gap-4 border border-[#e4e3df] bg-white p-4" data-testid="export-tab">
      <p className="text-sm text-[#55565a]">One row per sales order for the selected dates{filter.warehouse ? ` (${filter.warehouse} only)` : ""}. Opens in Excel.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputClass} data-testid="export-from" />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} data-testid="export-to" />
        </label>
      </div>
      {!valid && <p className="text-sm font-semibold text-[#86000B]">The start date must be on or before the end date (at most 366 days).</p>}
      <div>
        <button type="button" disabled={!valid || busy} onClick={() => void run()} className={primaryButtonClass} data-testid="export-download">
          <Download size={15} />
          {busy ? "Preparing..." : "Download CSV"}
        </button>
      </div>
      {done && <p role="status" className="text-sm font-semibold text-[#1e7b44]">{done}</p>}
      {error != null && <ErrorNote error={error} />}
      <details className="text-xs text-[#55565a]">
        <summary className="min-h-[32px] cursor-pointer font-semibold">Columns</summary>
        <p className="mt-1 font-mono leading-5">{COLUMNS.join(", ")}</p>
      </details>
    </section>
  );
}
