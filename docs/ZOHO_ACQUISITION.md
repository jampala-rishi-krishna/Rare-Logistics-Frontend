# Zoho GET acquisition layer (Phase 2A)

**Equivalent Zoho GETs can now share one in-flight HTTP request.** Code: `backend/services/zoho_acquisition.py`,
wired in through `zoho_client._request`. No database tables, columns or persistence paths are involved.

## Resource key
`(generation, operation-name | "live", (method, url, client_id, sorted JSON of every query param incl. organization_id))`.
Path, ID, page, per_page, filters and organization are all in the key, so list vs detail, page 1 vs 2, and different
orgs never share. Different resource types can never be substituted for one another.

## In-flight sharing
- Lock protects only: key lookup, future registration, completed-result lookup/publish, cleanup. **No network I/O under a lock.**
- First caller owns the request (with the existing `MAX_RETRIES` retry sequence); later callers wait on its `Future`.
- Owner always removes the in-flight entry in `finally`. Waiters get the same result, or the same exception.
- Every caller gets a `deepcopy`; one caller mutating its result cannot corrupt another's.
- **Failures are never cached.** The next request starts a fresh acquisition.

## Completed-result reuse (deliberately narrow)
Existing TTLs are unchanged (60 s / 300 s / no-TTL caches stay as they were). The layer adds reuse only inside one
logical operation, declared with `@zoho_acquisition.operation(name, reuse_details=True)`:
- `fleet-refresh` (`POST /vehicles/refresh`, incl. the scheduler): a SO detail fetched while hydrating the assigned
  snapshot is reused by the refresh loop. Fleet payload, history writes and delivered logic are untouched.
- `report-build`: the three Sales Order detail enrichment buckets share one detail per ID.
  `_detail_map` still applies `ids[:80]` then dedupes, per bucket, exactly as before.
Only successful Sales Order **detail** GETs are reusable; list responses never are. A new invocation starts empty,
so a manual refresh or a later scheduler run always re-fetches.

## Generation barrier
A global generation counter is part of every key. It advances on every mutation (POST/PUT/DELETE, fenced before and
after the retry sequence, including ambiguous failures) and on cache invalidation
(`invalidate_windows`, `invalidate_assigned_zoho`, `refresh_zoho_data`). Cache publishers
(`live_sales_order_cache`, dispatch date/detail caches, report cache) record the generation before fetching and publish
via `zoho_acquisition.publication(epoch)`; an older in-flight result is dropped instead of overwriting newer state, and a
GET issued after a mutation never joins a pre-mutation request.

## Mutation boundaries
Writes are never coalesced, cached or replayed. Drawer open and remove-acknowledgement now reuse the detail GET they
already do instead of discarding it and fetching again (`publish_zoho_data`); the POST still happens exactly once.

## Reports
`GET /rgf-logistics` coalesces concurrent identical requests per `(org, day, section, generation)`, including forced
ones (one shared refresh); different sections build independently. Returned payloads are copies.

## Instrumentation
Logger `zoho`, lines `[ZOHO_ACQUIRE] event=<kind> source route request_id ...` with kinds `logical_request`,
`cache_hit`, `cache_miss`, `coalesced_waiter`, `http_attempt` (attempt, retry, page, per_page, endpoint, method),
`http_result` (status, rows, ms) and `report_candidates`. Logical requests, actual HTTP calls, waiters, hits, misses
and retries can be counted from these. Headers, tokens and query strings are never logged.

## Not done on purpose
Multi-ID detail replacement, `last_modified_time` incremental sync, longer TTLs, DB-backed API caching, scheduler removal.

---

# Phase 2B: rate limiting, backpressure and retry coordination
Code: `backend/services/zoho_rate_limiter.py`, used only from `zoho_client._request_http` - the single function that
performs every Zoho Inventory HTTP call, so Fleet, Dispatch, Reports, Load Planning and the schedulers all share it.

```
caller -> cache check -> in-flight coalescing -> [owner only] -> for each attempt: limiter.admit() -> httpx -> release
```
- **Only actual attempts are admitted.** Coalesced waiters and cache hits never consume a slot. Every retry is a new
  attempt and passes the limiter again. Backoff sleeps happen outside the limiter, so waiting holds no slot.
- **Concurrency** (bounded semaphore) and **pacing** (GCRA: sustained spacing + burst) are separate. Pacing reserves a start
  time under a short lock and sleeps outside it; no lock is held during sleeps or HTTP.
- **One limiter per Zoho organization id**, shared by all features. (IntelliFleet uses one org today.)
- **429 / 5xx / timeout / connection errors** are retried exactly as before (`MAX_RETRIES = 3`, i.e. up to 4 attempts);
  4xx client errors and 401/403 are not retried. A 429 also puts the whole limiter into cooldown for the wait, so other callers
  do not keep hitting Zoho. The owner retries inside the same acquisition; waiters keep waiting on it.
- **Retry-After**: delta-seconds or HTTP-date, honoured exactly but clamped to [0.25 s, 10 s] (the pre-existing clamp).
  Missing/invalid: `min(8, 0.5 * 2**attempt)` plus up to 25 % jitter (jitter is new; only upward, so never earlier than before).
- **Writes** are still never coalesced; they are paced like any other attempt. Their retry-on-5xx/timeout is pre-existing behaviour.
- **OAuth refresh** (Accounts endpoint) is not Inventory-gated; it is now single-flight so concurrent expiry causes one refresh.

## Configuration (all optional)
| Variable | Default | Meaning |
|---|---|---|
| `ZOHO_API_RATE_PER_MINUTE` | 100 | Zoho's per-organization ceiling |
| `ZOHO_RATE_SAFETY_PERCENT` | 80 | share of the ceiling used sustained (-> 0.75 s spacing) |
| `ZOHO_RATE_BURST` | 10 | back-to-back attempts before pacing; 80 sustained + 10 burst stays under 100 in any 60 s |
| `ZOHO_MAX_CONCURRENCY` | 5 | simultaneous in-flight attempts across the whole app |
Invalid values are logged and replaced by the default.

## Metrics
`zoho_rate_limiter.metrics.snapshot()` returns logical requests, HTTP attempts, successes, 429s, retry attempts, coalesced waiters,
cache hits/misses, average rate/concurrency wait and max concurrency. The same data is in the `[ZOHO_ACQUIRE]` log lines
(`http_attempt` carries `rate_wait_ms`/`concurrency_wait_ms`; `http_429`, `http_retry`, `http_failure` carry status and Retry-After).

---

# Phase 3: measuring production
No production numbers exist in this repo; they must be computed from real logs.

1. Deploy (Render, single worker/instance, so the in-process limiter is the org-wide limiter).
2. Collect at least one normal business week of Render logs (include peak mornings).
3. `python backend/scripts/analyze_zoho_logs.py <log files> [--since YYYY-MM-DD --until YYYY-MM-DD] [--json]`

Reports: logical requests, HTTP attempts (GET/write), retries by cause, 429 per day/hour/feature/endpoint, coalescing ratio,
cache hits, rate/concurrency wait avg/p50/p95/max, peak calls/minute, per-feature and per-endpoint tables, HTTP duration by
endpoint, and initial fetches of the same resource repeated inside one request (a regression signal for Phase 2A).
Event kinds: `logical_request`, `cache_hit`, `cache_miss` (owner), `coalesced_waiter`, `http_attempt`, `http_outcome`
(status, category, ms, Retry-After per attempt), `http_retry`, `http_429`, `http_failure`, `http_success`, `http_result`
(rows, has_more_page), `report_candidates`. Feature is derived from the logged route; scheduler runs are source `fleet-refresh`
with route `background` and a fresh request id per run.
Limits: the log has no business denominators (SOs processed, report runs) - get those from the app/DB and divide separately.
