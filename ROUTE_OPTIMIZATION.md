# IntelliFleet Routes and Route Optimization

This document explains the Routes workspace as it exists in the repository, including the active frontend component, the FastAPI endpoints, the external mapping providers, persistence, the OR-Tools fleet solver, every route-related button, and the limits of the current implementation.

## 1. What the Routes tab does

The Routes workspace contains two related workflows:

1. **Point-to-point route planning.** A dispatcher selects a starting point and destination from real geocoding suggestions. IntelliFleet requests a road distance, travel duration, and road-following geometry, then displays the result on Leaflet. The dispatcher can save that plan and assign one or more live vehicles.
2. **Fleet route optimization.** A dispatcher asks the backend to optimize all eligible pending deliveries across the live fleet. The backend builds a constrained vehicle-routing problem, solves it with OR-Tools, displays a proposal, and applies it only after an explicit confirmation.

The first workflow answers: “How do I get from this origin to this destination?” The second answers: “Which vehicles should serve the current pending deliveries, in what order, while respecting capacity, temperature capability, time windows, shifts, and the selected objective?”

## 2. End-to-end architecture

```text
Routes page
  |
  | search origin/destination
  v
GET /routes/search --------------------> Mapbox geocoder, then Nominatim fallback
  |
  | selected coordinates are sent with the plan request
  v
POST /routes/plan ---------------------> Mapbox traffic matrix/route, then ORS/OSRM fallback
  |
  +--> RoutePlanResult --> Leaflet geometry + START/END markers + metrics
  |
  +--> POST /routes, /routes/{id}/stops, /manifests  (Save & assign)

Optimize pending deliveries
  |
  v
POST /optimization/preview ------------> live PostgreSQL fleet/orders/profiles
  |                                      + road travel matrix
  |                                      + OR-Tools CVRPTW solver
  v
proposal stored as OptimizationRun
  |
  v
POST /optimization/apply --------------> snapshot re-validation
                                         routes, stops, manifests, order links,
                                         and road polylines are persisted
```

## 3. Frontend implementation

The active frontend is `artifacts/intellifleet/src/App.tsx`. There is an older component named `LegacyRouteWorkspace` in the same file; it is not mounted. The active route component is `RouteWorkspace`.

### 3.1 Routes API types and functions

File: `artifacts/intellifleet/src/services/api/routes.ts`

- `ApiRoute` describes a persisted route returned by `/routes`.
- `ApiRouteStop` describes a persisted stop, including sequence and coordinates.
- `RouteLocationSuggestion` is the normalized location selected by the user: `label`, `lat`, `lng`, and provider `type`.
- `RoutePlanResult` is the point-to-point planning response. It contains origin/destination coordinates, mode, objective text, distance, duration, cost, optional GeoJSON, and warnings.
- `OptimizationRunRoute` and `OptimizeFleetPreviewResult` describe a multi-vehicle optimization proposal.

The request functions are deliberately small wrappers around the shared API client:

| Function | HTTP request | Purpose |
|---|---|---|
| `searchRouteLocations(text)` | `GET /routes/search?text=...` | Autocomplete search for a Philippine location. |
| `planRoute(origin, destination, mode)` | `POST /routes/plan` | Calculates a real road route using the selected coordinates. |
| `createRoute(route)` | `POST /routes` | Creates a route record. |
| `createRouteStop(routeId, stop)` | `POST /routes/{routeId}/stops` | Adds an ordered origin or destination stop. |
| `createManifest(manifest)` | `POST /manifests` | Associates a vehicle with the created route. |
| `previewFleetOptimization(objective, mode)` | `POST /optimization/preview` | Builds and solves a live fleet proposal. |
| `applyFleetOptimization(runId)` | `POST /optimization/apply` | Applies a stored proposal after freshness validation. |
| `optimizeRoute(routeId)` | `POST /routes/optimize` | Legacy/single-route stop reordering path used by Control Tower route cards. |

The point-to-point request includes both the display labels and exact selected coordinates. This prevents a second geocoder call from resolving an ambiguous short name differently from the suggestion the dispatcher selected.

### 3.2 `DataTablePage` route mounting

In `App.tsx`, `DataTablePage` selects the workspace by `kind`. When `kind === "routes"`, it renders:

```tsx
<RouteWorkspace onNotice={setNotice} />
```

The shared page shell supplies the page heading, search bar, Filter button, Columns button, and New route action. The active route workspace supplies the actual route-planning form and map.

The shared `New route`, `Filter`, and `Columns` controls are currently presentation-level controls. The actual working route creation begins inside `RouteWorkspace` after a location plan is calculated. This is an implementation detail worth knowing when testing the screen.

### 3.3 `RouteLocationInput`

`RouteLocationInput` is used twice: once for `Starting point` and once for `Destination`.

1. It keeps the visible text in local state.
2. It keeps a list of provider suggestions in local state.
3. When the text has at least two characters and does not exactly match the selected suggestion, it starts a 350 ms debounce timer.
4. The timer calls `routesApi.searchRouteLocations(query)`.
5. Successful results are displayed in a positioned dropdown.
6. Each suggestion button shows a shortened label and its provider type.
7. Clicking a suggestion stores the full object, including latitude and longitude, in the parent component.
8. Typing after selection clears the stored object. This is intentional: the dispatcher must choose a new suggestion rather than submit stale coordinates under a changed label.

The Calculate button remains disabled until both parent values are non-null. Submitting typed text that was not selected produces the error: `Choose a starting point and destination from the suggestions.`

### 3.4 `LiveRouteMap`

`LiveRouteMap` owns a Leaflet map instance through `mapRef` and a route layer through `layerRef`.

1. The first effect creates a Leaflet map, adds the configured tile layer, stores the map instance, and calls `invalidateSize()` after layout.
2. The cleanup function removes the map when the component unmounts.
3. The second effect removes the previous route layer before drawing new content.
4. If a plan has GeoJSON, it parses the geometry and draws a thick black road-following line.
5. It creates a green START marker and a red END marker with small labels.
6. It binds popups to both endpoint markers using escaped location labels.
7. It adds every live vehicle with finite coordinates as a green circle marker and binds the plate as a tooltip.
8. It fits the map bounds around the route and markers, capped at a useful maximum zoom.

The live trucks shown on this map are context markers from `useVehiclesData`. The planned route line is the selected origin-to-destination plan. A fleet optimization proposal is shown as a result panel; the existing Control Tower map can also show proposed fleet routes through its optimization modal.

### 3.5 `RouteWorkspace` state

The active component keeps these values:

| State | Meaning |
|---|---|
| `origin` | Selected starting-point suggestion with exact coordinates. |
| `destination` | Selected destination suggestion with exact coordinates. |
| `mode` | `fastest`, `cheapest`, `shortest`, or `balanced`. |
| `plan` | Latest point-to-point `RoutePlanResult`. |
| `busy` | Point-to-point calculation in progress. |
| `error` | Point-to-point or save error. |
| `assignOpen` | Whether the truck-assignment dialog is visible. |
| `selectedVehicles` | Vehicle IDs selected for the saved point-to-point route. |
| `saving` | Point-to-point route persistence in progress. |
| `fleetPlan` | Latest multi-vehicle optimization proposal. |
| `fleetBusy` | Fleet optimization request in progress. |
| `fleetError` | Fleet preview or apply error. |
| `fleetApplying` | Fleet proposal application in progress. |

### 3.6 Point-to-point Calculate flow

The form submit handler prevents a browser reload, sets the busy state, clears the previous error, validates both selected locations, and calls:

```tsx
routesApi.planRoute(origin, destination, mode)
```

The response becomes `plan`. React then re-renders the map, route line, endpoint markers, and three metrics. A failed request is shown to the dispatcher and the busy state is always cleared in `finally`.

### 3.7 Optimization mode buttons

Each mode button is a regular `type="button"`, so it never submits the form. Clicking it changes `mode`; the selected mode is shown with the black active style.

- **Fastest** sends the `fastest` objective.
- **Cheapest** sends the `cheapest` objective.
- **Shortest** sends the `shortest` objective.
- **Balanced** sends the `balanced` objective, combining duration and distance in the OR-Tools scoring matrix.

### 3.8 Save and assign flow

After a point-to-point plan exists, `Save & assign trucks` opens a dialog. The first live vehicle is initially selected, but the dispatcher can select any number of vehicles.

When the dialog is confirmed, the frontend performs the following sequence for each selected vehicle:

1. `POST /routes` with the selected mode, distance, duration, cost, and `planned` status.
2. `POST /routes/{id}/stops` for the origin with sequence `1` and exact coordinates.
3. `POST /routes/{id}/stops` for the destination with sequence `2` and exact coordinates.
4. `POST /manifests` with the route ID, vehicle ID, `assigned` status, and `General` cargo type.

On success, the assignment dialog closes and the page notice reports how many real routes were created. This creates one persisted route per selected vehicle, which is useful for explicit dispatch assignment but is not the same as solving a multi-stop vehicle-routing problem.

### 3.9 Fleet optimization flow in the Routes tab

`Optimize pending deliveries` calls `previewFleetOptimization` using the currently selected mode. The backend reads pending, unassigned orders and eligible vehicle operating profiles from PostgreSQL, then solves the fleet problem.

The response panel shows:

- feasibility or failure status;
- the objective used;
- each vehicle in the proposal;
- total distance and duration for that vehicle;
- the ordered delivery locations;
- any backend warnings;
- an `Apply optimized assignments` button when a proposal has a `runId`.

Clicking Apply calls `/optimization/apply`. The backend rechecks whether the live vehicles and pending orders still match the preview snapshot. If they changed, the run is rejected as stale and the dispatcher must preview again. This prevents a proposal generated from old operational data from silently overwriting newer assignments.

## 4. Backend point-to-point route planning

File: `backend/routers/routes.py`

### `GET /routes/search`

The endpoint accepts a minimum-two-character `text` query and delegates to `search_addresses`. It is used for autocomplete and returns normalized suggestion objects. The provider implementation searches Philippine locations, including Metro Manila barangays, cities, streets, facilities, and broader regions when the public geocoder has coverage.

### `GET /routes/geocode`

This endpoint resolves one address and returns its latitude and longitude. It is also used internally by the optimization data loader when a customer has an address but no stored coordinates.

### `POST /routes/plan`

The request contains origin and destination labels, a mode, and optional exact coordinates. Empty labels are rejected with HTTP 400. If exact coordinates are present, they are used directly; otherwise the backend geocodes both locations concurrently.

The backend then requests a two-point travel matrix and a route polyline. The matrix supplies provider-derived distance and duration. The polyline supplies a GeoJSON string for the map. If no route geometry is available, the response still includes endpoint data and a warning when the provider explains why the line was skipped.

The current transparent estimate is:

```text
estimated cost = distance_km * 32.0 + (duration_min / 60) * 180.0
```

This is an operating-rate estimate, not a live fuel-price quote. The rates are currently constants in `routes.py` and should be moved into vehicle/company configuration before financial settlement use.

The objective note changes by mode, but the current point-to-point provider call remains a road route. Therefore “Cheapest” and “Shortest” are currently honest labels for the planning objective and estimate, not proof that four independent transport networks were enumerated.

### Route persistence endpoints

- `POST /routes` creates the route header.
- `GET /routes` lists route headers.
- `POST /routes/{route_id}/stops` creates an ordered stop with coordinates and optional time-window strings.
- `GET /routes/{route_id}/stops` returns stops ordered by sequence.
- `POST /manifests` associates a route and vehicle.
- `GET /manifests` lists associations.

These records are stored through SQLAlchemy in Neon Postgres. The frontend does not fabricate a route ID or coordinates.

## 5. Mapping provider chain

File: `backend/services/ors_client.py`

The mapping service uses a provider chain:

1. **Mapbox**, when `MAPBOX_SERVER_TOKEN` and `MAPBOX_ROUTING_ENABLED=true` are configured, using `driving-traffic` by default. `MAPBOX_ACCESS_TOKEN` remains a temporary server-side compatibility alias.
2. **OpenRouteService**, when `ORS_API_KEY` is configured and Mapbox is unavailable.
3. **Nominatim**, for address search/geocoding fallback.
4. **OSRM**, for road matrix and route fallback when keyed providers are unavailable.

The fallback improves development resilience, but public services have rate limits, usage policies, and incomplete address coverage. Production deployments should use an account-backed provider, a clear User-Agent, caching, and server-side request throttling.

## 6. Fleet optimization model

Files: `backend/routers/optimization.py`, `backend/services/optimization_data.py`, and `backend/services/optimizer.py`.

### Input data extraction

`fetch_fleet_data` loads vehicles and their `VehicleOperatingProfile` rows. It derives:

- capacity in kilograms;
- cost per kilometer and cost per hour;
- depot or current-GPS start location;
- closed-tour end location;
- shift start and end in minutes after midnight;
- temperature capabilities.

For reoptimization, current GPS is mandatory and must be no more than 20 minutes old. For initial planning, a configured depot is preferred and current GPS is a fallback.

Pending orders without an existing route are treated as shipments. Customer coordinates are reused when present; otherwise the customer address is geocoded once and the coordinates are saved. Orders without usable coordinates stop the optimization with a clear list of affected order IDs.

The current shipment demand is a default `100 kg` when manifest-item demand is not available. Service time is currently `15 minutes`, while order ETA windows provide time-window constraints. These defaults are appropriate for a working MVP but should be replaced by real manifest and SLA values for production dispatch.

### Travel matrix and node graph

The backend constructs a single matrix location list:

```text
vehicle 1 start, vehicle 1 end,
vehicle 2 start, vehicle 2 end,
..., shipment 1, shipment 2, ...
```

Every pair is sent to the road travel provider. The resulting distance and duration matrices are used by the solver and are not straight-line estimates.

### OR-Tools solver

`optimizer.solve` creates a `RoutingIndexManager` and `RoutingModel` with multiple vehicle starts and ends.

The objective is selected as follows:

- `shortest`: distance matrix;
- `cheapest`: distance multiplied by cost per km plus hours multiplied by cost per hour;
- `fastest` and `recommended`: duration matrix.

The solver then adds:

- vehicle capacity dimension;
- service time at each shipment;
- time dimension with order windows;
- vehicle shift start and end windows;
- vehicle-temperature compatibility restrictions;
- a five-second solve limit;
- `PATH_CHEAPEST_ARC` as the first solution strategy.

The result contains a route sequence per vehicle, total distance, total duration, arrival times, and remaining time-window slack. A route is marked at risk when slack is below 15 minutes in the optimization router’s response enrichment.

## 7. Preview, apply, and persistence

`POST /optimization/preview` creates an `OptimizationRun` with status `proposed`, objective, mode, vehicle scope, and a snapshot of the vehicle/order fingerprints used.

It also stores:

- `OptimizationRunRoute` rows for each vehicle;
- `OptimizationRunStop` rows for each ordered delivery;
- ETA and slack values;
- distance, duration, and risk counts.

`POST /optimization/apply` only accepts a proposed run. It reloads the current fleet data and compares the stored vehicle/order snapshot with the fresh snapshot. A changed GPS timestamp, order status, or assignment makes the proposal stale.

For a valid proposal, Apply:

1. Reuses or creates a route per vehicle.
2. Removes old route stops for reused routes.
3. Writes the optimized stop order.
4. Links orders to the route and vehicle.
5. Creates a manifest when a vehicle has no existing manifest.
6. Requests and stores a road-following polyline where at least two stop coordinates exist.
7. Marks the optimization run as applied with an application timestamp.

## 8. Button-by-button behavior

| Control | Current behavior |
|---|---|
| `New route` page action | Shared page action currently displays a demo notice. Working route creation is performed by the active builder after Calculate and Save & assign. |
| `Search routes...` | Shared page search input. It is not yet a persisted-route result browser for the route workspace. |
| `Filter` | Shared visual control; filtering rules are not currently wired for Routes. |
| `Columns` | Shared visual control; route-column selection is not currently wired for Routes. |
| Starting point | Debounced real location search; selection stores exact coordinates. |
| Destination | Same behavior as Starting point. |
| `Fastest` | Selects the fastest road objective for planning and duration objective for fleet optimization. |
| `Lowest cost` | Selects the operating-cost objective for fleet optimization; point-to-point cost uses the documented rate formula. |
| `Shortest` | Selects distance objective for fleet optimization and shortest-road note for point-to-point planning. |
| `Balanced` | Selects a documented combined duration/distance solver score. Routing itself remains road-based. |
| `Calculate real route` | Calls `/routes/plan`, then draws the real route line, endpoints, vehicle context markers, and metrics. |
| `Save & assign trucks` | Opens the assignment dialog after a point-to-point plan exists. |
| Vehicle checkboxes | Select one or more live vehicles for explicit point-to-point assignment. |
| `Create N routes` | Persists one route, two stops, and one manifest per selected vehicle. |
| `Optimize pending deliveries` | Calls `/optimization/preview` using live pending orders and eligible fleet constraints. |
| `Apply optimized assignments` | Calls `/optimization/apply` after the proposal is displayed; stale proposals are rejected. |
| Map zoom controls | Leaflet controls are provided by the map instance. Route bounds are fitted automatically after a plan is returned. |

## 9. Current limitations and production follow-up

The implementation is real and database-backed, but the following points are intentionally explicit:

- Point-to-point planning supports one origin, any number of intermediate stops, and one destination in the active builder.
- Point-to-point cost defaults are configurable through `ROUTE_*` environment variables.
- `balanced` is a matrix-based heuristic combining travel time and distance; it is not a global mixed-integer optimum.
- Fleet shipment demand falls back to `100 kg` when manifest item demand is missing.
- Public Nominatim/OSRM fallback services can be rate-limited or incomplete.
- Shared Routes page Filter, Columns, and New route controls remain demo-level controls.
- The optimization endpoints currently follow the existing backend authentication posture and should receive role checks and audit logging before production use.
- Apply should ideally run in one database transaction with a rollback strategy around provider/polyline failures.
- For full dispatch-grade optimization, add real fuel, toll, ferry, driver, refrigeration, and vehicle operating rates; multi-leg transport edges; pickup/delivery pairs; load quantities; and persistent audit records.

## 10. Verification commands

From the repository root:

```powershell
pnpm.cmd --filter @workspace/intellifleet typecheck
pnpm.cmd --filter @workspace/intellifleet build
```

From `backend` with the virtual environment active:

```powershell
python -m compileall routers services
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8003
```

Example API checks:

```powershell
curl "http://127.0.0.1:8003/routes/search?text=Makati"
curl -Method Post "http://127.0.0.1:8003/routes/plan" -ContentType "application/json" -Body '{"origin":"Cavite, Philippines","destination":"Cebu City, Philippines","mode":"fastest"}'
curl -Method Post "http://127.0.0.1:8003/optimization/preview" -ContentType "application/json" -Body '{"objective":"fastest","mode":"initial"}'
```

The last command requires eligible vehicle profiles and at least one pending, geocodable order. A clear prerequisite error is expected when those operational records are absent.

## 11. Toll fees and the expressway choice

Point-to-point costing now includes tolls (Google Routes API, `extraComputations: ["TOLLS"]`; requested only by Calculate / Optimize stop order, never on map interactions because it bills at a higher SKU).

- **Expressways control** (next to Objective): *Compare both* (default; two `computeRoutes` calls, normal and `routeModifiers.avoidTolls`, shown as two cards - click one to make it the active route), *Use expressways*, *Avoid tolls*. Changing it marks the result stale. The API field is `expressways: compare | expressway | avoid` on `/routes/plan` and `/routes/optimize-stops`.
- **Fee** per leg = Google's Class 1 `estimatedPrice` (PHP) x the multiplier for `ROUTE_TOLL_VEHICLE_CLASS` (Class 1 x1, Class 2 `ROUTE_TOLL_CLASS2_MULTIPLIER` = 2.0, Class 3 `ROUTE_TOLL_CLASS3_MULTIPLIER` = 3.0). Included in each row Total, the TOTAL and the top card.
- A leg with a toll but no Google price shows "Toll applies, fee unknown", is excluded from the total, and the TOTAL carries "+ tolls (unknown)". It is never shown as 0.
- `ROUTE_TOLLS_ENABLED=false` stops requesting TOLLS (Compare falls back to one normal call; "tolls not included" is shown again).
- **Fleet optimization** (Route Optimization API) does not compute tolls. The shared *Avoid tolls* choice sets each vehicle's `routeModifiers.avoidTolls`; otherwise the proposal is labelled "tolls not included".
- No database changes: nothing here is persisted beyond the existing in-memory run snapshot (which now also remembers `avoid_tolls` so the applied polyline matches).
