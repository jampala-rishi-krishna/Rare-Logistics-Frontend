// THE one place an order / delivery status gets its label and colour. Always text plus colour (never colour alone).
// Shipped / Partially delivered = orange, Delivered / Fulfilled = green, Not delivered / Cancelled = red, others neutral.
// Colours are the dashboard's CSS tokens in src/index.css (status-success, status-orange, destructive, info, muted).
// Used by Orders, Fleet (Order status + Associated orders), Order Tracker, Confirmed Orders and Load Planning.

export type StatusTone = "green" | "orange" | "red" | "blue" | "neutral";

export interface StatusStyle {
  /** Human label, e.g. "Partially delivered". */
  label: string;
  tone: StatusTone;
  /** CSS class from index.css (.status-tone-*): text colour + chip background. */
  className: string;
  /** Inline colours for code that styles inline. */
  color: string;
  background: string;
}

const TOKENS: Record<StatusTone, { color: string; background: string }> = {
  green: { color: "hsl(var(--status-success))", background: "hsl(var(--success-bg))" },
  orange: { color: "hsl(var(--status-orange))", background: "hsl(var(--orange-bg))" },
  red: { color: "hsl(var(--destructive))", background: "hsl(var(--destructive-bg))" },
  blue: { color: "hsl(var(--info))", background: "hsl(var(--info-bg))" },
  neutral: { color: "hsl(var(--muted-foreground))", background: "hsl(var(--muted))" },
};

/** Lower-case, underscores/dashes/slashes to single spaces: "Cancelled_By_Request" -> "cancelled by request". */
export function normalizeStatus(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/[_\-/]+/g, " ").replace(/\s+/g, " ").trim();
}

const KNOWN: Record<string, [string, StatusTone]> = {
  delivered: ["Delivered", "green"],
  completed: ["Delivered", "green"],
  fulfilled: ["Fulfilled", "green"],
  shipped: ["Shipped", "orange"],
  "partially shipped": ["Partially shipped", "orange"],
  "in transit": ["Shipped", "orange"],
  "partially delivered": ["Partially delivered", "orange"],
  partial: ["Partially delivered", "orange"],
  "partly delivered": ["Partially delivered", "orange"],
  "partial delivery": ["Partially delivered", "orange"],
  "not delivered": ["Not delivered", "red"],
  failed: ["Not delivered", "red"],
  returned: ["Not delivered", "red"],
  "failed returned": ["Not delivered", "red"],
  rejected: ["Not delivered", "red"],
  cancelled: ["Cancelled", "red"],
  canceled: ["Cancelled", "red"],
  "cancelled by request": ["Cancelled", "red"],
  void: ["Cancelled", "red"],
  confirmed: ["Confirmed", "neutral"],
  acknowledged: ["Acknowledged", "neutral"],
  open: ["Open", "neutral"],
  draft: ["Draft", "neutral"],
  pending: ["Pending", "neutral"],
  closed: ["Closed", "neutral"],
};

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function statusStyle(raw: unknown): StatusStyle {
  const key = normalizeStatus(raw);
  const known = KNOWN[key];
  const label = known ? known[0] : key ? titleCase(key) : "Unknown";
  const tone: StatusTone = known ? known[1] : "neutral";
  return { label, tone, className: `status-tone-${tone}`, ...TOKENS[tone] };
}

/** Statuses that show the helper-app check-out time next to them. */
const TIMED = new Set(["Delivered", "Partially delivered", "Not delivered", "Fulfilled"]);

/** True for the final statuses that show the check-out time (Delivered / Partially delivered / Not delivered / Fulfilled). */
export function isTimedStatus(raw: unknown): boolean {
  return TIMED.has(statusStyle(raw).label);
}

/** "HH:mm" in Manila time, or null for a missing / unparseable timestamp. */
export function manilaHm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  let s = String(iso);
  if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += "Z"; // naive timestamps are UTC
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(t);
}

/** "Delivered · 10:31" when the status is final and a check-out time is known, else just the label. */
export function statusLabelWithTime(raw: unknown, checkoutAt?: string | null): string {
  const { label } = statusStyle(raw);
  const hm = TIMED.has(label) ? manilaHm(checkoutAt) : null;
  return hm ? `${label} · ${hm}` : label;
}

/** The status to show for an order: the helper-app stop outcome wins over Zoho once the crew has checked out. */
export function effectiveOrderStatus(o: { stopOutcome?: string | null; deliveryStatus?: string | null; shipmentStatus?: string | null; orderStatus?: string | null }): string {
  if (o.stopOutcome) return o.stopOutcome;
  const delivery = normalizeStatus(o.deliveryStatus);
  if (delivery === "delivered" || delivery === "partially delivered") return delivery;
  const order = normalizeStatus(o.orderStatus);
  if (["fulfilled", "delivered", "void", "cancelled"].includes(order)) return order;
  const ship = normalizeStatus(o.shipmentStatus);
  if (ship === "shipped" || ship === "partially shipped" || ship === "delivered") return ship;
  return o.orderStatus || o.shipmentStatus || o.deliveryStatus || "";
}
