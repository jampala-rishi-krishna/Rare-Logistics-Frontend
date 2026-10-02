import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import * as dispatchApi from "@/services/api/dispatch";

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" ");
const MANILA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true });
const STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

type Delivery = { status: string; sid: string; errorCode?: number | null; errorMessage?: string | null };
type Bubble = { key: string; ts: string; out: boolean; text: string; delivery?: Delivery; orphanReply?: boolean };

const digits = (value?: string | null) => String(value ?? "").replace(/\D/g, "");
const sameNumber = (a?: string | null, b?: string | null) => { const x = digits(a), y = digits(b); return x.length >= 9 && y.length >= 9 && x.slice(-9) === y.slice(-9); };
const norm = (text?: string | null) => String(text ?? "").replace(/’/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

function Ticks({ status, className }: { status?: string; className?: string }) {
  if (!status) return null;
  const failed = ["failed", "undelivered", "canceled"].includes(status);
  const pending = ["queued", "accepted", "scheduled", "sending"].includes(status);
  if (failed) return <span title={status} className={cx("inline-grid h-3.5 w-3.5 place-items-center rounded-full bg-[#ea0038] text-[9px] font-bold leading-none text-white", className)}>!</span>;
  if (pending) return <svg aria-label={status} viewBox="0 0 16 16" className={cx("h-3 w-3 text-[#667781]", className)} fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.2 1.4" /></svg>;
  const color = status === "read" ? "text-[#53bdeb]" : "text-[#667781]";
  const double = status === "delivered" || status === "read";
  return <svg aria-label={status} viewBox="0 0 18 12" className={cx("h-3 w-[18px]", color, className)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 6.5 5 10l7-8.5" />{double && <path d="M7.5 8.5 10 10l7-8.5" />}</svg>;
}

const statusLabel = (d?: Delivery) => !d ? "" : d.status === "read" ? "Read" : d.status === "delivered" ? "Delivered" : d.status === "sent" ? "Sent" : ["failed", "undelivered"].includes(d.status) ? `Not delivered${d.errorCode ? ` (error ${d.errorCode})` : ""}` : d.status === "canceled" ? "Canceled" : "Sending";

export default function WhatsAppPanel() {
  const [selectedDate, setSelectedDate] = useState(() => MANILA_DAY.format(new Date()));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const conversations = useQuery({ queryKey: ["n8n-conversations", "whatsapp"], queryFn: () => dispatchApi.listN8nConversations("whatsapp"), refetchInterval: 15000, retry: false });
  // Twilio filters by UTC date; start one day early so a Manila day is fully covered, then filter client-side.
  const since = useMemo(() => { const d = new Date(`${selectedDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }, [selectedDate]);
  const logs = useQuery({ queryKey: ["whatsapp-logs", since], queryFn: () => dispatchApi.getWhatsAppLogs(since), refetchInterval: 60000, retry: false });

  const readableDate = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "2-digit", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`));
  const moveDate = (offset: number) => { const d = new Date(`${selectedDate}T12:00:00`); d.setDate(d.getDate() + offset); setSelectedDate(d.toISOString().slice(0, 10)); setSelectedKey(null); setShowChat(false); };
  const onDay = (iso?: string | null) => Boolean(iso) && MANILA_DAY.format(new Date(iso as string)) === selectedDate;

  const threads = useMemo(() => {
    type Thread = { key: string; name: string; phone: string; bubbles: Bubble[] };
    const map = new Map<string, Thread>();
    const find = (phone?: string | null) => { for (const t of map.values()) if (sameNumber(t.phone, phone)) return t; return undefined; };
    for (const conv of conversations.data?.conversations ?? []) {
      const stamp = conv.lastUpdated || conv.lastMessageAt;
      if (!onDay(stamp)) continue;
      const key = digits(conv.contact) || `conv-${map.size}`;
      map.set(key, { key, name: conv.driverName || conv.contact || "Unknown driver", phone: conv.contact || "", bubbles: (conv.messages ?? []).filter((m) => m.ts && onDay(m.ts)).map((m, i) => ({ key: `n8n-${key}-${i}`, ts: m.ts as string, out: m.role === "assistant" || m.content.startsWith("[Template]"), text: m.content })) });
    }
    const used = new Set<string>();
    for (const log of logs.data?.outbound ?? []) {
      const stamp = log.date_sent || log.date_created;
      if (!onDay(stamp)) continue;
      const thread = find(log.to) ?? (() => { const key = digits(log.to); const t = { key, name: log.to, phone: log.to, bubbles: [] as Bubble[] }; map.set(key, t); return t; })();
      const delivery: Delivery = { status: log.status, sid: log.sid, errorCode: log.error_code, errorMessage: log.error_message };
      const match = thread.bubbles.find((b) => b.out && !b.delivery && (norm(b.text) === norm(log.body) || Math.abs(new Date(b.ts).getTime() - new Date(stamp as string).getTime()) <= 120000));
      if (match) { match.delivery = delivery; if (match.text.startsWith("[Template]")) match.text = log.body; }
      else thread.bubbles.push({ key: `tw-${log.sid}`, ts: stamp as string, out: true, text: log.body, delivery });
      used.add(log.sid);
    }
    for (const reply of logs.data?.inbound ?? []) {
      if (!onDay(reply.date)) continue;
      const thread = find(reply.from);
      if (!thread) continue;
      if (thread.bubbles.some((b) => !b.out && norm(b.text) === norm(reply.body))) continue;
      thread.bubbles.push({ key: `in-${reply.sid}`, ts: reply.date as string, out: false, text: reply.body, orphanReply: true });
    }
    const list = [...map.values()];
    for (const t of list) t.bubbles.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return list.sort((a, b) => new Date(b.bubbles.at(-1)?.ts ?? 0).getTime() - new Date(a.bubbles.at(-1)?.ts ?? 0).getTime());
  }, [conversations.data, logs.data, selectedDate]);

  const current = threads.find((t) => t.key === selectedKey) ?? threads[0];
  const lastDelivery = (t?: { bubbles: Bubble[] }) => [...(t?.bubbles ?? [])].reverse().find((b) => b.delivery)?.delivery;
  const logsError = logs.isError ? ((logs.error as { message?: string } | null)?.message || "Delivery status unavailable") : null;

  return <div className="comms-channel-panel min-w-0 max-w-full overflow-hidden border border-[#e4e3df] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e3df] p-3 sm:gap-3 sm:p-4">
      <div className="min-w-0"><div className="micro whitespace-nowrap text-[#77787b]">WHATSAPP · selected day</div><div className="mt-1 whitespace-nowrap text-base font-bold sm:text-lg">{readableDate}</div></div>
      <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
        <button onClick={() => { void conversations.refetch(); void logs.refetch(); }} disabled={conversations.isFetching || logs.isFetching} className="mr-auto inline-flex items-center gap-2 border border-[#d8d7d2] px-3 py-1.5 text-xs disabled:opacity-50 sm:mr-0"><RefreshCw size={13} className={conversations.isFetching || logs.isFetching ? "animate-spin" : ""} />{conversations.isFetching || logs.isFetching ? "Refreshing…" : "Refresh"}</button>
        <button aria-label="Previous day" onClick={() => moveDate(-1)} className="grid h-8 w-8 place-items-center border border-[#d8d7d2]"><ChevronLeft size={14} /></button>
        <input aria-label="whatsapp date" type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setSelectedKey(null); setShowChat(false); }} className="h-8 border border-[#d8d7d2] px-2 text-xs font-semibold" />
        <button aria-label="Next day" onClick={() => moveDate(1)} className="grid h-8 w-8 place-items-center border border-[#d8d7d2]"><ChevronRight size={14} /></button>
      </div>
    </div>
    {logsError && <div className="border-b border-[#f1d9a8] bg-[#fff8e6] px-4 py-2 text-xs text-[#7a5b00]">Delivery status unavailable: {logsError}</div>}
    <div className="grid h-[calc(100dvh-250px)] min-h-[420px] gap-0 lg:h-auto lg:min-h-[520px] lg:grid-cols-[340px_1fr]">
      <div className={cx("min-h-0 overflow-y-auto border-r border-[#e4e3df] bg-white", showChat ? "hidden lg:block" : "block")}>
        {conversations.isError ? <div className="p-5 text-xs text-[#b3261e]">Could not load whatsapp conversations.</div> : threads.length ? threads.map((t) => {
          const last = t.bubbles.at(-1);
          const delivery = lastDelivery(t);
          const active = current?.key === t.key;
          return <button key={t.key} onClick={() => { setSelectedKey(t.key); setShowChat(true); }} className={cx("flex w-full items-center gap-3 border-b border-[#f0f2f5] px-4 py-3 text-left hover:bg-[#f5f6f6]", active && "bg-[#f0f2f5]")}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f]">{(t.name.replace(/[^A-Za-z0-9]/g, "")[0] || "#").toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2"><b className="truncate text-sm text-[#111b21]">{t.name}</b><span className="shrink-0 text-[11px] text-[#667781]">{last ? TIME.format(new Date(last.ts)) : ""}</span></span>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-[#667781]">{last?.out && delivery && <Ticks status={delivery.status} />}<span className="truncate">{last?.text || "No messages"}</span></span>
            </span>
          </button>;
        }) : <div className="p-5 text-xs text-[#77787b]">No WhatsApp activity on this day.</div>}
      </div>
      <div className={cx("min-h-0 min-w-0 flex-col bg-[#efeae2]", showChat ? "flex" : "hidden lg:flex")}>
        <div className="flex items-center gap-2 border-b border-[#d1d7db] bg-[#f0f2f5] px-2 py-2.5 sm:gap-3 sm:px-4">
          <button aria-label="Back to conversations" onClick={() => setShowChat(false)} className="grid h-9 w-9 shrink-0 place-items-center text-[#54656f] lg:hidden"><ArrowLeft size={18} /></button>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f]">{current ? (current.name.replace(/[^A-Za-z0-9]/g, "")[0] || "#").toUpperCase() : "·"}</span>
          <div className="min-w-0"><div className="truncate text-sm font-semibold text-[#111b21]">{current?.name ?? "Select a conversation"}</div><div className="truncate text-[11px] text-[#667781]">{current ? `${current.phone}${lastDelivery(current) ? ` · Last assignment: ${statusLabel(lastDelivery(current))}` : ""}` : ""}</div></div>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-[7%] sm:py-5">
          {(current?.bubbles ?? []).map((b) => <div key={b.key} className={cx("flex", b.out ? "justify-end" : "justify-start")}>
            <div className={cx("relative max-w-[88%] whitespace-pre-wrap sm:max-w-[78%] break-words px-2.5 pb-1 pt-1.5 text-[13px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]", b.out ? "rounded-[8px] rounded-tr-none bg-[#d9fdd3]" : "rounded-[8px] rounded-tl-none bg-white")}>
              {b.orphanReply && <div className="mb-0.5 text-[10px] font-semibold text-[#b26a00]">Received by Twilio — not in this conversation</div>}
              <span>{b.text}</span>
              <span className="float-right ml-3 mt-1.5 inline-flex items-center gap-1 text-[10.5px] leading-none text-[#667781]">{TIME.format(new Date(b.ts))}{b.out && <Ticks status={b.delivery?.status} />}</span>
              {b.delivery && ["failed", "undelivered"].includes(b.delivery.status) && <div className="clear-both pt-1 text-[10.5px] text-[#ea0038]">Not delivered{b.delivery.errorCode ? ` · error ${b.delivery.errorCode}` : ""}{b.delivery.errorMessage ? ` — ${b.delivery.errorMessage}` : ""}</div>}
            </div>
          </div>)}
          {!current && <div className="py-10 text-center text-xs text-[#667781]">Select a conversation</div>}
        </div>
        {current && lastDelivery(current) && <div className="border-t border-[#d1d7db] bg-[#f0f2f5] px-4 py-1.5 text-[11px] text-[#667781]">Delivery status from Twilio · {STAMP.format(new Date(logs.data?.fetched_at ?? Date.now()))}</div>}
      </div>
    </div>
  </div>;
}
