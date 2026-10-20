// Ask thread view of the Order Tracker (approved design: docs/design/order-tracker/Desktop___Ask__AI_answers_with_sources_.png).
// Read-only: answers come from POST /api/order-tracker/ask; blocks are server-built from tool results only.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import * as tracker from "@/services/api/orderTracker";
import type { Answer, AnswerBlock, Filter } from "@/services/api/orderTracker";
import { SectionError, Skeleton, hhmm } from "./ui";
import { AnswerBlocks, NotRecorded, headlineChip, safeLink } from "./AnswerBlocks";
import "./ask.css";

const MIN = 3, MAX = 1000;

interface Turn {
  key: number;
  question: string;
  state: "busy" | "done" | "error";
  answer?: Answer;
  error?: string;
  vote?: boolean | null;
  voteMessage?: string;
}

function failure(error: unknown) { return error instanceof Error && error.message ? error.message : "Could not load records. Please try again."; }

/** First line (or first sentence) = the model's one-line answer; the rest is shown as body text. Never parsed for numbers. */
export function splitAnswer(text: string): [string, string] {
  const clean = (text ?? "").trim();
  const nl = clean.indexOf("\n");
  if (nl > 0) return [clean.slice(0, nl).trim(), clean.slice(nl + 1).trim()];
  const m = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(clean);
  return m ? [m[1], m[2].trim()] : [clean, ""];
}

function latest(values: Array<string | null>): string | null {
  let best: string | null = null, bestT = -Infinity;
  for (const v of values) { if (!v) continue; const t = new Date(v).getTime(); if (!Number.isNaN(t) && t > bestT) { bestT = t; best = v; } }
  return best;
}

function AnswerCard({ turn, onOpenOrder, onVote }: { turn: Turn; onOpenOrder: (n: string) => void; onVote: (helpful: boolean) => void }) {
  const [, navigate] = useLocation();
  const answer = turn.answer!;
  const blocks: AnswerBlock[] = Array.isArray(answer.blocks) ? answer.blocks : [];
  const sources = Array.isArray(answer.sources) ? answer.sources : [];
  const names = [...new Set(sources.map(s => s.source).filter(Boolean))];
  const asOf = latest(sources.map(s => s.as_of));
  const linked = sources.filter(s => safeLink(s.link));
  const [headline, rest] = splitAnswer(answer.answer);
  const notRecorded = blocks.filter((b): b is Extract<AnswerBlock, { type: "not_recorded" }> => b.type === "not_recorded");
  const whole = notRecorded.length > 0 && notRecorded.length === blocks.length;
  const chip = headlineChip(blocks);
  const lang = answer.language === "tl" ? "tl" : undefined;

  // Answers that list orders keep the divided footer of the design; short answers (tiles, bars) keep the source line
  // directly under the content with the feedback buttons beside it.
  const listy = blocks.some(b => b.type === "order_table" || b.type === "actions");
  const footer = <div className={names.length || linked.length ? (listy ? "otq-foot" : "otq-foot otq-foot-compact") : "otq-foot otq-foot-bare"}>
    <div className="otq-foot-src">
      {names.length > 0 && <p className="ot-src">{names.length > 1 ? "Sources" : "Source"}: {names.join(" · ")} · as of {hhmm(asOf)}{sources.some(s => s.not_recorded) ? " · some facts not recorded" : ""}</p>}
      {linked.length > 0 && <p className="otq-links"><span>Open record:</span>{linked.map((s, i) => <button type="button" key={`${s.source}-${i}`} className="otq-link" onClick={() => navigate(safeLink(s.link)!)}>{s.source}</button>)}</p>}
    </div>
    <p className="otq-vote-msg" role="status">{turn.voteMessage ?? ""}</p>
    <div className="otq-votes">
      <button type="button" className="otq-vote" aria-label="Helpful answer" aria-pressed={turn.vote === true} disabled={turn.vote != null} onClick={() => onVote(true)}><ThumbsUp size={18} strokeWidth={2} aria-hidden="true" /></button>
      <button type="button" className="otq-vote" aria-label="Unhelpful answer" aria-pressed={turn.vote === false} disabled={turn.vote != null} onClick={() => onVote(false)}><ThumbsDown size={18} strokeWidth={2} aria-hidden="true" /></button>
    </div>
  </div>;

  if (whole) {
    const extra = [headline, rest].filter(Boolean).join(" ");
    // The answer text usually repeats the block ("Not recorded. <message>"): show it only when it adds something.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const showExtra = extra && !notRecorded.some(b => { const e = norm(extra); return e === norm(b.message) || e === norm(b.title) || e === norm(`${b.title} ${b.message}`) || norm(b.message).includes(e) || e.includes(norm(b.message)); });
    return <div className="otq-card otq-card-dashed" lang={lang}>
      {notRecorded.map((b, i) => <NotRecorded key={i} block={b} whole extra={i === 0 && showExtra ? extra : undefined} />)}
      {footer}
    </div>;
  }
  return <div className="otq-card" lang={lang}>
    <div className="otq-head">{chip}<p className="otq-headline">{headline || "No answer text was returned."}</p></div>
    {rest && <p className="otq-rest">{rest}</p>}
    {answer.not_recorded && !notRecorded.length && <p className="otq-note">Some information is not recorded or available. Check the source details below.</p>}
    <AnswerBlocks blocks={blocks} headline={headline} footerSources={names} onOpenOrder={onOpenOrder} />
    {footer}
  </div>;
}

function BusyCard() {
  return <div className="otq-card otq-card-busy">
    <p className="otq-busy-text" role="status">Checking recorded facts. This can take up to 30 seconds.</p>
    <Skeleton h={26} w="58%" />
    <div className="otq-skel-gap"><Skeleton h={120} r={14} /></div>
    <div className="otq-skel-gap"><Skeleton h={14} w="40%" /></div>
  </div>;
}

export function AskThread({ filter, order, seed, onBack, onOpenOrder }: { filter: Filter; order?: string | null; seed: { question: string; id: number } | null; onBack: () => void; onOpenOrder: (number: string) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const nextKey = useRef(1);
  const lastSeed = useRef<number | null>(null);
  const turnRefs = useRef(new Map<number, HTMLElement>());
  const scrollTo = useRef<number | null>(null);
  const filterRef = useRef(filter); filterRef.current = filter;
  const orderRef = useRef(order); orderRef.current = order;
  const busy = turns.some(t => t.state === "busy");

  const patch = (key: number, change: Partial<Turn>) => setTurns(all => all.map(t => (t.key === key ? { ...t, ...change } : t)));

  async function run(key: number, question: string) {
    patch(key, { state: "busy", error: undefined, answer: undefined, vote: null, voteMessage: "" });
    try {
      const answer = await tracker.ask(question, filterRef.current, orderRef.current ?? undefined);
      patch(key, { state: "done", answer });
    } catch (e) { patch(key, { state: "error", error: failure(e) }); }
  }
  function send(text: string) {
    const question = text.trim().slice(0, MAX);
    if (question.length < MIN) return false;
    const key = nextKey.current++;
    // The first question stays below the page heading; later ones scroll into view.
    scrollTo.current = key > 1 ? key : null;
    setTurns(all => [...all, { key, question, state: "busy", vote: null, voteMessage: "" }]);
    void run(key, question);
    return true;
  }
  async function vote(turn: Turn, helpful: boolean) {
    if (!turn.answer || turn.vote != null) return;
    try { await tracker.feedback(turn.answer.answer_id, helpful); patch(turn.key, { vote: helpful, voteMessage: "Feedback received." }); }
    catch (e) { patch(turn.key, { voteMessage: failure(e) }); }
  }

  useEffect(() => {
    if (!seed || lastSeed.current === seed.id) return;
    lastSeed.current = seed.id;
    send(seed.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.id]);

  useEffect(() => {
    const key = scrollTo.current;
    if (key == null) return;
    const el = turnRefs.current.get(key);
    if (!el) return;
    scrollTo.current = null;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [turns]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (send(draft)) setDraft("");
  }

  return <div className="otq">
    <button type="button" className="otq-back" onClick={onBack}><ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />Back to orders</button>
    <h1 className="otq-title">Ask</h1>
    <p className="otq-sub">Answers come only from platform records. Every answer shows where it came from and how fresh it is.</p>
    {order && <p className="otq-scope">About order {order}</p>}

    {turns.map(turn => <article className="otq-turn" key={turn.key} ref={el => { if (el) turnRefs.current.set(turn.key, el); else turnRefs.current.delete(turn.key); }} aria-label={`Question: ${turn.question}`}>
      <div className="otq-q-row"><p className="otq-q">{turn.question}</p></div>
      <div className="otq-a" aria-live="polite" aria-busy={turn.state === "busy"}>
        {turn.state === "busy" && <BusyCard />}
        {turn.state === "error" && <div className="otq-card"><SectionError message={turn.error ?? "Could not load records. Please try again."} onRetry={busy ? undefined : () => void run(turn.key, turn.question)} /></div>}
        {turn.state === "done" && turn.answer && <AnswerCard turn={turn} onOpenOrder={onOpenOrder} onVote={helpful => void vote(turn, helpful)} />}
      </div>
    </article>)}

    <form className="otq-bar-form" onSubmit={submit}>
      <label className="otq-sr" htmlFor="otq-input">Ask another question</label>
      <input id="otq-input" className="otq-input" type="text" value={draft} maxLength={MAX} autoComplete="off" onChange={e => setDraft(e.target.value)} placeholder="Ask another question about your orders…" />
      <button type="submit" className="otq-send" disabled={busy || draft.trim().length < MIN}><Send size={19} strokeWidth={2.2} aria-hidden="true" />{busy ? "Looking up records…" : "Ask"}</button>
    </form>
    <p className="otq-foot-note">Ask looks things up only. To change an order, contact Logistics.</p>
  </div>;
}

export default AskThread;
