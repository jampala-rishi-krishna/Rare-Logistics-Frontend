// Order detail timeline (Orders tab drawer): Order created -> Confirmed -> Shipped -> Delivered, from the Zoho status
// AND the helper-app stop outcome. The helper-app check-out time is the Delivered time. Partially delivered = orange
// Delivered step; Not delivered / Cancelled = red.
import { manilaHm, normalizeStatus, statusStyle, type StatusTone } from "./statusColors.ts";

export interface TimelineInput {
  orderStatus?: string | null;
  shipmentStatus?: string | null;
  /** Backend-normalised delivery status ("Delivered", "Partially delivered", "Pending", "Unknown"). */
  deliveryStatus?: string | null;
  packageStatuses?: (string | null | undefined)[];
  /** Helper-app stop outcome ("Delivered", "Partially delivered", "Failed / Returned", "cancelled_by_request"...). */
  stopOutcome?: string | null;
  checkoutAt?: string | null;
  createdAt?: string | null;
}

export type StepState = "done" | "current" | "todo";
export interface TimelineStep { title: string; state: StepState; tone: StatusTone; detail: string; time: string | null }
export interface Timeline { steps: TimelineStep[]; /** Index of the furthest reached step (0..3). */ reached: number; /** 0..1 line fill. */ fill: number; finalLabel: string }

type Final = "delivered" | "fulfilled" | "partial" | "not_delivered" | "cancelled" | null;

function finalOf(s: string): Final {
  if (["delivered", "completed"].includes(s)) return "delivered";
  if (s === "fulfilled") return "fulfilled";
  if (["partially delivered", "partial", "partial delivery"].includes(s)) return "partial";
  if (["not delivered", "failed", "returned", "failed returned", "rejected"].includes(s)) return "not_delivered";
  if (["cancelled", "canceled", "cancelled by request", "void"].includes(s)) return "cancelled";
  return null;
}

function fromPackages(list: string[]): Final | "shipped" | null {
  if (!list.length) return null;
  const delivered = list.filter((s) => ["delivered", "fulfilled", "completed"].includes(s)).length;
  if (delivered === list.length) return "delivered";
  if (delivered) return "partial";
  if (list.some((s) => ["shipped", "in transit", "partially shipped"].includes(s))) return "shipped";
  return null;
}

export function deriveOrderTimeline(input: TimelineInput): Timeline {
  const order = normalizeStatus(input.orderStatus);
  const ship = normalizeStatus(input.shipmentStatus);
  const delivery = normalizeStatus(input.deliveryStatus);
  const pkgs = (input.packageStatuses ?? []).map(normalizeStatus).filter(Boolean);
  const outcome = normalizeStatus(input.stopOutcome);

  // Helper-app outcome wins, then packages, then the Zoho order / shipment / delivery statuses.
  let final: Final = finalOf(outcome);
  let shipped = false;
  if (!final) {
    const p = fromPackages(pkgs);
    if (p === "shipped") shipped = true;
    else if (p) final = p;
  }
  if (!final) final = finalOf(order) ?? finalOf(ship) ?? (delivery === "delivered" ? "delivered" : delivery === "partially delivered" && !shipped && !["shipped", "partially shipped"].includes(ship) ? "partial" : null);
  if (["shipped", "partially shipped", "in transit"].includes(ship) || ["shipped", "partially shipped"].includes(order)) shipped = true;
  const confirmed = Boolean(final) || shipped || ["confirmed", "acknowledged", "open", "closed", "on hold", "onhold"].includes(order);

  const checkout = manilaHm(input.checkoutAt);
  const reached = final ? 3 : shipped ? 2 : confirmed ? 1 : 0;
  const finalLabel = final === "not_delivered" ? "Not delivered" : final === "cancelled" ? "Cancelled" : final === "partial" ? "Partially delivered" : final === "fulfilled" ? "Fulfilled" : final === "delivered" ? "Delivered" : "Delivered";
  const finalTone: StatusTone = final ? statusStyle(finalLabel).tone : "neutral";
  // Every step up to the furthest reached one is done; that one is "current" unless the order is final.
  const stateOf = (i: number): StepState => (i < reached || (i === reached && final) ? "done" : i === reached ? "current" : "todo");
  const shipLabel = ship === "partially shipped" ? "Partially shipped" : "Shipped";

  const steps: TimelineStep[] = [
    { title: "Order created", state: stateOf(0), tone: "neutral", detail: input.createdAt || "Zoho Sales Order", time: null },
    { title: "Confirmed", state: stateOf(1), tone: "neutral", detail: confirmed ? statusStyle(input.orderStatus || "confirmed").label : "Awaiting confirmation", time: null },
    { title: shipLabel, state: stateOf(2), tone: reached === 2 ? "orange" : "neutral", detail: reached >= 2 ? (input.shipmentStatus ? statusStyle(input.shipmentStatus).label : "Shipped") : "Awaiting shipment", time: null },
    { title: final ? finalLabel : "Delivered", state: stateOf(3), tone: finalTone, detail: final ? (checkout ? `${finalLabel} · ${checkout}` : finalLabel) : "Awaiting delivery", time: final ? checkout : null },
  ];
  return { steps, reached, fill: reached / (steps.length - 1), finalLabel: final ? finalLabel : statusStyle(input.orderStatus).label };
}
