import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as overviewApi from "@/services/api/overview";
import { POINT_STYLE, pointStyle } from "@/lib/overview";
import { Empty, ErrorNote, fmtDateTime } from "./shared";

// OpenStreetMap raster tiles: free, no API key. Never a paid map API.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function shapeStyle(shape: string, color: string): Record<string, string> {
  const base = { width: "16px", height: "16px", background: color, border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.45)" };
  if (shape === "circle") return { ...base, borderRadius: "50%" };
  if (shape === "diamond") return { ...base, transform: "rotate(45deg)" };
  if (shape === "triangle") return { width: "0", height: "0", borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: `16px solid ${color}` };
  return base;
}

function markerIcon(type: string): L.DivIcon {
  const s = pointStyle(type);
  const el = document.createElement("span");
  Object.assign(el.style, shapeStyle(s.shape, s.color), { display: "block" });
  return L.divIcon({ html: el, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
}

function warehouseIcon(): L.DivIcon {
  const el = document.createElement("span");
  el.textContent = "W";
  Object.assign(el.style, { display: "grid", placeItems: "center", width: "22px", height: "22px", background: "#000", color: "#fff", font: "bold 12px sans-serif", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.45)" });
  return L.divIcon({ html: el, className: "", iconSize: [24, 24], iconAnchor: [12, 12] });
}

function popupNode(lines: Array<[string, string]>): HTMLElement {
  const root = document.createElement("div");
  root.style.fontSize = "12px";
  for (const [label, value] of lines) {
    if (!value) continue;
    const row = document.createElement("div");
    const b = document.createElement("strong");
    b.textContent = `${label}: `;
    row.appendChild(b);
    row.appendChild(document.createTextNode(value)); // textContent semantics: no HTML injection
    root.appendChild(row);
  }
  return root;
}

function LeafletMap({ data }: { data: overviewApi.MapData }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: true }).setView([14.5995, 120.9842], 10);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    for (const w of data.warehouses) {
      if (typeof w.lat !== "number" || typeof w.lng !== "number") continue;
      const m = L.marker([w.lat, w.lng], { icon: warehouseIcon(), title: w.name });
      m.bindPopup(popupNode([["Warehouse", w.name]]));
      m.addTo(layer);
      bounds.push([w.lat, w.lng]);
    }
    for (const p of data.points) {
      const marker = L.marker([p.lat, p.lng], { icon: markerIcon(p.type), title: pointStyle(p.type).label });
      marker.bindPopup(
        popupNode([
          ["Type", pointStyle(p.type).label],
          ["SO", p.so_number ?? ""],
          ["Customer", p.customer_name ?? ""],
          ["Driver", p.driver_name ?? ""],
          ["Time", fmtDateTime(p.at)],
          ["Outcome", p.outcome ?? ""],
          ["GPS accuracy", p.accuracy_m !== null && p.accuracy_m !== undefined ? `${Math.round(p.accuracy_m)} m` : ""],
        ]),
      );
      marker.addTo(layer);
      bounds.push([p.lat, p.lng]);
    }
    if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 16 });
  }, [data]);

  return <div ref={ref} className="h-[420px] w-full border border-[#e4e3df] sm:h-[520px]" data-testid="overview-map" />;
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {Object.entries(POINT_STYLE).map(([type, s]) => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <span style={{ display: "inline-block", ...(shapeStyle(s.shape, s.color) as React.CSSProperties) }} />
          {s.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-grid h-4 w-4 place-items-center bg-black text-[10px] font-bold text-white">W</span>
        Warehouse
      </span>
    </div>
  );
}

export default function MapTab({ filter }: { filter: overviewApi.OverviewFilter }) {
  const query = useQuery({
    queryKey: ["driver-overview", "map", filter],
    queryFn: () => overviewApi.getMap(filter),
    retry: 1,
  });
  if (query.isLoading) return <Empty>Loading map...</Empty>;
  if (query.isError) return <ErrorNote error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data ?? { warehouses: [], points: [] };
  return (
    <div className="grid gap-3">
      <Legend />
      {data.points.length === 0 && <Empty>No GPS points were recorded for these filters. Warehouses are shown if available.</Empty>}
      <LeafletMap data={data} />
      {data.points.length > 0 && (
        <div className="overflow-x-auto border border-[#e4e3df] bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#f2f2ef] text-xs uppercase text-[#55565a]">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th>Time</th>
                <th>SO</th>
                <th>Customer</th>
                <th>Driver</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p, i) => (
                <tr key={i} className="border-t border-[#efeeeb]">
                  <td className="px-3 py-2">{pointStyle(p.type).label}</td>
                  <td>{fmtDateTime(p.at)}</td>
                  <td className="font-mono text-xs">{p.so_number ?? "-"}</td>
                  <td>{p.customer_name ?? "-"}</td>
                  <td>{p.driver_name ?? "-"}</td>
                  <td>{p.outcome ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
