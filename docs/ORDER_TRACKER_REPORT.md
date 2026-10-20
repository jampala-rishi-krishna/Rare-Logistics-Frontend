# Order Tracker delivery report

Date: 2026-10-19, Asia/Manila. Full pre-build source audit and approval proposals: [ORDER_TRACKER_COVERAGE.md](ORDER_TRACKER_COVERAGE.md). Database contract: [DATABASE.md](DATABASE.md).

## 1. Coverage and sources

Tracker adds **zero Zoho calls per answer** for every row below. It does not start a provider refresh when caches are cold or the Zoho budget is blocked. Missing records and missing timestamps remain explicit.

| Question | Delivered coverage | Source / freshness | Remaining gap |
| --- | --- | --- | --- |
| Q1 Where is the truck? | Partly | Existing Cartrack memory, GPS fix time; assignment and trip snapshots | Only active current-day trips carrying an unfinished accessible order; stale/unmapped GPS has no coordinates. Cold trip snapshot is unavailable. |
| Q2 ETA / delivery time | Partly | Stop checkout event time; current read snapshot or past history | Delivered time is shown only for fully delivered outcome. Partial/failed show checkout time. ETA is not recorded; no routing API added. |
| Q3 Departure | Yes when event is available | `trips.started_at`, linked by assignment batch | Cold current-day memory is unavailable until the existing driver/Overview workflow reads the trip. |
| Q4 Payment correctness | Partly | Single linked invoice fields already in the SO cache, SO sync timestamp | Paid/balance arithmetic is labelled; SO status alone cannot prove payment. Payment receipt/reference/date and currency can be missing. New invoice/payment reads deferred. |
| Q5 Permits | No | Explicit Not recorded | Required document types and permit register need Logistics confirmation and approval. |
| Q6 Receiver | Partly | Existing checkout answers `receiver_name` / `receiver_position`, event time | Seeded form does not capture these. No inference from a shipping contact or signature photo. |
| Q7 Rejection | Partly | Outcome/reason plus validated `rejected_items` form answer, event time | Quantities need optional template fields; absent quantities are not zero. |
| Q8 Client PO copy | Partly | Cached PO/reference number and attachment count, SO sync time | Number/attachment count is not a verified PO copy. No unapproved attachment fetch. |
| Q9 Proof | Partly | Checkout photo references, authenticated `/api/media`, checkout-time caption basis | Actual camera-time metadata can differ; caption states its basis. Drive readiness must be checked in deployment. Missing photos/storage are explicit. |
| Q10 Buyers per SKU | Within cached coverage | Distinct customer IDs / fallback customer names per SKU+unit; cached line time or historical snapshot | Caps at 100 groups. Missing lines/identities and truncation are flagged. Internal TOs excluded; name fallback can be incomplete. |
| Q11 Customer rules | Partly | Existing assignment-options constraint read, plus SO notes | Rules reuse `client_delivery_constraints` when warm; SO notes are labelled unverified. No contact fetch. |
| Q12 Loading correct? | Partly | Crew acknowledgement/checklist, existing manifest checklist projection, officer invoice status | Crew acknowledgement / signed invoice receipt is not physical load verification. A cold or unlinked warehouse checklist stays unavailable. |

The full audit includes exact model/service references, proposed field changes, cost reasoning and the existing workflow contracts. Today's Tracker performs no Neon business reads. Past-only date windows use bounded cached history reads, documented in DATABASE.md.

## 2. What was built

- `/app/order-tracker`: role-filtered desktop and mobile navigation; explicit-submit search by order/customer/invoice/PO/truck, daily arrows, date range, quick filters and paged list.
- One scrolling Order 360 card: current status, conditional truck map, times, result, proof, payment, documents, customer rules, loading evidence and issue/reply sections. Sources and as-of times appear beside facts. Missing data explains what Logistics would need to record.
- Ask on the list and inside a card, suggested questions, loading/error states, sourced answers and helpful/unhelpful feedback. Answers render as text; only server-returned evidence links become navigation controls.
- Read endpoints: `GET /api/order-tracker/orders`, `/orders/{number}`, `/buyers-per-sku`.
- AI and feedback: `POST /api/order-tracker/ask`, `/feedback`. Feedback is application-log-only, scoped to the answer's user and 10-minute lifetime.
- Twelve read-only tools: `find_orders`, `get_order`, `truck_location`, `order_times`, `delivery_result`, `proof_of_delivery`, `payment_status`, `order_documents`, `customer_rules`, `loading_check`, `buyers_per_sku`, `order_issues`.
- Tracker's authenticated photo reads explicitly disable the legacy Drive metadata-retry side effect and use private/no-store responses varying by Authorization. Sales/Wet Market photo reads always get these safeguards.
- Existing OpenAI client/model/env key, strict tool schemas, no write tools or provider SQL. Per request: 6 tool calls, 1,200 output tokens per response, 30 seconds total, no retries, provider storage disabled. Limit: 20 questions / user / 10 minutes; two AI questions and two Tracker reads at once.
- Questions, tool names, missing flags and latency log without tool payloads. Phone-like PH numbers are withheld; credential-like questions are redacted from logs. The model receives user-bound server authorization and treats provider notes as untrusted data.

Screenshots use **synthetic mocked records**, not production customer data. The map screenshot shows the honest unavailable state when the test has no Maps key; live coordinates are separately covered by backend fixtures.

| View | 390 px | 1440 px |
| --- | --- | --- |
| List | [Mobile](../artifacts/intellifleet/e2e/screenshots/order-tracker/list-390.png) | [Desktop](../artifacts/intellifleet/e2e/screenshots/order-tracker/list-1440.png) |
| Delivered | [Mobile](../artifacts/intellifleet/e2e/screenshots/order-tracker/delivered-390.png) | [Desktop](../artifacts/intellifleet/e2e/screenshots/order-tracker/delivered-1440.png) |
| Partial | [Mobile](../artifacts/intellifleet/e2e/screenshots/order-tracker/partial-390.png) | [Desktop](../artifacts/intellifleet/e2e/screenshots/order-tracker/partial-1440.png) |
| On trip | [Mobile](../artifacts/intellifleet/e2e/screenshots/order-tracker/ontrip-390.png) | [Desktop](../artifacts/intellifleet/e2e/screenshots/order-tracker/ontrip-1440.png) |
| Ask: recorded answer | [Mobile](../artifacts/intellifleet/e2e/screenshots/order-tracker/ask-recorded-390.png) | [Desktop](../artifacts/intellifleet/e2e/screenshots/order-tracker/ask-recorded-1440.png) |
| Ask: not recorded | [Mobile](../artifacts/intellifleet/e2e/screenshots/order-tracker/ask-not-recorded-390.png) | [Desktop](../artifacts/intellifleet/e2e/screenshots/order-tracker/ask-not-recorded-1440.png) |

## 3. Scope and privacy

Admin and Planner/Dispatcher see operations records. Sales requires an exact normalized match between the authenticated full name and order `salesperson_name`. Wet Market additionally requires a WM order. Missing ownership denies access in the list, card, aggregate and every AI tool. Crew/warehouse/officer roles cannot enter Tracker.

The existing historical `sales_orders.salesperson_name` supports the same check on past records. This is a name-based mapping, not a verified Zoho salesperson-ID binding. Shared department logins such as a generic Sales account will see no matching records unless their identity really matches the recorded salesperson. Use individual accounts whose full names have been checked against Zoho; ambiguous duplicate names need the proposed verified ID mapping. There is no all-orders fallback for Sales.

The existing generic Orders/export pages retain their earlier department authorization; tightening those legacy paths is a separate compatibility follow-up. Tracker never calls them to bypass its own scope.

Truck coordinates require a visible current-day order, current assignment, generation-valid active trip, unfinished stop and a GPS fix within five minutes. No driver route history or crew phone fields are returned. Media department access checks the already-loaded photo row against accessible cached ownership **and** the card's POD references. Missing ownership/reference denies access, including direct photo URLs. Historical department proof can remain unavailable if live ownership cannot be verified.

## 4. Provider and memory budget

- New Zoho calls: **0/day**. New payment / PO / customer-contact fetches and caches: **not enabled**. Their cost cannot be promised under 200/day without measuring invoice linkage and pagination; the proposal is in the audit.
- Shared trip/issue/rule/loading cache: 2 MiB serialized, 512 entries, 24-hour TTL, max 64 KiB per entry. Trip facts must match event/assignment generations; stale current facts become unavailable.
- Historical cache: up to 1 MiB serialized, eight ranges, five-minute TTL, max 64 KiB per range; single-flight. Up to 31 days requested / 1,000 historical orders; large results require a smaller range. No automatic history polling.
- Existing-workflow pending publication: 256 KiB / 32 entries per session. Rate counters: at most 1,000 users with 20 timestamps each. Feedback ownership: at most 1,000 answer IDs, 10 minutes. No stored AI conversations.
- Read projections stream one order at a time; AI tool results cap at 24,000 bytes and six calls. Two concurrent read requests and two AI requests bound Tracker request concurrency.
- Pre-deploy measured RSS: **437 MB**, one worker, healthy, nominal 75 MB below the instance limit. Reserve **32 MiB incremental working memory** as a conservative planning estimate including Python/request overhead and publication queues. The serialized ceilings are hard limits; 32 MiB is not a measured or enforced RSS ceiling. Existing application allocations still vary.

## 5. Evaluation

`backend/tests/order_tracker/eval_questions.yaml` has **46** realistic English / Tagalog / Taglish cases covering Q1–Q12, missing data, scoped-out orders, stale GPS, budget-blocked cache reads, a malicious customer note, and change requests.

Mocked result: **46/46 cases, 100%**, including 5/5 change-request refusals. Threshold is 100% because these are deterministic fixture fact and orchestration checks. This does **not** measure a live model's language understanding or resistance to every injection: the mocked provider uses prescribed tools and echoes returned fixture facts. Separate tests cover all tools' scope, unknown tools, strict arguments, max calls, rate limit, timeout and feedback ownership. The read-only tool registry supplies no mutation capability even if text tries to request one.

From `backend` in PowerShell:

```powershell
.\venv\Scripts\python.exe scripts/eval_order_tracker.py
```

Optional configured-provider run, **only when the owner triggers it**:

```powershell
.\venv\Scripts\python.exe scripts/eval_order_tracker.py --real
```

The optional run uses synthetic fixtures only and prints answers and lexical check scores. It is a conservative lexical smoke check, not a semantic model-quality benchmark. No live-model evaluation was run in this task and no production records were sent to AI for validation.

## 6. Proposals awaiting approval

No schema migrations or live template edits were made. The audit contains actionable proposals for receiver name/position, structured rejected quantities in existing checkout answers, a permit/document metadata register, verified salesperson-ID ownership, richer use of the existing warehouse checklist, invoice/payment/PO attachment reads, a retained question/feedback table, and proactive email/Cliq updates. Document types and expiry/review responsibilities must be confirmed by Logistics. No new vendors, routing API charges, or n8n lead-generation changes.

## 7. Tests and deployment

- Full backend after the photo safeguards: **1,309 passed**, plus 10 subtests. The affected Tracker, Drive/media and driver-portal group also passed **160 tests**.
- Full frontend browser suite: **72 passed**; includes 390 / 1440 Tracker screenshots and axe checks, English/Tagalog driver layouts, and existing Overview accessibility. No Tracker axe/contrast violations.
- Frontend unit suite: **361 passed**.
- TypeScript: workspace typecheck and frontend `tsc --noEmit` passed. Production Vite build passed, exit 0. Existing bundle-size / sourcemap warnings remain.
- Regression repairs required by full checks: existing driver tests now choose pending stops explicitly; tap counts include those three choices. An existing status-zero offline error is now classified as network/queued. Time-dependent test assignments use their fixture date. Seven existing UTF-8 BOMs were removed without behavior changes.
- Backend `main` includes photo safeguards at `3d96d42`; deployed OpenAPI confirms both Tracker and the media read-only flag, and `/health` is OK (207.7 MB RSS sample, one worker). This is a cold post-deploy sample, not a peak-memory measurement. Backend health and API availability were verified before publishing the frontend.
- The main frontend is deployed at [Order Tracker](https://rare-logistics-frontend.rishi-315.workers.dev/app/order-tracker). The final frontend follow-up makes the photo read-only flag explicit for every Tracker role and includes an opt-in production smoke runner.

Production checks on **2026-10-19** opened three real SO cards as Admin: `SO26-18536`, `SO26-18520`, `SO26-18513`. The browser confirmed **10 sections each**, no page errors, no sideways scroll and no unexpected POSTs. The latest API comparison found the first order Not yet loaded and the latter two Out for delivery; their recorded departure times matched Overview. Arrival, checkout and outcome were absent in both sources, with no comparison mismatches. GPS was unavailable in these records. These checks do not validate a live delivered/partial/POD case; those states are covered with synthetic fixtures.

Payment totals, permits, PO-copy contents and customer rules are not independently exposed by Driver Overview, so this smoke check does not claim independent verification of those facts. Production screenshots remain local under `tmp/order-tracker-live-ui/`; all linked report screenshots are synthetic. No production records were sent to AI for validation.

Read-only browser smoke runner: `node --experimental-strip-types artifacts/intellifleet/e2e/order-tracker.production.ts` (explicit opt-in; uses existing local admin credentials without printing them). It never submits Ask or business writes. The final targeted browser rerun passed **13/13 tests**, including authenticated proof-photo reads with `read_only=true`, mobile/desktop accessibility and Ask states. A search-test response-wait race was corrected by registering the response waiter before clicking Search.
