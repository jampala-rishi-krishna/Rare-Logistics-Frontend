// One reconnecting WebSocket client for the unified backend fleet broadcast.
// Reconnect policy (backoff, close codes, token URL) is pure and tested in ./wsBackoff.ts.

import { getStoredSessionId, handleUnauthorized } from "@/services/api/client";
import { closeDecision, equalJitterMs, isStatusMessage, socketUrl, type FleetStatusMessage } from "./wsBackoff.ts";

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
  gps_time?: string | null;
}

interface FleetPositionsMessage {
  type: "FLEET_POSITIONS" | "VEHICLE_POSITION_UPDATE";
  positions: FleetPosition[];
  count: number;
  timestamp: string;
}

type Handler = (positions: FleetPosition[]) => void;
type HeartbeatHandler = () => void;
type ConnectionHandler = (connected: boolean) => void;
type StatusHandler = (status: FleetStatusMessage) => void;

const WS_URL = (import.meta.env.VITE_CARTRACK_WS_URL as string | undefined) || "ws://localhost:8000/ws/fleet";

class LiveFleetSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private positionHandlers = new Set<Handler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private heartbeatHandlers = new Set<HeartbeatHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private closedByClient = false;
  /** Set by a 4401/4403 close: the server refused us, so retrying would just loop. */
  private stopped = false;
  /** A reconnect came due while the tab was hidden: run it when the tab is visible again. */
  private reconnectPausedWhileHidden = false;
  private visibilityListening = false;
  /** Latest {type: "status"} frame (e.g. {cartrack: "unavailable"}), or null if none received. */
  lastStatus: FleetStatusMessage | null = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedByClient = false;
    this.stopped = false;
    this.listenForVisibility();
    this.open();
  }

  private listenForVisibility() {
    if (this.visibilityListening || typeof document === "undefined") return;
    this.visibilityListening = true;
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  private handleVisibility = () => {
    if (document.hidden || !this.reconnectPausedWhileHidden) return;
    this.reconnectPausedWhileHidden = false;
    if (this.closedByClient || this.stopped) return;
    // Back in view: reconnect now rather than waiting out a long backoff.
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.open();
  };

  private scheduleReconnect() {
    const delay = equalJitterMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closedByClient || this.stopped) return;
      // Hidden tabs don't burn reconnect attempts (or server connections); resume on visibilitychange.
      if (typeof document !== "undefined" && document.hidden) {
        this.reconnectPausedWhileHidden = true;
        return;
      }
      this.open();
    }, delay);
  }

  private open() {
    // The token rides as ?token= (optional - tokenless connections are still allowed by the backend).
    const ws = new WebSocket(socketUrl(WS_URL, getStoredSessionId()));
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.connectionHandlers.forEach((h) => h(true));
    };

    ws.onmessage = (event) => {
      let message: FleetPositionsMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return; // ignore malformed frames
      }
      if (!message || typeof message !== "object") return;
      if (isStatusMessage(message)) {
        this.lastStatus = message;
        this.statusHandlers.forEach((h) => h(message));
      } else if ((message as { type: string }).type === "GPS_HEARTBEAT") {
        this.heartbeatHandlers.forEach((h) => h());
      } else if (message.type === "FLEET_POSITIONS" && Array.isArray(message.positions)) {
        this.positionHandlers.forEach((h) => h(message.positions));
      } else if (message.type === "VEHICLE_POSITION_UPDATE") {
        const update = message as unknown as FleetPosition & { vehicle_id: number; plate_no: string; fuel_pct: number | null; gps_time?: string | null };
        this.positionHandlers.forEach((h) => h([{
          vehicle_id: String(update.vehicle_id), registration: update.plate_no,
          current_lat: update.current_lat, current_lng: update.current_lng,
          heading: update.heading, speed_kph: update.speed_kph,
          ignition_on: update.ignition_on, fuel_pct_live: update.fuel_pct ?? 0,
          address: "", last_updated: update.last_updated, gps_time: update.gps_time ?? null,
        }]));
      }
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return; // a superseded socket
      this.connectionHandlers.forEach((h) => h(false));
      const decision = closeDecision(event.code, this.closedByClient);
      if (decision === "reconnect") {
        this.scheduleReconnect();
        return;
      }
      if (decision === "stop_and_sign_in") {
        this.stopped = true;
        console.warn("[fleet-ws] closed 4401 (session invalid/expired): not reconnecting");
        handleUnauthorized(); // same single-flight redirect as an HTTP 401
      } else if (!this.closedByClient) {
        this.stopped = true;
        console.error(`[fleet-ws] closed ${event.code} (origin not allowed): not reconnecting`);
      }
    };

    ws.onerror = () => ws.close();
  }

  onPositions(handler: Handler) {
    this.positionHandlers.add(handler);
    return () => this.positionHandlers.delete(handler);
  }

  onHeartbeat(handler: HeartbeatHandler) {
    this.heartbeatHandlers.add(handler);
    return () => this.heartbeatHandlers.delete(handler);
  }

  /** {type: "status"} frames, e.g. {cartrack: "unavailable"} while the GPS provider is down. */
  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
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
    this.reconnectPausedWhileHidden = false;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.visibilityListening) {
      document.removeEventListener("visibilitychange", this.handleVisibility);
      this.visibilityListening = false;
    }
    this.ws?.close();
    this.ws = null;
  }
}

export const liveFleetSocket = new LiveFleetSocket();
