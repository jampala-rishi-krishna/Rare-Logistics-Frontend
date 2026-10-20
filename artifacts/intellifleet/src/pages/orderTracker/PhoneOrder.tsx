// Phone one-order screen (approved design: docs/design/order-tracker/Phone___one_order__Sales_on_the_go_.png).
// All values come from buildOrderView(); missing facts render the designed "Not recorded" states.
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Check, ChevronLeft, CircleQuestionMark, Clock, CreditCard, File, FileCheck, MapPin, Package,
  Send, ShieldAlert, ShieldCheck, StickyNote, TriangleAlert, Truck,
} from "lucide-react";
import type { Card } from "@/services/api/orderTracker";
import { buildOrderView } from "@/lib/orderTrackerView";
import type { JourneyStep, OrderView, RuleIcon, RuleItem, ViewTone } from "@/lib/orderTrackerView";
import { CallLogistics, Chip, Skeleton, statusTone } from "./ui";
import { TrackerMap } from "./TrackerMap";
import { ProofPhotos } from "./ProofPhotos";
import "./phone.css";

const RESULT = new Set(["Delivered", "Partly delivered", "Not delivered"]);
const STATE_TEXT: Record<JourneyStep["state"], string> = { done: "done", problem: "problem", current: "in progress", todo: "not yet" };

function StatusIcon({ status }: { status: string }) {
  const p = { size: 16, strokeWidth: 2.2, "aria-hidden": true } as const;
  if (status === "Delivered") return <Check {...p} />;
  if (status === "Partly delivered" || status === "Not delivered") return <TriangleAlert {...p} />;
  if (status === "Loaded" || status === "Not yet loaded") return <Package {...p} />;
  return <Truck {...p} />;
}

export function PhoneOrder({ card, onBack, onAsk }: { card: Card; onBack: () => void; onAsk: (question: string) => void }) {
  const v = buildOrderView(card);
  return (
    <div className="otp">
      <header className="otp-head">
        <div className="otp-bar">
          <button type="button" className="otp-back" onClick={onBack} aria-label="Back to orders"><ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" /></button>
          <span className="otp-bar-title">Order Tracker</span>
          <CallLogistics variant="light" iconOnly />
        </div>
        <h2 className="otp-number">{v.number}</h2>
        <div className="otp-customer">{v.customer}</div>
        <div className="otp-chip"><Chip tone={statusTone(v.status)} solid><StatusIcon status={v.status} />{v.status}</Chip></div>
      </header>

      <div className="otp-body">
        <WhereCard v={v} />
        <JourneyCard v={v} />
        <Tiles v={v} />
        <RulesCard v={v} />
        <ProofCard v={v} />
      </div>

      <AskBar onAsk={onAsk} />
    </div>
  );
}

function WhereCard({ v }: { v: OrderView }) {
  const active = v.status === "Out for delivery" || v.status === "Arrived" || v.status === "Loaded";
  const ev = v.lastEvent;
  return (
    <section className="otp-card otp-where" aria-label="Where the truck is">
      <TrackerMap gps={v.location.gps} lastEvent={null} reason={v.location.reason} emptyTitle={v.location.emptyTitle} height={170} variant="phone" />
      <div className="otp-where-foot">
        <div className="otp-where-main">
          {v.eta ? <>
            <div className="otp-label">Arrives around</div><div className="otp-big">{v.eta}</div><div className="otp-label">Estimate</div>
          </> : <>
            <div className="otp-label">{ev ? ev.label : "Last update"}</div>
            <div className={`otp-big${ev ? "" : " otp-muted"}`}>{ev ? ev.time : "—"}</div>
            <div className="otp-label">{active ? "Live ETA isn't available yet" : ev ? "Last recorded event" : "Nothing recorded yet"}</div>
          </>}
        </div>
        <div className="otp-where-side">
          <div className="otp-label">This order is</div>
          <div className={`otp-stop${v.stopText ? "" : " otp-muted"}`}>{v.stopText ?? "Stop not recorded"}</div>
        </div>
      </div>
    </section>
  );
}

function JourneyCard({ v }: { v: OrderView }) {
  const steps = v.journey;
  return (
    <section className="otp-card otp-pad" aria-labelledby="otp-journey">
      <h3 className="otp-h3" id="otp-journey">Journey</h3>
      <ol className="otp-steps">
        {steps.map((s, i) => {
          const next = steps[i + 1];
          const ink = next && next.state !== "todo";
          const muted = s.state === "todo";
          return (
            <li key={s.key} className={`otp-step otp-step-${s.state}`}>
              <div className="otp-rail">
                <span className={`otp-dot otp-dot-${s.state}`} aria-hidden="true">
                  {s.state === "done" ? <Check size={14} strokeWidth={3} /> : s.state === "problem" ? <b>!</b> : null}
                </span>
                {next && <span className={`otp-line${ink ? " otp-line-ink" : ""}`} aria-hidden="true" />}
              </div>
              <div className="otp-step-text">
                <div>
                  <b className={muted ? "otp-muted" : ""}>{s.phoneLabel}<span className="sr-only"> ({STATE_TEXT[s.state]})</span></b>
                  {s.sub && <div className="otp-step-sub">{s.sub}</div>}
                </div>
                <b className={`otp-step-time${s.state === "current" ? " otp-now" : muted ? " otp-muted" : ""}`}>{s.state === "current" ? "now" : s.time}</b>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Tile({ icon, title, word, sub, tone, dashed }: { icon: ReactNode; title: string; word: string; sub: ReactNode; tone?: ViewTone; dashed?: boolean }) {
  return (
    <div className={`otp-tile${dashed ? " otp-tile-dashed" : ""}`}>
      <div className={`otp-tile-head otp-tone-${dashed ? "unknown" : tone ?? "neutral"}`}>{icon}<b>{title}</b></div>
      <div className={`otp-tile-word otp-word-${dashed ? "unknown" : tone ?? "neutral"}`}>{word}</div>
      <div className="otp-tile-sub">{sub}</div>
    </div>
  );
}

function Tiles({ v }: { v: OrderView }) {
  const ic = { size: 18, strokeWidth: 2, "aria-hidden": true } as const;
  const p = v.payment, po = v.documents.po, l = v.loading;
  const loadMissing = l.tone === "unknown";
  return (
    <div className="otp-tiles">
      <Tile icon={<CreditCard {...ic} />} title="Payment" word={p.status === "Unknown" ? "Unknown" : p.status} sub={p.short}
        tone={p.status === "Unknown" ? "unknown" : p.status === "Paid" ? "positive" : p.status === "Partly paid" ? "warning" : "neutral"} dashed={p.status === "Unknown"} />
      <Tile icon={po ? <FileCheck {...ic} /> : <CircleQuestionMark {...ic} />} title="Client PO" word={po ? "Unverified" : "Not recorded"}
        sub={po ? `${po} · copy not verified` : "ask Logistics"} dashed={!po} />
      <Tile icon={l.tone === "positive" ? <ShieldCheck {...ic} /> : <ShieldAlert {...ic} />} title="Loading" word={l.word} sub={l.short}
        tone={l.tone === "positive" ? "positive" : l.tone === "warning" ? "warning" : "neutral"} dashed={loadMissing} />
      <Tile icon={<CircleQuestionMark {...ic} />} title="Permits" word="Not recorded" sub="ask Logistics" dashed />
    </div>
  );
}

const RULE_ICON: Record<RuleIcon, typeof Clock> = { clock: Clock, pin: MapPin, file: File, note: StickyNote };
function RuleRows({ items }: { items: RuleItem[] }) {
  return <ul className="otp-rules">{items.map((r, i) => { const Icon = RULE_ICON[r.icon]; return <li key={i}><Icon size={18} strokeWidth={2} aria-hidden="true" />{r.text}</li>; })}</ul>;
}

function RulesCard({ v }: { v: OrderView }) {
  const r = v.rules;
  return (
    <section className="otp-card otp-pad" aria-labelledby="otp-rules">
      <h3 className="otp-h3" id="otp-rules">Delivery rules</h3>
      {r.recorded.length > 0 && <RuleRows items={r.recorded} />}
      {r.soNotes.length > 0 && <><p className="otp-unverified">SO notes are unverified instructions</p><RuleRows items={r.soNotes} /></>}
      {r.message && <p className="otp-missing">Not recorded — {r.message.charAt(0).toLowerCase() + r.message.slice(1)}</p>}
    </section>
  );
}

function ProofCard({ v }: { v: OrderView }) {
  const photos = v.proof.photos;
  const delivered = RESULT.has(v.status);
  return (
    <section className="otp-card otp-pad" aria-labelledby="otp-proof">
      <div className="otp-card-head">
        <h3 className="otp-h3" id="otp-proof">Proof of delivery</h3>
        <span className="otp-label">{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"}` : delivered ? "No photos yet" : "after delivery"}</span>
      </div>
      <div className="otp-proof-grid"><ProofPhotos photos={photos} variant="phone" emptyHint={delivered ? "No photos yet" : "after delivery"} /></div>
      {photos.length > 0 && <p className="otp-small">{photos.map(p => p.caption).filter((c, i, all) => all.indexOf(c) === i).join(", ")} · checkout time; capture metadata may differ</p>}
    </section>
  );
}

function AskBar({ onAsk }: { onAsk: (question: string) => void }) {
  const [q, setQ] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    onAsk(text);
    setQ("");
  }
  return (
    <form className="otp-ask" onSubmit={submit} role="search" aria-label="Ask about this order">
      <label htmlFor="otp-ask-input" className="sr-only">Ask about this order</label>
      <input id="otp-ask-input" value={q} onChange={e => setQ(e.target.value)} maxLength={1000} placeholder="Ask about this order…" autoComplete="off" enterKeyHint="send" />
      <button type="submit" aria-label="Ask" disabled={!q.trim()}><Send size={20} strokeWidth={2.2} aria-hidden="true" /></button>
    </form>
  );
}

export function PhoneOrderSkeleton() {
  return (
    <div className="otp" aria-busy="true">
      <div className="otp-head">
        <div className="otp-bar"><span className="otp-back" /><span className="otp-bar-title">Order Tracker</span><span className="otp-back" /></div>
        <div className="otp-skel-stack"><Skeleton h={34} w={220} /><Skeleton h={20} w={180} /><Skeleton h={30} w={150} r={12} /></div>
      </div>
      <div className="otp-body">
        <div className="otp-card"><Skeleton h={170} r={0} /><div className="otp-pad otp-skel-stack"><Skeleton h={14} w={120} /><Skeleton h={40} w={140} /></div></div>
        <div className="otp-card otp-pad otp-skel-stack">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={36} />)}</div>
        <div className="otp-tiles">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={112} r={18} />)}</div>
      </div>
      <span className="sr-only" role="status">Loading order…</span>
    </div>
  );
}
