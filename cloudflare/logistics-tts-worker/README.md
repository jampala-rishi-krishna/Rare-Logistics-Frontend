# logistics-fish-tts-relay

Cloudflare Worker that serves as the Vapi custom TTS provider for the logistics voice assistant.

```
Vapi --POST {message.text, message.sampleRate} + x-vapi-secret--> Worker --> Fish Audio /v1/tts (pcm)
Vapi <------------------- raw PCM stream, passed straight through ------------------------------'
```

n8n is not in this path. It still handles call triggering and conversation logging.

## Deploy (run from your own machine)

```sh
cd cloudflare/logistics-tts-worker
npm install -g wrangler        # skip if already installed
wrangler login
wrangler secret put FISH_AUDIO_API_KEY    # paste the Fish Audio API key
wrangler secret put VAPI_SHARED_SECRET    # paste the same secret configured on the Vapi assistant's voice server
wrangler deploy
```

`wrangler deploy` prints the live URL, for example `https://logistics-fish-tts-relay.<subdomain>.workers.dev`.
Set that URL as the assistant's `voice.server.url` in Vapi.

## Verify

```sh
curl https://logistics-fish-tts-relay.<subdomain>.workers.dev/health
# expect fish_key_configured: true, secret_configured: true

curl -X POST https://logistics-fish-tts-relay.<subdomain>.workers.dev \
  -H "x-vapi-secret: <VAPI_SHARED_SECRET>" -H "Content-Type: application/json" \
  -d '{"message":{"type":"voice-request","text":"Test from the logistics relay.","sampleRate":24000}}' \
  --output test.pcm
# play it: ffplay -f s16le -ar 24000 -ch_layout mono test.pcm
```

To see live logs while making a test call, run `wrangler tail`.

## Tear down the old `rarechain-tts` Worker

An earlier draft of this relay (`workers/tts/`, Worker name `rarechain-tts`) was removed from the repo.
Once this Worker is confirmed working on a live Vapi call, check whether that old one was ever deployed,
and delete it if so, so that only one TTS Worker is live:

```sh
wrangler deployments list --name rarechain-tts   # errors if it was never deployed
wrangler delete rarechain-tts
```

## Config

- `FISH_AUDIO_REFERENCE_ID` and `FISH_AUDIO_MODEL` are plain vars in `wrangler.toml`. To change them, edit the file and run `wrangler deploy` again.
- Never add a `Transfer-Encoding` header to the response. Setting it by hand corrupted streamed audio in an earlier implementation.
