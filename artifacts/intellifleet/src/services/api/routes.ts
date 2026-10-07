import { api } from "./client";
import type { ExpresswayChoice, TollOption, TollSummary } from "../../lib/routeCost";

export interface ApiRoute {
  ROWID: string;
  name: string;
  mode: string;
  distance_km: number;
  duration_min: number;
  cost: number;
  status: string;
  // Only present once routes.polyline_geojson exists in the live schema and at least one
  // POST /routes/optimize call has cached a real road-following polyline for this route.
  polyline_geojson?: string | null;
}

export interface OptimizeRouteResult {
  feasible: boolean;
  route?: ApiRoute;
  stopSequence?: string[];
  totalDistanceKm?: number;
  totalDurationMin?: number;
  warnings?: string[];
  message?: string;
}

export interface ApiRouteStop {
  id?: number | string;
  ROWID?: string;
  route_id: string;
  sequence: number;
  location_name: string;
  lat: number;
  lng: number;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
}

export interface RoutePlanResult {
  origin: { label: string; lat: number; lng: number };
  destination: { label: string; lat: number; lng: number };
  stops: { label: string; lat: number; lng: number }[];
  mode: string;
  objectiveNote: string;
  distanceKm: number;
  durationMin: number;
  cost: number;
  returnToWarehouse?: boolean;
  returnWarehouse?: RouteWarehouse | null;
  roundTrip?: {
    outbound: RouteTripPart;
    /** null for a one-way route */
    return: RouteTripPart | null;
    total: RouteTripPart;
  };
  rates?: RouteCostRates;
  costAssumptions?: { hasHelper: boolean; refrigerated: boolean; coldChain: "chilled" | "frozen"; coldChainAssumed: boolean; serviceMinPerStop: number };
  geometry: string | null;
  warnings: string[];
  costBreakdown?: RouteCostBreakdown;
  /** Toll summary of the active route. */
  toll?: TollSummary;
  tollsEnabled?: boolean;
  expressways?: ExpresswayChoice;
  /** Two entries when "Compare both" was used; the active one also fills the top-level fields. */
  tollOptions?: TollOption[];
  activeOption?: string;
  cheapestOption?: string | null;
  fastestOption?: string | null;
  /** Google returned the same road route with and without tolls. */
  noTollFreeAlternative?: boolean;
  /** false: Google returned no toll information for the active route. */
  tollDataAvailable?: boolean;
  routing?: { provider: string; profile: string; trafficAware: boolean; geometryProvider?: string; geometryProfile?: string; geometryTrafficAware?: boolean; calculatedAt?: string; departureTime?: string | null; fallback?: boolean; fallbackUsed?: boolean; fallbackReason?: string | null };
}

export interface RouteCostBreakdown {
  distance: number;
  time: number;
  fuel: number;
  refrigeration: number;
  tolls?: number;
  total: number;
}

export interface RouteCostRates {
  dieselPricePerLiter: number;
  fuelKmPerLiter: number;
  fuelCostPerKm: number;
  distanceCostPerKm: number;
  driverCostPerHour: number;
  helperCostPerHour: number;
  refrigerationLitersPerHourChilled: number;
  refrigerationLitersPerHourFrozen: number;
  refrigerationCostPerHourChilled: number;
  refrigerationCostPerHourFrozen: number;
  refrigerationOnReturnLeg: boolean;
  tollsEnabled?: boolean;
  tollVehicleClass?: number;
  tollMultiplier?: number;
}

export interface RouteTripPart {
  distanceKm: number;
  durationMin: number;
  costBreakdown: RouteCostBreakdown;
  toll?: TollSummary;
}

export interface RouteWarehouse {
  id: string;
  name: string;
  address: string;
  google_place: string;
  lat: number;
  lng: number;
  place_id_hex: string;
  map_url: string;
}

export interface RouteLocationSuggestion {
  label: string;
  lat: number;
  lng: number;
  type: string;
}

export interface ApiManifest {
  ROWID: string;
  route_id: string;
  vehicle_id: string;
  status: string;
  cargo_type: string;
}

export interface ApiManifestItem {
  ROWID: string;
  manifest_id: string;
  cargo_category: string;
  quantity: number;
  temp_requirement_c: number;
}

export function listRoutes(): Promise<ApiRoute[]> {
  return api.get<Array<ApiRoute & { id?: string | number }>>("/routes").then((routes) => routes.map((route) => ({ ...route, ROWID: String(route.id ?? route.ROWID) })));
}

export function listRouteWarehouses(): Promise<RouteWarehouse[]> {
  return api.get<{ warehouses: RouteWarehouse[] }>("/routes/warehouses").then((res) => res.warehouses);
}

export interface ReturnRouteOptions {
  returnToWarehouse: boolean;
  returnWarehouseId?: string;
}

export function planRoute(origin: RouteLocationSuggestion, destination: RouteLocationSuggestion, mode: string, stops: RouteLocationSuggestion[] = [], returnOptions?: ReturnRouteOptions, expressways: ExpresswayChoice = "expressway"): Promise<RoutePlanResult> {
  return api.post<RoutePlanResult>("/routes/plan", {
    origin: origin.label, destination: destination.label, mode,
    originLat: origin.lat, originLng: origin.lng,
    destinationLat: destination.lat, destinationLng: destination.lng,
    stops: stops.map((stop) => ({ label: stop.label, lat: stop.lat, lng: stop.lng })),
    returnToWarehouse: returnOptions?.returnToWarehouse ?? false,
    returnWarehouseId: returnOptions?.returnWarehouseId,
    expressways,
  });
}

export function optimizeStopOrder(origin: RouteLocationSuggestion, destination: RouteLocationSuggestion, stops: RouteLocationSuggestion[], mode: string, returnOptions?: ReturnRouteOptions, expressways: ExpresswayChoice = "expressway"): Promise<RoutePlanResult & { optimizedStopOrder?: string[] }> {
  return api.post<RoutePlanResult & { optimizedStopOrder?: string[] }>("/routes/optimize-stops", { origin, destination, stops, mode, ...returnOptions, expressways });
}

export function searchRouteLocations(text: string): Promise<RouteLocationSuggestion[]> {
  return api.get<RouteLocationSuggestion[]>("/routes/search", { text });
}

// Builds the optimization request from live routes/route_stops/vehicles data server-side,
// calls the backend optimizer, writes the returned sequence back into
// route_stops.sequence, and (best-effort) caches a real road-following polyline via ORS.
export function optimizeRoute(routeId: string): Promise<OptimizeRouteResult> {
  return api.post<OptimizeRouteResult>("/routes/optimize", { routeId });
}

export function createRoute(route: {
  name: string;
  mode: string;
  distanceKm?: number;
  durationMin?: number;
  cost?: number;
  status?: string;
  returnToWarehouse?: boolean;
  returnWarehouseId?: string;
}): Promise<ApiRoute> {
  return api.post<ApiRoute>("/routes", route);
}

export function listRouteStops(routeId: string): Promise<ApiRouteStop[]> {
  return api.get<Array<ApiRouteStop & { id?: string | number }>>(`/routes/${routeId}/stops`).then((stops) => stops.map((stop) => ({ ...stop, ROWID: String(stop.id ?? stop.ROWID) })));
}

export function createRouteStop(
  routeId: string,
  stop: {
    sequence: number;
    locationName: string;
    lat?: number;
    lng?: number;
    arrivalWindowStart?: string;
    arrivalWindowEnd?: string;
  },
): Promise<ApiRouteStop> {
  return api.post<ApiRouteStop>(`/routes/${routeId}/stops`, stop);
}

export function listManifests(): Promise<ApiManifest[]> {
  return api.get<Array<ApiManifest & { id?: string | number }>>("/manifests").then((items) => items.map((item) => ({ ...item, ROWID: String(item.id ?? item.ROWID) })));
}

export function createManifest(manifest: {
  routeId?: string;
  vehicleId?: string;
  status?: string;
  cargoType?: string;
}): Promise<ApiManifest> {
  return api.post<ApiManifest>("/manifests", manifest);
}

export function listManifestItems(manifestId: string): Promise<ApiManifestItem[]> {
  return api.get<Array<ApiManifestItem & { id?: string | number }>>(`/manifests/${manifestId}/items`).then((items) => items.map((item) => ({ ...item, ROWID: String(item.id ?? item.ROWID) })));
}

export function createManifestItem(
  manifestId: string,
  item: { cargoCategory: string; quantity: number; tempRequirementC?: number },
): Promise<ApiManifestItem> {
  return api.post<ApiManifestItem>(`/manifests/${manifestId}/items`, item);
}

export interface OptimizationRunStop {
  order_id: string;
  location_name: string;
  lat: number | null;
  lng: number | null;
  eta: string | null;
  slack_min: number | null;
}

export interface OptimizationRunRoute {
  vehicle_id: string;
  stop_sequence: string[];
  total_distance_km: number;
  total_duration_min: number;
  at_risk_count: number;
  stops: OptimizationRunStop[];
}

export interface OptimizationRun {
  ROWID: string;
  status: string;
  objective: string;
  mode: string;
  created_at: string;
  routes: (OptimizationRunRoute & { distance?: number; duration?: number; risk?: number })[];
}

export interface UnassignedOrder {
  order_id: string;
  reason: "ORDER_TOO_HEAVY" | "NO_COMPATIBLE_VEHICLE" | "TIME_WINDOW_INFEASIBLE" | "NO_REACHABLE_VEHICLE";
  detail: string;
  location_name: string | null;
}

export interface OptimizeFleetPreviewResult {
  feasible: boolean;
  runId?: string;
  mode?: "initial" | "reoptimize";
  objective?: string;
  routes?: OptimizationRunRoute[];
  unassigned?: UnassignedOrder[];
  totalDistanceKm?: number;
  totalDurationMin?: number;
  warnings?: string[];
  message?: string;
  routing?: { provider: string; profile: string; traffic_aware: boolean; calculated_at?: string; departure_time?: string | null };
  returnToWarehouse?: boolean;
  returnWarehouse?: RouteWarehouse | null;
  avoidTolls?: boolean;
  /** "tolls not included" (tolls allowed - the Route Optimization API does not price them) or "Tolls avoided". */
  costNote?: string;
}

export interface ApplyFleetOptimizationResult {
  success: boolean;
  routes: { routeId: string; vehicleId: string; polylineWarning: string | null }[];
}

export function previewFleetOptimization(
  objective?: string,
  mode: "initial" | "reoptimize" = "initial",
  orderIds?: string[],
  returnOptions?: ReturnRouteOptions,
  avoidTolls = false,
): Promise<OptimizeFleetPreviewResult> {
  return api.post<OptimizeFleetPreviewResult>("/optimization/preview", { objective, mode, orderIds, ...returnOptions, avoidTolls });
}

export function applyFleetOptimization(runId: string): Promise<ApplyFleetOptimizationResult> {
  return api.post<ApplyFleetOptimizationResult>("/optimization/apply", { runId });
}

export function getOptimizationRun(runId: string): Promise<OptimizationRun> {
  return api.get<OptimizationRun>(`/optimization/${runId}`);
}

export function reoptimizeFleet(reason: string, vehicleIds?: string[]): Promise<OptimizeFleetPreviewResult> {
  return api.post<OptimizeFleetPreviewResult>("/optimization/reoptimize", { reason, vehicleIds });
}
