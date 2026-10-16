import { useState } from "react";
import { api } from "@/services/api/client";

export function RequestUnassignDialog({ ids, onClose, onSent }: { ids: string[]; onClose: () => void; onSent: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Request unassign">
    <form className="grid w-full max-w-lg gap-4 bg-white p-6" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await api.post("/api/access/unassign-requests", { order_ids: ids, reason: reason.trim() }); onSent(); }
      catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }}>
      <h2 className="text-xl font-bold">Request unassign ({ids.length})</h2>
      <label className="grid gap-2">Reason (required)<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} className="min-h-24 border p-3" /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button disabled={busy || !reason.trim()} className="bg-black px-4 py-2 text-white disabled:opacity-40">Send request</button></div>
    </form>
  </div>;
}
