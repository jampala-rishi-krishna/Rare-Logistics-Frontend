export type WebhookCounts = { webhook_in?: Record<string, number>; webhook_org_quota?: number };

export function webhookTotal(data: WebhookCounts): number {
  return Object.values(data.webhook_in ?? {}).reduce((total, count) => total + (Number.isFinite(count) ? count : 0), 0);
}

export function webhookQuotaTone(total: number): "green" | "amber" | "red" {
  return total >= 900 ? "red" : total >= 700 ? "amber" : "green";
}
