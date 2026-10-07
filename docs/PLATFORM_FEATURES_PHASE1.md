# IntelliFleet Logistics Platform
## Phase 1: Complete Feature Showcase

*Rare Global Food Trading (RGF) · Cold-chain logistics control · Updated 2026-10-06*

One platform takes a confirmed sales order all the way to a loaded, assigned, notified, tracked and delivered truck. AI agents handle driver conversations, and every step is built to **save time, cut cost and make a small team do the work of a large one**.

This is a business-level document. It describes what the platform does and where each feature stands. It does not describe code or internal logic.

**Status key:** ✅ Live (working against real systems) · 🟡 Partial (works, with a known limit) · 🔴 Mock or not built yet

Statuses come from a read-through of the code, docs and test names. They were not live-tested for this document.

---

## 1. Why IntelliFleet

Generic freight platforms are built to match shippers with outside carriers. IntelliFleet is built for the opposite job: **running RGF's own cold-chain fleet** as efficiently as possible, directly on top of RGF's own systems (Zoho Inventory and Cartrack).

| What matters to RGF | How IntelliFleet delivers it |
|---|---|
| Orders come from Zoho, not re-typed | Live Zoho sales orders, with no double entry |
| Cold chain can't be compromised | Reefer rules, temperature-aware optimization, loading checklist with departure temperature |
| Few dispatchers, many trucks | AI assistant, auto-notification chain, one-click assignment |
| Drivers confirm by phone, WhatsApp, SMS, email | A voice AI and an email AI do the chasing, in Tagalog, Taglish and English |
| Costs must be visible | Cost-aware route optimization with configurable per-km and per-hour rates |
| Zoho must not be overloaded | A purpose-built protection layer (rate limiting, de-duplication, caching) |

**Honest positioning:** IntelliFleet is purpose-built for RGF's own fleet and cold-chain workflow, and in that scope it covers planning, assignment, optimization, tracking, notification and AI communication in a single product. Large freight marketplaces cover things IntelliFleet does not try to do, such as carrier networks, freight payments and multi-company billing. See §11 for what is not built yet.

---

## 2. The end-to-end flow

```
Zoho Sales Order
   → Inventory (review, acknowledge, lock in Zoho)
   → Load Planning (choose truck + drivers, capacity and cold-chain checks)
   → Route optimization (propose → dispatcher approves → apply)
   → Assignment fires automatically: email + WhatsApp + SMS + AI voice call
   → Drivers confirm (voice AI / email AI record it)
   → Team confirmation email + team confirmation call
   → Warehouse manifest + loading checklist (seal, count, temperature)
   → Truck departs → live GPS on the Control Tower
   → Zoho delivery status updates fulfilment automatically
   → History saved once, for past-date review and reports
```

---

## 3. Planning, assignment and route optimization (core features)

### 3.1 Load Planning in three stages ✅
1. **Inventory:** every live Zoho sales order, with date range, status, city and search filters, plus Mets and Glacier warehouse available-for-sale stock beside each order. Acknowledge one order or bulk-acknowledge everything filtered. Export to Excel or PDF, or email the export with attachments.
2. **Load Planning:** acknowledged, unassigned orders as cards, ready for a truck.
3. **Confirmed SO:** everything assigned, in card view or spreadsheet view, with unassign when still allowed.

Supporting features:
- Order detail drawer: items, terms, custom fields.
- Tables scroll horizontally with a mirrored top scrollbar and sticky key columns.
- Background refresh with progress status.
- **Zoho lock:** acknowledging an order locks it in Zoho with a "who and when" stamp, so it can't be edited under dispatch.
- Zoho "On Hold" orders are hidden automatically.

### 3.2 One-click multi-order assignment ✅
- Assign **several orders to one truck at once**.
- Pick **multiple drivers or helpers** per truck. The first becomes the primary driver.
- Live capacity bar shows kg assigned against the truck's rated capacity.
- **Cold-chain guard:** a refrigerated order cannot go on a truck marked non-refrigerated.
- **Duplicate guard:** an order already assigned can't be assigned again.
- **Locked trucks** (for example in repair) are blocked.
- **"+ New Driver"** adds a person to the staff directory on the spot and rejects duplicate email or mobile.
- Editable **assignment email preview** (subject and body) before sending.
- **Unassign** with protection: blocked once delivered, completed or on a confirmed manifest.
- Assignment is recorded to history exactly once, at the moment it happens.

### 3.3 Automatic notification on assignment ✅
One click on assign triggers the whole chain: driver email, WhatsApp, SMS, **AI voice call to each driver**, a team confirmation email, and a **team confirmation call** after drivers respond. Dispatchers do not chase anyone manually.

### 3.4 Route planning ✅
- Place search with autocomplete for origin, stops and destination.
- Road distance, travel time and cost for the chosen mode (fastest, shortest, balanced).
- Road-following route drawn on the map, with a timeline.
- **Optimize stop order** for a truck's delivery stops.
- Save the route and its stops, and create a manifest against a vehicle.

### 3.5 Fleet route optimization 🟡
- Looks at **all pending deliveries across the live fleet** and proposes which truck serves what, and in what order.
- Five objectives: **recommended, fastest, cheapest, shortest, balanced**.
- Respects **capacity, delivery time windows, driver shifts and cold-chain compatibility**.
- If an order can't be served, it says **why**: too heavy, no compatible vehicle, time window impossible, or unreachable.
- **Propose, then approve:** nothing changes until a dispatcher applies the proposal, and apply re-checks that data is still fresh.
- Reroute preview available from the AI assistant for any truck.
- *Limit:* the fleet-wide path currently runs through Google Route Optimization, which does not return unassigned-order reasons or arrival times, and does not receive the cold-chain rule. Customer delivery windows default to all-day until real windows are entered.

### 3.6 Cost and effort control through optimization
- **Cost model:** configurable rates per km and per driver hour, plus optional fuel, refrigeration and fixed costs, and adjustable weights for balanced mode.
- **Fewer trucks, shorter routes:** the optimizer's job is to serve all feasible orders with the least cost, time or distance, depending on the chosen objective.
- **Load discipline:** capacity bars and overage warnings on assignment, manifests and the Fleet table.
- **Manpower:** one dispatcher can plan, assign and notify a full day without phone calls (see §6).
- No savings figures are claimed here. Measure them against real runs once production data accumulates.

---

## 4. Live operations

### 4.1 Control Tower ✅
- Live Google map with oriented truck icons, route lines and per-truck info.
- KPIs: active vehicles, connection state (Connected, Stale, Offline), and open, critical and warning alerts.
- Tabs for Fleet, Routes and Comms beside the map.
- GPS from Cartrack, streamed live. The poll only runs while someone has the map open, which saves API calls.
- "No signal" shown when telemetry is more than 5 minutes old.
- Per-route health cards with **one-click optimize**, and the fleet optimization modal (preview, then apply).
- The AI assistant dock is built in.

### 4.2 Fleet ✅
- Date-driven truck table, defaulting to the next delivery day (Manila time).
- Per truck: assigned orders, destination cities, status, speed, fuel, **load against capacity**, **fulfilment (Fulfilled, Partial, Pending)** and pickup warehouse.
- Over-capacity loads show red with the overage amount.
- Per-truck drawer with assigned, shipped and remaining kg per order.
- **Delivery detected from Zoho package and shipment status.** Partial delivery keeps the truck's orders on screen. When everything is delivered, the truck clears and the orders are marked completed in history.
- Auto-sync with Zoho every 30 minutes, plus a manual refresh.
- Past dates show history. Locked and past vehicles are greyed out with the reason.
- Mobile card layout.

### 4.3 Orders ✅
Filterable list of live Zoho sales orders by status, assignment, delivery, vehicle and customer, with a detail drawer, column chooser and 30-minute auto-refresh.

### 4.4 Warehouse loading ✅
- **Manifest confirmation:** all selected orders must already be on that truck. It records total weight and a cold-chain category per item, and notifies the driver.
- **Loading checklist** cannot be completed without a seal number, a cargo count that matches, departure temperature and zone count, and driver acknowledgement. Completion marks the manifest "departed" and notifies the team.
- 🟡 The warehouse dashboard, receiving and exceptions pages are mostly static.

---

## 5. Reporting and visibility ✅

**Dispatch Dashboard**
- Orders today, trucks deployed, delivery progress (Pending / In Transit / Delivered).
- Summaries per truck and per salesperson, unassigned orders, and a muted count of orders moved outside IntelliFleet.
- Date selector, search, truck filter, sortable columns.
- Auto-refresh every minute, with a diagnostics view showing Zoho calls made, cache hits and timing.

**RGF Logistics Report**
- Fulfilment: due today and past due not packed, packed not shipped (by warehouse), shipped not delivered, delivered today.
- Transactions: pending inventory adjustments, transfer orders, purchase receives not billed or missing attachments, draft invoices.
- Per-card refresh, sales-order drawer, column picker, "as of" timestamp.
- Read-only by design, so opening a report never creates data or sends a message.

🟡 The Delivery Performance view still holds static presentation values.

---

## 6. AI agents and automation

### 6.1 Voice AI "Martin Cuico" ✅
- Places **real outbound phone calls** to drivers about a new assignment.
- Confirms identity, states the truck, pickup warehouse and order count, records the driver's confirmation, and answers order-detail questions from real assignment data only.
- Takes a reported problem and says the team has been notified. **Transfers to a human** when asked or when the driver is frustrated.
- Speaks **Tagalog, Taglish or English**, mirroring the driver, with short, natural turns.
- Calls the logistics team afterwards with a **team confirmation call**.
- Call log, transcript and recording playback inside the app.
- Realistic Filipino-capable voice through a dedicated text-to-speech relay.

### 6.2 Email AI agent 🟡
- Reads driver emails, recognises the driver, loads their live assignment, and understands intent (confirm, issue, question, emergency) in English and Tagalog.
- Replies in the same thread in the driver's language, and emails the team on confirmations, issues and escalations.
- Heavily guarded: never answers unknown senders, never sends if the AI fails, rejects any reply that names an order or plate not in the driver's real data, and applies cooldowns and hourly caps.
- Built and tested, **off by default** until switched on.

### 6.3 AI dispatcher assistant ✅
- Chat inside the Control Tower. Asks about fleet, trucks, assigned orders, alerts or order status and gets live answers, with charts.
- Can preview a reroute for any truck.
- **Acts only with approval:** sending a message or acknowledging an alert requires the user to confirm, runs under the user's own role and is audit-logged.
- Stays on logistics topics, never invents data, never reveals its instructions.

### 6.4 Automation summary
| Automation | Triggered by | Human step |
|---|---|---|
| Assignment notifications (email, WhatsApp, SMS, voice) | Dispatcher clicks assign | One click |
| Team confirmation email and call | Drivers' calls finish | None |
| Driver email replies | Incoming email | None once enabled |
| Zoho sync of assigned orders | Every 30 minutes | None |
| GPS refresh | Every 5 seconds while the map is open | None |
| Route optimization | Dispatcher request | Approve before apply |
| Chat assistant actions | User request | Approve each action |

---

## 7. Communications hub ✅

| Channel | Direction | Status |
|---|---|---|
| **Voice AI** | Outbound calls, call log, recordings | ✅ |
| **Email (Gmail)** | Send and receive, branded template, attachments, threading, labels, send log | ✅ |
| **WhatsApp** | Outbound template, delivery and reply visibility | 🟡 via n8n |
| **SMS** | Outbound and feed | 🟡 via n8n |
| **In-app alerts** | Acknowledge, escalate, resolve, with audit trail | 🟡 no automatic alert creation yet |

- Overview dashboard: messages sent this month, response rate, average reply time, confirmed vs unconfirmed drivers, and a needs-attention count. It refreshes every 20 seconds.
- Compose and send to drivers, customers or internal staff, with templates and a critical severity level.
- Branded RareChain email template with hero images and stat blocks.
- Staff directory with a cached copy and disk fallback, so assignment pickers keep working if n8n is down.

---

## 8. Zoho protection and performance ✅

Zoho has API limits, so the platform protects them:
- One shared rate limiter for all Zoho calls, with retry and backoff.
- Identical in-flight requests are merged into one.
- Smart caching: order windows for 5 minutes, item stock for 5 minutes, reports for 1 minute.
- Stale results never overwrite newer data after an edit.
- Today's views read **zero database queries**. History is saved only when something happens.
- A call-counting diagnostics view shows exactly what each screen costs.
- Verified earlier: repeated warm requests added no database or Zoho cost.

---

## 9. Control of effort, cost and manpower

**Vehicles**
- Rated capacity and refrigerated flag per truck, checked on assignment and manifest.
- Capacity overage is flagged. Unknown weights are never wrongly reported as overweight.
- Cold-chain orders are hard-blocked from non-refrigerated trucks.
- Trucks in repair or production can be locked out.
- Motorcycles are supported on the roster for small loads.

**People**
- Staff directory with drivers and helpers, searchable in the assignment picker.
- Multiple people per truck, all notified.
- One-click new driver creation.
- AI agents take over the repetitive confirmation work.
- *Not yet controlled:* driver double-booking across trucks or days, hours and shifts, licence limits, leave.

**Orders**
- Void or cancelled orders can't be acknowledged.
- Delivered, completed or manifested orders can't be unassigned.
- Orders fulfilled outside IntelliFleet show as a quiet count, not as errors.

**Cost**
- Per-km and per-hour rates, plus optional fuel, refrigeration and fixed costs, drive the optimizer's cost objective.
- Dispatch diagnostics show Zoho API cost per screen.

---

## 10. Security and access control

**In place ✅**
- Passwords hashed with bcrypt. Login errors don't reveal which field was wrong.
- Signed login tokens (8-hour default). The app won't start without a signing secret.
- **Roles:** admin, dispatcher, warehouse, planner. Roles come from the verified user, never from what the browser claims.
  - Admin only: audit log, integrations, users, agent controls.
  - Admin and dispatcher: assign, unassign, optimization, alerts.
  - Admin, dispatcher and warehouse: load planning, communications, manifests.
  - Warehouse or admin: warehouse events.
- Strict cross-origin policy. The app refuses to start with a wildcard.
- Startup safety check on database version.
- Shared-secret protection on the voice webhook and the voice relay, using constant-time checks.
- Logs avoid tokens, keys and message content.
- Every AI action that changes something needs explicit approval and is audit-logged.
- Unknown email senders are never answered by the AI.
- Secrets live in environment variables and a secret store, not in code.

**Known gaps to close before production 🟡**

| Gap | Impact |
|---|---|
| Fleet, orders and templates routes need no login | Fleet data readable, fake GPS could be injected |
| Live map feed (WebSocket) is open | Positions visible to anyone who connects |
| Message-status webhook has no secret | Delivery statuses could be altered |
| Order proof upload is open and public | Needs filename and access hardening |
| Logout doesn't revoke the token | A stolen token works until expiry |
| 10-minute user cache | A disabled user can keep working briefly |
| No login rate limit or lockout | Brute-force risk |
| Token in browser local storage | Exposed to any injected script |
| Audit log is in memory | Lost on restart. Login and assignment aren't logged yet |
| Over-capacity is a warning, not a block | Overloading is permitted |
| Double-assign check isn't atomic | Mitigated by running a single instance |

**Rotate before go-live:** database password, Zoho client secret and refresh token, assignment webhook secret and matching n8n credential, admin password, JWT secret. Restrict the browser maps key to the production domain.

---

## 11. What is not built yet

| Item | State |
|---|---|
| Driver mobile app, proof of delivery (photo and signature) | 🔴 The driver screens are a mock |
| Customer tracking link and portal | 🟡 Order lookup works. The map and support form are mocks |
| Vehicle maintenance tracking | 🔴 Not built |
| Geofencing and arrival alerts | 🔴 Not built |
| On-time delivery % and top-driver analytics | 🔴 Not built |
| Automatic alert generation | 🔴 Alerts screen works, nothing creates alerts |
| Order notes and comments | 🔴 Not built |
| Auto driver and vehicle matching | 🟡 To be investigated against current optimization |
| Customer-specific delivery windows | 🟡 Supported by the optimizer, not yet populated |
| Slack or Cliq integration | 🔴 None |
| Docker, CI/CD, Linux production build | 🔴 Not in the repo yet |
| Horizontal scaling | 🔴 Single instance only, with in-memory state that resets on restart |

Also worth fixing: the email template signs as "Martin Reyes" while the agents are "Martin Cuico". The assistant's "send message" action likely points to a route that no longer exists, so confirm it before relying on it.

---

## 12. Roadmap

1. **Security hardening:** authenticate fleet, orders and WebSocket, secure the webhook, rate-limit login, persist the audit log, rotate credentials.
2. **Driver app and proof of delivery:** unlocks driver-confirmed status and a meaningful customer tracking link.
3. **Alerts and geofencing:** late, off-route, stale GPS and depot arrival, created automatically.
4. **Analytics:** on-time rate, driver performance, cost per route measured from real runs.
5. **Maintenance tracking** for the fleet.
6. **Enable the email agent** after a dry-run review.
7. **Production readiness:** Docker, CI/CD, monitoring and a scaling plan.

---

## 13. Technology summary

React and Vite front end · FastAPI back end · Neon Postgres (history and configuration only) · Zoho Inventory · Cartrack · Vapi voice AI with a Cloudflare text-to-speech relay · Gmail · n8n · Twilio · OpenAI · Mapbox, OpenRouteService, Google Maps and Route Optimization · OR-Tools solver.

**Data rule:** live data stays live and in memory. History is written to the database once, when something happens. New tables or columns need Rishi's approval (`docs/DATABASE.md`).
