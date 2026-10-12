// Mounted once at the app root (above the router), so the shared liveFleetSocket singleton
// connects on app load and only disconnects on real app teardown - never on internal route
// navigation. Previously every page that wanted live positions (Tower, DataTablePage) called
// its own connect()/disconnect() pair, which tore down and reopened the one shared socket on
// every navigation between them (see the Control Tower "stuck at 0 kph" investigation).
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { liveFleetSocket, type FleetPosition } from "@/lib/live-fleet-socket";
import { projectLatLngToMapXY, type UiVehicle } from "@/services/adapters";
import { isFeedStale } from "@/lib/live-motion";

const FleetSocketContext = createContext<{ connected: boolean; feedStale: boolean }>({ connected: false, feedStale: true });

export function FleetSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(liveFleetSocket.isConnected);
  const lastFeedAt = useRef<number | null>(null);
  const [feedStale, setFeedStale] = useState(true);

  useEffect(() => {
    // The backend sends one GPS_HEARTBEAT per poll and a position only when a vehicle's fix changed, so a
    // parked fleet is quiet. "Feed alive" therefore means any heartbeat or position in the last minute.
    const markFeed = () => {
      lastFeedAt.current = Date.now();
      setFeedStale(false);
    };
    const tick = window.setInterval(() => setFeedStale(isFeedStale(lastFeedAt.current, Date.now())), 5_000);
    let hasConnectedBefore = false;
    const offConnection = liveFleetSocket.onConnectionChange((isConnected) => {
      setConnected(isConnected);
      if (!isConnected) return;
      markFeed();
      // While the socket is up /vehicles is not polled at all: one fetch on load, plus one on every RE-connect
      // to pick up whatever moved while we were disconnected. (The first connect is covered by the page's own load.)
      if (hasConnectedBefore) void queryClient.invalidateQueries({ queryKey: ["vehicles"], exact: true });
      hasConnectedBefore = true;
    });
    const offHeartbeat = liveFleetSocket.onHeartbeat(markFeed);
    const offPositions = liveFleetSocket.onPositions((positions: FleetPosition[]) => {
      markFeed();
      // Control Tower owns the live view. Fleet is an operational snapshot:
      // it is refreshed manually or every 30 minutes as one consistent dataset.
      if (window.location.pathname.endsWith("/app/fleet")) return;
      queryClient.setQueryData<UiVehicle[]>(["vehicles"], (old) => {
        if (!old) return old;
        const byId = new Map(positions.map((p) => [p.vehicle_id, p]));
        return old.map((vehicle) => {
          const pos = byId.get(vehicle.id);
          if (!pos) return vehicle;
          const { x, y } = projectLatLngToMapXY(pos.current_lat, pos.current_lng);
          return {
            ...vehicle,
            currentLat: pos.current_lat,
            currentLng: pos.current_lng,
            heading: pos.heading,
            speed: Math.round(pos.speed_kph),
            fuel: Math.max(0, Math.min(100, Math.round(pos.fuel_pct_live ?? vehicle.fuel))),
            ignitionOn: pos.ignition_on,
            address: pos.address || vehicle.address,
            lastUpdated: pos.last_updated,
            gpsTime: pos.gps_time ?? vehicle.gpsTime,
            status: pos.speed_kph > 0 ? "Active" : (Date.now() - new Date(pos.last_updated).getTime() <= 5 * 60 * 1000 ? "Idle" : "No signal"),
            x,
            y,
          };
        });
      });
    });
    liveFleetSocket.connect();
    // This effect runs once for the life of the SPA - FleetSocketProvider sits above the
    // router in App(), so it never unmounts on internal navigation. Only a full page
    // unload/reload (or logout, if that ever unmounts the provider) tears the socket down.
    return () => {
      window.clearInterval(tick);
      offConnection();
      offHeartbeat();
      offPositions();
      liveFleetSocket.disconnect();
    };
  }, [queryClient]);

  return <FleetSocketContext.Provider value={{ connected, feedStale }}>{children}</FleetSocketContext.Provider>;
}

export function useFleetSocketConnection(): boolean {
  return useContext(FleetSocketContext).connected;
}

// True when the socket is up but neither a heartbeat nor a position has arrived for a minute.
export function useFleetFeedStale(): boolean {
  return useContext(FleetSocketContext).feedStale;
}
