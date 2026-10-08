# Zoho Sales Order Webhooks

Default state: disabled. Set `ZOHO_WEBHOOKS_ENABLED=true` only after Kristian has configured
and tested the Zoho workflow rule below. The endpoint is cache-only: it updates the in-memory
Sales Order window and detail cache, and does not write Neon.

## IntelliFleet Endpoint

`POST https://<api-host>/api/zoho/webhooks/salesorder`

Required header:

`X-Zoho-Webhook-Secret: <shared secret from ZOHO_WEBHOOK_SECRET>`

The endpoint is idempotent by `event_id`, `webhook_id`, or `salesorder_id:last_modified_time`.
Duplicate events return `duplicate: true`.

## Zoho Setup For Kristian

Create a Workflow Rule in Zoho Inventory:

1. Module: `Sales Orders`.
2. Trigger: create or edit. Include status, sub-status, and lock changes if Zoho exposes those
   as workflow triggers in the org.
3. Action: Webhook.
4. URL: the IntelliFleet endpoint above.
5. Method: `POST`.
6. Header: `X-Zoho-Webhook-Secret` with the shared secret.
7. Payload fields:
   - `event_id` or `webhook_id`
   - `salesorder_id`
   - `salesorder_number`
   - `status`
   - `order_status`
   - `current_sub_status`
   - `order_sub_status`
   - `current_sub_status_id`
   - `shipment_date`
   - `expected_shipment_date`
   - `last_modified_time`
   - `branch_id`
   - `branch_name`
   - `location_id`
   - `location_name`
   - `lock_details`
   - `line_items` when Zoho allows it

When enabled, IntelliFleet can reduce fallback delta sync to 30 minutes; until then the shared
wide window still performs delta refreshes and caps full refreshes to once every two hours
during working hours.
