// Pure error classification shared by the API client wrapper and the offline queue.
// Duck-typed on {status, body} so it does not import the HTTP client (which needs vite env).

export interface ErrorInfo {
  message: string;
  status: number | null;
  code: string | null;
  errors: Array<{ key: string; message: string }>;
  // true when no HTTP response was received at all (offline, DNS, timeout, CORS...).
  network: boolean;
}

// Tolerates `detail: {message, code, errors}` and FastAPI's plain-string `detail`.
export function errorInfo(err: unknown): ErrorInfo {
  const e = err as { status?: unknown; body?: unknown; message?: unknown } | null | undefined;
  if (e && typeof e === "object" && typeof e.status === "number") {
    const body = e.body as { detail?: unknown } | null | undefined;
    const detail = body && typeof body === "object" ? body.detail : undefined;
    let code: string | null = null;
    let errors: Array<{ key: string; message: string }> = [];
    let message = typeof e.message === "string" ? e.message : "";
    if (detail && typeof detail === "object") {
      const d = detail as { message?: unknown; code?: unknown; errors?: unknown };
      if (typeof d.message === "string" && d.message) message = d.message;
      if (typeof d.code === "string") code = d.code;
      if (Array.isArray(d.errors)) {
        errors = d.errors
          .filter((x): x is { key?: unknown; message?: unknown } => Boolean(x) && typeof x === "object")
          .map((x) => ({ key: String(x.key ?? ""), message: String(x.message ?? "Invalid value") }));
      }
    } else if (typeof detail === "string" && detail) {
      message = detail;
    }
    return { message: message || `Request failed (HTTP ${e.status})`, status: e.status, code, errors, network: e.status === 0 };
  }
  const message = e && typeof e.message === "string" && e.message ? e.message : "Could not reach the server. Check your connection.";
  return { message, status: null, code: null, errors: [], network: true };
}

export function errorMessage(err: unknown): string {
  return errorInfo(err).message;
}

export type FailureKind = "network" | "retry" | "unauthorized" | "needs_attention";

// How the offline queue / action submitter reacts to a failed request.
//  network/retry     -> keep queued, back off, try again later (network error, 5xx, 429, 408)
//  unauthorized      -> stop syncing and send the user to login
//  needs_attention   -> 409 out_of_order, 422, and any other 4xx: the server refused it for good
export function classifyFailure(err: unknown): { kind: FailureKind; info: ErrorInfo } {
  const info = errorInfo(err);
  if (info.network) return { kind: "network", info };
  const status = info.status ?? 0;
  if (status === 401) return { kind: "unauthorized", info };
  // Photo storage not configured: retrying will not help.
  if (info.code === "storage_disabled") return { kind: "needs_attention", info };
  if (status >= 500 || status === 429 || status === 408) return { kind: "retry", info };
  return { kind: "needs_attention", info };
}
