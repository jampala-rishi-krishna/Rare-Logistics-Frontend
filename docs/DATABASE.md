# IntelliFleet Neon database

Updated 2026-10-08. Alembic head: `j1b2c3d4e5f6` (the earlier `i1a2b3c4d5e6` added `sales_orders.helper_ids` and seeded the six third-party trucks; this file had not recorded it).

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
| `vehicle_daily_stats` | One row per tracked vehicle per Manila day (km, engine seconds, idle split, speeding, harsh events, battery volts, fuel estimates, primary driver) | Nightly job 01:00 Asia/Manila (previous day) and the admin backfill; idempotent upsert on `(vehicle_id, stat_date)` |
| `service_intervals` | Service intervals: fleet defaults (`vehicle_id` NULL) and per-truck overrides; seeded defaults are placeholders (`confirmed = false`) | Admin/dispatcher edits only |
| `maintenance_records` | Services, repairs, inspections, downtime | Explicit user entry only |
| `vehicle_flags` | Open/resolved issues per truck. Written only through `services/vehicle_flags.py report_issue()` | Issue reports, automatic battery/fuel/overload/checklist checks, manual entry; resolve action |
| `pretrip_checklists` | Pre-trip checklist per truck per working day | Explicit user entry only |
| `fuel_logs` | Fuel fill-ups (litres, amount, odometer, full tank) | Explicit user entry only |
| `zoho_api_usage` | Per-day Zoho API call counters, PK (usage_day, category, source), ~20 rows/day | Additive UPSERT every 60s from `services/zoho_usage.py`, only when there is an unflushed delta; also on shutdown/SIGTERM. Read once at startup to restore today's total. Admin > Users usage tile |
| `alembic_version` | Migration marker | Alembic only; never truncate manually |

## Zoho API usage (migration `k1c2d3e4f5a6`, approved 2026-10-09)

`zoho_api_usage(usage_day date, category text, source text, count bigint, updated_at timestamptz)`, PK
(usage_day, category, source). Every Zoho HTTP attempt (retries included) increments an in-memory delta in
`services/zoho_usage.py`; a flusher thread writes `count = count + EXCLUDED.count` every 60s only if the delta is
non-zero (idle = zero writes), and on shutdown/SIGTERM. A failed flush keeps the delta for the next cycle. At startup the
day's rows are loaded into memory before the first Zoho call; if that load fails the budget guard allows essential calls
only until it succeeds. `token_refresh` rows are stored but excluded from the total/budget. Day boundary: `ZOHO_USAGE_TZ`
(default Asia/Manila). Env: `ZOHO_DAILY_BUDGET` (platform soft budget, default 4000, 80% blocks non-essential calls),
`ZOHO_ORG_DAILY_LIMIT` (display only, default 10000), `ZOHO_FAILSAFE_SO_DETAIL_CAP` (default 50; applies only while the startup restore has failed - caps SO detail calls until it succeeds). The old `zoho_usage_state.json` file is no longer used.

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

## Fleet Health (migration `j1b2c3d4e5f6`)

Six tables, all tiny (about 10,000 rows a year in total). No raw Cartrack trips or events are stored: the nightly job
reads the previous day's trips from `/rest/trips`, combines them with that day's in-memory status samples
(`services/fleet_health/sampler.py`, one `/rest/vehicles/status` call per 10 minutes) and writes ONE row per tracked
vehicle. Staff live in n8n, so `staff_id` / `primary_staff_id` are plain integers (no FK). Enumerations are `VARCHAR` plus
`CHECK` constraints. `vehicle_flags.dedup_key` is unique only among OPEN flags (partial index
`ux_vehicle_flags_open_dedup`), so a resolved flag can be raised again with the same text. Reads are cached; page loads
make no Cartrack calls.

Cartrack budget: one shared limit of 20 calls/min (`services/cartrack_limiter.py`), retries after 1/2/4/8 s on 429/5xx/timeouts.
Third-party trucks (`vehicles.is_third_party`) and trucks without a tracker never get daily rows or scores.

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
