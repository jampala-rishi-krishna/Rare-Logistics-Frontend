import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { api } from "@/services/api/client";
import { useAccess } from "@/hooks/use-access";

type Alert = { id: number; text: string; order_id: string; order_number: string; status: string; unread: boolean; delivery_date?: string };

export default function AccessAlerts() {
  const { user, manager } = useAccess();
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<Alert | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const alerts = useQuery({ queryKey: ["access-alerts", user?.id], queryFn: () => api.get<{items: Alert[]; unread_count: number}>("/api/access/alerts"), enabled: Boolean(user), refetchInterval: 30_000 });
  if (!manager && !alerts.data?.items.length) return null;
  const refresh = async () => { await client.invalidateQueries({queryKey: ["access-alerts"]}); await client.invalidateQueries({queryKey: ["inventory-sales-orders"]}); };
  const resolve = async (action: string, confirm = false) => {
    if (!resolving) return;
    setBusy(true); setError("");
    try {
      await api.post(`/api/access/unassign-requests/${resolving.id}/resolve`, {action, note: note.trim() || null, confirm});
      setResolving(null); await refresh();
    } catch (e: any) {
      const detail = e.body?.detail;
      if (detail?.code === "confirm_required" && window.confirm(detail.message)) { setBusy(false); await resolve(action, true); return; }
      setError(detail?.message || e.message);
    } finally { setBusy(false); }
  };
  return <div className="relative">
    <button aria-label={`Alerts (${alerts.data?.unread_count ?? 0} unread)`} aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-1 border px-3 py-2"><Bell size={17}/>{Boolean(alerts.data?.unread_count) && <span>{alerts.data?.unread_count}</span>}</button>
    {open && <div className="absolute right-0 top-full z-40 mt-2 max-h-96 w-80 overflow-auto border bg-white p-3 shadow-lg">
      {alerts.isError && <p role="alert">Alerts could not load.</p>}
      {!alerts.data?.items.length && <p className="p-2 text-sm">No alerts</p>}
      {alerts.data?.items.map(alert => <div key={alert.id} className={`border-b py-3 text-sm ${alert.unread ? "font-semibold" : ""}`}>
        <button className="text-left" onClick={async () => {
          await api.post(`/api/access/alerts/${alert.id}/read`, {}); await refresh(); setOpen(false);
          navigate(`/app/loads?tab=confirmed&order=${encodeURIComponent(alert.order_number)}&highlight=${encodeURIComponent(alert.order_id)}${alert.delivery_date ? `&date=${alert.delivery_date}` : ""}`);
        }}>{alert.text}</button>
        {manager && alert.status === "pending" && <button className="mt-2 block underline" onClick={() => {setResolving(alert); setNote(""); setError("");}}>Review request</button>}
      </div>)}
    </div>}
    {resolving && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Review unassign request"><div className="grid w-full max-w-lg gap-4 bg-white p-6">
      <h2 className="text-xl font-bold">Review unassign request</h2><p>{resolving.text}</p>
      <label className="grid gap-2">Note (optional)<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} className="border p-3"/></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-4"><button disabled={busy} onClick={() => setResolving(null)}>Cancel</button><button disabled={busy} onClick={() => void resolve("reject")}>Reject</button><button disabled={busy} onClick={() => void resolve("approve")} className="bg-black px-4 py-2 text-white">Unassign and approve</button></div>
    </div></div>}
  </div>;
}
