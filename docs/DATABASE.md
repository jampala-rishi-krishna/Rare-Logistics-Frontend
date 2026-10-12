# IntelliFleet Neon database

Updated 2026-10-12. Alembic head: `p6b7c8d9e0f1` (`app_settings`). Earlier heads: `o5a6b7c8d9e0` (trip workflow: 9 tables), `n4f5a6b7c8d9` (driver portal), `m3e4f5a6b7c8` (assignment_batch_id), `l2d3e4f5a6b7` (email status), `k1c2d3e4f5a6` (zoho_api_usage), `j1b2c3d4e5f6` (fleet health), `i1a2b3c4d5e6` (`sales_orders.helper_ids` + third-party trucks).

Neon stores durable business history and configuration only. Current/future Sales
Orders, Fleet telemetry, staff directory data, alerts, routes, optimization runs,
conversations, and delivery proofs are live or process-memory data. Current/future
Sales Order views must not read or write Neon on every request; history views are
the only date-filtered Neon reads.

## Approved tables

| Table | Purpose | Write policy |
|---|---|---|
| `users` | Authentication users and roles. `staff_id` (migration `n4f5a6b7c8d9`) links a login to its n8n staff-directory record | Login/user-management operations only: admin creates a login, sets a password via invite link, enables/disables |
| `user_invites` | Single-use set-password / reset links (migration `n4f5a6b7c8d9`): `user_id`, SHA-256 `token_hash`, `purpose` invite/reset, `expires_at` (24h), `used_at` | One INSERT when an admin creates a link (earlier pending links for that user are expired in the same transaction), one UPDATE when a link is redeemed. Read when a link is redeemed and when Admin > Users lists users |
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
| `app_settings` | Admin-editable NON-SECRET settings: `key` (PK), `value`, `updated_by`, `updated_at` (migration `p6b7c8d9e0f1`, approved 2026-10-12). Fixed whitelist of 5 keys; see "App settings" below | One UPSERT per Save in Admin > Settings (one DELETE per "Reset to default"). Read ONCE at startup into memory; never read per request |
| `form_templates` | Versioned forms: the delivery **acknowledge checklist** and the delivery **check-out** form (`kind`, `version`, `is_draft`, `active`) (migration `o5a6b7c8d9e0`). Seeded v1 of each as DRAFT placeholders | One INSERT per version when an admin saves a template in Driver Overview > Checklist settings (the previous version is flagged inactive in the same transaction). Read by the driver app's templates call and by validation of every acknowledge / check-out |
| `form_template_items` | The fields of a template version (`key`, `label`, `item_type`, `required`, `options`, `prefill`, `show_when`, `position`) | Inserted together with their `form_templates` row only; never edited in place |
| `trips` | One row per assignment batch (`batch_id` unique): status `pending/on_trip/returned/handover_submitted/closed`, start/end times + GPS, end distance | Created lazily by the first crew action on a batch; updated by start, end, and when the handover is closed. One write per crew action |
| `so_acknowledgements` | One row per SO per trip: the checklist answers, template version, who/when/GPS | One INSERT per "Acknowledge" (idempotent: unique `(trip_id, so_id)`) |
| `trip_stops` | One row per SO of a trip, frozen in delivery order when the trip starts: check-in (time, GPS, distance, `far` flag) and check-out (time, GPS, outcome, reason, form answers + template version) | INSERTed for every stop when the trip starts; UPDATEd by check-in and by check-out |
| `trip_events` | Append-only audit log of every trip action (type, user, role, client time + server time, GPS) and the **idempotency ledger** (`idempotency_key` unique, stored `result`) | Exactly one INSERT per action, in the same transaction as the state change. Also read to detect replays and to build timelines / Driver Overview |
| `trip_photos` | Metadata of uploaded photos and signatures (`storage_key`, content type, size, uploader, `upload_key`); the image bytes live in Cloudflare R2, never in Neon | One INSERT per upload (`POST /api/driver/uploads`, retry-safe by `upload_key`) |
| `invoice_handovers` | The driver's invoice hand-over to a logistics officer (one per trip): status `pending/acknowledged/closed`, who/when/GPS, chosen officer | One INSERT when the crew submits the handover; UPDATEd when the officer validates (and closed when every invoice is received) |
| `invoice_handover_items` | One row per invoice (SO) in a handover: crew `handed_over` + note, officer `received/missing/discrepancy` + note + checked time | INSERTed with the handover; UPDATEd by officer validation and by "resolve" of a missing/discrepancy/pending invoice |
| `alembic_version` | Migration marker | Alembic only; never truncate manually |

## Driver portal (migration `n4f5a6b7c8d9`, approved 2026-10-12)

- `users.staff_id` (int, nullable, unique index): the driver's id in the n8n staff directory. Driver API endpoints scope every query by the `staff_id` of the logged-in user, never by a request parameter (admins pass `?driver_id=`).
- `user_invites`: see the table above. Only the token hash is stored; the token exists only in the emailed / copied link and is never logged.
- `sales_orders.delivery_notes` (text) and `sales_orders.delivery_contact` (JSONB `{person, phone, attention}`): copied from the SO detail **already in memory** inside `sync_history_row`, i.e. in the same INSERT/UPDATE as the assignment (no extra write, no Zoho call). NULL = the detail was not cached at assign time; a later sync that has the detail fills them, one without it never blanks them. Past days therefore keep notes/contact in history.
- **Read paths added (driver app only):** `GET /api/driver/today|history|assignments/{batch_id}` read `sales_orders` + `sales_order_lines` filtered by `driver_id` (+ date / batch). *Today* is cached in memory per driver and re-read only when the live assignment state changes (`live_sales_order_cache.assignment_generation()`) or after 5 minutes, so a phone polling every 60s does not query Neon each time. History is a plain date-filtered read (dates before today, Manila). None of these endpoints calls Zoho.
- **Helpers:** `driver_id` is the driver; `helper_ids` keeps every selected staff id including the driver (backward compatible). Helpers are always `set(helper_ids) - {driver_id}`, by value (`services/staff_roles.py`). No schema change, no backfill; existing rows are read the same way.
- **Not persisted (deliberately):** stop order and departure time. The driver app lists orders in assignment order and shows "stop order not set".
- **Login throttle** is in memory (`services/login_rate_limiter.py`): 5 failures / 15 min per typed identifier, per account and per IP. It resets on restart and is not shared between workers (single instance today).
- **Disabling a login:** the admin status endpoint invalidates the 10-minute user cache, so it applies to the next request on that instance. If `users.status` is changed directly in the database, the user is cut off when their cache entry expires - at most 10 minutes - even though a driver JWT lives 30 days.

## Driver / helper trip workflow, officer validation, Driver Overview (migration `o5a6b7c8d9e0`, approved 2026-10-12)

Contract: `docs/TRIP_WORKFLOW.md`. No endpoint here calls Zoho or writes to Zoho. The nine tables are the ones listed above
(`form_templates`, `form_template_items`, `trips`, `so_acknowledgements`, `trip_stops`, `trip_events`, `trip_photos`,
`invoice_handovers`, `invoice_handover_items`); the migration only CREATES them (nothing existing is touched) and seeds two
DRAFT templates (ids 1 and 2, flagged `is_draft`; the Zoho form behind the check-out template is not publicly readable, so its
field list is a placeholder to be replaced in Admin).

- **Writes:** every crew action (`acknowledge`, `start`, `check-in`, `check-out`, `end`, `handover`) and every officer action
  (`validate`, `resolve`) is ONE transaction: the state change plus its `trip_events` row, committed once
  (`services/trip_workflow.py`, `services/handover.py`, `services/trip_events.py`). A repeated action (same idempotency key, or
  already done by the other crew member) writes nothing. Nothing writes in the background and nothing polls.
- **Photos / signatures:** the image goes to Cloudflare R2 (env `R2_*`, see `docs/TRIP_WORKFLOW.md` section 9); Neon stores only
  the `trip_photos` metadata row. R2 is an external write, not Postgres. Without R2 configured, upload returns 503 and the app hides
  photo/signature fields.
- **Reads:** crew screens read `trips`, `trip_stops`, `so_acknowledgements`, `invoice_handovers` through the driver "Today" cache
  (`services/driver_assignments.py`: in memory per driver, re-read when the assignment state or `trip_events.generation()` changes,
  or after 5 minutes). Driver Overview endpoints (`services/overview.py`) cache each result for 15 s per (params, generation), so a
  dashboard polled by several users costs at most one set of queries per generation per 15 s. The officer queue / outstanding /
  history read `invoice_handovers` + items directly (no cache). Templates are read per validation and by `GET /api/driver/templates`.
- **Not in Neon:** staff and drivers (n8n), live GPS, Sales Order content (live from Zoho / memory).
- **Rollback:** `downgrade()` drops the nine tables (destructive: it deletes trip history).

## Admin-editable settings (`app_settings`, migration `p6b7c8d9e0f1`, approved 2026-10-12)

`app_settings(key text PK, value text, updated_by text, updated_at timestamptz)`. Only five non-secret keys can ever be stored
(`services/app_settings.py` whitelist; anything else is refused with 404 and nothing is written):

| Key | Meaning | Rules | Fallback (when no row) |
|---|---|---|---|
| `DISPATCH_PHONE` | Number the driver app's "Call dispatch" dials; empty hides the button | digits, `+ - ( )` and spaces, max 32 | env `DISPATCH_PHONE`, else empty |
| `DRIVER_STALE_MINUTES` | Driver Overview "stale" threshold | whole number 1-1440 | env, else 15 |
| `ZOHO_DAILY_BUDGET` | Platform soft budget of Zoho calls/day (80% pauses non-essential calls) | whole number 100 to `ZOHO_ORG_DAILY_LIMIT` | env, else 4500 |
| `ZOHO_GUARD_CACHE_ONLY_PCT` | Percentage of `ZOHO_DAILY_BUDGET` at which non-essential Zoho calls pause (the app serves cached data) | whole number 50-99 | env, else 92 |
| `ZOHO_FAILSAFE_SO_DETAIL_CAP` | SO-detail calls allowed while today's usage total could not be restored from Neon | whole number 0-1000 | env, else 50 |

Resolution order: admin override > environment variable > built-in default. **Read path:** one `SELECT` of the table at startup
(before the Zoho counter starts); afterwards every lookup is a memory read, so the per-call Zoho budget guard never touches Neon.
**Write path:** Admin > Settings (`PUT/DELETE /api/admin/settings/{key}`, admin only) writes ONE row per Save, or deletes it on
"Reset to default", then updates memory; nothing else writes. A change is audited in the in-memory audit log (who, from, to). If
the startup read fails the environment values stay in force. **Secrets are never stored here** (R2, Zoho, Gmail, JWT, Cartrack
and database credentials stay in environment variables). Single worker: a saved value applies at once to this instance.

## Other write paths added with the driver portal (all through existing tables)

- **Admin creates a login** (`POST /api/admin/users`): one INSERT into `users` with a password hash (optionally the initial password
  is emailed to the user, never stored in plain text); `.../invite-link` and `.../send-invite` INSERT into `user_invites`; `.../status`
  UPDATEs `users.status`.
- **Set password** (`POST /auth/set-password`, `POST /auth/change-password`): UPDATE of `users.password_hash` (+ `must_change_password`),
  and `user_invites.used_at` when a link is redeemed.

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
(default Asia/Manila). `ZOHO_DAILY_BUDGET` (platform soft budget, default 4500; non-essential calls pause at `ZOHO_GUARD_CACHE_ONLY_PCT` (default 92%) of it and everything except acknowledge/lock stops at 100%) and
`ZOHO_FAILSAFE_SO_DETAIL_CAP` (default 50; applies only while the startup restore has failed - caps SO detail calls until it
succeeds) are now **editable in Admin > Settings** (see "Admin-editable settings"); the env vars are only the fallback.
`ZOHO_ORG_DAILY_LIMIT` (display and the upper bound for the budget, default 10000) stays env-only. `lock_status` (the separate
lock credential), `lock_webhook` and `rate_limited` (429) calls are recorded but excluded from the total/budget. The old `zoho_usage_state.json` file is no longer used.

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
