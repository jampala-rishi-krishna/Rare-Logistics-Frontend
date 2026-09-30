// Mounted once at the app root (above the router), so the shared liveFleetSocket singleton
// connects on app load and only disconnects on real app teardown - never on internal route
// navigation. Previously every page that wanted live positions (Tower, DataTablePage) called
// its own connect()/disconnect() pair, which tore down and reopened the one shared socket on
// every navigation between them (see the Control Tower "stuck at 0 kph" investigation).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { liveFleetSocket, type FleetPosition } from "@/lib/live-fleet-socket";
import { projectLatLngToMapXY, type UiVehicle } from "@/services/adapters";

const FleetSocketContext = createContext<{ connected: boolean }>({ connected: false });

export function FleetSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(liveFleetSocket.isConnected);

  useEffect(() => {
    const offConnection = liveFleetSocket.onConnectionChange(setConnected);
    const offPositions = liveFleetSocket.onPositions((positions: FleetPosition[]) => {
      // Control Tower owns the 5-second live view. Fleet is an operational snapshot:
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
      offConnection();
      offPositions();
      liveFleetSocket.disconnect();
    };
  }, [queryClient]);

  return <FleetSocketContext.Provider value={{ connected }}>{children}</FleetSocketContext.Provider>;
}

export function useFleetSocketConnection(): boolean {
  return useContext(FleetSocketContext).connected;
}
