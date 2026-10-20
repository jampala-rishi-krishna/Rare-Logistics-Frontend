// PURE view-model for the Order Tracker order card (desktop) and one-order phone screen.
// Input: the backend Order 360 card (backend/services/order_tracker.py order_card()). Output: display-ready strings.
// Rules: never invent a value. Backend strings that start with "Not recorded" are explanations, not values -> null here,
// and the UI shows the designed "Not recorded" state. Importable from node (type-only imports, no "@/" values).
import type { Card, Fact } from "../services/api/orderTracker";

export type StepState = "done" | "problem" | "current" | "todo";
export type ViewTone = "neutral" | "info" | "positive" | "warning" | "negative" | "pending" | "unknown";
export type RuleIcon = "clock" | "pin" | "file" | "note";

export interface JourneyStep {
  key: "loaded" | "left" | "arrived" | "result" | "invoice";
  label: string;
  /** Phone wording for the same step (e.g. "On the way to you" while it is the current step). */
  phoneLabel: string;
  state: StepState;
  /** Manila HH:MM, or "—". */
  time: string;
  at: string | null;
  sub: string | null;
}
export interface Gps { plate: string; lat: number; lng: number; fixAt: string | null; ago: string; coords: string }
export interface LastEvent { label: string; time: string; at: string | null }
export interface LocationView {
  gps: Gps | null;
  /** Shown when there is no safe GPS fix. */
  emptyTitle: string;
  /** Backend explanation (stale / unmapped / not on trip), when present. */
  reason: string | null;
  lastEvent: LastEvent | null;
  source: string; asOf: string | null;
}
export interface StatBox { label: string; value: string; sub: string }
export interface RejectedRow { item: string; quantity: string }
export interface DeliveryView {
  recorded: boolean;
  outcome: string | null;
  reason: string | null;
  rejected: RejectedRow[] | null;
  /** True when the result is partial / not delivered and no validated item quantities exist. */
  rejectedMissing: boolean;
  receiver: string | null;
  receiverPosition: string | null;
  message: string | null;
  tone: ViewTone;
  source: string; asOf: string | null;
}
export interface PhotoView { id: number; label: string; caption: string; basis: string; alt: string }
export interface ProofView { photos: PhotoView[]; message: string | null; source: string; asOf: string | null }
export interface PaymentView {
  status: string; tone: ViewTone;
  /** Note box tone: warning ONLY when paid + balance don't add up to the total; positive when paid in full and matching;
   *  neutral when the amounts match but a balance remains; unknown when payment is not recorded. */
  noteTone: "warning" | "positive" | "neutral" | "unknown";
  total: string | null; paid: string | null; balance: string | null;
  matches: boolean | null;
  note: string;
  /** Phone tile second line. */
  short: string;
  source: string; asOf: string | null;
}
export interface DocRow { key: "po" | "invoice" | "permits"; title: string; detail: string; state: "verified" | "unverified" | "problem" | "missing" }
export interface DocsView { po: string | null; rows: DocRow[]; source: string; asOf: string | null }
export interface RuleItem { text: string; icon: RuleIcon; verified: boolean }
export interface RulesView { recorded: RuleItem[]; soNotes: RuleItem[]; message: string | null; source: string; asOf: string | null }
export interface ProblemView { title: string; description: string | null; reply: string; status: string | null }
export interface LoadingView {
  chip: string; tone: ViewTone;
  /** Phone tile big word + sub line. */
  word: string; short: string;
  summary: string | null;
  checklist: Array<{ label: string; value: string }>;
  note: string | null;
  problems: ProblemView[];
  problemsMessage: string | null;
  source: string; asOf: string | null;
  problemsSource: string; problemsAsOf: string | null;
}
export interface OrderView {
  number: string; status: string; tone: ViewTone; customer: string; meta: string[];
  truck: string | null; lastUpdate: string | null;
  journey: JourneyStep[]; journeySource: string; journeyAsOf: string | null;
  location: LocationView;
  stats: [StatBox, StatBox];
  /** "Stop 3 of 5" for this order on the truck's trip, or null. */
  stopText: string | null;
  /** Always null today: no calibrated ETA exists. */
  eta: string | null;
  lastEvent: LastEvent | null;
  delivery: DeliveryView; proof: ProofView; payment: PaymentView; documents: DocsView; rules: RulesView; loading: LoadingView;
}

// ---- small pure helpers (Manila time; mirror of pages/orderTracker/ui.tsx formatters, which are not node-importable) ----
const HM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false });
const DM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short" });
const parse = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
export const hm = (value: unknown): string => { const d = parse(value); return d ? HM.format(d) : "—"; };
export const dm = (value: unknown): string => { const d = parse(value); return d ? `${DM.format(d)} · ${HM.format(d)}` : "—"; };
/** A date-only "14 Oct" from "2026-10-14" or an ISO stamp. */
const dayOnly = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+08:00`) : parse(value);
  return d && !Number.isNaN(d.getTime()) ? DM.format(d) : null;
};
export function agoText(value: unknown, now = Date.now()): string {
  const d = parse(value);
  if (!d) return "time unknown";
  const min = Math.max(0, Math.round((now - d.getTime()) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
export function pesoText(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
/** Backend "Not recorded - ..." strings, empty values and non-strings are not values. */
export const missing = (value: unknown): boolean =>
  value === null || value === undefined || value === "" || (typeof value === "string" && /^not recorded/i.test(value.trim()));
const str = (value: unknown): string | null => (typeof value === "string" && !missing(value) ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : null);
const obj = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
const EMPTY_FACT: Fact = { source: "Not in this record", as_of: null, state: "not_recorded", value: null, message: null };
const section = (card: Card, key: string): Fact => card.sections?.[key] ?? EMPTY_FACT;
const val = (fact: Fact): Record<string, unknown> => obj(fact.value) ?? {};
/** "Not recorded - why" -> "why" (capitalised); null when empty. */
export const explain = (message: unknown): string | null => {
  if (typeof message !== "string" || !message.trim()) return null;
  const text = message.trim().replace(/^not recorded(?: as [^-—:]+)?\s*[-—:]\s*/i, "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
};
const humanKey = (key: string) => key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

const STATUS_TONE: Record<string, ViewTone> = {
  "Not yet loaded": "pending", Loaded: "neutral", "Out for delivery": "info", Arrived: "info",
  Delivered: "positive", "Partly delivered": "warning", "Not delivered": "negative", "Back at warehouse": "neutral",
};
const PAY_TONE: Record<string, ViewTone> = { Paid: "positive", "Partly paid": "warning", Unpaid: "neutral" };
const RESULTS = new Set(["Delivered", "Partly delivered", "Not delivered"]);
const ACTIVE = new Set(["Out for delivery", "Arrived"]);

/** Officer invoice record: proof.value.officer_invoice, else loading_check.value.officer_invoice. */
function officerInvoice(card: Card): Record<string, unknown> | null {
  return obj(val(section(card, "proof")).officer_invoice) ?? obj(val(section(card, "loading_check")).officer_invoice);
}

function rejectedRows(value: unknown): RejectedRow[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const rows: RejectedRow[] = [];
  for (const item of value) {
    const o = obj(item);
    const sku = str(o?.sku), qty = str(o?.quantity), unit = str(o?.unit);
    if (!sku || qty === null || !unit || !Number.isFinite(Number(qty))) return null; // only fully validated lists
    rows.push({ item: sku, quantity: `${Number(qty).toLocaleString("en-PH")} ${unit}` });
  }
  return rows;
}
function rejectedSummary(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const rows = rejectedRows(value);
  if (!rows) return null;
  const units = new Set(value.map(v => str(obj(v)?.unit)));
  if (units.size === 1) {
    const total = value.reduce((sum: number, v) => sum + Number(str(obj(v)?.quantity)), 0);
    return `${total.toLocaleString("en-PH")} ${[...units][0]} rejected`;
  }
  return `${rows.length} items with rejections`;
}

/** Icon for one delivery-rule line. Place words win (a "Receiving Bay" is a place, not a time), then documents, then times. */
export function ruleIcon(text: string): RuleIcon {
  const t = text.toLowerCase();
  if (/\b(gate|bay|dock|entrance|door|back|pin|park(ing)?|address|location|floor|building|landmark|route|ramp)\b/.test(t)) return "pin";
  if (/\bcop(y|ies)\b|\bdr\b|\bpo\b|\binvoices?\b|\bdocuments?\b|\bpermits?\b|\breceipts?\b|\bforms?\b|\bsign(ed|ature)?\b|\bbring\b/.test(t)) return "file";
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm|nn|noon)\b|\b\d{1,2}:\d{2}\b|\bnoon\b|receiv|\bhours?\b|cut-?off|\bopens?\b|\bclose[sd]?\b|\buntil\b|\bbefore\b|\bafter\b|\bmornings?\b|\bafternoons?\b|\btime\b/.test(t)) return "clock";
  return "note";
}
function splitNotes(notes: unknown, verified: boolean): RuleItem[] {
  const text = str(notes);
  if (!text) return [];
  return text.split(/\r?\n|;|(?<=\.)\s+(?=[A-Z])/).map(s => s.trim().replace(/^[-•*]\s*/, "")).filter(Boolean).slice(0, 6)
    .map(s => ({ text: s, icon: ruleIcon(s), verified }));
}

export function buildOrderView(card: Card, now: number = Date.now()): OrderView {
  const status = card.status || "Status unavailable";
  const times = section(card, "times"), tv = val(times);
  const statusNow = val(section(card, "status_now"));
  const result = section(card, "delivery_result"), rv = val(result);
  const proofFact = section(card, "proof");
  const payFact = section(card, "payment"), pv = val(payFact);
  const docsFact = section(card, "documents"), dv = val(docsFact);
  const rulesFact = section(card, "customer_rules"), cv = val(rulesFact);
  const loadFact = section(card, "loading_check"), lv = val(loadFact);
  const probFact = section(card, "problems");
  const locFact = section(card, "location"), locv = obj(locFact.value);
  const invoice = officerInvoice(card);
  const truck = str(card.truck) ?? str(statusNow.truck);

  // ---- header ----
  const invoiceDr = str(rv.invoice_dr) ?? str(invoice?.number) ?? str(pv.invoice_number);
  const po = str(dv.client_po_number);
  const meta = [str(card.area), invoiceDr && `Invoice/DR ${invoiceDr}`, po && `Client PO ${po}`].filter((x): x is string => !!x);

  // ---- journey ----
  const ackAt = str(tv.acknowledged_at), ackBy = str(tv.acknowledged_by);
  const left = str(tv.left_warehouse), arrived = str(tv.arrived), checkout = str(tv.checkout_at);
  const isResult = RESULTS.has(status);
  const resultSub = isResult
    ? status === "Delivered" ? null : rejectedSummary(rv.rejected_items) ?? str(rv.reason)
    : "photo + invoice will show here";
  const invAt = str(invoice?.checked_at);
  const invStatus = str(invoice?.status)?.toLowerCase() ?? null;
  const invProblem = invStatus === "missing" || invStatus === "discrepancy";
  const steps: JourneyStep[] = [
    { key: "loaded", label: "Loaded", phoneLabel: "Loaded", state: ackAt ? "done" : "todo", time: hm(ackAt), at: ackAt, sub: ackBy ? `by ${ackBy}` : ackAt ? "by crew (name not recorded)" : null },
    { key: "left", label: "Left warehouse", phoneLabel: "Left warehouse", state: left ? "done" : "todo", time: hm(left), at: left, sub: truck },
    { key: "arrived", label: "Arrived", phoneLabel: "Arrived", state: arrived ? "done" : "todo", time: hm(arrived), at: arrived, sub: null },
    { key: "result", label: isResult ? status : "Delivered", phoneLabel: isResult ? status : "Delivered",
      state: isResult ? (status === "Delivered" ? "done" : "problem") : "todo", time: isResult ? hm(checkout) : "—", at: isResult ? checkout : null, sub: resultSub },
    { key: "invoice", label: "Invoice back", phoneLabel: "Invoice back",
      state: invAt ? (invProblem ? "problem" : invStatus === "received" ? "done" : "todo") : "todo",
      time: invAt ? hm(invAt) : "—", at: invAt,
      sub: invAt ? (invStatus === "received" ? "checked by Logistics" : invProblem ? `invoice ${invStatus}` : `status: ${invStatus ?? "not recorded"}`)
        : ACTIVE.has(status) ? "truck still on trip" : "Not recorded" },
  ];
  // While the truck is on the way, the first unfinished step is "now".
  if (ACTIVE.has(status)) {
    const next = steps.find(s => s.state === "todo");
    if (next) {
      next.state = "current";
      if (next.key === "arrived") {
        next.phoneLabel = "On the way to you";
        next.sub = null;
      }
    }
  }
  const lastDone = [...steps].reverse().find(s => (s.state === "done" || s.state === "problem") && s.at);
  const lastEvent: LastEvent | null = lastDone ? { label: lastDone.label, time: lastDone.time, at: lastDone.at } : null;

  // ---- location ----
  const lat = locv?.lat, lng = locv?.lng;
  const safe = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && locv?.stale === false;
  const plate = str(locv?.plate) ?? truck ?? "Truck";
  const gps: Gps | null = safe ? { plate, lat: lat as number, lng: lng as number, fixAt: locFact.as_of, ago: agoText(locFact.as_of, now), coords: `${(lat as number).toFixed(5)}, ${(lng as number).toFixed(5)}` } : null;
  const location: LocationView = {
    gps, emptyTitle: "Live location shows only while the truck is on the way to this order",
    // The "only while on an active trip" explanation repeats the empty-state title; keep only other reasons (stale GPS etc.).
    reason: gps || /^live location unavailable/i.test(locFact.message ?? "") ? null : explain(locFact.message),
    lastEvent, source: locFact.source, asOf: locFact.as_of,
  };

  // ---- stat boxes ----
  const stop = typeof statusNow.stop === "number" ? statusNow.stop : null;
  const total = typeof statusNow.total_stops === "number" && statusNow.total_stops > 0 ? statusNow.total_stops : null;
  const stopText = stop !== null ? (total ? `Stop ${stop} of ${total}` : `Stop ${stop}`) : null;
  const stats: [StatBox, StatBox] = [
    { label: "This order on the trip", value: stopText ?? "Stop not recorded", sub: truck ? `Truck ${truck}` : "Truck not recorded" },
    { label: "Your order", value: isResult && checkout ? `Done at ${hm(checkout)}` : status, sub: "Truck back — not estimated yet" },
  ];

  // ---- delivery result ----
  const recorded = !result.message && !!checkout;
  const rejected = rejectedRows(rv.rejected_items);
  const outcomeWord = isResult ? status : str(rv.outcome);
  const reason = str(rv.reason);
  const delivery: DeliveryView = {
    recorded,
    outcome: outcomeWord ? (reason ? `${outcomeWord} — ${reason}` : outcomeWord) : null,
    reason, rejected,
    rejectedMissing: (status === "Partly delivered" || status === "Not delivered") && !rejected,
    receiver: str(rv.receiver), receiverPosition: str(rv.receiver_position),
    message: result.message,
    tone: isResult ? STATUS_TONE[status] : "neutral",
    source: result.source, asOf: checkout ?? result.as_of,
  };

  // ---- proof photos ----
  const rawPhotos = Array.isArray(val(proofFact).photos) ? val(proofFact).photos as unknown[] : [];
  const photos: PhotoView[] = rawPhotos.map(p => obj(p)).filter((p): p is Record<string, unknown> => !!p && typeof p.photo_id === "number")
    .map((p, i) => {
      // The backend does not say what each photo shows (no per-photo label), so name them by position only.
      const label = rawPhotos.length > 1 ? `Photo ${i + 1}` : "Delivery photo";
      const caption = dm(p.captured_at);
      return { id: p.photo_id as number, label, caption, basis: str(p.timestamp_basis) ?? "checkout time; capture metadata may differ", alt: `${str(p.order) ?? card.number} · ${label} · ${caption}` };
    });
  const proof: ProofView = { photos, message: proofFact.message, source: proofFact.source, asOf: proofFact.as_of };

  // ---- payment ----
  const payStatus = PAY_TONE[str(pv.status) ?? ""] ? (str(pv.status) as string) : "Unknown";
  const ptotal = pesoText(pv.invoice_total), ppaid = pesoText(pv.paid), pbal = pesoText(pv.balance);
  const known = payStatus !== "Unknown" && !payFact.message;
  const matches = known && pv.arithmetic ? pv.arithmetic === "matches" : null;
  const noteParts: string[] = [];
  if (!known) noteParts.push(explain(payFact.message) ?? "Payment is not recorded. Ask Logistics to check payment.");
  else {
    noteParts.push(matches === false ? "Paid and balance don't add up to the invoice total — ask Logistics to check." : pv.fully_paid ? "Paid in full; matches the invoice." : "Paid and balance add up to the invoice total.");
    const pd = dayOnly(pv.payment_date), ref = str(pv.payment_reference);
    if (pd || ref) noteParts.push(`Last payment${pd ? ` ${pd}` : ""}${ref ? `, ref ${ref}` : ""}.`);
    if (typeof pv.paid_basis === "string" && /derived/i.test(pv.paid_basis)) noteParts.push("Paid amount is invoice total minus balance, not a payment receipt.");
  }
  const payment: PaymentView = {
    status: payStatus, tone: PAY_TONE[payStatus] ?? "unknown",
    noteTone: !known ? "unknown" : matches === false ? "warning" : payStatus === "Paid" && matches === true ? "positive" : "neutral",
    total: known ? ptotal : null, paid: known ? ppaid : null, balance: known ? pbal : null, matches,
    note: noteParts.join(" "),
    short: !known ? "not recorded — ask Logistics" : payStatus === "Paid" ? `${ptotal ?? "—"}${matches ? " · matches invoice" : ""}` : `${pbal ?? "—"} balance of ${ptotal ?? "—"}`,
    source: payFact.source, asOf: payFact.as_of,
  };

  // ---- documents ----
  const invNumber = str(invoice?.number) ?? invoiceDr;
  const invRow: DocRow = invAt && invStatus === "received"
    ? { key: "invoice", title: "Signed invoice / DR", detail: `${invNumber ?? "Number not recorded"} · checked by Logistics ${dm(invAt)}`, state: "verified" }
    : invProblem
      ? { key: "invoice", title: "Signed invoice / DR", detail: `${invNumber ?? "Number not recorded"} · Logistics marked it ${invStatus}${str(invoice?.note) ? ` — ${str(invoice?.note)}` : ""}`, state: "problem" }
      : invNumber
        ? { key: "invoice", title: "Signed invoice / DR", detail: `${invNumber} · not checked back in yet`, state: "unverified" }
        : { key: "invoice", title: "Signed invoice / DR", detail: "Not recorded yet", state: "missing" };
  const documents: DocsView = {
    po,
    rows: [
      po ? { key: "po", title: "Client PO", detail: `${po} · copy not verified`, state: "unverified" }
        : { key: "po", title: "Client PO", detail: "Not recorded — no PO number on the SO", state: "missing" },
      invRow,
      { key: "permits", title: "Delivery permits", detail: "Not recorded yet — Logistics can add them", state: "missing" },
    ],
    source: docsFact.source, asOf: docsFact.as_of,
  };

  // ---- customer delivery rules ----
  const rr = obj(cv.recorded_rules);
  const recordedRules: RuleItem[] = [];
  if (rr) {
    const open = str(rr.opening_time), cut = str(rr.receiving_cutoff_time);
    if (open && cut) recordedRules.push({ text: `Receiving ${open}–${cut}`, icon: "clock", verified: true });
    else if (open) recordedRules.push({ text: `Receiving opens ${open}`, icon: "clock", verified: true });
    else if (cut) recordedRules.push({ text: `Receiving until ${cut}`, icon: "clock", verified: true });
    if (typeof rr.avg_processing_time_minutes === "number" && rr.avg_processing_time_minutes > 0) recordedRules.push({ text: `Unloading takes about ${Math.round(rr.avg_processing_time_minutes)} min`, icon: "clock", verified: true });
    if (rr.requires_reefer === true) recordedRules.push({ text: "Needs a refrigerated truck", icon: "note", verified: true });
    recordedRules.push(...splitNotes(rr.notes, true));
  }
  const soNotes = splitNotes(rr ? cv.so_notes : cv.notes, false);
  const rules: RulesView = {
    recorded: recordedRules, soNotes,
    message: recordedRules.length || soNotes.length ? null : explain(rulesFact.message) ?? "No delivery rules recorded. Ask Logistics to record receiving hours.",
    source: rulesFact.source, asOf: rulesFact.as_of,
  };

  // ---- loading check (+ problems folded in) ----
  const wl = obj(lv.warehouse_loading);
  const crew = obj(lv.crew_acknowledgement);
  const crewAt = str(crew?.at) ?? ackAt, crewBy = str(crew?.by) ?? ackBy;
  const checklistObj = obj(lv.checklist);
  const checklist = checklistObj ? Object.entries(checklistObj).filter(([, v]) => !missing(v)).slice(0, 8)
    .map(([k, v]) => ({ label: humanKey(k), value: typeof v === "boolean" ? (v ? "Yes" : "No") : String(v) })) : [];
  let chip: string, tone: ViewTone, word: string, short: string, summary: string | null;
  if (wl && wl.checklist_completed === true && wl.cargo_count_verified === true) {
    const counts = typeof wl.cargo_count_actual === "number" && typeof wl.cargo_count_expected === "number" ? ` (${wl.cargo_count_actual} of ${wl.cargo_count_expected})` : "";
    chip = "Loaded OK"; tone = "positive"; word = "Checked";
    short = str(wl.completed_at) ? `warehouse checked ${hm(wl.completed_at)}` : "warehouse checklist done";
    summary = `Warehouse loading checklist completed and cargo count verified${counts}${str(wl.completed_at) ? ` at ${hm(wl.completed_at)}` : ""}.`;
  } else if (wl) {
    chip = "Not fully checked"; tone = "warning"; word = "Incomplete"; short = "warehouse checklist incomplete";
    summary = `Warehouse checklist ${wl.checklist_completed === true ? "completed" : "not completed"}; cargo count ${wl.cargo_count_verified === true ? "verified" : "not verified"}.`;
  } else if (crewAt) {
    chip = "Helper acknowledged"; tone = "neutral"; word = "Confirmed"; short = `helper confirmed ${hm(crewAt)}`;
    summary = `${crewBy ?? "The crew"} acknowledged this order on the truck at ${hm(crewAt)}.`;
  } else {
    chip = "Not checked"; tone = "unknown"; word = "Not checked"; short = "ask Logistics"; summary = null;
  }
  const rawIssues = Array.isArray(probFact.value) ? probFact.value as unknown[] : [];
  const problems: ProblemView[] = rawIssues.map(i => obj(i)).filter((i): i is Record<string, unknown> => !!i).map(i => {
    const when = str(i.created_at), cat = str(i.category) ?? str(i.reference);
    const response = str(i.response);
    return {
      title: `Problem reported${when ? ` ${hm(when)}` : ""}${cat ? ` — ${humanKey(cat)}` : ""}.`,
      description: str(i.description),
      reply: response ? `Logistics: "${response}"${str(i.responded_at) ? ` — ${hm(i.responded_at)}` : ""}` : "No Logistics reply recorded yet.",
      status: str(i.status),
    };
  });
  const loading: LoadingView = {
    chip, tone, word, short, summary, checklist,
    note: str(lv.note), problems, problemsMessage: problems.length ? null : "No problems recorded in Tracker memory.",
    source: loadFact.source, asOf: str(lv.warehouse_loading_as_of) ?? loadFact.as_of,
    problemsSource: probFact.source, problemsAsOf: probFact.as_of,
  };

  return {
    number: card.number, status, tone: STATUS_TONE[status] ?? "unknown", customer: card.customer || "Customer not recorded", meta,
    truck, lastUpdate: card.last_update,
    journey: steps, journeySource: times.source, journeyAsOf: times.as_of,
    location, stats, stopText, eta: null, lastEvent,
    delivery, proof, payment, documents, rules, loading,
  };
}
