// Pure reconnect policy for the live fleet WebSocket (src/lib/live-fleet-socket.ts).

export const WS_BASE_DELAY_MS = 1000;
export const WS_MAX_DELAY_MS = 30000;

/** Deterministic exponential ceiling: 1s, 2s, 4s ... capped at 30s. attempt is 0-based. */
export function backoffCeilingMs(attempt: number, base = WS_BASE_DELAY_MS, cap = WS_MAX_DELAY_MS): number {
  return Math.min(cap, base * 2 ** Math.max(0, attempt));
}

/** Full jitter: uniform in [0, ceiling]. Best at spreading a thundering herd after a server restart. */
export function fullJitterMs(attempt: number, random: () => number = Math.random): number {
  return Math.round(random() * backoffCeilingMs(attempt));
}

/** Equal jitter: uniform in [ceiling/2, ceiling]. Never reconnects instantly - what the socket uses. */
export function equalJitterMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = backoffCeilingMs(attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Close code the backend sends for an invalid / expired token. */
export const WS_CLOSE_UNAUTHORIZED = 4401;
/** Close code for a disallowed Origin. */
export const WS_CLOSE_FORBIDDEN_ORIGIN = 4403;

export type CloseDecision = "reconnect" | "stop" | "stop_and_sign_in";

/** What to do after the socket closes. A client-initiated close never reconnects. */
export function closeDecision(code: number, closedByClient: boolean): CloseDecision {
  if (closedByClient) return "stop";
  if (code === WS_CLOSE_UNAUTHORIZED) return "stop_and_sign_in";
  if (code === WS_CLOSE_FORBIDDEN_ORIGIN) return "stop";
  return "reconnect";
}

/** Appends ?token= when there is a session token; tokenless connections stay allowed (public/driver pages). */
export function socketUrl(base: string, token: string | null | undefined): string {
  if (!token) return base;
  const [path, hash = ""] = base.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}token=${encodeURIComponent(token)}${hash ? `#${hash}` : ""}`;
}

export interface FleetStatusMessage {
  type: "status";
  cartrack?: string;
  [key: string]: unknown;
}

export function isStatusMessage(message: unknown): message is FleetStatusMessage {
  return Boolean(message && typeof message === "object" && (message as { type?: unknown }).type === "status");
}
