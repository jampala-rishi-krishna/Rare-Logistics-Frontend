# IntelliFleet Deployment Handoff and Cloud Readiness Guide

Generated from the current repository. This document is intended to be given to another engineer or ChatGPT for deployment-readiness review.

## Executive deployment summary

### Verified implementation updates (2026-09-30)

The following changes are now present in the working tree and have been verified against the local backend where noted:

- Dispatch Dashboard is Zoho-first for selected shipment dates. It excludes void/draft orders, joins assignment history for past dates, reports Pending/In Transit/Delivered KPIs, unassigned orders, truck and salesperson summaries, and exposes Zoho diagnostics.
- Dispatch Dashboard diagnostics include list pages, rows before/after shipment-date filtering, rows after void/draft exclusion, detail hydrations, detail-cache hits, Zoho API calls, Neon queries, status counts, and elapsed milliseconds.
- Zoho API counting is request-scoped and uses a `ContextVar`; concurrent detail requests are counted through the shared request metrics object.
- Void/draft records are filtered before detail hydration to avoid unnecessary Zoho calls.
- Orders moved or fulfilled without an IntelliFleet assignment are returned as a muted `moved_without_assignment` count rather than red exceptions.
- Dispatch refresh UI shows a spinner and `Refreshing…` state while the request is in flight.
- Staff directory remains n8n/DataTable-only with disk fallback at `backend/.cache/staff_directory.json`. The assignment picker returns no drivers when that cache is empty; this was observed locally with `drivers: []` and `staff_count: 0`.
- Warehouse stock matching now recognizes names containing `mets cold storage` and `glacier south rgf`; deactivated/do-not-use warehouses are ignored, and other unmatched names log at DEBUG.
- Assignment modal displays the selected primary order's `salesorder_number` instead of its internal Zoho ID.
- Motorcycle roster verified: IDs 7 and 8, plates `Motorcycle 1` and `Motorcycle 2`, type `Motorcycle`, rated capacity 20 kg each.

Local verification snapshot:

```text
2026-09-30: 25 final SOs; 9 Pending, 1 In Transit, 15 Delivered; 0 Neon queries.
2026-09-29: 18 final SOs; 18 Delivered; 1 Neon history query for assignment join.
2026-09-14: 64 final SOs; 64 Delivered; 1 Neon history query for assignment join.
```

The backend was running externally during verification and was not started or stopped by the implementation work. Use `python -m uvicorn`, not the Windows `uvicorn.exe` launcher. Frontend local API configuration is `http://127.0.0.1:8000`; production builds must set `VITE_API_BASE_URL` and `VITE_CARTRACK_WS_URL` to HTTPS/WSS deployment URLs.

IntelliFleet is a split application:

```text
Browser
  -> Vite/React frontend: artifacts/intellifleet
  -> FastAPI backend: backend/main.py
       -> Neon PostgreSQL for approved durable history/configuration
       -> Zoho Inventory for live sales-order/package/inventory data
       -> Cartrack for live GPS/vehicle telemetry
       -> n8n DataTables/webhooks for staff and communications
       -> Gmail API for the Gmail communications tab
       -> Google Maps, Mapbox, OpenRouteService for maps/routing
       -> OpenAI for the agent router (optional)
       -> S3-compatible storage variables exist (usage must be confirmed)
```

The frontend is a Vite SPA and the backend is a long-running FastAPI process with an APScheduler lifecycle. The backend is not a pure serverless function: it keeps in-memory caches, live GPS state, Zoho caches, websocket connections, scheduler jobs, and OAuth token caches.

### Current readiness assessment

| Area | Current state | Deployment implication |
|---|---|---|
| Frontend source | React 19 + Vite + TypeScript | Deploy as static assets or run Vite preview behind a web server |
| Backend source | FastAPI + Uvicorn | Deploy as a persistent container/VM/service |
| Database | Neon PostgreSQL + SQLAlchemy/Alembic | Provide pooled runtime URL and direct migration URL |
| Live order data | Zoho/in-memory cache | Do not replace with per-request Neon reads |
| Live fleet/GPS | Cartrack + in-memory store + websocket | Requires persistent backend and websocket-capable proxy |
| Background jobs | APScheduler in backend lifespan | Run one scheduler leader unless duplicate polling is explicitly safe |
| Communications | n8n webhooks/DataTables, Gmail OAuth | Configure external workflows and secrets before enabling UI |
| Routing | Mapbox/ORS/Google Maps | Separate browser-restricted and server-only credentials |
| Docker/IaC | Not found in repository | Cloud deployment manifests must be created separately |
| CI/CD | No checked-in deployment workflow found | Add build/test/deploy automation before production |
| Production build | Frontend typecheck passes; local Windows Vite build previously had an access-denied issue | Verify build in a clean Linux CI/container environment |

## Repository map

### Frontend

Primary application:

```text
artifacts/intellifleet/src/App.tsx
```

Supporting frontend areas:

```text
artifacts/intellifleet/src/components/
  dispatch/                 Communications UI
  load-planning/            Inventory and confirmed SO UI
  maps/                     Google Maps and places components
  reports/                  RGF Logistics Report
  ui/                       Shared UI primitives
artifacts/intellifleet/src/services/api/
  client.ts                 Shared HTTP client/auth handling
  fleet.ts                  Fleet APIs
  orders.ts                 Orders APIs
  inventory.ts              Load Planning APIs
  routes.ts                 Routes/optimization APIs
  reports.ts                Reports APIs
  dispatch.ts               Communications APIs
  gmail.ts                  Gmail APIs
artifacts/intellifleet/src/lib/
  fleet-socket-provider.tsx Websocket fleet state
  live-fleet-socket.ts      Websocket client
  live-map.ts               Live map helpers
```

Frontend package scripts:

```text
pnpm.cmd --filter @workspace/intellifleet dev
pnpm.cmd --filter @workspace/intellifleet run typecheck
pnpm.cmd --filter @workspace/intellifleet run build
pnpm.cmd --filter @workspace/intellifleet run serve
```

Vite configuration:

```text
artifacts/intellifleet/vite.config.ts
```

Relevant frontend environment variables:

```text
VITE_API_BASE_URL
VITE_GOOGLE_MAPS_API_KEY
VITE_CARTRACK_WS_URL
PORT
BASE_PATH
```

### Backend

Entry point:

```text
backend/main.py
```

Runtime dependencies:

```text
backend/requirements.txt
```

Main backend areas:

```text
backend/routers/       FastAPI route modules
backend/services/      External clients, caches, optimization, live stores
backend/models/        SQLAlchemy models
backend/migrations/    Alembic migrations
backend/auth/          JWT/security/dependency checks
backend/tests/         Python tests
backend/database.py    SQLAlchemy engine/session configuration
```

Local backend command from the checked-in startup instructions:

```powershell
Set-Location backend
.\venv\Scripts\uvicorn.exe main:app --reload --host 127.0.0.1 --port 8003
```

Production should use a process manager/container and should not use `--reload`.

Example production process:

```text
uvicorn main:app --host 0.0.0.0 --port 8003 --workers 1
```

Use one worker and one running service instance unless the live in-memory state and APScheduler responsibilities have been redesigned. Multiple workers or instances create separate caches, websocket managers, scheduler jobs, poller state, and per-process acknowledgement overlays. Render must run `--workers 1` and `numInstances: 1`; `/health` exposes `workers` and `instance_id`, and startup logs `[CONFIG] multiple workers detected, acknowledge state is per-process` when worker configuration is greater than one.

## Frontend architecture and deployment behavior

### Routing and shell

The SPA uses Wouter routes in `App.tsx`. Important paths include:

```text
/login
/app/tower
/app/fleet
/app/routes
/app/loads
/app/orders
/app/alerts
/app/comms
/app/reports
/admin/users
/admin/roles
/admin/integrations
/warehouse/dashboard
/portal/orders
/driver/today
```

The frontend is a browser SPA. The cloud web server must return `index.html` for client-side routes, otherwise direct navigation to `/app/fleet` or `/app/reports` will return a 404.

The shell stores the access token in browser `localStorage` under:

```text
if-access-token
```

`src/services/api/client.ts` adds it as:

```http
Authorization: Bearer <token>
```

The shared client also:

- Parses JSON and text errors.
- Redirects to `/login` on HTTP 401.
- Retries HTTP 429 once after 1.5 seconds.
- Supports JSON POST/PATCH and file downloads.
- Requires `VITE_API_BASE_URL` to be defined.

### Frontend-to-backend origin

Development uses:

```text
VITE_API_BASE_URL=http://127.0.0.1:8003
VITE_CARTRACK_WS_URL=ws://127.0.0.1:8003/ws/fleet
```

Production must use HTTPS/WSS:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_CARTRACK_WS_URL=wss://api.example.com/ws/fleet
```

The Vite variable is compile-time. Changing it after building does not change an already-built static bundle.

### Google Maps key separation

The browser key is consumed by frontend map components through `VITE_GOOGLE_MAPS_API_KEY`. It must be restricted by:

- HTTP referrers/domains
- Required Maps JavaScript APIs only
- Production domains only

The backend `GOOGLE_MAPS_API_KEY` is separate and must never be exposed as a `VITE_*` variable. Server routing credentials such as `MAPBOX_SERVER_TOKEN` must also remain backend-only.

## Backend startup and lifecycle

`backend/main.py` does the following at startup:

1. Loads environment variables using `python-dotenv`.
2. Configures logging and suppresses httpx/httpcore URL logging to avoid leaking Mapbox query credentials.
3. Creates the FastAPI application and CORS middleware.
4. Checks the Alembic database revision against the current migration head.
5. Refreshes the static fleet cache.
6. Refreshes the staff directory cache.
7. Loads assignment state from historical Sales Order history into the live order cache.
8. Starts the scheduled assigned-SO Zoho synchronization job.
9. Registers the Cartrack poller when credentials exist.
10. Pauses the Cartrack poller until at least one websocket client connects.
11. Mounts `/media` from the backend media directory.

The `/health` endpoint returns HTTP 503 when the database migration revision does not match the Alembic head. This should be used as the cloud readiness/liveness check, with a separate process-level health check if the platform needs one.

Important startup settings:

```text
FLEET_ZOHO_SYNC_INTERVAL_SECONDS=1800 by default
CARTRACK_POLL_INTERVAL_SECONDS=5 in the current startup code unless overridden
```

The repository also contains local notes showing a 15-second Cartrack interval in one environment. Production must choose one explicit value and avoid accidentally running multiple pollers.

## Database and persistence rules

Read `docs/DATABASE.md` before changing persistence.

Neon stores durable history and configuration only. Approved tables currently include:

```text
users
vehicles
sales_orders
sales_order_lines
client_delivery_constraints
load_manifests
manifest_items
warehouse_loading_checklists
alembic_version
```

### Critical data-source rules

- Current/today Sales Orders come from Zoho and the in-memory live Sales Order cache.
- Current Fleet status and GPS come from Zoho/Cartrack and in-memory stores.
- Past-date history is read from Neon.
- Assignment, manifest, status-transition, and delivery/completion events write history once when they occur.
- Conversations and staff contacts live in n8n DataTables/cache, not Neon.
- Do not bulk mirror Zoho into Neon.
- Do not add tables, columns, or new DB read/write paths without explicit approval.

### Production migration procedure

Use the direct non-pooled Neon URL only for Alembic migrations:

```text
DATABASE_URL_DIRECT
```

Use the pooled Neon URL for normal runtime SQLAlchemy queries:

```text
DATABASE_URL
```

Recommended deployment sequence:

1. Build and test the release.
2. Run `alembic upgrade head` once from a migration job or release task.
3. Start/restart the backend.
4. Check `/health` and confirm the schema revision matches the head.

Never run migrations concurrently from every application replica.

## Backend API surface

All routes are mounted from `backend/main.py`. Most routers require `get_current_user`; write routes may require dispatcher/admin/warehouse roles.

### Authentication

```text
POST /api/auth/login
POST /api/auth/change-password
POST /api/auth/logout
GET  /api/auth/session
```

JWT settings:

```text
JWT_SECRET
JWT_EXPIRE_MINUTES
```

Use a long random production secret. Never reuse the local/demo secret.

### Fleet and live map

```text
GET  /api/fleet/vehicles
POST /api/fleet/vehicles/refresh
GET  /api/fleet/vehicles/{vehicle_id}
GET  /api/fleet/vehicles/{vehicle_id}/trail
GET  /api/fleet/geofences
GET  /api/fleet/drivers
POST /api/fleet/vehicles/{vehicle_id}/position
WS   /ws/fleet
```

The fleet refresh combines roster/Cartrack data with associated live Sales Orders, load, and fulfillment calculations. GPS is held in memory and delivered over websocket to connected clients.

### Orders and history

```text
GET  /api/orders
GET  /api/orders/{order_id}
POST /api/orders/{order_id}/events
POST /api/orders/{order_id}/proof
```

Current and historical date behavior is intentionally different. Do not deploy a caching proxy that serves a past-date response for a live current-date request.

### Load Planning

```text
GET  /api/load-planning/inventory/sales-orders
GET  /api/load-planning/inventory/sales-orders/cities
GET  /api/load-planning/inventory/sales-orders/{salesorder_id}
POST /api/load-planning/inventory/refresh
GET  /api/load-planning/inventory/refresh/status
POST /api/load-planning/inventory/sales-orders/{salesorder_id}/acknowledge
POST /api/load-planning/inventory/sales-orders/{salesorder_id}/remove-acknowledge
POST /api/load-planning/inventory/sales-orders/acknowledge-filtered
GET  /api/load-planning/inventory/export/excel
GET  /api/load-planning/inventory/export/pdf
POST /api/load-planning/email/draft
POST /api/load-planning/email/send
```

The acknowledgement endpoint updates Zoho’s acknowledgement custom status. The frontend then refetches the list. This is not a Neon history write by itself.

### Routes and optimization

```text
GET  /api/routes/routes
GET  /api/routes/routes/geocode
GET  /api/routes/routes/search
POST /api/routes/routes/plan
POST /api/routes/routes/optimize-stops
POST /api/routes/routes
GET  /api/routes/routes/{route_id}/stops
POST /api/routes/routes/{route_id}/stops
GET  /api/routes/manifests
POST /api/routes/manifests
GET  /api/routes/manifests/{manifest_id}/items
POST /api/routes/manifests/{manifest_id}/items
POST /api/routes/routes/optimize
POST /api/optimization/preview
POST /api/optimization/reoptimize
POST /api/optimization/apply
GET  /api/optimization/{run_id}
```

Route planning uses Google/Mapbox/ORS integrations depending on configuration and keeps the planning cost inputs configurable through environment variables.

### Communications and n8n

```text
GET  /api/dispatch/n8n-conversations/{channel}
GET  /api/dispatch/voice-call-detail/{call_id}
GET  /api/dispatch/voice-recording/{call_id}
GET  /api/dispatch/comms-overview
GET  /api/dispatch/staff
POST /api/dispatch/staff/refresh
GET  /api/dispatch/customers
GET  /api/dispatch/templates
GET  /api/dispatch/conversations
GET  /api/dispatch/messages
GET  /api/dispatch/messages/{message_id}
POST /api/dispatch/send
POST /api/dispatch/webhooks/message-status
```

The overview currently uses a 20-second React Query refresh and the backend n8n feed cache also uses a short cache. Monthly metrics use the current Asia/Manila month; activity may include the latest available feed records. A 502 from a channel normally means the external n8n workflow or upstream provider is unavailable, not that Fleet is unhealthy.

### Gmail

```text
GET /api/gmail/status
GET /api/gmail/profile
GET /api/gmail/messages/today
```

Gmail is one operations mailbox authenticated through a server-side OAuth refresh token. It is not per-user Gmail OAuth.

### Reports

```text
GET /api/reports/rgf-logistics
GET /api/reports/rgf-logistics/sales-order/{salesorder_id}
GET /api/reports/rgf-logistics/purchase-receive/{purchasereceive_id}
```

The RGF Logistics Report is live Zoho Inventory reporting with a backend cache of approximately 60 seconds and card-level force refresh. It must remain read-only: opening a report must not create history or send notifications.

### Dispatch/warehouse pipeline

```text
GET  /api/load-planning/planning/orders
POST /api/load-planning/manifests/confirm
GET  /api/load-planning/warehouse/checklists/{manifest_id}
POST /api/load-planning/warehouse/checklists/{manifest_id}/complete
GET  /api/load-planning/dispatch-dashboard
```

The dispatch dashboard combines the live Sales Order cache with persisted load manifests. It is not equivalent to the stricter Zoho-package delivery reconciliation logic used by Orders/Fleet.

## Environment variable inventory

Never commit real values. The repository currently contains local `.env` files; production secrets must be stored in the cloud secret manager and rotated if they have ever been exposed.

### Required core backend variables

```text
DATABASE_URL                 Neon pooled runtime URL
DATABASE_URL_DIRECT          Neon direct migration URL
JWT_SECRET                   Random signing secret
JWT_EXPIRE_MINUTES           Token lifetime
ALLOWED_ORIGINS              Comma-separated production frontend origins
```

### Zoho Inventory

```text
ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET
ZOHO_REFRESH_TOKEN
ZOHO_ORG_ID
ZOHO_ACCOUNTS_URL
ZOHO_API_DOMAIN
ZOHO_SCOPES
```

Required report/read scopes currently include:

```text
ZohoInventory.salesorders.READ
ZohoInventory.packages.READ
ZohoInventory.transferorders.READ
ZohoInventory.inventoryadjustments.READ
ZohoInventory.purchasereceives.READ
ZohoInventory.invoices.READ
```

Changing scopes requires generating a new Zoho refresh token.

### Fleet/GPS

```text
CARTRACK_USERNAME
CARTRACK_API_KEY
CARTRACK_BASE_URL
CARTRACK_POLL_INTERVAL_SECONDS
FLEET_ZOHO_SYNC_INTERVAL_SECONDS
```

### Routing/maps

```text
VITE_GOOGLE_MAPS_API_KEY       Browser-restricted key
GOOGLE_MAPS_API_KEY            Server-side key
MAPBOX_SERVER_TOKEN            Server-only token
MAPBOX_ACCESS_TOKEN            Legacy alias
MAPBOX_ROUTING_ENABLED
MAPBOX_PROFILE
MAPBOX_MATRIX_BATCH_SIZE
ORS_API_KEY
GOOGLE_ROUTE_OPTIMIZATION_PROJECT
```

### Communications/integrations

```text
INTELLIFLEET_WEBHOOK_SECRET
INTELLIFLEET_ASSIGNMENT_WEBHOOK_SECRET
INTELLIFLEET_ASSIGNMENT_WEBHOOK_URL
GMAIL_COMMS_CLIENT_ID
GMAIL_COMMS_CLIENT_SECRET
GMAIL_COMMS_REFRESH_TOKEN
OPENAI_API_KEY
OPENAI_MODEL
INTERNAL_API_BASE_URL
```

### Route planning cost inputs

These are temporary planning estimates, not RGF accounting, payroll, or fleet-book costs:

```text
ROUTE_DISTANCE_COST_PER_KM=5
ROUTE_DRIVER_COST_PER_HOUR=100
ROUTE_FUEL_COST_PER_KM=21
ROUTE_REFRIGERATION_COST_PER_HOUR=0
ROUTE_FIXED_COST_PER_ROUTE=0
ROUTE_BALANCED_TIME_WEIGHT=0.5
ROUTE_BALANCED_DISTANCE_WEIGHT=0.2
ROUTE_BALANCED_COST_WEIGHT=0.3
```

Fuel is separate from distance reserve and must not be counted twice.

### Frontend variables

```text
VITE_API_BASE_URL
VITE_GOOGLE_MAPS_API_KEY
VITE_CARTRACK_WS_URL
PORT
BASE_PATH
```

## External services required for production

### Neon PostgreSQL

Required for:

- Users/authentication
- Vehicle roster/configuration
- Durable Sales Order history and assignment state
- Sales Order lines/history snapshots
- Manifests and manifest items
- Warehouse checklists

Production requirements:

- Pooled URL for runtime.
- Direct URL for Alembic.
- TLS enabled.
- Connection limits sized for one persistent backend process or deliberately configured pool.
- Automated backups and point-in-time recovery enabled.
- Migration job executed once per release.

### Zoho Inventory

Required for live/current operations:

- Sales Orders
- Packages and shipment status
- Inventory availability
- Transfer Orders
- Inventory Adjustments
- Purchase Receives
- Invoices

Validate OAuth refresh-token longevity, organization ID, API rate limits, and scopes before launch.

### Cartrack

Required for live fleet GPS and vehicle status. The backend polls only while websocket clients are connected, according to the current lifecycle behavior. Cloud load balancers must support websocket upgrade and idle timeout settings.

### n8n

Required for communications and staff directory workflows. Configure and test separate email, WhatsApp, SMS, and voice workflows. A stopped or failed workflow returns a channel-specific error/502 and should not be represented as valid zero activity.

### Gmail/Google Cloud

Required only for the Gmail communications tab. Configure OAuth consent, authorized redirect URI, refresh token, and API scope. Keep the refresh token server-side.

### Maps/routing providers

Configure quotas, billing, domain restrictions, and failover behavior for Google Maps, Mapbox, and OpenRouteService. Do not expose server-only tokens in frontend build variables.

## Cloud infrastructure recommendation

### Recommended topology

```text
HTTPS load balancer / reverse proxy
  ├── Static frontend hosting or frontend web container
  └── FastAPI backend service, one scheduler leader
         ├── Neon PostgreSQL
         ├── Zoho Inventory
         ├── Cartrack
         ├── n8n
         ├── Gmail API
         ├── Maps/routing providers
         └── optional OpenAI/S3
```

Suitable backend platforms must support:

- Long-running Python process
- Outbound HTTPS
- Websocket connections
- Environment secrets
- Health checks
- Graceful restarts
- One scheduled-job leader
- Sufficient connection limits

Examples include a container service, VM, or managed app service. A default stateless serverless deployment is not suitable without extracting the scheduler, caches, websocket manager, and pollers into dedicated services.

### Frontend deployment options

The frontend can be deployed as static Vite output to an object store/CDN or as a small web container. Configure SPA fallback to `index.html` and inject `VITE_API_BASE_URL` and the browser Google Maps key at build time.

### Backend deployment requirements

- Use Linux/Python 3.11-compatible runtime matching the local venv assumptions.
- Install `backend/requirements.txt`.
- Run migrations separately.
- Run Uvicorn without reload.
- Configure one scheduler instance.
- Enable websocket proxying for `/ws/fleet`.
- Configure request timeouts for Zoho, n8n, Maps, and exports.
- Stream or limit large exports.
- Send logs to centralized logging.
- Do not serve development Vite through the backend unless intentionally configured.

## Security checklist

Before production:

- Rotate any secret that has appeared in local files, logs, screenshots, or chat.
- Remove real `.env` files from build contexts and deployment artifacts.
- Store secrets in the cloud secret manager.
- Replace local JWT secret.
- Set `ALLOWED_ORIGINS` to exact HTTPS frontend origins, not `*`.
- Restrict the browser Google Maps key by domain/API.
- Never expose Zoho, Cartrack, Mapbox server, Gmail, n8n, OpenAI, Neon, or S3 secrets to Vite.
- Confirm all write endpoints have the correct role dependency.
- Add rate limiting at the edge for login, exports, chat, and webhook endpoints.
- Verify websocket authentication posture before production; the current `/ws/fleet` comment says it is unauthenticated for v1.
- Protect public webhook endpoints with signature verification and replay protection.
- Redact customer, driver, address, token, and provider data from logs.
- Verify CORS behavior from the actual production origin.

## Observability and operations

Monitor:

```text
/health
HTTP 5xx/4xx rates
Zoho token refresh failures and rate limits
Cartrack poll success/mismatch counts
n8n channel 502 rates
Gmail token/API failures
Neon pool exhaustion and query latency
websocket connection count
scheduled job duration and overlap
export duration/memory
```

Important log signals already present include:

```text
[SCHEMA]
[FLEET_REFRESH]
[Poller]
Fleet Zoho sync
```

Alert when:

- `/health` becomes 503.
- Cartrack has repeated unmatched/missing updates.
- A communications channel returns repeated 502 responses.
- Zoho refresh-token calls fail.
- Scheduler jobs overlap or stop.
- Database migration revision differs from the application head.

## Build and validation checklist

### Local checks

```powershell
pnpm.cmd --filter @workspace/intellifleet run typecheck
git diff --check
```

Backend tests:

```powershell
Set-Location backend
.\venv\Scripts\python.exe -m pytest
```

Backend compilation check where the approved virtual-environment Python is available:

```powershell
.\venv\Scripts\python.exe -m compileall -q .
```

Frontend production build:

```powershell
pnpm.cmd --filter @workspace/intellifleet run build
```

The local Windows environment previously produced a Vite access-denied/path-resolution failure. Treat that as an environment/build-runner issue until reproduced in a clean Linux CI environment; do not change Vite application logic just to bypass it.

### Pre-release smoke tests

1. Start backend with production-like secrets and no reload.
2. Run `alembic upgrade head` once.
3. Check `/health`.
4. Login through `/login`.
5. Verify Fleet table and `/ws/fleet`.
6. Verify current and historical Orders date behavior.
7. Verify Load Planning Zoho refresh and acknowledgment.
8. Verify Routes calculation and all five route cost inputs.
9. Verify Communications email/WhatsApp/SMS/voice unavailable states honestly.
10. Verify Gmail status and selected-day loading.
11. Verify Reports Zoho permissions and unavailable card behavior.
12. Verify file exports from a production origin.
13. Verify role restrictions for dispatcher/admin/warehouse actions.
14. Verify backend restart preserves only the approved historical state.
15. Verify no duplicate scheduler/poller instances.

### Delivery-specific acceptance test

Do not call delivery lifecycle validation complete without a real Zoho package transition:

```text
Zoho package status = DELIVERED
        -> reconciliation
        -> Neon delivery_status = Delivered
        -> today's Orders/Fleet removes active assignment
        -> historical date retains the SO
        -> historical view shows Delivered
        -> fulfillment totals remain correct
        -> backend restart
        -> repeated refresh does not resurrect or duplicate the assignment
```

## Known gaps and deployment blockers

These should be resolved or explicitly accepted before calling the platform production-ready:

1. No checked-in Dockerfile, Docker Compose, Terraform, cloud service manifest, or CI/CD workflow was found.
2. Frontend and backend deploy separately but there is no production reverse-proxy configuration in the repository.
3. Backend state is partly process-local; multiple replicas can produce divergent caches and duplicate scheduled work.
4. The fleet websocket endpoint is currently documented as unauthenticated for v1.
5. The first Delivery Performance report view still contains static presentation values rather than a live backend report.
6. Dispatch Dashboard and RGF Logistics Report use different data sources and date/status rules; deployment documentation must not merge their numbers without business approval.
7. Communications depends on n8n external workflows; channel 502s are expected when a workflow is stopped or unavailable.
8. Local Windows Vite production build access issues remain to be verified in Linux CI.
9. The repository includes local runtime logs and generated assets; review what belongs in production artifacts.
10. Confirm whether S3-compatible environment variables are actively used or are legacy configuration before provisioning storage.

## Files to hand to a deployment engineer

```text
AGENTS.md
docs/DATABASE.md
backend/main.py
backend/requirements.txt
backend/.env.example
backend/database.py
backend/alembic.ini
backend/migrations/
backend/routers/
backend/services/
backend/models/
backend/tests/
artifacts/intellifleet/package.json
artifacts/intellifleet/vite.config.ts
artifacts/intellifleet/.env.example
artifacts/intellifleet/src/
pnpm-workspace.yaml
package.json
application_start.txt
```

Do not hand over or commit:

```text
backend/.env
artifacts/intellifleet/.env
private OAuth tokens
database URLs
API keys
JWT secrets
local runtime logs containing sensitive request data
```

## Final deployment decision

The application is structurally deployable as two services, but it is not yet a turnkey cloud deployment package. A cloud engineer must first provide:

- Frontend hosting/CDN configuration with SPA fallback.
- Persistent FastAPI service configuration.
- One scheduler/poller leader strategy.
- Neon migration job.
- Secret-manager mappings.
- Reverse proxy/CORS/WSS configuration.
- CI build/test pipeline.
- Production observability and provider health checks.

The most important architectural rule is to preserve the current split between live external/in-memory operational data and durable Neon history. A deployment that forces all current Fleet, Orders, GPS, or conversation reads through Neon would change the application’s intended behavior.
