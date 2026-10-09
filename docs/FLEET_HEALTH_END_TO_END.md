# Fleet Health end-to-end technical guide

This document explains how the Fleet Health module works from backend data collection to the two frontend tabs: **Maintenance** and **Eco driving**.

Fleet Health is intentionally small and event/history based. It does not mirror raw Cartrack trips, raw Cartrack events, staff, conversations, or live fleet telemetry into Neon. The durable database stores only compact daily stats, service configuration, maintenance events, pre-trip checks, fuel logs, and open/resolved vehicle issues. Current live GPS remains in memory; staff names come from the n8n staff directory cache.

## Main files

Backend:

- `backend/routers/fleet_health.py` exposes `/api/fleet-health/*`.
- `backend/models/fleet_health.py` defines the Fleet Health database tables.
- `backend/services/fleet_health/service.py` runs nightly and backfill daily-stat generation.
- `backend/services/fleet_health/snapshot.py` builds the cached read model used by the UI.
- `backend/services/fleet_health/risk.py` contains pure maintenance, battery, and risk calculators.
- `backend/services/fleet_health/eco.py` contains pure eco-driving, km/L, fuel-check, and CO2 calculators.
- `backend/services/fleet_health/eco_views.py` turns daily stats and fuel logs into leaderboard and truck rollup views.
- `backend/services/fleet_health/ops.py` validates and writes service intervals, maintenance records, fuel logs, and pre-trip checklists.
- `backend/services/vehicle_flags.py` is the single write path for all vehicle issues.

Frontend:

- `artifacts/intellifleet/src/components/fleet-health/FleetHealthPage.tsx` is the page shell and top-level tab switch.
- `artifacts/intellifleet/src/components/fleet-health/MaintenanceTab.tsx` renders the Maintenance tab.
- `artifacts/intellifleet/src/components/fleet-health/EcoTab.tsx` renders the Eco driving tab.
- `artifacts/intellifleet/src/components/fleet-health/TruckDrawer.tsx` renders the vehicle drawer and its internal sections.
- `artifacts/intellifleet/src/components/fleet-health/DrawerSections.tsx` renders Services, History, Issues, and Checklists.
- `artifacts/intellifleet/src/components/fleet-health/DrawerCharts.tsx` renders Fuel, Battery, and Distance.
- `artifacts/intellifleet/src/services/api/fleetHealth.ts` is the typed API client.
- `artifacts/intellifleet/src/lib/fleetHealth.ts` contains frontend formatting, validation, scoring display helpers, filter/sort helpers, and permission helpers.
- `artifacts/intellifleet/src/components/fleet-health/hooks.ts` contains React Query keys, fetch hooks, invalidation rules, role permissions, and local UI state helpers.

## Data model and persistence rules

The Fleet Health tables are defined in `backend/models/fleet_health.py` and documented in `docs/DATABASE.md`.

### `vehicle_daily_stats`

One row per tracked RGF vehicle per Manila day. This is the compact daily aggregate created by the nightly job or admin backfill. It stores odometer start/end, km, trip count, engine seconds, idle split, speeding, harsh events, battery voltage summaries, fuel-sensor estimates, primary staff id, assignment state, data quality, and computation time.

It deliberately does not store raw trips or raw Cartrack events.

### `service_intervals`

Stores service thresholds. A row can be a fleet default (`vehicle_id` is null) or a per-truck override (`vehicle_id` set). Supported service types are:

- `oil_change`
- `tires`
- `brakes`
- `reefer_service`
- `general_pms`
- `battery`

Intervals can be based on km, engine hours, days, or any combination. The effective interval is the per-truck override when present, otherwise the fleet default.

### `maintenance_records`

Stores user-entered service, repair, and inspection history. Service records reset service interval usage. Repair records can include downtime start/end and feed the risk score.

### `vehicle_flags`

Stores open/resolved issues. All issue sources must go through `services/vehicle_flags.py -> report_issue()`. This gives one validation and deduplication path for manual reports, checklist failures, battery flags, fuel flags, overload flags, email, voice, WhatsApp, and future driver-app reports.

Open flags are deduplicated by vehicle + source + Manila day + normalized message. A resolved flag can be raised again.

### `pretrip_checklists`

Stores one entered checklist event. The checklist items are fixed in `config.CHECKLIST_ITEMS`: tires, lights, brakes, leaks, mirrors/wipers, body damage, reefer running, and documents. Each item is `ok`, `issue`, or `na`.

### `fuel_logs`

Stores user-entered fill-ups: litres, amount, odometer, full-tank marker, station, receipt reference, staff id, and creator.

Fuel logs are the source for km/L and CO2. The analog fuel sensor is treated only as an estimate for checks, never as the authoritative km/L source.

## Backend data ingestion

### Status sampler

`backend/services/fleet_health/sampler.py` keeps short-lived in-memory status samples from Cartrack `/rest/vehicles/status`. The sample interval is configured as `SAMPLE_INTERVAL_SECONDS = 600`, so the system samples about every 10 minutes.

These samples are used for:

- latest odometer when a fresh sample has odometer data;
- battery parked/running voltage summaries;
- fuel percent changes and estimated refuels/drops;
- data quality flags when a day has large sample gaps.

Samples are retained for only a few days and are not bulk persisted.

### Nightly daily-stat job

`services/fleet_health/service.py -> run_nightly()` computes the previous complete Manila day. It:

1. Matches RareChain vehicles to Cartrack trackers through `matching.match_fleet()`.
2. Loads that day's assigned sales-order history for tracked plates with one Neon query.
3. Fetches Cartrack trips for each tracked vehicle through `/rest/trips/{registration}`.
4. Geocodes assigned delivery addresses, using an in-memory geocode cache, so idle near customer stops can be estimated.
5. Reads in-memory status samples for the vehicle.
6. Calls `daily.compute_daily_row()` to produce one compact daily row.
7. Upserts one `vehicle_daily_stats` row per vehicle/date.
8. Runs automatic issue detection through `automation.evaluate_vehicle()` for battery and fuel conditions.
9. Commits and invalidates the Fleet Health snapshot cache.

Third-party trucks and vehicles without trackers do not get daily rows or eco scores.

### Backfill

`run_backfill()` computes the last N complete Manila days. It fetches historical trips, but historical status samples are not available, so battery and fuel-sensor fields remain null and the row data quality marks the row as backfill/no status samples.

The admin endpoint is:

- `POST /api/fleet-health/backfill?dry_run=true&days=30`

Default `dry_run=true` computes rows without writing them.

## Cached read model

`backend/services/fleet_health/snapshot.py` builds the UI read model. A rebuild reads a small set of tables:

- `vehicles`
- `service_intervals`
- `maintenance_records`
- `vehicle_flags`
- `pretrip_checklists`
- `vehicle_daily_stats`
- `fuel_logs`

The read model is cached for `SNAPSHOT_TTL_SECONDS = 300` seconds. Every write path commits and calls `snapshot.invalidate()`, so edits are visible after the next fetch.

The snapshot builds:

- vehicle tracker status;
- current odometer;
- effective service status per service type;
- open flags;
- failed checklist counts;
- repair/downtime state;
- battery latest state;
- risk score;
- fleet KPIs;
- needs-attention list;
- eco KPIs for the last full week;
- 30-day fleet km/L and current-month CO2.

## API endpoints

Read endpoints:

- `GET /api/fleet-health/summary`
- `GET /api/fleet-health/trucks`
- `GET /api/fleet-health/trucks/{vehicle_id}`
- `GET /api/fleet-health/eco/drivers?week=YYYY-MM-DD`
- `GET /api/fleet-health/eco/trucks?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/fleet-health/eco/fuel-checks?days=30`
- `GET /api/fleet-health/eco/co2?months=12`
- `GET /api/fleet-health/fuel-logs?vehicle_id=&limit=`
- `GET /api/fleet-health/eco/scorecard?week=YYYY-MM-DD`
- `GET /api/fleet-health/matching`
- `GET /api/fleet-health/sampler`

Write endpoints:

- `POST /api/fleet-health/maintenance-records`
- `PUT /api/fleet-health/maintenance-records/{record_id}`
- `DELETE /api/fleet-health/maintenance-records/{record_id}`
- `PUT /api/fleet-health/service-intervals`
- `DELETE /api/fleet-health/service-intervals/{interval_id}`
- `POST /api/fleet-health/fuel-logs`
- `PUT /api/fleet-health/fuel-logs/{log_id}`
- `DELETE /api/fleet-health/fuel-logs/{log_id}`
- `POST /api/fleet-health/pretrip-checklists`
- `POST /api/fleet-health/issues`
- `POST /api/fleet-health/flags/{flag_id}/resolve`
- `PUT /api/fleet-health/eco/scorecard`
- `POST /api/fleet-health/backfill`

Roles:

- `admin`, `dispatcher`, `warehouse` can view.
- `admin`, `dispatcher` can edit maintenance records, service intervals, resolve flags, and edit most data.
- `admin`, `dispatcher`, `warehouse` can enter fuel logs, pre-trip checklists, and issue reports.
- admin-only operations include backfill and scorecard switch changes.

## Maintenance logic

### Service status

Implemented in `risk.service_status()`.

For a service type, the backend finds:

1. the effective interval;
2. the latest matching service record;
3. current odometer, if the vehicle is tracked;
4. engine hours since the service record, from daily rows after the service date;
5. days since the service record.

Usage is the maximum of every measurable component:

- km since service / interval km;
- engine hours since service / interval engine hours;
- days since service / interval days.

Status:

- `ok`: usage below 80%;
- `due_soon`: usage from 80% through 100%;
- `overdue`: usage above 100%;
- `no_record`: interval exists but either no service record exists, or a service record exists but there is not enough data to measure usage;
- `not_tracked`: no active interval exists.

The backend includes a note so the UI can distinguish "never serviced in Fleet Health" from "service exists, but usage data is missing." The UI displays bars using `ServiceBar`, tooltips using `serviceTipLines()`, and a detailed service card in the drawer Services section.

### Risk score

Implemented in `risk.risk_score()`.

Risk is a 0-100 score:

- service: 40 points if any service is overdue, 20 points if worst service is due soon;
- open issues: critical 15 each, warning 5 each, info 0, capped at 25; checklist-sourced issues are shown as issues but do not add a second open-issue risk penalty because the failed checklist is counted separately;
- failed pre-trip checks in 7 days: 5 each, capped at 15;
- overload flags in 30 days: 2 each, capped at 10;
- repair records in 90 days: 5 each, capped at 10.

Bands:

- low: 0-29;
- medium: 30-59;
- high: 60+.

A vehicle needs attention when its band is high or any service is overdue.

### Battery logic

Implemented in `risk.battery_day_status()` and `risk.battery_flag_decision()`.

The electrical system is inferred from running voltage:

- above 20 V is treated as a 24 V system;
- otherwise it is treated as 12 V when enough data exists.

Battery day status:

- critical if parked minimum is below the critical parked threshold;
- warning if parked minimum is below the warning threshold;
- warning if running average is outside the normal charging range;
- no data if no usable battery data exists.

A battery issue flag is raised after:

- one critical day; or
- two consecutive warning-or-worse days.

The drawer Battery section explains parked voltage, running voltage, system inference, and shows 30/60/90-day chart ranges.

## Eco driving logic

### Driver weekly score

Implemented in `eco.driver_eco_score()` and presented by `eco_views.driver_scores()`.

The default week is the last full Monday-Sunday Manila week. A driver needs at least 50 assigned km in that week to receive a score. Unassigned days are excluded from driver scoring.

Score starts at 100 and subtracts penalties:

- Speeding: seconds over limit per 100 km x 0.05, capped at 30.
- Harsh driving: harsh braking + harsh acceleration + harsh cornering per 100 km x 2.5, capped at 25.
- Idle elsewhere: idle minutes away from stops per driving hour x 1.0, capped at 25.
- Fuel economy: percent below fleet-average km/L x 0.5, capped at 20, only when fuel logs support a km/L comparison.

Idle at stops is shown but not penalized, because warehouse/customer stop idle may be operationally necessary, especially for reefer cooling. The current idle split is an estimate from trip start/end coordinates near warehouses or assigned delivery points; it is not a precise stationary-position reconstruction from timestamped GPS samples.

Driver attribution is inferred from assignment history. A vehicle-day is excluded from individual driver scoring when no driver assignment exists, multiple different drivers are assigned to the same vehicle-day, or distance is unknown. Those exclusions prevent ambiguous attribution or missing distance from silently becoming a zero-kilometer "good" day.

Bands:

- great: 85+;
- good: 70-84;
- watch: 50-69;
- poor: below 50;
- none: not enough data.

### Truck eco rollups

`eco_views.truck_rollups()` builds per-truck totals for a selected date range:

- assigned and unassigned km;
- engine/driving hours;
- speeding;
- harsh events;
- idle split;
- days with data;
- km/L intervals;
- litres and spend from fuel logs;
- CO2 from logged diesel purchases.

The frontend Eco driving tab lets the user switch between driver leaderboard and truck rollups.

### km/L logic

Implemented in `eco.full_to_full()`.

km/L is calculated only between consecutive full-tank fill-ups:

1. the first full fill becomes the anchor;
2. the next full fill closes the interval;
3. km = closing odometer - anchor odometer;
4. litres = all litres added after the anchor through the closing full fill;
5. km/L = km / litres.

Intervals without both odometers, non-positive km, or non-positive litres are skipped.

### Fuel checks

Fuel checks are not accusations; they are second-look prompts.

Two sources feed fuel checks:

- user-entered fuel logs;
- daily sensor estimates from the analog fuel percentage.

Fuel log checks include:

- fill litres above tank capacity x 1.05;
- full-to-full km/L outside the plausible configured range of 2.0 to 18.0 km/L.

Sensor checks include:

- possible parked fuel drops;
- estimated refuels from large fuel-percentage rises.

For trucks with unconfirmed fuel capacity, the UI marks estimates and warnings with a capacity-unconfirmed note.

### CO2 logic

Implemented in `eco.co2_kg()`.

CO2 is based only on logged diesel litres purchased in the period:

`CO2 kg = litres x 2.68`

The CO2 panel can display fleet totals or truck contributions by month. This is an estimate from fuel purchases, not a claim that the same litres were consumed inside that exact month.

## Frontend page flow

### Page shell

`FleetHealthPage.tsx`:

1. Loads session permissions through `useSessionRole()`.
2. Loads summary via `useSummary()`.
3. Loads trucks via `useTrucks()`.
4. Stores the selected top-level tab in localStorage key `fh-tab`.
5. Shows KPI tiles from `buildKpiTiles()`.
6. Shows an intervals banner when fleet service defaults include unconfirmed placeholder rows.
7. Renders either Maintenance or Eco driving.
8. Owns page-level modals for fleet-level checklist, fleet interval editor, repair record prompt, and truck drawer.

React Query keys are all rooted under `["fh"]`. Summary and trucks refetch every 60 seconds, which is shorter than the backend snapshot TTL but avoids aggressive polling.

## Maintenance tab

Implemented in `MaintenanceTab.tsx`.

### KPI strip

KPI values come from `GET /summary`:

- trucks needing attention;
- maintained trucks;
- services overdue;
- open issues;
- fleet km/L over 30 days;
- current-month CO2;
- last-week average eco score and scored drivers.

### Needs attention this week

The list comes from `summary.needs_attention`. It includes maintained vehicles where:

- risk is high; or
- at least one service is overdue.

Each card opens the truck drawer.

### Vehicles table

The table comes from `GET /trucks`. It includes maintained rows and third-party rows.

Maintained rows show:

- plate and vehicle type;
- reefer marker;
- tracker status;
- current odometer;
- service bars;
- open issue count;
- last checklist status;
- risk score;
- repair/downtime prompts.

Third-party rows are visible but are excluded from service tracking, risk, eco scoring, and fleet numbers.

Filtering and sorting are performed in frontend helpers:

- query search by plate/type;
- filters for all, needs attention, overdue, and has open issues;
- risk-first sorting.

### Repair prompt

When a vehicle is locked for a repair-like reason in `routers.fleet.LOCKED_VEHICLES`, `snapshot.build_truck()` sets `offer_repair_record` unless an open repair record already exists. The UI prompts dispatchers/admins to add a repair record. If an open repair record exists, the UI shows "In repair" and offers to close downtime by setting `downtime_end`.

## Truck drawer sections

Implemented in `TruckDrawer.tsx`, `DrawerSections.tsx`, and `DrawerCharts.tsx`.

The drawer has internal tabs stored in localStorage key `fh-drawer-section`:

- Overview
- Services
- History
- Issues
- Checklists
- Fuel
- Battery
- Distance

### Overview

Shows the truck header, tracker pill, odometer, risk badge, capacity marker, repair state, and locked reason.

The main risk breakdown is a stacked display of the backend breakdown returned by `risk_score()`. Each segment includes:

- factor label;
- points;
- maximum points;
- detail text;
- formula text.

The overview also summarizes last checklist, open issues, service state, and repair prompts.

### Services

Shows one detailed service card for every applicable service type. Non-reefer vehicles do not show reefer service.

Each service card shows:

- status;
- usage percentage;
- limiting component;
- km, engine-hour, and day components;
- latest service record;
- effective interval;
- whether the interval is fleet default or truck override;
- whether the interval is confirmed or placeholder.

Admin/dispatcher users can log a service from here. Saving a service creates or updates `maintenance_records`, invalidates summary/trucks/truck detail queries, and causes service usage/risk to recompute.

### History

Shows service, repair, and inspection records newest first.

Admin/dispatcher users can:

- add records;
- edit records;
- delete records;
- close an open downtime by setting `downtime_end`.

Repair records with downtime contribute to the Downtime subsection and to risk.

### Issues

Shows open and recent resolved flags from `vehicle_flags`.

Admin/dispatcher users can resolve open flags with an optional note through `POST /flags/{id}/resolve`. Warehouse users can report issues but do not resolve them.

The manual issue form posts to `POST /issues` with `source: "manual"`. If an identical open issue exists for the same vehicle/source/day/message, the backend returns `200` and `created: false`; the UI treats that as success.

### Checklists

Shows recent pre-trip checklists. Each checklist stores all fixed checklist items, reefer temp if entered, notes, pass/fail, staff id, and entered-by user.

Submitting a checklist posts to `POST /pretrip-checklists`. If any item is marked `issue`, `ops.save_checklist()` immediately calls `vehicle_flags.report_issue()` with:

- source `checklist`;
- severity `critical` when brakes failed, otherwise `warning`;
- reference `checklist:{id}`;
- message listing failed items and optional notes.

### Fuel

Shows fuel logs, latest full-to-full km/L, total fills, litres, spend, and checks.

Adding or editing a fuel log posts to `/fuel-logs`. The frontend validates required filled time, litres, amount, optional odometer, station, receipt reference, and full-tank marker. Price per litre is computed for display.

Fuel logs invalidate fuel-related queries: summary, truck detail, eco queries, and fuel logs.

### Battery

Shows latest battery status and a 30/60/90-day chart from `battery_series`.

The chart displays:

- parked minimum voltage;
- running average voltage;
- warning/critical parked thresholds;
- normal running voltage band;
- per-day status reasons.

No-tracker vehicles show a no-voltage empty state.

### Distance

Shows daily km, assigned/unassigned split, engine hours, trips, and partial-day warnings for 30 or 60 days.

Distance comes from daily stats generated by the nightly job. No-tracker vehicles show a no-distance empty state.

## Eco driving tab

Implemented in `EcoTab.tsx`, `EcoDrivers.tsx`, `FuelPanels.tsx`, and `ScorecardCard.tsx`.

### View toggle

The Eco driving tab has two internal views stored in localStorage key `fh-eco-view`:

- Drivers
- Trucks

### Drivers view

Fetches `GET /eco/drivers`. The week picker passes any date inside the wanted week; the backend normalizes it to Monday.

The view shows:

- scoring explainer;
- summary strip;
- driver leaderboard;
- score band;
- previous-week score and trend;
- trucks driven;
- totals;
- penalty breakdown.

Drivers with fewer than the configured minimum assigned km show "not enough data" rather than a score. Ambiguous multi-driver days and assigned days with unknown distance are excluded before the minimum-distance check.

### Trucks view

Fetches `GET /eco/trucks` for a selected date range.

The view shows each tracked maintained truck's eco totals, fuel usage, spend, CO2, and km/L where fuel logs support it.

### Fuel log panel

Fetches `GET /fuel-logs`. It lists recent fill-ups across the fleet, including price per litre, full-tank marker, km/L if the fill closes an interval, and any check reason.

Users with entry permission can add fuel logs. Admin/dispatcher users can edit existing logs.

### Fuel checks panel

Fetches `GET /eco/fuel-checks`. It combines:

- sensor checks from daily stats;
- fuel-log checks from entered fill-ups.

Every check is worded as "check" or "possible" because the fuel sensor is analog and estimates are not treated as conclusions.

### CO2 panel

Fetches `GET /eco/co2`. It groups fuel logs by Manila month and converts litres to CO2 kg with the configured diesel factor. The panel labels this as CO2 from fuel purchases because the source is the fill-up log, not exact fuel consumed during the operating month.

### Scorecard panel

Fetches `GET /eco/scorecard`.

The backend returns:

- switch status;
- preview messages for the selected week;
- which drivers would receive a message;
- skip reasons, such as not enough data or no phone.

`PUT /eco/scorecard` changes the switch and is admin-only. The GET endpoint only previews; it does not send messages.

## Forms and validation

### Maintenance record form

Frontend: `RecordForm.tsx`.

Backend: `ops.save_record()`.

Validation:

- kind must be `service`, `repair`, or `inspection`;
- service records require a valid service type;
- performed date is required and cannot be in the future;
- downtime end requires downtime start;
- downtime end must be after downtime start;
- odometer, engine hours, cost, and text fields have limits;
- receipt is a link/reference only, not file content.

### Service interval editor

Frontend: `IntervalEditor.tsx`.

Backend: `ops.save_interval()`.

Logic:

- fleet default applies to every truck without an override;
- truck override beats fleet default;
- saving marks changed rows confirmed unless `confirmed=false`;
- at least one of km, engine hours, or days is required;
- fleet defaults cannot be deleted, only edited;
- truck overrides can be deleted to return to fleet default.

### Fuel log form

Frontend: `FuelLogForm.tsx`.

Backend: `ops.save_fuel_log()`.

Validation:

- filled time required and cannot be in the future;
- litres required and must be positive;
- amount required and non-negative;
- odometer optional but bounded;
- receipt is a link/reference only;
- full-tank marker controls km/L interval calculation.

### Checklist form

Frontend: `ChecklistForm.tsx`.

Backend: `ops.save_checklist()`.

Logic:

- missing items default to `na`;
- unknown item keys are rejected;
- any `issue` makes the checklist fail;
- failed checklists create a vehicle flag in the same transaction;
- brake failures are critical; other failures are warning.

### Issue form

Frontend: `IssueForm.tsx`.

Backend: `vehicle_flags.report_issue()`.

Validation:

- vehicle id or normalized plate must resolve to a maintained vehicle;
- source must be one of the configured sources;
- severity must be info, warning, or critical;
- message is required and limited to 500 characters;
- references and reporter fields are length-limited;
- photo reference must not be `data:` content;
- occurrence time cannot be in the future;
- third-party vehicles are rejected.

## Query invalidation

`hooks.invalidateFleetHealth()` keeps invalidation scoped:

- maintenance writes invalidate summary, trucks, and truck detail;
- fuel writes invalidate summary, truck detail, eco queries, and fuel logs;
- scorecard switch writes invalidate scorecard queries.

The backend also invalidates its own snapshot cache after writes.

## End-to-end examples

### Logging a service

1. User opens a truck drawer.
2. User opens Services or History and clicks Log service.
3. `RecordForm` validates the fields and calls `createRecord()`.
4. API posts to `/maintenance-records`.
5. `ops.save_record()` validates and inserts `maintenance_records`.
6. Router commits and invalidates `snapshot`.
7. Frontend invalidates maintenance queries.
8. Next read rebuilds service usage from the new record.
9. Risk score and needs-attention state update.

### Failed pre-trip check

1. Warehouse/admin/dispatcher opens New pre-trip check.
2. User marks one or more checklist items as issue.
3. Frontend posts to `/pretrip-checklists`.
4. `ops.save_checklist()` writes `pretrip_checklists`.
5. The same function creates a vehicle flag through `vehicle_flags.report_issue()`.
6. Router commits and invalidates snapshot.
7. Truck risk increases through failed checklist points and open-flag points.
8. The issue appears in the drawer Issues section.

### Fuel log and km/L

1. User adds a fill-up with litres, amount, odometer, and full-tank marker.
2. Backend writes `fuel_logs`.
3. `eco.full_to_full()` waits for two full-tank fills with odometers.
4. When a closing full fill exists, km/L is computed.
5. Fuel panels, truck drawer Fuel section, fleet km/L KPI, driver fuel penalty, and CO2 panel update from the same fuel-log data.

### Nightly eco update

1. Sampler collects status throughout the day.
2. At the configured nightly time, `run_nightly()` fetches trips for the previous Manila day.
3. Assignments from historical sales orders identify driver and stops.
4. `daily.compute_daily_row()` creates one compact row.
5. `vehicle_daily_stats` is upserted.
6. Battery/fuel automation may raise flags.
7. Eco driver and truck views use the new daily row on the next read.

## Important constraints

- Do not add a new Fleet Health table, column, or persistence path without explicit approval and a `docs/DATABASE.md` update.
- Do not bulk mirror Cartrack or Zoho into Neon.
- Today/live operational views must use live APIs or in-memory caches, not Neon.
- Staff ids are plain integers from n8n, not Neon foreign keys.
- Third-party trucks are displayed for clarity but excluded from maintenance, risk, daily stats, and eco scoring.
- Fuel sensor values are estimates and must be worded as checks, not conclusions.
- Idle-at-stop values are estimates from trip endpoints and assigned stops unless timestamped stationary GPS data is added later.
- Individual driver eco scores should not use ambiguous multi-driver days or unknown-distance days.
