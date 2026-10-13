import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteInfo } from "@/lib/tripTypes";

// OpenStreetMap raster tiles: free, no API key (same provider as the Driver Overview map). Only REAL coordinates are drawn:
// the warehouse origin and the stops that have lat/lng. No fake position, ETA or distance.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function numberedIcon(label: string, tone: "pending" | "active" | "done" | "origin"): L.DivIcon {
  const el = document.createElement("span");
  const bg = tone === "done" ? "#33673B" : tone === "active" ? "#0b57d0" : tone === "origin" ? "#000" : "#55565a";
  Object.assign(el.style, { display: "grid", placeItems: "center", width: "26px", height: "26px", borderRadius: "50%", background: bg, color: "#fff", font: "bold 12px sans-serif", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.4)" });
  el.textContent = label;
  return L.divIcon({ html: el, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
}

export function mappableStops(route: RouteInfo | undefined) {
  return (route?.stops ?? []).filter((s) => typeof s.lat === "number" && typeof s.lng === "number");
}

export default function RouteMap({ route, currentSoId }: { route: RouteInfo; currentSoId?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true }).setView([14.5995, 120.9842], 9);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: L.LatLngTuple[] = [];
    const origin = route.origin;
    if (origin && typeof origin.lat === "number" && typeof origin.lng === "number") {
      points.push([origin.lat, origin.lng]);
      L.marker([origin.lat, origin.lng], { icon: numberedIcon("W", "origin"), title: origin.name ?? "Warehouse" }).addTo(layer);
    }
    for (const stop of mappableStops(route)) {
      const tone = stop.status === "checked_out" ? "done" : String(stop.so_id) === String(currentSoId) || stop.status === "checked_in" ? "active" : "pending";
      points.push([stop.lat as number, stop.lng as number]);
      L.marker([stop.lat as number, stop.lng as number], { icon: numberedIcon(String(stop.sequence), tone), title: stop.customer_name }).addTo(layer);
    }
    if (points.length > 1) L.polyline(points, { color: "#000", weight: 3, opacity: 0.55, dashArray: "6 6" }).addTo(layer); // straight order line, not a road route
    if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
  }, [route, currentSoId]);

  return <div ref={ref} data-testid="driver-route-map" className="h-64 w-full border border-[#e4e3df] bg-[#e9e8e4]" role="img" aria-label="Map of the stops in delivery order" />;
}
