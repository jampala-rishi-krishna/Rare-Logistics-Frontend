"""Point the logistics Vapi assistant at the direct stack (Worker TTS + FastAPI webhook).

Dry run (default) - prints the planned tools and assistant diff, changes nothing:
    backend\\venv\\Scripts\\python.exe scripts\\configure_vapi_assistant.py --backend-url https://<tunnel-or-render>
Apply:
    backend\\venv\\Scripts\\python.exe scripts\\configure_vapi_assistant.py --backend-url https://... --apply

Idempotent: tools are matched by name and reused/updated, never duplicated. Re-run with the
Render URL later to re-point server.url and the confirmAssignment tool - nothing else changes.
Secrets come from backend/.env (VAPI_API_KEY, VAPI_SERVER_SECRET) and are never printed.
"""
from __future__ import annotations

import argparse
import copy
import difflib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ASSISTANT_ID = "d495f7f1-eb0f-4906-81d3-caa09ede76ce"
DEFAULT_WORKER_URL = "https://rarechain-tts.rishi-315.workers.dev"
REPORT_ISSUE_URL = "https://rareglobalfood.app.n8n.cloud/webhook/logistics-voice-report-issue"  # stays on n8n
ESCALATION_NUMBER = "+639178657746"  # Pau
SERVER_MESSAGES = ["status-update", "end-of-call-report", "tool-calls"]
REDACT = "***"


def redact(obj):
    if isinstance(obj, dict):
        return {k: (REDACT if k.lower() in {"secret", "authorization", "x-vapi-secret"} else redact(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    return obj


def server(url: str, secret: str | None) -> dict:
    # Vapi sends `secret` as X-Vapi-Secret; the Bearer header covers the other auth style.
    # The Worker and /vapi/webhook both accept either.
    if not secret:
        return {"url": url, "timeoutSeconds": 20}
    return {"url": url, "secret": secret, "headers": {"Authorization": f"Bearer {secret}"}, "timeoutSeconds": 20}


def desired_tools(backend_url: str, secret: str) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "confirmAssignment",
                "description": "Call this when the driver clearly confirms they can take the truck assignment.",
                "parameters": {"type": "object", "properties": {}},
            },
            "server": server(f"{backend_url}/vapi/webhook", secret),
        },
        {
            "type": "function",
            "function": {
                "name": "reportIssue",
                "description": "Call this when the driver reports a problem that blocks the assignment (can't do it, vehicle issue, schedule conflict).",
                "parameters": {
                    "type": "object",
                    "properties": {"issueDescription": {"type": "string", "description": "Brief description of what the driver said."}},
                    "required": ["issueDescription"],
                },
            },
            "server": server(REPORT_ISSUE_URL, None),
        },
        {
            "type": "transferCall",
            "function": {"name": "transferCall"},
            "destinations": [
                {"type": "number", "number": ESCALATION_NUMBER, "description": "Pau - RGF logistics escalation", "message": "Sige po, ikokonekta ko kayo kay Pau ngayon."}
            ],
        },
    ]


def tool_name(tool: dict) -> str | None:
    return (tool.get("function") or {}).get("name") or (tool.get("type") if tool.get("type") == "transferCall" else None)


def comparable(tool: dict) -> dict:
    keep = {k: tool.get(k) for k in ("type", "function", "server", "destinations") if tool.get(k) is not None}
    return json.loads(json.dumps(keep, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend-url", required=True, help="Public base URL of the FastAPI backend (cloudflared tunnel now, Render later)")
    parser.add_argument("--worker-url", default=DEFAULT_WORKER_URL)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    backend_url, worker_url = args.backend_url.rstrip("/"), args.worker_url.rstrip("/")

    env = dotenv_values(ROOT / "backend" / ".env")
    api_key, secret = (env.get("VAPI_API_KEY") or "").strip(), (env.get("VAPI_SERVER_SECRET") or "").strip()
    voice_id = (env.get("FISH_AUDIO_VOICE_ID") or "").strip()
    if not api_key or not secret:
        sys.exit("VAPI_API_KEY and VAPI_SERVER_SECRET must be set in backend/.env")
    client = httpx.Client(base_url="https://api.vapi.ai", headers={"Authorization": f"Bearer {api_key}"}, timeout=30)

    before = client.get(f"/assistant/{ASSISTANT_ID}").raise_for_status().json()
    backup = ROOT / "scripts" / "vapi_assistant_backup.json"
    if not backup.exists():
        backup.write_text(json.dumps(before, indent=2), encoding="utf-8")
    if args.apply:
        stamped = ROOT / "scripts" / f"vapi_assistant_backup_{datetime.now():%Y%m%d_%H%M%S}.json"
        stamped.write_text(json.dumps(before, indent=2), encoding="utf-8")
        print(f"Backed up current assistant to {stamped.name}")

    prompt = "\n".join(m.get("content") or "" for m in (before.get("model") or {}).get("messages") or [])
    variables = sorted(set(re.findall(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}", prompt + (before.get("firstMessage") or ""))))
    print("Prompt variables referenced:", ", ".join(variables) or "(none)")

    # --- tools: create first, then attach by id --------------------------------------------
    existing = {tool_name(t): t for t in client.get("/tool", params={"limit": 1000}).raise_for_status().json() if tool_name(t)}
    # Never touch a tool another assistant (e.g. the sales agent) has attached.
    foreign = {tid for a in client.get("/assistant", params={"limit": 1000}).raise_for_status().json() if a["id"] != ASSISTANT_ID for tid in (a.get("model") or {}).get("toolIds") or []}
    wanted = {tool_name(t) for t in desired_tools(backend_url, secret)}
    for name, tool in list(existing.items()):
        if name in wanted and tool["id"] in foreign:
            print(f"tool {name}: {tool['id']} is used by another assistant - ignoring it, a logistics-only copy will be created")
            del existing[name]
    tool_ids = []
    for tool in desired_tools(backend_url, secret):
        name = tool_name(tool)
        current = existing.get(name)
        if current is None:
            print(f"tool {name}: CREATE")
            if args.apply:
                current = client.post("/tool", json=tool).raise_for_status().json()
        elif comparable(current) != comparable({**current, **tool}):
            print(f"tool {name}: UPDATE {current['id']}")
            if args.apply:
                patch = {k: v for k, v in tool.items() if k != "type"}
                current = client.patch(f"/tool/{current['id']}", json=patch).raise_for_status().json()
        else:
            print(f"tool {name}: unchanged {current['id']}")
        if current is not None:
            tool_ids.append(current["id"])

    # --- assistant patch ---------------------------------------------------------------------
    model = copy.deepcopy(before.get("model") or {})
    model.pop("tools", None)  # inline tools fail silently; attach by id only
    if tool_ids or not args.apply:
        model["toolIds"] = tool_ids or ["<created on --apply>"]
    voice = copy.deepcopy(before.get("voice") or {})
    voice.update({"provider": "custom-voice", "server": server(worker_url, secret)})
    if voice_id:
        voice["voiceId"] = voice_id
    patch = {
        "voice": voice,
        "server": server(f"{backend_url}/vapi/webhook", secret),
        "serverMessages": SERVER_MESSAGES,
        "model": model,
        "artifactPlan": {**(before.get("artifactPlan") or {}), "recordingEnabled": True},
        "analysisPlan": {**(before.get("analysisPlan") or {}), "summaryPlan": {**((before.get("analysisPlan") or {}).get("summaryPlan") or {}), "enabled": True}},
    }
    # transcriber, firstMessage and prompt text are intentionally not sent - they stay as-is.
    after = client.patch(f"/assistant/{ASSISTANT_ID}", json=patch).raise_for_status().json() if args.apply else {**before, **patch}

    def dump(obj):
        return json.dumps(redact({k: obj.get(k) for k in ("voice", "server", "serverMessages", "model", "artifactPlan", "analysisPlan", "transcriber", "firstMessage")}), indent=2, sort_keys=True).splitlines()

    print("\n".join(difflib.unified_diff(dump(before), dump(after), "before", "after (applied)" if args.apply else "after (dry run)", lineterm="")) or "No changes.")
    if after.get("transcriber") != before.get("transcriber"):
        sys.exit("ERROR: transcriber changed - restore from the backup file.")


if __name__ == "__main__":
    main()
