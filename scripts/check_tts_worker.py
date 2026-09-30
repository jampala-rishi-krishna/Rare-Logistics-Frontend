"""Check (a) for the rarechain-tts Worker.

Usage (from the repo root):
    backend\\venv\\Scripts\\python.exe scripts\\check_tts_worker.py https://rarechain-tts.<sub>.workers.dev

Reads VAPI_SERVER_SECRET from backend/.env (never prints it), then:
  1. POSTs with a wrong secret      -> expects 401
  2. POSTs with the correct secret  -> expects PCM bytes; saves output/tts_check.raw + .wav
  3. Repeats the correct request N times and reports time-to-first-byte p50/p95.
"""
from __future__ import annotations

import statistics
import sys
import time
import wave
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_RATE = 24000
TEXT = "Hi po, si Martin ito from Rare Global Food Logistics. May bagong truck assignment ka, plate N-A-J 6-0-1-8, para sa SO-00123. Okay lang po ba?"
RUNS = 5


def post(url: str, headers: dict, text: str = TEXT) -> tuple[int, bytes, float]:
    body = {"message": {"type": "voice-request", "text": text, "sampleRate": SAMPLE_RATE}}
    started = time.perf_counter()
    with httpx.stream("POST", url, json=body, headers=headers, timeout=30) as res:
        ttfb = None
        chunks = []
        for chunk in res.iter_bytes():
            if ttfb is None:
                ttfb = time.perf_counter() - started
            chunks.append(chunk)
        return res.status_code, b"".join(chunks), (ttfb if ttfb is not None else time.perf_counter() - started) * 1000


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    url = sys.argv[1].rstrip("/")
    secret = (dotenv_values(ROOT / "backend" / ".env").get("VAPI_SERVER_SECRET") or "").strip()
    if not secret:
        sys.exit("VAPI_SERVER_SECRET is empty in backend/.env")

    health = httpx.get(f"{url}/health", timeout=15)
    print(f"GET /health -> {health.status_code} {health.text}")

    status, _, _ = post(url, {"X-Vapi-Secret": "wrong-secret"})
    print(f"wrong secret          -> HTTP {status} ({'PASS' if status == 401 else 'FAIL'})")

    status, audio, ttfb = post(url, {"X-Vapi-Secret": secret})
    print(f"correct X-Vapi-Secret -> HTTP {status}, {len(audio)} bytes, TTFB {ttfb:.0f} ms")
    if status != 200 or not audio:
        sys.exit(f"FAIL: {audio[:300]!r}")
    status_b, _, _ = post(url, {"Authorization": f"Bearer {secret}"}, "Test.")
    print(f"correct Bearer        -> HTTP {status_b} ({'PASS' if status_b == 200 else 'FAIL'})")

    out = ROOT / "output"
    out.mkdir(exist_ok=True)
    (out / "tts_check.raw").write_bytes(audio)
    with wave.open(str(out / "tts_check.wav"), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)  # 16-bit
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(audio[: len(audio) - len(audio) % 2])
    print(f"saved {out / 'tts_check.raw'} and {out / 'tts_check.wav'} ({len(audio) / 2 / SAMPLE_RATE:.1f}s audio)")

    ttfbs = [ttfb]
    for _ in range(RUNS - 1):
        s, _, t = post(url, {"X-Vapi-Secret": secret}, "Okay po, salamat. Ingat sa biyahe.")
        if s == 200:
            ttfbs.append(t)
    ttfbs.sort()
    p95 = ttfbs[min(len(ttfbs) - 1, round(0.95 * (len(ttfbs) - 1)))]
    print(f"TTFB over {len(ttfbs)} runs (client-side): p50 {statistics.median(ttfbs):.0f} ms, p95 {p95:.0f} ms")


if __name__ == "__main__":
    main()
