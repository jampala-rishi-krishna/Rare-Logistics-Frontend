# IntelliFleet Neon database

2026-10-21 delivery write-back + automatic unassign (Rishi's task; NO new table, column or migration). New write/read paths on EXISTING tables only:
- **Zoho write-back** (`services/zoho_writeback.py`, after the crew commit, background, retried in process memory): SO-only check-out Delivered / Partially delivered -> Zoho custom sub-status `ZOHO_SO_CLOSED_SUBSTATUS`; SO proof photo (`delivery_photo`, Drive) -> Zoho SO attachment. Each outcome is ONE `trip_events` INSERT (user_id 0, role `system`): `zoho_so_closed` / `zoho_so_attachment`, `idempotency_key` `zoho-close:<so_id>` / `zoho-attach:<upload_key>` on ok / skipped (looked up by key before every send), plus at most one unkeyed `retrying` row and one unkeyed `failed` row per job; `result` = {status, detail, attempts, message}. Reads: one `trip_stops`+`trips` row and one `sales_orders` row per check-out / upload trigger; a `trip_events` count per SO before an attachment (limit `ZOHO_SO_MAX_ATTACHMENTS`, default 5).
- **Automatic unassign** (`services/auto_unassign.py`): (a) after End trip commits, SO/WM stops checked out Not delivered / Cancelled by request are unassigned; (b) on the existing Zoho SO syncs (no extra Zoho call) an assigned SO whose Zoho shipment date moved is unassigned in the background and its `sales_orders.expected_shipment_date` is set to the new date. Both use the existing unassign writes (`sales_orders` via `sync_history_row`, one `order_unassigned` `trip_events` row, user_id 0 / role `system`, `result.automatic/reason/message`, `payload.notify_crew`), plus the existing selected-batch trip reads. A stop checked out Delivered / Partially delivered is never auto-unassigned. Manager alerts for (b) after the crew started are process memory only (merged into `GET /api/access/alerts`).

2026-10-20 explicitly approved account correction: admin-only PATCH `/api/admin/users/{id}` updates existing users name/email/phone/status, preserving ID, role, staff link and history. Existing uniqueness checks protect email/phone; email changes invalidate the old password and expire unused existing invites in the same transaction. Authentication cache is invalidated after commit. No new table, column or migration.

2026-10-20 collected-invoice fix: existing Overview hardcopies read now exposes `collected=true` from received handover items, joins existing stop outcomes for display, and reads receiver/time from existing receipt fields; latest 500 collected rows per filtered query, with truncation disclosed. Collected rows and counts follow the top calendar's delivery date or inclusive `from`/`to` range, filtered before the limit, independently of receipt time. Received handovers suppress legacy driver-held fallback rows. No tables, columns, business-data repairs or new writes.

2026-10-21 cancel-by-request + multi-warehouse pickup: a check-out with outcome `cancelled_by_request` is the same single `trip_stops` UPDATE (outcome, reason, form_answers JSON gains `cancel_requested_by`, `cancel_requester_name`, `cancel_proof` photo id); its proof photo is a normal `trip_photos` upload (field_key `cancel_proof`). Per-line pickup warehouse (`lines[].warehouse`, `pickup_warehouses`) is read from the existing `sales_order_lines.location_name` / cached Zoho SO line location. No tables, columns or new write paths.

2026-10-20 approved invoice-receipt update: Planner/Dispatcher/Admin Overview receipt reuses the existing `handover.resolve` transaction and invoice/trip event tables (no new schema or SQL path), records the actual actor role, requires a crew handover, invalidates Tracker history, and emits a data-free live refresh signal after commit; drawer history is reduced to same-day trip numbering.

## Order Tracker read model (2026-10-19)

2026-10-20 approved fix: Tracker reads existing `trip_state.load` tables (trips, acknowledgements, stops, handovers/items, actor names) for selected assigned batches itself, single-flight with a 15-second/generation-invalidated projection cache; order/assignment records remain in the Confirmed Orders memory cache, with no Zoho calls or database writes.

No tables, columns, migrations, template changes or database writes. The requested Tracker cached read paths reuse existing history tables only for **strictly past dates**: `day_model.rows_in_range` (`sales_orders`, at most a 31-day requested window), one batched `sales_order_lines` read, and existing `trip_state.load` reads for the selected batches. More than 1,000 rows or a serialized result over 64 KiB requires a smaller window. Historical results use a single-flight, five-minute cache, capped at eight entries / 1 MiB total serialized bytes. Current/future order records use memory only; selected-batch trip facts use the read below. No automatic history polling.

Today's Tracker makes **no Zoho calls**; its selected-batch trip reads are explicitly authorized below. It consumes `live_sales_order_cache` and `live_gps_store`. Existing Driver / Driver Overview GET reads publish small trip-state projections *after the handler succeeds*, using rows those workflows already fetched, adding no query. Reads inside crew transactions queue projections only; they never publish uncommitted data. Current projections must match assignment and trip-event generations. Cold/expired/invalidated trip projections are loaded by Tracker itself through the selected-batch read below. Snapshots cap at 512 entries / 2 MiB serialized bytes / 24 hours; individual snapshots over 64 KiB are dropped. No ORM objects or large provider payloads are retained. Authentication still uses the existing user-cache path.

Sales scope uses the persisted/live `salesperson_name` matched to the authenticated full name; Wet Market additionally requires WM type. Missing ownership denies access; Admin/Planner have operations scope. `/api/media` adds scoped Sales/Wet Market authorization using the already-loaded photo row and existing cached order/POD references, without a new metadata query. Missing ownership or proof reference denies access. Historical department photos whose live ownership cannot be verified are denied. No question-log table: bounded application logs only. See [ORDER_TRACKER_COVERAGE.md](ORDER_TRACKER_COVERAGE.md) for proposed future schema and provider reads, none enabled here.

Existing assignment-options reads also publish their already-read `client_delivery_constraints` facts to this same 2 MiB cache. Existing manifest checklist GET/complete operations publish their already-read `warehouse_loading_checklists` fields after the existing operation succeeds; Tracker never calls the checklist GET (which can create a checklist) or complete action. Neither publication adds a query or changes the existing transaction. Per-session pending publications cap at 32 entries / 256 KiB. Two Tracker GETs and two AI requests may execute at once; excess requests receive a busy response. No polling/AI retry can trigger a provider fetch.

**2026-10-20 design rebuild - no persistence change.** The list rows gained `stop`, `total_stops` and `event`, the order card gained `area`, the list response gained `counts` (all / Out for delivery / Delivered / problems), and Ask responses gained `blocks` and `language`. All are derived in memory from data each request already loads: `stop`/`total_stops` from the card's trip snapshot, `event` from the card's recorded times, `area` from the cached SO shipping city already projected, `counts` from the same scoped and searched rows the list builds, and `blocks` from the tool results already fetched for that answer. No new table, column, Neon read/write, Zoho call or cache.

Tracker photo URLs and requests use `/api/media/{id}?read_only=true`. This disables the existing Drive name/description retry on photo viewing (Sales/Wet Market always disable it) and returns private/no-store responses varying by Authorization, so the tab cannot write Drive metadata or reuse a previous account's cached photo response. Existing crew/office photo reads keep their earlier retry behavior. Metadata authorization still uses the existing single photo-row lookup; there is no new photo query.

Updated 2026-10-16. Application schema head: `t0f1a2b3c4d5` (apply via the Render pre-deploy migration before starting this version), following `s9e0f1a2b3c4` (transfer orders). Earlier documented head: `r8d9e0f1a2b3` (proof of delivery required: a new version of the Delivery time log template, data only). Earlier heads: `q7c8d9e0f1a2` (driver app rebuild: `driver_issues`, `driver_alert_reads`, 2 columns, time-log template), `p6b7c8d9e0f1` (`app_settings`), `o5a6b7c8d9e0` (trip workflow: 9 tables), `n4f5a6b7c8d9` (driver portal), `m3e4f5a6b7c8` (assignment_batch_id), `l2d3e4f5a6b7` (email status), `k1c2d3e4f5a6` (zoho_api_usage), `j1b2c3d4e5f6` (fleet health), `i1a2b3c4d5e6` (`sales_orders.helper_ids` + third-party trucks).

Neon stores durable business history and configuration only. Current/future Sales
Orders, Fleet telemetry, staff directory data, alerts, routes, optimization runs,
conversations, and delivery proofs are live or process-memory data. The approved unassign-request and pickup-decision workflows described below persist decisions and read markers, never a live-order mirror. Current/future
Sales Order views must not read or write Neon on every request; history views are
the only date-filtered Neon reads.

## Approved tables

### Driver Overview / Drive media additions (2026-10-15, approved task)

- No schema change or migration. Overview's existing 15-second per-parameters/per-generation cache now also reads existing `trip_events`, `driver_issues`, and required-photo `form_template_items` facts for trip attention flags; existing `invoice_handover_items` are loaded with handovers for shared driver/Overview status. Trip drawer numbering uses the existing date-scoped batch reader for the same driver's selected day; the seven-day drawer option and read have been removed. Invoices/issues add warehouse/search/optional-date filtering over their existing tables. No Zoho calls or background Neon writes are added.
- Captions batch-read the existing `trip_photos` rows referenced by stop/checklist/issue answers, inside the Overview cache. Driver assignment detail/action payloads also batch-read referenced stop-photo metadata once across their order payloads; Today has no order photos and gains no photo read on its generation-cached polls. SO number/kind derive from existing stop/issue facts. For **new uploads**, `trip_photos.created_at` stores the validated client camera capture time in the same existing INSERT (missing timestamp falls back to server receipt time). Legacy photo rows keep their original upload timestamps; missing legacy metadata falls back to action client time. No capture-time column is added.
- Photo bytes may now live in the Google Drive folder selected by `GDRIVE_PHOTO_FOLDER_ID`; the existing `trip_photos.storage_key` stores `gdrive:<fileId>`. Existing R2 keys retain their resolver. Metadata row writes and upload-key idempotency are unchanged. Drive-only background description/name finalization adds no Neon write. Exact configuration and process-local retry/cache limits: [GDRIVE_MEDIA.md](GDRIVE_MEDIA.md).

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
| `app_settings` | Admin-editable NON-SECRET settings: `key` (PK), `value`, `updated_by`, `updated_at` (migration `p6b7c8d9e0f1`, approved 2026-10-12). Fixed whitelist of 11 keys (including six pickup email settings); see "App settings" below | One UPSERT per Save in Admin > Settings (one DELETE per "Reset to default"). Read ONCE at startup into memory; never read per request |
| `form_templates` | Versioned forms: the delivery **acknowledge checklist** and the delivery **check-out** form (`kind`, `version`, `is_draft`, `active`) (migration `o5a6b7c8d9e0`). Seeded v1 of each as DRAFT placeholders | One INSERT per version when an admin saves a template in Driver Overview > Checklist settings (the previous version is flagged inactive in the same transaction). Read by the driver app's templates call and by validation of every acknowledge / check-out |
| `form_template_items` | The fields of a template version (`key`, `label`, `item_type`, `required`, `options`, `prefill`, `show_when`, `position`) | Inserted together with their `form_templates` row only; never edited in place |
| `trips` | One row per assignment batch (`batch_id` unique): status `pending/on_trip/returned/handover_submitted/closed`, start/end times + GPS, end distance | Created lazily by the first crew action on a batch; updated by start, end, and when the handover is closed. One write per crew action |
| `so_acknowledgements` | One row per SO per trip: the checklist answers, template version, who/when/GPS | One INSERT per "Acknowledge" (idempotent: unique `(trip_id, so_id)`) |
| `trip_stops` | One row per SO of a trip, frozen in delivery order when the trip starts: check-in (time, GPS, distance, `far` flag) and check-out (time, GPS, outcome, reason, form answers + template version) | INSERTed for every stop when the trip starts; UPDATEd by check-in and by check-out |
| `trip_events` | Append-only audit log of every trip action (type, user, role, client time + server time, GPS) and the **idempotency ledger** (`idempotency_key` unique, stored `result`) | Exactly one INSERT per action (acknowledge-all: one per order; End trip: + `handover_submitted`; dispatcher unassign: `order_unassigned`), in the same transaction as the state change. System rows (user_id 0, role `system`): automatic `order_unassigned`, `zoho_so_closed`, `zoho_so_attachment` (see the 2026-10-21 note at the top). Also read to detect replays and to build timelines / Driver Overview |
| `trip_photos` | Metadata of uploaded photos and signatures (`storage_key`, content type, size, uploader, `upload_key`); bytes live in Google Drive (`gdrive:` keys) or legacy Cloudflare R2, never in Neon. New uploads use existing `created_at` for validated client capture time | One INSERT per upload (`POST /api/driver/uploads`, retry-safe by `upload_key`) |
| `invoice_handovers` | The driver's invoice hand-over to a logistics officer (one per trip): status `pending/acknowledged/closed`, who/when/GPS, chosen officer | One INSERT when the crew ends the trip (automatic handover, no officer chosen) or, for a trip ended before that, submits the old handover form; UPDATEd when the officer validates (and closed when every invoice is received) |
| `invoice_handover_items` | One row per invoice (SO) in a handover: crew `handed_over` + note, officer `received/missing/discrepancy` + note + checked time | INSERTed with the handover; UPDATEd by officer validation and by "resolve" of a missing/discrepancy/pending invoice |
| `driver_issues` | Issues a driver / helper reports from a trip, an order or the profile (migration `q7c8d9e0f1a2`, approved 2026-10-13): reference `IS-YYYYMMDD-nnnn`, reporter, optional batch / SO / vehicle, category, priority, description, `photo_ids` (trip_photos), status `submitted/acknowledged/in_progress/resolved/closed`, dispatch `response` | One INSERT per report (idempotent by the phone's `idempotency_key`); one UPDATE per dispatch response in Driver Overview > Issues (a repeat of the same reply writes nothing). Read: the reporter's own list, the open count in Today / Overview KPIs, the dispatch list |
| `driver_alert_reads` | Read markers of the driver app's alerts (migration `q7c8d9e0f1a2`): `(user_id, alert_key)` unique. The alerts themselves are NOT stored: they are computed on read from assignments, trip events, officer validations and issue replies | One INSERT per alert marked read (a repeat writes nothing). Read with the alert list |
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

## Driver app rebuild (migration `q7c8d9e0f1a2`, approved 2026-10-13)

Additive only: no table or column is dropped and no existing row is rewritten.

- `form_template_items.app_only` (bool, default false): the field is asked by the app but is NOT in the Zoho form. Settings shows "added in app, not in Zoho form" so Logistics can turn it off.
- `invoice_handover_items.invoice_no` (text): the Invoice / DR number typed at check-out, copied in the same INSERT as the handover item. The officer's carbon-copy checklist line is "SO number + Invoice / DR number". NULL on rows made before this change.
- New tables `driver_issues` and `driver_alert_reads` (see the table list above).
- **Delivery time log**: the migration inserts ONE new `form_templates` row (kind `delivery_checkout`, the next version, name "Delivery time log", not a draft, active) with 5 items, and flags the old 14-field DRAFT checkout template(s) inactive. Nothing is deleted: every stop filled with the old template keeps its template id / version / answers and stays readable. The template mirrors the Zoho form "B2B Logistics Delivery" (Name = the logged-in crew member, Sales Order Number, Invoice or DR Number, Time Logs "Arrived at Site" = check-in / "Departed from Site" = check-out, plus GPS). The Zoho form is NOT called; see `docs/TRIP_WORKFLOW.md` section 11.
- **Read paths added**: `GET /api/driver/issues|alerts` (own rows by user id), `GET /api/driver/history?status=&page=&page_size=` (server-side paging over `sales_orders` + trip tables, only the requested page's lines are loaded), `GET /api/driver-overview/issues`. None calls Zoho. **Write paths added**: `POST /api/driver/issues`, `POST /api/driver/alerts/read`, `POST /api/driver-overview/issues/{id}/respond`.
- **Rollback** (`downgrade()`): drops the two new tables and two new columns and removes the time-log template unless a stop was filled with it (then it stays, inactive logic restored to the newest older version). Destructive for issues / read markers.

### Proof of delivery (migration `r8d9e0f1a2b3`, 2026-10-13)

Data only (no schema change). Copies the active "Delivery time log" into the next version and flags the previous version inactive (nothing deleted; stops already filled keep their template version):
`delivery_photo` "Proof of delivery photo" is REQUIRED and shown only when the outcome is Delivered or Partially delivered; a new optional `failure_photo` is shown for Failed (a reason is required for Partially delivered / Failed).
Skipped when the active template is no longer the seeded one (an admin saved their own). Photo bytes live in the configured Drive/R2 provider; when `storage_available()` is false the server cannot require a photo, so the app shows "Photo upload is not configured, contact admin" and still lets the crew save the departure.
Editing the templates moved from Driver Overview to **Admin > Settings > Driver app forms** (admin only); it writes the same `form_templates` / `form_template_items` rows as before.

## Driver app simplification (2026-10-14, no migration, no new table / column; write + read paths approved in Rishi's task)

Every path below uses existing tables only (`trip_events.event_type` is free text, `result` / `payload` are JSONB).

- **One-tap acknowledge** (`POST /api/driver/batches/{id}/acknowledge-all`, `services/trip_workflow.acknowledge_all`): ONE transaction
  that INSERTs, per order not yet acknowledged, the same `so_acknowledgements` row + `trip_events` "acknowledged" row the single
  endpoint writes. Only the first event carries the idempotency key and the stored response (replay = no write). The checklist is
  OFF unless the active acknowledge template is non-draft with items (`form_templates.acknowledge_checklist_enabled`, cached in
  memory per `trip_events.generation()`); while OFF the row stores `answers = []` and points at the active (draft) template.
- **Automatic handover at End trip** (`POST /api/driver/batches/{id}/end`): in the SAME transaction as the trip end, INSERT one
  `invoice_handovers` row (status `pending`, `officer_user_id` NULL = no officer chosen) + one `invoice_handover_items` row per order
  of the trip (`invoice_no` = the Invoice / DR number typed at check-out; a TO's is its TO#), plus a second `trip_events` row
  `handover_submitted` (no key). `POST .../handover` then returns the existing handover (no duplicate row).
- **TO check-out**: the server stores the TO# as the `invoice_dr_number` answer in `trip_stops.form_answers` (client value ignored).
- **Unassign audit** (`POST /api/load-planning/assignments/{id}/unassign`, `/bulk-unassign`): per unassigned order that belonged to
  an assignment batch, ONE `trip_events` row `order_unassigned` (user = the dispatcher, gps / key NULL,
  `result` = so_number, order_type, previous_state, acknowledged_by/at, trip_started_at, checked_in_at, by_name; `payload` = the
  crew snapshot driver_id / helper_ids, delivery_date, remaining_in_batch), in the same commit as the unassign.
  Reads for the decision: `trips`, `so_acknowledgements`, `trip_stops`, `users` of the SELECTED orders' batches only.
- **Unassign preview** (`POST /api/load-planning/assignments/unassign-preview`): read-only; memory first, then `sales_orders` rows
  only for ids not in memory, plus the same trip reads as above for the selected batches. No Zoho.
- **Driver payload `dispatch_changes`** (`GET /api/driver/today`, `/assignments/{id}`): reads `trip_events` rows `order_unassigned`
  of the last 3 days, only when the driver "Today" in-memory cache is rebuilt (an unassign bumps both generation counters, so the
  removed order leaves the payload at once).
- **Crew action on removed work**: when the batch / order is no longer the caller's, one indexed `trip_events` lookup (failure path
  only) decides 409 `trip_removed` / `order_removed` instead of 404.
- **Driver Overview timeline** (`GET /api/driver-overview/trips/{batch_id}`): its existing `trip_events` read now also returns the
  `order_unassigned` rows (`events[]`), also for a batch whose every order was removed.

## Transfer orders in Load Planning (migration `s9e0f1a2b3c4`, pre-approved by Rishi 2026-10-13)

Additive only, no new table. Three columns on `sales_orders`: `order_type` (NOT NULL, server default `'SO'`, so every existing row stays an SO), `source_warehouse`, `destination_warehouse` (nullable, TO only). A transfer order (TO) is stored like an SO row **only when it is assigned** (id `TO:<zoho id>`, `salesorder_number` = the TO#, `customer_name` = the destination warehouse, lines in `sales_order_lines`), through the same `sync_history_row` write as an SO. `assignment_batch_id` and every existing SO row are untouched.

- LIVE: the Draft Mets<->Glacier TO list (matched by Zoho warehouse ID, `services/transfer_orders.py`) and each TO's lines are read from Zoho into memory only; the list is pulled on first load / after the TTL / on the TO tab's "Hard refresh", never per render. No Neon read for "today".
- Neon reads: past-dated Confirmed Orders (same path as SOs, now filtered by `order_type`), and the driver app / Driver Overview (same rows as SOs).
- PO: see the next section.

## Purchase orders and Wet Market orders (2026-10-15, requested by Rishi) - NO schema change

`sales_orders.order_type` is `varchar(4)` with no check constraint, so the two new codes need no migration. Values are now
`SO | WM | PO | TO`; existing rows are untouched (a WM order saved as `'SO'` before the split is still read as WM by its `WM-SO` number,
`services/order_types.py`). No new table, no new column, no new write path: PO and WM rows are written by the same `sync_history_row`
call, at the same moments (assign / unassign / status change / delivery), as SO and TO.

- **WM** (sales orders numbered `WM-SO...`): the SAME Zoho sales-order list and cache as SO, split by number prefix; no extra Zoho call
  and no extra Neon read. Stored exactly like an SO with `order_type = 'WM'`.
- **PO** (only `PO-` numbers, never `SS PO-`, never the SariSuki Store Inc. branch): stored **only when assigned**, like a TO: id
  `PO:<zoho id>`, `salesorder_number` = the PO#, `customer_name` = the vendor, `shipping_address` = the vendor (pickup) address,
  `expected_shipment_date` = the Expected Delivery Date (else the PO date), `order_status` = the Zoho PO status,
  **`source_warehouse` = the vendor name (pickup point)**, `destination_warehouse` = the receiving warehouse; lines in `sales_order_lines`.
- LIVE: the PO list (`services/purchase_orders.py`) and each PO's lines are read from Zoho into memory only; the list is pulled on first
  load / after the TTL / on the PO tab's "Hard refresh", line details only for the POs being shown or assigned.
- Neon reads: past-dated Confirmed Orders (filtered by `order_type`; asking for WM also reads `'SO'` rows and keeps the `WM-SO` numbers),
  and the driver app / Driver Overview (same rows as SOs).

## Admin-editable settings (`app_settings`, migration `p6b7c8d9e0f1`, approved 2026-10-12)

`app_settings(key text PK, value text, updated_by text, updated_at timestamptz)`. Only five non-secret keys can ever be stored
(`services/app_settings.py` whitelist; anything else is refused with 404 and nothing is written):

| Key | Meaning | Rules | Fallback (when no row) |
|---|---|---|---|
| `DISPATCH_PHONE` | Number the driver app's "Call dispatch" dials; empty hides the button | digits, `+ - ( )` and spaces, max 32 | env `DISPATCH_PHONE`, else empty |
| `DRIVER_STALE_MINUTES` | Driver Overview "stale" threshold | whole number 1-1440 | env, else 15 |
| `ZOHO_DAILY_BUDGET` | Platform soft budget of Zoho calls/day (80% pauses non-essential calls) | whole number 100 to `ZOHO_ORG_DAILY_LIMIT` | env, else 4500 |
| `ZOHO_GUARD_CACHE_ONLY_PCT` | Percentage of `ZOHO_DAILY_BUDGET` at which non-essential Zoho calls pause (the app serves cached data); decimal percentages allowed, threshold rounded to nearest call. A 6000 budget and 95.83333333333333% gives exactly 5750 calls. Same existing setting row and save/load paths; no schema change. | finite number 50-99 | env, else 92 |
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


## Role, manager and pickup workflows (2026-10-16, task pre-approved)

Migration `t0f1a2b3c4d5` follows `s9e0f1a2b3c4`. Run through the configured Render pre-deploy migration step; verify `/health.schema_revision` before releasing the frontend.
- `users.phone` becomes nullable; the existing PostgreSQL UNIQUE constraint allows multiple NULLs and still enforces uniqueness of real phone numbers. No invented phone values.
- `users.is_manager` is a non-null boolean (default false). Existing admins and `pau@rareglobalfood.com` / `jed@rareglobalfood.com` are enabled; new matching accounts receive the same default. Only admin user-management updates it; user cache is invalidated immediately.
- Existing `dispatcher` users become `planner`; migration prints changed emails. Warehouse/client users are preserved. No other users are rewritten.
- `sales_orders.assigned_by_name` is nullable, copied with the existing assigning ID/time in the assignment transaction for SO/WM/PO/TO. Legacy names remain NULL. Assignment state is restored once at startup; live views continue to use memory. Attribution is removed at the JSON response boundary for non-managers and from all export/email payloads.
- `unassign_requests`: one row per order per request, requester ID/name, reason, pending/approved/rejected status, resolution actor/time/note, manager read IDs and requester-result read flag. A partial UNIQUE index on order_id WHERE status='pending' blocks duplicates across concurrent requests. INSERT only on Request unassign; UPDATE only on read/resolve. Approval uses the existing unassign warning/blocked rules and commits the request result with unassign history/events. Alert reads query pending requests for managers and own outcomes for requesters; they never query live orders from Neon.
- `pickup_decisions`: unique decision_key = Zoho PO ID + delivery_date + created_time, order_id, delivery_date, status, deciding user ID/name, created_at. One INSERT per manager approve/reject. Loaded once at startup into memory, then updated after a decision; no DB reads in live PO listing or assignment.
- `pickup_email_logs`: delivery_date, recipient To/CC JSON, PO count, sending/sent/failed/skipped_empty status, error, nullable unique schedule_key. Scheduler claims its Manila day before delivery, then updates outcome; an ambiguous interrupted send remains 'sending' and is not automatically retried. Manual sends use NULL schedule_key. Admin/manager history reads latest 100 only.
- Six extra non-secret `app_settings` whitelist keys: PICKUP_PROCUREMENT_TO/CC, PICKUP_LOGISTICS_TO/CC, PICKUP_EMAIL_TIME (14:05 Manila), PICKUP_EMAIL_ENABLED (0, disabled). Existing startup-only cache and explicit Save writes apply. No recipient means no scheduled send.
- Exact Zoho field verified from list and PO detail: `cf_shipment_method` (label Shipment Method), exact value `For Pickup`; only Delivery Date tomorrow in Asia/Manila, status Issued. Missing date/time fails closed. Cutoff is 14:00:59 the day before delivery; 14:01:00 is Pahabol. Vendor shipping address/contact comes from cached Zoho contacts (1 hour, bounded 500), fetched by detail workers, never per render. No PO content mirror or staff/contact table.
- Migration is forward-only to prevent deleting workflow history accidentally.
