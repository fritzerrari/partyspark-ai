---
title: PartyPilot Audio Stems
emoji: 🎚️
colorFrom: indigo
colorTo: pink
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
---

# PartyPilot AI — Audio Stems

Demucs **htdemucs** Source-Separation als HuggingFace Space.
Wird vom PartyPilot AI Cockpit on-demand aufgerufen, separiert
einen Track in **Drums / Bass / Vocals / Other** und lädt die
vier WAV-Dateien direkt per signierten Upload-URLs in den
`stems`-Bucket der Lovable Cloud zurück.

## Deploy

1. Auf https://huggingface.co einen Space anlegen (SDK `gradio`, Hardware `CPU basic` — kostenlos).
2. Diesen Ordner ins Space-Repo pushen (`app.py`, `requirements.txt`, `README.md`).
3. Im PartyPilot-Projekt zwei Runtime-Secrets setzen:
   - `HF_SPACE_URL` z. B. `https://fritzerrari-audio-stems.hf.space`
   - `HF_TOKEN` HuggingFace Read-Token (Settings → Access Tokens)

Cold-Start auf Free-CPU: ~30 s. Verarbeitung eines 3-Minuten-Tracks: ~60–120 s.

## API

Aufruf erfolgt über Gradios Queue-API:

```
POST /gradio_api/call/separate
Authorization: Bearer <HF_TOKEN>
Content-Type: application/json
{ "data": ["<signed-download-url>", "<{\"drums\":\"…\",\"bass\":\"…\",\"vocals\":\"…\",\"other\":\"…\"}>"] }
```

Antwort `{ "event_id": "…" }`. Status / Endergebnis per SSE:

```
GET /gradio_api/call/separate/<event_id>
```

Das letzte `data:`-Event enthält `["ok"]` oder `["error: …"]`.