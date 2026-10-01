# IntelliFleet Load Planning — Zoho Integration

This document describes the current Load Planning section, its three tabs, the frontend requests, backend routes, Zoho Inventory endpoints, filters, cache behavior, refresh behavior, and the purpose of each Zoho call.

## 1. Load Planning tabs

The tabs are rendered by `artifacts/intellifleet/src/App.tsx`:

1. **Inventory** — live/unassigned Sales Orders and item-level inventory/fulfillment information.
2. **Load Planning** — acknowledged, unassigned Sales Orders ready to be assigned to trucks.
3. **Confirmed SO** — assigned/confirmed Sales Orders and their assignment state.

The shared API functions are in `artifacts/intellifleet/src/services/api/inventory.ts`. The backend routes are in `backend/routers/load_planning.py`, under `/api/load-planning`.

## 2. Zoho connection used by every call

All Zoho Inventory requests are centralized in `backend/services/zoho_client.py`.

Base URL:

```text
{ZOHO_API_DOMAIN}/inventory/v1/{path}
```

Each request adds the Zoho OAuth bearer token and `organization_id=ZOHO_ORG_ID`. The token is obtained from `{ZOHO_ACCOUNTS_URL}/oauth/v2/token` using `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_REFRESH_TOKEN`, then cached in memory until near expiry. HTTP 429 and 5xx responses are retried with bounded backoff.

The backend never exposes Zoho credentials to the browser. The frontend calls IntelliFleet endpoints only.

## 3. Inventory tab

Frontend component: `artifacts/intellifleet/src/components/load-planning/LoadPlanningInventoryTab.tsx`.

### 3.1 List and filters

Frontend request:

```http
GET /api/load-planning/inventory/sales-orders
```

Parameters include `date_from`, `date_to`, `page`, `per_page=100`, `status`, `search`, `assignment`, `cities`, `vehicle`, `customer`, and `delivery_status`.

For current unassigned Inventory data, the backend obtains the live Zoho window through:

```http
GET /inventory/v1/salesorders
```

The list response supplies compact fields such as `salesorder_id`, `salesorder_number`, customer, statuses, dates, salesperson, totals, and summary data. The list payload is not assumed to contain complete line-item detail.

Source behavior:

- Current/future assigned orders: in-memory assigned snapshot backed by live Zoho data.
- Past assigned orders: Neon `sales_order_history` for durable historical assignment state.
- Unassigned/no assignment filter: live Zoho window cache.

### 3.2 Acknowledged filter

When status is **Acknowledged**, the backend calls Zoho's saved custom view:

```http
GET /inventory/v1/salesorders?customview_id=4489499000002275225&page=<page>&per_page=200
```

The custom-view ID is configurable through `ZOHO_ACKNOWLEDGED_CUSTOMVIEW_ID`. Returned `salesorder_id` values are used to filter the local rows, matching Zoho's own Acknowledged view instead of reconstructing its sub-status logic.

### 3.3 Warehouse stock quantities

For each unique line-item ID, the backend calls:

```http
GET /inventory/v1/items/{item_id}
```

It reads `warehouse_available_for_sale_stock`, `available_for_sale_stock`, or `available_for_sale` from the item warehouse structures.

Matching rules:

- Mets: name contains `mets cold storage`.
- Glacier: name contains `glacier south rgf`.
- Ignore names ending in `(deactivated)` or beginning with `(do not use)`.
- Exclude Mets names containing `near-expiry` or `for supermarket`.

Item stock is cached in memory for five minutes. The order-level result uses the minimum usable warehouse quantity across its line items; otherwise it returns `null`, never a fabricated quantity.

### 3.4 Open Sales Order detail

Frontend:

```http
GET /api/load-planning/inventory/sales-orders/{salesorder_id}
```

Zoho:

```http
GET /inventory/v1/salesorders/{salesorder_id}
```

This supplies current address, line items, totals, products, warehouse data, and status. If Zoho fails and a cached record exists, the backend returns the cached record with a cached indicator.

### 3.5 Acknowledge one order

Frontend:

```http
POST /api/load-planning/inventory/sales-orders/{salesorder_id}/acknowledge
```

Zoho:

```http
POST /inventory/v1/salesorders/{salesorder_id}/substatus/cs_acknowl
```

The backend rejects already acknowledged, void, or cancelled orders. On success it refreshes the order cache and invalidates the Zoho window cache.

### 3.6 Remove acknowledgement

Frontend:

```http
POST /api/load-planning/inventory/sales-orders/{salesorder_id}/remove-acknowledge
```

Zoho:

```http
POST /inventory/v1/salesorders/{salesorder_id}/substatus/confirmed
```

The backend verifies the current status is acknowledged, changes Zoho back to Confirmed, fetches detail, refreshes local data, and invalidates the list cache.

### 3.7 Bulk acknowledgement

`POST /api/load-planning/inventory/sales-orders/acknowledge-filtered` resolves the filtered set, excludes acknowledged/void/cancelled orders, and calls the same `substatus/cs_acknowl` endpoint once per eligible order. It returns filtered, eligible, acknowledged, and failed counts.

### 3.8 Refresh

`POST /api/load-planning/inventory/refresh` invalidates the live Zoho window and assigned-order caches. The next read pulls fresh Zoho data. It does not write Neon history or modify Zoho. `GET /api/load-planning/inventory/refresh/status` reports the background refresh state.

## 4. Load Planning tab

Frontend component: `artifacts/intellifleet/src/components/load-planning/LoadPlanningAssignmentTab.tsx`.

This is the truck-assignment queue. It defaults to a PHT date window beginning tomorrow and requests acknowledged, unassigned orders.

It calls `GET /api/load-planning/inventory/sales-orders` twice:

1. A city-source request to build the destination-city selector.
2. The visible queue request for the acknowledged/unassigned order rows.

Both use `date_from`, `date_to`, `status=Acknowledged`, and `assignment=unassigned`. The backend applies the date window, live Zoho cache, Zoho custom-view membership, assignment state, search, city, vehicle, customer, and delivery filters. Selecting orders navigates to the assignment panel with their IDs.

## 5. Confirmed SO tab

The Confirmed SO tab reuses `LoadPlanningInventoryTab` with `assignmentScope="assigned"`.

For current/future dates, it reads the in-memory assigned snapshot. For past dates, it reads Neon `sales_order_history`, preserving historical assignment and status state. It does not bulk mirror Zoho into Neon.

Opening a confirmed order still fetches current Zoho detail through `GET /inventory/v1/salesorders/{salesorder_id}` via the backend detail route.

## 6. Truck assignment flow

### Assignment options

```http
GET /api/load-planning/assignments/{salesorder_id}
```

This uses the live order cache, reads vehicle profiles from Neon, calculates assigned capacity in memory, and reads driver/helper candidates from the n8n staff-directory cache. It does not use Zoho to find staff.

### Assign order(s)

```http
POST /api/load-planning/assignments/{first_salesorder_id}
```

The payload contains `salesorder_ids`, `vehicle_id`, `driver_id`, and `driver_ids`. Assignment history is written to Neon, live assignment state is updated, and the existing notification flow is used. Assignment itself does not change the Zoho Sales Order status.

### New driver

```http
POST /api/load-planning/assignments/new-driver
```

This writes to the n8n Staff Directory workflow, not Zoho or Neon. The returned record is added to the in-memory staff cache immediately.

## 7. Email and exports

`POST /api/load-planning/email/draft` resolves filtered orders, hydrates missing detail through `GET /inventory/v1/salesorders/{id}`, and sends compact order context to the email-draft service.

`POST /api/load-planning/email/send` hydrates order details, creates PDF/Excel attachments, and sends them to the n8n email webhook. It does not write to Zoho.

Exports use:

```http
GET /api/load-planning/inventory/export/excel
GET /api/load-planning/inventory/export/pdf
```

Rows missing complete line-item detail are hydrated through the Sales Order detail endpoint before file generation.

## 8. Complete Zoho endpoint inventory

| Zoho endpoint | Method | Purpose |
|---|---|---|
| `/inventory/v1/salesorders` | GET | List Sales Orders for date windows, search, and status data |
| `/inventory/v1/salesorders?customview_id=4489499000002275225` | GET | Match Zoho's saved Acknowledged view |
| `/inventory/v1/salesorders/{id}` | GET | Full order detail for drawers, exports, and email |
| `/inventory/v1/items/{item_id}` | GET | Mets/Glacier available-for-sale stock |
| `/inventory/v1/salesorders/{id}/substatus/cs_acknowl` | POST | Mark an order acknowledged in Zoho |
| `/inventory/v1/salesorders/{id}/substatus/confirmed` | POST | Remove acknowledgement in Zoho |

The Zoho client also contains wrappers for Packages, Transfer Orders, Inventory Adjustments, Purchase Receives, and Invoices used elsewhere in Reports and operations; they are not part of the normal three-tab Load Planning list flow.

## 9. Data-source and cache rules

- Current live Sales Orders: Zoho plus in-memory cache.
- Current unassigned Inventory/Load Planning: live Zoho window cache.
- Current assigned/Confirmed SO: in-memory assigned snapshot.
- Past assigned/Confirmed SO: Neon `sales_order_history`.
- Item warehouse stock: five-minute in-memory cache.
- Staff: n8n DataTable plus in-memory/disk cache, never Neon.
- Refresh: invalidates live caches so the next read calls Zoho.

## 10. Source files

- `artifacts/intellifleet/src/App.tsx` — tab shell and assignment panel
- `artifacts/intellifleet/src/components/load-planning/LoadPlanningInventoryTab.tsx` — Inventory and Confirmed SO UI
- `artifacts/intellifleet/src/components/load-planning/LoadPlanningAssignmentTab.tsx` — Load Planning queue UI
- `artifacts/intellifleet/src/services/api/inventory.ts` — browser API client
- `backend/routers/load_planning.py` — backend routes and filters
- `backend/services/zoho_client.py` — OAuth, retries, and Zoho endpoint wrappers
- `backend/services/live_sales_order_cache.py` — live Sales Order cache
- `backend/services/warehouse_stock.py` — item stock calls and warehouse matching
- `backend/services/inventory_exports.py` — PDF/Excel generation
