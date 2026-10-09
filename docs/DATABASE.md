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

## Assignment email status (migrations `l2d3e4f5a6b7`, `m3e4f5a6b7c8`, approved 2026-10-09)

`sales_orders` gained `email_status` (queued/sent/failed/skipped), `email_error`, `email_sent_at`, `email_message_id`.
One email covers several SOs, so every row of an assignment batch is updated together. Written only on a state change:
`queued` when the assignment email is handed to the sender, then once `sent`/`failed`/`skipped` when Gmail has answered
(`services/assignment_email_status.py`). Nothing polls or rewrites them. The same values are kept in the live assignment
state, loaded back from `sales_orders` at startup, and returned on the SO list rows. `GET /api/gmail/send-log` also reads
them (`assignments`), so the log survives restarts. `assignment_batch_id` (migration `m3e4f5a6b7c8`) identifies one assignment click. It is written in the same UPDATE as the first (`queued`) status, so it costs no extra write. Retry/Resend resolve the SOs to email from it (server side, memory), so two separate assignments to the same truck are never merged; rows from before it existed have no batch id and retry only themselves.
A driver without an email on file is recorded as
`skipped: no email on file` inside `email_error` (the team email still goes out, status `sent`).

## Credential rotation (Gmail)

The backend reads the Gmail OAuth credentials from environment variables only (Render -> `intellifleet-api` -> Environment);
nothing is stored in code, tests, the database or docs:

| Variable | Meaning |
|---|---|
| `GMAIL_COMMS_CLIENT_ID` / `GMAIL_COMMS_CLIENT_SECRET` | The Google Cloud OAuth client used to mint and refresh tokens |
| `GMAIL_COMMS_REFRESH_TOKEN` | Long-lived grant for the sending mailbox (`martin.logistics@...`) |
| `GMAIL_FROM_ADDRESS` / `GMAIL_FROM_NAME` / `GMAIL_REPLY_TO` | Sender identity; the address must be the mailbox itself or a verified Send-As alias |

To rotate:
1. In Google Cloud Console -> APIs & Services -> Credentials, rotate (or add a new) client secret for the OAuth client, and update `GMAIL_COMMS_CLIENT_SECRET` (and `_CLIENT_ID` if the client changed) in Render.
2. In the mailbox's Google Account -> Security -> Third-party apps & services, revoke the old grant for this app.
3. In the OAuth Playground (gear -> "Use your own OAuth credentials", Access type Offline) authorise with scopes `https://www.googleapis.com/auth/gmail.modify` and `https://www.googleapis.com/auth/gmail.settings.basic` as the sending mailbox, then exchange the code and copy the refresh token.
4. Set `GMAIL_COMMS_REFRESH_TOKEN` in Render (saving redeploys).
5. Check `GET /api/gmail/auth-status` returns `connected: true` (the dashboard's "Gmail disconnected" banner disappears) and `GET /api/gmail/identity` shows the sender alias as verified.

The OAuth consent screen must be **Internal** or **In production**; in "Testing" refresh tokens expire after 7 days and Gmail will
disconnect again. A revoked or expired token is shown as the red "Gmail disconnected - re-authorise" banner and as a failed
assignment email status; it is never silent.

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
