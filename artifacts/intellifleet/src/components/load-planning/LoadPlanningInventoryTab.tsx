import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import * as inventoryApi from "@/services/api/inventory";
import { StockQty } from "./StockQty";
import { formatAddress } from "@/lib/address";
import { HorizontalScrollTable } from "./HorizontalScrollTable";
import { SalesOrderCardGrid, ViewModeToggle } from "./SalesOrderCardGrid";
import { BranchBadge, BranchFilter, useBranchOptions } from "./BranchControls";
import { FilterField, Toolbar, buttonClass, dangerButtonClass, inputClass, primaryButtonClass } from "./ToolbarControls";
import { forgetSessionAcknowledged, rememberSessionAcknowledged, removeOrdersFromPage, sessionAcknowledgedIds, settleAcknowledgements, summarizeAcknowledgements } from "@/lib/acknowledgeCache";
import { readViewMode, uniqueOrders, writeViewMode, type ViewMode } from "@/lib/loadPlanningView";
import type { QueryClient } from "@tanstack/react-query";

// Query-key prefixes. The Inventory list's key carries its scope ("inventory" | "assigned"), so
// the Inventory and Confirmed SO tabs can never share a cache entry.
const INVENTORY_LIST_KEY = "inventory-sales-orders";
const LOAD_PLANNING_LIST_KEY = "load-planning-unassigned";

/** Acknowledged orders leave the Inventory lists the moment Zoho confirms - no waiting for a refetch. */
function dropFromInventory(client: QueryClient, ids: string[]) {
  client.setQueriesData<inventoryApi.SalesOrdersPage>(
    { predicate: (query) => query.queryKey[0] === INVENTORY_LIST_KEY && query.queryKey[1] === "inventory" && query.queryKey[5] !== "Acknowledged" },
    (page) => removeOrdersFromPage(page, ids),
  );
}
/** Orders whose acknowledgement was removed leave the Load Planning (acknowledged, unassigned) list. */
function dropFromLoadPlanning(client: QueryClient, ids: string[]) {
  client.setQueriesData<inventoryApi.SalesOrdersPage>({ queryKey: [LOAD_PLANNING_LIST_KEY] }, (page) => removeOrdersFromPage(page, ids));
}
/** Re-read Inventory + counts and Load Planning, plus any open drawer for these orders. */
function refetchOrderLists(client: QueryClient, ids: string[]) {
  return Promise.all([
    client.invalidateQueries({ queryKey: [INVENTORY_LIST_KEY] }),
    client.invalidateQueries({ queryKey: [LOAD_PLANNING_LIST_KEY] }),
    ...ids.map((id) => client.invalidateQueries({ queryKey: ["inventory-sales-order", id] })),
  ]);
}

// The line item's own Zoho "Available for Sale". Only saved past-dated orders (whose lines
// carry no per-item stock at all) fall back to the order-level figure stored with them.
function lineStock(order: inventoryApi.SalesOrderSummary, product: ReturnType<typeof lineProduct>, site: "mets" | "glacier") {
  const key = site === "mets" ? "mets_qty_available_for_sale" : "glacier_qty_available_for_sale";
  const productValue = product?.[key];
  return productValue != null ? productValue : order[key];
}

function lineWeightLabel(product: ReturnType<typeof lineProduct>, pending?: boolean) {
  return product?.total_weight_kg == null
    ? pending
      ? "..."
      : "-"
    : `${Number(product.total_weight_kg).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`;
}

function lineProduct(order: inventoryApi.SalesOrderSummary, item: any, index?: number) {
  const itemId = item?.item_id ?? item?.itemid ?? item?.item?.item_id ?? item?.item?.id;
  const lineItemId = item?.line_item_id == null ? null : String(item.line_item_id);
  const itemIdText = itemId == null ? null : String(itemId);
  const sku = item?.sku == null ? null : String(item.sku);
  const products = order.products ?? [];
  const matched = products.find((entry) => {
    const entryLineItemId = entry.line_item_id == null ? null : String(entry.line_item_id);
    const entryItemId = entry.item_id == null ? null : String(entry.item_id);
    const entrySku = entry.sku == null ? null : String(entry.sku);
    return (
      (entryLineItemId && lineItemId && entryLineItemId === lineItemId) ||
      (entryItemId && itemIdText && entryItemId === itemIdText) ||
      (entrySku && sku && entrySku === sku)
    );
  });
  // Zoho sometimes omits all line identifiers in the list payload. The backend
  // preserves line order when building products, so use that stable relationship.
  return matched ?? (index != null ? products[index] : undefined);
}

function tomorrowPht() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `PHP ${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
    : "-";
}
function status(value: unknown) {
  return typeof value === "string" && value ? value.replaceAll("_", " ") : "-";
}
function normalizedStatus(value: unknown) {
  return status(value).toLowerCase();
}
function lockMessage(error: unknown) {
  return String(error) === "lock_credential_lacks_scope"
    ? "Lock permission missing in Zoho, contact admin"
    : String(error || "Zoho could not lock this sales order.");
}
function dateLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function address(value: any) {
  return formatAddress(value) || "-";
}

export function AssignmentEmailPreviewModal({
  preview,
  onClose,
  onSent,
}: {
  preview: {
    salesOrderIds: string[];
    vehicleId: string;
    driverIds: number[];
    subject: string;
    htmlBody: string;
    manualVehicle?: inventoryApi.ManualVehicleInput;
  };
  onClose: () => void;
  onSent: () => void;
}) {
  const [htmlBody, setHtmlBody] = useState(preview.htmlBody);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    setSending(true);
    setError("");
    try {
      const result = await inventoryApi.sendAssignmentEmail(
        preview.salesOrderIds,
        preview.vehicleId,
        preview.driverIds,
        { htmlBody, subject: preview.subject, manualVehicle: preview.manualVehicle },
      );
      if (!result.success)
        throw new Error(
          result.error || "The assignment email could not be sent.",
        );
      setSent(true);
      onSent();
    } catch (e: any) {
      setError(e?.message || "The assignment email could not be sent.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onClick={onClose}
    >
      <section
        className="w-full max-w-3xl border bg-[#fafaf8] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="micro text-[#77787b]">
              Driver assignment email preview
            </div>
            <h2 className="mt-1 text-2xl font-bold">{preview.subject}</h2>
          </div>
          <button onClick={onClose} aria-label="Close preview">
            <X size={19} />
          </button>
        </div>
        <div
          className="mt-5 max-h-[55vh] overflow-y-auto border border-[#d8d7d2] bg-white p-4"
          contentEditable={!sent}
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: htmlBody }}
          onInput={(event) => setHtmlBody(event.currentTarget.innerHTML)}
        />
        <div className="mt-4 flex items-center justify-between">
          {error ? (
            <span className="text-sm text-[#c4291f]">{error}</span>
          ) : (
            <span className="text-xs text-[#77787b]">
              You can edit this email before sending.
            </span>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="border px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              onClick={send}
              disabled={sending || sent}
              className="button-black inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              {sending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : sent ? (
                <CheckCircle2 size={15} />
              ) : (
                <Send size={15} />
              )}{" "}
              {sent ? "Sent" : sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
function city(value: any) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.city ?? "-";
}
function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full ${active ? "bg-[#3b82f6]" : "border border-[#b8b8b5] bg-white"}`}
      title={active ? "Complete" : "Not complete"}
      aria-label={active ? "Complete" : "Not complete"}
    />
  );
}
function fulfillment(order: inventoryApi.SalesOrderSummary) {
  const raw = (order as any).raw_json ?? {};
  const items = Array.isArray(raw.line_items) ? raw.line_items : [];
  const invoices = Array.isArray(raw.invoices) ? raw.invoices : [];
  const packages = Array.isArray(raw.packages) ? raw.packages : [];
  const text = (...values: any[]) =>
    values
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map((value) => String(value).toLowerCase())
      .join(" ");
  const invoiceStatus = text(
    (order as any).invoice_status,
    raw.invoice_status,
    raw.invoiced_status,
  );
  const paymentStatus = text(
    (order as any).payment_status,
    raw.payment_status,
    raw.paid_status,
  );
  const shipmentStatus = text(
    (order as any).shipment_status,
    raw.shipment_status,
    raw.order_status,
  );
  const complete = (item: any, key: string) =>
    Number.isFinite(Number(item?.[key])) &&
    Number(item[key]) >= Number(item?.quantity ?? 0) &&
    Number(item?.quantity ?? 0) > 0;
  const invoiced =
    items.some(
      (item: any) =>
        item?.is_invoiced === true || complete(item, "quantity_invoiced"),
    ) ||
    invoices.some(
      (invoice: any) =>
        !["draft", "void", "cancelled", "canceled"].includes(
          String(invoice?.status ?? "").toLowerCase(),
        ),
    );
  const payment =
    /paid|payment received|fully paid/.test(paymentStatus) ||
    invoices.some(
      (invoice: any) =>
        Number.isFinite(Number(invoice?.balance)) &&
        Number(invoice.balance) <= 0,
    );
  const packed =
    items.some((item: any) => complete(item, "quantity_packed")) ||
    packages.some((pkg: any) =>
      /packed|fulfilled|shipped|delivered/.test(
        String(pkg?.status ?? pkg?.detailed_status ?? "").toLowerCase(),
      ),
    );
  const shipped =
    items.some((item: any) => complete(item, "quantity_shipped")) ||
    packages.some((pkg: any) =>
      /shipped|fulfilled|delivered/.test(
        String(pkg?.status ?? pkg?.detailed_status ?? "").toLowerCase(),
      ),
    );
  return {
    invoiced: invoiced || /invoiced|billed/.test(invoiceStatus),
    payment,
    packed: packed || /packed|shipped|delivered/.test(shipmentStatus),
    shipped: shipped || /shipped|delivered/.test(shipmentStatus),
  };
}
type FlatRow = {
  order: inventoryApi.SalesOrderSummary;
  item: any;
  lineIndex: number;
  address: string;
  city: string;
};

function SendToEmailModal({
  context,
  onClose,
}: {
  context: inventoryApi.EmailFilterContext;
  onClose: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Sales Orders");
  const [htmlBody, setHtmlBody] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let active = true;
    inventoryApi
      .createSalesOrderEmailDraft(context)
      .then((draft) => {
        if (!active) return;
        setSubject(draft.subject);
        setHtmlBody(draft.htmlBody);
      })
      .catch((reason: any) => {
        if (active)
          setError(reason?.message || "Could not prepare the email draft.");
      })
      .finally(() => {
        if (active) setLoadingDraft(false);
      });
    return () => {
      active = false;
    };
  }, [context]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const send = async () => {
    if (!to.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      setError("Enter a valid recipient email address.");
      return;
    }
    if (!subject.trim() || !htmlBody.trim()) {
      setError("Subject and email body are required.");
      return;
    }
    setError("");
    setSending(true);
    try {
      await inventoryApi.sendSalesOrderEmail({
        ...context,
        to: to.trim(),
        subject: subject.trim(),
        htmlBody,
      });
      setSent(true);
      window.setTimeout(onClose, 1200);
    } catch (reason: any) {
      setError(reason?.message || "The email could not be sent.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-email-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border border-[#e4e3df] bg-[#fafaf8] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#0b0b0b] bg-[#0b0b0b] px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a1a1a1]">
              Load Planning
            </div>
            <h2
              id="send-email-title"
              className="mt-1 text-2xl font-bold text-white"
            >
              Send sales orders by email
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close email dialog"
            className="p-1 text-white hover:text-[#d9d9d9]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-4 px-6 py-5">
          <label className="grid gap-1 text-sm font-semibold text-[#0b0b0b]">
            Recipient email
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              type="email"
              placeholder="recipient@company.com"
              className="border border-[#d8d7d2] px-3 py-2.5 font-normal outline-none focus:border-[#0b0b0b]"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[#0b0b0b]">
            Subject
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="border border-[#d8d7d2] px-3 py-2.5 font-normal outline-none focus:border-[#0b0b0b]"
            />
          </label>
          <div className="grid gap-1 text-sm font-semibold text-[#1B2419]">
            <span>Email body</span>
            {loadingDraft ? (
              <div className="min-h-52 animate-pulse border border-[#d8d7d2] bg-[#f2f2ef] p-4 text-sm font-normal text-[#1e7b44]">
                Writing a polished email draft...
              </div>
            ) : (
              <div
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: htmlBody }}
                onInput={(event) => setHtmlBody(event.currentTarget.innerHTML)}
                aria-label="Email body HTML"
                role="textbox"
                className="min-h-52 border border-[#d8d7d2] bg-white p-4 text-sm font-normal leading-6 outline-none focus:border-[#0b0b0b]"
              />
            )}
          </div>
          <div className="border border-[#e4e3df] bg-[#f2f2ef] px-4 py-3 text-sm text-[#0b0b0b]">
            <div className="font-semibold">Attachments</div>
            <div className="mt-1 text-[#1e7b44]">
              SalesOrders.pdf, SalesOrders.xlsx
            </div>
          </div>
          {error && (
            <div
              role="alert"
              className="border border-[#86000B]/30 bg-[#fff4f4] px-4 py-3 text-sm text-[#86000B]"
            >
              {error}
            </div>
          )}
          {sent && (
            <div className="border border-[#33673B]/30 bg-[#f1f8f2] px-4 py-3 text-sm text-[#33673B]">
              Email sent successfully.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="border border-[#d8d7d2] px-4 py-2 text-sm text-[#0b0b0b]"
            >
              Cancel
            </button>
            <button
              onClick={send}
              disabled={sending || loadingDraft || sent}
              className="inline-flex items-center gap-2 bg-[#0b0b0b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}{" "}
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LoadPlanningInventoryTab({
  assignmentScope,
}: {
  assignmentScope?: "assigned";
}) {
  const [, navigate] = useLocation();
  const [emailOpen, setEmailOpen] = useState(false);
  const initial = tomorrowPht();
  const [from, setFrom] = useState(initial);
  const [to, setTo] = useState(initial);
  const [query, setQuery] = useState("");
  const [selected, setSelected] =
    useState<inventoryApi.SalesOrderSummary | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [bulkAcknowledging, setBulkAcknowledging] = useState(false);
  const [orderStatus, setOrderStatus] = useState("All");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [ackErrors, setAckErrors] = useState<Record<string, string>>({});
  const [ackGuardVersion, setAckGuardVersion] = useState(0);
  // KPI / Spreadsheet view (Confirmed SO only). Pure local state: it is not part of any query
  // key, so switching views never refetches.
  const [viewMode, setViewModeState] = useState<ViewMode>(() => readViewMode());
  const [cardPage, setCardPage] = useState(1);
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    writeViewMode(mode);
  };
  const cardsView = Boolean(assignmentScope) && viewMode === "kpi";
  const client = useQueryClient();
  const apiOrderStatus =
    !assignmentScope && orderStatus === "All"
      ? "All except acknowledged"
      : orderStatus;
  const columnWidths = [
    44,
    120,
    140,
    220,
    180,
    130,
    100,
    85,
    75,
    110,
    130,
    300,
    220,
    150,
    150,
    120,
    130,
    90,
    120,
    ...(assignmentScope ? [180, 220, 80] : []),
  ];
  const orders = useQuery({
    queryKey: [INVENTORY_LIST_KEY, assignmentScope ?? "inventory", from, to, page, apiOrderStatus, query, selectedBranches.join(",")],
    queryFn: () =>
      inventoryApi.listSalesOrders(
        from,
        to,
        page,
        apiOrderStatus,
        query,
        assignmentScope,
        [],
        { branches: selectedBranches },
      ),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    // Mets/Glacier stock and item weights fill in on the backend after the list returns;
    // poll lightly until they're all in.
    refetchInterval: (query) => (query.state.data?.stock_pending ? 4000 : false),
  });
  const branchOptions = useBranchOptions(orders.data?.branches);
  const guardedAcknowledged = useMemo(() => sessionAcknowledgedIds(), [orders.data, ackGuardVersion]);
  const rows = useMemo<FlatRow[]>(
    () =>
      (orders.data?.items ?? [])
        .filter((order) => assignmentScope || !guardedAcknowledged.has(String(order.id)))
        .filter(
          (order) =>
            (orderStatus === "All" &&
              (assignmentScope ||
                normalizedStatus(order.order_status) !== "acknowledged")) ||
            // The backend already applies Zoho's Acknowledged custom-view
            // filter and returns only matching rows. Do not re-filter those
            // rows using raw_json: Zoho list payloads often omit the
            // cs_acknowl sub-status even though the custom view matched it.
            orderStatus === "Acknowledged" ||
            normalizedStatus(order.order_status) === orderStatus.toLowerCase(),
        )
        .filter((order) =>
          [
            order.salesorder_number,
            order.customer_name,
            order.reference_number,
          ].some((value) =>
            (value ?? "").toLowerCase().includes(query.toLowerCase()),
          ),
        )
        .flatMap((order) => {
          const raw = (order as any).raw_json ?? {};
          const items =
            Array.isArray(raw.line_items) && raw.line_items.length
              ? raw.line_items
              : [{}];
          return items.map((item: any, index: number) => {
            const product = lineProduct(order, item, index);
            return {
              order,
              item: Object.keys(item ?? {}).length
                ? item
                : {
                    line_item_id: product?.line_item_id,
                    item_id: product?.item_id,
                    sku: product?.sku,
                    quantity: product?.quantity,
                    unit: product?.unit,
                  },
              lineIndex: index,
              address: address(
                raw.shipping_address ?? (order as any).shipping_address,
              ),
              // The backend also infers the city from the street text when Zoho's city field is blank.
              city: (order as any).shipping_city || city(raw.shipping_address ?? (order as any).shipping_address),
            };
          });
        }),
    [orders.data, orderStatus, query, assignmentScope, guardedAcknowledged],
  );
  const guardedInventoryCount = !assignmentScope
    ? (orders.data?.items ?? []).filter((order) => guardedAcknowledged.has(String(order.id))).length
    : 0;
  const orderCount = Math.max(0, (orders.data?.total ?? 0) - guardedInventoryCount);
  const watchRefresh = async () => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      try {
        const result = await inventoryApi.getRefreshStatus();
        if (!result.running) {
          if (result.error) {
            setSyncMessage(result.error);
          } else {
            await client.refetchQueries({
              queryKey: [
                INVENTORY_LIST_KEY,
                assignmentScope ?? "inventory",
                from,
                to,
                page,
                apiOrderStatus,
                query,
                selectedBranches.join(","),
              ],
            });
            setSyncMessage(`Synced ${result.synced_count} orders - just now`);
          }
          return;
        }
      } catch {
        return;
      }
    }
  };
  const refresh = async () => {
    setSyncMessage("");
    setSyncing(true);
    try {
      const result = await inventoryApi.refreshSalesOrders(from, to);
      setSyncMessage(
        result.sync_started
          ? "Zoho sync started - updating this view when complete."
          : "A Zoho sync is already running.",
      );
      await watchRefresh();
    } catch (error: any) {
      setSyncMessage(
        error?.message || "Zoho Inventory could not be refreshed.",
      );
    } finally {
      setSyncing(false);
    }
  };
  useEffect(() => {
    if (!assignmentScope) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [assignmentScope, from, to]);
  const toggleOrder = (id: string) => setSelectedOrderIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const visibleOrderIds = Array.from(new Set(rows.map(({ order }) => String(order.id))));
  const allVisibleSelected = visibleOrderIds.length > 0 && visibleOrderIds.every((id) => selectedOrderIds.includes(id));
  const toggleAllVisible = () => setSelectedOrderIds((current) => allVisibleSelected ? current.filter((id) => !visibleOrderIds.includes(id)) : Array.from(new Set([...current, ...visibleOrderIds])));
  const orderLabel = (id: string) => {
    const match = (orders.data?.items ?? []).find((order) => String(order.id) === id);
    return match?.salesorder_number ?? id;
  };
  const acknowledgeFiltered = async () => {
    if (!selectedOrderIds.length || !window.confirm(`Acknowledge ${selectedOrderIds.length} selected sales order${selectedOrderIds.length === 1 ? "" : "s"}? This will update Zoho Inventory.`))
      return;
    setBulkAcknowledging(true);
    setSyncMessage("");
    setAckErrors({});
    try {
      // Every order is attempted and reported on its own: only the ones Zoho accepted move.
      const outcomes = await settleAcknowledgements(selectedOrderIds, (id) => inventoryApi.acknowledgeSalesOrder(id));
      const summary = summarizeAcknowledgements(outcomes, orderLabel);
      const unlocked = outcomes.filter((outcome) => outcome.ok && outcome.result?.locked === false);
      dropFromInventory(client, summary.acknowledgedIds);
      rememberSessionAcknowledged(summary.acknowledgedIds, orders.data?.items ?? []);
      setAckGuardVersion((value) => value + 1);
      setAckErrors(summary.errors);
      // Succeeded ones are deselected; failed ones stay selected (with their error) so they can be retried.
      setSelectedOrderIds(summary.failedIds);
      await refetchOrderLists(client, summary.acknowledgedIds);
      const lockNote = unlocked.length ? ` NOT locked ${unlocked.length}: ${lockMessage(unlocked[0]?.result?.lock_error)}. Open each order to retry the lock.` : summary.acknowledgedIds.length ? " Locked." : "";
      setSyncMessage(`${summary.message}${lockNote}`);
    } catch (error: any) {
      setSyncMessage(
        error?.message || "Zoho could not acknowledge the filtered orders.",
      );
    } finally {
      setBulkAcknowledging(false);
    }
  };
  const unassign = async (order: inventoryApi.SalesOrderSummary) => {
    if (!window.confirm(`Unassign ${order.salesorder_number ?? order.id}?`)) return;
    try {
      await inventoryApi.unassignSalesOrder(order.id);
      setSyncMessage(`Unassigned ${order.salesorder_number ?? order.id}.`);
      await client.invalidateQueries({ queryKey: [INVENTORY_LIST_KEY] });
    } catch (error: any) {
      setSyncMessage(error?.message || "The sales order could not be unassigned.");
    }
  };
  useEffect(() => {
    setPage(1);
    setCardPage(1);
  }, [from, to, orderStatus, query, selectedBranches]);
  const download = async (format: "pdf" | "excel") => {
    setExportOpen(false);
    const result = await inventoryApi.downloadSalesOrders(
      format,
      from,
      to,
      apiOrderStatus,
      query,
      assignmentScope,
      selectedBranches,
    );
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="load-planning-panel min-w-0 border border-[#e4e3df] bg-white">
      <Toolbar
        count={orderCount}
        toggle={assignmentScope ? <ViewModeToggle mode={viewMode} onChange={setViewMode} /> : undefined}
        filters={
          <>
            <div className="relative min-w-0 sm:min-w-[220px] sm:flex-1 sm:basis-[220px]">
              <Search size={15} className="pointer-events-none absolute left-3 top-[10px] text-[#77787b]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sales orders"
                aria-label="Search sales orders"
                className={`${inputClass} w-full pl-9 pr-3`}
              />
            </div>
            <FilterField label="From">
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} w-full sm:w-[150px]`} />
            </FilterField>
            <FilterField label="To">
              <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className={`${inputClass} w-full sm:w-[150px]`} />
            </FilterField>
            <FilterField label="Order status">
              <select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)} className={`${inputClass} w-full sm:w-[150px]`}>
                <option>All</option>
                <option>Draft</option>
                <option>Confirmed</option>
                <option>Acknowledged</option>
                <option>Void</option>
              </select>
            </FilterField>
            <BranchFilter options={branchOptions} selected={selectedBranches} counts={orders.data?.branch_counts} onChange={setSelectedBranches} />
          </>
        }
        actions={
          <>
            <div className="relative">
              <button onClick={() => setExportOpen(!exportOpen)} className={`${buttonClass} w-full`}>
                <Download size={14} /> Export
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 grid w-40 border border-[#d8d7d2] bg-white p-1 shadow-lg">
                  <button onClick={() => download("pdf")} className="px-3 py-2 text-left text-sm hover:bg-[#f2f2ef]">
                    Export as PDF
                  </button>
                  <button onClick={() => download("excel")} className="px-3 py-2 text-left text-sm hover:bg-[#f2f2ef]">
                    Export as Excel
                  </button>
                  <button
                    onClick={() => {
                      setExportOpen(false);
                      setEmailOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#f2f2ef]"
                  >
                    <Mail size={14} /> Send to Email
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setEmailOpen(true)} className={dangerButtonClass}>
              <Mail size={14} /> Send to Email
            </button>
            <button onClick={acknowledgeFiltered} disabled={bulkAcknowledging || !selectedOrderIds.length} className={primaryButtonClass}>
              {bulkAcknowledging ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}{" "}
              {bulkAcknowledging ? "Acknowledging..." : `Acknowledge selected (${selectedOrderIds.length})`}
            </button>
            <button onClick={refresh} disabled={syncing} className={primaryButtonClass}>
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {syncing ? "Refreshing..." : "Refresh"}
            </button>
          </>
        }
      />
      {syncMessage && (
        <div className="flex items-center gap-2 border-b border-[#cddfd2] bg-[#edf6f0] px-4 py-2 text-xs text-[#1e7b44]">
          <CheckCircle2 size={14} />
          {syncMessage}
        </div>
      )}
      {orders.isError ? (
        <div className="p-10 text-center text-sm text-[#a32720]">
          {(orders.error as Error).message}
        </div>
      ) : orders.isLoading || syncing ? (
        <div
          className="overflow-hidden p-4"
          aria-label="Loading inventory orders"
        >
              <div className="grid min-w-[1800px] gap-2">
                {[1, 2, 3, 4, 5, 6].map((row) => (
              <div key={row} className="grid grid-cols-15 gap-3">
                {Array.from({ length: 15 }).map((_, cell) => (
                  <div key={cell} className="h-12 animate-pulse bg-[#f2f2ef]" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-12 text-center text-sm text-[#77787b]">
          No orders for this filter. Click Refresh to sync Zoho.
        </div>
      ) : cardsView ? (
        <>
          <SalesOrderCardGrid
            orders={uniqueOrders(rows)}
            page={cardPage}
            onPageChange={setCardPage}
            selectedIds={selectedOrderIds}
            errors={ackErrors}
            showAssignment
            onToggle={toggleOrder}
            onOpen={setSelected}
            onEdit={(order) => navigate(`/app/routes?assign=${encodeURIComponent(order.id)}`)}
            onUnassign={(order) => void unassign(order)}
          />
          {(page > 1 || orders.data?.has_more) && (
            <div className="flex items-center justify-end gap-2 border-t border-[#e4e3df] px-4 py-3">
              <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || orders.isFetching} className="border border-[#d8d7d2] px-3 py-2 text-sm disabled:opacity-40">
                Previous data page
              </button>
              <span className="text-xs text-[#77787b]">Data page {page}</span>
              <button onClick={() => setPage((value) => value + 1)} disabled={!orders.data?.has_more || orders.isFetching} className="button-black px-3 py-2 text-sm disabled:opacity-40">
                Next data page
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-3 p-3 md:hidden">{rows.map(({ order, item, address: shipping, city: locationCity }, index) => { const flags = fulfillment(order); return <article key={`mobile-${order.id}-${item.line_item_id ?? index}`} className="min-w-0 w-full max-w-full overflow-hidden border border-[#e4e3df] bg-[#fafaf8] p-3 [overflow-wrap:anywhere] [word-break:break-word]"><div className="flex min-w-0 items-start gap-3"><input type="checkbox" aria-label={`Select ${order.salesorder_number ?? order.id}`} checked={selectedOrderIds.includes(String(order.id))} onChange={() => toggleOrder(String(order.id))} /><button className="min-w-0 max-w-full flex-1 text-left" onClick={() => setSelected(order)}><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0 max-w-full"><div className="mono break-all text-xs text-[#77787b]">{order.salesorder_number ?? order.id}<BranchBadge code={order.branch_code} name={order.branch_name} /></div><div className="mt-1 break-words font-semibold">{order.customer_name ?? "-"}</div></div><span className="max-w-[45%] shrink-0 break-words rounded-full bg-[#fff1d6] px-2 py-1 text-center text-[10px] font-semibold uppercase">{status(order.order_status)}</span></div></button></div><div className="mt-3 grid min-w-0 max-w-full grid-cols-2 gap-x-4 gap-y-2 overflow-hidden border-t border-[#e4e3df] pt-3 text-xs"><div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Expected shipment</div><div className="break-words font-semibold">{dateLabel(order.expected_shipment_date)}</div></div><div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">City</div><div className="break-words">{locationCity}</div></div><div className="col-span-2 min-w-0"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Product</div><div className="break-words font-semibold">{(order.products ?? []).map((product) => product.name).filter(Boolean).join(", ") || "Details unavailable"}</div></div><div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Quantity</div><div className="break-words">{item.quantity ?? "-"} {item.unit || "units"}</div></div><div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Total weight</div><div className="break-words">{(() => { const product = (order.products ?? []).find((entry) => (entry.line_item_id && entry.line_item_id === item.line_item_id) || (entry.item_id && entry.item_id === item.item_id) || entry.sku === item.sku); return product?.total_weight_kg == null ? "—" : `${Number(product.total_weight_kg).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`; })()}</div></div><div className="col-span-2 min-w-0"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Shipping address</div><div className="whitespace-pre-line break-words">{shipping}</div></div><div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Shipped</div><div>{flags.shipped ? "Yes" : "No"}</div></div><div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Amount</div><div className="break-words">{money(item.item_total ?? order.total)}</div></div></div></article>; })}</div><HorizontalScrollTable contentWidth="2200px">
            <table className="w-full min-w-[2200px] table-fixed text-left text-xs">
              <colgroup>
                {columnWidths.map((width, index) => (
                  <col
                    key={`${width}-${index}`}
                    style={{ width: `${width}px` }}
                  />
                ))}
              </colgroup>
              <thead className="border-b border-[#e4e3df] bg-[#f7f7f4] text-[10px] uppercase tracking-widest text-[#77787b]">
                <tr>
                  {[
                    "Select",
                    "Expected Shipment Date",
                    "Sales Order#",
                    "Customer Name",
                    "Products",
                    "Packs / Cases",
                    "SKU",
                    "Quantity",
                    "Unit",
                    "Total Weight",
                    "City",
                    "Shipping Address",
                    "Notes",
                    "Mets Avail.",
                    "Glacier Avail.",
                    "Order Status",
                    "Warehouse",
                    "Shipped",
                    "Amount",
                    ...(assignmentScope
                      ? ["Assigned Truck", "Assigned Driver", "Edit"]
                      : []),
                  ].map((heading, index) => (
                    <th
                      key={heading}
                      className={`px-3 py-3 font-semibold leading-tight ${index < 4 ? "sticky z-[1] whitespace-nowrap bg-[#f7f7f4]" : "whitespace-normal"} ${index === 0 ? "left-0" : index === 1 ? "left-[44px]" : index === 2 ? "left-[164px]" : index === 3 ? "left-[304px]" : ""}`}
                    >
                      {index === 0 ? <input type="checkbox" aria-label="Select all visible sales orders" checked={allVisibleSelected} onChange={toggleAllVisible} /> : heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(
                  (
                    { order, item, lineIndex, address: shipping, city: locationCity },
                    index,
                  ) => {
                    const flags = fulfillment(order);
                    return (
                      <tr
                        key={`${order.id}-${item.line_item_id ?? index}`}
                        onClick={() => setSelected(order)}
                        className="cursor-pointer border-b border-[#efeeeb] hover:bg-[#fafaf8]"
                      >
                        <td className="sticky left-0 z-[2] bg-white px-3 py-4 align-top"><input type="checkbox" aria-label={`Select ${order.salesorder_number ?? order.id}`} checked={selectedOrderIds.includes(String(order.id))} onChange={(event) => { event.stopPropagation(); toggleOrder(String(order.id)); }} onClick={(event) => event.stopPropagation()} /></td>
                        <td className="sticky left-[44px] z-[1] bg-white px-3 py-4 align-top">
                          {dateLabel(order.expected_shipment_date)}
                        </td>
                        <td className="sticky left-[120px] z-[1] bg-white px-3 py-4 align-top font-semibold">
                          <div>{order.salesorder_number ?? order.id}<BranchBadge code={order.branch_code} name={order.branch_name} /></div>
                          {ackErrors[String(order.id)] && <div className="mt-1 text-[10px] font-normal text-[#a32720]">{ackErrors[String(order.id)]}</div>}
                          {order.zoho_lock?.is_locked && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-normal text-[#1e7b44]" title={[order.zoho_lock.config_name, order.zoho_lock.locked_by, order.zoho_lock.lock_time].filter(Boolean).join(" - ")}>
                              <Lock size={11} /> {order.zoho_lock.config_name || "Locked"}
                            </div>
                          )}
                        </td>
                        <td className="sticky left-[260px] z-[1] bg-white px-3 py-4 align-top">
                          {order.customer_name ?? "-"}
                        </td>
                        <td className="px-3 py-4 align-top">
                          <div className="font-semibold">{order.product_count ?? 0} product{(order.product_count ?? 0) === 1 ? "" : "s"}</div>
                          <div className="mt-1 text-[10px] text-[#77787b]">{(order.products ?? []).map((product) => product.name).filter(Boolean).join(", ") || "Details unavailable"}</div>
                        </td>
                        <td className="px-3 py-4 align-top whitespace-nowrap">
                          {item.quantity != null ? `${item.quantity} ${item.unit || "units"}` : "—"}
                        </td>
                        <td className="px-3 py-4 align-top">
                          {item.sku ?? "-"}
                        </td>
                        <td className="px-3 py-4 align-top">
                          {item.quantity ?? "-"}
                        </td>
                        <td className="px-3 py-4 align-top">
                          {item.unit ?? "-"}
                        </td>
                        <td className="px-3 py-4 align-top whitespace-nowrap font-semibold">
                          {lineWeightLabel(lineProduct(order, item, lineIndex), orders.data?.stock_pending)}
                        </td>
                        <td className="px-3 py-4 align-top">{locationCity}</td>
                        <td
                          className="whitespace-pre-line break-words px-3 py-4 align-top leading-5"
                          title={shipping}
                        >
                          {shipping}
                        </td>
                        <td
                          className="whitespace-normal break-words px-3 py-4 align-top leading-5"
                          title={order.notes || ""}
                        >
                          {order.notes?.trim() || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right align-top">
                          <StockQty value={lineStock(order, lineProduct(order, item, lineIndex), "mets")} pending={orders.data?.stock_pending} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right align-top">
                          <StockQty value={lineStock(order, lineProduct(order, item, lineIndex), "glacier")} pending={orders.data?.stock_pending} />
                        </td>
                        <td className="px-3 py-4 align-top capitalize">
                          {status(order.order_status)}
                        </td>
                        <td className="px-3 py-4 align-top whitespace-normal">
                          {Array.from(
                            new Set(
                              ((order as any).raw_json?.line_items ?? [])
                                .map(
                                  (line: any) =>
                                    line.location_name ?? line.warehouse_name,
                                )
                                .filter(Boolean),
                            ),
                          ).join(", ") || "-"}
                        </td>
                        <td className="px-3 py-4 align-top text-center">
                          <StatusDot active={flags.shipped} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right align-top font-semibold">
                          {money(item.item_total ?? order.total)}
                        </td>
                        {assignmentScope && (
                          <>
                            <td className="w-[180px] whitespace-nowrap px-3 py-4 align-top font-semibold">
                              {order.vehicle_id ?? "-"}
                            </td>
                            <td className="w-[220px] whitespace-nowrap px-3 py-4 align-top">
                              {order.driver_name ??
                                (order.driver_id
                                  ? `Driver #${order.driver_id}`
                                  : "-")}
                            </td>
                            <td className="w-[80px] whitespace-nowrap px-3 py-4 align-top">
                              <div className="flex flex-col items-start gap-1">
                                <button
                                  className="text-xs font-semibold underline"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/app/routes?assign=${encodeURIComponent(order.id)}`);
                                  }}
                                >
                                  Edit
                                </button>
                                {order.assignment_status === "assigned" && (
                                  <button
                                    className="text-xs font-semibold text-[#86000B] underline"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void unassign(order);
                                    }}
                                  >
                                    Unassign
                                  </button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </HorizontalScrollTable>
          <div className="flex items-center justify-end gap-2 border-t border-[#e4e3df] px-4 py-3">
            <button
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page === 1 || orders.isFetching}
              className="border border-[#d8d7d2] px-3 py-2 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-[#77787b]">
              Page {page} of{" "}
              {Math.max(1, Math.ceil((orders.data?.total ?? 0) / 100))}
            </span>
            <button
              onClick={() => setPage((value) => value + 1)}
              disabled={!orders.data?.has_more || orders.isFetching}
              className="button-black px-3 py-2 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
      {selected && (
        <SalesOrderDetailDrawer
          order={selected}
          onAcknowledgeError={(id, message) => setAckErrors((errors) => ({ ...errors, [id]: message }))}
          onClose={() => setSelected(null)}
        />
      )}
      {emailOpen && (
        <SendToEmailModal
          context={{
            date_from: from,
            date_to: to,
            status: apiOrderStatus,
            search: query,
            assignment: assignmentScope,
            branches: selectedBranches.join(",") || undefined,
          }}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </div>
  );
}

function SalesOrderDetailDrawer({
  order,
  onAcknowledgeError,
  onClose,
}: {
  order: inventoryApi.SalesOrderSummary;
  onAcknowledgeError?: (id: string, message: string) => void;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["inventory-sales-order", order.id],
    queryFn: () => inventoryApi.getSalesOrder(order.id),
    retry: false,
  });
  const client = useQueryClient();
  const [acknowledging, setAcknowledging] = useState(false);
  const [retryingLock, setRetryingLock] = useState(false);
  const [removingAcknowledgement, setRemovingAcknowledgement] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [lockRetryVisible, setLockRetryVisible] = useState(false);
  const raw = (detail.data?.salesorder ?? detail.data ?? {}) as Record<
    string,
    any
  >;
  const items = Array.isArray(raw.line_items) ? raw.line_items : [];
  const rawStatus = String(
    raw.status ?? raw.order_status ?? order.order_status ?? "",
  )
    .toLowerCase()
    .replaceAll("_", " ");
  const canAcknowledge =
    !detail.isLoading &&
    !detail.isError &&
    !["acknowledged", "void", "cancelled", "canceled"].includes(rawStatus);
  const acknowledge = async () => {
    setActionMessage("");
    setAcknowledging(true);
    try {
      const result = await inventoryApi.acknowledgeSalesOrder(order.id);
      dropFromInventory(client, [order.id]);
      rememberSessionAcknowledged([order.id], [order]);
      await refetchOrderLists(client, [order.id]);
      if (result.locked === false) {
        setLockRetryVisible(true);
        setActionMessage(`Acknowledged, NOT locked: ${lockMessage(result.lock_error)}`);
      } else {
        setLockRetryVisible(false);
        setActionMessage("Acknowledged & locked.");
      }
    } catch (error: any) {
      const message = error?.message || "Zoho could not acknowledge this sales order.";
      setActionMessage(message);
      onAcknowledgeError?.(String(order.id), message);
    } finally {
      setAcknowledging(false);
    }
  };
  const retryLock = async () => {
    setRetryingLock(true);
    setActionMessage("");
    try {
      const result = await inventoryApi.retrySalesOrderLock(order.id);
      await refetchOrderLists(client, [order.id]);
      if (result.locked === false) {
        setLockRetryVisible(true);
        setActionMessage(`Acknowledged, NOT locked: ${lockMessage(result.lock_error)}`);
      } else {
        setLockRetryVisible(false);
        setActionMessage("Acknowledged & locked.");
      }
    } catch (error: any) {
      setLockRetryVisible(true);
      setActionMessage(error?.message || "Zoho could not lock this sales order.");
    } finally {
      setRetryingLock(false);
    }
  };
  const removeAcknowledge = async () => {
    if (
      !window.confirm(
        "Remove the acknowledgement from this sales order? Zoho will return it to Confirmed and IntelliFleet will update its local cache.",
      )
    )
      return;
    setActionMessage("");
    setRemovingAcknowledgement(true);
    try {
      await inventoryApi.removeAcknowledgeSalesOrder(order.id);
      forgetSessionAcknowledged([order.id]);
      dropFromLoadPlanning(client, [order.id]);
      await refetchOrderLists(client, [order.id]);
      setActionMessage("Acknowledgement removed in Zoho and IntelliFleet.");
    } catch (error: any) {
      setActionMessage(
        error?.message || "Zoho and IntelliFleet could not be synchronized.",
      );
    } finally {
      setRemovingAcknowledgement(false);
    }
  };
  const canRemoveAcknowledge =
    !detail.isLoading && !detail.isError && rawStatus === "acknowledged";
  const lockStatus = (detail.data?.zoho_lock ?? raw.zoho_lock ?? order.zoho_lock) as inventoryApi.ZohoLockStatus | undefined;
  const fields = [
    ["Reference #", raw.reference_number],
    ["Order date", raw.date],
    ["Expected shipment", raw.shipment_date],
    ["Payment terms", raw.payment_terms_label ?? raw.payment_terms],
    ["Delivery method", raw.delivery_method],
    ["Salesperson", raw.salesperson_name ?? order.salesperson_name],
    ["Customer PO number", raw.customer_po_number],
    ["Mode of transportation", raw.mode_of_transport],
    ["Fulfillment type", raw.fulfillment_type ?? raw.cf_fulfillment_type],
    [
      "Payment requirement",
      raw.payment_requirement ?? raw.payment_requirements,
    ],
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/25" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-[#e4e3df] bg-[#fafaf8] p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#e4e3df] pb-5">
          <div>
            <div className="micro text-[#77787b]">Sales order</div>
            <h2 className="display-face mt-2 text-3xl font-bold">
              {raw.salesorder_number ?? order.salesorder_number ?? order.id}
            </h2>
            <div className="mt-2 capitalize text-xs">
              {status(raw.status ?? order.order_status)}
            </div>
            {lockStatus?.is_locked && (
              <div className="mt-3 inline-flex items-center gap-2 border border-[#b7d7bd] bg-[#f1f8f2] px-2 py-1 text-xs text-[#1e7b44]">
                <Lock size={13} /> {lockStatus.config_name || "Locked"}
                {lockStatus.locked_by ? ` by ${lockStatus.locked_by}` : ""}
                {lockStatus.lock_time ? ` at ${lockStatus.lock_time}` : ""}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {canAcknowledge && (
                <button
                  onClick={acknowledge}
                  disabled={acknowledging}
                  className="button-black inline-flex items-center gap-2 rounded-[4px] px-3 py-2 text-sm"
                >
                  {acknowledging && (
                    <Loader2 size={14} className="animate-spin" />
                  )}{" "}
                  {acknowledging ? "Acknowledging..." : "Acknowledge Order"}
                </button>
              )}
              {canRemoveAcknowledge && (
                <button
                  onClick={removeAcknowledge}
                  disabled={removingAcknowledgement}
                  className="inline-flex items-center gap-2 rounded-[4px] border border-[#0b0b0b] px-3 py-2 text-sm"
                >
                  {removingAcknowledgement && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {removingAcknowledgement
                    ? "Removing..."
                    : "Remove Acknowledge"}
                </button>
              )}
              {actionMessage && (
                <span
                  className={`max-w-[220px] text-xs ${actionMessage === "Acknowledged & locked." || actionMessage.includes("Zoho and IntelliFleet") ? "text-[#1e7b44]" : "text-[#a32720]"}`}
                >
                  {actionMessage}
                </span>
              )}
              {(lockRetryVisible || (rawStatus === "acknowledged" && lockStatus?.is_locked === false && !lockStatus?.lock_error)) && (
                <button
                  onClick={retryLock}
                  disabled={retryingLock}
                  className="inline-flex items-center gap-2 rounded-[4px] border border-[#a32720] px-3 py-2 text-sm text-[#a32720]"
                >
                  {retryingLock ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  {retryingLock ? "Retrying..." : "Retry Lock"}
                </button>
              )}
            </div>
            <button onClick={onClose} aria-label="Close sales order">
              <X size={19} />
            </button>
          </div>
        </div>
        {detail.isLoading ? (
          <div className="py-10 text-sm">Loading full Zoho sales order...</div>
        ) : detail.isError ? (
          <div className="py-10 text-sm text-[#a32720]">
            {(detail.error as Error).message}
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-5 border-b border-[#e4e3df] pb-5 text-sm md:grid-cols-2">
              <div className="grid gap-3">
                {fields.map(([label, value]) => (
                  <div key={label}>
                    <span className="block text-xs text-[#77787b]">
                      {label}
                    </span>
                    {value ?? "-"}
                  </div>
                ))}
              </div>
              <div className="grid content-start gap-4">
                <div>
                  <span className="block text-xs text-[#77787b]">
                    Billing address
                  </span>
                  <span className="whitespace-pre-line">
                    {address(raw.billing_address)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-[#77787b]">
                    Shipping address
                  </span>
                  <span className="whitespace-pre-line">
                    {address(raw.shipping_address)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <div className="micro text-[#77787b]">Items & description</div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead className="border-b border-[#e4e3df] text-[#77787b]">
                    <tr>
                      <th className="py-2">Item</th>
                      <th>SKU</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Warehouse</th>
                      <th>Status</th>
                      <th>Rate</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any, index: number) => (
                      <tr
                        key={item.line_item_id ?? index}
                        className="border-b border-[#efeeeb]"
                      >
                        <td className="py-3 font-semibold">
                          {item.name ?? "-"}
                          <div className="font-normal text-[#77787b]">
                            {item.description ?? ""}
                          </div>
                        </td>
                        <td>{item.sku ?? "-"}</td>
                        <td>{item.quantity ?? "-"}</td>
                        <td>{item.unit ?? "-"}</td>
                        <td>
                          {item.location_name ?? item.warehouse_name ?? "-"}
                        </td>
                        <td>
                          {item.status ??
                            (item.quantity_shipped
                              ? "Shipped"
                              : item.quantity_packed
                                ? "Packed"
                                : "-")}
                        </td>
                        <td>{money(item.rate)}</td>
                        <td className="text-right">
                          {money(item.item_total ?? item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-6 grid gap-2 border-t border-black pt-4 text-sm md:ml-auto md:max-w-xs">
              <div className="flex justify-between">
                <span>Sub total</span>
                <span>{money(raw.sub_total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>{money(raw.discount_amount ?? raw.discount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{money(raw.tax_total)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-black pt-3 text-lg font-bold">
                <span>Total</span>
                <span>{money(raw.total ?? order.total)}</span>
              </div>
            </div>
            <div className="mt-7 grid gap-5 border-t border-[#e4e3df] pt-5 md:grid-cols-2">
              <div>
                <div className="micro text-[#77787b]">Terms & conditions</div>
                <p className="mt-2 whitespace-pre-line text-sm">
                  {raw.terms ?? raw.terms_and_conditions ?? "-"}
                </p>
              </div>
              <div>
                <div className="micro text-[#77787b]">More information</div>
                <div className="mt-2 grid gap-2 text-sm">
                  <div>
                    Customer: {raw.customer_name ?? order.customer_name ?? "-"}
                  </div>
                  <div>
                    Attachments:{" "}
                    {Array.isArray(raw.documents) ? raw.documents.length : 0}
                  </div>
                  <div>For planning: {String(raw.for_planning ?? "-")}</div>
                </div>
              </div>
            </div>
            {Array.isArray(raw.custom_fields) &&
              raw.custom_fields.length > 0 && (
                <div className="mt-6 border-t border-[#e4e3df] pt-5">
                  <div className="micro text-[#77787b]">Custom fields</div>
                  {raw.custom_fields.map((field: any, index: number) => (
                    <div
                      className="flex justify-between border-b border-[#efeeeb] py-2 text-sm"
                      key={field.customfield_id ?? index}
                    >
                      <span>{field.label ?? "Field"}</span>
                      <span>{field.value ?? "-"}</span>
                    </div>
                  ))}
                </div>
              )}
          </>
        )}
      </aside>
    </div>
  );
}
