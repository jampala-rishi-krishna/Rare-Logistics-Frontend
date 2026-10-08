# Fleet Health: reporting a vehicle issue (`POST /api/fleet-health/issues`)

One endpoint for every issue source. Today it is used by staff in the dashboard; the **driver mobile app** (later) will call
exactly the same endpoint with a driver role and `source: "driver_app"`. Everything ends up in `vehicle_flags` through one
backend function, `services/vehicle_flags.py -> report_issue()`, so validation and de-duplication are identical for every source.

## Request

`POST /api/fleet-health/issues` with `Authorization: Bearer <access token>` and a JSON body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `vehicle` | integer or string | yes | `vehicles.id`, or the plate (`"NFX5791"`, `"nfx 5791"`, `"NFX-5791"` all match) |
| `source` | string | yes | `driver_app` (the app), `manual`, `checklist`, `battery`, `fuel`, `overload`, `voice`, `email`, `whatsapp` |
| `severity` | string | yes | `info`, `warning`, `critical` |
| `message` | string | yes | what the driver reported, 1 to 500 characters, plain text |
| `ref` | string | no | an external reference: call id, thread id, SO number (max 300) |
| `photo_ref` | string | no | a **link or reference** to a photo (max 500). Never file content: `data:` values are refused. The app uploads the photo elsewhere and sends only the link |
| `reported_by` | string | no | who reported it, e.g. `"driver_app:13"` (max 300). Defaults to the signed-in user's name |
| `occurred_at` | ISO 8601 date-time | no | when it happened; a time without an offset is read as Asia/Manila; cannot be in the future |

```json
{
  "vehicle": "NFX5791",
  "source": "driver_app",
  "severity": "warning",
  "message": "Brake pedal feels soft since this morning",
  "photo_ref": "https://files.example.com/reports/2026-10-08/brake.jpg",
  "reported_by": "driver_app:13",
  "occurred_at": "2026-10-08T07:45:00+08:00"
}
```

## Response

* **`201 Created`**: a new open issue was stored.
* **`200 OK`**: an identical issue is already open (same vehicle, source, Manila day and message), so nothing new was stored. The body points at the existing issue. Treat it as success.

```json
{
  "created": true,
  "flag": {
    "id": 41, "vehicle_id": 4, "source": "driver_app", "severity": "warning",
    "message": "Brake pedal feels soft since this morning",
    "ref": null, "photo_ref": "https://files.example.com/reports/2026-10-08/brake.jpg",
    "reported_by": "driver_app:13", "occurred_at": "2026-10-08T07:45:00+08:00",
    "created_at": "2026-10-08T00:02:11.512+00:00", "resolved_at": null, "resolved_by": null, "resolution_note": null
  }
}
```

## Errors

| Status | When |
|---|---|
| `401` | missing or invalid token |
| `403` | the role may not report issues (today: admin, dispatcher, warehouse; the driver role will be added with the app) |
| `404` | the vehicle was not found |
| `422` | invalid `source` / `severity`, empty or over-long `message`, `photo_ref` that is file content, `occurred_at` in the future, or a **third-party truck** (not maintained by RGF) |

Error bodies are `{"detail": "<human readable reason>"}`.

## De-duplication

The same vehicle + source + Manila calendar day + message (compared case- and spacing-insensitively) while the earlier flag is
still **open** returns that flag (`200`, `created: false`). Once a flag is resolved, the same text can be reported again and
creates a new flag. This is enforced by a partial unique index on `vehicle_flags.dedup_key WHERE resolved_at IS NULL`.

## What happens next

An open flag adds to the truck's risk score (critical 15, warning 5, info 0; capped at 25) and shows on the Fleet Health tab
with its source label (Manual, Checklist, Battery, Fuel, Overload, Voice, Email, WhatsApp, Driver app). A dispatcher resolves
it with `POST /api/fleet-health/flags/{id}/resolve` and an optional note. Resolving never changes the original conversation.

## Sources wired today, and what is "later"

| Source | Status |
|---|---|
| `manual`, `checklist` (failed pre-trip check), `battery`, `fuel`, `overload` (over-capacity assignment) | live |
| `email` (driver ISSUE / ESCALATION emails handled by the logistics email agent) | live |
| `voice` (the Vapi `reportIssue` tool) | **later**: that tool calls an n8n server URL, not this backend. Point it at this endpoint, or let the app replace it |
| `whatsapp` | **later**: WhatsApp replies are handled in n8n only. Same remedy |
| `driver_app` | accepted now, unused until the app exists |

## Example

```bash
curl -X POST https://<api>/api/fleet-health/issues \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"vehicle":"NFX5791","source":"driver_app","severity":"warning","message":"Brake pedal feels soft"}'
```
