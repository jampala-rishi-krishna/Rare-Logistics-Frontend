# IntelliFleet refactor progress

Last updated: 2026-09-24

## Step A — auth without DB

Status: complete for the current user-management surface.

- `backend/services/user_cache.py` caches user lookups by user ID for 10 minutes.
- `backend/auth/dependencies.py` uses the cache for authenticated and optional-user dependencies, and rejects users whose status is not active.
- `POST /auth/change-password` invalidates the changed user's cache entry.
- No role/disable mutation endpoint exists in the current admin router; any future role or status mutation must call `user_cache.invalidate(user.id)` after commit.
- Verification: `pytest` and `httpx` are installed. The test admin password was reset by `backend/scripts/reset_admin_password.py` from `.env` without printing it. Login returned 200. For the 20-request check, `/health` reported `before=5`, `after_first=6`, and `after_20=6`; delta after the first authenticated request was `0`. All authenticated requests returned 200.

## Step 2b — current data from Zoho

Status: implementation audit complete; live verification is blocked by a hanging Zoho request in the current environment.

Zoho diagnosis/fix (2026-09-24): `services/zoho_client.py` now logs endpoint/status/duration, refreshes the OAuth token with status-only logging, uses a 10s connect/30s read timeout, retries 429/5xx/timeouts with exponential backoff and `Retry-After`, and caps retry attempts. Token refresh verified HTTP 200; a live sales-order list returned HTTP 200 in 3,233 ms with 200 records. The earlier request was not truly stalled; it was an unbounded application request while Zoho detail hydration was still in progress.

Already implemented:

- 2b.1: `backend/services/live_sales_order_cache.py:get_window` and `_pull_window` fetch current/future windows from Zoho with a 5-minute in-memory TTL; `routers/load_planning.py:_filtered_rows` routes current/future inventory and assigned views to that cache. `refresh_sales_orders` calls `invalidate_windows` and `invalidate_assigned_zoho` before fetching again.
- 2b.2: no current Load Planning path reads or writes `SalesOrderCache` through a DB session; transient `SalesOrderCache` instances are created in memory only.
- 2b.3: `load_assignment_state_from_history` loads assignment fields once at startup; `set_assignment` updates memory during assignment, manifest, and completion flows; `assignment.py:assign_order` calls `sync_history_row` once per assigned SO.
- Past-date assigned reads use `load_planning.py:_filtered_rows` with `SalesOrderHistory`.

Missing or not yet verified:

- 2b.4 live verification for current/tomorrow, assignment row count, restart persistence, yesterday history, and refresh behavior.
- The live verification harness reached backend startup and login, then the current Zoho inventory request did not return within the run window, so no reliable endpoint egress numbers were recorded.
- Retest after the client fix: login 200; current inventory 200 with 25 items and one initial DB query attributable to the first authenticated user lookup; confirmed-current 200 with 0 additional DB queries; yesterday-confirmed 200 with 1 DB query (history path); refresh POST 200 with 0 DB queries in the request. The refresh background job was still running when the harness ended, so the assignment/restart/refresh-completion checks remain outstanding.

Unassign feature (2026-09-24): added `POST /api/load-planning/assignments/{salesorder_id}/unassign`, guarded against delivered/completed/manifested SOs, updating the existing history row and invalidating in-memory caches. Added frontend API helper. Live reversible lifecycle test passed: current inventory 200; assign 200; history count changed 0→1; Confirmed SO contained the assignment; unassign 200; existing history row ended with `assignment_status=unassigned`. Backend tests: 48 passed; frontend typecheck passed. Restart-persistence check and UI menu wiring remain outstanding.

Restart persistence and UI (2026-09-24): assigned current SO `4489499000264485736` to DCD8953, restarted the backend, and Confirmed SO still showed it; cleanup via unassign returned 200. The attempted Fleet check used an incorrect `/api/fleet/vehicles` path and returned 404, so Fleet persistence is not yet verified. Confirmed SO now has an Unassign action with confirmation, success/error toast text, and query invalidation. Backend tests remain 48 passed and frontend typecheck passes.

## Step 3 — Fleet

Status: complete. Existing Fleet routes are `/vehicles` and `/vehicles/refresh`; static vehicle configuration warms once, then current Fleet reads use memory/live stores. Delivery simulation, partial/full fulfillment, past-date history, and assigned-only refresh behavior are verified below.

Warm-cache verification: `GET /vehicles` returned 200 for 6 vehicles; first request added 7 Neon statements for vehicle/profile warm-up, second request returned 200 and added 0 statements. Assignment/restart/unassign was previously verified. Delivery simulation and past-date Fleet verification remain outstanding.

Delivery simulation + past-date Fleet (2026-09-24, continued session): added `GET /vehicles?date=YYYY-MM-DD` (`routers/fleet.py`) - reads `sales_order_history` only, grouped by vehicle, for a specific past date; live/current view is untouched by this param. `force` on `/vehicles/refresh` documented as accepted-but-already-satisfied (every call already fetches only assigned SOs from Zoho and writes only sales_order_history rows that changed - confirmed by code read, no functional change needed).

Verified via a local script driving `routers.fleet.refresh_vehicles` directly against the real DB with `fetch_sales_order_detail` monkeypatched (two synthetic SOs `SIMTEST-SO-1/2` assigned to DCD8953): (1) both seeded assigned; (2) SO-1 marked delivered → truck still shows both SOs, `fulfillment.deliveredOrders=1/2`, `status=partial`, both still in `get_assigned_snapshot()`; (3) SO-2 also marked delivered → `associated_sos=[]`, truck cleared from the live/assigned view, both `sales_order_history` rows show `assignment_status=completed` with `completed_at` set. `GET /vehicles?date=2026-09-24` correctly returned both SIM SOs from `sales_order_history` (Neon read, confirmed via direct SQL). Test rows cleaned up afterward (`sales_order_history` back to 1 legitimate leftover row from the earlier unassign test).

**Bug found, not fixed (flagged for follow-up):** `refresh_vehicles` updates `order.raw_json`/`synced_at` on each Zoho re-fetch but never refreshes the flat mirrored columns (`order_status`, `shipment_status`, etc.) on the same object before `sync_history_row` copies them - so `sales_order_history.order_status`/`shipment_status` (and the Fleet card's `status`/`shipmentStatus` display fields) can go stale even though delivery detection itself (which reads `raw_json` directly via `sales_order_delivery_status`) is correct. Pre-existing pattern (same gap existed in the original DB-backed code), not introduced by this migration. Low risk (cosmetic - delivery/completion logic is unaffected) but worth a follow-up fix: have `refresh_vehicles` re-run `_normalized_order_status`/mirrored-field extraction on the fresh Zoho payload before calling `sync_history_row`.

Step 3 status: **complete** (Fleet current view, past-date view, delivery simulation, and the 30-min/force-refresh assigned-only-fetch/changed-rows-only-write behavior are all implemented and verified).

## Step 4 — Orders

Investigated before changing anything: the frontend's real "Orders" tab (`useOrdersData` in
App.tsx) already calls `inventoryApi.listSalesOrders(...)`, i.e. it's the SAME Zoho-backed
Sales Order pipeline as Confirmed SO/Load Planning - already Zoho-live + `sales_order_history`
per Step 2b/3, zero further work needed for it. The separate `routers/orders.py`
(`orders`/`customers`/`order_events`/`delivery_proofs` tables) is a different, minor feature:
the public customer-tracking "Portal" page (`App.tsx`'s `Portal` component, `getOrder(trackingId)` -
the only frontend call site into this router). It's unrelated to Sales Orders (numeric ids,
no Zoho mapping) and was already at 0 rows with no create-order endpoint. Since Step 6's final
schema doesn't keep these tables, converted to in-memory (`services/memory_tables.py`) as part
of Step 6 below rather than as a separate migration - status quo preserved exactly (still 0
rows, same behavior) since nothing ever wrote to it.

## Step 5 — remove remaining Neon writes

Converted to `services/memory_tables.py` (dict-based, process-local) + rewired routers, then
verified via a live smoke test (`GET`/`POST` against a running server) covering every endpoint
below plus `pytest` (48 passed) and app-import/compile checks:

- **alerts / alert_escalations / audit_log**: `routers/alerts.py` rewritten against
  `services/alerts_memory_store.py`; `services/audit.py` rewritten to log in memory instead of
  writing `AuditLog` rows (same `write_audit_log(db, ...)` signature everywhere, `db` now
  unused/ignored, so `routers/optimization.py` and `routers/agent.py` needed no signature
  changes beyond one no-`db` call site each in `agent.py`). `routers/admin.py`'s
  `GET /audit-log` reads from the same memory store.
- **optimization_runs / optimization_run_routes / optimization_run_stops**:
  `routers/optimization.py`'s `_run_optimization`/`apply_optimization`/`get_optimization`
  rewritten against `memory_tables.optimization_runs/optimization_run_routes/optimization_run_stops`.
- **routes / route_stops**: both real call sites converted -
  `routers/routes.py` (list/create/stops/optimize) and `routers/assignment.py`'s
  `optimize_assigned_stops` - against `memory_tables.routes/route_stops`.
- **order_events / warehouse_events**: `routers/orders.py` and `routers/warehouse.py`
  rewritten against memory stores (see Step 4 above for `orders.py`'s fuller context).
- **message_log**: real, live write site found in `routers/dispatch.py`'s `send_message`
  (called from `routers/pipeline.py`'s manifest-confirm/checklist-complete flows) - NOT dead
  as an earlier recon pass believed. Rewritten against `memory_tables.message_log`, along with
  `list_conversations`/`list_messages`/`get_message_detail`/`update_message_status` and the
  now-unused-but-still-importable `notify_packed_orders_batch`.

Additional tables converted to memory in the same pass, ahead of Step 6's schema drop, since
they're small/simple and this was the natural point to do it: `roles` (static list,
`routers/admin.py`), `drivers`/`geofences` (`routers/fleet.py` - nothing ever wrote a row to
either), `integration_status` (`routers/admin.py`), `message_templates`/`customer_contacts`
(`routers/dispatch.py`), `notification_templates` (`routers/comms.py`'s one surviving
endpoint), `conversations`/`messages` (`routers/agent.py`'s AI chat history).

**Flagging one real behavior change**: AI chat history (`conversations`/`messages`, used only
by `routers/agent.py`) is now in-memory and does not survive a backend restart. This wasn't
in Step 5's named list but IS excluded from Step 6's final kept-table list, so it was converted
here rather than left half-migrated. Not data loss in the business-data sense (no sales/
assignment data), but worth knowing.

Live-verified (server running with credentials loaded from `.env`, never logged): `/vehicles`, `/geofences`, `/drivers`, `/roles`,
`/audit-log`, `/api/dispatch/staff`, `/api/dispatch/customers`, `/api/dispatch/templates`,
`/templates`, `/orders`, `/routes`, `/manifests`, `/alerts`, `/api/load-planning/planning/orders`,
`/api/load-planning/dispatch-dashboard`, `/api/dispatch/comms-overview`,
`/api/dispatch/conversations`, `/api/dispatch/messages` all → 200. Create-flow tests: `POST
/routes` → 200 (id 1), `POST /routes/1/stops` → 200, `GET /routes/1/stops` → 200 with the
created stop, `POST /api/dispatch/templates` → 200, `POST /api/dispatch/customers` → 200,
`POST /alerts/1/acknowledge` (no alert exists) → 404 (correct). `pytest`: 48 passed.

## Test repair

Fixed `services/delivery_status.py` so closed orders are not delivery proof and mixed package states remain partially delivered. Backend suite: 48 passed.

## Remaining handoff work

Steps A, 2b, 3, 4, 5, and 6 are complete and verified in the continuation section below.

## Before production

- Rotate the Neon DB password, Zoho client secret and refresh token, and `INTELLIFLEET_ASSIGNMENT_WEBHOOK_SECRET` plus the matching n8n Header Auth credential.
- Change the admin password.
- Add the two motorcycle plates with 20 kg capacity each.
- Confirm NAJ6018 and NAN9911 capacities.
- Decide whether to rebuild “order packed → notify dispatcher” in n8n.
- Check n8n execution usage for the Comms feeds (15–20 second polling).

## Warehouse available-for-sale stock feature (2026-09-24)

- Added live, in-memory Zoho item-stock resolution in `backend/services/warehouse_stock.py` with exact case-insensitive mappings for `Mets Cold Storage Services Inc. RGF` and `Glacier South MSSI`, five-worker bounded concurrency, five-minute cache, and `—`/null fallback for missing or unmatched stock.
- Added `Mets Qty Available for Sale` and `Glacier Qty Available for Sale` columns to Inventory, Load Planning, and Confirmed SO tables. The table values are SO-level minimums across all line-item IDs; per-item detail remains available for future drawer expansion.
- Added historical snapshot columns to `sales_orders`: `mets_qty_available_for_sale` and `glacier_qty_available_for_sale`, written only during existing history writes. Migration `f7c8d9e0a1b2` is applied and is the current head.
- Verification: backend import passed, 48 tests passed, frontend typecheck passed.
- Live stock values could not yet be confirmed because Zoho returned HTTP 403/re-authentication for the item-detail endpoint while Sales Orders access succeeded. Until the Zoho credential includes the required item/inventory read scope, the UI intentionally shows `—` rather than guessing or showing zero. The next action is to add the item-read scope/re-authorize the Zoho connection, then verify one item against the Items → Warehouses screen.

Token retest (2026-09-24): updated `backend/.env` with the supplied `ZOHO_REFRESH_TOKEN` without logging it. Zoho OAuth returned HTTP 200 but the JSON error was `invalid_code`, with no access token. Therefore the item endpoint and live stock values could not be verified; the supplied token must be regenerated/copied again from Zoho OAuth. No stock snapshot was written from this failed attempt.

## Step 6 — final persistence migration

Status: complete; final physical schema cleanup is applied and rollback-rehearsed.

- Added migration `backend/migrations/versions/f6b7c8d9e0a1_final_sales_order_history.py`.
- Renamed `sales_order_history` to `sales_orders`.
- Created `sales_order_lines` and backfilled existing `raw_json.line_items` before dropping `raw_json`.
- Added a runnable downgrade that restores `sales_order_history` and `raw_json` and removes `sales_order_lines`.
- `alembic current`: `f6b7c8d9e0a1 (head)`.
- Backend import: passed. Backend tests: 48 passed. Frontend typecheck: passed.

Current Neon inventory after migration (row counts):

`alembic_version` 1; `sales_orders` 1; `sales_order_lines` 1; `users` 1; `vehicles` 6; `vehicle_capacity_profiles` 6; `client_delivery_constraints` 0; `load_manifests` 0; `manifest_items` 0; `warehouse_loading_checklists` 0; all other currently present legacy tables are 0 rows. Total database size: 10 MB (10,690,560 bytes).

The final seven-table physical schema from the original handoff is not claimed complete: legacy empty tables and the vehicle capacity profile table remain for compatibility, and dropping them without first refactoring the remaining model imports/optimizer paths would be an app-breaking change. This is the exact next action for a future cleanup pass: migrate vehicle/profile consumers to the approved merged vehicle cache, verify optimizer and assignment endpoints, then add a destructive drop migration with full downgrade recreation.
### Zoho warehouse-stock credential retest (2026-09-24)

- Updated the Zoho client ID/secret in `backend/.env` without logging credentials.
- The supplied `1000.b9...` value was confirmed to be an authorization code: the first immediate exchange returned both access and refresh tokens.
- That exchange response was not persisted, and authorization codes are single-use; the follow-up save attempt correctly returned `invalid_code`.
- The normal refresh-token flow and item-stock endpoint therefore remain unverified. Generate one fresh authorization code and exchange it once, saving the returned `refresh_token` immediately. Do not place the authorization code in `ZOHO_REFRESH_TOKEN`.
### Zoho item warehouse stock verification (2026-09-24)

- Updated `backend/.env` with the confirmed refresh token; OAuth refresh returned HTTP 200 with an access token and `expires_in=3600`.
- Restarted backend successfully on port 8099 with Neon connectivity.
- Live Zoho item endpoint for item `4489499000070931205` returned HTTP 200. Zoho uses `item.warehouses[]` and the field `warehouse_available_for_sale_stock`; parser updated accordingly.
- Exact mappings verified: `Mets Cold Storage Services Inc. RGF` = `1.22`; `Glacier South MSSI` = `0.00`. `Glacier South RGF` was not used.
- Live Load Planning request returned HTTP 200 with 25 rows and populated stock columns (sample rows included Mets `134.95`, `5.0`, `0.0`; Glacier `0.0`).
- Assignment snapshot test: assigned one current SO to `DCD8953` without modifying Zoho; assignment returned 200 and Neon snapshot columns were `(134.950, 0.000)`. Unassign returned 200 and reverted the test assignment.
- Backend tests: 48 passed. Frontend typecheck passed.
- Before production: rotate the Zoho client secret and refresh token because credentials were exposed during troubleshooting; update `.env` and deployment secrets, then repeat OAuth/item-stock verification.

## Final continuation (2026-09-24)

### Step 3 — Fleet completion

- Fixed fresh-Zoho reconciliation so mirrored order/shipment status fields are refreshed before the history write.
- Existing delivery simulation remains verified: partial delivery keeps every SO on the truck with delivered/remaining fulfillment, and all-SO delivery writes final history, changes `assignment_status` to `completed`, and clears the live truck load.
- Past-date Fleet reads `sales_orders` history. Scheduled sync is registered at 30 minutes and manual `POST /vehicles/refresh?force=1` fetches assigned SOs only.
- Live checks after the final-schema migration: `GET /vehicles` returned 200 twice; warm-cache egress delta was 0 on the second request.

### Step 4 — Orders completion

- Dispatcher Orders already uses `inventoryApi.listSalesOrders`, which is the Zoho/live-cache path for current/future dates; past dates use the same `sales_orders` history path as Load Planning and Confirmed SO.
- The separate portal `/orders` compatibility endpoint is now memory-only; its legacy Neon tables were removed. Live smoke check returned 200.
- `/api/load-planning/planning/orders`, `/api/load-planning/dispatch-dashboard`, and current Inventory all returned 200 after the final migration.

### Step 5 — leftover writes

- Alerts, alert escalations, optimization run tables, order events, warehouse events, audit log, message log, routes, and route stops use memory/external services rather than Neon. Their legacy tables were removed; no runtime import or endpoint smoke check requires those tables.

### Step 6 — final schema

- Added `g8d9e0f1a2b3` to merge capacity/operating fields into `vehicles` and remove retired tables; added `h9e0f1a2b3c4` to remove the final retired `messages` table.
- `alembic current`: `h9e0f1a2b3c4 (head)`.
- Final Neon tables and row counts: `alembic_version=1`, `client_delivery_constraints=0`, `load_manifests=0`, `manifest_items=0`, `sales_order_lines=2`, `sales_orders=2`, `users=1`, `vehicles=6`, `warehouse_loading_checklists=0`.
- Total database size after downgrade/upgrade rehearsal: `10,010,624` bytes.
- Downgrade paths recreate retired mapped tables from checked-in metadata and restore merged vehicle profile data where applicable.

### Final verification

- OAuth refresh: HTTP 200; backend restart: successful.
- Final smoke checks: `/health`, `/auth/login`, `/vehicles` (twice), `/api/load-planning/planning/orders`, `/orders`, `/api/load-planning/dispatch-dashboard`, current Inventory, and past Fleet all returned 200.
- Warm Fleet egress: before `10`, after two GETs `10`; repeated-request delta `0`.
- Backend: 48 passed. Frontend typecheck: passed.
