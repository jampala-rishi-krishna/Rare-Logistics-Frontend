# Driver / helper trip workflow, officer invoice validation, Driver Overview

Contract shared by backend, driver app, officer app and the Driver Overview dashboard. Tables are in
`backend/models/trip.py` (migration `o5a6b7c8d9e0`); shared plumbing is `backend/services/trip_events.py`.
No endpoint here calls Zoho. Nothing here writes to Zoho. Every action = exactly one DB write (+ its audit event).

## 1. Roles

| role (users.role) | who | can do |
|---|---|---|
| `driver` | staff role DRIVER (e.g. ids 9-16) | crew actions on batches where `driver_id = own staff_id`; read own Today/Detail/History |
| `helper` | staff role HELPER (ids 17-21) | same crew actions + reads on batches where own staff id is in the helper set |
| `logistics_officer` | created by admin in Admin > Users, no staff link needed | `/api/officer/*` only (queue, validate, outstanding, history) |
| `admin` | | everything; reads crew data with `?driver_id=`; may validate invoices (recorded as role admin); edits templates; never performs crew actions |
| `dispatcher` / `planner` | | read-only: Driver Overview + timelines; no crew / officer actions |

Crew = driver + helpers of a batch. Helpers of a row = `set(helper_ids) - {driver_id}` (`services/staff_roles.helper_ids_of`).
A user is crew of a batch iff `user.staff_id` is the batch's `driver_id` or in its helper set. Non-crew drivers/helpers get **404** for a batch
they are not on (same as "does not exist"); roles that may never do the action get **403**.

## 2. Batch / trip state machine (enforced server-side)

A batch = one `assignment_batch_id` (one truck, one driver set, several SOs; all SOs share a delivery date). Its trip row is created lazily
at the first action. `trip.status`:

```
(no trip) / pending --all SOs acknowledged--> [start] --> on_trip --all stops checked out--> [end] --> returned
returned --[submit handover]--> handover_submitted --officer validates every invoice as received--> closed
```
Display chips (`trip.chip`): `to_acknowledge` ("To acknowledge", pending and not all SOs acknowledged), `ready` ("Ready to start"),
`on_trip` ("On trip · stop 2 of 5" = checked-out count + 1 of total, capped), `returned` ("Back - hand over invoices"),
`handover_pending` ("Handover pending", status handover_submitted), `closed` ("Closed").

Actions and their guards (rejections use HTTP **409** `code: out_of_order` unless noted; message is human text the app shows verbatim):

| action | allowed when | rejection message example |
|---|---|---|
| acknowledge SO | trip pending (not started), SO in batch, required checklist items complete (422 `validation` otherwise) | "The trip has already started." |
| start trip | pending AND every SO acknowledged | "Acknowledge all 5 SOs to start the trip (3 left)." |
| check-in SO | on_trip, that stop `pending`, and NO other stop is `checked_in` | "Check out of SO-123 before arriving at another stop." |
| check-out SO | on_trip, that stop `checked_in`; form valid (422 otherwise) | "Check in at this stop first." |
| end trip | on_trip AND every stop `checked_out` | "2 stops are not checked out yet." |
| submit handover | `returned`; every SO of the batch listed; `handed_over=false` needs a note (422) | "End the trip before handing over invoices." |
| officer validate | handover `pending`/`acknowledged`; every item given a status; note required for missing/discrepancy (422) | |
| officer resolve | item currently `missing`/`discrepancy`/`pending` | |

**Idempotent duplicates** (same key OR the action was already done by anyone, e.g. driver and helper both tap "Arrived"): HTTP **200**,
`already_done: true`, `done_by: {name, role, at}`, nothing written. A retried request with the same `idempotency_key` returns the stored response with
`replayed: true`. Duplicate detection runs BEFORE state-order checks (a second "start trip" after the trip started is `already_done`, not a 409).

## 3. Common request/response shapes

Every crew/officer action body includes:
```json
{ "idempotency_key": "uuid-v4 generated once per action on the phone",
  "client_ts": "2026-10-12T08:15:30+08:00",
  "gps": {"lat": 14.29, "lng": 121.01, "accuracy_m": 12.5},
  "gps_denied_reason": "denied|unavailable|timeout|null" }
```
`gps` null + `gps_denied_reason` when location is unavailable (the action still succeeds; GPS stored as null + reason).
Times: `client_ts` (phone clock; replaced by server time when absent, > 3 days old or > 10 min in the future) is the action time, `received_at` is
the server time; both stored. Responses: `{"ok": true, "already_done": false, "replayed": false, "done_by": null | {"name","role","at"}, "batch": <BatchDetail>}`
where `batch` is the fresh BatchDetail (section 5) so the app can re-render from one response.
Errors: `{"detail": {"message": "human text", "code": "validation|out_of_order|forbidden|not_found|conflict|storage_disabled", "errors": [{"key","message"}]}}`
(`errors` only for 422). Apps must also tolerate FastAPI's plain-string `detail` (401/403 from guards).

## 4. Crew endpoints (prefix `/api/driver`, roles `driver`, `helper`; GET also `admin` with `?driver_id=`)

Existing (extended): `GET /me`, `GET /today`, `GET /history?days=|from=&to=`, `GET /assignments/{batch_id}`. Scope for drivers AND helpers: batches where own
staff id is `driver_id` or in the helper set. `/me` adds `role` ("driver"|"helper") and `warehouse`.

New:
- `GET /templates` -> `{"photo_storage_enabled": bool, "acknowledge_checklist": Template, "delivery_checkout": Template}` (active versions). The app caches it for offline use.
  `Template = {"id","kind","version","name","is_draft","items":[{"id","key","label","item_type","required","options","prefill","show_when","position"}]}`.
  `item_type`: checklist = `checkbox|count|photo|note`; checkout = `text|textarea|dropdown|radio|number|date|datetime|photo|signature|checkbox`.
  `show_when = {"key": "<other item key>", "in": [values]}`: item is visible (and, if `required`, required) only while that other item's value is in the list.
  When `photo_storage_enabled` is false the app hides `photo`/`signature` items and the server does not require them.
- `GET /officers` -> `[{"id","name"}]` active `logistics_officer` users (for the handover picker).
- `GET /batches/{batch_id}/route` -> `{"source":"optimized|assignment","origin":{"name","address","lat","lng"},"stops":[{"so_id","so_number","customer_name","address_text","sequence","status","lat","lng","navigate_url"}],"maps_links":[{"label","url"}],"warning":null|"text"}`.
  `maps_links`: Google Maps directions URLs (`https://www.google.com/maps/dir/?api=1&origin=..&destination=..&waypoints=a|b|..&travelmode=driving`), no API key; split into several
  links when there are more than 9 intermediate stops (label "Part 1 of 2"). Origin = the warehouse of the driver (METS/GLACIER, `services/warehouses.py`).
  Order = frozen `trip_stops.sequence` once the trip started; before that the optimize-stops sequence if present, else assignment order.
- `POST /batches/{batch_id}/orders/{so_id}/acknowledge` body: common + `{"template_id": 1, "answers": [{"item_id": 3, "checked": true, "count": null, "text": null, "photo_id": null, "note": "short by 2 packs"}], "discrepancy_note": null}`.
  Validated against the template named by `template_id` (older versions stay valid for offline phones; default = active). Stores template id + version.
- `POST /batches/{batch_id}/start` body: common.
- `POST /batches/{batch_id}/orders/{so_id}/check-in` body: common. Response `batch` includes the stop's `checkin_distance_m` / `checkin_far` (warning only, > 500 m, only when the address has coordinates).
- `POST /batches/{batch_id}/orders/{so_id}/check-out` body: common + `{"template_id": 2, "answers": {"outcome": "Delivered", "received_by": "Ana", "reason": null, "delivery_photo": 12, "signature": 13, ...}}`
  (answers keyed by item `key`; photo/signature values are `photo_id`s from `/uploads`). `outcome` must be one of the template's options; `reason` required for Partially delivered / Failed / Returned.
- `POST /batches/{batch_id}/end` body: common (+ distance from the warehouse is computed when coordinates are known).
- `POST /batches/{batch_id}/handover` body: common + `{"officer_user_id": 7, "note": null, "items": [{"so_id": "...", "handed_over": true, "note": null}]}`.
- `GET /batches/{batch_id}/timeline` -> read-only full timeline (shape in section 7), crew of the batch or admin/dispatcher.
- `POST /uploads` multipart: `file` (jpeg/png/webp, <= 5 MB), `batch_id`, `so_id?`, `field_key`, `upload_key` (client uuid; retry-safe) -> `{"photo_id": 12, "content_type", "size_bytes"}`. 503 `storage_disabled` when R2 is not configured.
- `GET /api/media/{photo_id}` -> 302 to a 10-minute presigned URL; allowed for crew of that batch, officers, admin, dispatcher.

## 5. Batch payloads (extended)

`Batch` (Today/History list item) keeps all existing fields and adds:
```json
"trip": {"status": "pending|on_trip|returned|handover_submitted|closed", "chip": "to_acknowledge|ready|on_trip|returned|handover_pending|closed", "chip_label": "On trip · stop 2 of 5",
         "acknowledged": 2, "total": 5, "stops_done": 1, "current_stop_so_id": null, "started_at": null, "ended_at": null,
         "next_action": "acknowledge|start|check_in|check_out|end|handover|wait_officer|none",
         "can_start": false, "can_end": false, "can_submit_handover": false, "blocker": "Acknowledge all 5 SOs to start the trip (3 left).",
         "handover_status": null, "officer": null},
"crew": [{"id": 9, "name": "Emert", "role": "driver", "phone": "0948..."}, {"id": 17, "name": "Raymond", "role": "helper", "phone": "..."}]
```
`stop_order_set` becomes true when an optimized sequence exists or the trip started. `helpers` stays (helpers only, phone for tap-to-call).
Phase 0 additions (2026-10-13): `total_kg`, `total_packs`, `so_count` and every progress number come from ONE read model, `services/day_model.py`
(also used by Driver Overview and the reconciliation check). `total_packs` is **null** (shown "-") when no line of the batch is counted in packs
(unit `pck`/`pack`/`packs`; see `services/pack_units.py`), never 0; `kg_complete` is false while any line has no known weight; `progress` =
`{acknowledged, stops_done, delivered, partial, failed}`; `trip_number` / `trips_on_date` number the batches of one delivery date by assignment time
("Trip 1", "Trip 2" - two Assign clicks to the same truck are two real trips and are never merged); `assigned_at`.
`BatchDetail` = Batch + `orders[]`, each existing order field plus:
```json
"workflow": {"ack": null | {"at","by": {"user_id","name","role"},"template_version"},
             "stop": null | {"sequence","status","checkin_at","checkin_by","checkin_distance_m","checkin_far","checkout_at","checkout_by","outcome","reason"},
             "can_acknowledge": true, "can_check_in": false, "can_check_out": false, "blocker": "Check out of SO-123 first." }
```
Buttons the app shows are driven ONLY by these flags / `trip.next_action`; where an action is not allowed the app shows `blocker` text.
A history Batch also carries `trip.handover_status` and `ended_at`; the `/timeline` is the read-only detail.

## 6. Officer endpoints (prefix `/api/officer`, roles `logistics_officer`, `admin`; GET also `dispatcher`)

- `GET /handovers?status=pending|all|closed&q=&from=&to=&driver_id=` -> `[{"handover_id","batch_id","delivery_date","vehicle","driver":{"id","name"},"helpers":[...],"submitted_at","officer":{"id","name"}|null,"for_me":bool,"status","totals":{"invoices","handed_over","not_handed_over","received","missing","discrepancy","pending"}}]`, newest first. `pending` = status pending or acknowledged-with-open-items.
- `GET /handovers/{handover_id}` -> the row above + `"items":[{"item_id","so_id","so_number","customer_name","handed_over","crew_note","officer_status","officer_note","checked_at","checked_by"}]` + `"stops":[{"so_number","customer_name","outcome","reason","checkout_at"}]` + `"events"`.
- `POST /handovers/{handover_id}/validate` body: common + `{"items":[{"item_id":1,"status":"received|missing|discrepancy","note":null}]}` -> every item must be given a status. Records `officer_acknowledged_at`;
  all `received` -> handover `closed` + trip `closed` (+ `trip_closed` event); otherwise handover `acknowledged` and the trip stays `handover_submitted`.
- `POST /invoices/{item_id}/resolve` body: common + `{"status":"received","note":"found it"}` -> later resolution of a missing/discrepancy/pending item; closes handover + trip when nothing is left open.
- `GET /outstanding` -> `[{"item_id","handover_id","batch_id","so_number","customer_name","officer_status","officer_note","crew_note","delivery_date","driver":{...},"age_hours"}]` = every item not `received` (pending, missing, discrepancy) across all dates, oldest first.
- `GET /history?q=&from=&to=&driver_id=` -> validated/closed handovers + items, search by SO number, driver name, date.

## 7. Timeline (one builder, used by crew `/timeline`, officer detail, overview)

`{"batch": Batch, "trip": {...all trip fields..., "duration_minutes"}, "crew":[...], "orders":[{"so_id","so_number","customer_name","address_text",
"ack": {"at","by","template_version","answers":[{"label","type","value","note"}],"discrepancy_note"} | null,
"stop": {"sequence","status","checkin":{"at","by","gps","distance_m","far"}|null,"checkout":{"at","by","gps","outcome","reason","answers":[{"label","value","photo_url"?}],"template_version"}|null,"minutes_at_stop"},
"handover": {"handed_over","crew_note","officer_status","officer_note","checked_at","checked_by"} | null}],
"events":[{"type","at","received_at","by","so_number","gps"}]}`. Photo values are `photo_id`s; the app renders `/api/media/{id}`.

## 8. Driver Overview (prefix `/api/driver-overview`, roles `admin`, `dispatcher`; templates PUT/POST admin only)

All dates are Manila dates (`YYYY-MM-DD`); default today. `warehouse` = METS|GLACIER (driver's staff warehouse).
- `GET /summary?date=|from=&to=&warehouse=&driver_id=` -> `{"from","to","generated_at","kpis":{"drivers":{"active","on_trip","returned","idle"},"sos":{"assigned","acknowledged","delivered","partial","failed"},"trips_pending_handover","invoices_outstanding"}}`
  - drivers (primary drivers only, helpers excluded): `active` = has >= 1 batch in range; `on_trip` = >= 1 trip `on_trip`; `returned` = active, none on_trip/pending-start, all their trips returned/handover_submitted/closed; `idle` = staff drivers (role DRIVER, active, in filter) with no batch in range.
  - sos: `assigned` = SOs in batches; `acknowledged` = SOs with an acknowledgement; `delivered`/`partial`/`failed` = checked-out SOs by outcome (Delivered / Partially delivered / Failed / Returned).
  - `trips_pending_handover` = trips with status `returned` or `handover_submitted`; `invoices_outstanding` = handover items not `received` (all dates, unaffected by the range) .
- `GET /reconcile?date=&source=auto|memory|neon` (**admin only**, never cached, no Zoho) -> for one date, per person (driver or helper): SOs / kg / packs / batches as seen by Load Planning
  Confirmed SO (`routers/load_planning._summary`; in-memory assigned records when warm, else the Neon rows the screen reads for past dates), the Driver App (`driver_assignments.build_batches`)
  and Driver Overview (`overview.board`), plus `mismatches` per person, `lp_missing` (assigned SOs whose data is not in memory), and `ok`. `tests/test_day_model.py` enforces it.
- `GET /board?date=&warehouse=&status=&driver_id=&stale_minutes=15` -> `{"stale_minutes","rows":[{"staff_id","name","role":"driver|helper","warehouse","state":"idle|to_acknowledge|ready|on_trip|returned|handover_pending|closed","vehicle","batch_id","current_stop":"customer name"|null,"progress":{"done":3,"total":5},"last_action":{"type","at","label"},"last_gps_at","stale":bool}]}`;
  **One row per person; progress is the SUM over all of the person's batches that day** (`progress {done,total}`, `acknowledged`, `batch_count`, `kg`, `packs`) and `trips[]` lists each batch ("Trip 1", "Trip 2"), so it always equals the person's own app. `stale` = on_trip and no event for `stale_minutes` (default env `DRIVER_STALE_MINUTES`, UI-adjustable). A person on several batches shows the most active one (on_trip > ready > to_acknowledge > returned > handover_pending > closed).
- `GET /drivers/{staff_id}?from=&to=` -> `{"person":{...},"batches":[Batch + trip summary],"totals":{...}}`; `GET /trips/{batch_id}` -> Timeline.
- `GET /map?date=|from=&to=&driver_id=&warehouse=` -> `{"warehouses":[{"id","name","lat","lng"}],"points":[{"type":"start|checkin|checkout|end","lat","lng","at","so_number","customer_name","batch_id","driver_name","accuracy_m","outcome"}]}` (only points that have GPS).
- `GET /export.csv?from=&to=&warehouse=&driver_id=` one row per SO: date, batch, driver, helpers, vehicle, so_number, customer, acknowledged_at/by, checkin_at, distance_m, checkout_at, outcome, reason, minutes_at_stop, trip_started, trip_ended, handover status, invoice status, officer, validated_at.
- Templates: `GET /templates` -> `{"acknowledge_checklist": {"active": Template, "versions":[{"version","name","is_draft","active","created_at"}]}, "delivery_checkout": {...}}`;
  `POST /templates/{kind}` (admin) body `{"name","items":[{"key","label","item_type","required","options","prefill","show_when","active"}]}` creates version N+1, marks it active (previous inactive), `is_draft=false`. Validates item types/keys/show_when references.
  `GET /templates/{kind}/versions/{version}`.

Cached server-side for 15 s per (params, `trip_events.generation()`); the app polls every 30 s while the tab is visible.

## 9. Photos / signatures

Object storage only (Cloudflare R2, S3-compatible, SigV4 signed with httpx - no new dependency). Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
(optional `R2_ENDPOINT` override). With any unset: `photo_storage_enabled=false`, upload endpoint 503, photo/signature items hidden and not required. Neon stores keys only (`trip_photos`).
The pre-existing `/orders/{id}/proof` writes to the API server's local disk (ephemeral on Render) and is NOT reused.

## 10. Offline queue (driver app)

Actions are queued in IndexedDB (blobs included) in tap order and replayed FIFO when online: on 2xx or `already_done` -> done; on 409 `out_of_order` or 422 -> marked "needs attention" and
shown to the user (never silently dropped); on network error / 5xx -> retry with backoff. Each queued action keeps its original `idempotency_key` and `client_ts`. The UI shows a
"pending sync (n)" badge and applies queued actions optimistically over the last server state.

## 11. Driver app rebuild (2026-10-13): time log, issues, alerts, paging, Overview additions

**Delivery time log** (replaces the 14-field DRAFT checkout; template kind `delivery_checkout`, v2, not a draft). Mirrors the Zoho form "B2B Logistics Delivery"
(Name / Sales Order Number / Invoice or DR Number / Time Logs). It is a TIME LOG submitted twice per stop:

| Step | App action | Recorded |
|---|---|---|
| Check-in (4) | one tap "Arrived at site" (`POST .../check-in`) | Time Logs = Arrived at Site: crew member (Name), SO, server time + phone time, GPS (or the reason it was denied), distance from the address |
| Check-out (5) | "Departed from site" form (`POST .../check-out`) | Time Logs = Departed from Site: same, plus **Invoice or DR Number** (item `invoice_dr_number`, type `numeric_text` = digits only, text so leading zeros survive; prefilled from `order.invoice_hint` when the SO already in memory lists exactly one invoice, never a Zoho call) |
| App-only extras | `outcome` (Delivered / Partially delivered / Failed), `reason` (required unless Delivered), `delivery_photo`, `notes` | flagged `app_only` in Settings ("added in app, not in Zoho form"); Logistics can switch each off. With no `outcome` item every stop is recorded as Delivered |

Handover (steps 8-9): one carbon-copy line per SO = SO number + the Invoice/DR number recorded at check-out (`invoice_handover_items.invoice_no`); the officer validates each as received / missing / discrepancy.
Entries stay in our database only. Pushing them into the Zoho form later: see the final report (not implemented, no Zoho Forms call exists in the code).

**Crew endpoints added** (driver / helper only, always the caller's own data):
`GET /api/driver/issues`, `POST /api/driver/issues` (body: `idempotency_key, category, priority normal|high|urgent, description >= 5 chars, batch_id?, so_id?, photo_ids[], client_ts`; replay with the same key returns the stored report),
`GET /api/driver/alerts` -> `{alerts[{key,type assigned|changed|validated|issue,title,body,at,link,priority,read}], unread}` (derived from assignments, trip events, officer validations and issue replies; nothing stored),
`POST /api/driver/alerts/read` `{keys[] | all:true}`, `GET /api/driver/history?status=all|completed|failed&page=&page_size=` (server-side paging; without these params the old shape is returned),
`GET /api/driver/today` now carries `summary {assigned, completed, remaining, needs_attention, open_issues, trips}`, `GET /api/driver/me` carries `staff_id, email, vehicles_today, crew_today`, `GET /auth/support` (public: dispatch phone for "Forgot password").
Uploads: `field_key = issue_photo` with `batch_id = profile` attaches a photo to an issue that is not tied to a trip.

**Driver Overview endpoints added** (admin + dispatcher): `GET /live` (last known fix per truck, process memory only), `GET /trips` (one row per batch in a range), `GET /hardcopies` (every invoice copy not yet validated, who holds it and since when),
`GET /issues`, `POST /issues/{id}/respond` `{status, response}`, `GET /reconcile` (admin). `GET /board` rows also carry `so_numbers` (search), `trips[]`, `state_label`; `GET /map` adds `stop` points (planned stops);
the timeline carries `checkout.invoice_no`, `address_gps`, `assigned_at`; the CSV has `arrived_at, departed_at, invoice_dr_number`.
The Overview refreshes every 15 s while its tab is visible (react-query polling; no WebSocket for business data). Truck movement uses the existing Cartrack WebSocket feed (shared socket) and glides with `MarkerAnimator`.
