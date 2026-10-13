// TEST-ONLY network layer: every request the app makes to the (fake) API origin is answered here with fixtures from e2e/fixtures.
// Nothing else may leave the browser: any other fetch/XHR is aborted and recorded, and the spec fails if one happened.
import type { Page, Route } from "playwright";
import * as d from "./fixtures/driverData.ts";
import * as ov from "./fixtures/overviewData.ts";

export const API_ORIGIN = "http://mock-api.test";

export interface Scenario {
  session?: unknown | null; // null = signed out
  me?: unknown;
  today?: unknown;
  detail?: Record<string, unknown>;
  history?: (params: URLSearchParams) => unknown;
  alerts?: unknown;
  issues?: unknown;
  actionError?: { status: number; body: unknown } | null;
  loginFails?: boolean;
  slowMs?: number;
  role?: "admin" | "dispatcher";
  board?: unknown;
  issues_ov?: unknown;
}

export interface Recorder {
  // true = the fake API origin is unreachable (phone offline / server down): requests fail like a real network error
  apiDown: boolean;
  unexpected: string[];
  calls: Array<{ method: string; path: string; body: unknown }>;
}

const BLANK_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
}

export async function installMocks(page: Page, scenario: Scenario = {}): Promise<Recorder> {
  const recorder: Recorder = { apiDown: false, unexpected: [], calls: [] };
  const detail: Record<string, unknown> = { "b-1": d.detailPending, "b-2": d.detailReady, "b-3": d.detailOnTrip, ...(scenario.detail ?? {}) };
  if (scenario.session !== null) await page.addInitScript(() => localStorage.setItem("if-access-token", "test-token-not-real"));

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname.endsWith("tile.openstreetmap.org")) return route.fulfill({ contentType: "image/png", body: BLANK_PNG });
    if (url.hostname !== new URL(API_ORIGIN).hostname) {
      if (["fetch", "xhr", "websocket"].includes(request.resourceType())) recorder.unexpected.push(`${request.method()} ${request.url()}`);
      return route.abort(); // fonts, hero images, analytics: never needed to render the driver app
    }
    if (recorder.apiDown) return route.abort("internetdisconnected");
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = url.pathname;
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    recorder.calls.push({ method: request.method(), path, body });
    if (scenario.slowMs) await new Promise((r) => setTimeout(r, scenario.slowMs));

    if (path === "/auth/session") {
      const fallback = scenario.role === "dispatcher" ? ov.dispatcherSession : scenario.role === "admin" ? ov.adminSession : d.session;
      return scenario.session === null ? json(route, { detail: "Not authenticated" }, 401) : json(route, scenario.session ?? fallback);
    }
    // the app shell of the /app pages asks for the mailbox connection once
    if (path === "/api/gmail/auth-status") return json(route, { connected: true, authorized: true, status: "connected" });
    // ---- Driver Overview (admin / dispatcher) ----
    if (path.startsWith("/api/driver-overview/")) {
      const sub = path.slice("/api/driver-overview/".length);
      if (sub === "summary") return json(route, ov.kpis);
      if (sub === "board") return json(route, scenario.board ?? ov.board);
      if (sub === "live") return json(route, ov.live);
      if (sub === "map") return json(route, ov.map);
      if (sub === "trips") return json(route, ov.trips);
      if (sub === "hardcopies") return json(route, ov.hardcopies);
      if (sub === "issues" && request.method() === "GET") return json(route, scenario.issues_ov ?? ov.issues);
      if (/^issues\/\d+\/respond$/.test(sub)) return json(route, { ok: true, changed: true, issue: ov.issues.issues[0] });
      if (sub === "templates") return json(route, ov.templatesResponse);
      if (/^templates\/[a-z_]+\/versions\/\d+$/.test(sub)) return json(route, { ...ov.templatesResponse.delivery_checkout.active, version: 1, name: "DRAFT \u2014 mirror of Zoho form", is_draft: true, active: false });
      if (/^templates\/[a-z_]+$/.test(sub) && request.method() === "POST") return json(route, { ...ov.templatesResponse.delivery_checkout.active, version: 3 }, 201);
      if (/^trips\/[^/]+$/.test(sub)) return json(route, ov.tripTimeline);
      if (/^drivers\/\d+$/.test(sub)) return json(route, ov.driverDetail);
      if (sub === "export.csv") return route.fulfill({ status: 200, contentType: "text/csv; charset=utf-8", headers: { ...CORS, "content-disposition": 'attachment; filename="driver-overview-test.csv"', "access-control-expose-headers": "content-disposition" }, body: ov.csv });
    }

    if (path === "/auth/login") {
      const identifier = String((body as { identifier?: string } | null)?.identifier ?? "");
      if (scenario.loginFails || identifier === "wrong@example.test") return json(route, { detail: "Invalid credentials." }, 401);
      return json(route, { user: d.session.user, token: "test-token-not-real" });
    }
    if (path === "/auth/support") return json(route, { dispatch_phone: "0285550100" });
    if (path === "/auth/logout") return json(route, { ok: true });
    if (path === "/auth/change-password") return json(route, { ok: true });
    if (path === "/api/driver/me") return json(route, scenario.me ?? d.me);
    if (path === "/api/driver/today") return json(route, scenario.today ?? d.today);
    if (path === "/api/driver/history") return json(route, scenario.history ? scenario.history(url.searchParams) : d.historyAll);
    if (path === "/api/driver/templates") return json(route, d.templates);
    if (path === "/api/driver/officers") return json(route, d.officers);
    if (path === "/api/driver/alerts") return json(route, scenario.alerts ?? d.alerts);
    if (path === "/api/driver/alerts/read") return json(route, { ok: true, marked: 1, unread: 0 });
    if (path === "/api/driver/issues/meta") return json(route, d.issueMeta);
    if (path === "/api/driver/issues" && request.method() === "GET") return json(route, scenario.issues ?? d.issuesList);
    if (path === "/api/driver/issues" && request.method() === "POST") {
      const sent = body as { category: string; priority: string; description: string; batch_id: string | null; so_id: string | null };
      return json(route, { ok: true, replayed: false, issue: { ...d.issuesList.issues[1], id: 9, reference: "IS-20261013-0009", category: sent.category, priority: sent.priority, description: sent.description } });
    }
    const assignment = /^\/api\/driver\/assignments\/([^/]+)$/.exec(path);
    if (assignment) {
      const found = detail[decodeURIComponent(assignment[1])];
      return found ? json(route, found) : json(route, { detail: "Assignment not found." }, 404);
    }
    if (/^\/api\/driver\/batches\/[^/]+\/route$/.test(path)) return json(route, d.route);
    if (/^\/api\/driver\/batches\/[^/]+\/timeline$/.test(path)) return json(route, d.timelineStub);
    const action = /^\/api\/driver\/batches\/([^/]+)\/(start|end|handover|orders\/[^/]+\/(acknowledge|check-in|check-out))$/.exec(path);
    if (action && request.method() === "POST") {
      if (scenario.actionError) return json(route, scenario.actionError.body, scenario.actionError.status);
      return json(route, { ok: true, already_done: false, replayed: false, done_by: null, batch: detail[decodeURIComponent(action[1])] ?? null });
    }
    recorder.unexpected.push(`UNMOCKED ${request.method()} ${path}`);
    return json(route, { detail: "No mock for this request." }, 404);
  });
  return recorder;
}
