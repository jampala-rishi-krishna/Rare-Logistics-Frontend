import { api } from "./client";

export interface RgfSoRow {
  id: string;
  package_id?: string | null;
  so_number: string | null;
  customer: string | null;
  fulfillment_type?: string | null;
  delivery_method?: string | null;
  due_date?: string | null;
  date?: string | null;
  delivery_date?: string | null;
  shipped_date?: string | null;
}

export interface RgfWarehouseGroup {
  warehouse: string;
  count: number;
  orders: RgfSoRow[];
}

export interface RgfInventoryAdjustment {
  id: string;
  ia_type: string | null;
  qty: number | null;
  warehouse: string;
  date: string | null;
}

export interface RgfTransferOrder {
  id: string;
  to_number: string | null;
  status: string;
  from: string | null;
  to: string | null;
  qty: number | null;
  date: string | null;
}

export interface RgfPurchaseReceiveRow {
  id: string;
  pr_number: string | null;
  vendor: string | null;
  date: string | null;
  created_by: string | null;
  buckets: string[];
}

export interface RgfInvoiceRow {
  id: string;
  invoice_number: string | null;
  customer: string | null;
  so_number: string | null;
  date: string | null;
}

export interface RgfLogisticsReport {
  as_of: string;
  today: string;
  // Resource keys (e.g. "packages", "transfer_orders") this run couldn't read from Zoho -
  // usually because the connected Zoho OAuth token was never granted that module's scope.
  // KPIs/sections tied to an unavailable resource come back as null, not a false zero.
  unavailable: string[];
  errors: Record<string, string>;
  kpis: {
    due_past_due_not_packed: number | null;
    packed_not_shipped: number | null;
    shipped_not_delivered: number | null;
    delivered_today: number | null;
    transfers_pending: number | null;
    ia_pending_approval: number | null;
  };
  order_fulfillment: {
    due_past_due_not_packed: { groups: RgfWarehouseGroup[] };
    packed_not_shipped: { groups: RgfWarehouseGroup[] };
    shipped_not_delivered: { orders: RgfSoRow[] };
    delivered_today: { orders: RgfSoRow[] };
  };
  transactions: {
    inventory_adjustments_pending: RgfInventoryAdjustment[];
    transfer_orders: RgfTransferOrder[];
    purchase_receives: { not_billed: number | null; no_attachment: number | null; scanned: number; rows: RgfPurchaseReceiveRow[] };
    invoices_draft: { count: number | null; orders: RgfInvoiceRow[] };
  };
}

export type RgfReportSection = "sales-orders" | "packages" | "inventory-adjustments" | "transfer-orders" | "purchase-receives" | "invoices";

export function fetchRgfLogisticsReport(force = false, section?: RgfReportSection): Promise<RgfLogisticsReport> {
  return api.get<RgfLogisticsReport>("/api/reports/rgf-logistics", { ...(force ? { force: "true" } : {}), ...(section ? { section } : {}) });
}

export function getRgfSalesOrderDetail(id: string): Promise<Record<string, any>> {
  return api.get<Record<string, any>>(`/api/reports/rgf-logistics/sales-order/${id}`);
}

export function getRgfPurchaseReceiveDetail(id: string): Promise<Record<string, any>> {
  return api.get<Record<string, any>>(`/api/reports/rgf-logistics/purchase-receive/${id}`);
}
