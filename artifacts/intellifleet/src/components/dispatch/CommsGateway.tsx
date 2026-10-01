import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Mail, MessageCircle, Phone, Radio, RefreshCw, Send, Signal, Wifi } from "lucide-react";
import * as dispatchApi from "@/services/api/dispatch";
import type { DispatchConversation, SendMessageBody } from "@/services/api/dispatch";
import WhatsAppPanel from "@/components/dispatch/WhatsAppPanel";
import * as gmailApi from "@/services/api/gmail";
import type { GmailThread } from "@/services/api/gmail";
import overviewHero from "../../../../../media/overview tab.png";

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" ");

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  if (iso.startsWith("elapsed:")) {
    const seconds = Number(iso.slice(8));
    return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}` : "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "delivered" || status === "sent" || status === "acknowledged" ? "good" : status === "failed" ? "bad" : "neutral";
  return (
    <span
      className={cx(
        "status-chip",
        tone === "good" ? "status-good" : tone === "bad" ? "status-bad" : "status-neutral",
      )}
    >
      {status}
    </span>
  );
}

function ConversationRow({ conv, active, onSelect }: { conv: DispatchConversation; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cx("flex w-full items-start gap-3 border-b border-[#efeeeb] px-5 py-4 text-left hover:bg-[#fafaf8]", active && "bg-[#fafaf8]")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{conv.recipient_name || conv.recipient_contact || "Unknown recipient"}</span>
          <span className="mono shrink-0 text-[10px] text-[#77787b]">{formatWhen(conv.last_message_at)}</span>
        </div>
        <div className="mt-1 truncate text-xs text-[#77787b]">
          {conv.audience} · {conv.channels.join(", ")} · {conv.message_count} message{conv.message_count === 1 ? "" : "s"}
        </div>
      </div>
      <StatusPill status={conv.last_status} />
    </button>
  );
}

function emailName(header: string | null | undefined) {
  if (!header) return "Unknown";
  const match = header.match(/^"?([^"<]+)"?\s*<[^>]+>$/);
  if (match) return match[1].trim();
  return header.split("<")[0].trim() || header;
}

function ThreadRow({ thread, active, onSelect }: { thread: GmailThread; active: boolean; onSelect: () => void }) {
  const other = thread.participants.find((p) => !p.toLowerCase().includes("rarechain")) || thread.participants[0] || "Unknown";
  return (
    <button
      onClick={onSelect}
      className={cx("flex w-full items-start gap-3 border-b border-[#efeeeb] px-5 py-4 text-left hover:bg-[#fafaf8]", active && "bg-[#fafaf8]")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cx("truncate text-sm", thread.has_unread ? "font-bold" : "font-semibold")}>{emailName(other)}</span>
          <span className="mono shrink-0 text-[10px] text-[#77787b]">{formatWhen(thread.last_message_at)}</span>
        </div>
        <div className="mt-1 truncate text-xs font-medium text-[#33343a]">{thread.subject}</div>
        <div className="mt-1 truncate text-xs text-[#77787b]">
          {thread.message_count} message{thread.message_count === 1 ? "" : "s"}
        </div>
      </div>
      {thread.has_unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#1a56db]" />}
    </button>
  );
}

function GmailPanel() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [refreshing, setRefreshing] = useState(false);
  const status = useQuery({ queryKey: ["gmail-status"], queryFn: () => gmailApi.gmailStatus(), retry: false, staleTime: 30000 });
  const today = useQuery({
    queryKey: ["gmail-today", selectedDate],
    queryFn: () => gmailApi.listTodayThreads(selectedDate),
    enabled: status.data?.connected === true,
    refetchInterval: 60000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
  });

  const handleHardRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
      await queryClient.invalidateQueries({ queryKey: ["gmail-today"] });
      await Promise.all([status.refetch(), today.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (status.isLoading) {
    return <div className="border border-[#e4e3df] bg-white p-5 text-xs text-[#77787b]">Checking Gmail connection…</div>;
  }

  if (status.data && !status.data.connected) {
    return (
      <div className="border border-[#e4e3df] bg-white p-8 text-center">
        <Mail className="mx-auto mb-3 text-[#c9c8c3]" size={28} />
        <div className="text-sm font-semibold">Gmail is not connected</div>
        <div className="mt-1 text-xs text-[#77787b]">Gmail is not configured on the server.</div>
      </div>
    );
  }

  const allThreads = today.data?.threads ?? [];
  const inboxThreads = allThreads.filter((t) => t.messages.some((m) => !m.is_sent));
  const sentThreads = allThreads.filter((t) => t.messages.some((m) => m.is_sent));
  const threads = folder === "inbox" ? inboxThreads : sentThreads;
  const selected = threads.find((t) => t.thread_id === selectedId) || null;

  return (
    <div className="grid min-h-[calc(100vh-250px)] gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="flex min-h-0 flex-col border border-[#e4e3df] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e3df] p-4">
          <div className="min-w-0">
            <div className="micro whitespace-nowrap text-[#77787b]">Gmail · selected day</div>
            <h2 className="display-face mt-1 whitespace-nowrap text-lg font-bold">{today.data ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Loading…"}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            data-testid="button-gmail-refresh"
            onClick={handleHardRefresh}
            disabled={refreshing}
            className="mt-1 inline-flex shrink-0 items-center gap-1.5 border border-[#d8d7d2] px-3 py-1.5 text-xs font-semibold hover:bg-[#fafaf8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={13} className={cx(refreshing && "animate-spin")} /> Refresh
          </button>
          <button aria-label="Previous day" onClick={() => { const d = new Date(`${selectedDate}T12:00:00`); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().slice(0, 10)); setSelectedId(null); }} className="grid h-8 w-8 place-items-center border border-[#d8d7d2] bg-white"><ChevronLeft size={14} /></button>
          <input aria-label="Email date" type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setSelectedId(null); }} className="h-8 border border-[#d8d7d2] bg-white px-2 text-xs font-semibold" />
          <button aria-label="Next day" onClick={() => { const d = new Date(`${selectedDate}T12:00:00`); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().slice(0, 10)); setSelectedId(null); }} className="grid h-8 w-8 place-items-center border border-[#d8d7d2] bg-white"><ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="flex border-b border-[#e4e3df]">
          <button
            data-testid="button-gmail-folder-inbox"
            onClick={() => { setFolder("inbox"); setSelectedId(null); }}
            className={cx(
              "flex-1 px-4 py-2.5 text-xs font-semibold",
              folder === "inbox" ? "bg-[#fafaf8] text-black" : "text-[#77787b] hover:bg-[#fafaf8]",
            )}
          >
            Inbox ({inboxThreads.length})
          </button>
          <button
            data-testid="button-gmail-folder-sent"
            onClick={() => { setFolder("sent"); setSelectedId(null); }}
            className={cx(
              "flex-1 border-l border-[#e4e3df] px-4 py-2.5 text-xs font-semibold",
              folder === "sent" ? "bg-[#fafaf8] text-black" : "text-[#77787b] hover:bg-[#fafaf8]",
            )}
          >
            Sent ({sentThreads.length})
          </button>
        </div>
        {today.isLoading ? (
          <div className="p-5 text-xs text-[#77787b]">Loading today's emails…</div>
        ) : today.isError ? (
          <div className="p-5 text-xs text-[#b3261e]">Could not load Gmail. The access/refresh token may have expired or been revoked.</div>
        ) : !threads.length ? (
          <div className="p-5 text-xs text-[#77787b]">{folder === "inbox" ? "No emails received today yet." : "No emails sent today yet."}</div>
        ) : (
          <div className="thin-scroll min-h-0 flex-1 overflow-auto">
            {threads.map((t) => (
              <ThreadRow key={t.thread_id} thread={t} active={t.thread_id === selectedId} onSelect={() => setSelectedId(t.thread_id)} />
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col border border-[#d7e0ea] bg-[#f2f6fc] p-5">
        {!selected ? (
          <div className="flex h-full min-h-[300px] items-center justify-center text-xs text-[#77787b]">Select a thread to read the conversation.</div>
        ) : (
          <>
            <div className="rounded-sm bg-white px-5 py-4 shadow-sm">
              <div className="micro text-[#5f6368]">{selected.participants.join(", ")}</div>
              <h2 className="display-face mt-2 text-lg font-bold text-[#202124]">{selected.subject}</h2>
            </div>
            <div className="thin-scroll mt-5 min-h-0 flex-1 overflow-auto grid gap-4">
              {selected.messages.map((m) => (
                <div
                  key={m.id}
                  className="overflow-hidden rounded-sm border border-[#d8d7d2] bg-white"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-[#efeeeb] px-4 py-3">
                    <div className="min-w-0 text-xs"><div className="font-semibold text-[#202124]">{emailName(m.from)} <span className="font-normal text-[#77787b]">&lt;{m.from || ""}&gt;</span></div><div className="mt-1 text-[#77787b]">to {m.to || "me"}</div></div>
                    <span className="shrink-0 text-[11px] text-[#77787b]">{formatWhen(m.sent_at)}</span>
                  </div>
                  {m.body_html ? <iframe title={`Email from ${emailName(m.from)}`} sandbox="" srcDoc={m.body_html} className="h-[calc(100vh-430px)] min-h-[420px] w-full border-0 bg-white" /> : <p className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-[#202124]">{m.body || m.snippet}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChannelPanel({ channel }: { channel: "whatsapp" | "sms" }) {
  const [selected, setSelected] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()));
  const conversations = useQuery({ queryKey: ["n8n-conversations", channel], queryFn: () => dispatchApi.listN8nConversations(channel), refetchInterval: 15000, retry: false });
  const allRows = conversations.data?.conversations ?? [];
  const rows = allRows.filter((row) => {
    const stamp = row.lastUpdated || row.lastMessageAt;
    if (!stamp) return false;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(stamp)) === selectedDate;
  });
  const current = rows[selected];
  const readableDate = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "2-digit", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`));
  const moveDate = (offset: number) => { const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() + offset); setSelectedDate(date.toISOString().slice(0, 10)); setSelected(0); };
  return <div className="comms-channel-panel min-w-0 max-w-full overflow-hidden border border-[#e4e3df] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e3df] p-4"><div className="min-w-0"><div className="micro whitespace-nowrap text-[#77787b]">{channel.toUpperCase()} · selected day</div><div className="mt-1 whitespace-nowrap text-lg font-bold">{readableDate}</div></div><div className="flex flex-wrap items-center justify-end gap-1.5"><button onClick={() => conversations.refetch()} disabled={conversations.isFetching} className="inline-flex items-center gap-2 border border-[#d8d7d2] px-3 py-1.5 text-xs disabled:opacity-50"><RefreshCw size={13} className={conversations.isFetching ? "animate-spin" : ""} />{conversations.isFetching ? "Refreshing…" : "Refresh"}</button><button aria-label="Previous day" onClick={() => moveDate(-1)} className="grid h-8 w-8 place-items-center border border-[#d8d7d2]"><ChevronLeft size={14} /></button><input aria-label={`${channel} date`} type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setSelected(0); }} className="h-8 border border-[#d8d7d2] px-2 text-xs font-semibold" /><button aria-label="Next day" onClick={() => moveDate(1)} className="grid h-8 w-8 place-items-center border border-[#d8d7d2]"><ChevronRight size={14} /></button></div></div>
    <div className="grid min-h-[520px] gap-0 lg:grid-cols-[320px_1fr]">
    <div className="border-r border-[#e4e3df]">
      {conversations.isError ? <div className="p-5 text-xs text-[#b3261e]">Could not load {channel} conversations.</div> : rows.length ? rows.map((row, index) => <button key={`${row.contact}-${index}`} onClick={() => setSelected(index)} className={cx("w-full border-b border-[#efeeeb] p-4 text-left", selected === index && "bg-[#f7f7f4]")}><div className="flex justify-between gap-2"><b className="truncate text-sm">{row.driverName || row.contact || "Unknown driver"}</b><span className={cx("h-2 w-2 rounded-full", row.humanEscalated ? "bg-[#c4291f]" : row.assignmentConfirmed ? "bg-[#1e7b44]" : "bg-[#b7b6b1]")} /></div><div className="mt-1 truncate text-xs text-[#77787b]">{row.messages && row.messages.length ? row.messages[row.messages.length - 1].content : row.conversationStage || "No messages"}</div></button>) : <div className="p-5 text-xs text-[#77787b]">No conversations today.</div>}
    </div>
    <div className={cx("flex flex-col p-5", channel === "whatsapp" ? "bg-[#f1f5ef]" : "bg-white")}><div className="border-b border-[#e4e3df] pb-3 text-sm font-semibold">{current?.driverName || current?.contact || "Select a conversation"}</div><div className="flex-1 space-y-3 py-5">{(current?.messages ?? []).map((message, index) => <div key={`${message.ts}-${index}`} className={cx("max-w-[75%] p-3 text-xs", channel === "whatsapp" ? (message.role === "assistant" ? "ml-auto rounded-[12px] rounded-br-[3px] bg-[#d8efd2]" : "rounded-[12px] rounded-bl-[3px] bg-white") : (message.role === "assistant" ? "ml-auto bg-[#f2f2ef]" : "bg-[#fafaf8]"))}><div>{message.content}</div><div className="mt-1 text-[10px] text-[#77787b]">{formatWhen(message.ts)}</div></div>)}</div></div>
    </div>
  </div>;
}

function VoicePanel() {
  const [selected, setSelected] = useState(0);
  const calls = useQuery({ queryKey: ["n8n-conversations", "voice"], queryFn: () => dispatchApi.listN8nConversations("voice"), refetchInterval: 20000, retry: false });
  const rows = (calls.data?.conversations ?? []) as dispatchApi.VoiceCall[];
  useEffect(() => { if (selected >= rows.length) setSelected(0); }, [rows.length, selected]);
  const current = rows[selected];
  const callId = current?.callId || current?.id;
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setRecordingUrl(null);
    setRecordingError(false);
    if (!callId) return () => undefined;
    dispatchApi.getVoiceRecording(callId).then(({ blob }) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setRecordingUrl(objectUrl);
    }).catch(() => { if (active) setRecordingError(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [callId]);
  const detail = useQuery({ queryKey: ["voice-call-detail", callId], queryFn: () => dispatchApi.getVoiceCallDetail(callId!), enabled: Boolean(callId), retry: false });
  const transcript = (detail.data?.turns || detail.data?.messages || current?.messages || []).map((turn: any) => { const role = String(turn.role || "driver").toLowerCase(); const text = turn.text ?? turn.content ?? turn.message ?? ""; const content = role === "system" ? `✓ ${String(text).replace(/^Tool called:\s*/i, "").replace(/^Result:\s*confirmAssignment\s*→\s*/i, "Assignment confirmed: ")}` : `${role === "assistant" ? "Martin" : "Driver"}: ${text}`; return { role, content, ts: turn.secondsFromStart != null ? `elapsed:${turn.secondsFromStart}` : turn.ts ?? turn.timestamp }; }) as { role: string; content: string; ts?: string }[];
  const status = detail.data?.status || current?.callStatus || current?.status || "unknown";
  const stamp = detail.data?.startedAt || current?.callTimestamp || current?.startedAt || current?.timestamp;
  const driverName = detail.data?.driverName || current?.driverName || "Driver";
  const elapsed = (seconds?: number) => seconds == null ? "—" : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
  return <div className="comms-channel-panel min-w-0 max-w-full overflow-hidden grid min-h-[calc(100vh-250px)] gap-4 border border-[#e4e3df] bg-white lg:grid-cols-[320px_1fr]">
    <div className="border-r border-[#e4e3df]">{calls.isError ? <div className="p-5 text-xs text-[#b3261e]">Could not load voice conversations.</div> : calls.isLoading ? <div className="p-5 text-xs text-[#77787b]">Loading voice calls…</div> : rows.length ? rows.map((row, index) => <button key={`${row.callId || row.id}-${index}`} onClick={() => setSelected(index)} className={cx("w-full border-b border-[#efeeeb] p-4 text-left", selected === index && "bg-[#f7f7f4]")}><div className="flex items-center justify-between gap-2"><b className="truncate text-sm">{row.driverName || "Unknown driver"}</b><StatusPill status={row.callStatus || row.status || "unknown"} /></div><div className="mt-1 text-xs text-[#77787b]">{row.truckPlate || "No truck"} · {stamp ? formatWhen(stamp) : "—"}</div></button>) : <div className="p-5 text-xs text-[#77787b]">No voice calls found.</div>}</div>
    <div className="flex min-w-0 flex-col bg-[#f7f9fc] p-5">{!current ? <div className="flex flex-1 items-center justify-center text-xs text-[#77787b]">Select a voice call.</div> : <><div className="flex items-start justify-between gap-3 border-b border-[#d8d7d2] pb-4"><div><div className="flex items-center gap-2 text-lg font-bold"><Phone size={17} />{detail.data?.driverName || current.driverName || "Unknown driver"}</div><div className="mt-1 text-xs text-[#77787b]">{detail.data?.truckPlate || current.truckPlate || "No truck"} · {stamp ? formatWhen(stamp) : "—"}{(detail.data?.duration || current.duration || current.durationSeconds) ? ` · ${detail.data?.duration || current.duration || current.durationSeconds}s` : ""}</div></div><div className="flex gap-2"><StatusPill status={status} />{(detail.data?.assignmentConfirmed ?? current.assignmentConfirmed) && <StatusPill status="acknowledged" />}{(detail.data?.humanEscalated ?? current.humanEscalated) && <span className="status-chip status-bad">Escalated</span>}</div></div><div className="thin-scroll flex-1 space-y-3 overflow-auto py-5">{detail.isLoading ? <div className="text-xs text-[#77787b]">Loading transcript…</div> : transcript.length ? transcript.map((message, index) => <div key={`${message.ts}-${index}`} className={cx("max-w-[75%] p-3 text-xs", ["assistant", "agent"].includes(message.role.toLowerCase()) ? "ml-auto bg-[#e8edf5]" : "bg-white")}>{message.content}<div className="mt-1 text-[10px] text-[#77787b]">{formatWhen(message.ts)}</div></div>) : <div className="text-xs text-[#77787b]">No transcript available.</div>}</div>{(detail.data?.callSummary || current.callSummary) && <div className="border-t border-[#d8d7d2] py-3 text-xs"><b>Call summary:</b> {detail.data?.callSummary || current.callSummary}</div>}{recordingError ? <div className="mt-3 text-xs text-[#b3261e]">Recording could not be loaded.</div> : <audio controls className="mt-3 w-full" src={recordingUrl || undefined} />}</>}</div>
  </div>;
}

function AnimatedMetric({ value, format }: { value: number | null | undefined; format: "number" | "percent" | "minutes" }) {
  const [display, setDisplay] = useState<number | null>(null);
  const target = useRef<number | null | undefined>(undefined);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    const next = value ?? null;
    if (next === target.current) return;
    target.current = next;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    if (next == null) {
      setDisplay(null);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = display ?? 0;
    if (reduceMotion || start === next) {
      setDisplay(next);
      return;
    }
    const startedAt = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (next - start) * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else frame.current = null;
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [value]);
  if (display == null) return <>—</>;
  const rounded = Math.round(display);
  return <span className="comms-kpi-number">{format === "percent" ? `${rounded}%` : format === "minutes" ? `${rounded} min` : rounded}</span>;
}

function CommsMetricsOverview({ onSelectChannel }: { onSelectChannel: (tab: CommsTabKey) => void }) {
  const metrics = useQuery({ queryKey: ["comms-overview"], queryFn: () => dispatchApi.getCommsOverview(), refetchInterval: 20000, retry: false });
  if (metrics.isLoading) return <div className="border border-[#e4e3df] bg-white p-6 text-sm text-[#77787b]">Loading communication metrics…</div>;
  if (metrics.isError || !metrics.data) return <div className="border border-[#c4291f] bg-[#fbeceb] p-6 text-sm"><b>LIVE FEED OFFLINE</b><div className="mt-1">Unable to load live communication metrics.</div></div>;
  const data = metrics.data;
  const legacyData = data as unknown as { messagesSentToday?: Record<string, number>; channels?: Array<{ channel: string; messagesSentToday?: number }> };
  const monthlyTotals = data.messagesSentThisMonth ?? legacyData.messagesSentToday ?? { combined: 0 };
  const relative = (value?: string) => { if (!value) return "—"; const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hrs ago`; };
  const channelIcon = (channel: string) => channel === "email" ? <Mail size={15} /> : channel === "whatsapp" ? <MessageCircle size={15} /> : channel === "voice" ? <Phone size={15} /> : <Signal size={15} />;
  const channelRows: dispatchApi.CommsOverviewMetrics["channels"] = ["email", "whatsapp", "sms", "voice"].map((name) => { const item = data.channels.find((entry) => entry.channel === name); const legacyItem = legacyData.channels?.find((entry) => entry.channel === name); return item || { channel: name, messagesSentThisMonth: legacyItem?.messagesSentToday || 0, responseRate: 0, avgReplyTimeMinutes: null, needsAttentionCount: 0, confirmed: 0, unconfirmed: 0 }; });
  const combined = monthlyTotals.combined || 0;
  const confirmed = data.confirmedVsUnconfirmed.confirmed || 0;
  const unconfirmed = data.confirmedVsUnconfirmed.unconfirmed || 0;
  const confirmationTotal = confirmed + unconfirmed;
  const confirmationRate = confirmationTotal ? Math.round((confirmed / confirmationTotal) * 100) : 0;
  const hasChannelError = channelRows.some((channel) => Boolean(channel.error));
  const operationalChannels = channelRows.filter((channel) => !channel.error).length;
  const operationalSummary = data.needsAttentionCount ? `${data.needsAttentionCount} communication ${data.needsAttentionCount === 1 ? "item requires" : "items require"} operator attention.` : hasChannelError ? `${channelRows.filter((channel) => channel.error).map((channel) => channel.channel).join(", ")} feed unavailable.` : "Communication traffic is normal. All monitored channels are clear.";
  const updatedSeconds = metrics.dataUpdatedAt ? Math.max(0, Math.round((Date.now() - metrics.dataUpdatedAt) / 1000)) : 0;
  return <div className="comms-overview-compact grid gap-3">
    <section className="comms-overview-hero relative min-h-[170px] overflow-hidden rounded-[4px] border border-[#183b60] bg-[#071b32] text-white md:min-h-[190px]">
      <img src={overviewHero} alt="Truck moving through a connected communications network" className="comms-hero-image absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#041222]/90 via-[#041222]/55 to-[#041222]/20" />
      <div className="comms-network-pulse absolute inset-0" aria-hidden="true"><span /><span /><span /></div>
      <div className="relative flex min-h-[170px] flex-col justify-between p-4 md:min-h-[190px] md:p-5">
        <div className="flex items-start justify-between gap-4"><div><div className="micro text-[#8ed7ff]">RARECHAIN · OPERATIONS</div><h2 className="mt-3 max-w-xl text-3xl font-bold tracking-[-0.03em] md:text-5xl">Live communications network</h2><p className="mt-3 max-w-lg text-sm leading-6 text-white/75">Connected fleet communications across Email, WhatsApp, SMS, and Voice.</p></div><div className="comms-live-badge inline-flex shrink-0 items-center gap-2 rounded-full border border-[#8ed7ff]/40 bg-[#06182b]/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#b8e8ff]"><span className="h-2 w-2 rounded-full bg-[#67e8b1]" /> Live</div></div>
        <div className="flex items-end justify-between gap-4"><div className="text-[11px] text-white/65">Live n8n feeds · refreshes every 20 seconds</div><div className="hidden items-center gap-2 text-[10px] uppercase tracking-[.14em] text-white/60 sm:flex"><Wifi size={14} /> {operationalChannels}/{channelRows.length} channels active</div></div>
      </div>
    </section>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{channelRows.map((channel) => <div key={channel.channel} className="comms-channel-chip flex items-center gap-2 border border-[#d9e5ef] bg-white px-3 py-3 text-xs font-semibold uppercase tracking-[.12em]"><span className="text-[#1674b8]">{channelIcon(channel.channel)}</span>{channel.channel}<span className={cx("ml-auto h-1.5 w-1.5 rounded-full", channel.error ? "bg-[#c4291f]" : "bg-[#24a267]")} /></div>)}</div>
    <div className="comms-kpi-live-state flex items-center justify-between border-l-2 border-[#1687cf] bg-[#f4f9fc] px-3 py-1.5 text-[10px] uppercase tracking-[.12em] text-[#1674b8]"><span className="flex items-center gap-2"><span className="comms-pulse-dot h-1.5 w-1.5 rounded-full bg-[#24a267]" /> Live operations</span><span>Updated {updatedSeconds < 5 ? "just now" : `${updatedSeconds}s ago`}</span></div>
    <div className="comms-kpi-grid grid items-stretch gap-3 md:grid-cols-4"><div className="md:col-span-4 micro text-[#77787b]">Current month · updated live</div>{([["Active conversations", combined, "Communication threads this month", Radio, "number"], ["Response rate", data.responseRate.combined || 0, "Drivers replied to initial sends", Signal, "percent"], ["Average reply", data.avgReplyTimeMinutes.combined, "Initial send to first reply", Clock3, "minutes"], ["Needs attention", data.needsAttentionCount, "Escalated or issue reported this month", AlertTriangle, "number"]] as const).map(([label, value, detail, Icon, format]) => <div key={String(label)} className="comms-kpi flex h-full min-h-[104px] flex-col border border-[#dfe3e6] bg-white p-4"><div className="flex min-h-[18px] items-start justify-between"><div className="micro text-[#77787b]">{String(label)}</div><Icon size={16} className={label === "Needs attention" && data.needsAttentionCount ? "text-[#b3261e]" : "text-[#1674b8]"} /></div><div className="display-face mt-3 text-3xl font-bold tracking-tight"><AnimatedMetric value={typeof value === "number" ? value : null} format={format} /></div><div className="mt-1 text-xs text-[#77787b]">{String(detail)}</div></div>)}</div>
    <div className="grid items-stretch gap-3 lg:grid-cols-[1.35fr_.8fr]">
      <section className="border border-[#dfe3e6] bg-white p-3"><div className="flex items-center justify-between"><div><div className="micro text-[#77787b]">Communication pulse · this month</div><h3 className="mt-1 text-base font-bold">Channel activity</h3></div><span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#1674b8]"><span className="comms-pulse-dot h-2 w-2 rounded-full bg-[#36a9e8]" /> Live</span></div><div className="mt-3 grid gap-1.5">{channelRows.map((channel) => <div key={channel.channel} className="grid min-h-[31px] grid-cols-[86px_1fr_40px] items-center gap-2 text-[11px]"><div className="flex items-center gap-2 font-semibold uppercase text-[#55565a]">{channelIcon(channel.channel)}{channel.channel}</div><div className="h-1.5 overflow-hidden bg-[#edf0f2]"><div className="comms-bar h-full bg-[#1687cf]" style={{ width: `${Math.max(channel.messagesSentThisMonth ? 8 : 0, Math.min(100, channel.responseRate || 0))}%` }} /></div><div className="text-right font-semibold">{channel.messagesSentThisMonth}</div></div>)}</div></section>
      <section className="border border-[#dfe3e6] bg-[#f8fbfd] p-3"><div className="micro text-[#77787b]">Channel health</div><div className="mt-2 grid gap-1.5">{channelRows.map((channel) => <div key={channel.channel} className="grid min-h-[31px] grid-cols-[1fr_auto] items-center gap-3 border-b border-[#e4eaee] pb-1.5 last:border-0"><div className="flex items-center gap-2 text-xs font-semibold"><span className={cx("h-1.5 w-1.5 rounded-full", channel.error ? "bg-[#c4291f]" : "bg-[#24a267")} />{channelIcon(channel.channel)}<span className="capitalize">{channel.channel}</span></div><div className="min-w-[102px] text-right leading-tight">{channel.error ? <div className="text-[9px] font-bold uppercase text-[#b3261e]">Feed unavailable</div> : <><div className="flex items-center justify-end gap-1.5 text-[9px] font-bold uppercase text-[#248456]">Operational</div><div className="mt-0.5 text-[9px] text-[#77787b]">{Math.round(channel.responseRate)}% response</div></>}</div></div>)}</div></section>
    </div>
    <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <section className="border border-[#dfe3e6] bg-white p-3"><div className="flex items-center justify-between"><div><div className="micro text-[#77787b]">Live activity feed</div><h3 className="mt-1 text-base font-bold">Recent communications</h3></div><span className="text-[10px] uppercase tracking-[.12em] text-[#8a9298]">{Math.min(data.recentActivity.length, 5)} latest</span></div><div className="comms-recent-scroll mt-2 max-h-[180px] overflow-y-auto pr-1">{data.recentActivity.length ? data.recentActivity.slice(0, 5).map((item, index) => <div className="comms-feed-entry flex items-start gap-2 border-b border-[#eef0f1] py-2 last:border-0" key={`${item.channel}-${item.ts}-${index}`}><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1687cf] shadow-[0_0_0_3px_rgba(22,135,207,.12)]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[9px] font-bold uppercase tracking-[.12em] text-[#1674b8]">{item.channel}</span><span className="text-[11px] font-semibold">{item.driverName || "Unknown driver"}{item.truckPlate ? ` · ${item.truckPlate}` : ""}</span></div><div className="truncate text-[10px] leading-4 text-[#55565a]">{item.lastMessagePreview || "No message preview"}</div></div><span className="shrink-0 text-[9px] text-[#77787b]">{relative(item.ts)}</span></div>) : <div className="py-5 text-xs text-[#77787b]">No recent activity.</div>}</div></section>
      <section className={cx("comms-operations-card border p-4", data.needsAttentionCount ? "border-[#e7c8c5] bg-[#fffaf9]" : "border-[#d8e8dc] bg-[#fbfefb]")}><div className="flex items-center justify-between"><div className={cx("micro", data.needsAttentionCount ? "text-[#b3261e]" : "text-[#28723d]")}>{data.needsAttentionCount ? "Needs attention" : "Operations clear"}</div>{data.needsAttentionCount ? <AlertTriangle size={17} className="text-[#b3261e]" /> : <CheckCircle2 size={17} className="comms-operational-icon text-[#28723d]" />}</div>{data.needsAttentionCount ? <div className="mt-4 max-h-[320px] overflow-auto">{data.attentionDetail.map((item, index) => <div className="border-b border-[#f0dfdd] py-3 last:border-0" key={`${item.channel}-${item.lastUpdated}-${index}`}><div className="text-xs font-semibold">{item.driverName || "Unknown driver"}{item.truckPlate ? ` · ${item.truckPlate}` : ""}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#b3261e]">{item.channel} · {item.conversationStage || "Attention"}</div><div className="mt-1 text-[11px] text-[#55565a]">{(item.soNumbers || []).join(", ") || "No SO linked"} · {item.reasonPreview || "No driver message preview"}</div></div>)}</div> : <div className="mt-3"><div className="text-base font-bold text-[#28723d]">All communications clear</div><p className="mt-1 text-xs leading-5 text-[#55715d]">No escalations or reported issues in the current live feeds.</p></div>}</section>
    </div>
    <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <section className="border border-[#dfe3e6] bg-white p-5"><div className="micro text-[#77787b]">Dispatch confirmation</div><div className="mt-4 grid grid-cols-2 gap-4"><div><div className="text-3xl font-bold">{confirmed}</div><div className="text-xs text-[#77787b]">Confirmed</div></div><div><div className="text-3xl font-bold">{unconfirmed}</div><div className="text-xs text-[#77787b]">Awaiting response</div></div></div><div className="mt-5 h-2 overflow-hidden bg-[#edf0f2]"><div className="h-full bg-[#1687cf] transition-all duration-500" style={{ width: `${confirmationRate}%` }} /></div><div className="mt-2 flex justify-between text-[10px] uppercase tracking-[.1em] text-[#8a9298]"><span>Confirmation rate</span><span>{confirmationRate}%</span></div></section>
      <section className="border border-[#dfe3e6] bg-[#071b32] p-5 text-white"><div className="flex items-center gap-2 text-[#8ed7ff]"><Radio size={15} /><div className="micro">Operational summary</div></div><p className="mt-4 text-lg font-semibold leading-7">{operationalSummary}</p><p className="mt-3 text-xs leading-5 text-white/60">{data.needsAttentionCount ? "Review the attention queue above and follow up through the appropriate channel." : "Live n8n communication feeds are being monitored across the network."}</p><div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[.12em] text-white/55"><RefreshCw size={13} /> Updated automatically every 20 seconds</div></section>
    </div>
  </div>;
}

function CommsOverview({ onNotice }: { onNotice: (s: string) => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DispatchConversation | null>(null);
  const [audience, setAudience] = useState<"driver" | "customer" | "internal">("driver");
  const [recipientId, setRecipientId] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"normal" | "critical">("normal");
  const [sending, setSending] = useState(false);

  const conversations = useQuery({ queryKey: ["dispatch-conversations"], queryFn: () => dispatchApi.listConversations(), staleTime: 5000, retry: false });
  const staff = useQuery({ queryKey: ["dispatch-staff"], queryFn: () => dispatchApi.listStaff(), staleTime: 30000, retry: false });
  const customers = useQuery({ queryKey: ["dispatch-customers"], queryFn: () => dispatchApi.listCustomerContacts(), staleTime: 30000, retry: false });
  const templates = useQuery({ queryKey: ["dispatch-templates", audience], queryFn: () => dispatchApi.listTemplates(audience), staleTime: 30000, retry: false });

  const messages = useQuery({
    queryKey: ["dispatch-messages", selected?.recipient_contact],
    queryFn: () => dispatchApi.listMessages(selected!.recipient_contact!),
    enabled: !!selected?.recipient_contact,
    retry: false,
  });

  const recipientOptions = useMemo(() => {
    if (audience === "customer") return (customers.data ?? []).map((c) => ({ id: String(c.id), label: c.customer_name || c.email || `Customer #${c.id}` }));
    return (staff.data ?? []).map((s) => ({ id: String(s.id), label: `${s.name} — ${s.title || "Staff"}${s.warehouse ? ` (${s.warehouse})` : ""}` }));
  }, [audience, staff.data, customers.data]);

  const selectedTemplate = (templates.data ?? []).find((t) => t.name === templateName);

  const reset = () => {
    setRecipientId("");
    setTemplateName("");
    setBody("");
    setSeverity("normal");
  };

  const handleSend = async () => {
    if (!recipientId) {
      onNotice("Choose a recipient before sending.");
      return;
    }
    if (!body.trim() && !templateName) {
      onNotice("Write a message or choose a template before sending.");
      return;
    }
    setSending(true);
    try {
      const payload: SendMessageBody = {
        audience,
        recipient_id: Number(recipientId),
        trigger_event: "manual",
        severity: audience === "internal" ? severity : undefined,
      };
      if (templateName) payload.template_name = templateName;
      else payload.body = body;
      await dispatchApi.sendMessage(payload);
      onNotice("Message logged and queued for delivery.");
      reset();
      queryClient.invalidateQueries({ queryKey: ["dispatch-conversations"] });
    } catch (err: any) {
      onNotice(err?.message || "Could not send this message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_370px]">
      <div className="border border-[#e4e3df] bg-white">
        <div className="border-b border-[#e4e3df] p-5">
          <div className="micro text-[#77787b]">Communications Gateway</div>
          <h2 className="display-face mt-2 text-xl font-bold">Conversation timeline</h2>
        </div>
        {conversations.isLoading ? (
          <div className="p-5 text-xs text-[#77787b]">Loading conversations…</div>
        ) : !(conversations.data ?? []).length ? (
          <div className="p-5 text-xs text-[#77787b]">No messages logged yet. Sends made from the panel on the right will appear here.</div>
        ) : (
          <div className="thin-scroll max-h-[520px] overflow-auto">
            {(conversations.data ?? []).map((conv) => (
              <ConversationRow key={conv.recipient_contact || conv.recipient_name} conv={conv} active={selected?.recipient_contact === conv.recipient_contact} onSelect={() => setSelected(conv)} />
            ))}
          </div>
        )}
        {selected && (
          <div className="border-t border-[#e4e3df] p-5">
            <div className="micro text-[#77787b]">Detail · {selected.recipient_name || selected.recipient_contact}</div>
            <div className="mt-4 grid gap-3">
              {(messages.data ?? []).map((m) => (
                <div key={m.id} className="border-b border-[#efeeeb] pb-3 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold capitalize">{m.channel}{m.template_name ? ` · ${m.template_name}` : ""}</span>
                    <StatusPill status={m.status} />
                  </div>
                  {m.body && <p className="mt-1 text-xs leading-5 text-[#55565a]">{m.body}</p>}
                  <div className="mt-1 text-[10px] text-[#77787b]">{formatWhen(m.created_at)}{m.related_so_number ? ` · ${m.related_so_number}` : ""}{m.trigger_event && m.trigger_event !== "manual" ? ` · ${m.trigger_event}` : ""}</div>
                </div>
              ))}
              {messages.isLoading && <div className="text-xs text-[#77787b]">Loading…</div>}
            </div>
          </div>
        )}
      </div>

      <div className="border border-[#e4e3df] bg-white p-5">
        <div className="micro text-[#77787b]">Manual send</div>
        <h2 className="display-face mt-3 text-2xl font-bold">Compose a message</h2>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-xs font-semibold">
            Audience
            <select
              data-testid="select-comms-audience"
              value={audience}
              onChange={(e) => { setAudience(e.target.value as typeof audience); setRecipientId(""); setTemplateName(""); }}
              className="border border-[#d8d7d2] bg-white p-2.5 text-sm font-normal"
            >
              <option value="driver">Driver</option>
              <option value="customer">Customer</option>
              <option value="internal">Internal / Logistics</option>
            </select>
          </label>
          <label className="grid gap-2 text-xs font-semibold">
            Recipient
            <select data-testid="select-comms-recipient" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="border border-[#d8d7d2] bg-white p-2.5 text-sm font-normal">
              <option value="">Select a recipient…</option>
              {recipientOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
          </label>
          {audience === "internal" && (
            <label className="grid gap-2 text-xs font-semibold">
              Severity
              <select data-testid="select-comms-severity" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} className="border border-[#d8d7d2] bg-white p-2.5 text-sm font-normal">
                <option value="normal">Normal — Email + WhatsApp + SMS</option>
                <option value="critical">Critical — adds Voice escalation</option>
              </select>
            </label>
          )}
          <label className="grid gap-2 text-xs font-semibold">
            Template
            <select data-testid="select-comms-template" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="border border-[#d8d7d2] bg-white p-2.5 text-sm font-normal">
              <option value="">None — write a custom message</option>
              {(templates.data ?? []).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </label>
          {templateName ? (
            <div className="border border-[#e4e3df] bg-[#f7f7f4] p-3 text-xs leading-5 text-[#55565a]">{selectedTemplate?.body}</div>
          ) : (
            <textarea
              data-testid="input-comms-message"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the message to send…"
              className="resize-none border border-[#d8d7d2] p-3 text-sm outline-none"
            />
          )}
          <button
            data-testid="button-send-comms"
            onClick={handleSend}
            disabled={sending}
            className="button-black inline-flex w-full items-center justify-center gap-2 rounded-[4px] px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send message"} <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

const COMMS_TABS = [
  { key: "overview", label: "Overview" },
  { key: "gmail", label: "Gmail" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "voice", label: "Voice" },
] as const;

type CommsTabKey = (typeof COMMS_TABS)[number]["key"];

export function CommsGateway({ onNotice }: { onNotice: (s: string) => void }) {
  const [tab, setTab] = useState<CommsTabKey>("overview");

  return (
    <div className="comms-page min-w-0 max-w-full overflow-x-hidden grid gap-4">
      <div className="comms-tabs flex min-h-[64px] max-w-full items-end gap-2 overflow-x-auto border-b border-[#e4e3df]">
        {COMMS_TABS.map((t) => (
          <button
            key={t.key}
            data-testid={`tab-comms-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cx(
              "min-w-[120px] shrink-0 px-6 py-4 text-center text-base font-semibold transition-colors",
              tab === t.key ? "border-b-2 border-black text-black" : "text-[#77787b] hover:text-black",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <CommsMetricsOverview onSelectChannel={setTab} />}
      {tab === "gmail" && <GmailPanel />}
      {tab === "whatsapp" && <WhatsAppPanel />}
      {tab === "sms" && <ChannelPanel channel="sms" />}
      {tab === "voice" && <VoicePanel />}
    </div>
  );
}
