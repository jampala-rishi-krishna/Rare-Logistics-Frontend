// Desktop Order 360 card (approved design: docs/design/order-tracker/Desktop___Orders___order_details.png, right panel).
// All values come from buildOrderView(); missing facts render the designed "Not recorded" states, never invented values.
import type { ReactNode } from "react";
import {
  Camera, Check, CircleCheck, CircleQuestionMark, Clock, CreditCard, File, FileCheck, ListChecks, MapPin,
  MessageCircleQuestionMark, Package, ShieldAlert, ShieldCheck, StickyNote, TriangleAlert, User,
} from "lucide-react";
import type { Card } from "@/services/api/orderTracker";
import { buildOrderView, explain } from "@/lib/orderTrackerView";
import type { DocRow, JourneyStep, OrderView, RuleIcon, RuleItem } from "@/lib/orderTrackerView";
import { CallLogistics, Chip, IconTile, PaymentChip, Skeleton, SourceLine, StatusChip } from "./ui";
import type { Tone } from "./ui";
import { TrackerMap } from "./TrackerMap";
import { ProofPhotos } from "./ProofPhotos";
import "./card.css";

const ICON = { size: 18, strokeWidth: 2, "aria-hidden": true } as const;
const STATE_TEXT: Record<JourneyStep["state"], string> = { done: "done", problem: "problem", current: "in progress", todo: "not yet" };

export function OrderCard({ card, onAsk }: { card: Card; onAsk: () => void }) {
  const v = buildOrderView(card);
  return (
    <section className="otk" aria-label={`Order ${v.number}`}>
      <Header v={v} onAsk={onAsk} />
      <Journey v={v} />
      <div className="otk-grid">
        <DeliveryResult v={v} />
        <Proof v={v} />
        <Payment v={v} />
        <Documents v={v} />
        <Rules v={v} />
        <Loading v={v} />
      </div>
    </section>
  );
}

function Header({ v, onAsk }: { v: OrderView; onAsk: () => void }) {
  return (
    <header className="otk-head">
      <div className="otk-head-main">
        <div className="otk-title-row"><h2 className="otk-number">{v.number}</h2><StatusChip status={v.status} size="lg" /></div>
        <div className="otk-customer">{v.customer}</div>
        {v.meta.length > 0 && <div className="otk-meta">{v.meta.join(" · ")}</div>}
      </div>
      <div className="otk-actions">
        <button type="button" className="ot-btn ot-btn-outline" onClick={onAsk}><MessageCircleQuestionMark {...ICON} />Ask about this order</button>
        <CallLogistics />
      </div>
    </header>
  );
}

function StepDot({ state }: { state: JourneyStep["state"] }) {
  return (
    <span className={`otk-dot otk-dot-${state}`} aria-hidden="true">
      {state === "done" ? <Check size={16} strokeWidth={3} /> : state === "problem" ? <b>!</b> : null}
    </span>
  );
}

function Journey({ v }: { v: OrderView }) {
  const steps = v.journey;
  return (
    <div className="otk-block otk-journey">
      <div className="otk-block-head">
        <h3 className="otk-h3">Journey</h3>
        <SourceLine source={`Source: ${v.journeySource}`} asOf={v.journeyAsOf ?? undefined} />
      </div>
      <ol className="otk-steps">
        {steps.map((s, i) => {
          const next = steps[i + 1];
          const ink = next && next.state !== "todo";
          const label = s.state === "current" ? s.phoneLabel : s.label;
          return (
            <li key={s.key} className={`otk-step otk-step-${s.state}`}>
              <div className="otk-track"><StepDot state={s.state} />{next && <span className={`otk-line${ink ? " otk-line-ink" : ""}`} aria-hidden="true" />}</div>
              <b className="otk-step-label">{label}<span className="sr-only"> ({STATE_TEXT[s.state]})</span></b>
              <div className={`otk-step-time${s.state === "current" ? " otk-now" : s.time === "—" ? " otk-muted" : ""}`}>{s.state === "current" ? "now" : s.time}</div>
              {s.sub && <div className="otk-step-sub">{s.sub}</div>}
            </li>
          );
        })}
      </ol>
      <div className="otk-where">
        <div className="otk-where-map">
          <TrackerMap gps={v.location.gps} lastEvent={v.location.lastEvent} reason={v.location.reason} emptyTitle={v.location.emptyTitle} height={200} variant="desk" />
        </div>
        <div className="otk-stats">
          {v.stats.map(s => (
            <div className="otk-stat" key={s.label}>
              <div className="otk-stat-label">{s.label}</div>
              <div className="otk-stat-value">{s.value}</div>
              <div className="otk-stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <SourceLine source={`Location: ${v.location.source}`} asOf={v.location.asOf ?? undefined} />
    </div>
  );
}

function Section({ icon, tone = "neutral", title, chip, children, foot }: { icon: ReactNode; tone?: Tone; title: string; chip?: ReactNode; children: ReactNode; foot: ReactNode }) {
  const id = `otk-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="otk-cell" aria-labelledby={id}>
      <div className="otk-cell-head">
        <IconTile tone={tone}>{icon}</IconTile>
        <h3 className="otk-h3" id={id}>{title}</h3>
        {chip && <span className="otk-cell-chip">{chip}</span>}
      </div>
      <div className="otk-cell-body">{children}</div>
      <div className="otk-cell-foot">{foot}</div>
    </section>
  );
}

function DeliveryResult({ v }: { v: OrderView }) {
  const d = v.delivery;
  return (
    <Section icon={<Package {...ICON} />} tone={d.recorded ? d.tone : "neutral"} title="Delivery result"
      foot={<SourceLine source={`Source: ${d.source}`} asOf={d.asOf ?? undefined} />}>
      {d.recorded && d.outcome
        ? <p className="otk-outcome">{d.outcome}</p>
        : <p className="otk-missing">Not recorded yet — the result shows here after the crew checks out at the store.</p>}
      {d.rejected && (
        <div className="otk-table" role="table" aria-label="Rejected items">
          <div className="otk-tr otk-th" role="row"><span role="columnheader">Item</span><span role="columnheader">Rejected</span></div>
          {d.rejected.map(r => <div className="otk-tr" role="row" key={r.item}><span role="cell" className="otk-strong">{r.item}</span><span role="cell" className="otk-neg">{r.quantity}</span></div>)}
        </div>
      )}
      {d.rejectedMissing && <div className="otk-dashed">Rejected quantities: <b>Not recorded</b></div>}
      {d.recorded && (
        <div className={`otk-receiver${d.receiver ? "" : " otk-muted"}`}>
          <User {...ICON} />
          {d.receiver ? <span>Received by <b>{d.receiver}</b>{d.receiverPosition ? `, ${d.receiverPosition}` : ""}</span> : <span>Received by: Not recorded</span>}
        </div>
      )}
    </Section>
  );
}

function Proof({ v }: { v: OrderView }) {
  const p = v.proof;
  const n = p.photos.length;
  return (
    <Section icon={<Camera {...ICON} />} title="Proof of delivery" chip={n ? <span className="otk-count">{n} photo{n === 1 ? "" : "s"}</span> : undefined}
      foot={<SourceLine source={`Source: ${p.source}`} asOf={p.asOf ?? undefined}>{n ? " · photo times are checkout time; capture metadata may differ" : null}</SourceLine>}>
      <ProofPhotos photos={p.photos} variant="desk" emptyHint="No photos yet" />
      {!n && p.message && <p className="otk-small-muted">{explain(p.message)}</p>}
    </Section>
  );
}

function Payment({ v }: { v: OrderView }) {
  const p = v.payment;
  const owing = p.balance && p.balance !== "₱0";
  const boxTone = p.status === "Unknown" ? "unknown" : p.matches === false || p.status !== "Paid" ? "warning" : "positive";
  return (
    <Section icon={<CreditCard {...ICON} />} tone={p.tone} title="Payment" chip={<PaymentChip status={p.status} size="md" />}
      foot={<SourceLine source={`Source: ${p.source}`} asOf={p.asOf ?? undefined} />}>
      <div className="otk-money">
        <div><div className="otk-money-label">Invoice total</div><div className={`otk-money-value${p.total ? "" : " otk-muted"}`}>{p.total ?? "—"}</div></div>
        <div><div className="otk-money-label">Paid</div><div className={`otk-money-value${p.paid ? " otk-pos" : " otk-muted"}`}>{p.paid ?? "—"}</div></div>
        <div><div className="otk-money-label">Balance</div><div className={`otk-money-value${!p.balance ? " otk-muted" : owing ? " otk-neg" : ""}`}>{p.balance ?? "—"}</div></div>
      </div>
      <p className={`otk-note otk-note-${boxTone}`}>{p.note}</p>
    </Section>
  );
}

function DocIcon({ state }: { state: DocRow["state"] }) {
  if (state === "verified") return <CircleCheck size={20} strokeWidth={2} className="otk-pos" aria-hidden="true" />;
  if (state === "problem") return <TriangleAlert size={20} strokeWidth={2} className="otk-neg" aria-hidden="true" />;
  return <CircleQuestionMark size={20} strokeWidth={2} className="otk-muted" aria-hidden="true" />;
}

function Documents({ v }: { v: OrderView }) {
  const d = v.documents;
  return (
    <Section icon={<FileCheck {...ICON} />} title="Documents" foot={<SourceLine source={`Source: ${d.source}`} asOf={d.asOf ?? undefined} />}>
      <ul className="otk-docs">
        {d.rows.map(r => (
          <li key={r.key} className={`otk-doc otk-doc-${r.state}`}>
            <DocIcon state={r.state} />
            <div><b>{r.title}</b><div className="otk-doc-detail">{r.detail}</div></div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const RULE_ICON: Record<RuleIcon, typeof Clock> = { clock: Clock, pin: MapPin, file: File, note: StickyNote };
function RuleList({ items }: { items: RuleItem[] }) {
  return (
    <ul className="otk-rules">
      {items.map((r, i) => { const Icon = RULE_ICON[r.icon]; return <li key={i}><Icon {...ICON} />{r.text}</li>; })}
    </ul>
  );
}

function Rules({ v }: { v: OrderView }) {
  const r = v.rules;
  return (
    <Section icon={<ListChecks {...ICON} />} title="Customer delivery rules" foot={<SourceLine source={`Source: ${r.source}`} asOf={r.asOf ?? undefined} />}>
      {r.recorded.length > 0 && <RuleList items={r.recorded} />}
      {r.soNotes.length > 0 && <><p className="otk-label-unverified">SO notes are unverified instructions</p><RuleList items={r.soNotes} /></>}
      {r.message && <p className="otk-missing">Not recorded — {r.message.charAt(0).toLowerCase() + r.message.slice(1)}</p>}
    </Section>
  );
}

function Loading({ v }: { v: OrderView }) {
  const l = v.loading;
  const Icon = l.tone === "positive" ? ShieldCheck : ShieldAlert;
  return (
    <Section icon={<Icon {...ICON} />} tone={l.tone} title="Loading check" chip={<Chip tone={l.tone} size="md">{l.chip}</Chip>}
      foot={<SourceLine source={`Source: ${l.source} · ${l.problemsSource}`} asOf={l.asOf ?? undefined} />}>
      <p className={l.summary ? "otk-text" : "otk-missing"}>{l.summary ?? "Not recorded — no loading check or crew acknowledgement in Tracker memory."}</p>
      {l.checklist.length > 0 && (
        <dl className="otk-checklist">{l.checklist.map(c => <div key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}</dl>
      )}
      {l.note && <p className="otk-small-muted">{l.note}</p>}
      {l.problems.map((p, i) => (
        <div className="otk-problem" key={i}>
          <TriangleAlert {...ICON} />
          <div>
            <b>{p.title}</b>{p.status && <span className="otk-problem-status"> ({p.status})</span>}
            {p.description && <div className="otk-problem-desc">{p.description}</div>}
            <div className="otk-problem-reply">{p.reply}</div>
          </div>
        </div>
      ))}
      {l.problemsMessage && <p className="otk-small-muted">{l.problemsMessage}</p>}
    </Section>
  );
}

export function OrderCardSkeleton() {
  return (
    <section className="otk" aria-busy="true" aria-label="Loading order">
      <div className="otk-head">
        <div className="otk-head-main otk-skel-stack"><Skeleton h={34} w={260} /><Skeleton h={20} w={200} /><Skeleton h={16} w={360} /></div>
        <div className="otk-actions"><Skeleton h={48} w={200} r={12} /><Skeleton h={48} w={150} r={12} /></div>
      </div>
      <div className="otk-block">
        <Skeleton h={20} w={100} />
        <div className="otk-steps otk-skel-steps">{[0, 1, 2, 3, 4].map(i => <div key={i} className="otk-skel-stack"><Skeleton h={32} w={32} r={16} /><Skeleton h={14} w="70%" /><Skeleton h={22} w={60} /></div>)}</div>
        <div className="otk-where"><div className="otk-where-map"><Skeleton h={200} r={16} /></div><div className="otk-stats"><Skeleton h={94} r={16} /><Skeleton h={94} r={16} /></div></div>
      </div>
      <div className="otk-grid">{[0, 1, 2, 3, 4, 5].map(i => <div className="otk-cell otk-skel-stack" key={i}><Skeleton h={40} w={180} r={12} /><Skeleton h={16} /><Skeleton h={16} w="80%" /><Skeleton h={60} r={12} /></div>)}</div>
      <span className="sr-only" role="status">Loading order details…</span>
    </section>
  );
}
