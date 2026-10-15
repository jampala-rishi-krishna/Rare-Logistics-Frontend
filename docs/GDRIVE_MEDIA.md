# Driver proof photos in Google Drive

The backend uploads as **martin@rareglobalfood.com**, the owner of the My Drive folder **logistcs driver pic POD with date**. Anonymous reader sharing never authorizes uploads. A service account cannot own these My Drive uploads because it has no storage quota. The app serves authenticated image bytes itself and needs no public links.

## One-time owner setup (Windows)

1. In Google Cloud Console, select the project containing the existing Gmail OAuth client. Enable **Google Drive API**. Open Google Auth Platform > Audience and verify the Workspace app is **Internal** for rareglobalfood.com. This setting has not been inspected from this workspace: the owner must verify it. An external app left in Testing can issue refresh tokens that expire after seven days.
2. Reuse the Gmail client ID and secret, but obtain a **separate Drive refresh token for martin@**. Do not change the martin.logistics Gmail token or its scopes. If this client is Web application type, register exactly `http://127.0.0.1:8765/` as an authorized redirect URI. A Desktop application client supports loopback redirects.
3. From the repository's backend directory run:

   ```powershell
   .\venv\Scripts\python.exe scripts\gdrive_refresh_token.py --port 8765
   ```

   The helper reads the local environment / backend `.env` for `GDRIVE_CLIENT_ID` and `GDRIVE_CLIENT_SECRET`, falling back to `GMAIL_COMMS_CLIENT_ID` / `GMAIL_COMMS_CLIENT_SECRET`. Missing secrets are prompted without echo. It opens a browser consent flow with PKCE and state validation, requests only Drive scope, verifies the authorized account is martin@, and copies the refresh token **directly to the Windows clipboard**. It never prints or writes the token. A wrong or unverifiable account aborts without copying it. Do not run this through a terminal recorder or paste the clipboard into chat.
4. In Render's backend service Environment settings set:

   | Variable | Value |
   |---|---|
   | `MEDIA_STORAGE` | `gdrive` |
   | `GDRIVE_PHOTO_FOLDER_ID` | `1zQK37vrUFIM6bL9cjas-sihBjloA1ak5` (configuration only; never embedded in application code) |
   | `GDRIVE_REFRESH_TOKEN` | Paste the clipboard privately |
   | `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` | Optional overrides; otherwise existing Gmail client credentials are reused |

5. Clear the clipboard (`Set-Clipboard -Value ''`) and clear clipboard history if enabled. Save Render environment settings and deploy. Never commit the token, add it to screenshots, print it in logs, or include it in reports.
6. After deployment and owner authorization, use a test batch for **one** live photo upload. Verify its dated folder, filename, description and authenticated in-app view; then remove the test Drive file and its `trip_photos` row. This live operation has **not** been performed by the mocked test suite. Do not run crew actions on production customer orders.
7. Change the photo root folder sharing to **Restricted**. Its existing anyone-with-link reader access is unnecessary for the app and exposes customer premises, invoices and faces.

## Storage and upload contract

- `MEDIA_STORAGE=gdrive|r2|none` selects the provider. With no explicit setting, complete Drive configuration enables Drive; an existing complete R2 configuration retains its legacy provider; otherwise storage is off. An explicitly configured provider with incomplete credentials is disabled. `storage_available()` and `is_enabled()` drive the existing photo-not-configured UI.
- Uploads retain the existing authenticated crew scope, upload-key idempotency, 5 MiB limit and JPEG/PNG/WebP magic-byte checks. The server re-encodes Drive images to JPEG at most 1600px on the longest side, applies orientation and removes all EXIF, including GPS. GPS stays in existing workflow records.
- The phone supplies only the photo, batch, SO ID, field key, unique upload key and capture timestamp. SO/TO number, customer, truck and crew names come from existing batch records and the memory staff directory; no Zoho request is made.
- Validated client capture time determines the **Manila** day folder, filename date/time and description. Offline sync keeps the original capture time. Missing timestamps use server receipt time; shared workflow timestamp validation still applies.
- New photo rows use the existing `trip_photos.created_at` timestamp for validated capture time. Legacy rows retain upload time. This deliberate timestamp convention requires no migration. Overview captions read this existing column, never Drive. Legacy references without a matching photo row retain their action-time caption fallback.
- Files go into `YYYY-MM-DD` under `GDRIVE_PHOTO_FOLDER_ID`. Day folders are looked up by name/parent and cached under an instance lock. Names are `SO-or-TO_YYYY-MM-DD_HH-MM_kind.jpg`; same-minute names receive `_2`, `_3` suffixes. Unsafe Windows/Drive characters are sanitized.
- Description lines identify order, date, Manila time, customer, result, Invoice/DR or TO number when available, truck, driver/helpers and trip. Issue photos add issue reference/category. Drive appProperties preserve upload key, batch, SO ID/number, field key and capture time.
- Existing photo rows store `gdrive:<fileId>` in `storage_key`. No new table, column, schema migration, or per-file public permission is created. Legacy plain R2 keys and `r2:` keys still resolve through R2 when configured.
- A retry first checks the existing row. If the file reached Drive before its row committed, appProperties lookup reuses it. Same-process concurrent upload-key retries are serialized. Failed creates are looked up again before one retry, avoiding duplicates after ambiguous failures. Multiple backend instances do not share locks; deploy the current single-worker configuration.
- After check-out or issue commit, background work finalizes file name/description with result, invoice or issue reference. Drive failure never rolls back the workflow action. Failed updates are remembered in process memory and retried on the next authenticated image read. Pending jobs do not survive process restart; an external Drive reconciliation queue was deliberately not added.
- Expired/revoked OAuth tokens produce a clear token-free log message and HTTP 503. Rate-limit/temporary errors receive a bounded backoff/retry; HTTP 503 leaves the phone's upload queued under the same key.

## Viewing and caching

`GET /api/media/{photo_id}?size=full|thumb` enforces existing role/crew access. Drive bytes stream through the backend; there is no Google redirect or Drive UI. Responses use `image/jpeg`, `Cache-Control: private, max-age=86400`, and an ETag containing file ID/content MD5 (plus a thumbnail suffix). Matching `If-None-Match`, including weak/list validators, returns 304. Thumbnails are at most 320px.

Instance-local LRU caches cap full images at 48 MiB and thumbnails at 16 MiB (64 MiB combined); each worker has its own cache. Driver Overview requests thumbnails for cards/lists and full images for enlarged viewing. Captions expose `{photo_id, so_number, captured_at, kind, field_key}` from existing database metadata/action facts. The authenticated frontend fetches bytes with its bearer token and displays an object URL.

## Mocked verification

`tests/test_gdrive_media.py` uses `httpx.MockTransport`, SQLite and fake staff/assignment data. It covers re-encoding, EXIF removal, capture-date naming, duplicate suffixes, TOs, replay recovery, concurrent retries, expired tokens, temporary failures, post-commit finalization/retry, image streaming/ETag/304/thumbnail dimensions, role/crew protection, disabled storage and legacy R2. No live Google or Zoho calls are needed.
