# IntelliFleet Neon database

Updated 2026-09-24. Alembic head: `h9e0f1a2b3c4`.

Neon stores durable business history and configuration only. Current/future Sales
Orders, Fleet telemetry, staff directory data, alerts, routes, optimization runs,
conversations, and delivery proofs are live or process-memory data. Current/future
Sales Order views must not read or write Neon on every request; history views are
the only date-filtered Neon reads.

## Approved tables

| Table | Purpose | Write policy |
|---|---|---|
| `users` | Authentication users and roles | Login/user-management operations only |
| `vehicles` | Vehicle roster plus merged capacity/operating configuration | Roster/configuration changes; no live telemetry |
| `sales_orders` | Slim historical Sales Order snapshots and assignment state | Assignment, manifest/status transition, and delivery/completion events only |
| `sales_order_lines` | Line-item snapshot belonging to a historical Sales Order | Replaced with its parent snapshot on the same event |
| `client_delivery_constraints` | Dispatcher-entered customer delivery constraints | Explicit admin/dispatcher edits only |
| `load_manifests` | Confirmed dispatch manifests | Manifest confirmation/update only |
| `manifest_items` | Items belonging to confirmed manifests | Manifest confirmation/update only |
| `warehouse_loading_checklists` | Confirmed-manifest loading checklist | Checklist operations only |
| `alembic_version` | Migration marker | Alembic only; never truncate manually |

## Sales Order history

`sales_orders` intentionally has no `raw_json`. Live Zoho rows remain in
`services.live_sales_order_cache`. Historical rows contain normalized fields,
assignment/completion state, delivery status, and the stock snapshots
`mets_qty_available_for_sale` and `glacier_qty_available_for_sale`. Those stock
values are point-in-time snapshots captured during the same event write; they are
not refreshed by browsing a current view.

`sales_order_lines.sales_order_id` joins to `sales_orders.id`. The line table
contains item id/name/SKU, quantity, shipped quantity, weight, unit, and warehouse
location captured at the event.

## Vehicle configuration

Capacity and operating-profile fields were merged into `vehicles` by migration
`g8d9e0f1a2b3`; the old `vehicle_capacity_profiles` and
`vehicle_operating_profiles` tables were removed. Live GPS fields remain in
`services.live_gps_store` and are never persisted.

## Migrations and downgrade

- `f6b7c8d9e0a1`: renamed historical storage to `sales_orders`, moved lines to
  `sales_order_lines`, and removed `raw_json`.
- `f7c8d9e0a1b2`: added the two warehouse-stock snapshot columns.
- `g8d9e0f1a2b3`: merged vehicle profiles and dropped retired persistence tables.
- `h9e0f1a2b3c4`: dropped the final retired `messages` table.

The cleanup migrations have working downgrades: they recreate retired mapped
tables from the checked-in SQLAlchemy metadata and restore the merged vehicle
profile data where applicable. Downgrading does not restore data that was already
removed before the cleanup migration.

## Retired persistence

Alerts, alert escalations, audit logs, optimization runs/routes/stops, order and
customer tables, order events, warehouse events, routes/route stops, message
tables, notification templates, conversations, delivery proofs, geofences,
drivers, integration status, and the old Sales Order cache are process-memory or
external-service concerns. Their Neon tables were removed by the final cleanup
migrations; runtime routers use the corresponding memory stores or Zoho/n8n
sources.

## Staff directory (n8n, not Neon)

Staff/drivers live only in the n8n "Logistics Staff Directory" DataTable
(`akyMRuol1VpZXh1D`), cached in memory by `backend/services/staff_directory_cache.py`.

- **Read:** `[LOGISTICS] Get Staff Directory` (`ux2vAULY8m8zgQHu`, GET
  `/webhook/logistics-staff-directory`) - fetched at backend startup and on
  `POST /api/dispatch/staff/refresh`; a cache miss on an id refreshes once.
- **Write (added 2026-09-30):** `[LOGISTICS] Create Staff Record` (`0bwm8sy0c6K24WJZ`,
  POST `/webhook/logistics-staff-create`, same Header Auth credential). Triggered only
  by the "+ New Driver" form in the truck assignment panel via
  `POST /api/load-planning/assignments/new-driver`. Inserts one row, and the returned
  row is added to the in-memory cache immediately. Rejects duplicates (same email or
  mobile as an existing cached record) before calling n8n.
- Edits/deletes of existing staff are still done in n8n directly
  (`POST/PATCH/DELETE /api/dispatch/staff` stay 501).
