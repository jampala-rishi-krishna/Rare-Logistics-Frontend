import { strict as assert } from "node:assert";
import { test } from "node:test";
import { webhookQuotaTone, webhookTotal } from "./zohoWebhookVisibility";

test("webhook card derives today's total and alert color from mocked API data", () => {
  const mocked = { webhook_in: { salesorder: 500, package: 250 }, webhook_org_quota: 1000 };
  assert.equal(webhookTotal(mocked), 750);
  assert.equal(webhookQuotaTone(webhookTotal(mocked)), "amber");
  assert.equal(webhookQuotaTone(900), "red");
});
