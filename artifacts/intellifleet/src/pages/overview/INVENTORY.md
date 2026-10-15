# Driver Overview — Phase A inventory (before the redesign, 2026-10-15)

Measured with Playwright on the pre-redesign page, 1440x900, mocked API (`e2e/overview.before.test.ts`,
screenshots in `e2e/screenshots/overview-before/`). Counting: every click; typing 0; scrolling 0.

## 1. Manager tasks — clicks BEFORE

| # | Task | Clicks | Path on the old page |
|---|------|-------:|----------------------|
| 1 | Where is every truck in its day now | 0 | Live board is the default — but it lists **people**, not trucks: TRK-1001 shows as two rows (driver + helper) and Alex's two trips are summed into "0 of 6". Per-trip progress needs a click per person. |
| 2 | Who needs attention (no activity, failed/partial, problem, far check-in) | 9 | stale chip on the board (0) → Trips tab for partial/failed (1) → Issues tab (2) → Live tab (3) → for each of 3 drivers: row + "Sales Orders" sub-tab (6) to find the far check-in. Grows by 2 per driver (3 + 2N). |
| 3 | Which invoices haven't come back | 1 | "Invoices & handover" tab. |
| 4 | Show me the proof for SO X (photo, time, GPS, invoice) | 3 | type SO in search (0) → driver row (1) → "Sales Orders" sub-tab (2) → scroll to the SO → photo (3). Without knowing the driver, search is the only way in. |
| 5 | What happened on yesterday's / last week's trips | 2 | Trips tab (own date range, default last 7 days) (1) → row expands the timeline (2). The top date picker does not drive this tab. |

`order_unassigned` audit events: **confirmed** shown in the old page — in the panel's "Recent activity" card
("Unassigned by dispatch · SO-TEST-3006 · was acknowledged · Test Dispatcher") and in the Sales Orders sub-tab's
"Show audit log" list ("Unassigned by dispatch - SO-TEST-3006 - was acknowledged - Test Dispatcher").

## 2. Duplication inventory (one fact, several places)

| Fact | Places on the old page |
|------|------------------------|
| Open issues | KPI "Open issues (all dates)"; Issues tab badge; Issues tab; panel Overview sub-tab "Operational issues" card; panel "Issues (n)" sub-tab — 4 places + a badge |
| Invoices / hard copies | KPI "Invoices outstanding"; KPI "Trips pending handover"; "Invoices & handover" tab; panel "Invoices (n)" sub-tab; per-SO "Handover to the officer" timeline row — 3 lists + 2 KPIs |
| Trips | Trips tab table; Live board rows (per person, two trips summed); panel trip chips (Day/History) — 3 places |
| Per-SO timeline | Trips tab row expansion and panel "Sales Orders" sub-tab render the same TripTimeline |
| Stop progress | board "x of y SOs done" + bar; panel "Trip progress" KPI; "Trip stops" card; panel "Stops" sub-tab (same card again); Trips table "Done" |
| Delivered / partial / failed | KPI strip (day); panel "Sales orders" KPI; Trips table "Outcomes"; timeline outcome chips; stop-card outcome text |
| Weight (kg, missing-weight note) | KPI group header; board row; panel "Total weight"; Trips table "Weight" |
| No activity / stale | board chip "No update for …"; panel "No recent update" chip + "Last update …" |
| Trip state | board chip; panel chip; Trips table chip; timeline header chip; 7 system words (to_acknowledge, ready, returned, handover_pending, …) |
| Started / trip length | panel "Started" KPI; Trips table "Started" + "Trip length"; timeline header |
| Crew | board (helper gets own row); panel "Helpers"/"Driver"; timeline "Crew" |
| Search | top "Search driver, truck or SO" + Live "Search drivers" |
| Date | top date; Trips From/To; panel History From/To; Export From/To — 4 date controls |
| Activity | "Recent activity" (last 6) + "Show audit log" (all) |

Counts that disagree: "Drivers active 4" vs 5 board rows (helper + idle); "On trip 1" counts people, the Trips tab counts batches.

## 3. Field inventory — the "nothing lost" checklist

Each field → where it lives in the new page. (TL = trip list row, T = table view, D = trip drawer, DS = drawer stop row,
DX = drawer stop expanded, INV = Invoices to collect tab, ISS = Issues tab, FB = filter bar, TI = tiles, OL = orders line.)

### KPI strip
| Old field | New home |
|-----------|----------|
| Drivers active | TI (sum of trips) + crew on each TL row; OL "n drivers on trips" |
| Drivers on trip | TI "On the road" (counts trips) |
| Drivers returned | TI "Back, invoices due" |
| Drivers idle | "Not assigned today (n)" list |
| SOs assigned | OL "48 orders" |
| SOs acknowledged | TL rail Load sub "4 of 5 acknowledged"; D header rail |
| Delivered / Partial / Failed | OL; TL outcomes; T Outcomes |
| Total kg + "n lines without weight" | OL "kg on these trips" + note; TL; D header; T Weight |
| Trips pending handover | TI "Back, invoices due" |
| Invoices outstanding (all dates) | tab "Invoices to collect (n)" |
| Open issues (all dates) | tab "Issues (n open)" |

### Filter bar / tabs
| Old | New |
|-----|-----|
| Date (Manila) ◀ ▶ Today | FB, same; + Range toggle From–To |
| Warehouse | FB |
| Status dropdown | replaced by the 5 tiles (tile filter) |
| Search driver, truck or SO | FB one search (driver, helper, plate, SO/TO, Invoice/DR, customer) |
| Live "Search drivers" | removed (FB search) |
| Tabs Live / Trips / Invoices & handover / Issues / Export CSV | Trips · Invoices to collect · Issues; Export CSV = FB button |

### Live board row (per person)
| Old | New |
|-----|-----|
| name, role "helper" | TL crew (driver + helpers on one row, call links) |
| vehicle / "No vehicle" | TL plate (bold) / "—" |
| "N trips" | TL "Trip N of M" (one row per trip) |
| state chip ("On trip · stop 4 of 5") | TL rail (Deliver "3 of 5 stops", current stop) |
| "x of y SOs done", progress bar | TL rail Deliver sub |
| "n acknowledged" | TL rail Load sub |
| kg / kg+ / missing-weight note | TL weight + note |
| last action label · time ago | TL "Last activity 4 min ago"; D Activity log |
| "No update for X" chip | TL red "No activity 42 min" + ⚠ "No activity" chip |

### Driver panel (header + Overview sub-tab)
| Old | New |
|-----|-----|
| avatar, name, state chip | D header crew + rail |
| Vehicle, Trip N of M | D header |
| Helpers / Driver names | D header crew |
| role · warehouse (no vehicle) | TL warehouse; "Not assigned today" list (name, warehouse, call) |
| Last update / "No recent update" | D header last activity + attention chip |
| Day / History + From/To | FB Range; D "Other days for this crew (last 7 days)" |
| Call link | D header + TL crew call links |
| trip chips (vehicle, date, chip label) | TL rows; D "Other days" |
| Trip progress done/total + % | D rail Deliver sub |
| Sales orders delivered / pending / partial · failed | D header outcomes |
| Total weight + note | D header |
| Started + Trip time | D header started/ended + trip length |
| Trip stops card (seq, customer, SO/TO, current stop, time, outcome / At stop / Next / Upcoming) | DS rows |
| Recent activity (last 6) | D Activity log (collapsed, full) + TL last activity |
| Operational issues card | D Issues on this trip (with reply) |
| "Updated … refreshes every 15 s" | header "Updated 12 s ago" |

### Per-SO timeline (TripTimeline: Sales Orders sub-tab and Trips row expansion)
| Old | New |
|-----|-----|
| trip header: vehicle, chip, Handover status | D header plate, rail, handover status |
| Crew (name, role) | D header crew |
| Trip length, Assigned, Trip started + by, Trip ended, Back at warehouse distance | D header "Times" block |
| Stop n, SO/TO badge, SO number, Invoice/DR, customer, address | DS row + DX address |
| outcome chip, "At site n min" | DS outcome chip; DX time at site |
| Acknowledged by, checklist version, answers (label: value, note, photo), discrepancy note, time | DX "Loaded (acknowledged)" block (+ ack GPS, received time) |
| "Not acknowledged yet" | DX "Not loaded yet" |
| Arrived: time, by, GPS (lat, lng ±m, map link) / No GPS: reason, distance, far, address has no coordinates | DX "Arrived" (+ received time if different) |
| Departed: time, by, GPS, Invoice/DR, outcome, reason, form answers (photos), time at site | DX "Left" (+ template version) + proof photos with caption |
| Photo thumbnail → enlarge | DS thumbnail + DX thumbnails → full viewer ◀ ▶ |
| Handover: officer status, carbon copy handed over / NOT, crew note, validated by, officer note, checked time | DX "Invoice/DR" block; D "Invoices for this trip" |
| Audit log (type, SO, actor, time; unassign detail) | D Activity log |

### Panel Invoices / Issues sub-tabs
| Old | New |
|-----|-----|
| Invoice/DR, customer, SO, handed over / officer status | D "Invoices for this trip" |
| Issues (by reporter) | D "Issues on this trip" (by trip) + ISS |

### Trips tab
| Old | New |
|-----|-----|
| From / To, "x of y trips" | FB Range; tab "Trips (n)" |
| Date, Driver (+ helpers), Vehicle (+ Trip n of m), Status, SOs, Done, Weight (+ note), Packs, Outcomes, Trip length, Started | T (Table view, same columns); range mode TL grouped by date |
| row → timeline | row → D |

### Invoices & handover tab
| Old | New |
|-----|-----|
| Show filter (All / With the driver / With the officer / Not handed over / Missing / Discrepancy) + counts | INV chips All · With driver · With officer · Not handed over · Missing · Wrong (with counts) |
| "n hard copies outstanding" | tab "Invoices to collect (n)" + line under the tab |
| SO (type badge), Invoice/DR, Customer, Status, Held by, Since (date + ago), Note | INV columns SO, Invoice/DR, Customer, Truck/driver (holder), Status, Since ("2 days" + date), Note |

### Issues tab
| Old | New |
|-----|-----|
| Open / All / Resolved / Closed | ISS same |
| reference, priority, status, time ago, category, reporter (role), vehicle, SO, "not tied to a trip", photo count | ISS card same + photo thumbnails with caption + trip reference → D |
| description, Status select, Reply (≤ 2,000), Save (disabled unchanged), Saving / error / "Saved. The driver sees it in Alerts." / "Nothing changed.", Last reply by | ISS + D (same IssueCard) |

### Export tab
| Old | New |
|-----|-----|
| From / To, warehouse note, Download CSV, Preparing…, "Downloaded <file>", error | FB "Export CSV" button: current filters (date/range, warehouse, search, tile); "Preparing…" then the file name |
| Columns list | button tooltip/title lists the columns |
