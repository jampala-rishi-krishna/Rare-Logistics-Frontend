import { api } from "./client";

export interface SalesOrderSummary {
  id: string;
  salesorder_number: string | null;
  reference_number: string | null;
  customer_name: string | null;
  order_status: string | null;
  invoice_status: string | null;
  payment_status: string | null;
  shipment_status: string | null;
  order_date: string | null;
  expected_shipment_date: string | null;
  total: number | null;
  delivery_method: string | null;
  salesperson_name: string | null;
  synced_at: string;
  assignment_status?: string;
  vehicle_id?: string | null;
  driver_id?: number | null;
  driver_name?: string | null;
  shipping_city?: string | null;
  shipping_address?: unknown;
  notes?: string | null;
  mets_qty_available_for_sale?: number | null;
  glacier_qty_available_for_sale?: number | null;
  assigned_at?: string | null;
  assigned_by?: number | null;
  product_count?: number;
  products?: { mets_qty_available_for_sale?: number | null; glacier_qty_available_for_sale?: number | null; line_item_id?: string | null; item_id?: string | null; name: string | null; sku: string | null; quantity: number; unit: string | null; total_weight_kg?: number | null; packaging_type?: "pack" | "case" | null; pack_quantity?: number; case_quantity?: number; quantity_packed: number; quantity_shipped: number }[];
  pack_count?: number;
  case_count?: number;
  unit_count?: number;
  total_item_quantity?: number;
  zoho_lock?: ZohoLockStatus;
}

export interface ZohoLockStatus {
  is_locked: boolean;
  config_id?: string;
  config_name?: string | null;
  locked_by?: string | null;
  lock_time?: string | null;
  reason?: string | null;
  lock_error?: string | null;
}

export interface SalesOrdersPage {
  items: SalesOrderSummary[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
  /** True while Mets/Glacier stock and item weights are still being fetched in the background. */
  stock_pending?: boolean;
  /** Total kg across every filtered order (all pages), from the weights known so far. */
  total_weight_kg?: number;
  /** False when some line has no known weight yet (or Zoho has no package weight for it). */
  weight_complete?: boolean;
}

export interface AssignmentOptions {
  order: {
    id: string;
    number: string | null;
    customer: string | null;
    address: unknown;
    weight_kg: number | null;
    /** Total of every selected order (this one + the others assigned together); null if any weight is unverified. */
    selected_weight_kg?: number | null;
    weight_verified?: boolean;
    weight_warning?: string | null;
    requires_reefer: boolean;
    assignment_status: string;
  };
  constraint: {
    opening_time?: string;
    receiving_cutoff_time?: string;
    avg_processing_time_minutes?: number;
    requires_reefer?: boolean;
    notes?: string;
  } | null;
  constraint_status: string;
  vehicles: {
    vehicle_id: string;
    vehicle_type: string;
    capacity_note?: string | null;
    capacity_kg: number | null;
    reefer: boolean | null;
    gps_tracked: boolean;
    third_party: boolean;
    assigned_weight_kg: number;
    remaining_capacity_kg: number | null;
  }[];
  drivers: { id: number; name: string; title: string | null }[];
}
export function getAssignmentOptions(id: string, otherSelectedIds: string[] = []) {
  return api.get<AssignmentOptions>(`/api/load-planning/assignments/${id}`, otherSelectedIds.length ? { extra_ids: otherSelectedIds.join(",") } : undefined);
}
export function assignSalesOrder(
  id: string,
  vehicleId: string,
  driverId: number | null,
) {
  return api.post(`/api/load-planning/assignments/${id}`, {
    salesorder_ids: [id],
    vehicle_id: vehicleId,
    driver_id: driverId,
  });
}

export function unassignSalesOrder(id: string) {
  return api.post<{ success: boolean; salesorder_id: string; assignment_status: string }>(
    `/api/load-planning/assignments/${encodeURIComponent(id)}/unassign`,
    {},
  );
}

export function optimizeAssignedStops(vehicleId: string) {
  return api.post(
    `/api/load-planning/assignments/vehicle/${encodeURIComponent(vehicleId)}/optimize-stops`,
  );
}

export function listPlanningOrders() {
  return api.get<
    Array<
      SalesOrderSummary & {
        weight_kg: number;
        cold_chain_category: string;
        manifest_id?: string | null;
      }
    >
  >("/api/load-planning/planning/orders");
}

export function confirmManifest(vehicleId: string, salesorderIds: string[]) {
  return api.post("/api/load-planning/manifests/confirm", {
    vehicle_id: vehicleId,
    salesorder_ids: salesorderIds,
  });
}

export function getDispatchDashboard(date?: string, refresh = false) {
  return api.get("/api/load-planning/dispatch-dashboard", { date, refresh: refresh ? "true" : undefined });
}

export function getWarehouseChecklist(manifestId: number | string) {
  return api.get(`/api/load-planning/warehouse/checklists/${manifestId}`);
}

export function completeWarehouseChecklist(
  manifestId: number | string,
  body: {
    seal_number: string;
    cargo_count_actual: number;
    departure_temp_c: number;
    departure_temp_zone_count: number;
    driver_acknowledged: boolean;
  },
) {
  return api.post(
    `/api/load-planning/warehouse/checklists/${manifestId}/complete`,
    body,
  );
}

export function listSalesOrders(
  dateFrom: string,
  dateTo: string,
  page = 1,
  status = "All",
  search = "",
  assignment?: "assigned" | "unassigned",
  cities: string[] = [],
  filters: { vehicle?: string; customer?: string; deliveryStatus?: string } = {},
): Promise<SalesOrdersPage> {
  return api.get<SalesOrdersPage>("/api/load-planning/inventory/sales-orders", {
    date_from: dateFrom,
    date_to: dateTo,
    page,
    per_page: 100,
    status,
    search,
    assignment,
    cities: cities.join(","),
    vehicle: filters.vehicle,
    customer: filters.customer,
    delivery_status: filters.deliveryStatus,
  });
}

export function getSalesOrderDetail(id: string) {
  return api.get<any>(
    `/api/load-planning/inventory/sales-orders/${encodeURIComponent(id)}`,
  ).then((response) => {
    const record = response?.salesorder || response;
    return { ...record, raw_json: response?.raw_json || record?.raw_json } as SalesOrderSummary & { raw_json?: Record<string, unknown> };
  });
}

export function listSalesOrderCities(dateFrom: string, dateTo: string) {
  return api.get<{ cities: string[] }>(
    "/api/load-planning/inventory/sales-orders/cities",
    { date_from: dateFrom, date_to: dateTo },
  );
}

export function assignSalesOrders(
  ids: string[],
  vehicleId: string,
  driverIds: number[],
) {
  return api.post(
    `/api/load-planning/assignments/${encodeURIComponent(ids[0])}`,
    {
      salesorder_ids: ids,
      vehicle_id: vehicleId,
      driver_id: driverIds[0] ?? null,
      driver_ids: driverIds,
    },
  );
}

export interface NewDriverInput {
  name: string;
  email: string;
  phone: string;
  title?: string;
  warehouse?: string;
}

export interface CreatedDriver {
  id: number;
  name: string;
  title: string;
  email: string;
  phone: string;
  warehouse: string;
}

// Writes to the n8n Logistics Staff Directory (via the backend) - not Neon.
export function createNewDriver(input: NewDriverInput) {
  return api.post<CreatedDriver>("/api/load-planning/assignments/new-driver", input);
}

export function sendAssignmentEmail(
  ids: string[],
  vehicleId: string,
  driverIds: number[],
  options: { preview?: boolean; htmlBody?: string; subject?: string } = {},
) {
  return api.post<{
    success?: boolean;
    messageId?: string;
    error?: string;
    driverHtmlBody?: string;
    driverSubject?: string;
    teamHtmlBody?: string;
    teamSubject?: string;
    drivers?: string[];
    emailStatus?: "queued" | "not_configured";
    // Per-channel hand-off status, e.g. whatsapp: "skipped_missing_secret".
    channels?: Record<string, string>;
  }>("/api/load-planning/assignments/send-assignment-email", {
    salesorder_ids: ids,
    vehicle_id: vehicleId,
    driver_id: driverIds[0] ?? null,
    driver_ids: driverIds,
    preview: options.preview ?? false,
    html_body: options.htmlBody,
    subject: options.subject,
  });
}

export function refreshSalesOrders(
  dateFrom?: string,
  dateTo?: string,
): Promise<{ sync_started: boolean; synced_count: number; synced_at: string }> {
  return api.post("/api/load-planning/inventory/refresh", undefined, {
    date_from: dateFrom,
    date_to: dateTo,
  });
}

export function getRefreshStatus(): Promise<{
  running: boolean;
  synced_count: number;
  error: string | null;
  finished_at: string | null;
}> {
  return api.get("/api/load-planning/inventory/refresh/status");
}

export function getSalesOrder(id: string): Promise<Record<string, any>> {
  return api.get<Record<string, any>>(
    `/api/load-planning/inventory/sales-orders/${id}`,
  );
}

export function acknowledgeSalesOrder(
  id: string,
): Promise<Record<string, any>> {
  return api.post<Record<string, any>>(
    `/api/load-planning/inventory/sales-orders/${id}/acknowledge`,
  );
}

export function retrySalesOrderLock(
  id: string,
): Promise<Record<string, any>> {
  return api.post<Record<string, any>>(
    `/api/load-planning/salesorders/${encodeURIComponent(id)}/lock`,
  );
}

export function removeAcknowledgeSalesOrder(
  id: string,
): Promise<Record<string, any>> {
  return api.post<Record<string, any>>(
    `/api/load-planning/inventory/sales-orders/${id}/remove-acknowledge`,
  );
}

export function acknowledgeFilteredSalesOrders(
  dateFrom: string,
  dateTo: string,
  status: string,
  search: string,
): Promise<{
  filtered_count: number;
  eligible_count: number;
  acknowledged_count: number;
  failed_count: number;
}> {
  return api.post(
    `/api/load-planning/inventory/sales-orders/acknowledge-filtered`,
    undefined,
    { date_from: dateFrom, date_to: dateTo, status, search },
  );
}

export function downloadSalesOrders(
  format: "pdf" | "excel",
  dateFrom: string,
  dateTo: string,
  status: string,
  search: string,
  assignment?: "assigned" | "unassigned",
) {
  return api.download(`/api/load-planning/inventory/export/${format}`, {
    date_from: dateFrom,
    date_to: dateTo,
    status,
    search,
    assignment,
  });
}

export interface EmailFilterContext {
  date_from: string;
  date_to: string;
  status: string;
  search: string;
  order_ids?: string[];
  assignment?: "assigned" | "unassigned";
}

export interface EmailDraft {
  subject: string;
  htmlBody: string;
}

export function createSalesOrderEmailDraft(
  context: EmailFilterContext,
): Promise<EmailDraft> {
  return api.post<EmailDraft>("/api/load-planning/email/draft", context, undefined, 30000);
}

export function sendSalesOrderEmail(
  payload: EmailFilterContext & {
    to: string;
    subject: string;
    htmlBody: string;
  },
): Promise<{ success?: boolean; messageId?: string; message?: string }> {
  return api.post("/api/load-planning/email/send", payload, undefined, 90000);
}
