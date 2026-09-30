// logistics-fish-tts-relay: Vapi custom-voice provider -> Fish Audio, streamed straight through.
// Replaces the n8n "[LOGISTICS] Fish Audio Custom TTS Bridge". n8n is not in the TTS path.
//
// Do NOT set a Transfer-Encoding header anywhere in this file: doing so corrupted streamed
// audio in a prior implementation. The Workers runtime handles response framing itself.

const FISH_TTS_URL = "https://api.fish.audio/v1/tts";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handleTts(request, env) {
  const tIn = Date.now();
  if (!env.VAPI_SHARED_SECRET || !timingSafeEqual(request.headers.get("x-vapi-secret"), env.VAPI_SHARED_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const msg = body.message || {};
  const text = typeof msg.text === "string" ? msg.text : "";
  const sampleRate = Number(msg.sampleRate) || 24000;
  if (!text.trim()) return new Response("Missing message.text", { status: 400 });

  const tFishStart = Date.now();
  const fishRes = await fetch(FISH_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`,
      "Content-Type": "application/json",
      model: env.FISH_AUDIO_MODEL,
    },
    body: JSON.stringify({
      text,
      reference_id: env.FISH_AUDIO_REFERENCE_ID,
      format: "pcm", // 16-bit signed little-endian mono, which is what Vapi expects
      sample_rate: sampleRate,
      // "balanced" streams as it synthesizes (~0.8s to first byte); "normal" generated the
      // whole sentence first (~7s for the 130-char first message).
      latency: env.FISH_AUDIO_LATENCY || "balanced",
      normalize: true,
    }),
  });

  if (!fishRes.ok || !fishRes.body) {
    const errBody = await fishRes.text().catch(() => "");
    console.log(JSON.stringify({ event: "fish_error", status: fishRes.status, body: errBody.slice(0, 1000) }));
    return new Response("Upstream TTS error", { status: 502 });
  }

  const tFishHeaders = Date.now();
  const callId = msg.call?.id ?? null;
  // Pass-through that only timestamps the first chunk; it never holds data back. Workers
  // clocks advance on I/O, which is exactly the resolution these timings need.
  let firstChunk = true;
  let bytes = 0;
  const timing = new TransformStream({
    transform(chunk, controller) {
      if (firstChunk) {
        firstChunk = false;
        const tFirst = Date.now();
        console.log(JSON.stringify({
          event: "tts_first_byte", call_id: callId, chars: text.length, sample_rate: sampleRate,
          ms_to_fish_start: tFishStart - tIn, ms_fish_headers: tFishHeaders - tIn, ms_first_byte_out: tFirst - tIn,
        }));
      }
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      console.log(JSON.stringify({ event: "tts_done", call_id: callId, chars: text.length, bytes, ms_total: Date.now() - tIn }));
    },
  });
  return new Response(fishRes.body.pipeThrough(timing), { headers: { "Content-Type": "application/octet-stream" } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/health") {
      return Response.json({
        ok: true,
        fish_key_configured: Boolean(env.FISH_AUDIO_API_KEY),
        secret_configured: Boolean(env.VAPI_SHARED_SECRET),
        reference_id: env.FISH_AUDIO_REFERENCE_ID,
      });
    }
    if (request.method === "POST") return handleTts(request, env);
    return new Response("Not found", { status: 404 });
  },
};
