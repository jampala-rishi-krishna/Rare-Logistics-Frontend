// Order Tracker page (approved design: docs/design/order-tracker/Desktop___Orders___order_details.png).
// Views live in the URL so Back works: list (default) · ?order=SO… (selected) · ?view=ask[&order=SO…] (Ask thread).
// Only findOrders / getOrder are requested from here; the Ask thread owns its own requests.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import * as tracker from "@/services/api/orderTracker";
import { useAccess } from "@/hooks/use-access";
import { AskBar } from "./orderTracker/AskBar";
import { OrderList } from "./orderTracker/OrderList";
import { OrderCard, OrderCardSkeleton } from "./orderTracker/OrderCard";
import { PhoneOrder, PhoneOrderSkeleton } from "./orderTracker/PhoneOrder";
import { AskThread } from "./orderTracker/AskThread";
import { SectionError, dayLabel, hhmm } from "./orderTracker/ui";
import "./orderTracker.css";

export function manilaToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

const BASE_PATH = "/app/order-tracker";
const PHONE = "(max-width: 640px)";
const QUICK: Array<[string, string, string]> = [["all", "My orders", "ink"], ["Out for delivery", "Out for delivery", "info"], ["Delivered", "Delivered", "positive"], ["problems", "Problems", "negative"]];

function failure(error: unknown) { return error instanceof Error ? error.message : "Could not load records. Please try again."; }
function shortDay(ymd: string) { const d = new Date(`${ymd}T12:00:00+08:00`); return Number.isNaN(d.getTime()) ? ymd : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short" }).format(d); }
function latest(list: tracker.OrderList | undefined): string | null {
  if (!list) return null;
  if (list.as_of) return list.as_of;
  let best: string | null = null, bestT = -Infinity;
  for (const row of list.orders) { const t = row.last_update ? new Date(row.last_update).getTime() : NaN; if (!Number.isNaN(t) && t > bestT) { bestT = t; best = row.last_update; } }
  return best;
}

function useMedia(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => { const m = window.matchMedia(query); m.addEventListener("change", notify); return () => m.removeEventListener("change", notify); }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export default function OrderTracker() {
  const params = new URLSearchParams(useSearch());
  const view = params.get("view") === "ask" ? "ask" : "list";
  const orderParam = params.get("order");
  const selected = view === "ask" ? null : orderParam;
  const askOrder = view === "ask" ? orderParam : null;
  const today = manilaToday();
  const [from, setFrom] = useState(params.get("from") ?? today);
  const [to, setTo] = useState(params.get("to") ?? params.get("from") ?? today);
  const [draft, setDraft] = useState(""); const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all"); const [offset, setOffset] = useState(0);
  const [seed, setSeed] = useState<{ question: string; id: number } | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const dateBox = useRef<HTMLDivElement>(null);
  const listScroll = useRef<number | null>(null);
  const cardCol = useRef<HTMLDivElement>(null);
  const pushedFromList = useRef(false);
  const [, navigate] = useLocation();
  const phone = useMedia(PHONE);
  const { user } = useAccess();
  const ownOrdersOnly = !!user && ["sales", "wet_market"].includes(user.role);

  const filter: tracker.Filter = { date_from: from, date_to: to, q: query, status, offset };
  const invalidRange = !from || !to || from > to || (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 30;
  const list = useQuery({ queryKey: ["order-tracker", from, to, query, status, offset], queryFn: () => tracker.findOrders(filter), enabled: !invalidRange && view !== "ask", retry: false, refetchOnWindowFocus: false });
  const card = useQuery({ queryKey: ["order-tracker-card", selected, from, to], queryFn: () => tracker.getOrder(selected!, filter), enabled: !invalidRange && !!selected, retry: false, refetchOnWindowFocus: false });
  useEffect(() => { const first = params.get("from"), last = params.get("to"); if (first) setFrom(first); if (last) setTo(last); }, [selected, params.get("from"), params.get("to")]);

  // Date popover: close on outside press / Escape.
  useEffect(() => {
    if (!dateOpen) return;
    const down = (e: PointerEvent) => { if (dateBox.current && !dateBox.current.contains(e.target as Node)) setDateOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setDateOpen(false); };
    document.addEventListener("pointerdown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [dateOpen]);

  // Phone: returning from one order to the list restores where the user was in the list.
  useLayoutEffect(() => {
    if (selected || view === "ask") return;
    const y = listScroll.current;
    if (y !== null) { window.scrollTo(0, y); requestAnimationFrame(() => window.scrollTo(0, y)); listScroll.current = null; }
  }, [selected, view]);

  // Narrow desktop/tablet: the columns stack, so bring the opened card into view.
  useEffect(() => {
    const el = cardCol.current;
    if (!selected || phone || !el) return;
    if (el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [selected, phone]);

  const range = `&from=${from}&to=${to}`;
  const hrefFor = (number: string) => `${BASE_PATH}?order=${encodeURIComponent(number)}${range}`;
  function shift(days: number) { const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); const ymd = d.toISOString().slice(0, 10); setFrom(ymd); setTo(ymd); setOffset(0); }
  function open(number: string) {
    if (phone) { listScroll.current = window.scrollY; window.scrollTo(0, 0); }
    pushedFromList.current = !selected && view !== "ask";
    navigate(hrefFor(number));
  }
  // Back from an order opened from the list pops that history entry, so the browser Back button stays in step.
  function back() {
    if (pushedFromList.current) { pushedFromList.current = false; window.history.back(); return; }
    navigate(`${BASE_PATH}?${range.slice(1)}`);
  }
  function openAsk(question: string | undefined, order?: string | null) {
    pushedFromList.current = false;
    setSeed(prev => question ? { question, id: (prev?.id ?? 0) + 1 } : null);
    window.scrollTo(0, 0);
    navigate(`${BASE_PATH}?view=ask${order ? `&order=${encodeURIComponent(order)}` : ""}${range}`);
  }
  function leaveAsk() { if (askOrder) navigate(hrefFor(askOrder)); else back(); }

  // ---- Ask view replaces the page content (both widths) ----
  if (view === "ask") {
    return <div className="ot ot-ask-view">
      <AskThread filter={filter} order={askOrder ?? null} seed={seed} onBack={leaveAsk} onOpenOrder={number => open(number)} />
    </div>;
  }

  const cardBody = !selected ? null
    : card.isError ? <div className="ot-card-err"><SectionError message={failure(card.error)} onRetry={() => void card.refetch()} /></div>
    : card.data ? (phone
        ? <PhoneOrder card={card.data} onBack={back} onAsk={q => openAsk(q, card.data!.number)} />
        : <OrderCard card={card.data} onAsk={() => openAsk(undefined, card.data!.number)} />)
    : phone ? <PhoneOrderSkeleton /> : <OrderCardSkeleton />;

  // ---- Phone: one order, full screen ----
  if (phone && selected) {
    return <div className="ot ot-phone-order">
      {card.isError && <button type="button" className="ot-back" onClick={back}><ChevronLeft size={20} aria-hidden="true" />All orders</button>}
      {cardBody}
    </div>;
  }

  const updated = latest(list.data);
  const isToday = from === to && from === today;
  const dateText = from === to ? dayLabel(from, today) : `${shortDay(from)} – ${shortDay(to)}`;

  return <div className="ot">
    <header className="ot-title">
      <div>
        <h1>Order Tracker</h1>
        <p>Where your order is, what happened, and the proof — without calling Logistics.</p>
      </div>
      <div className="ot-live">
        {list.data && !list.isError && <span className="ot-live-text"><span className="ot-dot" aria-hidden="true" />Live{updated ? <> · updated {hhmm(updated)}</> : null}</span>}
        <button type="button" className="ot-refresh" onClick={() => { void list.refetch(); if (selected) void card.refetch(); }} disabled={invalidRange || list.isFetching || card.isFetching} aria-label="Refresh orders">
          <RefreshCw size={16} aria-hidden="true" className={list.isFetching ? "ot-spin" : undefined} />
        </button>
      </div>
    </header>

    <AskBar onAsk={q => openAsk(q)} />

    <section className="ot-filters" aria-label="Filters">
      <form className="ot-search" role="search" onSubmit={e => { e.preventDefault(); setQuery(draft.trim()); setOffset(0); }}>
        <button type="submit" className="ot-search-go" aria-label="Search"><Search size={20} aria-hidden="true" /></button>
        <input aria-label="Search orders" value={draft} onChange={e => setDraft(e.target.value)} maxLength={120} enterKeyHint="search" placeholder="SO number, customer, invoice, PO or truck plate" />
      </form>
      <div className="ot-date" ref={dateBox}>
        <button type="button" className="ot-date-step" aria-label="Previous day" onClick={() => shift(-1)} disabled={!from}><ChevronLeft size={20} aria-hidden="true" /></button>
        <button type="button" className="ot-date-label" aria-expanded={dateOpen} aria-haspopup="dialog" aria-controls="ot-date-pop" onClick={() => setDateOpen(o => !o)}>
          <Calendar size={18} aria-hidden="true" /><span>{dateText}</span><span className="sr-only">, change dates</span>
        </button>
        <button type="button" className="ot-date-step" aria-label="Next day" onClick={() => shift(1)} disabled={!from}><ChevronRight size={20} aria-hidden="true" /></button>
        {dateOpen && <div className="ot-date-pop" id="ot-date-pop" role="dialog" aria-label="Choose dates">
          <label>From<input aria-label="From date" type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0); }} /></label>
          <label>To<input aria-label="To date" type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0); }} /></label>
          <p className="ot-date-hint">Up to 31 days.</p>
          <button type="button" className="ot-date-done" onClick={() => setDateOpen(false)}>Done</button>
        </div>}
      </div>
      <div className="ot-quick" role="group" aria-label="Quick filters">
        {QUICK.map(([key, title, tone]) => {
          const active = status === key;
          return <button type="button" key={key} className={`ot-q${active ? " ot-q-on" : ""}`} aria-pressed={active}
            onClick={() => { setStatus(key); setOffset(0); if (key === "all") { setFrom(today); setTo(today); } }}>
            {title}{active && list.data ? <span className={`ot-q-n ot-q-n-${tone}`}>{list.data.total}</span> : null}
          </button>;
        })}
      </div>
    </section>
    {invalidRange && <p role="alert" className="ot-invalid">Choose a valid date range of up to 31 days.</p>}

    <div className="ot-cols">
      <OrderList data={invalidRange ? undefined : list.data} loading={list.isLoading && !invalidRange} error={list.isError ? failure(list.error) : null} onRetry={() => void list.refetch()}
        selected={selected} isToday={isToday} ownOrdersOnly={ownOrdersOnly} hrefFor={hrefFor} onOpen={open}
        offset={offset} onPage={next => { setOffset(next); }} />
      {!phone && <div className="ot-card-col" ref={cardCol}>
        {selected ? cardBody : <div className="ot-card-empty"><p>Select an order to see its journey, proof and payment.</p></div>}
      </div>}
    </div>
  </div>;
}
