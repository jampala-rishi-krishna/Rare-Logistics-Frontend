import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api/client";
import { useAccess } from "@/hooks/use-access";
import { formatAddress } from "@/lib/address";
import { formatKg } from "@/lib/kgDisplay";
import type { SalesOrderSummary } from "@/services/api/inventory";

type Preview = { preview_token: string; delivery_date: string; recipients: {to: string[]; cc: string[]}; scheduled: {po: string; vendor: string; address: string; contact: string; destination: string; items: {name: string; qty: number; unit: string; kg: number | null}[]}[]; pahabol: Preview["scheduled"] };

export function PickupControls() {
  const { manager } = useAccess();
  const client = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pahabol = useQuery({queryKey: ["pickup-pahabol"], queryFn: () => api.get<{items: SalesOrderSummary[]; details_pending: number}>("/api/pickup/pahabol"), refetchInterval: q => q.state.data?.details_pending ? 4000 : 30_000});
  const act = async (work: () => Promise<unknown>) => {setBusy(true); setMessage(""); try {await work();} catch(e: any) {setMessage(e.message);} finally {setBusy(false);}};
  return <div className="grid gap-3 border-b p-4">
    <div className="flex flex-wrap items-center gap-4"><span className="text-sm">For Pickup · Issued · delivery tomorrow (Asia/Manila)</span>{manager && <button disabled={busy} className="border px-3 py-2 text-sm" onClick={() => void act(async () => setPreview(await api.get<Preview>("/api/pickup/email/preview")))}>Send pickup list now</button>}</div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <h3 className="font-bold">Pahabol – needs approval ({pahabol.data?.items.length ?? 0})</h3>
    {pahabol.isError && <p role="alert">Pahabol list could not load.</p>}
    {pahabol.data?.items.map(order => <div key={order.id} className="flex flex-wrap items-center gap-3 border p-3 text-sm"><strong>{order.salesorder_number}</strong><span>{order.vendor_name}</span><span>{formatAddress(order.shipping_address)}</span>{order.vendor_address_missing && <span className="text-red-700">Vendor address missing</span>}{manager && <>{["approve", "reject"].map(action => <button key={action} disabled={busy} className="border px-3 py-1" onClick={() => void act(async () => {await api.post(`/api/pickup/${encodeURIComponent(order.id)}/decision`, {action}); await client.invalidateQueries({queryKey:["pickup-pahabol"]}); await client.invalidateQueries({queryKey:["inventory-purchase-orders"]}); await client.invalidateQueries({queryKey:["load-planning-unassigned"]});})}>{action === "approve" ? "Approve" : "Reject"}</button>)}</>}</div>)}
    {preview && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Preview pickup email"><div className="grid max-h-[90vh] w-full max-w-3xl gap-4 overflow-auto bg-white p-6">
      <h2 className="text-xl font-bold">Pickup list — {preview.delivery_date}</h2><p>To: {preview.recipients.to.join(", ") || "Not configured"}<br/>CC: {preview.recipients.cc.join(", ") || "—"}</p>
      {([['Scheduled pickups', preview.scheduled], ['Not scheduled – needs Logistics approval', preview.pahabol]] as const).map(([title,rows]) => <section key={title}><h3 className="font-bold">{title}</h3>{rows.map(row => <div key={row.po} className="my-2 border p-3"><strong>{row.po} · {row.vendor}</strong><p>{row.address || "Vendor address missing"} · {row.contact}<br/>Destination: {row.destination}</p>{row.items.map((item,i) => <p key={i}>{item.name} — {item.qty} {item.unit}, {item.kg == null ? "Unknown kg" : formatKg(Number(item.kg))}</p>)}</div>)}</section>)}
      <p>PDF and Excel pickup documents will be attached.</p><div className="flex gap-4"><button disabled={busy} onClick={() => setPreview(null)}>Cancel</button><button disabled={busy || !preview.recipients.to.length} className="bg-black px-4 py-2 text-white disabled:opacity-40" onClick={() => void act(async () => {const result = await api.post<{status: string}>("/api/pickup/email/send", {preview_token: preview.preview_token}); setMessage(`Pickup email: ${result.status}`); setPreview(null);})}>Send email</button></div>
    </div></div>}
  </div>;
}

export function PickupSheetButton({id}: {id: string}) {
  const [error,setError] = useState("");
  return <><button className="text-xs underline" onClick={async event => {event.stopPropagation(); try {const result = await api.download(`/api/pickup/${encodeURIComponent(id)}/sheet.pdf`); const url = URL.createObjectURL(result.blob); const a=document.createElement('a'); a.href=url; a.download='Pickup-sheet.pdf'; a.click(); URL.revokeObjectURL(url);} catch(e: any) {setError(e.message);}}}>Pickup sheet PDF</button>{error && <span role="alert">{error}</span>}</>;
}
