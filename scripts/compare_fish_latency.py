"""Fish Audio TTFB comparison across latency/model variants (direct to api.fish.audio).

    backend\\venv\\Scripts\\python.exe scripts\\compare_fish_latency.py

Reads FISH_AUDIO_API_KEY / FISH_AUDIO_VOICE_ID from backend/.env (never printed).
TTFB = time until the first audio byte of the response body arrives.
"""
from __future__ import annotations

import statistics
import time
import wave
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_RATE = 24000
RUNS = 5
SHORT = "Okay po, salamat. Ingat sa biyahe."
LONG = "Hi po, si Martin ito from Rare Global Food Logistics. May bagong truck assignment ka, plate N-A-J 6-0-1-8, para sa SO-00123. Okay lang po ba?"
VARIANTS = {
    "A_normal_free": ("s2.1-pro-free", "normal"),
    "B_balanced_free": ("s2.1-pro-free", "balanced"),
    "C_balanced_paid": ("s2.1-pro", "balanced"),
    "D_low_free": ("s2.1-pro-free", "low"),
}


def synth(client: httpx.Client, key: str, voice: str, model: str, latency: str, text: str) -> tuple[int, float, bytes]:
    started = time.perf_counter()
    with client.stream(
        "POST",
        "https://api.fish.audio/v1/tts",
        headers={"Authorization": f"Bearer {key}", "model": model, "Content-Type": "application/json"},
        json={"text": text, "reference_id": voice, "format": "pcm", "sample_rate": SAMPLE_RATE, "latency": latency, "normalize": True},
        timeout=60,
    ) as res:
        ttfb = None
        chunks = []
        for chunk in res.iter_bytes():
            if ttfb is None and chunk:
                ttfb = time.perf_counter() - started
            chunks.append(chunk)
        return res.status_code, (ttfb or time.perf_counter() - started) * 1000, b"".join(chunks)


def pct(values: list[float], p: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, round(p * (len(s) - 1)))]


def main() -> None:
    env = dotenv_values(ROOT / "backend" / ".env")
    key, voice = (env.get("FISH_AUDIO_API_KEY") or "").strip(), (env.get("FISH_AUDIO_VOICE_ID") or "").strip()
    out = ROOT / "output"
    out.mkdir(exist_ok=True)
    print(f"{'variant':18} {'text':6} {'p50 ms':>7} {'p95 ms':>7}  runs")
    with httpx.Client() as client:
        for name, (model, latency) in VARIANTS.items():
            for label, text in (("short", SHORT), ("long", LONG)):
                ttfbs, last_audio, error = [], b"", None
                for _ in range(RUNS):
                    status, ttfb, audio = synth(client, key, voice, model, latency, text)
                    if status != 200:
                        error = f"HTTP {status}: {audio[:200].decode(errors='replace')}"
                        break
                    ttfbs.append(ttfb)
                    last_audio = audio
                if error:
                    print(f"{name:18} {label:6} {error}")
                    break
                print(f"{name:18} {label:6} {statistics.median(ttfbs):7.0f} {pct(ttfbs, 0.95):7.0f}  {len(ttfbs)}")
                if label == "long":
                    with wave.open(str(out / f"tts_{name}.wav"), "wb") as wav:
                        wav.setnchannels(1)
                        wav.setsampwidth(2)
                        wav.setframerate(SAMPLE_RATE)
                        wav.writeframes(last_audio[: len(last_audio) - len(last_audio) % 2])


if __name__ == "__main__":
    main()
