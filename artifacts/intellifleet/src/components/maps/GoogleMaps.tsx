// @ts-nocheck -- Google Maps' runtime namespace is provided by importLibrary.
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";
import type { UiVehicle } from "@/services/adapters";
import type * as routesApi from "@/services/api/routes";
const truckIconUrl = "/truck-RARE-red-container-white-text.svg?v=1";
const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
function useMaps() {
  const [api, setApi] = useState<typeof google | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!key) {
      setError("Google Maps is not configured. Set VITE_GOOGLE_MAPS_API_KEY.");
      return;
    }
    let active = true;
    setOptions({ key, v: "weekly" });
    importLibrary("maps")
      .then(() => {
        if (active && window.google) setApi(window.google);
        else if (active)
          setError("Google Maps loaded without its runtime namespace.");
      })
      .catch(
        (e: unknown) =>
          active &&
          setError(
            e instanceof Error ? e.message : "Google Maps failed to load.",
          ),
      );
    return () => {
      active = false;
    };
  }, []);
  return { api, error };
}
function ErrorMap({ error }: { error: string }) {
  return (
    <div className="grid h-full min-h-[420px] place-items-center bg-[#f5f5f2] p-6 text-center text-xs text-[#77787b]">
      {error}
    </div>
  );
}
function pos(lat: number, lng: number) {
  return { lat, lng };
}
function pin(
  maps: typeof google.maps,
  map: google.maps.Map,
  p: google.maps.LatLngLiteral,
  title: string,
  color: string,
) {
  return new maps.Marker({
    map,
    position: p,
    title,
    icon: {
      url: truckIconUrl,
      scaledSize: new maps.Size(52, 52),
      anchor: new maps.Point(26, 26),
    },
  });
}
function routePointPin(maps: typeof google.maps, map: google.maps.Map, p: google.maps.LatLngLiteral, title: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52"><path d="M21 2C10.5 2 2 10.5 2 21c0 14 19 29 19 29s19-15 19-29C40 10.5 31.5 2 21 2Z" fill="${color}" stroke="#fff" stroke-width="3"/><circle cx="21" cy="21" r="7" fill="#fff"/></svg>`;
  return new maps.Marker({ map, position: p, title, icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new maps.Size(28, 35), anchor: new maps.Point(14, 35) } });
}
const locations = [
  {
    p: pos(14.5995, 120.9842),
    n: "Metro Manila",
    t: "HQ & Primary Hub",
    k: "hub",
  },
  {
    p: pos(10.3157, 123.8854),
    n: "Cebu City",
    t: "Regional Hub — Visayas",
    k: "hub",
  },
  {
    p: pos(7.1907, 125.4553),
    n: "Davao City",
    t: "Regional Hub — Mindanao",
    k: "hub",
  },
  {
    p: pos(8.4542, 124.6319),
    n: "Cagayan de Oro",
    t: "Cold Storage Facility",
    k: "cold",
  },
  {
    p: pos(10.7202, 122.5621),
    n: "Bacolod",
    t: "Cold Storage Facility",
    k: "cold",
  },
  {
    p: pos(9.3068, 123.3054),
    n: "Dumaguete",
    t: "Cold Storage Facility",
    k: "cold",
  },
  {
    p: pos(6.9214, 122.079),
    n: "Zamboanga City",
    t: "Distribution Point",
    k: "truck",
  },
  {
    p: pos(6.1164, 125.1716),
    n: "General Santos",
    t: "Distribution Point",
    k: "truck",
  },
  {
    p: pos(8.9475, 125.5406),
    n: "Butuan",
    t: "Distribution Point",
    k: "truck",
  },
  {
    p: pos(11.2421, 125.0026),
    n: "Tacloban",
    t: "Distribution Point",
    k: "truck",
  },
  {
    p: pos(16.4023, 120.596),
    n: "Baguio",
    t: "Cold Storage Facility",
    k: "cold",
  },
  {
    p: pos(13.1391, 123.7438),
    n: "Legazpi",
    t: "Distribution Point",
    k: "truck",
  },
];
export function NetworkMap({ region }: { region: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map>();
  const objects = useRef<google.maps.MVCObject[]>([]);
  const { api, error } = useMaps();
  useEffect(() => {
    if (!api || !ref.current || map.current) return;
    map.current = new api.maps.Map(ref.current, {
      center: pos(12.8, 121.7),
      zoom: 6,
      minZoom: 4,
      maxZoom: 13,
      streetViewControl: false,
      mapTypeControl: false,
    });
    locations.forEach((x) =>
      objects.current.push(
        pin(
          api.maps,
          map.current!,
          x.p,
          `${x.n} — ${x.t}`,
          x.k === "hub" ? "#0b0b0b" : x.k === "cold" ? "#55565a" : "#8a8b8e",
        ),
      ),
    );
    const h = locations[0];
    locations
      .filter((x) => x.k === "hub" && x !== h)
      .forEach((x) =>
        objects.current.push(
          new api.maps.Polyline({
            map: map.current!,
            path: [h.p, x.p],
            strokeColor: "#0b0b0b",
            strokeOpacity: 0.3,
            strokeWeight: 2,
          }),
        ),
      );
    return () => {
      objects.current.forEach((x: any) => x.setMap(null));
      objects.current = [];
      map.current = undefined;
    };
  }, [api]);
  useEffect(() => {
    if (map.current) map.current.setZoom(region === "all" ? 6 : 7);
  }, [region]);
  return error ? (
    <ErrorMap error={error} />
  ) : (
    <div
      ref={ref}
      data-testid="network-map"
      className="network-map h-[420px] w-full rounded-[4px] md:h-[620px]"
    />
  );
}
function color(v: UiVehicle) {
  return v.status.includes("Temperature") || v.status.includes("Drift")
    ? "#c4291f"
    : v.status === "On time"
      ? "#1e7b44"
      : "#0b0b0b";
}
function orientedTruckIcon(v: UiVehicle) {
  // The supplied truck artwork points east. Google heading is clockwise from
  // north, so subtract 90 degrees to align the cab with the vehicle's travel.
  const angle = Number.isFinite(v.heading) ? v.heading - 90 : 0;
  const source = `${window.location.origin}${truckIconUrl}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><g transform="rotate(${angle} 26 26)"><image href="${source}" x="2" y="2" width="48" height="48"/></g></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new google.maps.Size(52, 52), anchor: new google.maps.Point(26, 26) };
}
function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function vehicleInfo(v: UiVehicle) {
  const value = (x: unknown, fallback = "Unavailable") =>
    escapeHtml(String(x ?? "") || fallback);
  const updated = v.lastUpdated
    ? new Date(v.lastUpdated).toLocaleString()
    : "Unavailable";
  const row = (label: string, val: string, emphasis = false) =>
    `<div class="vehicle-info-row"><span>${label}</span><strong${emphasis ? ` style="color:${color(v)}"` : ""}>${val}</strong></div>`;
  const sos = v.associatedSos || [];
  const associatedOrders = sos.length
    ? sos.map((so) => `<div class="vehicle-info-so"><strong>${escapeHtml(so.soNumber)}</strong><span>${escapeHtml(so.destinationCity || "No destination")}</span></div>`).join("")
    : `<div class="vehicle-info-so-empty">No Sales Orders assigned</div>`;
  return `<div class="vehicle-info-card"><div class="vehicle-info-kicker">LIVE VEHICLE</div><div class="vehicle-info-title">${value(v.plate, v.id)}</div><div class="vehicle-info-subtitle">Vehicle ID · ${value(v.id)}</div><div class="vehicle-info-status" style="--status:${color(v)}"><span></span>${value(v.status)}</div><div class="vehicle-info-grid">${row("Driver", value(v.driver))}${row("Zone", value(v.zone))}${row("Speed", `${value(v.speed, "0")} kph`)}${row("Fuel", `${value(v.fuel, "0")}%`)}${row("Ignition", v.ignitionOn ? "On" : "Off")}${row("Heading", `${value(v.heading, "0")}°`)}${row("Latitude", value(v.currentLat))}${row("Longitude", value(v.currentLng))}</div><div class="vehicle-info-location"><span>Current location</span><strong>${value(v.address, v.zone)}</strong></div><div class="vehicle-info-orders"><div class="vehicle-info-orders-title">Associated Sales Orders <span>${sos.length}</span></div>${associatedOrders}</div><div class="vehicle-info-updated">Last updated · ${updated}</div></div>`;
}
export function LiveOpsMap({
  vehicles,
  selected,
  onSelect,
  routesWithStops,
  selectedRouteId,
  onSelectRoute,
  proposedRoutes,
}: {
  vehicles: UiVehicle[];
  selected?: string;
  onSelect?: (v: UiVehicle | null) => void;
  routesWithStops?: any[];
  selectedRouteId?: string;
  onSelectRoute?: (id: string) => void;
  proposedRoutes?: any[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map>();
  const markers = useRef(new Map<string, google.maps.Marker>());
  const vehicleData = useRef(new Map<string, UiVehicle>());
  const overlays = useRef<google.maps.MVCObject[]>([]);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const traffic = useRef<google.maps.TrafficLayer | null>(null);
  const { api, error } = useMaps();
  useEffect(() => {
    if (!api || !ref.current || map.current) return;
    map.current = new api.maps.Map(ref.current, {
      center: pos(12.8, 121.7),
      zoom: 6,
      streetViewControl: false,
      mapTypeControl: false,
    });
    traffic.current = new api.maps.TrafficLayer();
    traffic.current.setMap(map.current);
    info.current = new api.maps.InfoWindow();
    return () => {
      info.current?.close();
      info.current = null;
      traffic.current?.setMap(null);
      traffic.current = null;
      markers.current.forEach((m) => m.setMap(null));
      markers.current.clear();
      overlays.current.forEach((x: any) => x.setMap(null));
      overlays.current = [];
      map.current = undefined;
    };
  }, [api]);
  useEffect(() => {
    if (!api || !map.current || !info.current) return;
    const m = map.current;
    vehicles.forEach((v) => {
      vehicleData.current.set(v.id, v);
      if (!Number.isFinite(v.currentLat) || !Number.isFinite(v.currentLng))
        return;
      let x = markers.current.get(v.id);
      if (!x) {
        x = pin(
          api.maps,
          m,
          pos(v.currentLat, v.currentLng),
          v.plate || v.id,
          color(v),
        );
        x.setIcon({ url: truckIconUrl, scaledSize: new api.maps.Size(52, 52), anchor: new api.maps.Point(26, 26) });
        x.addListener("click", () => {
          const current = vehicleData.current.get(v.id) || v;
          onSelect?.(current);
          info.current?.setContent(vehicleInfo(current));
          info.current?.setOptions({ maxWidth: 380 });
          info.current?.open({ map: m, anchor: x });
        });
        markers.current.set(v.id, x);
      } else {
        x.setPosition(pos(v.currentLat, v.currentLng));
        x.setIcon({ url: truckIconUrl, scaledSize: new api.maps.Size(52, 52), anchor: new api.maps.Point(26, 26) });
      }
    });
    markers.current.forEach((x, id) => {
      if (!vehicles.some((v) => v.id === id)) {
        x.setMap(null);
        markers.current.delete(id);
      }
    });
    overlays.current.forEach((x: any) => x.setMap(null));
    overlays.current = [];
    (proposedRoutes || []).forEach((r) => {
      if (r.stops?.length > 1)
        overlays.current.push(
          new api.maps.Polyline({
            map: m,
            path: r.stops.map((s: any) => pos(s.lat, s.lng)),
            strokeColor: "#2563eb",
            strokeOpacity: 0.85,
            strokeWeight: 3,
          }),
        );
    });
  }, [
    api,
    vehicles,
    selected,
    selectedRouteId,
    routesWithStops,
    proposedRoutes,
    onSelect,
    onSelectRoute,
  ]);
  return error ? (
    <ErrorMap error={error} />
  ) : (
    <div
      ref={ref}
      className="h-full min-h-[600px] w-full"
      data-testid="live-ops-map"
    />
  );
}
export function LiveRouteMap({
  plan,
  vehicles,
}: {
  plan: routesApi.RoutePlanResult | null;
  vehicles: UiVehicle[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map>();
  const overlays = useRef<google.maps.MVCObject[]>([]);
  const { api, error } = useMaps();
  useEffect(() => {
    if (!api || !ref.current || map.current) return;
    map.current = new api.maps.Map(ref.current, {
      center: pos(12.8, 121.7),
      zoom: 6,
      streetViewControl: false,
      mapTypeControl: false,
    });
    return () => {
      overlays.current.forEach((x: any) => x.setMap(null));
      overlays.current = [];
      map.current = undefined;
    };
  }, [api]);
  useEffect(() => {
    if (!api || !map.current) return;
    const m = map.current;
    overlays.current.forEach((x: any) => x.setMap(null));
    overlays.current = [];
    if (!plan) return;
    const routePoints = [plan.origin, ...plan.stops, plan.destination, ...(plan.returnToWarehouse && plan.returnWarehouse ? [plan.returnWarehouse] : [])];
    const fallback = routePoints.map((p) =>
      pos(p.lat, p.lng),
    );
    let path = fallback;
    try {
      const geometry = plan.geometry ? JSON.parse(plan.geometry) : null;
      if (
        geometry?.type === "LineString" &&
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 1
      )
        path = geometry.coordinates.map((x: number[]) =>
          pos(Number(x[1]), Number(x[0])),
        );
    } catch {}
    const bounds = new api.maps.LatLngBounds();
      fallback.forEach((p, i) => {
        bounds.extend(p);
        const isReturnWarehouse = Boolean(plan.returnToWarehouse && plan.returnWarehouse && i === fallback.length - 1);
        overlays.current.push(routePointPin(api.maps, m, p, i === 0 ? "START" : isReturnWarehouse ? plan.returnWarehouse!.name : i === fallback.length - 1 ? "END" : `STOP ${i}`, i === 0 ? "#1e7b44" : isReturnWarehouse ? "#64748b" : i === fallback.length - 1 ? "#c4291f" : "#111"));
    });
    overlays.current.push(
      new api.maps.Polyline({
        map: m,
        path,
        strokeColor: "#111",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      }),
    );
    if (plan.returnToWarehouse && plan.returnWarehouse) {
      overlays.current.push(
        new api.maps.Polyline({
          map: m,
          path: [pos(plan.destination.lat, plan.destination.lng), pos(plan.returnWarehouse.lat, plan.returnWarehouse.lng)],
          strokeColor: "#94a3b8",
          strokeOpacity: 0,
          strokeWeight: 4,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "14px" }],
        }),
      );
    }
      vehicles.forEach((v) => {
        if (Number.isFinite(v.currentLat) && Number.isFinite(v.currentLng)) {
          const marker = pin(api.maps, m, pos(v.currentLat, v.currentLng), v.plate, "#1e7b44");
          marker.setIcon(orientedTruckIcon(v));
          overlays.current.push(marker);
        }
    });
    m.fitBounds(bounds);
  }, [api, plan, vehicles]);
  return error ? (
    <ErrorMap error={error} />
  ) : (
    <div
      ref={ref}
      className="h-full min-h-[420px] w-full"
      data-testid="route-planning-map"
    />
  );
}
