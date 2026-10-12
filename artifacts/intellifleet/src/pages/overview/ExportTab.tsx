import { useState } from "react";
import { Download } from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { isValidRange } from "@/lib/overview";
import { ErrorNote, buttonClass, inputClass, primaryButtonClass } from "./shared";

export default function ExportTab({
  defaultFrom,
  defaultTo,
  warehouse,
  driverId,
}: {
  defaultFrom: string;
  defaultTo: string;
  warehouse: string;
  driverId: string;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [wh, setWh] = useState(warehouse);
  const [driver, setDriver] = useState(driverId);
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
      const { blob, filename } = await overviewApi.downloadExport({
        from,
        to,
        warehouse: wh || undefined,
        driver_id: driver || undefined,
      });
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
    <div className="grid max-w-[640px] gap-4 border border-[#e4e3df] bg-white p-4">
      <p className="text-sm text-[#55565a]">One row per sales order for the selected dates.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Warehouse
          <select value={wh} onChange={(e) => setWh(e.target.value)} className={inputClass}>
            <option value="">All</option>
            <option value="METS">METS</option>
            <option value="GLACIER">GLACIER</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Driver ID (optional)
          <input value={driver} onChange={(e) => setDriver(e.target.value)} inputMode="numeric" className={inputClass} placeholder="All drivers" />
        </label>
      </div>
      {!valid && <div className="text-xs text-[#86000B]">The From date must not be after the To date.</div>}
      {error !== null && <ErrorNote error={error} />}
      {done && <div className="text-sm text-[#1e7b44]">{done}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={!valid || busy} onClick={() => void run()} className={primaryButtonClass} data-testid="export-download">
          <Download size={15} />
          {busy ? "Preparing..." : "Download CSV"}
        </button>
        <button type="button" className={buttonClass} onClick={() => { setFrom(defaultFrom); setTo(defaultTo); setWh(warehouse); setDriver(driverId); }}>
          Reset
        </button>
      </div>
    </div>
  );
}
