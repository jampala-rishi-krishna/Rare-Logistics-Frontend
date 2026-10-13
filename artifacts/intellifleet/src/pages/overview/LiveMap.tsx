import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as overviewApi from "@/services/api/overview";
import { liveFleetSocket } from "@/lib/live-fleet-socket";
import type { FleetPosition } from "@/lib/live-fleet-socket";
import { MarkerAnimator, formatGpsAge, gpsAgeSeconds } from "@/lib/live-motion";
import { useFleetFeedStale, useFleetSocketConnection } from "@/lib/fleet-socket-provider";
import { outcomeColor, plateKey } from "@/lib/overviewView";
import { fmtTime } from "./shared";

// OpenStreetMap raster tiles: free, no API key. Truck positions come from the existing Cartrack WebSocket feed (one shared socket for the app) and glide
// between fixes with the same animator the Fleet map uses; the first position of each truck is seeded from /live (process memory on the server).
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const NO_RECENT_GPS_S = 5 * 60;

interface Props {
  trucks: overviewApi.LiveTruck[];
  map: overviewApi.MapData | undefined;
  selectedPlates: Set<string>;
  selectedBatchIds: Set<string>;
  onSelectPlate: (plate: string) => void;
}

function pointIcon(type: string, color: string): L.DivIcon {
  const el = document.createElement("span");
  const base = { display: "block", background: color, border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.45)" } as Record<string, string>;
  if (type === "stop") Object.assign(el.style, { ...base, width: "12px", height: "12px", transform: "rotate(45deg)", background: "#fff", border: "2px solid #55565a" });
  else if (type === "checkin") Object.assign(el.style, { ...base, width: "14px", height: "14px", borderRadius: "50%" });
  else if (type === "checkout") Object.assign(el.style, { ...base, width: "14px", height: "14px" });
  else Object.assign(el.style, { ...base, width: "16px", height: "16px", borderRadius: "50%", background: "#000" });
  return L.divIcon({ html: el, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
}

function warehouseIcon(): L.DivIcon {
  const el = document.createElement("span");
  el.textContent = "W";
  Object.assign(el.style, { display: "grid", placeItems: "center", width: "22px", height: "22px", background: "#000", color: "#fff", font: "bold 12px sans-serif", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.45)" });
  return L.divIcon({ html: el, className: "", iconSize: [24, 24], iconAnchor: [12, 12] });
}

// An upright side-view truck with the plate under it (never rotated by heading).
function truckIcon(plate: string, selected: boolean, quiet: boolean): L.DivIcon {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);";
  const tone = quiet ? "#9a9a96" : selected ? "#0b57d0" : "#000";
  wrap.innerHTML = `<svg width="30" height="20" viewBox="0 0 30 20" aria-hidden="true"><rect x="1" y="3" width="18" height="12" fill="${tone}"/><path d="M19 7h6l4 4v4H19z" fill="${tone}"/><circle cx="7" cy="16" r="3" fill="#fff" stroke="${tone}" stroke-width="2"/><circle cx="23" cy="16" r="3" fill="#fff" stroke="${tone}" stroke-width="2"/></svg>`;
  const tag = document.createElement("span");
  tag.textContent = plate;
  tag.style.cssText = `font:700 10px monospace;background:${tone};color:#fff;padding:1px 4px;margin-top:1px;white-space:nowrap;`;
  wrap.appendChild(tag);
  return L.divIcon({ html: wrap, className: "", iconSize: [0, 0] });
}

export default function LiveMap({ trucks, map, selectedPlates, selectedBatchIds, onSelectPlate }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const staticLayer = useRef<L.LayerGroup | null>(null);
  const truckLayer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const animator = useRef(new MarkerAnimator());
  const lastGps = useRef(new Map<string, string | null>());
  const fitted = useRef(false);
  const connected = useFleetSocketConnection();
  const feedStale = useFleetFeedStale();
  const trucksRef = useRef(trucks);
  trucksRef.current = trucks;
  const selectRef = useRef(onSelectPlate);
  selectRef.current = onSelectPlate;
  const plates = useMemo(() => new Set(trucks.map((t) => plateKey(t.plate))), [trucks]);
  const platesRef = useRef(plates);
  platesRef.current = plates;

  // map + animation loop + websocket subscription (once)
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const leaflet = L.map(ref.current, { scrollWheelZoom: true }).setView([14.5995, 120.9842], 10);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(leaflet);
    staticLayer.current = L.layerGroup().addTo(leaflet);
    truckLayer.current = L.layerGroup().addTo(leaflet);
    mapRef.current = leaflet;
    let raf = 0;
    const frame = () => {
      const now = Date.now();
      animator.current.poses(now).forEach((pose, plate) => {
        const marker = markers.current.get(plate);
        if (marker) marker.setLatLng([pose.lat, pose.lng]);
      });
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    const off = liveFleetSocket.onPositions((positions: FleetPosition[]) => {
      for (const p of positions) {
        const key = plateKey(p.registration);
        if (!platesRef.current.has(key)) continue;
        animator.current.update(key, { lat: p.current_lat, lng: p.current_lng, heading: p.heading, gpsTime: p.gps_time }, Date.now());
        lastGps.current.set(key, p.gps_time ?? null);
      }
    });
    return () => {
      off();
      window.cancelAnimationFrame(raf);
      leaflet.remove();
      mapRef.current = null;
      markers.current.clear();
    };
  }, []);

  // trucks: seed from the server's last fix, keep one marker per plate
  useEffect(() => {
    const layer = truckLayer.current;
    if (!layer) return;
    const seen = new Set<string>();
    for (const truck of trucks) {
      const key = plateKey(truck.plate);
      seen.add(key);
      if (truck.fix) {
        animator.current.update(key, { lat: truck.fix.lat, lng: truck.fix.lng, heading: truck.fix.heading, gpsTime: truck.fix.gps_time }, Date.now());
        if (!lastGps.current.has(key)) lastGps.current.set(key, truck.fix.gps_time);
      }
      const pose = animator.current.pose(key, Date.now());
      if (!pose) continue;
      const age = gpsAgeSeconds(lastGps.current.get(key) ?? truck.fix?.gps_time ?? null, Date.now());
      const quiet = age !== null && age > NO_RECENT_GPS_S;
      const selected = selectedPlates.has(key);
      let marker = markers.current.get(key);
      if (!marker) {
        marker = L.marker([pose.lat, pose.lng], { icon: truckIcon(truck.plate, selected, quiet), zIndexOffset: 1000 }).addTo(layer);
        marker.on("click", () => selectRef.current(key));
        markers.current.set(key, marker);
      } else marker.setIcon(truckIcon(truck.plate, selected, quiet));
      marker.bindTooltip(`${truck.plate} · ${truck.drivers.join(", ") || "no driver"} · GPS ${formatGpsAge(age)}`);
    }
    markers.current.forEach((marker, key) => {
      if (!seen.has(key)) {
        marker.remove();
        markers.current.delete(key);
        animator.current.remove(key);
      }
    });
  }, [trucks, selectedPlates]);

  // static layer: warehouses, planned stops, check-in / check-out points
  useEffect(() => {
    const layer = staticLayer.current;
    const leaflet = mapRef.current;
    if (!layer || !leaflet) return;
    layer.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    for (const w of map?.warehouses ?? []) {
      L.marker([w.lat, w.lng], { icon: warehouseIcon(), title: w.name }).addTo(layer);
      bounds.push([w.lat, w.lng]);
    }
    for (const p of map?.points ?? []) {
      const dim = selectedBatchIds.size > 0 && p.batch_id && !selectedBatchIds.has(p.batch_id);
      const color = p.type === "checkout" ? outcomeColor(p.outcome) : p.type === "checkin" ? "#0b57d0" : "#000";
      const marker = L.marker([p.lat, p.lng], { icon: pointIcon(p.type, color), opacity: dim ? 0.35 : 1 }).addTo(layer);
      const label = { stop: "Planned stop", checkin: "Arrived", checkout: "Departed", start: "Trip started", end: "Trip ended" }[p.type];
      marker.bindTooltip(`${label}${p.so_number ? ` · ${p.so_number}` : ""}${p.at ? ` · ${fmtTime(p.at)}` : ""}${p.outcome ? ` · ${p.outcome}` : ""}`);
      if (!dim) bounds.push([p.lat, p.lng]);
    }
    for (const marker of markers.current.values()) bounds.push([marker.getLatLng().lat, marker.getLatLng().lng]);
    if (!fitted.current && bounds.length > 0) {
      leaflet.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 14 });
      fitted.current = true;
    }
  }, [map, selectedBatchIds]);

  const withFix = trucks.filter((t) => t.fix).length;
  return (
    <div className="relative min-h-[320px] flex-1" data-testid="live-map-wrap">
      <div ref={ref} data-testid="live-map" className="absolute inset-0 border border-[#e4e3df] bg-[#e9e8e4]" role="img" aria-label="Live map of today's trucks, stops and check-in points" />
      <div className="pointer-events-none absolute right-2 top-2 z-[500] flex flex-wrap justify-end gap-1">
        <span data-testid="live-feed-status" className={`border px-2 py-0.5 text-[11px] font-semibold ${connected && !feedStale ? "border-[#cddfd2] bg-[#edf6f0] text-[#1e7b44]" : "border-[#f0d9a8] bg-[#fff6e5] text-[#8a5a00]"}`}>
          {connected && !feedStale ? "Live GPS" : connected ? "GPS feed quiet" : "GPS feed disconnected: showing last known positions"}
        </span>
        <span className="border border-[#d8d7d2] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#55565a]">
          {withFix} of {trucks.length} trucks located
        </span>
      </div>
    </div>
  );
}
