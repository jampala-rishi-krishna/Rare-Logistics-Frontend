import assert from "node:assert/strict";
import { test } from "node:test";
import { applyUploads, backoffMs, createMemoryStorage, createQueueEngine } from "./offlineQueue.ts";
import type { QueueEngine, SyncApi } from "./offlineQueue.ts";
import { cachedFetch } from "./offlineCache.ts";
import { createSubmitter } from "./tripActions.ts";
import { classifyFailure, errorInfo } from "./tripErrors.ts";
import type { ActionResponse } from "./tripTypes.ts";

const OK: ActionResponse = { ok: true, already_done: false, replayed: false, done_by: null, batch: null };

function httpErr(status: number, detail: unknown) {
  const message = typeof detail === "string" ? detail : (detail as { message?: string }).message ?? "";
  return Object.assign(new Error(message), { status, body: { detail } });
}
const netErr = () => new TypeError("Failed to fetch");

type PostCall = { path: string; body: Record<string, unknown> };

function setup(handlers: { post?: (call: PostCall, n: number) => Promise<ActionResponse>; upload?: (req: any, n: number) => Promise<{ photo_id: number }> } = {}) {
  const storage = createMemoryStorage();
  const posts: PostCall[] = [];
  const uploads: any[] = [];
  const clock = { t: 1_000_000 };
  let unauthorized = 0;
  const results: string[] = [];
  const api: SyncApi = {
    async post(path, body) {
      posts.push({ path, body });
      return handlers.post ? handlers.post({ path, body }, posts.length) : OK;
    },
    async upload(req) {
      uploads.push(req);
      return handlers.upload ? handlers.upload(req, uploads.length) : { photo_id: 100 + uploads.length };
    },
  };
  let idn = 0;
  const engine = createQueueEngine({
    storage,
    api,
    now: () => clock.t,
    newId: () => `id${++idn}`,
    onUnauthorized: () => {
      unauthorized += 1;
    },
    onResult: (e) => results.push(e.kind),
  });
  return { storage, engine, api, posts, uploads, clock, results, unauthorizedCount: () => unauthorized };
}

const body = (key: string, extra: Record<string, unknown> = {}) => ({ idempotency_key: key, client_ts: `ts-${key}`, gps: null, gps_denied_reason: "denied", ...extra });
const entryOf = (batch: string, kind: any, key: string, extra: Record<string, unknown> = {}) => ({ batch_id: batch, so_id: kind === "start" ? null : "so1", kind, path: `/p/${batch}/${kind}/${key}`, body: body(key, extra) });

test("FIFO order is preserved and entries are removed on success", async () => {
  const s = setup();
  await s.engine.enqueue(entryOf("b1", "acknowledge", "k1"));
  await s.engine.enqueue(entryOf("b1", "acknowledge", "k2"));
  await s.engine.enqueue(entryOf("b1", "start", "k3"));
  const summary = await s.engine.sync();
  assert.equal(summary.done, 3);
  assert.deepEqual(s.posts.map((p) => p.body.idempotency_key), ["k1", "k2", "k3"]);
  assert.equal(s.engine.getSnapshot().length, 0);
  assert.equal(s.storage.entries.size, 0);
  assert.deepEqual(s.results, ["acknowledge", "acknowledge", "start"]);
});

test("network error keeps the entry, backs off, and retries with the same key and client_ts", async () => {
  let fail = true;
  const s = setup({ post: async () => { if (fail) throw netErr(); return OK; } });
  await s.engine.enqueue(entryOf("b1", "start", "k1"));
  const first = await s.engine.sync();
  assert.equal(first.stopped, "offline");
  let e = s.engine.getSnapshot()[0];
  assert.equal(e.status, "pending");
  assert.equal(e.attempts, 1);
  assert.equal(e.next_attempt_at, s.clock.t + backoffMs(1));
  // still inside the backoff window: not retried
  await s.engine.sync();
  assert.equal(s.posts.length, 1);
  // after the window (and with the network back) it is retried with the same key/ts
  fail = false;
  s.clock.t += backoffMs(1) + 1;
  const again = await s.engine.sync();
  assert.equal(again.done, 1);
  assert.equal(s.posts.length, 2);
  assert.equal(s.posts[1].body.idempotency_key, "k1");
  assert.equal(s.posts[1].body.client_ts, "ts-k1");
  assert.equal(s.engine.getSnapshot().length, 0);
  // force (online event) ignores the backoff
  fail = true;
  await s.engine.enqueue(entryOf("b1", "end", "k2"));
  await s.engine.sync();
  fail = false;
  const forced = await s.engine.sync({ force: true });
  assert.equal(forced.done, 1);
});

test("backoff grows exponentially and is capped", () => {
  assert.equal(backoffMs(1), 2000);
  assert.equal(backoffMs(2), 4000);
  assert.equal(backoffMs(3), 8000);
  assert.equal(backoffMs(30), 300000);
});

test("5xx backs off that batch but other batches continue", async () => {
  const s = setup({ post: async (c) => { if (c.path.includes("/b1/")) throw httpErr(502, "bad gateway"); return OK; } });
  await s.engine.enqueue(entryOf("b1", "acknowledge", "k1"));
  await s.engine.enqueue(entryOf("b1", "start", "k2"));
  await s.engine.enqueue(entryOf("b2", "acknowledge", "k3"));
  const summary = await s.engine.sync();
  assert.equal(summary.done, 1);
  assert.equal(summary.stopped, null);
  // k2 must NOT have been sent ahead of k1 (FIFO per batch)
  assert.deepEqual(s.posts.map((p) => p.body.idempotency_key), ["k1", "k3"]);
  assert.equal(s.engine.getSnapshot().length, 2);
});

test("409 out_of_order and 422 go to needs_attention, are kept, and do not block others", async () => {
  const s = setup({
    post: async (c) => {
      if (c.body.idempotency_key === "k1") throw httpErr(409, { message: "The trip has already started.", code: "out_of_order" });
      if (c.body.idempotency_key === "k2") throw httpErr(422, { message: "Invalid", code: "validation", errors: [{ key: "reason", message: "Required" }] });
      return OK;
    },
  });
  await s.engine.enqueue(entryOf("b1", "acknowledge", "k1"));
  await s.engine.enqueue(entryOf("b1", "check_out", "k2"));
  await s.engine.enqueue(entryOf("b1", "end", "k3"));
  const summary = await s.engine.sync();
  assert.equal(summary.needs_attention, 2);
  assert.equal(summary.done, 1);
  const snap = s.engine.getSnapshot();
  assert.deepEqual(snap.map((e) => [e.body.idempotency_key, e.status]), [["k1", "needs_attention"], ["k2", "needs_attention"]]);
  assert.equal(snap[0].error, "The trip has already started.");
  assert.equal(snap[0].code, "out_of_order");
  // a sync does not resend needs_attention entries
  await s.engine.sync({ force: true });
  assert.equal(s.posts.length, 3);
  // user retries one: same key again; dismisses the other
  await s.engine.retry(snap[0].id);
  assert.equal(s.engine.getSnapshot().find((e) => e.id === snap[0].id)?.status, "pending");
  await s.engine.dismiss(snap[1].id);
  assert.equal(s.engine.getSnapshot().length, 1);
  await s.engine.sync();
  assert.equal(s.posts[3].body.idempotency_key, "k1");
});

test("already_done and replayed responses count as done", async () => {
  const s = setup({
    post: async (c) =>
      c.body.idempotency_key === "k1"
        ? { ...OK, already_done: true, done_by: { name: "Raymond", at: "t" } }
        : { ...OK, replayed: true },
  });
  await s.engine.enqueue(entryOf("b1", "check_in", "k1"));
  await s.engine.enqueue(entryOf("b1", "check_in", "k2"));
  const summary = await s.engine.sync();
  assert.equal(summary.done, 2);
  assert.equal(s.engine.getSnapshot().length, 0);
});

test("401 stops the loop, keeps the entry untouched, and signals login", async () => {
  const s = setup({ post: async () => { throw httpErr(401, "Not authenticated"); } });
  await s.engine.enqueue(entryOf("b1", "start", "k1"));
  await s.engine.enqueue(entryOf("b2", "start", "k2"));
  const summary = await s.engine.sync();
  assert.equal(summary.stopped, "unauthorized");
  assert.equal(s.unauthorizedCount(), 1);
  assert.equal(s.posts.length, 1);
  const snap = s.engine.getSnapshot();
  assert.equal(snap.length, 2);
  assert.equal(snap[0].status, "pending");
  assert.equal(snap[0].attempts, 0);
});

test("blobs are uploaded first and the photo_id is substituted into answers (object and array)", async () => {
  const s = setup();
  const blob = new Blob(["x"]);
  await s.engine.enqueue({
    batch_id: "b1",
    so_id: "so1",
    kind: "check_out",
    path: "/co",
    body: body("k1", { template_id: 2, answers: { outcome: "Delivered", delivery_photo: null, signature: null } }),
    blobs: [
      { field_key: "delivery_photo", upload_key: "u1", blob, filename: "a.jpg" },
      { field_key: "signature", upload_key: "u2", blob, filename: "s.png" },
    ],
  });
  await s.engine.enqueue({
    batch_id: "b1",
    so_id: "so2",
    kind: "acknowledge",
    path: "/ack",
    body: body("k2", { answers: [{ item_id: 3, checked: true, photo_id: null }, { item_id: 4, checked: true, photo_id: null }] }),
    blobs: [{ field_key: "item:4", upload_key: "u3", blob, filename: "c.jpg" }],
  });
  await s.engine.sync();
  assert.deepEqual(s.uploads.map((u) => u.upload_key), ["u1", "u2", "u3"]);
  assert.deepEqual((s.posts[0].body.answers as any), { outcome: "Delivered", delivery_photo: 101, signature: 102 });
  assert.deepEqual((s.posts[1].body.answers as any), [{ item_id: 3, checked: true, photo_id: null }, { item_id: 4, checked: true, photo_id: 103 }]);
  assert.equal(s.posts[0].body.idempotency_key, "k1");
});

test("a failed post after uploads does not re-upload on retry", async () => {
  let failPost = true;
  const s = setup({ post: async () => { if (failPost) throw netErr(); return OK; } });
  await s.engine.enqueue({ batch_id: "b1", so_id: "so1", kind: "check_out", path: "/co", body: body("k1", { answers: { photo: null } }), blobs: [{ field_key: "photo", upload_key: "u1", blob: new Blob(["x"]), filename: "a.jpg" }] });
  await s.engine.sync();
  failPost = false;
  await s.engine.sync({ force: true });
  assert.equal(s.uploads.length, 1);
  assert.equal((s.posts[1].body.answers as any).photo, 101);
});

test("upload failure with network error keeps the entry pending; 422 on upload needs attention", async () => {
  let mode: "net" | "bad" = "net";
  const s = setup({ upload: async () => { throw mode === "net" ? netErr() : httpErr(422, { message: "File too large", code: "validation" }); } });
  await s.engine.enqueue({ batch_id: "b1", kind: "check_out", path: "/co", body: body("k1", { answers: { photo: null } }), blobs: [{ field_key: "photo", upload_key: "u1", blob: new Blob(["x"]), filename: "a.jpg" }] });
  await s.engine.sync();
  assert.equal(s.posts.length, 0);
  assert.equal(s.engine.getSnapshot()[0].status, "pending");
  mode = "bad";
  await s.engine.sync({ force: true });
  assert.equal(s.engine.getSnapshot()[0].status, "needs_attention");
  assert.equal(s.engine.getSnapshot()[0].error, "File too large");
});

test("enqueue is idempotent per idempotency_key (no duplicates after a replayed tap)", async () => {
  const s = setup();
  const a = await s.engine.enqueue(entryOf("b1", "start", "same"));
  const b = await s.engine.enqueue(entryOf("b1", "start", "same"));
  assert.equal(a.id, b.id);
  assert.equal(s.engine.getSnapshot().length, 1);
});

test("load restores persisted entries, resets syncing to pending, continues the sequence", async () => {
  const s = setup();
  await s.storage.saveEntry({ id: "old", seq: 7, batch_id: "b1", kind: "start", path: "/p", body: body("k0"), created_at: 1, attempts: 2, status: "syncing" });
  await s.engine.load();
  assert.equal(s.engine.getSnapshot()[0].status, "pending");
  const next = await s.engine.enqueue(entryOf("b1", "end", "k1"));
  assert.equal(next.seq, 8);
  await s.engine.sync();
  assert.deepEqual(s.posts.map((p) => p.body.idempotency_key), ["k0", "k1"]);
});

test("concurrent sync calls do not double-send", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const s = setup({ post: async () => { await gate; return OK; } });
  await s.engine.enqueue(entryOf("b1", "start", "k1"));
  const p1 = s.engine.sync();
  const p2 = s.engine.sync();
  release();
  await Promise.all([p1, p2]);
  assert.equal(s.posts.length, 1);
});

test("subscribe is notified and snapshot identity changes", async () => {
  const s = setup();
  let calls = 0;
  s.engine.subscribe(() => { calls += 1; });
  const before = s.engine.getSnapshot();
  await s.engine.enqueue(entryOf("b1", "start", "k1"));
  assert.ok(calls > 0);
  assert.notEqual(s.engine.getSnapshot(), before);
});

test("applyUploads leaves unknown keys alone and does not mutate the input", () => {
  const input = { answers: { a: null } };
  const out = applyUploads(input, [{ field_key: "zzz", upload_key: "u", blob: new Blob([]), filename: "f" }], { u: 5 });
  assert.deepEqual(input, { answers: { a: null } });
  assert.equal((out.answers as any).zzz, 5);
});

// ---- submitter (online first, queue on failure) ----

function submitterSetup(handlers: Parameters<typeof setup>[0] = {}) {
  const s = setup(handlers);
  const submitter = createSubmitter({ engine: s.engine as QueueEngine, api: s.api });
  const spec = (key: string, kind: any = "start") => ({ batch_id: "b1", so_id: null, kind, path: "/p", body: body(key) as any });
  return { ...s, submitter, spec };
}

test("submitter: online success returns done and queues nothing", async () => {
  const s = submitterSetup();
  const out = await s.submitter.submit(s.spec("k1"));
  assert.equal(out.status, "done");
  assert.equal(s.engine.getSnapshot().length, 0);
});

test("submitter: network failure queues with the same key/ts; later sync sends it once", async () => {
  let offline = true;
  const s = submitterSetup({ post: async () => { if (offline) throw netErr(); return OK; } });
  const out = await s.submitter.submit(s.spec("k1"));
  assert.equal(out.status, "queued");
  offline = false;
  await s.engine.sync({ force: true });
  assert.equal(s.posts.length, 2);
  assert.equal(s.posts[1].body.idempotency_key, "k1");
  assert.equal(s.posts[1].body.client_ts, "ts-k1");
  assert.equal(s.engine.getSnapshot().length, 0);
});

test("submitter: 409 / 422 are rejected inline, not queued; 401 is reported", async () => {
  const s = submitterSetup({ post: async (c) => { throw c.body.idempotency_key === "a" ? httpErr(409, { message: "Check in at this stop first.", code: "out_of_order" }) : httpErr(401, "no"); } });
  const r = await s.submitter.submit(s.spec("a"));
  assert.equal(r.status, "rejected");
  assert.equal((r as any).info.code, "out_of_order");
  assert.equal(s.engine.getSnapshot().length, 0);
  assert.equal((await s.submitter.submit(s.spec("b"))).status, "unauthorized");
});

test("submitter: queues behind existing queued actions of the batch (FIFO)", async () => {
  let offline = true;
  const s = submitterSetup({ post: async () => { if (offline) throw netErr(); return OK; } });
  await s.submitter.submit(s.spec("k1", "acknowledge"));
  offline = false;
  const out = await s.submitter.submit(s.spec("k2", "start"));
  assert.equal(out.status, "queued");
  await s.engine.sync({ force: true });
  assert.deepEqual(s.posts.slice(1).map((p) => p.body.idempotency_key), ["k1", "k2"]);
});

test("submitter: a double tap with the same key makes one request", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const s = submitterSetup({ post: async () => { await gate; return OK; } });
  const a = s.submitter.submit(s.spec("k1"));
  const b = s.submitter.submit(s.spec("k1"));
  release();
  await Promise.all([a, b]);
  assert.equal(s.posts.length, 1);
});

test("submitter: upload happens before the post and a network failure keeps uploaded ids", async () => {
  let offline = true;
  const s = submitterSetup({ post: async () => { if (offline) throw netErr(); return OK; } });
  const out = await s.submitter.submit({
    batch_id: "b1",
    so_id: "so1",
    kind: "check_out",
    path: "/co",
    body: body("k1", { answers: { photo: null } }) as any,
    blobs: [{ field_key: "photo", upload_key: "u1", blob: new Blob(["x"]), filename: "a.jpg" }],
  });
  assert.equal(out.status, "queued");
  assert.equal(s.uploads.length, 1);
  offline = false;
  await s.engine.sync({ force: true });
  assert.equal(s.uploads.length, 1);
  assert.equal((s.posts[1].body.answers as any).photo, 101);
});

// ---- errors + cache ----

test("errorInfo tolerates object and string detail and flags network errors", () => {
  assert.deepEqual(errorInfo(httpErr(409, { message: "m", code: "out_of_order" })).code, "out_of_order");
  const p = errorInfo(httpErr(422, { message: "bad", code: "validation", errors: [{ key: "k", message: "req" }] }));
  assert.deepEqual(p.errors, [{ key: "k", message: "req" }]);
  const s = errorInfo(httpErr(403, "Forbidden"));
  assert.equal(s.message, "Forbidden");
  assert.equal(s.code, null);
  assert.equal(errorInfo(netErr()).network, true);
  assert.equal(classifyFailure(httpErr(503, "x")).kind, "retry");
  assert.equal(classifyFailure(httpErr(503, { message: "off", code: "storage_disabled" })).kind, "needs_attention");
  assert.equal(classifyFailure(httpErr(404, "x")).kind, "needs_attention");
});

test("cachedFetch saves good responses and falls back to them offline", async () => {
  const storage = createMemoryStorage();
  const ok = await cachedFetch(storage, "k", async () => ({ a: 1 }), () => 42);
  assert.deepEqual(ok, { data: { a: 1 }, offline: false, saved_at: 42 });
  const off = await cachedFetch(storage, "k", async () => { throw netErr(); });
  assert.deepEqual(off, { data: { a: 1 }, offline: true, saved_at: 42 });
  await assert.rejects(() => cachedFetch(storage, "k", async () => { throw httpErr(404, "nope"); }));
  await assert.rejects(() => cachedFetch(storage, "missing", async () => { throw netErr(); }));
});

test("order_removed / trip_removed are final: the queued action is dropped and reported, others continue", async () => {
  const dropped: Array<[string, string | null]> = [];
  const storage = createMemoryStorage();
  const posts: string[] = [];
  const engine = createQueueEngine({
    storage,
    api: {
      async post(_path, b) {
        posts.push(String(b.idempotency_key));
        if (b.idempotency_key === "k1") throw httpErr(409, { message: "This order was removed by dispatch", code: "order_removed" });
        if (b.idempotency_key === "k2") throw httpErr(409, { message: "Trip removed by dispatch", code: "trip_removed" });
        return OK;
      },
      async upload() {
        return { photo_id: 1 };
      },
    },
    onDropped: (e, info) => dropped.push([e.kind, info.code]),
  });
  await engine.enqueue(entryOf("b1", "check_in", "k1"));
  await engine.enqueue(entryOf("b2", "acknowledge_all", "k2"));
  await engine.enqueue(entryOf("b3", "start", "k3"));
  const summary = await engine.sync();
  assert.equal(summary.dropped, 2);
  assert.equal(summary.needs_attention, 0);
  assert.equal(summary.done, 1);
  assert.equal(engine.getSnapshot().length, 0);
  assert.equal(storage.entries.size, 0);
  assert.deepEqual(dropped, [["check_in", "order_removed"], ["acknowledge_all", "trip_removed"]]);
  // never resent
  await engine.sync({ force: true });
  assert.deepEqual(posts, ["k1", "k2", "k3"]);
});

test("applyUploads fills a checklist photo into every SO of an acknowledge-all body", () => {
  const blob = new Blob(["x"]);
  const out = applyUploads(
    { answers: { s1: [{ item_id: 7, photo_id: null }, { item_id: 8, photo_id: null }], s2: [{ item_id: 7, photo_id: null }] } },
    [{ field_key: "item:7", upload_key: "u1", blob, filename: "a.jpg" }],
    { u1: 55 },
  );
  const answers = out.answers as Record<string, Array<Record<string, unknown>>>;
  assert.equal(answers.s1[0].photo_id, 55);
  assert.equal(answers.s1[1].photo_id, null);
  assert.equal(answers.s2[0].photo_id, 55);
});
