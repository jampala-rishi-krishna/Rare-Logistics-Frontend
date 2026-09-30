// One reconnecting WebSocket client for the unified backend fleet broadcast.

export interface FleetPosition {
  vehicle_id: string;
  registration: string;
  current_lat: number;
  current_lng: number;
  heading: number;
  speed_kph: number;
  ignition_on: boolean;
  fuel_pct_live: number;
  address: string;
  last_updated: string;
}

interface FleetPositionsMessage {
  type: "FLEET_POSITIONS" | "VEHICLE_POSITION_UPDATE";
  positions: FleetPosition[];
  count: number;
  timestamp: string;
}

type Handler = (positions: FleetPosition[]) => void;
type ConnectionHandler = (connected: boolean) => void;

const WS_URL = (import.meta.env.VITE_CARTRACK_WS_URL as string | undefined) || "ws://localhost:8000/ws/fleet";
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

class LiveFleetSocket {
  private ws: WebSocket | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: number | null = null;
  private positionHandlers = new Set<Handler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private closedByClient = false;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedByClient = false;
    this.open();
  }

  private open() {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.connectionHandlers.forEach((h) => h(true));
    };

    ws.onmessage = (event) => {
      let message: FleetPositionsMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return; // ignore malformed frames
      }
      if (message.type === "FLEET_POSITIONS" && Array.isArray(message.positions)) {
        this.positionHandlers.forEach((h) => h(message.positions));
      } else if (message.type === "VEHICLE_POSITION_UPDATE") {
        const update = message as unknown as FleetPosition & { vehicle_id: number; plate_no: string; fuel_pct: number | null };
        this.positionHandlers.forEach((h) => h([{
          vehicle_id: String(update.vehicle_id), registration: update.plate_no,
          current_lat: update.current_lat, current_lng: update.current_lng,
          heading: update.heading, speed_kph: update.speed_kph,
          ignition_on: update.ignition_on, fuel_pct_live: update.fuel_pct ?? 0,
          address: "", last_updated: update.last_updated,
        }]));
      }
    };

    ws.onclose = () => {
      this.connectionHandlers.forEach((h) => h(false));
      if (this.closedByClient) return;
      this.reconnectTimer = window.setTimeout(() => this.open(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    };

    ws.onerror = () => ws.close();
  }

  onPositions(handler: Handler) {
    this.positionHandlers.add(handler);
    return () => this.positionHandlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    this.closedByClient = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const liveFleetSocket = new LiveFleetSocket();
