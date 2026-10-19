import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, MapPin, RefreshCw, Search, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMaps } from "@/components/maps/GoogleMaps";
import * as tracker from "@/services/api/orderTracker";
import { T } from "@/lib/themeTokens";
import "./orderTracker.css";

const titles: Record<string, string> = { status_now: "Status now", location: "Truck location", times: "Times", delivery_result: "Delivery result", proof: "Proof of delivery", payment: "Payment", documents: "Documents", customer_rules: "Customer delivery rules", loading_check: "Loading check", problems: "Problems & Logistics reply" };
const label = (key: string) => key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
export function manilaToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function clock(value: string | null) { if (!value) return "time not recorded"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "time not recorded" : d.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function failure(error: unknown) { return error instanceof Error ? error.message : "Could not load records. Please try again."; }
function Source({ fact }: { fact: Pick<tracker.Fact, "source" | "as_of"> }) { return <p className="ot-source">{fact.source} · as of {clock(fact.as_of)} · Manila time</p>; }

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="ot-missing">Not recorded</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (Array.isArray(value)) return value.length ? <div className="ot-values">{value.map((v, i) => <div className="ot-array-item" key={i}><Value value={v} /></div>)}</div> : <span className="ot-missing">Not recorded</span>;
  if (typeof value === "object") return <dl className="ot-facts">{Object.entries(value).map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd><Value value={v} /></dd></div>)}</dl>;
  const text = String(value);
  return <span>{/^\d{4}-\d{2}-\d{2}T/.test(text) ? clock(text) : text}</span>;
}

function TrackerMap({ lat, lng, plate }: { lat: number; lng: number; plate: string }) {
  const { api, error } = useMaps();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!api || !element.current) return;
    const map = new api.maps.Map(element.current, { center: { lat, lng }, zoom: 14, disableDefaultUI: true, zoomControl: true });
    const pin = new api.maps.Marker({ map, position: { lat, lng }, title: plate });
    return () => { pin.setMap(null); };
  }, [api, lat, lng, plate]);
  return <div><div className="ot-map" ref={element} aria-label={`Truck ${plate} map location`} role="img">{error ? <p>Map unavailable. Use the coordinates below or call Logistics.</p> : !api ? <p>Loading map…</p> : null}</div><p className="ot-source"><MapPin size={14} aria-hidden="true" /> {plate} · {lat.toFixed(5)}, {lng.toFixed(5)}</p></div>;
}

function ProofPhoto({ id, caption }: { id: number; caption: string }) {
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true, objectUrl = "";
    setError(false); setUrl("");
    tracker.photo(id).then(blob => { if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => active && setError(true));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, attempt]);
  return <figure className="ot-proof">{error ? <div role="status">Photo unavailable. <button className="ot-button" onClick={() => setAttempt(attempt + 1)}>Retry photo</button></div> : url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Open proof: ${caption}`}><img src={url} alt={caption} /></a> : <p role="status">Loading proof…</p>}<figcaption>{caption}</figcaption></figure>;
}

function FactSection({ name, fact }: { name: string; fact: tracker.Fact }) {
  const value = fact.value as Record<string, unknown> | null;
  const photos = (value?.photos ?? []) as Array<{ photo_id: number; order: string; captured_at: string; result: string; timestamp_basis?: string }>;
  return <section className="ot-section" aria-labelledby={`ot-section-${name}`}>
    <h3 id={`ot-section-${name}`}>{titles[name] ?? label(name)}</h3>
    {fact.message && <p className="ot-notice">{fact.message}</p>}
    {name === "location" && typeof value?.lat === "number" && typeof value?.lng === "number" && <TrackerMap lat={value.lat} lng={value.lng} plate={String(value.plate ?? "Truck")} />}
    {name === "proof" ? <>{photos.map(p => <ProofPhoto key={p.photo_id} id={p.photo_id} caption={`${p.order} · ${p.result ?? "result not recorded"} · ${clock(p.captured_at)} (${p.timestamp_basis ?? "recorded time"})`} />)}<Value value={{ signed_invoice: value?.officer_invoice }} /></> : <Value value={fact.value} />}
    <Source fact={fact} />
  </section>;
}

function AskBox({ filter, order }: { filter: tracker.Filter; order?: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<tracker.Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [vote, setVote] = useState<boolean | null>(null);
  const [voteMessage, setVoteMessage] = useState("");
  const [, navigate] = useLocation();
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (busy || question.trim().length < 3) return;
    setBusy(true); setError(""); setAnswer(null); setVote(null); setVoteMessage("");
    try { setAnswer(await tracker.ask(question.trim(), filter, order)); } catch (e) { setError(failure(e)); } finally { setBusy(false); }
  }
  async function rate(helpful: boolean) {
    if (!answer) return;
    try { await tracker.feedback(answer.answer_id, helpful); setVote(helpful); setVoteMessage("Feedback received."); } catch (e) { setVoteMessage(failure(e)); }
  }
  return <section className="ot-ask" aria-label={order ? "Ask about this order" : "Ask Order Tracker"}>
    <div className="ot-eyebrow">ASK ORDER TRACKER</div><h2>{order ? "Ask about this order" : "A question about your orders?"}</h2>
    <p>Answers from your accessible records, with sources. You can ask in English or Tagalog.</p>
    <form onSubmit={send}><label className="sr-only" htmlFor="ot-question">Your question</label><textarea id="ot-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} placeholder={order ? `What happened to ${order}?` : "Which of my orders were partly delivered?"} rows={2} /><button className="ot-button ot-primary" type="submit" disabled={busy || question.trim().length < 3}><Send size={17} aria-hidden="true" />{busy ? "Looking up records…" : "Ask"}</button></form>
    <div className="ot-suggestions">{(order ? ["Show proof of delivery", "Did we get paid?", "Who received this order?"] : ["Which orders were not delivered?", "Buyers per SKU today", "Do we have the client PO copy?"]).map(q => <button type="button" key={q} onClick={() => setQuestion(q)}>{q}</button>)}</div>
    {busy && <p role="status">Checking recorded facts. This can take up to 30 seconds.</p>}
    {error && <p role="alert" className="ot-notice">{error}</p>}
    {answer && <div className="ot-answer" aria-live="polite"><p>{answer.answer}</p>{answer.not_recorded && <p className="ot-notice">Some information is not recorded or available. Check the source details below.</p>}<ul>{answer.sources.map((s, i) => <li key={i}>{s.link ? <button className="ot-link" onClick={() => navigate(s.link!)}>{s.source}</button> : s.source} · as of {clock(s.as_of)}{s.not_recorded ? " · Not recorded" : ""}</li>)}</ul><div className="ot-votes"><span>Was this helpful?</span><button className="ot-button" aria-label="Helpful answer" aria-pressed={vote === true} disabled={vote !== null} onClick={() => void rate(true)}><ThumbsUp size={17} /></button><button className="ot-button" aria-label="Unhelpful answer" aria-pressed={vote === false} disabled={vote !== null} onClick={() => void rate(false)}><ThumbsDown size={17} /></button></div><p role="status">{voteMessage}</p></div>}
  </section>;
}

export default function OrderTracker() {
  const params = new URLSearchParams(useSearch());
  const selected = params.get("order");
  const today = manilaToday();
  const [from, setFrom] = useState(params.get("from") ?? today);
  const [to, setTo] = useState(params.get("to") ?? params.get("from") ?? today);
  const [draft, setDraft] = useState(""); const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all"); const [offset, setOffset] = useState(0);
  const [, navigate] = useLocation();
  const filter = { date_from: from, date_to: to, q: query, status, offset };
  const invalidRange = !from || !to || from > to || (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 30;
  const list = useQuery({ queryKey: ["order-tracker", from, to, query, status, offset], queryFn: () => tracker.findOrders(filter), enabled: !invalidRange && !selected, retry: false, refetchOnWindowFocus: false });
  const card = useQuery({ queryKey: ["order-tracker-card", selected, from, to], queryFn: () => tracker.getOrder(selected!, filter), enabled: !invalidRange && !!selected, retry: false, refetchOnWindowFocus: false });
  useEffect(() => { const first = params.get("from"), last = params.get("to"); if (first) setFrom(first); if (last) setTo(last); }, [selected, params.get("from"), params.get("to")]);
  function shift(days: number) { const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); const ymd = d.toISOString().slice(0, 10); setFrom(ymd); setTo(ymd); setOffset(0); }
  function open(number: string) { navigate(`/app/order-tracker?order=${encodeURIComponent(number)}&from=${from}&to=${to}`); }
  const data = card.data;
  return <div className="ot" style={{ color: T.ink }}>
    <header className="ot-header"><div><div className="ot-eyebrow">YOUR ORDERS, WITH THE RECORDS</div><h1>Order Tracker</h1><p>Find the order. See what happened. Check the proof.</p></div><button className="ot-button" onClick={() => void (selected ? card.refetch() : list.refetch())} disabled={invalidRange || card.isFetching || list.isFetching}><RefreshCw size={16} aria-hidden="true" />Refresh records</button></header>
    {!selected && <section className="ot-find" aria-label="Find orders"><form onSubmit={e => { e.preventDefault(); setQuery(draft); setOffset(0); }}><label htmlFor="ot-search">Find an order</label><div className="ot-search"><Search size={18} aria-hidden="true" /><input id="ot-search" value={draft} onChange={e => setDraft(e.target.value)} maxLength={120} placeholder="SO / TO, customer, invoice, PO or truck" /><button className="ot-button ot-primary" type="submit">Search</button></div></form><div className="ot-dates"><button className="ot-button" aria-label="Previous day" onClick={() => shift(-1)} disabled={!from}><ChevronLeft size={18} /></button><label>From<input aria-label="From date" type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0); }} /></label><label>To<input aria-label="To date" type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0); }} /></label><button className="ot-button" aria-label="Next day" onClick={() => shift(1)} disabled={!from}><ChevronRight size={18} /></button></div><div className="ot-chips">{[["all", "My orders today"], ["Out for delivery", "Out for delivery"], ["Delivered", "Delivered"], ["problems", "Problems"]].map(([key, title]) => <button className="ot-button" aria-pressed={status === key} key={key} onClick={() => { setStatus(key); setOffset(0); if (key === "all") { setFrom(today); setTo(today); } }}>{title}</button>)}</div></section>}
    {invalidRange && <p role="alert" className="ot-notice">Choose a valid date range of up to 31 days.</p>}
    {selected ? <><button className="ot-button ot-back" onClick={() => navigate(`/app/order-tracker?from=${from}&to=${to}`)}><ArrowLeft size={17} aria-hidden="true" />All orders</button>{card.isLoading && <p role="status">Loading order records…</p>}{card.isError && <p role="alert" className="ot-notice">{failure(card.error)}</p>}{data && <><header className="ot-card-heading"><div className="ot-eyebrow">ORDER 360 · {data.order_type}</div><h2>{data.number}</h2><p>{data.customer}</p><div className="ot-chips"><span className="ot-status">{data.status}</span><span>{data.truck ?? "Truck not recorded"}</span><span>{data.delivery_date}</span></div><p className="ot-source">Last record update: {clock(data.last_update)} · Call Logistics for help</p></header><div className="ot-card-layout"><div className="ot-card-sections">{Object.entries(data.sections).map(([name, fact]) => <FactSection key={name} name={name} fact={fact} />)}</div><aside><AskBox key={`${selected}-${from}-${to}`} filter={filter} order={selected} /></aside></div></>}</> : <><div className="ot-results-head"><h2>Order records</h2><span>{list.data ? `${list.data.total} found · ${list.data.scope}` : "Accessible records only"}</span></div>{list.isLoading && <p role="status">Loading your orders…</p>}{list.isError && <p role="alert" className="ot-notice">{failure(list.error)}</p>}{list.data && <><p className="ot-source">{list.data.coverage}</p>{list.data.orders.length ? <div className="ot-orders">{list.data.orders.map(row => <button className="ot-order" key={row.number} onClick={() => open(row.number)}><div><div className="ot-order-title"><strong>{row.number}</strong><span className="ot-type">{row.order_type}</span></div><p>{row.customer}</p><span className="ot-source">{row.delivery_date} · {row.truck ?? "Truck not recorded"}</span></div><div className="ot-order-result"><span className="ot-status">{row.status}</span><span>Payment: {row.payment}</span><span className="ot-source">Updated {clock(row.last_update)}</span></div><ArrowRight size={18} aria-hidden="true" /></button>)}</div> : <div className="ot-empty"><Search size={24} aria-hidden="true" /><h3>No matching cached orders</h3><p>Try another date or reference. If an order is missing, ask Logistics to check the assignment and your salesperson account mapping.</p></div>}<div className="ot-pages"><button className="ot-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><button className="ot-button" disabled={offset + 50 >= list.data.total} onClick={() => setOffset(offset + 50)}>Next</button></div></>}<AskBox key={`${from}-${to}`} filter={filter} /></>}
  </div>;
}
