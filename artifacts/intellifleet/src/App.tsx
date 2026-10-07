import {
  Children,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Link,
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
  useParams,
} from "wouter";
import * as fleetApi from "@/services/api/fleet";
import * as ordersApi from "@/services/api/orders";
import * as alertsApi from "@/services/api/alerts";
import * as adminApi from "@/services/api/admin";
import * as commsApi from "@/services/api/comms";
import * as authApi from "@/services/api/auth";
import * as agentApi from "@/services/api/agent";
import type { PendingAction } from "@/services/api/agent";
import { RichAssistantMessage } from "@/components/agent/RichAssistantMessage";
import heroBackgroundVideo from "../../../media/Rishi.mp4";
import dashboardIllustration from "../../../media/dashabord.png";
import rishiProfilePhoto from "../../../media/rishi_pic.png";
import chatbotIcon from "../../../media/martin.png";
import {
  ApiError,
  getStoredSessionId,
  setStoredSessionId,
  clearStoredSessionId,
} from "@/services/api/client";
import {
  adaptVehicle,
  adaptOrder,
  adaptAlert,
  projectLatLngToMapXY,
  mapXYToLatLngApprox,
  timeAgo,
  type UiVehicle,
} from "@/services/adapters";
import {
  FleetSocketProvider,
  useFleetSocketConnection,
} from "@/lib/fleet-socket-provider";
import { animateLatLng, isVehicleStale } from "@/lib/live-map";
import * as routesApi from "@/services/api/routes";
import {
  NetworkMap,
  LiveOpsMap,
  LiveRouteMap,
} from "@/components/maps/GoogleMaps";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { GooglePlaceInput } from "@/components/maps/GooglePlaceInput";
import LoadPlanningInventoryTab, {
  AssignmentEmailPreviewModal,
} from "@/components/load-planning/LoadPlanningInventoryTab";
import LoadPlanningAssignmentTab from "@/components/load-planning/LoadPlanningAssignmentTab";
import { capacityOverage, loadOverage } from "@/lib/capacity";
import { EXPRESSWAY_CHOICES, RETURN_WAREHOUSE_HINT, buildCostTableRows, etaLabel, formatRatesLine, resolveActivePlan, returnWarehouseMissing, tollCellText, tollOptionSummary, totalCellText, type ExpresswayChoice } from "@/lib/routeCost";
import { ReturnWarehousePicker } from "@/components/maps/ReturnWarehousePicker";
import * as inventoryApi from "@/services/api/inventory";
import * as reportsApi from "@/services/api/reports";
import { RgfLogisticsReportView } from "@/components/reports/RgfLogisticsReport";
import { CommsGateway } from "@/components/dispatch/CommsGateway";
import DispatchDashboardPage from "@/pages/DispatchDashboardRefreshing";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Cloud,
  Command,
  Container,
  Crosshair,
  FileText,
  Filter,
  Gauge,
  Globe2,
  Headphones,
  LayoutDashboard,
  ExternalLink,
  ListFilter,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PackageCheck,
  PanelLeft,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  UserRound,
  Users,
  X,
  Zap,
  Loader2,
} from "lucide-react";
import NotFound from "@/pages/not-found";
import { formatAddress } from "@/lib/address";

type Role = "Dispatcher" | "Planner" | "Driver" | "Warehouse" | "Client" | "Admin";
// Widened from a fixed enum to a plain string: real order status values come
// from whatever ops writes to the live orders table, not a closed demo set.
type OrderStatus = string;
type AlertSeverity = "Critical" | "Warning" | "Info";

interface Vehicle {
  id: string;
  plate: string;
  driver: string;
  speed: number;
  fuel: number;
  status: string;
  x: number;
  y: number;
  zone: string;
  associatedSos?: { soNumber: string; clientName: string | null; destinationCity: string | null; warehouse: string | null; orderedWeightKg?: number | null; shippedWeightKg?: number | null; deliveryStatus?: string | null }[];
  warehousePickup?: string | null;
  locked?: boolean;
  lockReason?: string | null;
  capacityKg?: number | null;
  load?: { assignedWeightKg: number; capacityKg: number; remainingWeightKg: number; utilizationPercent: number } | null;
  fulfillment?: { assignedWeightKg: number; shippedWeightKg: number; remainingWeightKg: number; percent: number; status: string } | null;
}
interface Alert {
  id: string;
  type: string;
  severity: AlertSeverity;
  vehicle: string;
  message: string;
  time: string;
  status: string;
}
interface Order {
  id: string;
  customer: string;
  route: string;
  vehicle: string;
  status: OrderStatus;
  eta: string;
  temperature: string;
  shipmentWeight?: number | null;
  serviceTimeMin?: number | null;
  salesOrderStatus?: string | null;
  products?: inventoryApi.SalesOrderSummary["products"];
}

const orders: Order[] = [];
const alertsSeed: Alert[] = [];
// Purely decorative points for MockMap's schematic (non-Leaflet) map when no real `points`
// prop is passed - used only by the marketing/mock Route builder and customer tracking portal,
// never by the Control Tower (which always passes real vehicles via LiveOpsMap instead).
const mockMapPoints: Vehicle[] = [
  {
    id: "IF-204",
    plate: "IF-204",
    driver: "Marco Santos",
    speed: 62,
    fuel: 74,
    status: "On time",
    x: 46,
    y: 55,
    zone: "Cavite",
  },
];

const LIVE_POSITION_ANIMATION_MS = 4800;

// REAL DATA ONLY - no fallback to fixtures for vehicles because:
// 1. Fixture IDs don't match real Cartrack vehicle ROWIDs
// 2. Live socket updates only work if cache has real vehicle IDs
// 3. Fixture fallback masks real API problems and blocks live updates
function useVehiclesData(liveTracking = true, selectedDate?: string) {
  const query = useQuery({
    queryKey: selectedDate ? ["vehicles", selectedDate] : ["vehicles"],
    queryFn: async () => (await fleetApi.listVehicles(undefined, selectedDate)).map(adaptVehicle),
    staleTime: 0, // Always stale - force WebSocket updates to sync
    // Fleet is reconciled by the backend every 30 minutes even when no tab is open.
    // Keep the page aligned with that authoritative snapshot as well as on focus.
    refetchInterval: liveTracking ? 5000 : 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: 1000,
  });
  // Return real data or empty array - show empty state if API fails
  return { ...query, data: query.data ?? [] };
}

// Calendar date (YYYY-MM-DD) in Manila, offset by whole days. Fleet and Orders default to the
// NEXT delivery day, so the date must never depend on the browser's or UTC's idea of "today".
function manilaDate(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(Date.now() + offsetDays * 86400000));
}

function nextExpectedDate() {
  return manilaDate(1);
}

function useOrdersData(dateFrom: string, dateTo: string, options: { search?: string; status?: string; assignment?: "assigned" | "unassigned"; vehicle?: string; customer?: string; deliveryStatus?: string } = {}) {
  const query = useQuery({
    queryKey: ["orders", dateFrom, dateTo, options],
    queryFn: async () => {
      const page = await inventoryApi.listSalesOrders(dateFrom, dateTo, 1, options.status || "All", options.search || "", options.assignment || "assigned", [], options);
      return { ...page, items: page.items.map((item) => ({
        id: item.salesorder_number || item.id,
        customer: item.customer_name || "—",
        route: item.shipping_city || "Unassigned route",
        vehicle: item.vehicle_id || "Unassigned",
        status: item.order_status || "Confirmed",
        eta: item.expected_shipment_date || "—",
        temperature: "—",
        shipmentWeight: item.total_item_quantity,
        salesOrderStatus: item.order_status,
        products: item.products,
        serviceTimeMin: null,
      } satisfies Order)) };
    },
    staleTime: 5000,
    retry: 3,
    retryDelay: 1000,
  });
  const data = query.data?.items?.length ? query.data.items : orders;
  return { ...query, data, total: query.data?.total ?? data.length };
}

function useAlertsData() {
  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => (await alertsApi.listAlerts()).map(adaptAlert),
    staleTime: 5000,
    retry: 3,
    retryDelay: 1000,
  });
  const data = query.data && query.data.length ? query.data : alertsSeed;
  return { ...query, data };
}

function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return async (id: string) => {
    try {
      await alertsApi.acknowledgeAlert(id);
    } catch {
      // Real alert ids only exist once seeded in the live Data Store - if the
      // id came from the local fixture fallback, the backend call 404s here.
      // The local state update below still reflects the click either way.
    }
    queryClient.invalidateQueries({ queryKey: ["alerts"] });
  };
}

// Routes + their stops, for LiveOpsMap's polyline layer and the Route Health panel. N+1
// per-route stop queries are acceptable at this demo's scale (a handful of routes); staleTime
// keeps re-renders cheap without needing a dedicated joined backend endpoint.
function useRoutesWithStops() {
  const { data: routes = [] } = useQuery({
    queryKey: ["routes"],
    queryFn: () => routesApi.listRoutes(),
    staleTime: 5000,
    retry: false,
  });
  const stopQueries = useQueries({
    queries: routes.map((r) => ({
      queryKey: ["route-stops", r.ROWID],
      queryFn: () => routesApi.listRouteStops(r.ROWID),
      staleTime: 5000,
      retry: false,
    })),
  });
  return routes.map((route, i) => ({
    route,
    stops: stopQueries[i]?.data ?? [],
  }));
}

interface AgentChatMessage {
  role: "user" | "assistant";
  text: string;
  pendingAction?: PendingAction;
}

// Self-contained dock, same pattern as OrderDrawer/AlertTable. `compact` renders a
// near-full-width sheet suited to a mobile driver screen instead of a floating card.
function AgentChat({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined,
  );
  const [messages, setMessages] = useState<AgentChatMessage[]>([
    {
      role: "assistant",
      text: "Welcome. I’m Martin Reyes, your logistics operations partner. I can check live vehicles, alerts, orders, and routes, and I can take approved actions for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const result = await agentApi.sendMessage(text, conversationId);
      setConversationId(result.conversationId);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: result.reply ?? "",
          pendingAction: result.pendingAction,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Sorry, the assistant is unavailable right now.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const confirm = async (index: number, pendingAction: PendingAction) => {
    if (!conversationId) return;
    setSending(true);
    try {
      const result = await agentApi.confirmAction(
        conversationId,
        pendingAction,
      );
      setMessages((m) =>
        m.map((msg, i) =>
          i === index
            ? { role: "assistant", text: result.reply ?? "Done." }
            : msg,
        ),
      );
    } catch {
      setMessages((m) =>
        m.map((msg, i) =>
          i === index
            ? {
                role: "assistant",
                text: "That action couldn't be completed - you may not have permission.",
              }
            : msg,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const dismiss = (index: number) => {
    setMessages((m) =>
      m.map((msg, i) =>
        i === index ? { role: "assistant", text: "Action dismissed." } : msg,
      ),
    );
  };

  if (!open) {
    return (
      <button
        data-testid="button-agent-chat-open"
        onClick={() => setOpen(true)}
        className={cx(
          "chatbot-float fixed z-50 grid place-items-center overflow-hidden rounded-full border-2 border-white bg-white p-0 shadow-[0_8px_24px_rgba(0,0,0,0.32)] transition-transform hover:scale-110",
          compact
            ? "bottom-20 right-4 h-14 w-14"
            : "bottom-6 right-6 h-14 w-14 md:h-24 md:w-24",
        )}
      >
          <img src={chatbotIcon} alt="Open logistics chat" className="h-full w-full scale-[1.08] object-cover" />
      </button>
    );
  }

  return (
    <div
      className={cx(
        "fixed z-30 flex flex-col border border-[#e4e3df] bg-white shadow-xl",
        compact
          ? "bottom-16 left-3 right-3 h-[70vh] rounded-[8px]"
          : "bottom-6 right-6 h-[520px] w-[380px] rounded-[8px]",
      )}
    >
      <div className="flex items-center justify-between border-b border-[#e4e3df] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Zap size={15} />
          Martin Reyes · Logistics
        </div>
        <button
          data-testid="button-agent-chat-close"
          onClick={() => setOpen(false)}
        >
          <X size={16} />
        </button>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto p-4">
        {messages.map((msg, i) =>
          msg.pendingAction ? (
            <div
              key={i}
              className="mb-3 border border-[#d8d7d2] bg-[#fafaf8] p-3 text-xs"
            >
              <div className="mb-2 font-semibold">Confirm action</div>
              <div className="mono mb-3 text-[11px] leading-5 text-[#55565a]">
                {msg.pendingAction.tool}(
                {JSON.stringify(msg.pendingAction.args)})
              </div>
              <div className="flex gap-2">
                <Button
                  variant="black"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => confirm(i, msg.pendingAction!)}
                >
                  Confirm
                </Button>
                <Button
                  variant="outline"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => dismiss(i)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={i}
              className={cx(
                "mb-3 max-w-[85%] rounded-[10px] px-3 py-2 text-xs leading-5",
                msg.role === "user"
                  ? "ml-auto bg-black text-white"
                  : "bg-[#f2f2ef]",
              )}
            >
              {msg.role === "assistant" ? (
                <RichAssistantMessage text={msg.text} />
              ) : (
                msg.text
              )}
            </div>
          ),
        )}
        {sending && (
          <div
            className="mb-3 flex max-w-[85%] items-center gap-1 rounded-[10px] bg-[#f2f2ef] px-3 py-3"
            aria-label="Martin Reyes is working"
          >
            <span className="agent-typing-dot" />
            <span className="agent-typing-dot" />
            <span className="agent-typing-dot" />
            <span className="ml-2 text-[11px] text-[#77787b]">
              Martin is checking live operations…
            </span>
          </div>
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-[#e4e3df] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          data-testid="input-agent-chat"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the assistant…"
          className="flex-1 border border-[#d8d7d2] bg-white px-3 py-2 text-xs outline-none focus:border-black"
        />
        <button
          data-testid="button-agent-chat-send"
          type="submit"
          disabled={sending}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black text-white disabled:opacity-40"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}

const navGroups = [
  {
    label: "Control",
    items: [
      ["/app/tower", "Control Tower", LayoutDashboard],
      ["/app/fleet", "Fleet", Truck],
      ["/app/routes", "Routes", RouteIcon],
      ["/app/loads", "Load planning", Boxes],
    ],
  },
  {
    label: "Execution",
    items: [
      ["/app/orders", "Orders", ClipboardCheck],
      ["/app/comms", "Communications", MessageSquare],
      ["/app/reports", "Reports", BarChart3],
    ],
  },
];
const rolePaths: Record<Role, string> = {
  Dispatcher: "/app/tower",
  Planner: "/app/tower",
  Driver: "/driver/today",
  Warehouse: "/warehouse/dashboard",
  Client: "/portal/orders",
  Admin: "/admin/users",
};

const cx = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(" ");

function RoleGate({ children, allowed }: { children: ReactNode; allowed: string[] }) {
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    authApi.getSession().then(({ user }) => {
      if (!allowed.includes(user.role.toLowerCase())) setLocation("/app/tower");
      else setReady(true);
    }).catch(() => setLocation("/login"));
  }, [allowed.join(","), setLocation]);
  return ready ? <>{children}</> : <div className="flex min-h-[100dvh] items-center justify-center text-sm text-[#77787b]">Checking access...</div>;
}
function Button({
  children,
  variant = "black",
  className = "",
  onClick,
  type = "button",
  disabled = false,
  ...rest
}: {
  children: ReactNode;
  variant?: "black" | "outline" | "ghost" | "danger";
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  "data-testid"?: string;
}) {
  const buttonText = Children.toArray(children)
    .filter((child): child is string => typeof child === "string")
    .join(" ")
    .trim();
  if (buttonText === "Optimize Fleet") return null;
  return (
    <button
      {...rest}
      data-testid={
        rest["data-testid"] ??
        `button-${typeof children === "string" ? children.toLowerCase().replaceAll(" ", "-") : "action"}`
      }
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40",
        variant === "black" && "button-black",
        variant === "outline" && "button-outline",
        variant === "ghost" && "text-link text-sm",
        variant === "danger" &&
          "bg-[#fbeceb] text-[#c4291f] hover:bg-[#f6d9d7]",
        className,
      )}
    >
      {children}
    </button>
  );
}
function StatusChip({
  status,
  tone,
}: {
  status: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const resolved =
    tone ??
    (["Delivered", "On time", "Resolved", "Delivered"].includes(status)
      ? "good"
      : ["Critical", "Failed", "Temperature"].some((x) => status.includes(x))
        ? "bad"
        : ["Warning", "Open", "Route drift", "Low fuel", "Partial"].some((x) =>
              status.includes(x),
            )
          ? "warn"
          : "neutral");
  return (
    <span
      data-testid={`status-${status.toLowerCase().replaceAll(" ", "-")}`}
      className={cx(
        "status-chip",
        resolved === "good"
          ? "status-good"
          : resolved === "bad"
            ? "status-bad"
            : resolved === "warn"
              ? "status-warn"
              : "status-neutral",
      )}
    >
      {status}
    </span>
  );
}
function Logo({
  light = false,
  showCompanyName = false,
}: {
  light?: boolean;
  showCompanyName?: boolean;
}) {
  return (
    <Link
      data-testid="link-logo"
      href="/"
      className="public-logo flex min-w-0 flex-col items-start leading-none"
    >
      <span
        className={cx("display-face text-2xl font-bold", light && "text-white")}
      >
        RARECHAIN
        <span className={light ? "text-[#d9d9d9]" : "text-[#a1a1a1]"}>.</span>
      </span>
      {showCompanyName && (
        <span
          className={cx(
            "mt-1 text-[10px] font-semibold leading-none tracking-[.02em]",
            light ? "text-white/70" : "text-[#55565a]",
          )}
        >
          Rare Global Food Trading Corp
        </span>
      )}
    </Link>
  );
}
function Kpi({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: string;
}) {
  return (
    <div className="border-l border-[#e4e3df] pl-4 first:border-0">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#77787b]">
        <Icon size={14} />
        {label}
      </div>
      <div
        data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}
        className="display-face text-3xl font-bold"
      >
        {value}
      </div>
      <div
        className={cx(
          "mt-1 text-xs",
          tone === "good" ? "text-[#1e7b44]" : "text-[#77787b]",
        )}
      >
        {detail}
      </div>
    </div>
  );
}
function PageIntro({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5 entrance">
      <div>
        <div className="micro mb-3 text-[#77787b]">{eyebrow}</div>
        <h1 className="display-face max-w-3xl text-4xl font-bold leading-[.98] md:text-5xl">
          {title}
        </h1>
        {body && (
          <p className="mt-4 max-w-2xl text-[15px] leading-6 text-[#55565a]">
            {body}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function PublicNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <header className="relative border-b border-[#e4e3df] bg-[#f2f2ef]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-3.5 md:px-10">
        <Logo showCompanyName />
        <nav className="public-nav-links hidden items-center gap-7 text-sm text-[#55565a] md:flex">
          <Link
            data-testid="link-platform"
            href="/platform"
            className="hover:text-black"
          >
            Platform
          </Link>
          <Link
            data-testid="link-how-it-works"
            href="/how-it-works"
            className="hover:text-black"
          >
            How it works
          </Link>
          <Link
            data-testid="link-channels"
            href="/channels"
            className="hover:text-black"
          >
            Channels
          </Link>
          <Link
            data-testid="link-security"
            href="/security"
            className="hover:text-black"
          >
            Security
          </Link>
        </nav>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            data-testid="link-login"
            href="/login"
            className="hidden text-sm font-semibold sm:block"
          >
            Log in
          </Link>
          <Link
            data-testid="link-request-demo"
            href="/request-demo"
            className="public-demo-link button-black rounded-full px-4 py-2.5 text-sm font-semibold"
          >
            Request a demo
          </Link>
          <button
            type="button"
            data-testid="button-public-mobile-menu"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center border border-[#d8d7d2] bg-white md:hidden"
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          aria-label="Mobile navigation"
          className="absolute left-0 right-0 top-full z-40 border-b border-[#d8d7d2] bg-[#f2f2ef] p-4 shadow-lg md:hidden"
        >
          <div className="grid gap-1 text-sm font-semibold">
            <Link
              data-testid="mobile-public-platform"
              href="/platform"
              onClick={close}
              className="border-b border-[#e4e3df] px-2 py-3"
            >
              Platform
            </Link>
            <Link
              data-testid="mobile-public-how-it-works"
              href="/how-it-works"
              onClick={close}
              className="border-b border-[#e4e3df] px-2 py-3"
            >
              How it works
            </Link>
            <Link
              data-testid="mobile-public-channels"
              href="/channels"
              onClick={close}
              className="border-b border-[#e4e3df] px-2 py-3"
            >
              Channels
            </Link>
            <Link
              data-testid="mobile-public-security"
              href="/security"
              onClick={close}
              className="border-b border-[#e4e3df] px-2 py-3"
            >
              Security
            </Link>
            <Link
              data-testid="mobile-public-login"
              href="/login"
              onClick={close}
              className="px-2 py-3"
            >
              Log in
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
function PublicFooter() {
  return (
    <footer className="bg-[#0b0b0b] px-5 py-9 text-white md:px-10 md:py-14">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:gap-10">
        <div className="col-span-2 md:col-span-1">
          <Logo light />
          <p className="mt-3 max-w-xs text-[13px] leading-5 text-[#a7a7a7] md:mt-5 md:text-sm md:leading-6">
            Connected cold-chain operations for every mile between origin and
            customer.
          </p>
          <div className="mt-5 micro text-[#858585] md:mt-12">
            Rare Global Food Trading Corp.
          </div>
        </div>
        <div>
          <div className="micro mb-3 text-[#858585] md:mb-4">Explore</div>
          <div className="grid gap-2 text-[13px] text-[#c8c8c8] md:gap-3 md:text-sm">
            <Link data-testid="footer-link-platform" href="/platform">
              Platform
            </Link>
            <Link data-testid="footer-link-how" href="/how-it-works">
              How it works
            </Link>
            <Link data-testid="footer-link-channels" href="/channels">
              Channels
            </Link>
          </div>
        </div>
        <div>
          <div className="micro mb-3 text-[#858585] md:mb-4">Trust</div>
          <div className="grid gap-2 text-[13px] text-[#c8c8c8] md:gap-3 md:text-sm">
            <Link data-testid="footer-link-security" href="/security">
              Security
            </Link>
            <Link data-testid="footer-link-about" href="/about-rgf">
              About RGF
            </Link>
            <span>Data policy</span>
          </div>
        </div>
        <div className="col-span-2 md:col-span-1">
          <div className="micro mb-3 text-[#858585] md:mb-4">Talk to us</div>
          <p className="text-[13px] leading-5 text-[#c8c8c8] md:text-sm md:leading-6">
            See how your team can move with more certainty.
          </p>
          <Link
            data-testid="footer-link-demo"
            href="/request-demo"
            className="mt-3 inline-block text-sm font-semibold underline underline-offset-4 md:mt-5"
          >
            Request a demo
          </Link>
        </div>
      </div>
      <div className="mx-auto mt-9 flex max-w-[1440px] flex-col gap-1 border-t border-[#333] pt-4 text-[11px] text-[#777] sm:flex-row sm:justify-between md:mt-16 md:pt-5 md:text-xs">
        <span>© 2026 Rare Global Food Trading Corp.</span>
        <span>Frontend demonstration · mocked data</span>
      </div>
    </footer>
  );
}

const roleStories: Record<
  string,
  {
    eyebrow: string;
    title: string;
    body: string;
    image: string;
    bullets: string[];
  }
> = {
  Dispatcher: {
    eyebrow: "For dispatchers",
    title: "The whole network, at a glance.",
    body: "A calm command surface for making the next right decision before an exception becomes a delay.",
    image:
      "https://images.pexels.com/photos/6169056/pexels-photo-6169056.jpeg?auto=compress&cs=tinysrgb&w=1600",
    bullets: [
      "Live positions and route health",
      "Exceptions ranked by operational impact",
      "One timeline across every channel",
    ],
  },
  Driver: {
    eyebrow: "For drivers",
    title: "The right next step. One hand.",
    body: "Assignments, stops, and status changes designed for a cab, a phone, and a moving day.",
    image:
      "https://images.pexels.com/photos/7464230/pexels-photo-7464230.jpeg?auto=compress&cs=tinysrgb&w=1600",
    bullets: [
      "Glanceable assignments",
      "Voice-first status updates",
      "Clear handoffs at every stop",
    ],
  },
  Warehouse: {
    eyebrow: "For warehouses",
    title: "Make the dock the source of truth.",
    body: "Turn loading, receiving, and cold-chain exceptions into visible, accountable work.",
    image:
      "https://images.pexels.com/photos/4481327/pexels-photo-4481327.jpeg?auto=compress&cs=tinysrgb&w=1600",
    bullets: [
      "Manifest confirmation",
      "Temperature exception workflows",
      "Fast tablet-friendly checklists",
    ],
  },
  Customer: {
    eyebrow: "For customers",
    title: "A delivery update worth trusting.",
    body: "A simple view of what is moving, when it will arrive, and what happened at the door.",
    image:
      "https://images.pexels.com/photos/4246120/pexels-photo-4246120.jpeg?auto=compress&cs=tinysrgb&w=1600",
    bullets: [
      "Live ETA without dashboard overhead",
      "Order milestones in plain language",
      "One tap to reach support",
    ],
  },
};

function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return value;
}

function NetworkSection() {
  const [region, setRegion] = useState("all");
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const trucks = useCountUp(47, inView);
  const cold = useCountUp(12, inView);
  const deliveries = useCountUp(234, inView);
  return (
    <section
      ref={sectionRef}
      className="border-b border-[#e4e3df] bg-white px-5 py-16 md:px-10 md:py-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="micro mb-5 text-[#77787b]">
          Operating network / Philippines
        </div>
        <h2 className="display-face text-2xl font-bold leading-[.98] sm:whitespace-nowrap sm:text-3xl md:text-4xl">
          The network behind every delivery.
        </h2>
        <p className="mt-5 max-w-xl text-[15px] leading-6 text-[#55565a]">
          From Luzon to Mindanao, RareChain connects vehicles, cold-storage
          facilities and delivery points in one real-time operating network.
        </p>

        <div className="mt-9 flex flex-wrap items-baseline gap-x-10 gap-y-4 border-y border-[#e4e3df] py-6">
          <div className="flex items-baseline gap-2.5">
            <span
              data-testid="stat-active-trucks"
              className="display-face text-3xl font-bold"
            >
              {trucks}
            </span>
            <span className="micro text-[#77787b]">Active vehicles</span>
          </div>
          <div className="hidden h-6 w-px bg-[#e4e3df] sm:block" />
          <div className="flex items-baseline gap-2.5">
            <span
              data-testid="stat-cold-storages"
              className="display-face text-3xl font-bold"
            >
              {cold}
            </span>
            <span className="micro text-[#77787b]">Cold facilities</span>
          </div>
          <div className="hidden h-6 w-px bg-[#e4e3df] sm:block" />
          <div className="flex items-baseline gap-2.5">
            <span
              data-testid="stat-daily-deliveries"
              className="display-face text-3xl font-bold"
            >
              {deliveries}
            </span>
            <span className="micro text-[#77787b]">Daily deliveries</span>
          </div>
        </div>

        <div className="relative mt-10">
          <div className="absolute left-2 right-2 top-2 z-[1000] flex max-w-fit gap-1 overflow-x-auto rounded-full border border-[#d8d7d2] bg-white/95 p-1 backdrop-blur sm:left-4 sm:right-auto sm:top-4">
            {["all", "luzon", "visayas", "mindanao"].map((r) => (
              <button
                key={r}
                data-testid={`button-region-${r}`}
                onClick={() => setRegion(r)}
                className={cx(
                  "shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[.1em]",
                  region === r
                    ? "bg-black text-white"
                    : "text-[#55565a] hover:text-black",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="absolute bottom-4 left-4 z-[1000] rounded-[4px] border border-[#d8d7d2] bg-white/95 px-3 py-2 backdrop-blur">
            <div className="micro flex items-center gap-2 text-[#55565a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1e7b44] live-dot" />
              Live network / Philippines
            </div>
          </div>
          <NetworkMap region={region} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-[#55565a]">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#0b0b0b]" />
            Distribution hub
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#55565a]" />
            Cold storage
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full border-2 border-[#8a8b8e]" />
            Active vehicle
          </span>
        </div>
      </div>
    </section>
  );
}

interface JourneyStep {
  step: string;
  title: string;
  caption: string;
  photoId: string;
}
const JOURNEY_STEPS: JourneyStep[] = [
  {
    step: "01",
    title: "Farm & Suppliers",
    caption: "Products harvested from certified farms across the Philippines.",
    photoId: "photo-1500595046743-cd271d694d30",
  },
  {
    step: "02",
    title: "Collection Centers",
    caption: "Quality-checked and consolidated at regional collection points.",
    photoId: "photo-1553413077-190dd305871c",
  },
  {
    step: "03",
    title: "Cold Storage",
    caption:
      "Maintained at precise temperatures in certified cold storage facilities.",
    photoId: "photo-1558618666-fcd25c85cd64",
  },
  {
    step: "04",
    title: "Refrigerated Fleet",
    caption:
      "RARE-branded trucks loaded with GPS-tagged, temperature-monitored cargo.",
    photoId: "photo-1519003722824-194d4455a60c",
  },
  {
    step: "05",
    title: "RareChain AI Engine",
    caption:
      "Optimal routes calculated, with traffic, temperature, and compliance monitored in real time.",
    photoId: "photo-1551288049-bebda4e38f71",
  },
  {
    step: "06",
    title: "Distribution Hubs",
    caption: "Redistributed through strategically located regional hubs.",
    photoId: "photo-1494412651409-8963ce7935a7",
  },
  {
    step: "07",
    title: "Restaurant & Retail",
    caption: "Delivered fresh to restaurants and retail partners nationwide.",
    photoId: "photo-1414235077428-338989a2e8c0",
  },
  {
    step: "08",
    title: "Consumer",
    caption: "Trusted quality reaching every table across the Philippines.",
    photoId: "photo-1504674900247-0877df9cc836",
  },
];

function JourneyCard({
  item,
  index,
  revealed,
}: {
  item: JourneyStep;
  index: number;
  revealed: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const handleMouseEnter = () => {
    if (cardRef.current) cardRef.current.style.transition = "transform .1s";
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1000px) rotateX(${y * -8}deg) rotateY(${x * 8}deg) scale3d(1.015,1.015,1.015)`;
  };
  const handleMouseLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = "transform .45s cubic-bezier(.23,1,.32,1)";
    el.style.transform =
      "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
  };
  return (
    <div
      ref={cardRef}
      data-testid={`journey-card-${item.step}`}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transitionDelay: revealed ? `${index * 80}ms` : "0ms" }}
      className={cx(
        "journey-card group relative h-[280px] cursor-pointer overflow-hidden rounded-[12px] md:h-[360px]",
        revealed ? "journey-card-shown" : "journey-card-hidden",
      )}
    >
      <img
        src={`https://images.unsplash.com/${item.photoId}?w=800&q=90&auto=format&fit=crop`}
        alt={item.title}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.07]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <span className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-black transition-transform duration-300 group-hover:scale-x-100" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <span className="micro mb-1.5 block text-white/70">{item.step}</span>
        <h4 className="text-base font-bold">{item.title}</h4>
        <p className="mt-1.5 translate-y-2 text-[11.5px] leading-[1.55] text-white/70 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          {item.caption}
        </p>
      </div>
    </div>
  );
}

function JourneySection() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <section className="border-b border-[#e4e3df] bg-white px-5 py-16 md:px-10 md:py-24">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-12 max-w-2xl">
          <div className="micro mb-5 text-[#77787b]">The cold chain story</div>
          <h2 className="display-face text-2xl font-bold leading-[.98] sm:whitespace-nowrap sm:text-3xl md:text-4xl">
            From Farm to Restaurant, tracked.
          </h2>
          <p className="mt-5 max-w-[540px] text-[15px] leading-6 text-[#55565a]">
            RareChain AI gives Rare Global Food complete visibility across every
            step of the supply chain.
          </p>
        </div>
        <div ref={gridRef} className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {JOURNEY_STEPS.map((item, i) => (
            <JourneyCard
              key={item.step}
              item={item}
              index={i}
              revealed={revealed}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Landing() {
  const [story, setStory] = useState("Dispatcher");
  const [pulse, setPulse] = useState(247);
  useEffect(() => {
    const id = window.setInterval(
      () => setPulse((v) => v + (Math.random() > 0.5 ? 1 : -1)),
      3200,
    );
    return () => window.clearInterval(id);
  }, []);
  const active = roleStories[story];
  return (
    <div className="noise">
      <PublicNav />
      <main>
        <section className="hero relative isolate overflow-hidden">
          <video
            className="hero-image absolute inset-0 h-full w-full"
            src={heroBackgroundVideo}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-label="RareChain logistics operations"
          />
          <div aria-hidden="true" className="hero-brand-overlay">
            RARE &bull; LOGISTICS
          </div>
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.43) 0%, rgba(0,0,0,0.26) 40%, rgba(0,0,0,0.07) 70%, rgba(0,0,0,0) 100%)",
            }}
          />
          <div className="hero-inner relative mx-auto flex h-full max-w-[1440px] items-center px-5 py-12 md:px-10 md:py-20">
            <div className="hero-copy entrance max-w-[520px] -translate-y-5 md:-translate-y-8">
              <div className="hero-eyebrow mb-7 flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[#1e7b44] live-dot" />
                <span>Cold-chain operations / Philippines</span>
              </div>
              <h1 className="hero-headline display-xl max-w-[520px] text-[clamp(2.8rem,5.2vw,4.6rem)] leading-[1.08]">
                Tracking every
                <br />
                delivery across
                <br />
                The Philippines
              </h1>
              <p className="hero-support mt-8 max-w-md text-[clamp(1.05rem,1.45vw,1.25rem)]">
                AI-powered logistics intelligence for fleet, inventory, and
                delivery operations. Real-time visibility. Smarter decisions.
                Better control.
              </p>
            </div>
          </div>
        </section>
        <section className="role-nav-section border-y border-[#e4e3df] bg-[#f2f2ef] px-5 py-4 md:px-10">
          <div className="role-nav mx-auto flex max-w-[1440px] items-center gap-8 overflow-x-auto whitespace-nowrap">
            <span className="micro shrink-0 text-[#77787b]">View by role</span>
            {Object.keys(roleStories).map((key) => (
              <button
                data-testid={`tab-role-${key.toLowerCase()}`}
                key={key}
                onClick={() => setStory(key)}
                className={cx(
                  "shrink-0 border-b-2 py-2 text-sm font-semibold",
                  story === key
                    ? "border-black text-black"
                    : "border-transparent text-[#77787b] hover:text-black",
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </section>
        <section className="mx-auto grid max-w-[1440px] gap-8 px-5 py-16 md:grid-cols-[.72fr_1.28fr] md:px-10 md:py-24">
          <div className="flex flex-col justify-between">
            <div>
              <div className="micro mb-5 text-[#77787b]">{active.eyebrow}</div>
              <h2 className="display-face max-w-xl text-4xl font-bold leading-[.98] md:text-6xl">
                {active.title}
              </h2>
              <p className="mt-6 max-w-md text-base leading-7 text-[#55565a]">
                {active.body}
              </p>
            </div>
            <div className="mt-8">
              <Link
                data-testid="role-learn-more"
                href="/platform"
                className="text-link text-sm font-semibold"
              >
                Explore this view{" "}
                <ArrowRight className="ml-2 inline" size={15} />
              </Link>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[4px] bg-[#e2e1dd]">
            <img
              key={story}
              className="h-[380px] w-full object-cover transition-opacity duration-300 md:h-[480px]"
              src={active.image}
              alt={active.title}
            />
            <div className="absolute bottom-5 left-5 grid gap-2 sm:grid-cols-3">
              {active.bullets.map((bullet, i) => (
                <div
                  key={bullet}
                  className="glass-card max-w-[180px] p-3 text-xs font-semibold leading-4"
                >
                  {String(i + 1).padStart(2, "0")}{" "}
                  <span className="ml-2 font-normal text-[#55565a]">
                    {bullet}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <JourneySection />
        <NetworkSection />
        <section className="border-b border-[#e4e3df] bg-[#f2f2ef] px-5 py-4 md:px-10">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[#1e7b44] live-dot" />
              <span className="micro">Network pulse</span>
              <span
                data-testid="text-active-deliveries"
                className="display-face text-xl font-bold"
              >
                {pulse} active deliveries
              </span>
            </div>
            <div className="mono text-xs text-[#77787b]">
              SIMULATED LIVE POSITION FEED · UPDATED JUST NOW
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-[1440px] px-5 py-16 md:px-10 md:py-24">
          <div className="grid gap-8 md:grid-cols-[.9fr_1.1fr]">
            <div>
              <div className="micro mb-5 text-[#77787b]">
                Connected channels
              </div>
              <h2 className="display-face max-w-xl text-4xl font-bold leading-none md:text-5xl">
                One message history.
                <br />
                Whatever the channel.
              </h2>
              <p className="mt-6 max-w-md text-base leading-7 text-[#55565a]">
                WhatsApp, Viber, SMS, and Voice AI, unified in one gateway.
                Provider connections are represented as honest mocked states in
                this demonstration.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px self-start overflow-hidden border border-[#e4e3df] bg-[#e4e3df] sm:grid-cols-4">
              {["WhatsApp", "Viber", "SMS", "Voice AI"].map((channel) => (
                <div key={channel} className="bg-white p-5">
                  <div className="micro text-[#77787b]">Channel</div>
                  <div className="mt-7 font-semibold">{channel}</div>
                  <div className="mt-2 text-xs text-[#77787b]">
                    Connected surface
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="bg-[#f2f2ef] px-5 py-16 md:px-10 md:py-20">
          <div className="mx-auto max-w-[1440px]">
            <div className="micro mb-6 text-[#77787b]">Trust by design</div>
            <div className="grid gap-0 divide-y divide-[#d9d8d3] border-y border-[#d9d8d3] md:grid-cols-4 md:divide-x md:divide-y-0">
              {[
                ["RBAC", "The right people see the right work.", Users],
                [
                  "Audit trail",
                  "Every exception has a visible history.",
                  FileText,
                ],
                [
                  "Encrypted in transit",
                  "Operational data moves with care.",
                  LockKeyhole,
                ],
                [
                  "One source of truth",
                  "Everyone works from the same order.",
                  Globe2,
                ],
              ].map(([title, body, Icon]) => (
                <div
                  className="flex gap-4 py-5 md:px-6 md:py-7 md:first:pl-0"
                  key={String(title)}
                >
                  <Icon size={18} className="mt-1 shrink-0" />
                  <div>
                    <div className="font-semibold">{title as string}</div>
                    <div className="mt-2 text-sm leading-5 text-[#55565a]">
                      {body as string}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-7 px-5 py-20 md:flex-row md:items-end md:px-10 md:py-28">
          <div>
            <div className="micro mb-5 text-[#77787b]">Ready when you are</div>
            <h2 className="display-face max-w-2xl text-5xl font-bold leading-[.92] md:text-7xl">
              Make every handoff
              <br />
              feel intentional.
            </h2>
          </div>
          <Link
            data-testid="footer-cta-demo"
            href="/request-demo"
            className="button-black inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-3.5 text-sm font-semibold"
          >
            Request a demo <ArrowRight size={16} />
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function RootRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(getStoredSessionId() ? "/app/tower" : "/login");
  }, [setLocation]);
  return (
    <div className="grid min-h-screen place-items-center text-sm text-[#77787b]">
      Redirecting…
    </div>
  );
}

function MarketingPage({
  type,
}: {
  type: "platform" | "how" | "channels" | "security" | "about";
}) {
  const configs = {
    platform: {
      eyebrow: "Platform",
      title: "One operating picture, built for five different days.",
      body: "IntelliFleet gives each role a focused surface while keeping every operational event connected.",
      image:
        "https://images.pexels.com/photos/6169056/pexels-photo-6169056.jpeg?auto=compress&cs=tinysrgb&w=1800",
    },
    how: {
      eyebrow: "How it works",
      title: "From assignment to proof of delivery.",
      body: "The workflow is simple by design. Each handoff adds context instead of another place to look.",
      image:
        "https://images.pexels.com/photos/4481327/pexels-photo-4481327.jpeg?auto=compress&cs=tinysrgb&w=1800",
    },
    channels: {
      eyebrow: "Channels",
      title: "The message should reach the person, not the inbox.",
      body: "A connected channel layer for driver acknowledgements, customer ETAs, and critical escalations — with provider status kept honest.",
      image:
        "https://images.pexels.com/photos/7706458/pexels-photo-7706458.jpeg?auto=compress&cs=tinysrgb&w=1800",
    },
    security: {
      eyebrow: "Security",
      title: "Trust is an operating feature.",
      body: "Role-aware access, tenant-scoped work, and audit-ready histories make accountability part of the product.",
      image:
        "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1800",
    },
    about: {
      eyebrow: "About RGF",
      title: "Built around the realities of moving food.",
      body: "Rare Global Food Trading Corp. works across the details that make cold-chain logistics different: timing, temperature, and trust.",
      image:
        "https://images.pexels.com/photos/257636/pexels-photo-257636.jpeg?auto=compress&cs=tinysrgb&w=1800",
    },
  }[type];
  const [openChannel, setOpenChannel] = useState<string | null>(null);
  const channels = [
    [
      "WhatsApp",
      "Driver acknowledgements, customer ETA messages, and fallback routing.",
    ],
    [
      "Viber",
      "A planned channel surface for the conversations teams already use.",
    ],
    ["SMS", "A resilient fallback when a richer channel is unavailable."],
    [
      "Voice AI",
      "A planned hands-free path for status updates and escalation.",
    ],
  ];
  const steps = [
    [
      "01",
      "Assignment",
      "A dispatcher assigns a route, cargo, and a clear next step.",
    ],
    [
      "02",
      "ETA + exception",
      "The network watches movement and surfaces drift, temperature, or inventory issues.",
    ],
    [
      "03",
      "Delivery",
      "The driver confirms the stop. The customer sees the same milestone.",
    ],
    [
      "04",
      "Cold-chain proof",
      "Temperature and outcome become part of the order history.",
    ],
  ];
  return (
    <div>
      <PublicNav />
      <main className="mx-auto max-w-[1440px] px-5 pb-24 pt-10 md:px-10 md:pt-16">
        <div className="grid items-end gap-10 border-b border-[#e4e3df] pb-14 md:grid-cols-[.9fr_1.1fr] md:pb-20">
          <div className="entrance">
            <div className="micro mb-5 text-[#77787b]">{configs.eyebrow}</div>
            <h1 className="display-face max-w-3xl text-5xl font-bold leading-[.92] md:text-7xl">
              {configs.title}
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-7 text-[#55565a]">
              {configs.body}
            </p>
          </div>
          <img
            className="entrance entrance-2 h-[300px] w-full object-cover md:h-[430px]"
            src={configs.image}
            alt={configs.title}
          />
        </div>
        {type === "platform" && (
          <div className="mt-16 grid gap-px border border-[#e4e3df] bg-[#e4e3df] md:grid-cols-2">
            {Object.entries(roleStories).map(([key, val]) => (
              <div className="bg-white p-7 md:p-10" key={key}>
                <div className="micro text-[#77787b]">{val.eyebrow}</div>
                <h2 className="display-face mt-14 text-3xl font-bold">
                  {val.title}
                </h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-[#55565a]">
                  {val.body}
                </p>
                <ul className="mt-7 grid gap-3 text-sm">
                  {val.bullets.map((b) => (
                    <li className="flex items-center gap-3" key={b}>
                      <Check size={15} />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {type === "how" && (
          <div className="route-flow mt-16 grid gap-5 md:grid-cols-4">
            {steps.map(([num, title, body]) => (
              <div
                className="route-step border border-[#e4e3df] bg-white p-6"
                key={num}
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-black text-xs font-bold text-white">
                  {num}
                </div>
                <h2 className="display-face mt-12 text-2xl font-bold">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#55565a]">{body}</p>
              </div>
            ))}
          </div>
        )}
        {type === "channels" && (
          <div className="mt-16 grid gap-3 md:grid-cols-2">
            {channels.map(([name, body]) => (
              <div className="border border-[#e4e3df] bg-white" key={name}>
                <button
                  data-testid={`button-channel-${name.toLowerCase().replace(" ", "-")}`}
                  onClick={() =>
                    setOpenChannel(openChannel === name ? null : name)
                  }
                  className="flex w-full items-center justify-between p-6 text-left"
                >
                  <span>
                    <span className="micro block text-[#77787b]">Channel</span>
                    <span className="mt-3 block text-2xl font-semibold">
                      {name}
                    </span>
                  </span>
                  <ChevronDown
                    className={cx(
                      "transition-transform",
                      openChannel === name && "rotate-180",
                    )}
                    size={19}
                  />
                </button>
                {openChannel === name && (
                  <div className="border-t border-[#e4e3df] px-6 pb-6 pt-4 text-sm leading-6 text-[#55565a]">
                    <div className="mb-3">
                      <StatusChip status="Planned capability" tone="neutral" />
                    </div>
                    {body}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {type === "security" && (
          <div className="mt-16 grid gap-10 md:grid-cols-[.75fr_1.25fr]">
            <div>
              <div className="micro text-[#77787b]">The trust model</div>
              <p className="mt-5 text-2xl font-semibold leading-8">
                Control should be visible, not assumed.
              </p>
            </div>
            <div className="grid divide-y divide-[#e4e3df] border-y border-[#e4e3df]">
              {[
                [
                  "Role-based access",
                  "Dispatchers, drivers, warehouse managers, customers, and admins each see the work appropriate to their role.",
                ],
                [
                  "Tenant scoping",
                  "Data access follows the organization and operational context behind each account.",
                ],
                [
                  "Audit logging",
                  "Status changes, acknowledgements, and access events leave an append-only trail.",
                ],
                [
                  "Credential handling",
                  "Provider credentials stay out of the client surface. This frontend uses mocked integration states only.",
                ],
              ].map(([title, body]) => (
                <div className="py-6" key={title}>
                  <h2 className="font-semibold">{title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#55565a]">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {type === "about" && (
          <div className="mt-16 grid gap-10 md:grid-cols-3">
            <div className="border-t-2 border-black pt-4">
              <div className="micro">The context</div>
              <p className="mt-5 text-xl font-semibold leading-7">
                Cold chain is a promise made in motion.
              </p>
            </div>
            <div className="md:col-span-2 grid gap-5 text-base leading-7 text-[#55565a]">
              <p>
                Rare Global Food Trading Corp. brings together sourcing,
                trading, and distribution with a close eye on the moments where
                quality can be won or lost.
              </p>
              <p>
                IntelliFleet is the operational expression of that care: a
                shared picture of the vehicle, the order, the temperature, and
                the person responsible for the next handoff.
              </p>
            </div>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

function RequestDemo() {
  const [sent, setSent] = useState(false);
  if (sent)
    return (
      <div>
        <PublicNav />
        <main className="mx-auto flex min-h-[65vh] max-w-[1440px] flex-col justify-center px-5 py-16 md:px-10">
          <div className="max-w-xl entrance">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-black text-white">
              <Check size={23} />
            </div>
            <div className="micro mt-8 text-[#77787b]">Request received</div>
            <h1 className="display-face mt-4 text-5xl font-bold leading-none md:text-7xl">
              We’ll bring the
              <br />
              operating picture.
            </h1>
            <p className="mt-6 text-base leading-7 text-[#55565a]">
              Thanks for your interest in IntelliFleet. This demo form is mocked
              for the frontend build; a member of the RGF team would follow up
              here in production.
            </p>
            <Link
              data-testid="success-back-home"
              href="/"
              className="button-black mt-8 inline-flex rounded-full px-5 py-3 text-sm font-semibold"
            >
              Back to IntelliFleet
            </Link>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  return (
    <div>
      <PublicNav />
      <main className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-24 pt-12 md:grid-cols-[.85fr_1.15fr] md:px-10 md:pt-20">
        <div>
          <div className="micro mb-5 text-[#77787b]">Request a demo</div>
          <h1 className="display-face text-5xl font-bold leading-[.92] md:text-7xl">
            See the next
            <br />
            mile clearly.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[#55565a]">
            Tell us a little about your operation. We’ll shape the conversation
            around your routes, teams, and cold-chain reality.
          </p>
        </div>
        <form
          className="grid gap-5 border-t border-[#e4e3df] pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Name
              <input
                data-testid="input-demo-name"
                required
                className="border border-[#d8d7d2] bg-white px-3 py-3 font-normal outline-none focus:border-black"
                placeholder="Your name"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Company
              <input
                data-testid="input-demo-company"
                required
                className="border border-[#d8d7d2] bg-white px-3 py-3 font-normal outline-none focus:border-black"
                placeholder="Rare Global Food Trading Corp."
              />
            </label>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Role
              <select
                data-testid="select-demo-role"
                className="border border-[#d8d7d2] bg-white px-3 py-3 font-normal outline-none focus:border-black"
              >
                <option>Dispatcher / Ops Manager</option>
                <option>Warehouse Manager</option>
                <option>Fleet Owner</option>
                <option>Customer / Client</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Fleet size
              <select
                data-testid="select-demo-fleet"
                className="border border-[#d8d7d2] bg-white px-3 py-3 font-normal outline-none focus:border-black"
              >
                <option>1–20 vehicles</option>
                <option>21–50 vehicles</option>
                <option>51–200 vehicles</option>
                <option>201+ vehicles</option>
              </select>
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            What should we understand first?
            <textarea
              data-testid="input-demo-message"
              required
              rows={5}
              className="resize-none border border-[#d8d7d2] bg-white px-3 py-3 font-normal outline-none focus:border-black"
              placeholder="A route, an exception, a team handoff…"
            />
          </label>
          <Button type="submit" className="w-fit px-6">
            Send request <ArrowRight size={16} />
          </Button>
        </form>
      </main>
      <PublicFooter />
    </div>
  );
}

function RoleSwitcher({ role }: { role: string }) {
  const [, setLocation] = useLocation();
  const initialRole = (Object.keys(rolePaths).find((key) => key.toLowerCase() === role.toLowerCase()) || "Dispatcher") as Role;
  const [view, setView] = useState<Role>(initialRole);
  const choose = (next: Role) => {
    setView(next);
    localStorage.setItem("if-role", next);
    setLocation(rolePaths[next]);
  };
  return (
    <select
      data-testid="select-role-switcher"
      value={view}
      onChange={(e) => choose(e.target.value as Role)}
      className="hidden border border-[#d8d7d2] bg-white px-2 py-2 text-xs font-semibold outline-none md:block"
    >
      <option>Dispatcher</option>
      <option>Planner</option>
      <option>Driver</option>
      <option>Warehouse</option>
      <option>Client</option>
      <option>Admin</option>
    </select>
  );
}
function Login() {
  const [, setLocation] = useLocation();
  const [role, setRole] = useState<Role>("Dispatcher");
  const [email, setEmail] = useState("dispatcher@rgf.com");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    if (!isSigningIn) return;
    let dots = 3;
    const timer = window.setInterval(() => {
      dots = dots === 3 ? 0 : dots + 1;
      setAuthError(`Signing in${".".repeat(dots)}`);
    }, 400);
    return () => window.clearInterval(timer);
  }, [isSigningIn]);
  const routeForRole = (userRole: string) => {
    const roleKey = (Object.keys(rolePaths).find((key) => key.toLowerCase() === userRole.toLowerCase()) || "Dispatcher") as Role;
    setLocation(rolePaths[roleKey]);
  };
  useEffect(() => {
    // If a session is already stored (and still valid), skip the form.
    if (!getStoredSessionId()) {
      setCheckingSession(false);
      return;
    }
    authApi
      .getSession()
      .then((res) => routeForRole(res.user.role))
      .catch(() => {
        clearStoredSessionId();
        setCheckingSession(false);
      });
  }, []);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSigningIn) return;
    setAuthError("Signing in...");
    setIsSigningIn(true);
    try {
      const result = await authApi.login(email, password);
      setStoredSessionId(result.token);
      routeForRole(result.user.role);
    } catch (error) {
      setAuthError(
        error instanceof ApiError && error.status === 401
          ? "Invalid email or password."
          : "Unable to reach the sign-in service. Start the backend and try again.",
      );
    } finally {
      setIsSigningIn(false);
    }
  };
  if (checkingSession)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f2f2ef] text-sm text-[#77787b]">
        Checking session…
      </div>
    );
  return (
    <div className="min-h-[100dvh] min-w-0 overflow-x-hidden bg-[#f2f2ef]">
      <div className="grid min-h-[100dvh] min-w-0 md:grid-cols-2">
        <div className="flex min-w-0 max-w-full flex-col px-6 py-7 md:px-14 md:py-10">
          <Logo />
          <div className="m-auto w-full min-w-0 max-w-[410px] py-12">
            <div className="micro text-[#77787b]">Workspace access</div>
            <h1 className="display-face mt-4 text-4xl font-bold leading-none md:text-5xl">
              Welcome back
              <br />
              to the network.
            </h1>
            <p className="mt-5 text-sm leading-6 text-[#55565a]">
              Sign in to see the work that keeps every handoff on time.
            </p>
            {authError && (
              <p
                data-testid="text-auth-notice"
                className="mt-3 text-xs text-[#c4291f]"
              >
                {authError}
              </p>
            )}
            <form className="mt-9 grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-semibold">
                Work email
                <input
                  data-testid="input-login-email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border border-[#d8d7d2] bg-white px-3 py-3 outline-none focus:border-black"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Password
                <input
                  data-testid="input-login-password"
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border border-[#d8d7d2] bg-white px-3 py-3 outline-none focus:border-black"
                />
              </label>
              <Button type="submit" className="mt-2 w-full">
                Continue <ArrowRight size={16} />
              </Button>
            </form>
            <div className="mt-8 border-t border-[#d9d8d3] pt-5">
              <div className="micro mb-3 text-[#a16819]">
                Role-based access
              </div>
              <div className="grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-6">
                {(
                  [
                    "Dispatcher",
                    "Planner",
                    "Driver",
                    "Warehouse",
                    "Client",
                    "Admin",
                  ] as Role[]
                ).map((item) => (
                  <button
                    data-testid={`button-preview-${item.toLowerCase()}`}
                    key={item}
                    type="button"
                    onClick={() => {
                      setRole(item);
                      // Roles that have a shared work account pre-fill its email.
                      if (["Dispatcher", "Planner", "Admin"].includes(item)) setEmail(`${item.toLowerCase()}@rgf.com`);
                    }}
                    className={cx(
                      "min-w-0 max-w-full truncate border px-2 py-2 text-xs font-semibold",
                      role === item
                        ? "border-black bg-black text-white"
                        : "border-[#d8d7d2] bg-white hover:border-black",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="text-xs text-[#77787b]">
            Rare Global Food Trading Corp. · IntelliFleet
          </div>
        </div>
        <div className="relative hidden min-w-0 overflow-hidden md:block">
          <img
            className="absolute inset-0 h-full w-full object-cover"
            src="https://images.pexels.com/photos/7464230/pexels-photo-7464230.jpeg?auto=compress&cs=tinysrgb&w=1800"
            alt="Driver preparing a delivery"
          />
          <div className="absolute inset-0 bg-black/25" />
          <div className="absolute bottom-10 left-10 max-w-sm text-white">
            <div className="micro text-white/70">
              A shared operating picture
            </div>
            <p className="display-face mt-4 text-4xl font-bold leading-none">
              Good logistics feels quiet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LivePhtClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = ["hour", "minute", "second"]
    .map((type) => parts.find((part) => part.type === type)?.value ?? "00")
    .join(":");
  return <span className="mono ml-2 text-[10px]">{value} PHT</span>;
}

function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<authApi.ApiUser | null>(null);
  const currentRole = currentUser?.role?.toLowerCase() || "dispatcher";
  const isAdmin = currentRole === "admin";
  const roleLabel = isAdmin ? "Admin" : currentRole === "planner" ? "Planner" : "Dispatcher";
  const roleInitial = roleLabel.charAt(0);
  const doLogout = async () => {
    if (getStoredSessionId()) {
      try {
        await authApi.logout();
      } catch {
        /* best-effort - clear local state regardless */
      }
    }
    clearStoredSessionId();
    setLocation("/login");
  };
  const submitPasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage("");
    if (newPassword.length < 8) {
      setPasswordMessage("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("New passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated successfully.");
    } catch (error) {
      setPasswordMessage(error instanceof ApiError ? error.message : "Unable to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };
  useEffect(() => {
    let active = true;
    const token = getStoredSessionId();
    if (!token) {
      setLocation("/login");
      return () => {
        active = false;
      };
    }
    authApi
      .getSession()
      .then(({ user }) => setCurrentUser(user))
      .catch(() => {
        clearStoredSessionId();
        if (active) setLocation("/login");
      })
      .finally(() => {
        if (active) setCheckingAuth(false);
      });
    return () => {
      active = false;
    };
  }, [setLocation]);
  useEffect(() => {
    if (!checkingAuth && currentUser && !isAdmin && location.startsWith("/admin")) {
      setLocation("/app/tower");
    }
  }, [checkingAuth, currentUser, isAdmin, location, setLocation]);
  useEffect(() => {
    if (!getStoredSessionId()) return;
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          clearStoredSessionId();
          setLocation("/login");
        },
        5 * 60 * 1000,
      );
    };
    const events = [
      "pointerdown",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
    ];
    events.forEach((event) =>
      window.addEventListener(event, reset, { passive: true }),
    );
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [setLocation]);
  const [alerts, setAlerts] = useState(alertsSeed);
  const links = navGroups.flatMap((g) => g.items);
  if (checkingAuth)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#fafaf8] text-sm text-[#77787b]">
        Checking session...
      </div>
    );
  return (
    <div className="noise flex min-h-[100dvh] bg-[#fafaf8]">
      <aside className="app-sidebar hidden border-r border-[#e4e3df] bg-white lg:block">
        <div className="sticky top-0 flex h-[100dvh] flex-col">
          <div className="border-b border-[#e4e3df] p-5">
            <Logo />
            <div className="sidebar-company mt-4 flex items-center gap-2 text-xs text-[#77787b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1e7b44]" />
              RGF operations
            </div>
          </div>
          <nav className="thin-scroll flex-1 overflow-y-auto p-3">
            {navGroups.map((group) => (
              <div className="mb-6" key={group.label}>
                <div className="sidebar-section-label micro mb-2 px-3 text-[#999]">
                  {group.label}
                </div>
                {group.items.map(([href, label, Icon]) => (
                  <Link
                    data-testid={`nav-${String(label).toLowerCase().replaceAll(" ", "-")}`}
                    href={href as string}
                    key={href as string}
                    className={cx(
                      "sidebar-link mb-1 flex items-center gap-3 rounded-[4px] px-3 py-2.5 text-sm font-semibold",
                      location === href && "active",
                    )}
                  >
                    <Icon size={16} />
                    <span className="sidebar-copy">{label as string}</span>
                    {label === "Alerts" && (
                      <span className="sidebar-copy ml-auto rounded-full bg-[#fbeceb] px-1.5 py-0.5 text-[10px] text-[#c4291f]">
                        3
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
            <div className="sidebar-section-label micro mb-2 px-3 text-[#999]">
              Workspace
            </div>
            {isAdmin && [
              ["/admin/users", "Admin", Settings],
            ].map(([href, label, Icon]) => (
              <Link
                data-testid={`nav-${String(label).toLowerCase()}`}
                href={href as string}
                key={href as string}
                className={cx(
                  "sidebar-link mb-1 flex items-center gap-3 rounded-[4px] px-3 py-2.5 text-sm font-semibold",
                  location.startsWith(href as string) && "active",
                )}
              >
                <Icon size={16} />
                <span className="sidebar-copy">{label as string}</span>
              </Link>
            ))}
          </nav>
          <div className="border-t border-[#e4e3df] p-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => { setProfileOpen(true); setPasswordMessage(""); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setProfileOpen(true); }}
              className="sidebar-link flex w-full items-center gap-3 rounded-[4px] p-2.5 text-left"
            >
              {isAdmin ? <img src={rishiProfilePhoto} alt="Rishi" className="h-12 w-12 shrink-0 rounded-full object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-black text-sm font-bold text-white">{roleInitial}</span>}
              <div className="sidebar-copy min-w-0">
                <div className="truncate text-xs font-semibold">
                  {isAdmin ? "Rishi" : roleLabel}
                </div>
                <div className="truncate text-[11px] text-[#77787b]">
                  {isAdmin ? "Operations admin" : "Operations access"}
                </div>
              </div>
              <button
                data-testid="sidebar-button-logout"
                onClick={doLogout}
                title="Log out"
                className="sidebar-copy ml-auto"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
        </div>
        {false && profileOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={() => setProfileOpen(false)}>
            <section className="w-full max-w-md bg-[#fafaf8] p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 border-b border-[#e4e3df] pb-4">
                <div className="flex items-center gap-3">
                  <img src={rishiProfilePhoto} alt="Rishi" className="h-12 w-12 rounded-full object-cover" />
                  <div>
                    <div className="text-lg font-semibold">Rishi</div>
                    <div className="text-xs text-[#77787b]">Software Architect · Rare Global Food Trading Corp.</div>
                    <div className="mt-1 text-xs font-semibold text-[#1e7b44]">Administrator · Full operational access</div>
                  </div>
                </div>
                <button type="button" onClick={() => setProfileOpen(false)} className="text-xl text-[#77787b]" aria-label="Close profile">×</button>
              </div>
              <div className="mt-5 grid gap-2 text-sm">
                <div><span className="text-[#77787b]">Email:</span> rishi@rareglobalfood.com</div>
                <div><span className="text-[#77787b]">Role:</span> Admin</div>
              </div>
              <form onSubmit={submitPasswordChange} className="mt-6 grid gap-3 border-t border-[#e4e3df] pt-5">
                <div className="micro text-[#77787b]">Change password</div>
                <input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className="border border-[#d8d7d2] bg-white px-3 py-2.5 outline-none focus:border-black" />
                <input required minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (8+ characters)" className="border border-[#d8d7d2] bg-white px-3 py-2.5 outline-none focus:border-black" />
                <input required minLength={8} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="border border-[#d8d7d2] bg-white px-3 py-2.5 outline-none focus:border-black" />
                {passwordMessage && <p className={cx("text-xs", passwordMessage.includes("successfully") ? "text-[#1e7b44]" : "text-[#c4291f]")}>{passwordMessage}</p>}
                <Button type="submit" disabled={passwordSaving} className="w-full">{passwordSaving ? "Updating…" : "Update password"}</Button>
              </form>
            </section>
          </div>
        )}
      </aside>
      {profileOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4" onMouseDown={() => setProfileOpen(false)}>
          <section className="w-full max-w-md bg-[#fafaf8] p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-[#e4e3df] pb-4">
              <div className="flex items-center gap-3">
                {isAdmin ? <img src={rishiProfilePhoto} alt="Rishi" className="h-12 w-12 rounded-full object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-black text-sm font-bold text-white">{roleInitial}</span>}
                <div>
                  <div className="text-lg font-semibold">{currentUser?.fullName || roleLabel}</div>
                  <div className="text-xs text-[#77787b]">Software Architect · Rare Global Food Trading Corp.</div>
                  <div className="mt-1 text-xs font-semibold text-[#1e7b44]">{isAdmin ? "Administrator · Full operational access" : `${roleLabel} · Operations access`}</div>
                </div>
              </div>
              <button type="button" onClick={() => setProfileOpen(false)} className="text-xl text-[#77787b]" aria-label="Close profile">×</button>
            </div>
            <div className="mt-5 grid gap-2 text-sm">
              <div><span className="text-[#77787b]">Email:</span> {currentUser?.email || "—"}</div>
              <div><span className="text-[#77787b]">Role:</span> {roleLabel}</div>
            </div>
            {isAdmin && <form onSubmit={submitPasswordChange} className="mt-6 grid gap-3 border-t border-[#e4e3df] pt-5">
              <div className="micro text-[#77787b]">Change password</div>
              <input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className="border border-[#d8d7d2] bg-white px-3 py-2.5 outline-none focus:border-black" />
              <input required minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (8+ characters)" className="border border-[#d8d7d2] bg-white px-3 py-2.5 outline-none focus:border-black" />
              <input required minLength={8} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="border border-[#d8d7d2] bg-white px-3 py-2.5 outline-none focus:border-black" />
              {passwordMessage && <p className={cx("text-xs", passwordMessage.includes("successfully") ? "text-[#1e7b44]" : "text-[#c4291f]")}>{passwordMessage}</p>}
              <Button type="submit" disabled={passwordSaving} className="w-full">{passwordSaving ? "Updating…" : "Update password"}</Button>
            </form>}
          </section>
        </div>
      )}
      <div className="app-content flex min-h-[100dvh] flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e4e3df] bg-[#fafaf8]/95 px-4 backdrop-blur md:px-7">
          <div className="flex items-center gap-3">
            <button
              data-testid="button-mobile-menu"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded p-2 hover:bg-[#efefed] lg:hidden"
            >
              <Menu size={19} />
            </button>
            <div className="hidden items-center gap-2 text-sm text-[#77787b] md:flex">
              <Command size={15} />
              <span>Search orders, vehicles, drivers</span>
              <kbd className="ml-2 border border-[#d8d7d2] bg-white px-1.5 py-0.5 text-[10px]">
                ⌘ K
              </kbd>
            </div>
            <div className="md:hidden">{title || "IntelliFleet"}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-[#77787b] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1e7b44] live-dot" />
              <span>Live feed</span>
              <LivePhtClock />
            </div>
            {isAdmin && <RoleSwitcher role="Admin" />}
            <button
              data-testid="button-logout"
              onClick={doLogout}
              title="Log out"
              className="flex items-center gap-2 rounded border border-[#d8d7d2] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#efefed]"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
            <button
              type="button"
              onClick={() => { setProfileOpen(true); setPasswordMessage(""); }}
              title="Open profile"
              className={cx(
                "shrink-0 overflow-hidden border border-[#d8d7d2] bg-white",
                isAdmin
                  ? "h-12 w-12 rounded-full"
                  : "flex h-10 items-center gap-2 rounded-[4px] px-2.5 text-xs font-semibold",
              )}
            >
              {isAdmin ? <img src={rishiProfilePhoto} alt="Rishi" className="h-full w-full object-cover" /> : <><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black text-xs font-bold text-white">{roleInitial}</span><span>{roleLabel}</span></>}
            </button>
          </div>
        </header>
        {mobileOpen && (
          <div className="absolute left-0 right-0 top-[68px] z-30 border-b border-[#e4e3df] bg-white p-3 lg:hidden">
            <div className="grid gap-1">
              {links.map(([href, label, Icon]) => (
                <Link
                  data-testid={`mobile-nav-${String(label).toLowerCase().replaceAll(" ", "-")}`}
                  href={href as string}
                  key={href as string}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 p-3 text-sm font-semibold"
                >
                  <Icon size={16} />
                  {label as string}
                </Link>
              ))}
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-7">{children}</main>
        <nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-20 h-[64px] items-center justify-around border-t border-[#e4e3df] bg-white">
          <Link
            data-testid="mobile-bottom-tower"
            href="/app/tower"
            className="grid justify-items-center gap-1 text-[10px]"
          >
            <LayoutDashboard size={18} />
            <span>Tower</span>
          </Link>
          <Link
            data-testid="mobile-bottom-orders"
            href="/app/orders"
            className="grid justify-items-center gap-1 text-[10px]"
          >
            <ClipboardCheck size={18} />
            <span>Orders</span>
          </Link>
          <Link
            data-testid="mobile-bottom-fleet"
            href="/app/fleet"
            className="grid justify-items-center gap-1 text-[10px]"
          >
            <Truck size={18} />
            <span>Fleet</span>
          </Link>
          <Link
            data-testid="mobile-bottom-reports"
            href="/app/reports"
            className="grid justify-items-center gap-1 text-[10px]"
          >
            <BarChart3 size={18} />
            <span>Reports</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

function MockMap({
  selected,
  onSelect,
  points: livePoints,
}: {
  selected?: string;
  onSelect?: (v: Vehicle) => void;
  points?: Vehicle[];
}) {
  const [points, setPoints] = useState(livePoints ?? mockMapPoints);
  // Only jitter-animate when no real position data was passed in - real
  // vehicle positions come from POST /vehicles/:id/position ticks, not a
  // client-side simulation.
  useEffect(() => {
    if (livePoints) {
      setPoints(livePoints);
      return;
    }
    const id = window.setInterval(
      () =>
        setPoints((items) =>
          items.map((v, i) => ({
            ...v,
            x: Math.max(10, Math.min(90, v.x + (i % 2 ? -0.7 : 0.55))),
            y: Math.max(12, Math.min(88, v.y + (i % 3 ? -0.35 : 0.3))),
          })),
        ),
      2400,
    );
    return () => window.clearInterval(id);
  }, [livePoints]);
  return (
    <div className="paper-grid relative h-full min-h-[480px] overflow-hidden bg-[#f5f5f2]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path
          d="M20 18 C29 13, 37 18, 44 23 S62 22, 71 30 S68 44, 78 50 S74 67, 85 78 S72 92, 59 82 S46 88, 36 74 S23 70, 26 56 S12 49, 20 39 S12 25,20 18Z"
          fill="#e5e4df"
          stroke="#c6c5c0"
          strokeWidth=".35"
        />
        <path
          d="M26 56 C35 47,45 47,54 57 S65 69,77 76"
          fill="none"
          stroke="#b8b7b1"
          strokeWidth=".45"
          className="route-line"
        />
        <path
          d="M20 38 C32 36,40 30,53 27 S65 31,73 43"
          fill="none"
          stroke="#b8b7b1"
          strokeWidth=".45"
          className="route-line"
        />
        <path
          d="M45 25 C48 34,42 43,51 55 S48 70,59 81"
          fill="none"
          stroke="#c6c5c0"
          strokeWidth=".35"
          className="route-line"
        />
      </svg>
      <div className="absolute left-[14%] top-[13%] text-[9px] uppercase tracking-widest text-[#9a9994]">
        Luzon
      </div>
      <div className="absolute left-[53%] top-[54%] text-[9px] uppercase tracking-widest text-[#9a9994]">
        Visayas
      </div>
      <div className="absolute left-[69%] top-[82%] text-[9px] uppercase tracking-widest text-[#9a9994]">
        Mindanao
      </div>
      {points.map((v) => (
        <button
          data-testid={`map-marker-${v.id}`}
          onClick={() => onSelect?.(v)}
          key={v.id}
          className="map-marker absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${v.x}%`, top: `${v.y}%` }}
        >
          <span
            className={cx(
              "block h-3 w-3 rounded-full border-2 border-white shadow-[0_0_0_1px_#777]",
              v.status === "Temperature" || v.status === "Route drift"
                ? "bg-[#c4291f]"
                : v.status === "On time"
                  ? "bg-[#1e7b44]"
                  : "bg-[#0b0b0b]",
            )}
          />
          <span
            className={cx(
              "absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap bg-white/85 px-1 text-[9px] font-semibold",
              selected === v.id
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100",
            )}
          >
            {v.id}
          </span>
        </button>
      ))}
    </div>
  );
}

interface RouteWithStops {
  route: import("@/services/api/routes").ApiRoute;
  stops: import("@/services/api/routes").ApiRouteStop[];
}

export interface ProposedRouteForMap {
  vehicleId: string;
  stops: { lat: number; lng: number }[];
}

function FleetOptimizationModal({
  onClose,
  onApply,
  onPreviewReady,
  routesWithStops,
  applying,
  applyError,
}: {
  onClose: () => void;
  onApply: (runId: string) => void;
  onPreviewReady: (routes: ProposedRouteForMap[] | null) => void;
  routesWithStops: RouteWithStops[];
  applying: boolean;
  applyError: string | null;
}) {
  const { data: warehouses = [] } = useQuery({
    queryKey: ["route-warehouses"],
    queryFn: routesApi.listRouteWarehouses,
  });
  const [returnToWarehouse, setReturnToWarehouse] = useState(true);
  const [returnWarehouseId, setReturnWarehouseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] =
    useState<routesApi.OptimizeFleetPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = () => {
    if (returnWarehouseMissing(returnToWarehouse, returnWarehouseId)) {
      setError(`${RETURN_WAREHOUSE_HINT} (or untick Return to warehouse).`);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    routesApi
      .previewFleetOptimization(undefined, "initial", undefined, { returnToWarehouse, returnWarehouseId })
      .then((res) => {
        setResult(res);
        setLoading(false);
        if (res.feasible && res.routes) {
          onPreviewReady(
            res.routes.map((r) => ({
              vehicleId: r.vehicle_id,
              stops: (r.stops || [])
                .filter((s) => s.lat != null && s.lng != null)
                .map((s) => ({ lat: s.lat as number, lng: s.lng as number })),
            })),
          );
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to preview optimization");
        setLoading(false);
      });
  };
  useEffect(() => {
    return () => onPreviewReady(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Baseline "current plan" totals, computed from the already-loaded real route data (never
  // invented) so the dispatcher sees a genuine before/after comparison, not just the proposed
  // side alone.
  const currentDistanceKm = routesWithStops.reduce(
    (sum, r) => sum + (r.route.distance_km || 0),
    0,
  );
  const currentDurationMin = routesWithStops.reduce(
    (sum, r) => sum + (r.route.duration_min || 0),
    0,
  );
  const distanceDelta = result?.feasible
    ? currentDistanceKm - (result.totalDistanceKm || 0)
    : 0;
  const durationDelta = result?.feasible
    ? currentDurationMin - (result.totalDurationMin || 0)
    : 0;
  const totalAtRisk =
    result?.routes?.reduce((sum, r) => sum + (r.at_risk_count || 0), 0) || 0;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden border border-[#e4e3df] bg-white shadow-2xl"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e4e3df] p-5">
          <div>
            <div className="micro text-[#77787b]">Fleet Intelligence</div>
            <h2 className="text-xl font-bold">Fleet Optimization Run</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[#efeeeb]">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-[#fafaf8] p-6">
          <div className="mb-4 border border-[#e4e3df] bg-white p-4 text-sm">
            <ReturnWarehousePicker
              name="fleet-return-warehouse"
              warehouses={warehouses}
              returnToWarehouse={returnToWarehouse}
              returnWarehouseId={returnWarehouseId}
              onToggle={(checked) => { setReturnToWarehouse(checked); setResult(null); }}
              onSelect={(id) => { setReturnWarehouseId(id); setResult(null); }}
            />
            <Button type="button" onClick={runPreview} disabled={loading || returnWarehouseMissing(returnToWarehouse, returnWarehouseId)} className="mt-4 rounded-[4px]">
              {loading ? "Optimizing..." : returnToWarehouse ? "Optimize with return leg" : "Optimize (one-way)"} <Activity size={15} />
            </Button>
          </div>
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-[#77787b]">
              <RefreshCw className="mb-4 animate-spin" size={24} />
              Loading fleet and deliveries, validating locations, calculating
              road travel times, optimizing vehicle assignments...
            </div>
          )}
          {error && (
            <div className="border border-[#c4291f] bg-[#fbeceb] p-4 text-sm text-[#c4291f]">
              {error}
            </div>
          )}
          {applyError && (
            <div className="mb-4 border border-[#c4291f] bg-[#fbeceb] p-4 text-sm text-[#c4291f]">
              <strong>Apply failed:</strong> {applyError}
            </div>
          )}
          {result && (
            <div className="grid gap-6">
              {!result.feasible ? (
                <div className="border border-[#a16819] bg-[#fffcf5] p-4 text-sm text-[#a16819]">
                  <strong>Optimization Infeasible:</strong> {result.message}
                </div>
              ) : (
                <>
                  {result.warnings && result.warnings.length > 0 && (
                    <div className="border border-[#a16819] bg-[#fffcf5] p-3 text-xs text-[#a16819]">
                      {result.warnings.map((w, i) => (
                        <div key={i}>âš  {w}</div>
                      ))}
                    </div>
                  )}
                  <div className="border border-[#e4e3df] bg-white">
                    <div className="border-b border-[#e4e3df] bg-[#f7f7f4] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#77787b]">
                      Current Plan vs Proposed Plan
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-[#efeeeb] text-center">
                      <div className="p-4">
                        <div className="micro text-[#77787b]">Current</div>
                        <div className="mt-2 text-xl font-bold">
                          {currentDistanceKm.toFixed(1)} km
                        </div>
                        <div className="text-xs text-[#77787b]">
                          {currentDurationMin.toFixed(0)} min
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="micro text-[#77787b]">Proposed</div>
                        <div className="mt-2 text-xl font-bold">
                          {result.totalDistanceKm?.toFixed(1) || "-"} km
                        </div>
                        <div className="text-xs text-[#77787b]">
                          {result.totalDurationMin?.toFixed(0) || "-"} min
                        </div>
                      </div>
                    </div>
                    {routesWithStops.length > 0 && (
                      <div className="border-t border-[#efeeeb] px-4 py-2 text-xs text-[#55565a]">
                        {distanceDelta >= 0
                          ? `Saves ${distanceDelta.toFixed(1)} km`
                          : `Adds ${Math.abs(distanceDelta).toFixed(1)} km`}{" "}
                        ·{" "}
                        {durationDelta >= 0
                          ? `saves ${durationDelta.toFixed(0)} min`
                          : `adds ${Math.abs(durationDelta).toFixed(0)} min`}{" "}
                        vs. currently active routes
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="border border-[#e4e3df] bg-white p-4">
                      <div className="micro text-[#77787b]">Routes Created</div>
                      <div className="mt-2 text-2xl font-bold">
                        {result.routes?.length || 0}
                      </div>
                    </div>
                    <div className="border border-[#e4e3df] bg-white p-4">
                      <div className="micro text-[#77787b]">At-Risk Stops</div>
                      <div
                        className={cx(
                          "mt-2 text-2xl font-bold",
                          totalAtRisk > 0 ? "text-[#a16819]" : "",
                        )}
                      >
                        {totalAtRisk}
                      </div>
                    </div>
                    <div className="border border-[#e4e3df] bg-white p-4 col-span-2">
                      <div className="micro text-[#77787b]">Run ID</div>
                      <div
                        className="mono mt-3 truncate text-sm"
                        title={result.runId}
                      >
                        {result.runId}
                      </div>
                    </div>
                  </div>
                  <div className="border border-[#e4e3df] bg-white">
                    <div className="border-b border-[#e4e3df] bg-[#f7f7f4] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#77787b]">
                      Proposed Routes
                    </div>
                    <div className="divide-y divide-[#efeeeb]">
                      {result.routes?.map((r, i) => (
                        <div key={i} className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-semibold">
                                Vehicle {r.vehicle_id}
                              </div>
                              <div className="mt-1 text-xs text-[#77787b]">
                                {r.stops?.length || 0} stops ·{" "}
                                {r.total_distance_km?.toFixed(1) || "-"} km ·{" "}
                                {r.total_duration_min?.toFixed(0) || "-"} min
                                {r.at_risk_count > 0
                                  ? ` · ${r.at_risk_count} at risk`
                                  : ""}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="max-w-[300px] truncate text-xs text-[#55565a]">
                                {r.stops
                                  ?.map((s) => s.location_name)
                                  .join(" → ")}
                              </div>
                            </div>
                          </div>
                          {r.stops && r.stops.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {r.stops.map((s, si) => (
                                <span
                                  key={si}
                                  className={cx(
                                    "border px-2 py-0.5 text-[10px]",
                                    (s.slack_min ?? 999) < 15
                                      ? "border-[#a16819] text-[#a16819]"
                                      : "border-[#e4e3df] text-[#77787b]",
                                  )}
                                >
                                  {s.location_name}
                                  {s.eta
                                    ? ` · ETA ${new Date(s.eta.replace(" ", "T")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                    : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#e4e3df] bg-white p-4">
          <Button onClick={onClose} variant="outline" className="px-4 py-2">
            Cancel
          </Button>
          <Button
            onClick={() => result?.runId && onApply(result.runId)}
            disabled={!result?.feasible || !result?.runId || applying}
            className="bg-black px-4 py-2 text-white hover:bg-black/90"
          >
            {applying ? "Applying…" : "Apply Optimization"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Tower() {
  const [tab, setTab] = useState<"Fleet" | "Comms" | "Routes">(
    "Fleet",
  );
  const [selected, setSelected] = useState<UiVehicle | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>(
    undefined,
  );
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { data: vehicles } = useVehiclesData();
  const { data: alerts } = useAlertsData();
  const routesWithStops = useRoutesWithStops();
  const connected = useFleetSocketConnection();
  const qc = useQueryClient();
  const ackRemote = useAcknowledgeAlert();
  const acknowledge = (id: string) => {
    qc.setQueryData(["alerts"], (old: Alert[] | undefined) =>
      (old ?? alerts).map((x) =>
        x.id === id ? { ...x, status: "Acknowledged" } : x,
      ),
    );
    ackRemote(id);
  };
  const [routeOptimizeError, setRouteOptimizeError] = useState<string | null>(
    null,
  );
  const applyOptimization = async (routeId: string) => {
    setOptimizingId(routeId);
    setRouteOptimizeError(null);
    try {
      const result = await routesApi.optimizeRoute(routeId);
      if (!result.feasible) {
        setRouteOptimizeError(
          result.message || "No feasible sequence found for this route.",
        );
      }
    } catch (err: any) {
      setRouteOptimizeError(err?.message || "Failed to optimize this route.");
    }
    await qc.invalidateQueries({ queryKey: ["routes"] });
    await qc.invalidateQueries({ queryKey: ["route-stops", routeId] });
    setOptimizingId(null);
  };
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const [proposedRoutesForMap, setProposedRoutesForMap] = useState<
    ProposedRouteForMap[] | null
  >(null);
  const [applyingOptimization, setApplyingOptimization] = useState(false);
  const [applyOptimizationError, setApplyOptimizationError] = useState<
    string | null
  >(null);
  const handleApplyOptimization = async (runId: string) => {
    setApplyingOptimization(true);
    setApplyOptimizationError(null);
    try {
      const applied = await routesApi.applyFleetOptimization(runId);
      // Confirm the run's authoritative status rather than assuming success from the apply
      // call alone - also the one real call site for getOptimizationRun (see routes.ts).
      const confirmedRun = await routesApi.getOptimizationRun(runId);
      if (confirmedRun.status !== "applied") {
        throw new Error(
          `Optimization run status is '${confirmedRun.status}', expected 'applied'.`,
        );
      }
      setShowOptimizationModal(false);
      setProposedRoutesForMap(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["routes"] }),
        ...applied.routes.map((r) =>
          qc.invalidateQueries({ queryKey: ["route-stops", r.routeId] }),
        ),
      ]);
      await handleRefresh();
    } catch (err: any) {
      const message =
        err?.status === 409
          ? "This optimization is stale — operational data changed since it was generated. Close this and run Optimize Fleet again."
          : err?.message || "Failed to apply optimization.";
      setApplyOptimizationError(message);
    } finally {
      setApplyingOptimization(false);
    }
  };
  const staleFleet =
    vehicles.length > 0 &&
    vehicles.every((v) => isVehicleStale(v.lastUpdated ?? null));
  const openAlerts = alerts.filter((a) => a.status === "Open").length;
  const criticalAlerts = alerts.filter(
    (a) => a.status === "Open" && a.severity === "Critical",
  ).length;
  const warningAlerts = alerts.filter(
    (a) => a.status === "Open" && a.severity === "Warning",
  ).length;
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fleetApi.triggerFleetPoll(), fleetApi.refreshVehicles()]);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["vehicles"] }),
        qc.refetchQueries({ queryKey: ["alerts"] }),
        qc.refetchQueries({ queryKey: ["orders"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <AppShell title="Control Tower">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 entrance">
        <div>
          <div className="micro mb-2 text-[#77787b]">
            Operations / live view
          </div>
          <h1 className="display-face text-4xl font-bold leading-none">
            Control Tower
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="rounded-[4px] px-3 py-2"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh feed"}
          </Button>
          <Button
            onClick={() => setShowOptimizationModal(true)}
            variant="outline"
            className="rounded-[4px] px-3 py-2"
          >
            <Activity size={14} />
            Optimize Fleet
          </Button>
          <Button className="rounded-[4px] px-3 py-2">
            <Plus size={14} />
            New order
          </Button>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 border-y border-[#e4e3df] py-4 md:grid-cols-4">
        <Kpi
          label="Active vehicles"
          value={String(vehicles.length)}
          detail="Real Cartrack fleet"
          icon={Truck}
        />
        <Kpi
          label="Live connection"
          value={
            connected && !staleFleet
              ? "Connected"
              : staleFleet
                ? "Stale"
                : "Offline"
          }
          detail={
            connected && !staleFleet ? "Real-time sync active" : "Check backend"
          }
          icon={Clock3}
          tone={connected && !staleFleet ? "good" : "warning"}
        />
        <Kpi
          label="Open alerts"
          value={String(openAlerts)}
          detail={`${criticalAlerts} critical · ${warningAlerts} warning`}
          icon={AlertTriangle}
        />
        <Kpi
          label="Trucks moving"
          value={String(vehicles.filter((v) => v.speed > 0).length)}
          detail="Active deliveries"
          icon={Activity}
          tone="good"
        />
      </div>
      <div
        className="tower-grid grid gap-4"
        style={{ gridTemplateColumns: "minmax(0,1fr)" }}
      >
        <section
          className="tower-map relative min-h-[calc(100dvh-330px)] overflow-hidden border border-[#e4e3df] bg-white"
          style={{ minHeight: "calc(100dvh - 330px)" }}
        >
          <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-start gap-3">
            <div className="flex items-center gap-2">
              <div
                data-testid="status-connection"
                className="flex items-center gap-2 border border-[#d8d7d2] bg-white/90 px-3 py-1.5 text-[11px] backdrop-blur"
              >
                <span
                  className={cx(
                    "h-1.5 w-1.5 rounded-full",
                    connected && !staleFleet
                      ? "bg-[#1e7b44] live-dot"
                      : "bg-[#c4291f]",
                  )}
                />
                {connected && !staleFleet
                  ? "Live"
                  : staleFleet
                    ? "Stale"
                    : "Reconnecting…"}
              </div>
            </div>
          </div>
          <LiveOpsMap
            vehicles={vehicles}
            selected={selected?.id}
            onSelect={setSelected}
            routesWithStops={routesWithStops}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            proposedRoutes={proposedRoutesForMap ?? undefined}
          />
        </section>
        <aside className="hidden">
          <div className="flex border-b border-[#e4e3df]">
            {(["Fleet", "Routes", "Comms"] as const).map((item) => (
              <button
                data-testid={`button-tower-tab-${item.toLowerCase()}`}
                onClick={() => setTab(item)}
                key={item}
                className={cx(
                  "flex-1 border-b-2 px-3 py-4 text-xs font-semibold",
                  tab === item
                    ? "border-black"
                    : "border-transparent text-[#77787b]",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          {tab === "Fleet" && (
            <div className="thin-scroll flex-1 overflow-auto">
              {vehicles.map((v) => (
                <button
                  data-testid={`fleet-row-${v.id}`}
                  onClick={() => setSelected(v)}
                  className="flex w-full items-center gap-3 border-b border-[#efeeeb] px-4 py-3 text-left hover:bg-[#fafaf8]"
                  key={v.id}
                >
                  <span
                    className={cx(
                      "h-2 w-2 shrink-0 rounded-full",
                      v.status === "On time"
                        ? "bg-[#1e7b44]"
                        : v.status === "Temperature" ||
                            v.status === "Route drift"
                          ? "bg-[#c4291f]"
                          : "bg-[#a16819]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="mono text-xs font-semibold">
                        {v.plate || v.id}
                      </span>
                      <span className="text-[10px] text-[#77787b]">
                        {v.speed} kph
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-[#55565a]">
                      {v.driver} · {v.zone}
                    </div>
                  </div>
                  <div className="w-10">
                    <div className="flex h-4 items-end gap-0.5">
                      {[3, 6, 4, 8, 6, 10].map((h, i) => (
                        <span
                          key={i}
                          className="w-1 bg-[#b7b6b1]"
                          style={{ height: h }}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "Routes" && (
            <div className="thin-scroll flex-1 overflow-auto p-3">
              {routeOptimizeError && (
                <div className="mb-3 border border-[#c4291f] bg-[#fbeceb] p-2 text-[11px] text-[#c4291f]">
                  {routeOptimizeError}
                </div>
              )}
              {routesWithStops.length === 0 && (
                <p className="p-2 text-xs text-[#77787b]">
                  No routes yet — create one from the Routes workspace.
                </p>
              )}
              {routesWithStops.map(({ route, stops }) => {
                const isSelected = selectedRouteId === route.ROWID;
                return (
                  <div
                    key={route.ROWID}
                    onClick={() => setSelectedRouteId(route.ROWID)}
                    data-testid={`route-health-${route.ROWID}`}
                    className={cx(
                      "mb-3 cursor-pointer border p-3",
                      isSelected ? "border-black" : "border-[#e4e3df]",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">
                        {route.name}
                      </span>
                      <StatusChip status={route.status} tone="neutral" />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#55565a]">
                      <div>
                        Distance{" "}
                        <span className="mono block font-semibold text-black">
                          {route.distance_km.toFixed(1)} km
                        </span>
                      </div>
                      <div>
                        Duration{" "}
                        <span className="mono block font-semibold text-black">
                          {route.duration_min.toFixed(0)} min
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-[#77787b]">
                      {stops.length} stops
                      {route.polyline_geojson
                        ? " · road-following polyline cached"
                        : ""}
                    </div>
                    <button
                      data-testid={`button-optimize-${route.ROWID}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        applyOptimization(route.ROWID);
                      }}
                      disabled={optimizingId === route.ROWID}
                      className="button-outline mt-3 w-full rounded-[4px] px-2 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {optimizingId === route.ROWID
                        ? "Optimizing…"
                        : "Apply optimization"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {tab === "Comms" && (
            <div className="thin-scroll flex-1 overflow-auto p-4">
              <div className="mb-5 text-xs text-[#77787b]">
                Latest operational thread
              </div>
              {[
                ["06:41", "Customer ETA update", "WhatsApp", "Delivered"],
                ["06:38", "Driver acknowledgement", "SMS", "Acknowledged"],
                ["06:34", "Critical escalation", "Voice AI", "Sent"],
                ["06:28", "Route reassignment", "Web", "Read"],
              ].map(([time, title, channel, status]) => (
                <div
                  className="relative border-l border-[#d8d7d2] pb-7 pl-5 last:pb-2"
                  key={time}
                >
                  <span className="absolute -left-[4px] top-1 h-2 w-2 rounded-full bg-black" />
                  <div className="flex justify-between gap-2">
                    <span className="mono text-[10px] text-[#77787b]">
                      {time}
                    </span>
                    <StatusChip
                      status={status}
                      tone={
                        status === "Delivered" || status === "Read"
                          ? "good"
                          : "neutral"
                      }
                    />
                  </div>
                  <div className="mt-2 text-xs font-semibold">{title}</div>
                  <div className="mt-1 text-[11px] text-[#77787b]">
                    {channel} · RGF-24091
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      <AgentChat />
      {showOptimizationModal && (
        <FleetOptimizationModal
          onClose={() => {
            setShowOptimizationModal(false);
            setProposedRoutesForMap(null);
            setApplyOptimizationError(null);
          }}
          onApply={handleApplyOptimization}
          onPreviewReady={setProposedRoutesForMap}
          routesWithStops={routesWithStops}
          applying={applyingOptimization}
          applyError={applyOptimizationError}
        />
      )}
    </AppShell>
  );
}

function DataTablePage({
  kind,
}: {
  kind:
    | "fleet"
    | "routes"
    | "loads"
    | "orders"
    | "alerts"
    | "comms"
    | "reports"
    | "templates"
    | "users"
    | "roles"
    | "integrations"
    | "audit";
}) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const selectedOrderRef = useRef<Order | null>(null);
  selectedOrderRef.current = selectedOrder;
  const client = useQueryClient();
  const today = manilaDate(0);
  // Fleet opens on the next delivery day. Orders assigned to trucks for later days only show
  // when that day is picked on the calendar, with that day's own load and fulfillment.
  const [fleetDate, setFleetDate] = useState(nextExpectedDate);
  // FleetSocketProvider (mounted once at the app root) keeps the ["vehicles"] cache live here
  // too - no per-page connect/disconnect needed.
  const { data: vehiclesData, refetch: refetchVehicles, isFetching: vehiclesFetching } = useVehiclesData(kind !== "fleet", kind === "fleet" ? fleetDate : undefined);
  const [fleetRefreshAt, setFleetRefreshAt] = useState<Date | null>(null);
  const [fleetRefreshing, setFleetRefreshing] = useState(false);
  const refreshFleetData = async () => {
    if (kind !== "fleet" || fleetRefreshing) return;
    setFleetRefreshing(true);
    try {
      if (fleetDate < today) {
        await refetchVehicles();
        setFleetRefreshAt(new Date());
        setNotice("Historical Fleet refreshed");
        return;
      }
      await fleetApi.triggerFleetPoll();
      // Re-syncs Zoho for every assigned order; the response covers all days, so reload the
      // selected day's own view instead of showing that unscoped result.
      await fleetApi.refreshVehicles(true);
      await refetchVehicles();
      const now = new Date();
      setFleetRefreshAt(now);
      setNotice(`Fleet refreshed · ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`);
    } catch (error) {
      setNotice(`Fleet refresh failed · ${error instanceof Error ? error.message : "try again"}`);
    } finally {
      setFleetRefreshing(false);
    }
  };
  useEffect(() => {
    if (kind !== "fleet") return;
    const timer = window.setInterval(refreshFleetData, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [kind, fleetRefreshing, fleetDate]);
  const [orderFrom, setOrderFrom] = useState(nextExpectedDate);
  const [orderTo, setOrderTo] = useState(nextExpectedDate);
  const [orderStatus, setOrderStatus] = useState("All");
  const [orderAssignment, setOrderAssignment] = useState<"assigned" | "unassigned">("assigned");
  const [orderVehicle, setOrderVehicle] = useState("");
  const [orderCustomer, setOrderCustomer] = useState("");
  const [orderDelivery, setOrderDelivery] = useState("");
  const [showOrderFilters, setShowOrderFilters] = useState(false);
  const [showOrderColumns, setShowOrderColumns] = useState(false);
  const [orderColumns, setOrderColumns] = useState({ customer: true, route: true, vehicle: true, status: true, eta: true });
  const orderOptions = { search: query, status: orderStatus, assignment: orderAssignment, vehicle: orderVehicle, customer: orderCustomer, deliveryStatus: orderDelivery };
  const { data: ordersData, total: ordersTotal, refetch: refetchOrders, isFetching: ordersFetching } = useOrdersData(orderFrom, orderTo, orderOptions);
  const refreshOrders = async () => {
    await inventoryApi.refreshSalesOrders(orderFrom, orderTo);
    await refetchOrders();
    const selected = selectedOrderRef.current;
    if (selected) {
      await client.invalidateQueries({ queryKey: ["confirmed-so-detail", selected.id] });
    }
  };
  useEffect(() => {
    if (kind !== "orders") return;
    const timer = window.setInterval(refreshOrders, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [kind, refetchOrders, orderFrom, orderTo]);
  const filtered = ordersData;
  const labels: Record<string, [string, string]> = {
    fleet: ["Fleet", "Every vehicle, driver, and signal in the network."],
    routes: [
      "Routes",
      "Plan the next best movement across origin, stops, and destination.",
    ],
    loads: [
      "Load planning",
      "Balance cargo, capacity, and cold-chain requirements before dispatch.",
    ],
    orders: [
      "Orders & manifests",
      "A single lifecycle for every delivery order.",
    ],
    alerts: [
      "Alert center",
      "Prioritize exceptions, record the response, and keep the trail.",
    ],
    comms: [
      "Communications gateway",
      "One timeline for every operational message.",
    ],
    reports: [
      "Reports",
      "A measured view of delivery, channel, and response performance.",
    ],
    templates: [
      "Message templates",
      "Versioned, reviewable copy for every channel.",
    ],
    users: ["Users", "Access that follows the work."],
    roles: ["Roles & permissions", "A clear boundary around every workspace."],
    integrations: [
      "Integrations",
      "Provider status is visible and honest in this frontend demonstration.",
    ],
    audit: [
      "Audit log",
      "An append-only record of access and operational change.",
    ],
  };
  const [title, body] = labels[kind];
  const action =
    kind === "loads" || kind === "routes" ? (
      <Button
        onClick={() =>
          setNotice(
            `${kind === "routes" ? "Route draft created" : kind === "loads" ? "Load workspace ready" : "New order form opened"} — mocked for this demo.`,
          )
        }
      >
        <Plus size={15} />
        {kind === "routes"
          ? "New route"
          : kind === "loads"
            ? "New load"
            : "New order"}
      </Button>
    ) : undefined;
  return (
    <AppShell title={title}>
      {kind !== "reports" && kind !== "comms" && (
        <PageIntro
          eyebrow={`Workspace / ${title}`}
          title={title}
          body={body}
          action={kind === "loads" ? undefined : action}
        />
      )}
      {notice && (
        <div
          data-testid="status-action-notice"
          className={`mb-4 flex items-center justify-between border px-4 py-3 text-sm ${notice.toLowerCase().includes("failed") ? "border-[#f0c4c7] bg-[#fff1f2] text-[#86000B]" : "border-[#cddfd2] bg-[#edf6f0] text-[#1e7b44]"}`}
        >
          {notice}
          <button
            data-testid="button-dismiss-notice"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {kind === "loads" ? (
        <LoadPlanningWorkspace onNotice={setNotice} />
      ) : kind === "reports" ? (
        <Reports />
      ) : (
        <>
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
            {kind === "orders" && <div className="rounded-[4px] border border-[#e4e3df] bg-white px-4 py-2 text-sm"><span className="font-semibold">{ordersTotal}</span> confirmed SOs</div>}
            {kind === "orders" && <div className="flex items-center gap-2 text-xs"><label>From <input type="date" value={orderFrom} onChange={(e) => setOrderFrom(e.target.value)} className="ml-1 border border-[#d8d7d2] px-2 py-2" /></label><label>To <input type="date" value={orderTo} onChange={(e) => setOrderTo(e.target.value)} className="ml-1 border border-[#d8d7d2] px-2 py-2" /></label></div>}
            <div className="relative min-w-0 w-full max-w-sm">
              <Search
                className="absolute left-3 top-3 text-[#77787b]"
                size={16}
              />
              <input
                data-testid={`input-search-${kind}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${kind}…`}
                className="w-full border border-[#d8d7d2] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-black"
              />
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              {kind === "fleet" && <label className="flex items-center gap-2 text-xs text-[#55565a]">Date <input aria-label="Fleet date" type="date" value={fleetDate} onChange={(e) => setFleetDate(e.target.value || nextExpectedDate())} className="border border-[#d8d7d2] bg-white px-2 py-2 text-sm" /></label>}
              {kind === "fleet" && <Button variant="outline" className="rounded-[4px] px-3 py-2" onClick={refreshFleetData} disabled={fleetRefreshing}><RefreshCw size={14} className={fleetRefreshing ? "animate-spin" : ""} />{fleetRefreshing ? "Refreshing…" : "Refresh"}</Button>}
              {kind === "orders" && <Button variant="outline" className="rounded-[4px] px-3 py-2" onClick={refreshOrders} disabled={ordersFetching}><RefreshCw size={14} className={ordersFetching ? "animate-spin" : ""} />{ordersFetching ? "Refreshing..." : "Refresh"}</Button>}
              {kind === "orders" && <Button variant="outline" className="rounded-[4px] px-3 py-2" onClick={() => setShowOrderFilters((v) => !v)}>
                <Filter size={14} />
                Filter
              </Button>}
              {kind === "orders" && <Button variant="outline" className="rounded-[4px] px-3 py-2" onClick={() => setShowOrderColumns((v) => !v)}>
                <SlidersHorizontal size={14} />
                Columns
              </Button>}
            </div>
            {kind === "orders" && showOrderFilters && <div className="w-full border border-[#e4e3df] bg-white p-3 text-xs"><div className="flex flex-wrap gap-3"><label>Status <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className="ml-1 border px-2 py-1"><option>All</option><option>Confirmed</option><option>Acknowledged</option><option>Closed</option><option>Void</option></select></label><label>Assignment <select value={orderAssignment} onChange={(e) => setOrderAssignment(e.target.value as "assigned" | "unassigned")} className="ml-1 border px-2 py-1"><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label><label>Delivery <select value={orderDelivery} onChange={(e) => setOrderDelivery(e.target.value)} className="ml-1 border px-2 py-1"><option value="">All</option><option>Pending</option><option>Shipped</option><option>Delivered</option></select></label><input aria-label="Filter vehicle" placeholder="Vehicle" value={orderVehicle} onChange={(e) => setOrderVehicle(e.target.value)} className="border px-2 py-1" /><input aria-label="Filter customer" placeholder="Customer" value={orderCustomer} onChange={(e) => setOrderCustomer(e.target.value)} className="border px-2 py-1" /></div></div>}
            {kind === "orders" && showOrderColumns && <div className="w-full border border-[#e4e3df] bg-white p-3 text-xs"><div className="flex flex-wrap gap-3">{(["customer", "route", "vehicle", "status", "eta"] as const).map((column) => <label key={column} className="flex items-center gap-1"><input type="checkbox" checked={orderColumns[column]} onChange={() => setOrderColumns((current) => ({ ...current, [column]: !current[column] }))} disabled={column === "status"} />{column === "eta" ? "Expected Shipment" : column[0].toUpperCase() + column.slice(1)}</label>)}</div></div>}
            {kind === "fleet" && fleetRefreshAt && <span className="w-full text-right text-[10px] text-[#77787b]">Updated {fleetRefreshAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · Auto-refresh every 30 min</span>}
          </div>
          {kind === "fleet" && <FleetTable vehicles={vehiclesData} />}
          {kind === "orders" && (
            <OrderTable orders={filtered} onSelect={setSelectedOrder} columns={orderColumns} />
          )}{" "}
          {kind === "routes" && <RouteWorkspace onNotice={setNotice} />}{" "}
          {kind === "alerts" && <AlertTable />}
          {kind === "comms" && <CommsWorkspace onNotice={setNotice} />}
          {kind === "templates" && <Templates />}
          {kind === "users" && <UsersTable />}
          {kind === "roles" && <Roles />}
          {kind === "integrations" && <Integrations />}
          {kind === "audit" && <Audit />}
          {selectedOrder && (
            <OrderDrawer
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
function TableFrame({
  children,
  head,
}: {
  children: ReactNode;
  head: ReactNode;
}) {
  return (
    <div className="overflow-x-auto border border-[#e4e3df] bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-[#e4e3df] bg-[#f7f7f4] text-[11px] uppercase tracking-wider text-[#77787b]">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-[#efeeeb]">{children}</tbody>
      </table>
    </div>
  );
}
function FleetMobileCards({ vehicles, onSelect }: { vehicles: Vehicle[]; onSelect: (vehicle: Vehicle) => void }) {
  return <div className="grid gap-2 p-2 md:hidden">{vehicles.map((v) => { const sos = v.associatedSos || []; return <article key={v.id} className={`rounded-[4px] border p-3 ${v.locked ? "border-[#d7d7d3] bg-[#e7e7e4] text-[#77787b]" : "border-[#e4e3df] bg-white"}`}><div className="flex items-start justify-between gap-3"><div><div className="mono text-sm font-bold text-black">{v.plate}</div><div className="mt-0.5 text-xs">Vehicle ID: {v.id}</div>{v.lockReason && <div className="mt-1 text-[10px] font-semibold">{v.lockReason}</div>}</div><StatusChip status={v.status} /></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#efeeeb] pt-3 text-xs"><div><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Speed</div><div className="font-semibold">{v.speed} kph</div></div><div><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Fuel</div><div className="font-semibold">{v.fuel}%</div></div><div><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Zone</div><div>{v.zone || "—"}</div></div><div><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Warehouse pickup</div><div>{v.warehousePickup || "—"}</div></div><div><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Load</div><div className={loadOverage(v.load?.assignedWeightKg, v.load?.capacityKg) ? "font-semibold text-[#c4291f]" : ""}>{v.load ? `${v.load.assignedWeightKg.toLocaleString()} / ${v.load.capacityKg.toLocaleString()} kg` : "—"}</div>{loadOverage(v.load?.assignedWeightKg, v.load?.capacityKg) && <div className="text-[10px] font-semibold text-[#c4291f]">{loadOverage(v.load?.assignedWeightKg, v.load?.capacityKg)!.text}</div>}</div><div><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Fulfillment</div><div>{v.fulfillment ? `${Math.round(v.fulfillment.percent)}% ${v.fulfillment.status === "fulfilled" ? "Fulfilled" : v.fulfillment.status === "partial" ? "Partial" : "Pending"}` : "—"}</div></div></div><div className="mt-3 border-t border-[#efeeeb] pt-2"><div className="text-[10px] uppercase tracking-wide text-[#77787b]">Associated sales orders</div>{sos.length ? <button className="mt-1 flex flex-wrap gap-1 text-left" onClick={() => onSelect(v)}>{sos.slice(0, 3).map((so) => <span className="rounded-full border border-[#d8d7d2] px-2 py-0.5 text-[10px] text-black" key={so.soNumber}>{so.soNumber}</span>)}{sos.length > 3 && <span className="px-1 text-[10px] text-black">+{sos.length - 3} more</span>}</button> : <div className="mt-1 text-xs">—</div>}</div></article>; })}</div>;
}
function FleetTable({ vehicles }: { vehicles: Vehicle[] }) {
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const ordered = [...vehicles].sort((a, b) => Number(Boolean(a.locked)) - Number(Boolean(b.locked)) || (a.locked ? (a.plate === "NAN9911" ? -1 : 1) : 0));
  const compact = (items: string[]) => items.length > 2 ? `${items.slice(0, 2).join(", ")} +${items.length - 2}` : items.join(", ");
  return (
    <div className="min-w-0 overflow-x-auto border border-[#e4e3df] bg-white"><FleetMobileCards vehicles={ordered} onSelect={setSelected} /><table className="hidden w-full min-w-[1180px] text-left text-sm md:table">
      <thead className="border-b border-[#e4e3df] bg-[#f7f7f4] text-[11px] uppercase tracking-wider text-[#77787b]"><tr>
          <th className="sticky left-0 z-10 bg-[#f7f7f4] px-4 py-3">Vehicle</th><th className="px-3">Associated SOs</th><th className="px-3">SO Status</th><th className="px-3">Destination City</th><th className="px-3">Status</th><th className="px-3">Zone</th><th className="px-3">Speed</th><th className="px-3">Fuel</th><th className="px-3">Load</th><th className="px-3">Fulfillment</th><th className="px-3">Warehouse Pickup</th>
      </tr></thead><tbody className="divide-y divide-[#efeeeb]">
      {ordered.map((v) => {
        const muted = v.locked ? "bg-[#e7e7e4] text-[#77787b]" : "hover:bg-[#fafaf8]";
        const sos = v.associatedSos || [];
        return <tr className={muted} key={v.id}>
          <td className={`sticky left-0 z-[1] px-4 py-4 ${v.locked ? "bg-[#e7e7e4]" : "bg-white"}`}><span className="mono font-semibold text-sm">{v.plate}</span><div className="mt-1 text-xs">{v.id}</div>{v.lockReason && <div className="mt-1 text-[10px] font-semibold">{v.lockReason}</div>}</td>
          <td className="px-3"><button className="flex flex-wrap gap-1 text-left" onClick={() => sos.length && setSelected(v)}>{sos.length ? sos.slice(0, 2).map((so) => <span className="rounded-full border border-[#d8d7d2] px-2 py-0.5 text-[10px]" key={so.soNumber}>{so.soNumber}</span>) : "—"}{sos.length > 2 && <span className="text-xs">+{sos.length - 2}</span>}</button></td>
          <td className="px-3 text-xs"><div className="flex max-w-[150px] flex-wrap gap-1">{sos.length ? sos.slice(0, 2).map((so) => <span title={`Raw status: ${so.deliveryStatus || "unresolved"}`} className={`rounded-full px-2 py-0.5 text-[10px] ${so.deliveryStatus === "Delivered" ? "bg-[#e5f4e9] text-[#28723d]" : "bg-[#f2f1ed] text-[#55565a]"}`} key={`${so.soNumber}-status`}>{so.deliveryStatus || "Unresolved"}</span>) : "—"}{sos.length > 2 && <span>+{sos.length - 2}</span>}</div></td>
          <td className="px-3 text-xs">{compact(sos.map((so) => so.destinationCity).filter(Boolean) as string[]) || "—"}</td><td className="px-3"><StatusChip status={v.status} /></td><td className="px-3 text-[#55565a]">{v.zone}</td><td className="px-3 mono text-xs font-semibold">{v.speed} kph</td>
          <td className="px-3"><div className="flex items-center gap-2"><div className="h-1.5 w-16 bg-[#e8e7e3]"><div className="h-full bg-black" style={{ width: `${v.fuel}%` }} /></div><span className="mono text-xs">{v.fuel}%</span></div></td>
          <td className="px-3 text-xs">{v.load ? (() => { const over = loadOverage(v.load.assignedWeightKg, v.load.capacityKg); return <><div className={over ? "font-semibold text-[#c4291f]" : ""}>{v.load.assignedWeightKg.toLocaleString()} / {v.load.capacityKg.toLocaleString()} kg</div><div className="mt-1 h-1.5 w-20 bg-[#e8e7e3]"><div className={`h-full ${over ? "bg-[#c4291f]" : "bg-black"}`} style={{ width: `${Math.min(100, v.load.utilizationPercent)}%` }} /></div><div className={`mt-1 mono text-[10px] ${over ? "font-semibold text-[#c4291f]" : ""}`}>{Math.round(v.load.utilizationPercent)}%</div>{over && <div className="mt-0.5 text-[10px] font-semibold text-[#c4291f]">{over.text}</div>}</>; })() : "—"}</td>
          <td className="px-3 text-xs">{v.fulfillment ? <><div>{Math.round(v.fulfillment.percent)}% {v.fulfillment.status === "fulfilled" ? "Fulfilled" : v.fulfillment.status === "partial" ? "Partial" : "Pending"}</div><div className="mt-1 text-[10px] text-[#77787b]">{v.fulfillment.shippedWeightKg.toLocaleString()} / {v.fulfillment.assignedWeightKg.toLocaleString()} kg</div></> : "—"}</td>
          <td className="px-3 text-xs">{v.warehousePickup || "—"}</td>
        </tr>;
      })}
      </tbody></table>{selected && <div className="fixed inset-0 z-[2000] bg-black/20" onClick={() => setSelected(null)}><aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Associated SOs · {selected.plate}</h2><button onClick={() => setSelected(null)}><X size={18} /></button></div><p className="mt-2 text-xs text-[#77787b]">Weights use the authoritative per-line Zoho package calculation. Load is the sum of assigned SO weights.</p>{(selected.associatedSos || []).map((so) => <div className="mt-4 border-b border-[#efeeeb] pb-4" key={so.soNumber}><div className="font-semibold">{so.soNumber}</div><div className="mt-1 text-xs text-[#55565a]">{so.clientName || "—"} · {so.destinationCity || "—"}</div><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><div className="text-[#77787b]">Assigned</div><div className="font-semibold">{so.orderedWeightKg == null ? "—" : `${so.orderedWeightKg} kg`}</div></div><div><div className="text-[#77787b]">Shipped</div><div className="font-semibold">{so.shippedWeightKg == null ? "—" : `${so.shippedWeightKg} kg`}</div></div><div><div className="text-[#77787b]">Remaining</div><div className="font-semibold">{so.orderedWeightKg == null || so.shippedWeightKg == null ? "—" : `${Math.max(0, so.orderedWeightKg - so.shippedWeightKg)} kg`}</div></div></div><div className="mt-1 text-xs text-[#77787b]">Pickup: {so.warehouse || "—"}</div></div>)}</aside></div>}</div>
  );
}
function OrderTable({
  orders: onOrders,
  onSelect,
  columns,
}: {
  orders: Order[];
  onSelect: (o: Order) => void;
  columns: { customer: boolean; route: boolean; vehicle: boolean; status: boolean; eta: boolean };
}) {
  return (
    <TableFrame
      head={
        <>
          <th className="px-4 py-3">Order</th>
          {columns.customer && <th>Customer</th>}
          {columns.route && <th>Route</th>}
          {columns.vehicle && <th>Vehicle</th>}
          {columns.status && <th>Status</th>}
          {columns.eta && <th>Expected Shipment</th>}
          <th />
        </>
      }
    >
      {onOrders.map((o) => (
        <tr
          data-testid={`row-order-${o.id}`}
          onClick={() => onSelect(o)}
          className="cursor-pointer hover:bg-[#fafaf8]"
          key={o.id}
        >
          <td className="px-4 py-4">
            <span className="mono font-semibold">{o.id}</span>
            <div className="mt-1 text-xs text-[#77787b]">
              {o.temperature} cargo
            </div>
          </td>
          {columns.customer && <td>{o.customer}</td>}
          {columns.route && <td className="text-[#55565a]">{o.route}</td>}
          {columns.vehicle && <td className="mono text-xs">{o.vehicle}</td>}
          {columns.status && <td><StatusChip status={o.status} /></td>}
          {columns.eta && <td className="text-xs">{o.eta}</td>}
          <td>
            <ChevronRight size={16} className="text-[#77787b]" />
          </td>
        </tr>
      ))}
    </TableFrame>
  );
}
function OrderDrawer({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["confirmed-so-detail", order.id],
    queryFn: () => inventoryApi.getSalesOrderDetail(order.id),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const liveOrder: any = detail.data || order;
  const liveProducts: NonNullable<inventoryApi.SalesOrderSummary["products"]> = liveOrder.products || order.products || [];
  const packages = Array.isArray(liveOrder.packages) ? liveOrder.packages : [];
  const normalizedDeliveryStatus = liveOrder.delivery_status || "Unknown";
  const lifecycle = [
    { title: "Order created", detail: liveOrder.created_time || liveOrder.order_date || "Zoho Sales Order", done: true },
    { title: "Confirmed", detail: liveOrder.order_status || "Confirmed", done: ["confirmed", "acknowledged", "closed"].includes(String(liveOrder.order_status || "").toLowerCase()) },
    { title: "Shipped", detail: liveOrder.shipment_status || (packages.length ? `${packages.length} package(s)` : "Awaiting shipment"), done: Boolean(liveOrder.shipment_status) || packages.some((p: any) => ["shipped", "delivered"].includes(String(p.status || "").toLowerCase())) },
    { title: "Delivered", detail: packages.length ? packages.map((p: any) => `${p.package_number || p.package_id || "Package"}: ${p.status || "Unresolved"}`).join(" · ") : "Awaiting package delivery", done: packages.length > 0 && packages.every((p: any) => String(p.status || "").toLowerCase() === "delivered") },
  ];
  return (
    <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 right-0 top-0 w-full max-w-[460px] overflow-auto border-l border-[#e4e3df] bg-white p-6 shadow-xl entrance"
      >
        <div className="flex justify-between">
          <div>
            <div className="micro text-[#77787b]">Order detail</div>
            <h2 className="display-face mt-2 text-3xl font-bold">{liveOrder.salesorder_number || order.id}</h2>
          </div>
          <button data-testid="button-close-order" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={liveOrder.order_status || order.status} />
            <span className="text-xs text-[#55565a]">Delivery: <strong>{normalizedDeliveryStatus}</strong></span>
          </div>
          <p className="mt-4 text-sm text-[#55565a]">
            {liveOrder.customer_name || order.customer} · {liveOrder.shipping_city || order.route}
          </p>
          <div className="mt-2 text-[11px] text-[#77787b]">
            {detail.isFetching ? "Refreshing from Zoho Inventory…" : "Live confirmed Sales Order data"}
          </div>
          {liveProducts.length ? (
            <div className="mt-5 border-t border-[#e4e3df] pt-4 text-xs">
              <div className="micro mb-3 text-[#77787b]">Items & quantities</div>
              <div className="space-y-2">
                {liveProducts.map((product) => (
                  <div className="flex justify-between gap-3" key={`${product.sku}-${product.name}`}>
                    <span>{product.name || product.sku || "Item"}</span>
                    <span className="whitespace-nowrap text-[#55565a]">{product.quantity} {product.unit || "units"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {liveOrder.shipping_address ? <div className="mt-4 border-t border-[#e4e3df] pt-4 text-xs"><div className="text-[#77787b]">Shipping address</div><div className="mt-1 whitespace-pre-line break-words">{formatAddress(liveOrder.shipping_address)}</div></div> : null}
        </div>
          <div className="mt-10 border-t border-[#e4e3df] pt-5">
          <div className="micro mb-6 text-[#77787b]">Lifecycle · Zoho Inventory</div>
          <div className="mb-5 grid gap-2 border-b border-[#e4e3df] pb-4 text-xs text-[#55565a]">
            <div><span className="text-[#77787b]">Order status:</span> {liveOrder.order_status || "Unknown"}</div>
            <div><span className="text-[#77787b]">Shipment status:</span> {liveOrder.shipment_status || liveOrder.shipping_status || "Unknown"}</div>
            <div><span className="text-[#77787b]">Package status:</span> {packages.length ? packages.map((p: any) => `${p.package_number || p.package_id || "Package"}: ${p.status || p.detailed_status || "Unknown"}`).join(" · ") : "No packages"}</div>
            <div><span className="text-[#77787b]">Normalized delivery status:</span> {normalizedDeliveryStatus}</div>
          </div>
          <div className="route-flow">
            {lifecycle.map((step, i) => (
              <div className="route-step mb-6 flex gap-4" key={step.title}>
                <div
                  className={cx(
                    "mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_#0b0b0b]",
                    step.done ? "bg-black" : "bg-white",
                  )}
                />
                <div>
                  <div className="mono text-[10px] text-[#77787b]">{step.done ? "Live" : "Pending"}</div>
                  <div className="mt-1 text-sm font-semibold">{step.title}</div>
                  <div className="mt-1 text-xs text-[#77787b]">
                    {step.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <Button
          onClick={onClose}
          variant="outline"
          className="mt-5 w-full rounded-[4px]"
        >
          Close detail
        </Button>
      </aside>
    </div>
  );
}
function LegacyRouteWorkspace({ onNotice }: { onNotice: (s: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="border border-[#e4e3df] bg-white p-5">
        <div className="micro text-[#77787b]">Route builder</div>
        <h2 className="display-face mt-3 text-2xl font-bold">Cavite → Cebu</h2>
        <div className="mt-7 grid gap-3">
          {[
            "Cavite cold store",
            "Batangas cross-dock",
            "Cebu distribution hub",
          ].map((stop, i) => (
            <div
              className="flex items-center gap-3 border border-[#e4e3df] p-3"
              key={stop}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-black text-[10px] text-white">
                {i + 1}
              </span>
              <span className="text-sm font-semibold">{stop}</span>
              <MoreHorizontal size={15} className="ml-auto text-[#77787b]" />
            </div>
          ))}
        </div>
        <div className="mt-8 micro text-[#77787b]">Optimization mode</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {["Fastest", "Cheapest", "Shortest", "Multimodal"].map((mode, i) => (
            <button
              data-testid={`button-route-mode-${mode.toLowerCase()}`}
              className={cx(
                "border px-2 py-2 text-xs font-semibold",
                i === 0
                  ? "border-black bg-black text-white"
                  : "border-[#d8d7d2]",
              )}
              key={mode}
            >
              {mode}
            </button>
          ))}
        </div>
        <Button
          onClick={() =>
            onNotice("Route saved and assigned to IF-204 — mocked locally.")
          }
          className="mt-7 w-full rounded-[4px]"
        >
          Save & assign <ArrowRight size={15} />
        </Button>
      </div>
      <div className="grid gap-4">
        <div className="min-h-[355px] border border-[#e4e3df]">
          <MockMap />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Distance", "824 km"],
            ["Duration", "13h 40m"],
            ["Est. cost", "₱18,640"],
          ].map(([l, v]) => (
            <div className="border border-[#e4e3df] bg-white p-4" key={l}>
              <div className="micro text-[#77787b]">{l}</div>
              <div className="display-face mt-4 text-2xl font-bold">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function LoadWorkspace({ onNotice }: { onNotice: (s: string) => void }) {
  const [, navigate] = useLocation();
  const planning = useQuery({
    queryKey: ["planning-orders"],
    queryFn: inventoryApi.listPlanningOrders,
  });
  const [vehicle, setVehicle] = useState("");
  const [manifestOverage, setManifestOverage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const rows = planning.data ?? [];
  const assigned = rows.filter(
    (o) =>
      o.vehicle_id === vehicle &&
      ["assigned", "manifested"].includes(o.assignment_status ?? ""),
  );
  const total = assigned.reduce((sum, o) => sum + (o.weight_kg || 0), 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
      <div className="border border-[#e4e3df] bg-white p-5">
        <div className="micro text-[#77787b]">Live planning orders</div>
        <div className="mt-4 grid gap-2">
          {rows.slice(0, 80).map((o) => (
            <div
              key={o.id}
              className="flex items-center gap-3 border border-[#e4e3df] p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={() =>
                  setSelected((s) =>
                    s.includes(o.id)
                      ? s.filter((x) => x !== o.id)
                      : [...s, o.id],
                  )
                }
              />
              <span className="flex-1">
                <b>{o.salesorder_number}</b> · {o.customer_name}
                <span className="block text-xs text-[#77787b]">
                  {o.weight_kg.toFixed(1)} kg · {o.cold_chain_category}{" "}
                  <span className="ml-1 rounded border border-[#d8d7d2] px-1 text-[9px] uppercase tracking-wider text-[#77787b]">
                    inferred
                  </span>{" "}
                  · {o.assignment_status}
                </span>
              </span>
              {o.assignment_status === "unassigned" && (
                <button
                  className="text-xs underline"
                  onClick={() =>
                    navigate(`/app/routes?assign=${encodeURIComponent(o.id)}`)
                  }
                >
                  Assign Truck
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="border border-[#e4e3df] bg-white p-5">
        <div className="micro text-[#77787b]">Real vehicle capacity</div>
        <select
          className="mt-4 w-full border p-2"
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
        >
          <option value="">Select truck</option>
          {[
            "DCD8953",
            "DCD8954",
            "DCD8955",
            "NFX5791",
            "Motorcycle 1",
            "Motorcycle 2",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <div className="mt-5 text-sm">
          Assigned weight: <b>{total.toFixed(1)} kg</b>
        </div>
        <div className="mt-2 text-xs text-[#77787b]">
          Selected orders: {selected.length}
        </div>
        {manifestOverage && (
          <div role="alert" data-testid="manifest-over-capacity" className="mt-3 border border-[#c4291f] bg-[#fbeceb] p-3 text-sm font-semibold text-[#c4291f]">
            {manifestOverage}. The manifest was still confirmed.
          </div>
        )}
        <Button
          disabled={!vehicle || selected.length === 0}
          onClick={async () => {
            const manifest: any = await inventoryApi.confirmManifest(vehicle, selected);
            // Over capacity is a warning only: the manifest is confirmed either way.
            const overText = manifest?.over_capacity
              ? `Over capacity by ${Number(manifest.over_capacity_kg).toLocaleString("en-US", { maximumFractionDigits: 1 })} kg (${Number(manifest.over_capacity_percent).toLocaleString("en-US", { maximumFractionDigits: 1 })}%)`
              : "";
            setManifestOverage(overText);
            onNotice(`Manifest confirmed from live assigned orders.${overText ? ` Warning: ${overText}.` : ""}`);
            setSelected([]);
            planning.refetch();
          }}
          className="mt-8 w-full rounded-[4px]"
        >
          Confirm manifest <Check size={15} />
        </Button>
      </div>
    </div>
  );
}

function LegacyDispatchDashboard() {
  const query = useQuery({
    queryKey: ["dispatch-dashboard"],
    queryFn: () => inventoryApi.getDispatchDashboard(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const data = query.data as
    | { kpis?: Record<string, number>; orders?: Array<Record<string, unknown>> }
    | undefined;
  const k = data?.kpis ?? {};
  const displayOrders = data?.orders ?? [];
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="micro text-[#77787b]">Live dispatch dashboard</div>
          <h2 className="display-face mt-2 text-3xl font-bold">
            Dispatch pipeline
          </h2>
        </div>
        <button
          className="button-black rounded-[4px] px-4 py-2 text-xs"
          onClick={() => query.refetch()}
        >
          Reload all
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Sales Orders Today", "sales_orders_today"],
          ["Trucks Deployed", "trucks_deployed"],
          ["Pending", "pending"],
          ["In Transit", "in_transit"],
          ["Delivered", "delivered"],
        ].map(([label, key]) => (
          <div className="border border-[#e4e3df] bg-white p-4" key={key}>
            <div className="display-face text-3xl font-bold">{k[key] ?? 0}</div>
            <div className="mt-2 text-xs uppercase tracking-[.12em] text-[#77787b]">
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 border border-[#e4e3df] bg-white p-5">
        <div className="micro text-[#77787b]">Sales orders</div>
        <div className="mt-4 grid gap-2">
          {displayOrders.map((o) => (
            <div
              className="flex justify-between border-b border-[#efeeeb] py-2 text-sm"
              key={String(o.salesorder_id ?? o.id)}
            >
              <span>
                <b>{String(o.salesorder_number ?? o.id)}</b> ({String(o.id)}) ·{" "}
                {String(o.vehicle_id ?? "Unassigned")}
              </span>
              <span>{String(o.status ?? o.assignment_status ?? "Pending")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveWarehouseChecklist() {
  const queryClient = useQueryClient();
  const manifests = useQuery({
    queryKey: ["warehouse-manifests"],
    queryFn: routesApi.listManifests,
  });
  const manifest = (manifests.data ?? [])
    .filter((m) => ["confirmed", "departed"].includes(String(m.status)))
    .at(-1);
  const checklist = useQuery({
    queryKey: ["warehouse-checklist", manifest?.ROWID],
    queryFn: () => inventoryApi.getWarehouseChecklist(manifest!.ROWID),
    enabled: Boolean(manifest),
  });
  const [seal, setSeal] = useState("");
  const [actual, setActual] = useState("");
  const [temp, setTemp] = useState("");
  const [zones, setZones] = useState("");
  const [ack, setAck] = useState(false);
  const c = (checklist.data as any)?.checklist;
  return (
    <AppShell title="Loading checklist">
      <PageIntro
        eyebrow="Warehouse / Loading"
        title="Loading checklist"
        body="Live checklist tied to the confirmed manifest."
      />
      {!manifest ? (
        <div className="border p-5 text-sm">
          No confirmed manifest available.
        </div>
      ) : (
        <div className="border border-[#e4e3df] bg-white p-5">
          <div className="micro text-[#77787b]">
            Manifest {manifest.ROWID} · {manifest.vehicle_id} ·{" "}
            {manifest.status}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              className="border p-2"
              placeholder="Seal number"
              value={seal}
              onChange={(e) => setSeal(e.target.value)}
            />
            <input
              className="border p-2"
              placeholder={`Actual cargo count (expected ${c?.cargo_count_expected ?? "-"})`}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
            <input
              className="border p-2"
              placeholder="Departure temperature °C"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
            />
            <input
              className="border p-2"
              placeholder="Temperature zone count"
              value={zones}
              onChange={(e) => setZones(e.target.value)}
            />
          </div>
          <label className="mt-4 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />{" "}
            Driver acknowledged
          </label>
          <Button
            className="mt-5"
            disabled={
              !seal ||
              !actual ||
              !temp ||
              !zones ||
              !ack ||
              c?.checklist_completed
            }
            onClick={async () => {
              await inventoryApi.completeWarehouseChecklist(manifest.ROWID, {
                seal_number: seal,
                cargo_count_actual: Number(actual),
                departure_temp_c: Number(temp),
                departure_temp_zone_count: Number(zones),
                driver_acknowledged: ack,
              });
              await queryClient.invalidateQueries({ queryKey: ["dispatch-dashboard"] });
              await checklist.refetch();
              await manifests.refetch();
            }}
          >
            Complete checklist <Check size={15} />
          </Button>
        </div>
      )}
    </AppShell>
  );
}

function LegacyLoadWorkspace({ onNotice }: { onNotice: (s: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
      <div className="border border-[#e4e3df] bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="micro text-[#77787b]">
              Draft manifest / RGF-24091
            </div>
            <h2 className="display-face mt-2 text-2xl font-bold">
              Cavite → Cebu
            </h2>
          </div>
          <StatusChip status="Draft" />
        </div>
        <div className="mt-7 grid gap-2">
          {[
            ["Frozen chicken", "42 cases", "-18°C"],
            ["Fresh dairy", "18 cases", "2–4°C"],
            ["Produce", "26 cases", "4–8°C"],
            ["Dry provisions", "12 cases", "Ambient"],
          ].map(([name, count, temp], i) => (
            <div
              className="flex items-center gap-4 border border-[#e4e3df] p-4"
              key={name}
            >
              <div className="grid h-9 w-9 place-items-center bg-[#f2f2ef]">
                <Boxes size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{name}</div>
                <div className="mt-1 text-xs text-[#77787b]">
                  {count} · {temp}
                </div>
              </div>
              <button
                data-testid={`button-load-item-${i}`}
                className="text-xs font-semibold underline underline-offset-2"
              >
                Assign
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="border border-[#e4e3df] bg-white p-5">
        <div className="micro text-[#77787b]">Vehicle capacity</div>
        <div className="mt-4 flex items-end justify-between">
          <span className="display-face text-4xl font-bold">78%</span>
          <span className="mono text-xs text-[#77787b]">IF-204 / 18 t</span>
        </div>
        <div className="mt-4 h-3 bg-[#e8e7e3]">
          <div className="h-full bg-black" style={{ width: "78%" }} />
        </div>
        <div className="mt-7 grid gap-3 text-xs">
          <div className="flex justify-between">
            <span className="text-[#77787b]">Cold cargo</span>
            <span className="font-semibold">11.8 t</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#77787b]">Available</span>
            <span className="font-semibold">5.2 t</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#77787b]">Temperature zones</span>
            <span className="font-semibold">3</span>
          </div>
        </div>
        <Button
          onClick={() =>
            onNotice(
              "Manifest confirmed — driver notification queued in mock gateway.",
            )
          }
          className="mt-9 w-full rounded-[4px]"
        >
          Confirm manifest <Check size={15} />
        </Button>
      </div>
    </div>
  );
}
function AlertTable() {
  const { data: items } = useAlertsData();
  const queryClient = useQueryClient();
  const ackRemote = useAcknowledgeAlert();
  const ackOne = (id: string) => {
    queryClient.setQueryData(["alerts"], (old: Alert[] | undefined) =>
      (old ?? items).map((x) =>
        x.id === id ? { ...x, status: "Acknowledged" } : x,
      ),
    );
    ackRemote(id);
  };
  const ackAll = () => {
    items.filter((x) => x.status === "Open").forEach((x) => ackRemote(x.id));
    queryClient.setQueryData(["alerts"], (old: Alert[] | undefined) =>
      (old ?? items).map((x) =>
        x.status === "Open" ? { ...x, status: "Acknowledged" } : x,
      ),
    );
  };
  return (
    <>
      <div className="mb-4 flex items-center justify-between border border-[#e4e3df] bg-white p-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="h-2 w-2 rounded-full bg-[#c4291f]" />
          <strong>
            {items.filter((x) => x.status === "Open").length} open alerts
          </strong>
          <span className="text-[#77787b]">requiring acknowledgement</span>
        </div>
        <Button
          onClick={ackAll}
          variant="outline"
          className="rounded-[4px] px-3 py-2 text-xs"
        >
          Acknowledge all
        </Button>
      </div>
      <TableFrame
        head={
          <>
            <th className="px-4 py-3">Alert</th>
            <th>Severity</th>
            <th>Vehicle</th>
            <th>Message</th>
            <th>Created</th>
            <th>State</th>
            <th />
          </>
        }
      >
        {items.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-4">
              <span className="mono text-xs font-semibold">{a.id}</span>
              <div className="mt-1 font-semibold">{a.type}</div>
            </td>
            <td>
              <StatusChip status={a.severity} />
            </td>
            <td className="mono text-xs">{a.vehicle}</td>
            <td className="max-w-[260px] text-xs text-[#55565a]">
              {a.message}
            </td>
            <td className="mono text-[11px]">{a.time}</td>
            <td>
              <StatusChip status={a.status} />
            </td>
            <td>
              {a.status === "Open" && (
                <button
                  data-testid={`button-alert-ack-${a.id}`}
                  onClick={() => ackOne(a.id)}
                  className="text-xs font-semibold underline underline-offset-2"
                >
                  Acknowledge
                </button>
              )}
            </td>
          </tr>
        ))}
      </TableFrame>
    </>
  );
}
function CommsWorkspace({ onNotice }: { onNotice: (s: string) => void }) {
  return <CommsGateway onNotice={onNotice} />;
}
/* legacy delivery-performance markup removed from the Reports UI
      <div className="border border-[#e4e3df] bg-white p-5 md:col-span-2">
        <div className="micro text-[#77787b]">Operational pulse</div>
        <div className="mt-7 grid grid-cols-2 gap-5 md:grid-cols-4">
          <Kpi
            label="Avg notification cost"
            value="₱4.18"
            detail="-₱0.42 vs prior period"
            icon={BarChart3}
            tone="good"
          />
          <Kpi
            label="Response window"
            value="08m 42s"
            detail="Across 1,842 events"
            icon={Clock3}
          />
        </div>
      </div>
    </div>
  );
}
*/
function ReportsHome({ onNavigate }: { onNavigate: (view: "rgf" | "dispatch") => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const rgf = useQuery({ queryKey: ["rgf-logistics-report"], queryFn: () => reportsApi.fetchRgfLogisticsReport(), staleTime: Infinity, refetchOnWindowFocus: false, retry: false });
  const dispatch = useQuery({ queryKey: ["dispatch-dashboard"], queryFn: () => inventoryApi.getDispatchDashboard(), staleTime: Infinity, refetchOnWindowFocus: false, retry: false });
  const rk = rgf.data?.kpis;
  const dk = (dispatch.data as { kpis?: Record<string, number> } | undefined)?.kpis;
  const value = (n: number | null | undefined) => n == null ? "—" : String(n);
  const loading = rgf.isLoading || dispatch.isLoading;
  const refreshReports = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([rgf.refetch(), dispatch.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };
  const cards = [["Delivered today", value(rk?.delivered_today), "Orders Zoho marks as delivered today.", "Comparison vs. yesterday: — (the live report does not return a prior-day value)."], ["Shipped · not delivered", value(rk?.shipped_not_delivered), "Orders Zoho marks as shipped but not yet confirmed delivered — may need driver follow-up.", "Comparison vs. yesterday: — (the live report does not return a prior-day value)."], ["Orders today", value(dk?.today), "Sales Orders in today’s live dispatch pipeline.", "Comparison vs. yesterday: — (the dispatch feed does not return a prior-day value)."], ["Unassigned orders", value(dk?.unassigned), "Orders in the live dispatch feed that do not yet have a truck assignment.", "Comparison vs. yesterday: — (the dispatch feed does not return a prior-day value)."], ["In transit", value(dk?.in_transit), "Assigned orders currently marked as shipped or departed.", "Comparison vs. yesterday: — (the dispatch feed does not return a prior-day value)."]];
  return <div className="grid gap-4">
    <div className="min-h-[285px] border border-[#e4e3df] bg-white p-5 md:flex md:items-center md:justify-start md:gap-8"><div className="min-w-0"><div className="micro text-[#77787b]">Reports overview</div><h2 className="display-face mt-3 text-3xl font-bold">A live view of logistics work.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-[#55565a]">Review Zoho fulfillment activity and today’s dispatch pipeline. Data is live from Zoho and refreshes when Reports opens or when you press Refresh.</p><button onClick={refreshReports} disabled={refreshing} className="mt-4 inline-flex items-center gap-2 border border-[#d8d7d2] px-3 py-2 text-xs font-semibold hover:border-black disabled:cursor-wait disabled:opacity-60"><RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />{refreshing ? "Refreshing…" : "Refresh"}</button>{rgf.isError && dispatch.isError && <p className="mt-3 text-xs text-[#a32720]">Live report data is unavailable right now.</p>}</div><img src={dashboardIllustration} alt="Logistics route illustration" className="hidden h-[263px] w-[760px] max-w-none shrink-0 object-contain lg:block" /></div>
    <div className="grid gap-3 md:grid-cols-5">{cards.map(([label, metric, description, comparison]) => <div className="border border-[#e4e3df] bg-white p-4" key={label}><div className="micro text-[#77787b]">{label}</div><div className="display-face mt-3 text-3xl font-bold">{loading ? "…" : metric}</div><p className="mt-3 text-xs leading-5 text-[#55565a]">{description}</p><p className="mt-2 text-[10px] leading-4 text-[#77787b]">{comparison}</p></div>)}</div>
    <div className="grid gap-4 md:grid-cols-2">{[["rgf", "RGF Logistics Report", "Zoho fulfillment, packed and shipped orders, deliveries, inventory adjustments, transfers, receipts, and invoices.", "Look for overdue fulfillment, shipped-but-undelivered orders, and transaction items needing follow-up."],["dispatch", "Dispatch Dashboard", "Today’s live sales orders, assignment status, deployed trucks, movement, and delivery pipeline.", "Look for unassigned orders, deployed trucks, in-transit loads, and delivery completion."]].map(([view, title, description, focus]) => <button key={view} onClick={() => onNavigate(view as "rgf" | "dispatch")} className="border border-[#e4e3df] bg-white p-5 text-left hover:border-black"><div className="flex items-start justify-between gap-3"><div><div className="micro text-[#77787b]">Open report</div><h3 className="mt-2 text-lg font-bold">{title}</h3></div><ArrowRight size={17} /></div><p className="mt-4 text-sm leading-6 text-[#55565a]">{description}</p><p className="mt-2 text-xs leading-5 text-[#77787b]">{focus}</p></button>)}</div>
  </div>;
}
const REPORT_VIEWS = [
  ["home", "Home"],
  ["rgf", "RGF Logistics Report"],
  ["dispatch", "Dispatch Dashboard"],
] as const;
function Reports() {
  const [view, setView] = useState<"home" | "rgf" | "dispatch">("home");
  const eyebrow =
    view === "rgf"
      ? "Workspace / Reports / RGF Logistics Report"
      : view === "dispatch"
        ? "Workspace / Reports / Dispatch Dashboard"
        : "Workspace / Reports";
  const title =
    view === "rgf"
      ? "RGF Logistics Report"
      : view === "dispatch"
        ? "Dispatch Dashboard"
        : "Reports";
  const body =
    view === "rgf"
      ? "Live order-fulfillment and inventory snapshot, sourced from Zoho Inventory."
      : view === "dispatch"
        ? "Live assignment, manifest, and vehicle movement status."
        : "A live overview of fulfillment and dispatch reporting.";
  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5 entrance">
        <div>
          <div className="micro mb-3 text-[#77787b]">{eyebrow}</div>
          <h1 className="display-face max-w-3xl text-4xl font-bold leading-[.98] md:text-5xl">
            {title}
          </h1>
          {view === "rgf" && <div className="mt-2 text-[10px] text-[#999]">Created by Pau</div>}
          {view === "dispatch" && <div className="mt-2 text-[10px] text-[#999]">Created by Jomel</div>}
          <p className="mt-4 max-w-2xl text-[15px] leading-6 text-[#55565a]">
            {body}
          </p>
        </div>
        <div className="flex border border-[#d8d7d2] bg-white p-1">
          {REPORT_VIEWS.map(([value, label]) => (
            <button
              key={value}
              data-testid={`button-report-view-${value}`}
              onClick={() => setView(value)}
              className={cx(
                "px-3 py-2 text-xs font-semibold",
                view === value
                  ? "bg-black text-white"
                  : "text-[#77787b] hover:text-black",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === "home" ? (
        <ReportsHome onNavigate={setView} />
      ) : view === "rgf" ? (
        <RgfLogisticsReportView />
      ) : (
        <DispatchDashboardPage />
      )}
    </div>
  );
}
const FIXTURE_TEMPLATE_ROWS = [
  [
    "Driver acknowledgement",
    "SMS",
    "Approved",
    "Please confirm route {route_id} and estimated departure {eta}.",
  ],
  [
    "Customer ETA update",
    "WhatsApp",
    "Approved",
    "Your IntelliFleet delivery {order_id} is on its way. Estimated arrival: {eta}.",
  ],
  [
    "Critical escalation",
    "Voice AI",
    "Draft",
    "Critical cold-chain alert for {vehicle_id}. Please acknowledge this message.",
  ],
  [
    "Delivery completed",
    "Viber",
    "Draft",
    "Order {order_id} was delivered at {delivered_at}.",
  ],
  [
    "Temperature exception",
    "SMS",
    "Approved",
    "Action required: {order_id} recorded a temperature exception.",
  ],
] as const;
function Templates() {
  const { data: live } = useQuery({
    queryKey: ["templates"],
    queryFn: () => commsApi.listTemplates(),
    staleTime: 5000,
    retry: false,
  });
  const rows =
    live && live.length
      ? live.map((t) => [t.name, t.channel, t.status, t.body] as const)
      : FIXTURE_TEMPLATE_ROWS;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_350px]">
      <div className="grid gap-2">
        {rows.map(([name, ch, status, body], i) => (
          <button
            data-testid={`button-template-${i}`}
            className="border border-[#e4e3df] bg-white p-5 text-left hover:border-black"
            key={name}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{name}</div>
                <div className="mt-1 text-xs text-[#77787b]">
                  {ch} · v{2 - (i % 2)}
                </div>
              </div>
              <StatusChip status={status} />
            </div>
            <div className="mono mt-5 max-w-2xl text-xs leading-5 text-[#55565a]">
              {body}
            </div>
          </button>
        ))}
      </div>
      <div className="h-fit border border-[#e4e3df] bg-white p-5">
        <div className="micro text-[#77787b]">Live preview</div>
        <div className="mt-6 bg-[#f2f2ef] p-4">
          <div className="mb-3 text-[10px] text-[#77787b]">
            WhatsApp · customer
          </div>
          <div className="ml-auto max-w-[240px] rounded-[12px] rounded-br-[3px] bg-[#dcebdc] p-3 text-xs leading-5">
            Your IntelliFleet delivery RGF-24091 is on its way. Estimated
            arrival: today, 16:40.
            <div className="mt-2 text-right text-[10px] text-[#77787b]">
              06:41 · Delivered
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
const FIXTURE_USER_ROWS = [
  ["Mara Santos", "Operations admin", "All workspaces", "Just now", "Active"],
  ["Ramon Dela Cruz", "Driver", "Fleet / assigned routes", "2m ago", "Active"],
  [
    "Leah Villanueva",
    "Warehouse manager",
    "Cavite cold store",
    "18m ago",
    "Active",
  ],
  ["Sofia Lim", "Client", "Metro Retail Group", "1h ago", "Active"],
  ["Paolo Reyes", "Dispatcher", "Central Luzon", "3h ago", "Invited"],
] as const;
function UsersTable() {
  const { data: live } = useQuery({
    queryKey: ["users"],
    queryFn: () => adminApi.listUsers(),
    staleTime: 5000,
    retry: false,
  });
  const rows =
    live && live.length
      ? live.map(
          (u) => [u.full_name, u.role, u.email, u.status, u.status] as const,
        )
      : FIXTURE_USER_ROWS;
  return (
    <TableFrame
      head={
        <>
          <th className="px-4 py-3">User</th>
          <th>Role</th>
          <th>Workspace</th>
          <th>Last active</th>
          <th>Status</th>
          <th />
        </>
      }
    >
      {rows.map((u, i) => (
        <tr key={u[0] + i}>
          <td className="px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e9e8e4] text-[10px] font-bold">
                {u[0]
                  .split(" ")
                  .map((x) => x[0])
                  .join("")}
              </div>
              <div>
                <div className="font-semibold">{u[0]}</div>
                <div className="mt-1 text-xs text-[#77787b]">
                  {live && live.length
                    ? live[i].email
                    : `user-${i + 1}@rgftrading.com`}
                </div>
              </div>
            </div>
          </td>
          <td>
            <StatusChip status={u[1]} tone="neutral" />
          </td>
          <td className="text-xs text-[#55565a]">{u[2]}</td>
          <td className="mono text-[11px]">{u[3]}</td>
          <td>
            <StatusChip status={u[4]} tone="good" />
          </td>
          <td>
            <MoreHorizontal size={16} />
          </td>
        </tr>
      ))}
    </TableFrame>
  );
}
const FIXTURE_ROLE_ROWS = [
  ["Dispatcher", "Routes, fleet, loads, alerts, communications, reports"],
  ["Driver", "Assigned routes, stops, status updates, history"],
  ["Warehouse Manager", "Loading, receiving, temperature exceptions"],
  ["Client", "Orders, tracking, delivery support"],
  ["Superadmin", "Users, roles, integrations, templates, audit log"],
] as const;
function Roles() {
  const { data: live } = useQuery({
    queryKey: ["roles"],
    queryFn: () => adminApi.listRoles(),
    staleTime: 5000,
    retry: false,
  });
  const rows =
    live && live.length
      ? live.map(
          (r) => [r.name, r.description || "No description set"] as const,
        )
      : FIXTURE_ROLE_ROWS;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([role, permissions]) => (
        <div className="border border-[#e4e3df] bg-white p-5" key={role}>
          <div className="flex items-center justify-between">
            <div className="font-semibold">{role}</div>
            <button
              data-testid={`button-edit-role-${role.toLowerCase().replace(" ", "-")}`}
              className="text-xs font-semibold underline underline-offset-2"
            >
              Edit
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#55565a]">{permissions}</p>
        </div>
      ))}
    </div>
  );
}
const INTEGRATION_STATE_LABEL: Record<string, string> = {
  not_connected: "Not Connected",
  sandbox: "Sandbox",
  live: "Live",
};
const NEXT_INTEGRATION_STATE: Record<
  string,
  "not_connected" | "sandbox" | "live"
> = { not_connected: "sandbox", sandbox: "live", live: "not_connected" };
function Integrations() {
  const defaults = [
    [
      "whatsapp",
      "WhatsApp",
      "Sandbox",
      "Messages can be previewed; provider connection is not live.",
    ],
    [
      "viber",
      "Viber",
      "Not Connected",
      "Planned channel surface for future provider credentials.",
    ],
    [
      "sms",
      "SMS",
      "Sandbox",
      "Mock delivery progression available in this demo.",
    ],
    [
      "voice",
      "Voice AI",
      "Not Connected",
      "Voice workflow is represented; no provider is connected.",
    ],
  ] as const;
  const queryClient = useQueryClient();
  const { data: live } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => adminApi.listIntegrations(),
    staleTime: 5000,
    retry: false,
  });
  const liveByProvider = Object.fromEntries(
    (live ?? []).map((i) => [i.provider, i]),
  );
  const cycle = async (provider: string, currentLabel: string) => {
    const currentKey = (Object.entries(INTEGRATION_STATE_LABEL).find(
      ([, v]) => v === currentLabel,
    )?.[0] ?? "not_connected") as "not_connected" | "sandbox" | "live";
    try {
      await adminApi.patchIntegration(
        provider,
        NEXT_INTEGRATION_STATE[currentKey],
      );
    } catch {
      /* mocked provider row may not exist yet in the live table */
    }
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {defaults.map(([provider, name, fallbackStatus, body]) => {
        const status = liveByProvider[provider]
          ? INTEGRATION_STATE_LABEL[liveByProvider[provider].state]
          : fallbackStatus;
        return (
          <button
            onClick={() => cycle(provider, status)}
            data-testid={`button-integration-${provider}`}
            className="border border-[#e4e3df] bg-white p-6 text-left hover:border-black"
            key={provider}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="micro text-[#77787b]">Provider</div>
                <h2 className="mt-3 text-2xl font-semibold">{name}</h2>
              </div>
              <StatusChip
                status={status}
                tone={status === "Sandbox" ? "warn" : "neutral"}
              />
            </div>
            <p className="mt-6 text-sm leading-6 text-[#55565a]">{body}</p>
            <div className="mt-7 border-t border-[#efeeeb] pt-4 text-xs text-[#77787b]">
              {liveByProvider[provider]
                ? `Last checked · ${liveByProvider[provider].last_checked}`
                : "Last checked · today, 06:30 PHT"}{" "}
              · click to cycle state
            </div>
          </button>
        );
      })}
    </div>
  );
}
const FIXTURE_AUDIT_ROWS = [
  ["06:42:12", "Mara Santos", "Acknowledged alert", "ALT-738", "AUD-00891"],
  ["06:41:55", "System", "Delivered message", "RGF-24091", "AUD-00890"],
  [
    "06:39:24",
    "Leah Villanueva",
    "Confirmed manifest",
    "RGF-24084",
    "AUD-00889",
  ],
  [
    "06:34:08",
    "Mara Santos",
    "Changed role permissions",
    "Dispatcher",
    "AUD-00888",
  ],
  [
    "06:28:46",
    "Ramon Dela Cruz",
    "Updated stop status",
    "STP-4402",
    "AUD-00887",
  ],
] as const;
function Audit() {
  const { data: live } = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => adminApi.listAuditLog(),
    staleTime: 5000,
    retry: false,
  });
  const rows =
    live && live.length
      ? live.map(
          (e) =>
            [
              e.event_time,
              e.actor_id || "System",
              e.action,
              `${e.target_entity} ${e.target_id}`,
              e.ROWID,
            ] as const,
        )
      : FIXTURE_AUDIT_ROWS;
  return (
    <TableFrame
      head={
        <>
          <th className="px-4 py-3">Timestamp</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Target</th>
          <th>Reference</th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r[4]}>
          <td className="mono px-4 py-4 text-[11px]">{r[0]}</td>
          <td className="text-sm">{r[1]}</td>
          <td className="text-sm font-semibold">{r[2]}</td>
          <td className="mono text-xs">{r[3]}</td>
          <td className="mono text-[11px] text-[#77787b]">{r[4]}</td>
        </tr>
      ))}
    </TableFrame>
  );
}

function DriverToday() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState("Awaiting response");
  return (
    <div className="mx-auto min-h-[100dvh] max-w-[520px] bg-[#fafaf8] px-5 py-5">
      <div className="flex items-center justify-between">
        <Logo />
        <div className="grid h-9 w-9 place-items-center rounded-full bg-black text-xs font-bold text-white">
          RD
        </div>
      </div>
      <div className="mt-12">
        <div className="micro text-[#77787b]">
          Tuesday, 26 August · 06:42 PHT
        </div>
        <h1 className="display-face mt-3 text-5xl font-bold leading-[.9]">
          Good morning,
          <br />
          Ramon.
        </h1>
        <p className="mt-5 text-sm text-[#55565a]">
          Your next move is ready when you are.
        </p>
      </div>
      <div className="mt-10 border border-[#e4e3df] bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="micro text-[#77787b]">Today’s assignment</div>
            <h2 className="display-face mt-3 text-3xl font-bold">
              Cavite → Cebu
            </h2>
          </div>
          <StatusChip status="New assignment" tone="neutral" />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 border-y border-[#e4e3df] py-4 text-xs">
          <div>
            <div className="text-[#77787b]">Stops</div>
            <div className="mono mt-1 font-semibold">04</div>
          </div>
          <div>
            <div className="text-[#77787b]">Cargo</div>
            <div className="mt-1 font-semibold">98 cases</div>
          </div>
          <div>
            <div className="text-[#77787b]">Departure</div>
            <div className="mono mt-1 font-semibold">07:00</div>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center bg-[#f2f2ef]">
            <Truck size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold">IF-204 · DCD 8953</div>
            <div className="mt-1 text-xs text-[#77787b]">
              Temperature-controlled · 18 t
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <button
          data-testid="button-driver-accept"
          onClick={() => {
            setState("Accepted");
            setLocation("/driver/route/RT-884");
          }}
          className="button-black min-h-[58px] rounded-[4px] text-base font-bold"
        >
          {state === "Accepted" ? "Accepted" : "Accept assignment"}{" "}
          <Check size={18} />
        </button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            data-testid="button-driver-decline"
            onClick={() => setState("Declined")}
            variant="outline"
            className="min-h-[52px] rounded-[4px]"
          >
            Decline
          </Button>
          <Button
            data-testid="button-driver-call"
            onClick={() => setState("Dispatch notified")}
            variant="outline"
            className="min-h-[52px] rounded-[4px]"
          >
            <Phone size={16} />
            Call dispatch
          </Button>
        </div>
      </div>
      <div
        data-testid="text-driver-state"
        className="mt-5 text-center text-xs text-[#77787b]"
      >
        {state}
      </div>
      <div className="mt-14 grid grid-cols-2 gap-3">
        <Link
          data-testid="driver-history-link"
          href="/driver/history"
          className="border border-[#e4e3df] bg-white p-4 text-sm font-semibold"
        >
          History <ArrowRight className="float-right" size={15} />
        </Link>
        <Link
          data-testid="driver-status-link"
          href="/driver/status"
          className="border border-[#e4e3df] bg-white p-4 text-sm font-semibold"
        >
          Update status <ArrowRight className="float-right" size={15} />
        </Link>
      </div>
      <AgentChat compact />
    </div>
  );
}
function DriverRoute() {
  const [list, setList] = useState([
    "En Route",
    "Loading",
    "Scheduled",
    "Scheduled",
  ]);
  const [, setLocation] = useLocation();
  return (
    <div className="mx-auto min-h-[100dvh] max-w-[520px] bg-[#fafaf8] px-5 py-5">
      <div className="flex items-center justify-between">
        <Link data-testid="driver-route-back" href="/driver/today">
          <ArrowRight className="rotate-180" size={19} />
        </Link>
        <div className="micro">Active route</div>
        <button data-testid="button-driver-menu">
          <MoreHorizontal size={19} />
        </button>
      </div>
      <div className="mt-10">
        <div className="micro text-[#77787b]">RT-884 · 4 stops</div>
        <h1 className="display-face mt-3 text-4xl font-bold">Cavite → Cebu</h1>
        <div className="mt-5 flex items-center gap-3 text-xs text-[#55565a]">
          <span className="h-2 w-2 rounded-full bg-[#1e7b44] live-dot" />
          On schedule · ETA tomorrow, 16:40
        </div>
      </div>
      <div className="route-flow mt-10 grid gap-3">
        {[
          "Cavite cold store",
          "Batangas cross-dock",
          "Cebu distribution hub",
          "Metro Retail Group · final delivery",
        ].map((stop, i) => (
          <div
            className="route-step border border-[#e4e3df] bg-white p-4"
            key={stop}
          >
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  "grid h-8 w-8 place-items-center rounded-full text-xs font-bold",
                  list[i] === "Delivered"
                    ? "bg-[#edf6f0] text-[#1e7b44]"
                    : list[i] === "En Route"
                      ? "bg-black text-white"
                      : "bg-[#f2f2ef]",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{stop}</div>
                <div className="mt-1 text-xs text-[#77787b]">
                  {i === 0
                    ? "Departed 07:04"
                    : i === 1
                      ? "Expected 11:25"
                      : i === 2
                        ? "Expected tomorrow 13:10"
                        : "Expected tomorrow 16:40"}
                </div>
              </div>
              <StatusChip status={list[i]} />
            </div>
            {i < 3 && (
              <button
                data-testid={`button-stop-status-${i}`}
                onClick={() =>
                  setList((a) =>
                    a.map((x, j) =>
                      j === i
                        ? x === "Scheduled"
                          ? "Arrived"
                          : x === "Arrived"
                            ? "Loading"
                            : x === "Loading"
                              ? "Loaded"
                              : "Delivered"
                        : x,
                    ),
                  )
                }
                className="mt-4 w-full border-t border-[#efeeeb] pt-3 text-left text-xs font-semibold"
              >
                Update stop status{" "}
                <ArrowRight className="float-right" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        data-testid="button-voice-command"
        onClick={() => setLocation("/driver/status")}
        className="button-black mt-7 flex min-h-[58px] w-full items-center justify-center gap-3 rounded-[4px] text-sm font-bold"
      >
        <Radio size={18} />
        Voice command
      </button>
    </div>
  );
}
function DriverStatus() {
  const [listening, setListening] = useState(false);
  return (
    <div className="mx-auto min-h-[100dvh] max-w-[520px] bg-[#fafaf8] px-5 py-5">
      <div className="flex items-center justify-between">
        <Link data-testid="driver-status-back" href="/driver/today">
          <ArrowRight className="rotate-180" size={19} />
        </Link>
        <div className="micro">Status update</div>
        <div className="w-5" />
      </div>
      <div className="mt-14 text-center">
        <div className="micro text-[#77787b]">Hands-free demo</div>
        <h1 className="display-face mt-4 text-5xl font-bold leading-none">
          Tell us what
          <br />
          changed.
        </h1>
        <p className="mx-auto mt-5 max-w-xs text-sm leading-6 text-[#55565a]">
          Tap the mic and try “I’ve arrived” or “temperature issue.”
        </p>
        <button
          data-testid="button-listening-mic"
          onClick={() => setListening(!listening)}
          className={cx(
            "relative mx-auto mt-12 grid h-28 w-28 place-items-center rounded-full bg-black text-white",
            listening &&
              "before:absolute before:inset-[-12px] before:rounded-full before:border before:border-[#c4291f]",
          )}
        >
          {listening ? <Activity size={31} /> : <Radio size={31} />}
        </button>
        <div
          data-testid="status-voice-listening"
          className="mt-7 text-sm font-semibold"
        >
          {listening ? "Listening… say a command" : "Ready for a voice command"}
        </div>
        {listening && (
          <button
            data-testid="button-mock-voice-response"
            onClick={() => setListening(false)}
            className="mt-5 text-sm text-link"
          >
            Use mock response: “I’ve arrived”
          </button>
        )}
      </div>
      <div className="mt-16 grid gap-2">
        {[
          "En Route",
          "Arrived",
          "Loading",
          "Loaded",
          "Delivered",
          "Vehicle Issue",
          "Temperature Issue",
        ].map((status, i) => (
          <button
            data-testid={`button-status-${status.toLowerCase().replaceAll(" ", "-")}`}
            onClick={() => setListening(false)}
            key={status}
            className="flex items-center justify-between border border-[#e4e3df] bg-white p-4 text-left text-sm font-semibold hover:border-black"
          >
            {status}
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}
function DriverHistory() {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-[520px] px-5 py-5">
      <div className="flex items-center justify-between">
        <Link data-testid="driver-history-back" href="/driver/today">
          <ArrowRight className="rotate-180" size={19} />
        </Link>
        <div className="micro">Route history</div>
        <div className="w-5" />
      </div>
      <h1 className="display-face mt-12 text-5xl font-bold">Your runs.</h1>
      <div className="mt-10 grid gap-3">
        {[
          ["25 Aug", "Manila → Tagaytay", "Delivered", "04h 12m"],
          ["24 Aug", "Cavite → Batangas", "Delivered", "02h 48m"],
          ["22 Aug", "Valenzuela → Baguio", "Partial", "08h 31m"],
          ["21 Aug", "Makati → Laguna", "Delivered", "03h 16m"],
        ].map((r) => (
          <div className="border border-[#e4e3df] bg-white p-5" key={r[0]}>
            <div className="flex items-start justify-between">
              <div>
                <div className="mono text-[10px] text-[#77787b]">{r[0]}</div>
                <div className="mt-2 font-semibold">{r[1]}</div>
              </div>
              <StatusChip status={r[2]} />
            </div>
            <div className="mt-5 text-xs text-[#77787b]">
              {r[3]} · 4 stops · IF-204
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Warehouse({
  page,
}: {
  page: "dashboard" | "loading" | "receiving" | "exceptions";
}) {
  const [checked, setChecked] = useState<number[]>([]);
  const isEx = page === "exceptions";
  const { data: warehouseAlerts } = useAlertsData();
  const title =
    page === "dashboard"
      ? "Dock dashboard"
      : page === "loading"
        ? "Loading checklist"
        : page === "receiving"
          ? "Receiving today"
          : "Temperature exceptions";
  return (
    <AppShell title={title}>
      <PageIntro
        eyebrow={`Warehouse / ${title}`}
        title={title}
        body="High-contrast worklists for the dock, the manifest, and the moments that need a decision."
        action={
          <Button
            onClick={() => setChecked([])}
            variant="outline"
            className="rounded-[4px]"
          >
            <RefreshCw size={14} />
            Refresh
          </Button>
        }
      />
      {page === "dashboard" && (
        <div className="grid gap-4 md:grid-cols-4">
          <Kpi
            label="Loading now"
            value="04"
            detail="2 docks active"
            icon={Container}
          />
          <Kpi
            label="Receiving today"
            value="17"
            detail="6 completed"
            icon={PackageCheck}
          />
          <Kpi
            label="Exceptions"
            value="03"
            detail="1 critical"
            icon={AlertTriangle}
          />
          <Kpi
            label="Avg dwell"
            value="42m"
            detail="-6m vs yesterday"
            icon={Clock3}
            tone="good"
          />
        </div>
      )}
      {isEx ? (
        <div className="grid gap-3 md:grid-cols-2">
          {warehouseAlerts
            .filter(
              (a) =>
                a.type.includes("Temperature") ||
                a.type.includes("Inventory") ||
                a.type.includes("Low"),
            )
            .map((a) => (
              <div className="border border-[#e8c3c0] bg-white p-5" key={a.id}>
                <div className="flex items-center justify-between">
                  <StatusChip status={a.severity} />
                  <span className="mono text-[10px] text-[#77787b]">
                    {a.id}
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-semibold">{a.message}</h2>
                <p className="mt-2 text-sm text-[#55565a]">
                  {a.vehicle} · {a.time}
                </p>
                <div className="mt-6 flex gap-2">
                  <Button
                    onClick={() =>
                      setChecked([...checked, Number(a.id.replace(/\D/g, ""))])
                    }
                    className="rounded-[4px] px-3 py-2 text-xs"
                  >
                    {checked.includes(Number(a.id.replace(/\D/g, "")))
                      ? "Acknowledged"
                      : "Acknowledge"}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-[4px] px-3 py-2 text-xs"
                  >
                    Escalate
                  </Button>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="border border-[#e4e3df] bg-white">
            {[
              ["Confirm seal number", "Seal 8841 matches outbound manifest"],
              ["Verify cargo count", "98 cases · 4 temperature zones"],
              ["Record departure temperature", "2.8°C at dock door 03"],
              ["Release vehicle", "Driver acknowledgement received"],
            ].map(([checkTitle, detail], i) => (
              <button
                data-testid={`button-checklist-${i}`}
                onClick={() =>
                  setChecked(
                    checked.includes(i)
                      ? checked.filter((x) => x !== i)
                      : [...checked, i],
                  )
                }
                className="flex w-full items-center gap-4 border-b border-[#efeeeb] p-5 text-left last:border-0"
                key={checkTitle}
              >
                <span
                  className={cx(
                    "grid h-7 w-7 place-items-center border",
                    checked.includes(i)
                      ? "border-black bg-black text-white"
                      : "border-[#d8d7d2]",
                  )}
                >
                  {checked.includes(i) && <Check size={15} />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">
                    {checkTitle}
                  </span>
                  <span className="mt-1 block text-xs text-[#77787b]">
                    {detail}
                  </span>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          <div className="border border-[#e4e3df] bg-white p-5">
            <div className="micro text-[#77787b]">Current manifest</div>
            <div className="display-face mt-3 text-4xl font-bold">
              {checked.length}/4
            </div>
            <div className="mt-2 text-sm text-[#55565a]">checks complete</div>
            <div className="mt-6 h-2 bg-[#e8e7e3]">
              <div
                className="h-full bg-[#1e7b44] transition-all"
                style={{ width: `${checked.length * 25}%` }}
              />
            </div>
            <Button
              onClick={() => setChecked([0, 1, 2, 3])}
              className="mt-8 w-full rounded-[4px]"
            >
              {page === "receiving"
                ? "Confirm receiving"
                : "Complete checklist"}{" "}
              <Check size={15} />
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Portal({ page }: { page: "orders" | "tracking" | "support" }) {
  const [supportSent, setSupportSent] = useState(false);
  const { id: trackingId } = useParams<{ id: string }>();
  const orderQuery = useQuery({
    queryKey: ["order", trackingId],
    queryFn: () => ordersApi.getOrder(trackingId as string),
    enabled: page === "tracking" && Boolean(trackingId),
    retry: false,
  });
  const { data: portalOrders } = useOrdersData("2026-01-01", "2027-12-31");
  if (page === "tracking" && orderQuery.isLoading)
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-[760px] items-center justify-center px-5 py-6 text-sm text-[#77787b]">
        Loading order {trackingId}…
      </div>
    );
  if (page === "tracking" && orderQuery.isError)
    return (
      <div className="mx-auto min-h-[100dvh] max-w-[760px] px-5 py-6">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            data-testid="portal-tracking-back"
            href="/portal/orders"
            className="text-sm text-link"
          >
            All orders
          </Link>
        </div>
        <div className="mt-16">
          <div className="micro text-[#77787b]">Order not found</div>
          <h1 className="display-face mt-4 text-4xl font-bold leading-none">
            We couldn’t find order {trackingId}.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-[#55565a]">
            This order id doesn’t match anything in the live orders table —
            double-check the link, or it may not be seeded yet.
          </p>
          <Link
            data-testid="portal-tracking-back-cta"
            href="/portal/orders"
            className="button-black mt-8 inline-flex rounded-full px-5 py-3 text-sm font-semibold"
          >
            Back to your orders
          </Link>
        </div>
      </div>
    );
  const liveOrder =
    page === "tracking" && orderQuery.data ? adaptOrder(orderQuery.data) : null;
  if (page === "support")
    return (
      <div className="mx-auto min-h-[100dvh] max-w-[760px] px-5 py-6">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            data-testid="portal-orders-back"
            href="/portal/orders"
            className="text-sm text-link"
          >
            Your orders
          </Link>
        </div>
        <div className="mt-16">
          <div className="micro text-[#77787b]">Customer support</div>
          <h1 className="display-face mt-4 text-5xl font-bold leading-none">
            We’re here for
            <br />
            the handoff.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-[#55565a]">
            Tell us what you need help with and the delivery team can pick it up
            from here.
          </p>
          <form
            className="mt-9 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSupportSent(true);
            }}
          >
            <label className="grid gap-2 text-sm font-semibold">
              Order reference
              <input
                data-testid="input-support-order"
                required
                className="border border-[#d8d7d2] bg-white p-3 outline-none"
                defaultValue="RGF-24091"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              How can we help?
              <textarea
                data-testid="input-support-message"
                required
                rows={5}
                className="resize-none border border-[#d8d7d2] bg-white p-3 outline-none"
                placeholder="Describe the question or issue"
              />
            </label>
            <Button type="submit" className="w-fit rounded-[4px]">
              {supportSent ? "Request received" : "Contact support"}{" "}
              <ArrowRight size={15} />
            </Button>
          </form>
        </div>
      </div>
    );
  if (page === "tracking")
    return (
      <div className="mx-auto min-h-[100dvh] max-w-[760px] px-5 py-6">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            data-testid="portal-tracking-back"
            href="/portal/orders"
            className="text-sm text-link"
          >
            All orders
          </Link>
        </div>
        <div className="mt-14">
          <div className="micro text-[#77787b]">
            {"Live delivery · "}
            {liveOrder?.id ?? trackingId}
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <h1 className="display-face text-5xl font-bold leading-none">
              On its way.
            </h1>
            <StatusChip status={liveOrder?.status ?? "En Route"} />
          </div>
          <p className="mt-4 text-sm text-[#55565a]">
            {liveOrder
              ? liveOrder.customer + " · " + liveOrder.route
              : "Metro Retail Group · Cavite → Cebu"}
          </p>
          <div className="mt-8 h-[320px] border border-[#e4e3df]">
            <MockMap />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border border-[#e4e3df] bg-white p-5">
            <div>
              <div className="micro text-[#77787b]">Arrives</div>
              <div className="display-face mt-2 text-xl font-bold">
                {liveOrder?.eta ?? "16:40"}
              </div>
              <div className="mt-1 text-xs text-[#77787b]">Today</div>
            </div>
            <div>
              <div className="micro text-[#77787b]">Temperature</div>
              <div className="display-face mt-2 text-xl font-bold">
                {liveOrder?.temperature ?? "2.8°C"}
              </div>
              <div className="mt-1 text-xs text-[#1e7b44]">Within range</div>
            </div>
            <div>
              <div className="micro text-[#77787b]">Driver</div>
              <div className="mt-2 text-sm font-semibold">
                {liveOrder ? "Assigned" : "Marco Santos"}
              </div>
              <div className="mt-1 text-xs text-[#77787b]">
                {liveOrder?.vehicle ?? "IF-204"}
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-[#e4e3df] pt-6">
            <div className="micro mb-5 text-[#77787b]">Delivery milestones</div>
            {[
              "Order confirmed",
              "Loaded at Cavite",
              "In transit",
              "Delivery handoff",
            ].map((x, i) => (
              <div className="mb-5 flex items-center gap-3 text-sm" key={x}>
                <span
                  className={cx(
                    "grid h-6 w-6 place-items-center rounded-full",
                    i < 3 ? "bg-black text-white" : "border border-[#d8d7d2]",
                  )}
                >
                  {i < 3 ? <Check size={13} /> : i + 1}
                </span>
                <span className={i < 3 ? "font-semibold" : "text-[#77787b]"}>
                  {x}
                </span>
                {i < 3 && (
                  <span className="mono ml-auto text-[10px] text-[#77787b]">
                    {["06:08", "07:01", "09:18"][i]}
                  </span>
                )}
              </div>
            ))}
          </div>
          <Link
            data-testid="portal-support-link"
            href="/portal/support"
            className="button-black mt-4 flex rounded-[4px]"
          >
            Need help? Contact support{" "}
            <ArrowRight className="ml-auto" size={15} />
          </Link>
        </div>
      </div>
    );
  return (
    <div className="mx-auto min-h-[100dvh] max-w-[760px] px-5 py-6">
      <div className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#77787b]">Metro Retail Group</span>
          <div className="grid h-8 w-8 place-items-center rounded-full bg-black text-xs font-bold text-white">
            MR
          </div>
        </div>
      </div>
      <div className="mt-14">
        <div className="micro text-[#77787b]">Your deliveries</div>
        <h1 className="display-face mt-4 text-5xl font-bold leading-none">
          A clear view
          <br />
          of what’s moving.
        </h1>
        <p className="mt-5 text-sm leading-6 text-[#55565a]">
          Updates are kept simple. Open an order for live movement and delivery
          detail.
        </p>
      </div>
      <div className="mt-10 grid gap-3">
        {portalOrders.slice(0, 4).map((o) => (
          <Link
            data-testid={`portal-order-${o.id}`}
            href={`/portal/orders/${o.id}`}
            className="block border border-[#e4e3df] bg-white p-5 hover:border-black"
            key={o.id}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="mono text-[10px] text-[#77787b]">{o.id}</div>
                <div className="mt-2 font-semibold">{o.route}</div>
                <div className="mt-1 text-xs text-[#77787b]">{o.customer}</div>
              </div>
              <StatusChip status={o.status} />
            </div>
            <div className="mt-5 flex justify-between border-t border-[#efeeeb] pt-4 text-xs">
              <span className="text-[#77787b]">Estimated arrival</span>
              <span className="font-semibold">{o.eta}</span>
            </div>
          </Link>
        ))}
      </div>
      <Link
        data-testid="portal-support-cta"
        href="/portal/support"
        className="mt-8 inline-flex text-sm text-link"
      >
        Have a question? Contact support{" "}
        <ArrowRight className="ml-2" size={15} />
      </Link>
    </div>
  );
}

function RouteLocationInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: routesApi.RouteLocationSuggestion | null;
  onChange: (value: routesApi.RouteLocationSuggestion | null) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value?.label || "");
  const [suggestions, setSuggestions] = useState<
    routesApi.RouteLocationSuggestion[]
  >([]);
  useEffect(() => {
    const query = text.trim();
    if (value?.label === text || query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(
      () =>
        routesApi
          .searchRouteLocations(query)
          .then(setSuggestions)
          .catch(() => setSuggestions([])),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [text, value]);
  return (
    <div className="relative grid gap-2">
      <label className="text-xs font-semibold">{label}</label>
      <input
        required
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(null);
        }}
        placeholder={placeholder}
        className="border border-[#d8d7d2] px-3 py-3 text-sm font-normal outline-none focus:border-black"
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-[58px] z-20 max-h-56 overflow-auto border border-[#d8d7d2] bg-white shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              type="button"
              key={`${suggestion.lat}-${suggestion.lng}-${index}`}
              onClick={() => {
                setText(suggestion.label);
                setSuggestions([]);
                onChange(suggestion);
              }}
              className="block w-full border-b border-[#efeeeb] px-3 py-2 text-left text-xs hover:bg-[#f2f2ef]"
            >
              <span className="block font-semibold">
                {suggestion.label.split(",").slice(0, 2).join(",")}
              </span>
              <span className="mt-1 block text-[10px] text-[#77787b]">
                {suggestion.type} · Philippines
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyRouteWorkspaceV2({
  onNotice,
}: {
  onNotice: (s: string) => void;
}) {
  const { data: vehicles } = useVehiclesData();
  const { data: warehouses = [] } = useQuery({
    queryKey: ["route-warehouses"],
    queryFn: routesApi.listRouteWarehouses,
  });
  const [origin, setOrigin] =
    useState<routesApi.RouteLocationSuggestion | null>(null);
  const [destination, setDestination] =
    useState<routesApi.RouteLocationSuggestion | null>(null);
  const [stops, setStops] = useState<routesApi.RouteLocationSuggestion[]>([]);
  const [mode, setMode] = useState("fastest");
  const [returnToWarehouse, setReturnToWarehouse] = useState(true);
  const [returnWarehouseId, setReturnWarehouseId] = useState("");
  const [plan, setPlan] = useState<routesApi.RoutePlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [fleetPlan, setFleetPlan] =
    useState<routesApi.OptimizeFleetPreviewResult | null>(null);
  const [fleetBusy, setFleetBusy] = useState(false);
  const [fleetError, setFleetError] = useState("");
  const [fleetApplying, setFleetApplying] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const validate = () => "";
  const calculate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (!origin || !destination) {
      setError("Choose a starting point and destination from the suggestions.");
      setBusy(false);
      return;
    }
    try {
      setPlan(await routesApi.planRoute(origin, destination, mode, stops, { returnToWarehouse, returnWarehouseId }));
    } catch (err: any) {
      setError(err?.message || "Unable to calculate this route.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: string) =>
    setSelectedVehicles((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const save = async () => {
    if (!plan || !selectedVehicles.length) return;
    setSaving(true);
    setError("");
    try {
      for (const vehicleId of selectedVehicles) {
        const route = await routesApi.createRoute({
          name: `${plan.origin.label} -> ${plan.destination.label}`,
          mode: plan.mode,
          distanceKm: plan.distanceKm,
          durationMin: plan.durationMin,
          cost: plan.cost,
          status: "planned",
          returnToWarehouse: plan.returnToWarehouse,
          returnWarehouseId: plan.returnWarehouse?.id,
        });
        const routeId = String(
          (route as routesApi.ApiRoute & { id?: number | string }).id ??
            route.ROWID,
        );
        await routesApi.createRouteStop(routeId, {
          sequence: 1,
          locationName: plan.origin.label,
          lat: plan.origin.lat,
          lng: plan.origin.lng,
        });
        for (const [index, stop] of plan.stops.entries())
          await routesApi.createRouteStop(routeId, {
            sequence: index + 2,
            locationName: stop.label,
            lat: stop.lat,
            lng: stop.lng,
          });
        await routesApi.createRouteStop(routeId, {
          sequence: plan.stops.length + 2,
          locationName: plan.destination.label,
          lat: plan.destination.lat,
          lng: plan.destination.lng,
        });
        await routesApi.createManifest({
          routeId,
          vehicleId,
          status: "assigned",
          cargoType: "General",
        });
      }
      setAssignOpen(false);
      onNotice(
        `${selectedVehicles.length} real route${selectedVehicles.length === 1 ? "" : "s"} created and assigned.`,
      );
    } catch (err: any) {
      setError(err?.message || "Could not save the route assignments.");
    } finally {
      setSaving(false);
    }
  };
  const optimizeFleet = async () => {
    setFleetBusy(true);
    setFleetError("");
    setFleetPlan(null);
    try {
      const objective = mode;
      setFleetPlan(
        await routesApi.previewFleetOptimization(objective, "initial", undefined, { returnToWarehouse, returnWarehouseId }),
      );
    } catch (err: any) {
      setFleetError(err?.message || "Could not optimize the live fleet.");
    } finally {
      setFleetBusy(false);
    }
  };
  const applyFleet = async () => {
    if (!fleetPlan?.runId) return;
    setFleetApplying(true);
    setFleetError("");
    try {
      const result = await routesApi.applyFleetOptimization(fleetPlan.runId);
      onNotice(
        `${result.routes.length} optimized route${result.routes.length === 1 ? "" : "s"} applied to the live fleet.`,
      );
      setFleetPlan(null);
    } catch (err: any) {
      setFleetError(err?.message || "Could not apply this optimization.");
    } finally {
      setFleetApplying(false);
    }
  };
  const saveRoute = async () => {
    const validation = validate();
    if (validation || !plan || !vehicles.length) {
      setError(
        validation ||
          "Calculate a route and make sure a live vehicle is available.",
      );
      return;
    }
    setSavingRoute(true);
    setError("");
    try {
      const route = await routesApi.createRoute({
        name: `${plan.origin.label} -> ${plan.destination.label}`,
        mode: plan.mode,
        distanceKm: plan.distanceKm,
        durationMin: plan.durationMin,
        cost: plan.cost,
        status: "ready",
        returnToWarehouse: plan.returnToWarehouse,
        returnWarehouseId: plan.returnWarehouse?.id,
      });
      const routeId = String(
        (route as routesApi.ApiRoute & { id?: number | string }).id ??
          route.ROWID,
      );
      await routesApi.createRouteStop(routeId, {
        sequence: 1,
        locationName: plan.origin.label,
        lat: plan.origin.lat,
        lng: plan.origin.lng,
      });
      for (const [index, stop] of plan.stops.entries())
        await routesApi.createRouteStop(routeId, {
          sequence: index + 2,
          locationName: stop.label,
          lat: stop.lat,
          lng: stop.lng,
        });
      await routesApi.createRouteStop(routeId, {
        sequence: plan.stops.length + 2,
        locationName: plan.destination.label,
        lat: plan.destination.lat,
        lng: plan.destination.lng,
      });
      await routesApi.createManifest({
        routeId,
        vehicleId: vehicles[0].id,
        status: "assigned",
        cargoType: "General",
      });
      onNotice("Route saved and assigned to the first available live vehicle.");
    } catch (err: any) {
      setError(err?.message || "Unable to save route.");
    } finally {
      setSavingRoute(false);
    }
  };
  return (
    <div>
      <AssignmentPanel onNotice={onNotice} />
      <div className="grid gap-4 lg:grid-cols-[370px_1fr]">
        <form
          onSubmit={calculate}
          className="border border-[#e4e3df] bg-white p-5"
        >
          <div className="micro text-[#77787b]">Route builder</div>
          <h2 className="display-face mt-3 text-2xl font-bold">
            Plan a live route
          </h2>
          <div className="mt-6 grid gap-4">
            <GooglePlaceInput
              label="Starting point"
              value={origin}
              onChange={setOrigin}
              placeholder="Search any Metro Manila or Philippine location"
            />
            <GooglePlaceInput
              label="Destination"
              value={destination}
              onChange={setDestination}
              placeholder="Search a destination"
            />
            <div className="border border-[#e4e3df] bg-[#fafaf8] p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={returnToWarehouse}
                  onChange={(event) => setReturnToWarehouse(event.target.checked)}
                />
                Return to warehouse
              </label>
              {returnToWarehouse && (
                <div className="mt-3 grid gap-2 text-xs">
                  {warehouses.map((warehouse) => (
                    <label key={warehouse.id} className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="return-warehouse"
                        checked={returnWarehouseId === warehouse.id}
                        onChange={() => setReturnWarehouseId(warehouse.id)}
                      />
                      <span>
                        <span className="font-semibold">{warehouse.name}</span>
                        <span className="mt-0.5 block text-[#77787b]">{warehouse.address}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-7 micro text-[#77787b]">Optimization mode</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["fastest", "Fastest"],
              ["cheapest", "Lowest cost"],
              ["shortest", "Shortest"],
              ["balanced", "Balanced"],
            ].map(([value, label]) => (
              <button
                type="button"
                data-testid={`button-route-mode-${value}`}
                onClick={() => setMode(value)}
                className={cx(
                  "border px-2 py-2 text-xs font-semibold",
                  mode === value
                    ? "border-black bg-black text-white"
                    : "border-[#d8d7d2]",
                )}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            type="submit"
            disabled={busy || !origin || !destination}
            className="mt-7 w-full rounded-[4px]"
          >
            {busy ? "Calculating..." : "Calculate real route"}{" "}
            <ArrowRight size={15} />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={optimizeFleet}
            disabled={fleetBusy}
            className="mt-3 w-full rounded-[4px]"
          >
            {fleetBusy
              ? "Optimizing live fleet..."
              : "Optimize pending deliveries"}{" "}
            <Activity size={15} />
          </Button>
          {error && (
            <div className="mt-4 border border-[#c4291f] bg-[#fbeceb] p-3 text-xs text-[#c4291f]">
              {error}
            </div>
          )}
          {fleetError && (
            <div className="mt-4 border border-[#c4291f] bg-[#fbeceb] p-3 text-xs text-[#c4291f]">
              {fleetError}
            </div>
          )}
          {plan && (
            <Button
              type="button"
              onClick={() => {
                setSelectedVehicles(vehicles.length ? [vehicles[0].id] : []);
                setAssignOpen(true);
              }}
              disabled={!vehicles.length}
              className="mt-3 w-full rounded-[4px]"
            >
              Save & assign trucks <Truck size={15} />
            </Button>
          )}
        </form>
        <div className="grid gap-4">
          <div className="min-h-[420px] border border-[#e4e3df] bg-white">
            <LiveRouteMap plan={plan} vehicles={[]} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Distance", plan ? `${plan.distanceKm.toFixed(1)} km` : "-"],
              ["Duration", plan ? `${Math.round(plan.durationMin)} min` : "-"],
              [
                "Est. operating cost",
                plan ? `₱${plan.cost.toLocaleString()}` : "-",
              ],
            ].map(([label, value]) => (
              <div className="border border-[#e4e3df] bg-white p-4" key={label}>
                <div className="micro text-[#77787b]">{label}</div>
                <div className="display-face mt-4 text-2xl font-bold">
                  {value}
                </div>
              </div>
            ))}
          </div>
          {plan && (
            <div className="border border-[#e4e3df] bg-white p-4 text-xs text-[#55565a]">
              <strong className="text-black">{plan.objectiveNote}</strong> ·{" "}
              {plan.routing?.trafficAware
                ? "Traffic-aware Mapbox routing."
                : "Traffic data unavailable; normal road speeds used."}{" "}
              · {plan.routing?.provider || "Provider"} /{" "}
              {plan.routing?.profile || "profile"}.
              <div className="mt-2">
                Distance cost: ₱
                {plan.costBreakdown?.distance.toLocaleString() || "0"} · Time
                cost: ₱{plan.costBreakdown?.time.toLocaleString() || "0"}
              </div>
            </div>
          )}
          {fleetPlan && (
            <div
              className="border border-[#e4e3df] bg-white p-4"
              data-testid="fleet-optimization-result"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="micro text-[#77787b]">
                    Live fleet proposal
                  </div>
                  <h3 className="mt-2 text-lg font-bold">
                    {fleetPlan.objective} assignment
                  </h3>
                </div>
                <StatusChip
                  status={fleetPlan.feasible ? "Proposed" : "Not feasible"}
                  tone={fleetPlan.feasible ? "good" : "neutral"}
                />
              </div>
              {fleetPlan.message && (
                <p className="mt-3 text-xs text-[#55565a]">
                  {fleetPlan.message}
                </p>
              )}
              {fleetPlan.routes?.map((route) => (
                <div
                  className="mt-3 border-t border-[#efeeeb] pt-3 text-xs"
                  key={route.vehicle_id}
                >
                  <div className="flex justify-between font-semibold">
                    <span>Vehicle {route.vehicle_id}</span>
                    <span>
                      {route.total_distance_km.toFixed(1)} km ·{" "}
                      {Math.round(route.total_duration_min)} min
                    </span>
                  </div>
                  <div className="mt-1 text-[#77787b]">
                    {route.stops.length
                      ? route.stops
                          .map((stop) => stop.location_name)
                          .join(" → ")
                      : "No assigned stops"}
                  </div>
                </div>
              ))}
              {fleetPlan.feasible && fleetPlan.runId && (
                <Button
                  type="button"
                  onClick={applyFleet}
                  disabled={fleetApplying}
                  className="mt-4 w-full rounded-[4px]"
                >
                  {fleetApplying
                    ? "Applying..."
                    : "Apply optimized assignments"}{" "}
                  <Check size={15} />
                </Button>
              )}
            </div>
          )}
        </div>
        {assignOpen && (
          <div
            className="fixed inset-0 z-[2000] grid place-items-center bg-black/30 p-4"
            onClick={() => setAssignOpen(false)}
          >
            <div
              className="w-full max-w-md border border-[#e4e3df] bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Assign trucks</h3>
                <button type="button" onClick={() => setAssignOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <p className="mt-2 text-xs text-[#77787b]">
                Select one or more live vehicles for this route.
              </p>
              <div className="mt-5 grid gap-2">
                {vehicles.map((vehicle) => (
                  <label
                    key={vehicle.id}
                    className="flex cursor-pointer items-center gap-3 border border-[#e4e3df] p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedVehicles.includes(vehicle.id)}
                      onChange={() => toggle(vehicle.id)}
                    />
                    <span className="font-semibold">{vehicle.plate}</span>
                    <span className="text-xs text-[#77787b]">
                      {vehicle.speed} kph · {vehicle.fuel}% fuel
                    </span>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                onClick={save}
                disabled={saving || !selectedVehicles.length}
                className="mt-5 w-full rounded-[4px]"
              >
                {saving
                  ? "Creating routes..."
                  : `Create ${selectedVehicles.length || ""} route${selectedVehicles.length === 1 ? "" : "s"}`}{" "}
                <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const UNASSIGNED_REASON_LABEL: Record<
  routesApi.UnassignedOrder["reason"],
  string
> = {
  ORDER_TOO_HEAVY: "Too heavy for any available vehicle",
  NO_COMPATIBLE_VEHICLE: "No vehicle supports the required temperature",
  TIME_WINDOW_INFEASIBLE: "Delivery time window cannot be met",
  NO_REACHABLE_VEHICLE: "No feasible vehicle/schedule combination found",
};

function AssignmentPanel({ onNotice }: { onNotice: (s: string) => void }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const ids = (new URLSearchParams(window.location.search).get("assign") || "")
    .split(",")
    .filter(Boolean);
  const id = ids[0] || null;
  const options = useQuery({
    queryKey: ["assignment", id, ids.slice(1).join(",")],
    queryFn: () => inventoryApi.getAssignmentOptions(id!, ids.slice(1)),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });
  const [vehicle, setVehicle] = useState("");
  const [driverIds, setDriverIds] = useState<number[]>([]);
  const [newDriverOpen, setNewDriverOpen] = useState(false);
  const [newDriver, setNewDriver] = useState({
    name: "",
    email: "",
    phone: "",
    title: "DELIVERY DRIVER",
    warehouse: "",
  });
  // Set once the n8n Staff Directory row exists, so a retry after a failed
  // assignment reuses it instead of creating a duplicate record.
  const [createdDriver, setCreatedDriver] =
    useState<inventoryApi.CreatedDriver | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assignmentPreview, setAssignmentPreview] = useState<{
    salesOrderIds: string[];
    vehicleId: string;
    driverIds: number[];
    subject: string;
    htmlBody: string;
  } | null>(null);
  const toggleDriver = (driverId: number) => {
    setDriverIds((current) =>
      current.includes(driverId)
        ? current.filter((existing) => existing !== driverId)
        : [...current, driverId],
    );
  };
  if (!id) return null;
  if (options.isLoading)
    return (
      <div className="mb-4 border border-[#e4e3df] bg-white p-5 text-sm">
        Loading assignment options…
      </div>
    );
  if (options.isError || !options.data)
    return (
      <div className="mb-4 border border-[#c4291f] bg-[#fbeceb] p-5 text-sm">
        {(options.error as Error)?.message || "Could not load assignment options."}
      </div>
    );
  const data = options.data;
  const alreadyAssigned = data.order.assignment_status === "assigned";
  const selected = data.vehicles.find((v) => v.vehicle_id === vehicle);
  const newDriverWarehouseDefault = /glacier/i.test(selected?.capacity_note || "")
    ? "GLACIER"
    : /mets/i.test(selected?.capacity_note || "")
      ? "METS"
      : "";
  // Total weight of every selected order (null while any is unverified - never treated as over).
  const selectedWeightKg =
    data.order.selected_weight_kg !== undefined
      ? data.order.selected_weight_kg
      : data.order.weight_kg;
  // Over-capacity is a warning only; the user can always assign. Only a reefer mismatch or an
  // already-assigned order blocks.
  const overageFor = (v: (typeof data.vehicles)[number]) =>
    capacityOverage(
      selectedWeightKg,
      v.capacity_kg == null ? null : v.capacity_kg - v.assigned_weight_kg,
      v.capacity_kg,
    );
  const selectedOverage = selected ? overageFor(selected) : null;
  const blocked =
    alreadyAssigned ||
    Boolean(
      selected && data.order.requires_reefer && selected.reefer === false,
    );
  const confirm = async () => {
    if (alreadyAssigned) {
      setError(
        "This sales order is already assigned. Open Confirmed SO to review or edit the assignment.",
      );
      return;
    }
    if (!vehicle || blocked) return;
    if (newDriverOpen && !createdDriver) {
      const missing = [
        !newDriver.name.trim() && "Name",
        !newDriver.email.trim() && "Email",
        !newDriver.phone.trim() && "Mobile Number",
      ].filter(Boolean);
      if (missing.length) {
        setError(`New driver: ${missing.join(", ")} required.`);
        return;
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newDriver.email.trim())) {
        setError("New driver: enter a valid email address.");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      let assignedDriverIds = driverIds;
      if (newDriverOpen) {
        let driver = createdDriver;
        if (!driver) {
          driver = await inventoryApi.createNewDriver({
            name: newDriver.name.trim(),
            email: newDriver.email.trim(),
            phone: newDriver.phone.trim(),
            title: newDriver.title,
            warehouse: newDriver.warehouse || newDriverWarehouseDefault,
          });
          setCreatedDriver(driver);
          options.refetch();
        }
        assignedDriverIds = [...driverIds.filter((d) => d !== driver!.id), driver.id];
      }
      const assigned: any = await inventoryApi.assignSalesOrders(ids, vehicle, assignedDriverIds);
      const overCapacityNote = assigned?.over_capacity
        ? ` Warning: over capacity by ${Number(assigned.over_capacity_kg).toLocaleString("en-US", { maximumFractionDigits: 1 })} kg (${Number(assigned.over_capacity_percent).toLocaleString("en-US", { maximumFractionDigits: 1 })}%).`
        : "";
      await queryClient.invalidateQueries({ queryKey: ["dispatch-dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-sales-orders"] });
      if (!assignedDriverIds.length) {
        onNotice(`${ids.length} sales order${ids.length === 1 ? "" : "s"} assigned to ${vehicle}. Third-party truck has no staff notification recipient.${overCapacityNote}`);
        return;
      }
      const preview = await inventoryApi.sendAssignmentEmail(
        ids,
        vehicle,
        assignedDriverIds,
        { preview: true },
      );
      if (!preview.driverHtmlBody || !preview.driverSubject)
        throw new Error(
          preview.error || "Assignment email preview could not be generated.",
        );
      setAssignmentPreview({
        salesOrderIds: ids,
        vehicleId: vehicle,
        driverIds: assignedDriverIds,
        subject: preview.driverSubject,
        htmlBody: preview.driverHtmlBody,
      });
      onNotice(
        `${ids.length} sales order${ids.length === 1 ? "" : "s"} assigned to ${vehicle}.${overCapacityNote}`,
      );
    } catch (e: any) {
      setError(e?.message || "Assignment failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="mb-5 border border-[#0b0b0b] bg-[#fafaf8] p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="micro text-[#77787b]">
              Routes / truck assignment
            </div>
            <h2 className="display-face mt-2 text-2xl font-bold">
              Assign {ids.length} selected sales order
              {ids.length === 1 ? "" : "s"}
            </h2>
          </div>
          <button onClick={() => navigate("/app/routes")}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 grid gap-3 border-y border-[#e4e3df] py-4 text-sm md:grid-cols-3">
          <div>
            <span className="text-xs text-[#77787b]">Customer</span>
            <div>{data.order.customer ?? "-"}</div>
          </div>
          <div>
            <span className="text-xs text-[#77787b]">Weight</span>
            <div>{data.order.weight_kg == null ? "Not verified from Zoho" : `${data.order.weight_kg.toFixed(1)} kg`}</div>
            {data.order.weight_warning && <div className="mt-1 text-[11px] text-[#9a5b00]">{data.order.weight_warning}</div>}
          </div>
          <div>
            <span className="text-xs text-[#77787b]">Cold-chain</span>
            <div>
              {data.order.requires_reefer ? "Reefer required" : "Not required"}{" "}
              <span className="rounded border border-[#d8d7d2] px-1 text-[9px] uppercase tracking-wider text-[#77787b]">
                inferred
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 border-b border-[#e4e3df] pb-4 text-base font-bold leading-7 text-black">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#55565a]">
            Selected sales orders
          </div>
          {ids.map((selectedId) => (
            <div key={selectedId} className="rounded bg-white px-2 py-1">
              SO {selectedId === id ? data.order.number || selectedId : selectedId}
            </div>
          ))}
        </div>
        {alreadyAssigned && (
          <div className="mt-4 border border-[#a16819] bg-[#fff7e6] p-3 text-sm text-[#7a4b00]">
            This sales order is already assigned. No new assignment or email
            preview will be created.
          </div>
        )}
        <div className="mt-4 text-xs text-[#77787b]">
          {data.constraint_status}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {data.vehicles.map((v) => {
            const overage = overageFor(v);
            const over = Boolean(overage);
            const reeferMismatch =
              data.order.requires_reefer && v.reefer === false;
            return (
              <label
                key={v.vehicle_id}
                className={`flex cursor-pointer items-center justify-between gap-3 border p-3 text-sm ${over || reeferMismatch ? "border-[#c4291f] bg-[#fbeceb] text-[#86000B]" : "border-[#e4e3df]"}`}
              >
                <span>
                  <input
                    type="radio"
                    name="vehicle"
                    value={v.vehicle_id}
                    checked={vehicle === v.vehicle_id}
                    onChange={() => setVehicle(v.vehicle_id)}
                    disabled={reeferMismatch}
                  />{" "}
                  <b>{v.vehicle_id}</b> · {v.vehicle_type}
                  {v.third_party ? " · 3PL" : ""}
                  {v.capacity_note && (
                    <span className="ml-2 text-[10px] text-[#a15c00]">
                      {v.capacity_note}
                    </span>
                  )}
                </span>
                <span className="text-xs">
                  {v.remaining_capacity_kg === null
                    ? "Capacity not rated"
                    : `${v.remaining_capacity_kg.toFixed(1)} kg available (${v.assigned_weight_kg.toFixed(1)} kg loaded)`}
                  {overage && (
                    <span className="mt-0.5 block font-semibold text-[#c4291f]" data-testid="over-capacity-warning">
                      {overage.text}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {selectedOverage && (
          <div role="alert" className="mt-3 border border-[#c4291f] bg-[#fbeceb] p-3 text-sm font-semibold text-[#c4291f]">
            {vehicle}: {selectedOverage.text}. You can still assign this truck.
          </div>
        )}
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#55565a]">
            Assign driver(s) — optional, select all that apply
          </div>
          <div className="grid gap-1 border border-[#d8d7d2] bg-white p-2 text-sm md:grid-cols-2">
            {data.drivers.length === 0 && (
              <div className="text-xs text-[#77787b]">
                No active riders/drivers/helpers available.
              </div>
            )}
            {data.drivers.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-2 px-1 py-1"
              >
                <input
                  type="checkbox"
                  checked={driverIds.includes(d.id)}
                  onChange={() => toggleDriver(d.id)}
                />
                <span>
                  {d.name}
                  {d.title ? ` · ${d.title}` : ""}
                </span>
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-2 px-1 py-1 font-semibold">
              <input
                type="checkbox"
                checked={newDriverOpen}
                disabled={Boolean(createdDriver)}
                onChange={() => setNewDriverOpen((open) => !open)}
              />
              <span>+ New Driver</span>
            </label>
          </div>
          {newDriverOpen && (
            <div className="mt-2 border border-[#d8d7d2] bg-white p-3 text-sm">
              <div className="mb-2 text-xs text-[#77787b]">
                {createdDriver
                  ? `${createdDriver.name} was added to the Staff Directory (ID ${createdDriver.id}) and will be assigned.`
                  : "Adds this driver to the Logistics Staff Directory, then assigns and notifies them by email, WhatsApp, SMS and voice call."}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {(
                  [
                    ["name", "Name*", "text", "Juan Dela Cruz"],
                    ["email", "Email*", "email", "juan@example.com"],
                    ["phone", "Mobile Number*", "tel", "09171234567"],
                  ] as const
                ).map(([key, label, type, placeholder]) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="text-xs text-[#55565a]">{label}</span>
                    <input
                      type={type}
                      required
                      placeholder={placeholder}
                      value={newDriver[key]}
                      disabled={Boolean(createdDriver)}
                      onChange={(e) =>
                        setNewDriver((d) => ({ ...d, [key]: e.target.value }))
                      }
                      className="border border-[#d8d7d2] px-2 py-1"
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[#55565a]">Title</span>
                  <select
                    value={newDriver.title}
                    disabled={Boolean(createdDriver)}
                    onChange={(e) =>
                      setNewDriver((d) => ({ ...d, title: e.target.value }))
                    }
                    className="border border-[#d8d7d2] px-2 py-1"
                  >
                    <option value="DELIVERY DRIVER">Delivery Driver</option>
                    <option value="DELIVERY HELPER">Delivery Helper</option>
                    <option value="MC RIDER">MC Rider</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[#55565a]">Warehouse</span>
                  <select
                    value={newDriver.warehouse || newDriverWarehouseDefault}
                    disabled={Boolean(createdDriver)}
                    onChange={(e) =>
                      setNewDriver((d) => ({ ...d, warehouse: e.target.value }))
                    }
                    className="border border-[#d8d7d2] px-2 py-1"
                  >
                    <option value="">Not set</option>
                    <option value="METS">METS</option>
                    <option value="GLACIER">GLACIER</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>
        {error && <div className="mt-3 text-sm text-[#c4291f]">{error}</div>}
        <button
          onClick={confirm}
          disabled={
            !vehicle ||
            blocked ||
            busy ||
            (newDriverOpen &&
              !createdDriver &&
              !(newDriver.name.trim() && newDriver.email.trim() && newDriver.phone.trim()))
          }
          className="button-black mt-4 px-4 py-2 text-sm disabled:opacity-40"
        >
          {busy ? "Assigning…" : "Confirm assignment"}
        </button>
      </section>
      {assignmentPreview && (
        <AssignmentEmailPreviewModal
          preview={assignmentPreview}
          onClose={() => setAssignmentPreview(null)}
          onSent={() => onNotice("Assignment email sent successfully.")}
        />
      )}
    </>
  );
}

const peso = (value: number) => `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Clock time the truck is back at the warehouse: calculation time + driving + assumed service time at each delivery.
function returnEta(plan: routesApi.RoutePlanResult): string | null {
  if (!plan.roundTrip?.return) return null;
  const deliveries = plan.stops.length + 1;
  const service = (plan.costAssumptions?.serviceMinPerStop ?? 30) * deliveries;
  return etaLabel(plan.routing?.calculatedAt, plan.roundTrip.total.durationMin + service);
}

function RouteWorkspace({ onNotice }: { onNotice: (s: string) => void }) {
  const { data: vehicles } = useVehiclesData();
  const { data: ordersData } = useOrdersData("2026-01-01", "2027-12-31");
  const { data: warehouses = [] } = useQuery({
    queryKey: ["route-warehouses"],
    queryFn: routesApi.listRouteWarehouses,
  });
  const queryClient = useQueryClient();
  const [origin, setOrigin] =
    useState<routesApi.RouteLocationSuggestion | null>(null);
  const [stops, setStops] = useState<
    (routesApi.RouteLocationSuggestion | null)[]
  >([]);
  const [destination, setDestination] =
    useState<routesApi.RouteLocationSuggestion | null>(null);
  const [mode, setMode] = useState("fastest");
  const [returnToWarehouse, setReturnToWarehouse] = useState(true);
  const [returnWarehouseId, setReturnWarehouseId] = useState("");
  const [expressways, setExpressways] = useState<ExpresswayChoice>("compare");
  const [rawPlan, setPlan] = useState<routesApi.RoutePlanResult | null>(null);
  // Which "Compare both" card is active; null = the server's default for the objective.
  const [pickedOption, setPickedOption] = useState<string | null>(null);
  const plan = useMemo(() => resolveActivePlan(rawPlan, pickedOption), [rawPlan, pickedOption]);
  useEffect(() => setPickedOption(null), [rawPlan]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fleetBusy, setFleetBusy] = useState(false);
  const [fleetPlan, setFleetPlan] =
    useState<routesApi.OptimizeFleetPreviewResult | null>(null);
  const [fleetError, setFleetError] = useState("");
  const [fleetApplying, setFleetApplying] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const eligibleOrderIds = ordersData
    .filter(
      (order) =>
        order.status.toLowerCase() === "pending" &&
        order.route === "Unassigned route" &&
        order.shipmentWeight != null &&
        order.serviceTimeMin != null,
    )
    .map((order) => order.id);

  const validStops = stops.filter(
    (stop): stop is routesApi.RouteLocationSuggestion => Boolean(stop),
  );
  const routeOptions = { returnToWarehouse, returnWarehouseId };
  const warehouseMissing = returnWarehouseMissing(returnToWarehouse, returnWarehouseId);
  // Which action to resume once the user answers the "which warehouse?" prompt.
  const [warehousePrompt, setWarehousePrompt] = useState<null | "calculate" | "optimize" | "fleet">(null);
  // Changing the checkbox, the warehouse or the expressway choice makes the shown result stale.
  useEffect(() => {
    setPlan(null);
    setFleetPlan(null);
  }, [returnToWarehouse, returnWarehouseId, expressways]);
  const validate = () => {
    if (!origin || !destination)
      return "Choose an origin and destination from the suggestions.";
    if (stops.some((stop) => !stop))
      return "Choose a location for every stop or remove the empty stop.";
    const keys = [origin, ...validStops, destination].map(
      (point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`,
    );
    if (new Set(keys).size !== keys.length)
      return "Duplicate locations are not allowed in one route.";
    return "";
  };
  const calculate = async (event?: React.FormEvent, warehouseOverride?: string) => {
    event?.preventDefault();
    if (returnToWarehouse && !(warehouseOverride || returnWarehouseId)) {
      setWarehousePrompt("calculate");
      return;
    }
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    setPlan(null);
    try {
      setPlan(
        await routesApi.planRoute(origin!, destination!, mode, validStops, { returnToWarehouse, returnWarehouseId: warehouseOverride || returnWarehouseId }, expressways),
      );
    } catch (err: any) {
      setError(err?.message || "Unable to calculate route.");
    } finally {
      setBusy(false);
    }
  };
  const optimizeStops = async (warehouseOverride?: string) => {
    if (returnToWarehouse && !(warehouseOverride || returnWarehouseId)) {
      setWarehousePrompt("optimize");
      return;
    }
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    if (validStops.length < 2) {
      setError("Add at least two stops to optimize stop order.");
      return;
    }
    setBusy(true);
    setError("");
    setPlan(null);
    try {
      const result = await routesApi.optimizeStopOrder(
        origin!,
        destination!,
        validStops,
        mode,
        { returnToWarehouse, returnWarehouseId: warehouseOverride || returnWarehouseId },
        expressways,
      );
      setPlan(result);
      if (result.optimizedStopOrder) {
        // With a return leg Google may also move the last delivery, so rebuild both from the result.
        const pool = [...validStops, destination!];
        const find = (label: string) => pool.find((point) => point.label === label) || null;
        setStops(result.optimizedStopOrder.map(find));
        const nextDestination = find(result.destination.label);
        if (nextDestination) setDestination(nextDestination);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to optimize stop order.");
    } finally {
      setBusy(false);
    }
  };
  const moveStop = (index: number, direction: number) =>
    setStops((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const previewFleet = async (warehouseOverride?: string) => {
    if (returnToWarehouse && !(warehouseOverride || returnWarehouseId)) {
      setWarehousePrompt("fleet");
      return;
    }
    setFleetBusy(true);
    setFleetError("");
    setFleetPlan(null);
    try {
      setFleetPlan(
        await routesApi.previewFleetOptimization(
          mode,
          "initial",
          eligibleOrderIds,
          { returnToWarehouse, returnWarehouseId: warehouseOverride || returnWarehouseId },
          expressways === "avoid", // the Route Optimization API cannot price tolls, only avoid them
        ),
      );
    } catch (err: any) {
      setFleetError(err?.message || "Unable to optimize pending deliveries.");
    } finally {
      setFleetBusy(false);
    }
  };
  const applyFleet = async () => {
    if (!fleetPlan?.runId) return;
    setFleetApplying(true);
    setFleetError("");
    try {
      const result = await routesApi.applyFleetOptimization(fleetPlan.runId);
      setFleetPlan(null);
      onNotice(
        `${result.routes.length} optimized fleet route${result.routes.length === 1 ? "" : "s"} applied.`,
      );
    } catch (err: any) {
      setFleetError(err?.message || "Unable to apply optimization.");
    } finally {
      setFleetApplying(false);
    }
  };
  const saveRoute = async () => {
    const validation = validate();
    if (validation || !plan || !vehicles.length) {
      setError(
        validation ||
          "Calculate a route and make sure a live vehicle is available.",
      );
      return;
    }
    setSavingRoute(true);
    setError("");
    try {
      const route = await routesApi.createRoute({
        name: `${plan.origin.label} -> ${plan.destination.label}`,
        mode: plan.mode,
        distanceKm: plan.distanceKm,
        durationMin: plan.durationMin,
        cost: plan.cost,
        status: "ready",
        returnToWarehouse: plan.returnToWarehouse,
        returnWarehouseId: plan.returnWarehouse?.id,
      });
      const routeId = String(
        (route as routesApi.ApiRoute & { id?: number | string }).id ??
          route.ROWID,
      );
      await routesApi.createRouteStop(routeId, {
        sequence: 1,
        locationName: plan.origin.label,
        lat: plan.origin.lat,
        lng: plan.origin.lng,
      });
      for (const [index, stop] of plan.stops.entries())
        await routesApi.createRouteStop(routeId, {
          sequence: index + 2,
          locationName: stop.label,
          lat: stop.lat,
          lng: stop.lng,
        });
      await routesApi.createRouteStop(routeId, {
        sequence: plan.stops.length + 2,
        locationName: plan.destination.label,
        lat: plan.destination.lat,
        lng: plan.destination.lng,
      });
      setPendingRouteId(routeId);
      setSelectedVehicleId(vehicles[0].id);
      setAssignOpen(true);
    } catch (err: any) {
      setError(err?.message || "Unable to save route.");
    } finally {
      setSavingRoute(false);
    }
  };
  const assignRoute = async () => {
    if (!pendingRouteId || !selectedVehicleId) return;
    setAssigning(true);
    setError("");
    try {
      await routesApi.createManifest({
        routeId: pendingRouteId,
        vehicleId: selectedVehicleId,
        status: "assigned",
        cargoType: "General",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["routes"] }),
        queryClient.invalidateQueries({
          queryKey: ["route-stops", pendingRouteId],
        }),
      ]);
      setAssignOpen(false);
      setPendingRouteId(null);
      onNotice("Route saved and assigned to the selected vehicle.");
    } catch (err: any) {
      setError(err?.message || "Unable to assign vehicle.");
    } finally {
      setAssigning(false);
    }
  };
  return (
    <div>
      <AssignmentPanel onNotice={onNotice} />
      <div className="grid gap-4 lg:grid-cols-[370px_1fr]">
        <form
          onSubmit={calculate}
          className="border border-[#e4e3df] bg-white p-5"
        >
          <div className="micro text-[#77787b]">Route builder</div>
          <h2 className="display-face mt-3 text-2xl font-bold">
            Plan a live route
          </h2>
          <div className="mt-6 grid gap-4">
            <GooglePlaceInput
              label="Origin"
              value={origin}
              onChange={setOrigin}
              placeholder="Search a starting point"
            />
            {stops.map((stop, index) => (
              <div className="flex items-end gap-1" key={`route-stop-${index}`}>
                <div className="min-w-0 flex-1">
                  <GooglePlaceInput
                    label={`Stop ${index + 1}`}
                    value={stop}
                    onChange={(value) =>
                      setStops((current) =>
                        current.map((item, i) => (i === index ? value : item)),
                      )
                    }
                    placeholder="Search an intermediate stop"
                  />
                </div>
                <button
                  type="button"
                  title="Move stop up"
                  aria-label={`Move stop ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => moveStop(index, -1)}
                  className="grid h-11 w-9 place-items-center border border-[#d8d7d2] disabled:opacity-30"
                >
                  <ChevronDown size={15} className="rotate-180" />
                </button>
                <button
                  type="button"
                  title="Move stop down"
                  aria-label={`Move stop ${index + 1} down`}
                  disabled={index === stops.length - 1}
                  onClick={() => moveStop(index, 1)}
                  className="grid h-11 w-9 place-items-center border border-[#d8d7d2] disabled:opacity-30"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  title="Remove stop"
                  aria-label={`Remove stop ${index + 1}`}
                  onClick={() =>
                    setStops((current) => current.filter((_, i) => i !== index))
                  }
                  className="grid h-11 w-9 place-items-center border border-[#d8d7d2]"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setStops((current) => [...current, null])}
              className="w-fit text-xs font-semibold underline underline-offset-2"
            >
              + Add stop
            </button>
            <GooglePlaceInput
              label="Destination"
              value={destination}
              onChange={setDestination}
              placeholder="Search a destination"
            />
            <ReturnWarehousePicker
              name="route-return-warehouse"
              warehouses={warehouses}
              returnToWarehouse={returnToWarehouse}
              returnWarehouseId={returnWarehouseId}
              onToggle={setReturnToWarehouse}
              onSelect={setReturnWarehouseId}
            />
          </div>
          <div className="mt-7 micro text-[#77787b]">Objective</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["fastest", "Fastest"],
              ["cheapest", "Lowest cost"],
              ["shortest", "Shortest"],
              ["balanced", "Balanced"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setMode(value)}
                className={cx(
                  "border px-2 py-2 text-xs font-semibold",
                  mode === value
                    ? "border-black bg-black text-white"
                    : "border-[#d8d7d2]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-6 micro text-[#77787b]">Expressways</div>
          <div className="mt-3 grid gap-1.5 text-xs" role="radiogroup" aria-label="Expressways" data-testid="expressway-choice">
            {EXPRESSWAY_CHOICES.map(({ value, label }) => (
              <label key={value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="route-expressways"
                  checked={expressways === value}
                  onChange={() => setExpressways(value)}
                />
                {label}
              </label>
            ))}
          </div>
          <Button
            type="submit"
            disabled={busy || warehouseMissing}
            className="mt-6 w-full rounded-[4px]"
          >
            {busy ? "Calculating..." : "Calculate route"}{" "}
            <ArrowRight size={15} />
          </Button>
          {warehouseMissing && (
            <div className="mt-2 text-xs text-[#a16819]">{RETURN_WAREHOUSE_HINT}</div>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || warehouseMissing}
            onClick={() => optimizeStops()}
            className="mt-3 w-full rounded-[4px]"
          >
            Optimize stop order <Zap size={15} />
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={fleetBusy || warehouseMissing}
            onClick={() => previewFleet()}
            className="mt-3 w-full rounded-[4px]"
          >
            {fleetBusy ? "Optimizing fleet..." : "Optimize pending deliveries"}{" "}
            <Activity size={15} />
          </Button>
          <div className="mt-1 text-[11px] text-[#77787b]">
            {expressways === "avoid" ? "Fleet routes avoid tolls." : "Fleet costs: tolls not included."}
          </div>
          {plan && (
            <Button
              type="button"
              disabled={savingRoute}
              onClick={saveRoute}
              className="mt-3 w-full rounded-[4px]"
            >
              {savingRoute ? "Saving route..." : "Save route"}{" "}
              <Check size={15} />
            </Button>
          )}
          {error && (
            <div className="mt-4 border border-[#c4291f] bg-[#fbeceb] p-3 text-xs text-[#c4291f]">
              <div>{error}</div>
              {/missing (shipment weight|service time)/i.test(error) && (
                <Link
                  href="/app/orders"
                  className="mt-2 inline-flex font-semibold underline underline-offset-2"
                >
                  Review orders <ArrowRight size={13} />
                </Link>
              )}
            </div>
          )}
          {fleetError && (
            <div className="mt-4 border border-[#c4291f] bg-[#fbeceb] p-3 text-xs text-[#c4291f]">
              {fleetError}
            </div>
          )}
        </form>
        {assignOpen && (
          <div
            className="fixed inset-0 z-[2000] grid place-items-center bg-black/30 p-4"
            onClick={() => setAssignOpen(false)}
          >
            <div
              className="w-full max-w-md border border-[#e4e3df] bg-white p-5 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Assign a vehicle</h3>
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  aria-label="Close assignment dialog"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-2 text-xs text-[#77787b]">
                Choose the live vehicle that should run this saved route.
              </p>
              <div className="mt-5 grid gap-2">
                {vehicles.map((vehicle) => (
                  <label
                    key={vehicle.id}
                    className="flex cursor-pointer items-center gap-3 border border-[#e4e3df] p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="route-vehicle"
                      checked={selectedVehicleId === vehicle.id}
                      onChange={() => setSelectedVehicleId(vehicle.id)}
                    />
                    <span className="font-semibold">{vehicle.plate}</span>
                    <span className="text-xs text-[#77787b]">
                      {vehicle.speed} kph · {vehicle.fuel}% fuel
                    </span>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                onClick={assignRoute}
                disabled={assigning || !selectedVehicleId}
                className="mt-5 w-full rounded-[4px]"
              >
                {assigning ? "Assigning..." : "Assign selected vehicle"}{" "}
                <Check size={15} />
              </Button>
            </div>
          </div>
        )}
        {warehousePrompt && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Choose the return warehouse">
            <div className="w-full max-w-md border border-[#e4e3df] bg-white p-5">
              <h3 className="text-lg font-bold">Which warehouse is the truck returning to?</h3>
              <p className="mt-1 text-xs text-[#77787b]">Return to warehouse is ticked, so a return warehouse must be chosen. Untick it for a one-way route.</p>
              <div className="mt-4 grid gap-2">
                {warehouses.map((warehouse) => (
                  <button
                    key={warehouse.id}
                    type="button"
                    className="border border-[#d8d7d2] p-3 text-left text-xs hover:border-black"
                    onClick={() => {
                      const action = warehousePrompt;
                      setWarehousePrompt(null);
                      setReturnWarehouseId(warehouse.id);
                      // The warehouse change clears the old result; run the action the user asked for with this choice.
                      if (action === "calculate") void calculate(undefined, warehouse.id);
                      else if (action === "optimize") void optimizeStops(warehouse.id);
                      else void previewFleet(warehouse.id);
                    }}
                  >
                    <span className="font-semibold">{warehouse.name}</span>
                    <span className="mt-0.5 block text-[#77787b]">{warehouse.address}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="mt-4 text-xs underline" onClick={() => setWarehousePrompt(null)}>Cancel</button>
            </div>
          </div>
        )}
        <div className="grid gap-4">
          <div className="min-h-[420px] border border-[#e4e3df] bg-white">
            <LiveRouteMap plan={plan} vehicles={[]} />
          </div>
          {rawPlan?.tollOptions && rawPlan.tollOptions.length > 1 && plan && (
            <div className="grid gap-3 md:grid-cols-2" data-testid="toll-options">
              {rawPlan.tollOptions.map((option) => {
                const active = plan.activeOption === option.key;
                const badges = [
                  rawPlan.cheapestOption === option.key ? "Cheapest" : null,
                  rawPlan.fastestOption === option.key ? "Fastest" : null,
                ].filter(Boolean);
                return (
                  <button
                    type="button"
                    key={option.key}
                    onClick={() => setPickedOption(option.key)}
                    aria-pressed={active}
                    className={cx(
                      "border bg-white p-4 text-left text-xs",
                      active ? "border-black ring-1 ring-black" : "border-[#e4e3df] hover:border-black",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-black">{option.label}</strong>
                      {badges.map((badge) => (
                        <span key={badge as string} className="bg-[#e7f3ea] px-1.5 py-0.5 font-semibold text-[#1e7b44]">{badge}</span>
                      ))}
                      {active && <span className="ml-auto font-semibold text-black">Active</span>}
                    </div>
                    <div className="mt-2 text-[#55565a]">{tollOptionSummary(option)}</div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Distance", plan ? `${plan.distanceKm.toFixed(1)} km` : "-"],
              [
                "Driving time",
                plan ? `${Math.round(plan.durationMin)} min` : "-",
              ],
              [
                "Estimated operating cost",
                plan ? `₱${plan.cost.toLocaleString()}${plan.toll?.unknown ? " + tolls (unknown)" : ""}` : "-",
              ],
            ].map(([label, value]) => (
              <div className="border border-[#e4e3df] bg-white p-4" key={label}>
                <div className="micro text-[#77787b]">{label}</div>
                <div className="display-face mt-4 text-2xl font-bold">
                  {value}
                </div>
              </div>
            ))}
          </div>
          {plan && (
            <div className="border border-[#e4e3df] bg-white p-4 text-xs text-[#55565a]">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <strong className="text-black">
                  {plan.stops.length + 2} locations
                </strong>
                <span>
                  {plan.routing?.trafficAware
                    ? "Traffic-aware"
                    : "Traffic unavailable"}
                </span>
                <span>
                  {plan.routing?.provider} / {plan.routing?.profile}
                </span>
                {plan.routing?.fallback && (
                  <span className="font-semibold text-[#a16819]">
                    Fallback provider used
                  </span>
                )}
              </div>
              <div className="mt-2">
                Calculated{" "}
                {plan.routing?.calculatedAt
                  ? timeAgo(plan.routing.calculatedAt)
                  : "just now"}{" "}
                · Estimated planning cost{plan.tollsEnabled ? "." : ", tolls not included."}
              </div>
              {plan.returnToWarehouse && plan.returnWarehouse && (
                <a
                  href={plan.returnWarehouse.map_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-black underline underline-offset-2"
                >
                  Open {plan.returnWarehouse.name} in Google Maps <ExternalLink size={12} />
                </a>
              )}
              {plan.roundTrip && (
                <div className="mt-3 overflow-x-auto border-t border-[#efeeeb] pt-3" data-testid="route-cost-table">
                  <table className="w-full min-w-[720px] border-collapse text-right">
                    <thead>
                      <tr className="micro text-[#77787b]">
                        <th className="pb-2 text-left font-normal"></th>
                        <th className="pb-2 font-normal">Distance</th>
                        <th className="pb-2 font-normal">Time</th>
                        <th className="pb-2 font-normal">Distance cost</th>
                        <th className="pb-2 font-normal">Time cost</th>
                        <th className="pb-2 font-normal">Fuel</th>
                        <th className="pb-2 font-normal">Refrigeration</th>
                        {plan.tollsEnabled && <th className="pb-2 font-normal">Tolls</th>}
                        <th className="pb-2 font-normal">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildCostTableRows(plan.roundTrip, plan.returnWarehouse?.name).map((row) => (
                        <tr key={row.key} className={row.key === "total" ? "border-t border-[#d8d7d2] font-bold text-black" : ""}>
                          <td className={cx("py-1.5 text-left", row.key !== "total" && "font-semibold text-black")}>{row.label}</td>
                          <td>{row.distanceKm.toFixed(1)} km</td>
                          <td>{Math.round(row.durationMin)} min</td>
                          <td>{peso(row.distanceCost)}</td>
                          <td>{peso(row.timeCost)}</td>
                          <td>{peso(row.fuel)}</td>
                          <td>{peso(row.refrigeration)}</td>
                          {plan.tollsEnabled && <td className={row.tollUnknown ? "text-[#a16819]" : ""}>{tollCellText(row)}</td>}
                          <td className="font-semibold text-black">{totalCellText(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.rates && (
                    <div className="mt-2 text-[11px] text-[#77787b]">
                      {formatRatesLine(plan.rates)}
                      {plan.costAssumptions?.refrigerated && plan.costAssumptions.coldChainAssumed ? " (assumed chilled)" : ""}
                    </div>
                  )}
                </div>
              )}
              {plan.warnings.map((warning) => (
                <div className="mt-2 text-[#a16819]" key={warning}>
                  Warning: {warning}
                </div>
              ))}
            </div>
          )}
          {plan && (
            <div className="border border-[#e4e3df] bg-white p-4">
              <div className="micro text-[#77787b]">Route timeline</div>
              <div className="mt-3 grid gap-3 text-xs">
                <div>
                  <strong>START</strong> · {plan.origin.label}
                </div>
                {plan.stops.map((stop, index) => (
                  <div key={`${stop.label}-${index}`}>
                    <strong>STOP {index + 1}</strong> · {stop.label}
                    <span className="ml-2 text-[#77787b]">
                      Service time assumed: {plan.costAssumptions?.serviceMinPerStop ?? 30} min
                    </span>
                  </div>
                ))}
                <div>
                  <strong>{plan.returnToWarehouse && plan.roundTrip?.return ? "LAST DELIVERY" : "END"}</strong> · {plan.destination.label}
                </div>
                {plan.returnToWarehouse && plan.returnWarehouse && plan.roundTrip?.return && (
                  <div>
                    <strong>RETURN</strong> · Arrive back at {plan.returnWarehouse.name}
                    {returnEta(plan) && <span className="ml-2 text-[#77787b]">ETA {returnEta(plan)}</span>}
                  </div>
                )}
              </div>
            </div>
          )}
          {fleetPlan && (
            <div
              className="border border-[#e4e3df] bg-white p-4"
              data-testid="fleet-optimization-result"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="micro text-[#77787b]">Fleet proposal</div>
                  <h3 className="mt-2 text-lg font-bold">
                    Best feasible plan found
                  </h3>
                </div>
                <StatusChip
                  status={fleetPlan.feasible ? "Proposed" : "Not feasible"}
                  tone={fleetPlan.feasible ? "good" : "neutral"}
                />
              </div>
              {fleetPlan.message && (
                <p className="mt-3 text-xs text-[#55565a]">
                  {fleetPlan.message}
                </p>
              )}
              {fleetPlan.costNote && (
                <p className="mt-2 text-[11px] text-[#77787b]">{fleetPlan.costNote}</p>
              )}
              {fleetPlan.routes?.map((route) => (
                <div
                  className="mt-3 border-t border-[#efeeeb] pt-3 text-xs"
                  key={route.vehicle_id}
                >
                  <div className="flex justify-between font-semibold">
                    <span>Vehicle {route.vehicle_id}</span>
                    <span>
                      {route.total_distance_km.toFixed(1)} km ·{" "}
                      {Math.round(route.total_duration_min)} min
                    </span>
                  </div>
                  <div className="mt-1 text-[#77787b]">
                    {route.stops.length
                      ? route.stops
                          .map((stop) => stop.location_name)
                          .join(" → ")
                      : "No assigned stops"}
                  </div>
                </div>
              ))}
              {!!fleetPlan.unassigned?.length && (
                <div
                  className="mt-3 border-t border-[#f0d9b5] bg-[#fdf6ec] p-3 text-xs"
                  data-testid="fleet-unassigned-orders"
                >
                  <div className="font-semibold text-[#a16819]">
                    {fleetPlan.unassigned.length} order
                    {fleetPlan.unassigned.length === 1 ? "" : "s"} could not be
                    assigned
                  </div>
                  {fleetPlan.unassigned.map((u) => (
                    <div
                      className="mt-2 border-t border-[#f0d9b5] pt-2"
                      key={u.order_id}
                    >
                      <div className="font-semibold">
                        Order {u.order_id}
                        {u.location_name ? ` · ${u.location_name}` : ""}
                      </div>
                      <div className="mt-1 text-[#77787b]">
                        {UNASSIGNED_REASON_LABEL[u.reason]} — {u.detail}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {fleetPlan.feasible && fleetPlan.runId && (
                <Button
                  type="button"
                  onClick={applyFleet}
                  disabled={fleetApplying}
                  className="mt-4 w-full rounded-[4px]"
                >
                  {fleetApplying ? "Applying..." : "Apply plan"}{" "}
                  <Check size={15} />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <FleetSocketProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ErrorBoundary>
              <Switch>
                <Route path="/" component={Landing} />
                <Route path="/platform">
                  <MarketingPage type="platform" />
                </Route>
                <Route path="/how-it-works">
                  <MarketingPage type="how" />
                </Route>
                <Route path="/channels">
                  <MarketingPage type="channels" />
                </Route>
                <Route path="/security">
                  <MarketingPage type="security" />
                </Route>
                <Route path="/about-rgf">
                  <MarketingPage type="about" />
                </Route>
                <Route path="/request-demo" component={RequestDemo} />
                <Route path="/login" component={Login} />
                <Route path="/app/tower" component={Tower} />
                <Route path="/app/fleet">
                  <DataTablePage kind="fleet" />
                </Route>
                <Route path="/app/routes">
                  <DataTablePage kind="routes" />
                </Route>
                <Route path="/app/loads">
                  <DataTablePage kind="loads" />
                </Route>
                <Route path="/app/orders">
                  <DataTablePage kind="orders" />
                </Route>
                <Route path="/app/comms">
                  <DataTablePage kind="comms" />
                </Route>
                <Route path="/app/reports">
                  <DataTablePage kind="reports" />
                </Route>
                <Route path="/driver/today"><RoleGate allowed={["driver", "admin"]}><DriverToday /></RoleGate></Route>
                <Route path="/driver/route/:id"><RoleGate allowed={["driver", "admin"]}><DriverRoute /></RoleGate></Route>
                <Route path="/driver/status"><RoleGate allowed={["driver", "admin"]}><DriverStatus /></RoleGate></Route>
                <Route path="/driver/history"><RoleGate allowed={["driver", "admin"]}><DriverHistory /></RoleGate></Route>
                <Route path="/warehouse/dashboard">
                  <Warehouse page="dashboard" />
                </Route>
                <Route path="/warehouse/loading">
                  <LiveWarehouseChecklist />
                </Route>
                <Route path="/warehouse/receiving">
                  <Warehouse page="receiving" />
                </Route>
                <Route path="/warehouse/exceptions">
                  <Warehouse page="exceptions" />
                </Route>
                <Route path="/portal/orders">
                  <Portal page="orders" />
                </Route>
                <Route path="/portal/orders/:id">
                  <Portal page="tracking" />
                </Route>
                <Route path="/portal/support">
                  <Portal page="support" />
                </Route>
                <Route path="/admin/users">
                  <DataTablePage kind="users" />
                </Route>
                <Route path="/admin/roles">
                  <DataTablePage kind="roles" />
                </Route>
                <Route path="/admin/integrations">
                  <DataTablePage kind="integrations" />
                </Route>
                <Route path="/admin/templates">
                  <DataTablePage kind="templates" />
                </Route>
                <Route path="/admin/audit-log">
                  <DataTablePage kind="audit" />
                </Route>
                <Route component={NotFound} />
              </Switch>
            </ErrorBoundary>
          </WouterRouter>
        </FleetSocketProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

function LoadPlanningWorkspace({
  onNotice,
}: {
  onNotice: (s: string) => void;
}) {
  const [tab, setTab] = useState<"inventory" | "planning" | "confirmed">(
    "inventory",
  );
  return (
    <div>
      <div className="load-planning-tabs mb-5 flex gap-1 overflow-x-auto border-b border-[#e4e3df]">
        <button
          onClick={() => setTab("inventory")}
          className={cx(
            "min-w-[110px] shrink-0 border-b-2 px-3 pb-3 text-sm font-semibold",
            tab === "inventory"
              ? "border-black"
              : "border-transparent text-[#77787b]",
          )}
        >
          Inventory
        </button>
        <button
          onClick={() => setTab("planning")}
          className={cx(
            "min-w-[130px] shrink-0 border-b-2 px-3 pb-3 text-sm font-semibold",
            tab === "planning"
              ? "border-black"
              : "border-transparent text-[#77787b]",
          )}
        >
          Load Planning
        </button>
        <button
          onClick={() => setTab("confirmed")}
          className={cx(
            "min-w-[120px] shrink-0 border-b-2 px-3 pb-3 text-sm font-semibold",
            tab === "confirmed"
              ? "border-black"
              : "border-transparent text-[#77787b]",
          )}
        >
          Confirmed SO
        </button>
      </div>
      {tab === "inventory" ? (
        <LoadPlanningInventoryTab />
      ) : tab === "confirmed" ? (
        <LoadPlanningInventoryTab assignmentScope="assigned" />
      ) : (
        <LoadPlanningAssignmentTab />
      )}
    </div>
  );
}
