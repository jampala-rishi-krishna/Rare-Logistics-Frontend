import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scanDir, hexInDir } from "./tripI18nScan.ts";
import { DICTS, photoCaption } from "../pages/driver/i18n.ts";
import { downscaleImage } from "./tripMedia.ts";
import { createMemoryStorage, createQueueEngine } from "./offlineQueue.ts";
import { createSubmitter } from "./tripActions.ts";
import { createPhotoUploader } from "./tripPhotoUploads.ts";
const dir = fileURLToPath(new URL("../pages/driver", import.meta.url));
test("driver views have no hardcoded visible JSX strings or hex colours", () => {
 assert.deepEqual(scanDir(dir), []); assert.deepEqual(hexInDir(dir), []);
});
test("driver languages have identical keys recursively", () => {
 const keys = (o: object): string[] => Object.entries(o).flatMap(([k,v]) => [k, ...(v && typeof v === "object" && !Array.isArray(v) ? keys(v).map(x => `${k}.${x}`) : [])]).sort();
 assert.deepEqual(keys(DICTS.en), keys(DICTS.tl));
 assert.notEqual(DICTS.en.loginWrong, DICTS.tl.loginWrong);
});
test("photo caption uses capture time in Manila even after offline midnight", () => {
 assert.match(photoCaption({ so_number: "SO-123", captured_at: "2026-10-14T17:42:00Z", kind: "delivered" }, "en"), /SO-123.*15 Oct.*01:42.*Delivered/);
 assert.match(photoCaption({ so_number: "TO-1", captured_at: "2026-10-14T17:42:00Z", kind: "failed" }, "tl"), /Hindi naihatid|hindi naihatid/);
});
test("early photo retry keeps upload key and sent photos are reused", async () => {
 const calls: string[] = []; let offline = true;
 const uploader = createPhotoUploader(async r => { calls.push(r.upload_key); if(offline) throw new TypeError("offline"); return { photo_id: 42 }; });
 const request = { blob: new Blob(["photo"]), filename: "photo.jpg", batch_id: "batch", field_key: "delivery_photo", upload_key: "same-key", captured_at: "2026-10-14T17:42:00Z" };
 await uploader.start(request); assert.equal(uploader.get("same-key")?.state, "saved");
 offline = false; await uploader.retrySaved(); await uploader.start(request);
 assert.deepEqual(calls, ["same-key", "same-key"]); assert.deepEqual(uploader.uploadedFor(["same-key"]), { "same-key": 42 });
});
test("driver routes retain all original destinations", () => {
 const routes = readFileSync(`${dir}/DriverRoutes.tsx`, "utf8");
 for(const path of ["today", "acknowledge", "history", "profile"]) assert.ok(routes.includes(path));
});

test("offline issue photo and report sync exactly once with capture timestamp and original idempotency key", async () => {
 let online = false; const posts: unknown[] = []; const uploads: unknown[] = [];
 const api = { async post(_path: string, body: Record<string, unknown>) { if(!online) throw new TypeError("offline"); posts.push(body); return { ok: true, already_done: false, replayed: false, done_by: null, batch: null }; }, async upload(req: unknown) { if(!online) throw new TypeError("offline"); uploads.push(req); return { photo_id: 123 }; } };
 const storage = createMemoryStorage(); const engine = createQueueEngine({ storage, api });
 const submitter = createSubmitter({ engine, api });
 const out = await submitter.submit({ kind: "issue", batch_id: "b", so_id: "s", path: "/api/driver/issues", body: { idempotency_key: "original", category: "Customer unavailable", photo_ids: [] }, blobs: [{ blob: new Blob(["proof"]), filename: "proof.jpg", field_key: "photo_ids", server_field_key: "issue_photo", upload_key: "photo-key", captured_at: "2026-10-14T17:42:00Z" }] });
 assert.equal(out.status, "queued"); online = true; await engine.sync({ force: true }); await engine.sync({ force: true });
 assert.equal(posts.length, 1); assert.equal(uploads.length, 1);
 assert.deepEqual(posts[0], { idempotency_key: "original", category: "Customer unavailable", photo_ids: [123] });
 assert.equal((uploads[0] as { captured_at: string }).captured_at, "2026-10-14T17:42:00Z");
});

test("camera compression produces JPEG at 1600px longest side and quality 0.7", async () => {
 const oldDocument = globalThis.document; const oldBitmap = globalThis.createImageBitmap;
 let width=0, height=0, quality=0, mime="", closed=false;
 const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (_image: unknown,_x: number,_y: number,w: number,h: number) => {width=w; height=h;} }), toBlob: (cb: (b: Blob) => void,type: string,q: number) => {mime=type; quality=q;cb(new Blob(["jpeg"], {type}));} };
 try {
  Object.assign(globalThis, { document: {createElement: () => canvas}, createImageBitmap: async () => ({width: 4000,height:3000, close: () => {closed=true;}}) });
  const result=await downscaleImage(new File(["camera"], "camera.png", {type:"image/png"}));
  assert.equal(width,1600);assert.equal(height,1200);assert.equal(quality,0.7);assert.equal(mime,"image/jpeg");assert.equal(result.filename,"camera.jpg");assert.ok(closed);
 } finally { Object.assign(globalThis, {document: oldDocument, createImageBitmap:oldBitmap}); }
});
