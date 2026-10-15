// Test-only v2 read-model fixtures. All data is fictitious and every filter runs locally.
import * as ov from "./fixtures/overviewData.ts";
import type { IssueRow, TripRow, TileId } from "../src/services/api/overview.ts";

export const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shift = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const matches = (q: string, values: unknown[]) => values.some((v) => String(v ?? "").toLowerCase().includes(q.trim().toLowerCase()));

export function v2Rows(): TripRow[] {
  return ov.trips.trips.map((r, i) => {
    const active = r.state === "on_trip";
    const closed = r.state === "closed";
    const step = closed ? "closed" : active ? 2 : r.state === "returned" ? 3 : 1;
    const tile = closed ? "closed" : active ? "on_road" : step === 3 ? "back" : "loading";
    const flags = active ? ["no_activity", "partial", "not_delivered", "far_checkin", "no_gps", "problem_open", "order_removed"] : [];
    const b3 = r.batch_id === "b-3";
    return {
      ...r, date: i < 3 ? today : shift(i === 3 ? -1 : -2),
      warehouse: r.driver_name === "Dana Hauler" ? "GLACIER" : "METS",
      step: { step, label_key: closed ? "closed" : active ? "on_road" : step === 3 ? "invoices_due" : "waiting_crew", sub: { total: r.so_count, acknowledged: r.acknowledged, done: r.stops_done, received: closed ? r.so_count : 0, total_invoices: r.so_count } },
      tile, crew: [{ id: b3 ? 103 : 101, name: r.driver_name, role: "driver", phone: "09170000103" }, { id: 102, name: "Sam Helper", role: "helper", phone: "09170000102" }],
      outcomes: { delivered: r.delivered, partial: r.partial, failed: r.failed },
      invoices: { total: r.so_count, received: closed ? r.so_count : 0, missing: 0, discrepancy: 0, with_driver: active ? r.stops_done : 0, with_officer: step === 3 ? r.so_count : 0 },
      attention: flags.map((code) => ({ code, label: ({ no_activity: "No activity", partial: "Partial", not_delivered: "Not delivered", far_checkin: "Far check-in", no_gps: "No GPS", problem_open: "Problem reported", order_removed: "Order removed" } as Record<string, string>)[code], stop_so_id: ["partial", "not_delivered", "far_checkin"].includes(code) ? "so-2" : null })),
      last_crew_activity_at: new Date(Date.now() - (active ? 42 : 4) * 60000).toISOString(), duration_minutes: r.trip_minutes,
      so_numbers: b3 ? ov.tripTimeline.orders.map((o) => o.so_number) : [`SO-${r.batch_id}-1`],
      invoice_nos: b3 ? ["000456", "000457", "000458"] : [],
      customers: b3 ? ov.tripTimeline.orders.map((o) => o.customer_name) : ["Test Customer"],
    } as TripRow;
  });
}

export function v2TripsResponse(p: URLSearchParams) {
  const from = p.get("from") || p.get("date") || today;
  const to = p.get("to") || p.get("date") || today;
  const q = p.get("q") || "";
  const warehouse = p.get("warehouse");
  const rows = v2Rows().filter((r) => r.date! >= from && r.date! <= to && (!warehouse || r.warehouse === warehouse) && (!q || matches(q, [r.driver_name, ...r.helpers ?? [], r.vehicle, ...r.so_numbers ?? [], ...r.invoice_nos ?? [], ...r.customers ?? []])));
  const tile_counts = { loading: 0, on_road: 0, back: 0, closed: 0, attention: 0 };
  const orders_line = { orders: 0, delivered: 0, partial: 0, failed: 0, to_go: 0 };
  for (const r of rows) {
    tile_counts[r.tile!]++;
    if (r.attention?.length) tile_counts.attention++;
    orders_line.orders += r.so_count;
    orders_line.delivered += r.outcomes!.delivered;
    orders_line.partial += r.outcomes!.partial;
    orders_line.failed += r.outcomes!.failed;
    orders_line.to_go += r.so_count - r.stops_done;
  }
  const tile = p.get("tile") as TileId;
  const trips = rows.filter((r) => !tile || (tile === "attention" ? r.attention!.length > 0 : r.tile === tile));
  return { from, to, generated_at: new Date().toISOString(), stale_minutes: 15, total: trips.length, tile_counts, orders_line, trips, not_assigned: [{ staff_id: 105, name: "Eli Standby", warehouse: "METS", phone: "09170000105" }] };
}

export function v2Issues(p = new URLSearchParams(), issues: IssueRow[] = structuredClone(ov.issues.issues) as IssueRow[]) {
  const status = p.get("status") || "open";
  const warehouse = p.get("warehouse");
  const q = p.get("q") || "";
  const date = p.get("date");
  const rows = issues.filter((i) => (status === "all" || (status === "open" ? !["closed", "resolved"].includes(i.status) : i.status === status))
    && (!warehouse || warehouse === "METS") && (!date || date === today)
    && (!q || matches(q, [i.reference, i.category, i.description, i.reporter.name, i.vehicle, i.so_number, i.batch_id === "b-3" ? "Sam Helper" : "", i.batch_id === "b-3" ? "000457" : ""])));
  return { ...ov.issues, issues: rows.map((i) => ({ ...i, warehouse: "METS", photos: i.photo_ids.map((id) => ({ photo_id: id, so_number: i.so_number, captured_at: `${today}T13:42:00+08:00`, kind: "problem" })) })), open_count: issues.filter((i) => !["closed", "resolved"].includes(i.status)).length };
}

export function v2Hardcopies(p: URLSearchParams) {
  const rows = ov.hardcopies.rows.map((r) => ({ ...r, so_id: r.batch_id === "b-3" ? "so-1" : "so-2", batch_id: r.state === "with_driver" ? "b-3" : "h-1", delivery_date: r.state === "with_driver" ? today : shift(-1), warehouse: r.state === "with_driver" ? "METS" : "GLACIER", vehicle: r.state === "with_driver" ? "TRK-2002" : "TRK-3003", driver_name: r.state === "with_driver" ? "Casey Runner" : "Dana Hauler", helpers: ["Sam Helper"] }))
    .filter((r) => (!p.get("warehouse") || r.warehouse === p.get("warehouse")) && (!p.get("date") || r.delivery_date === p.get("date")) && (!p.get("q") || matches(p.get("q")!, [r.so_number, r.invoice_no, r.customer_name, r.driver_name, r.vehicle, ...r.helpers])));
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1;
  return { generated_at: new Date().toISOString(), total: rows.length, counts, rows };
}

export function v2Timeline(batch: string, issues: IssueRow[] = structuredClone(ov.issues.issues) as IssueRow[], base = ov.tripTimelineWithUnassign) {
  const row = v2Rows().find((r) => r.batch_id === batch) ?? v2Rows()[0];
  return {
    ...structuredClone(base), batch: { ...base.batch, batch_id: batch, delivery_date: row.date, vehicle: row.vehicle, warehouse: row.warehouse, trip_number: row.trip_number, trips_on_date: row.trips_on_date, kg: row.kg, kg_unknown_lines: row.kg_unknown_lines, packs: row.packs },
    step: row.step, tile: row.tile, attention: row.attention,
    invoices: base.orders.map((o) => ({ so_id: o.so_id, so_number: o.so_number, invoice_no: o.stop?.checkout?.invoice_no ?? null, status: "with_driver", officer_name: null, checked_at: null, officer_note: null })),
    last_crew_activity_at: row.last_crew_activity_at,
    crew: row.crew,
    trip: { ...base.trip, status: row.state === "to_acknowledge" ? "pending" : row.state, step: row.step, trip_number: row.trip_number, trips_on_date: row.trips_on_date },
    orders: base.orders.map((o) => ({ ...o, flags: o.stop?.checkin?.far ? ["far_checkin"] : [],
      ack: o.ack ? { ...o.ack, gps: { lat: 14.6, lng: 121.03, accuracy_m: 9 }, received_at: o.ack.at } : null,
      photos: (o.stop?.checkout?.answers ?? []).filter((a) => "photo_url" in a).map((a) => ({ photo_id: Number(String(a.photo_url).split("/").pop()), so_number: o.so_number, captured_at: `${today}T13:42:00+08:00`, kind: o.stop?.checkout?.outcome?.startsWith("Partial") ? "partial" : "delivered" })),
    })),
    issues: v2Issues(new URLSearchParams({ status: "all" }), issues).issues.filter((i) => i.batch_id === batch),
    other_days: v2Rows().filter((r) => r.driver_name === row.driver_name && r.batch_id !== batch),
  };
}
