// Alert list tabs (All / Unread / Important). Pure so it is unit tested.
import type { AlertItem } from "./tripTypes.ts";

export type AlertTab = "all" | "unread" | "important";

// Important = a change to the assignment, or an invoice the officer did NOT mark received, or anything flagged high / urgent.
export function isImportant(alert: Pick<AlertItem, "type" | "priority">): boolean {
  return alert.type === "changed" || alert.priority === "high" || alert.priority === "urgent";
}

export function alertTabs(alerts: AlertItem[]): Record<AlertTab, AlertItem[]> {
  return { all: alerts, unread: alerts.filter((a) => !a.read), important: alerts.filter(isImportant) };
}
