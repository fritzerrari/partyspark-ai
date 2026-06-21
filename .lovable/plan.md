
# Plan: AI Party Host + AI Party Moments + Passwort-Wechsel

Drei Features in einem Wurf. Audio-DSP-Features (Autotune/Remix/Mashup/Choir/Vocal Producer) bleiben "Coming Soon" — die brauchen spezialisierte Audio-AI, die Lovable AI nicht bietet.

---

## 1. AI Party Host (kostenlos via Lovable AI)

**Was es macht:** Zwischen Songs spricht eine KI-Stimme Hype-Ansagen, Übergänge, Geburtstags-Shoutouts. Komplett serverseitig — Gemini schreibt den Text, gpt-4o-mini-tts spricht ihn.

- **Server-Function** `src/lib/ai/partyHost.functions.ts`:
  - `generateHypeLine({ context, vibe, lastTrack, nextTrack })` → Gemini schreibt 1–2 Sätze auf Deutsch/Englisch
  - `speakHypeLine({ text, voice })` → TTS-Stream zurück an Browser
- **Route** `/_authenticated/party-host` (neu, eigenständig statt nur "Notify me"):
  - Vibe-Auswahl (Hype / Smooth / Funny / Romantic / Crowd-Surf)
  - Sprache (DE/EN), Stimme (alloy/verse/coral/...)
  - "Generieren"-Button → zeigt Text + spielt Stimme über Master-Output ab
  - History der letzten 10 Lines mit Re-Play
  - Auto-Mode Toggle: alle N Minuten / bei Track-Wechsel automatisch eine Ansage
- **Engine-Hook:** Wenn aktiv, vor Track-Wechsel kurz ducken (-12 dB für 4s), Ansage spielen, dann ramp up

## 2. AI Party Moments (kostenlos via Lovable AI)

**Was es macht:** Aus den Aufnahmen (`recordings` Bucket) automatisch die besten 15-Sekunden-Highlights extrahieren — Lacher, Sing-alongs, Drops, lautstarke Crowd-Momente. Als teilbare Clips.

- **Detection:** Loudness-Spikes via WebAudio AnalyserNode beim Recording → Timestamps speichern
- **Server-Function** `analyzeMoment({ recordingId, startSec, endSec })`:
  - Audio-Slice → `openai/gpt-4o-mini-transcribe` für Transkription
  - Gemini bekommt Transkript + Loudness-Curve → klassifiziert (sing-along/laugh/drop/cheer/quiet-talk) + schreibt Caption
- **Neue Tabelle** `recording_moments` (id, recording_id, start_sec, end_sec, kind, caption, score, created_at)
- **Route** `/_authenticated/moments`:
  - Liste aller Recordings mit ihren Moments
  - Inline-Player pro Moment (15s Slice), Caption, "Share"-Button → kopiert teilbaren Link, "Download"-Button → MP3-Slice
  - "Analysieren"-Button pro Recording (triggert Detection + AI)

## 3. Passwort-Wechsel (beides: Settings + Reset-Link)

### a) Direkt in Settings
- In `settings.tsx` neue Card **Account → Passwort ändern**:
  - Felder: neues Passwort + Bestätigung
  - Button "Passwort aktualisieren" → `supabase.auth.updateUser({ password })`
  - Validierung: min 8 Zeichen, Bestätigung matched
  - Toast Success/Error

### b) Reset-per-Mail
- Auth-Seite (`/auth`) bekommt "Passwort vergessen?" Link → öffnet kleines Sheet
  - Email-Input → `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + "/reset-password" })`
- **Neue öffentliche Route** `/reset-password`:
  - Erkennt `type=recovery` im URL-Hash
  - Formular: neues Passwort + Bestätigung → `supabase.auth.updateUser({ password })`
  - Nach Erfolg → Redirect zu `/dashboard`

---

## AI Lab Aufräumen

- `ai-lab.tsx`: "AI Party Host" und "AI Party Moments" verlieren den "Coming Soon"-Badge, bekommen "Öffnen"-Button statt "Notify me"
- Die restlichen 7 Features bleiben "Coming Soon" mit klarem Hinweis in der Card-Description, dass sie spezielle Audio-AI brauchen

---

## Technische Details

**Neue Dateien:**
- `src/lib/ai/partyHost.functions.ts` (Gemini + TTS Stream Route via `/api/ai/party-host`)
- `src/lib/ai/gateway.server.ts` (Lovable AI Gateway Helper)
- `src/lib/ai/moments.functions.ts` (Transkription + Klassifikation)
- `src/routes/api/ai/party-host-speak.ts` (TTS-Streaming HTTP-Route)
- `src/routes/_authenticated/party-host.tsx`
- `src/routes/_authenticated/moments.tsx`
- `src/routes/reset-password.tsx`
- `src/components/auth/ChangePasswordCard.tsx`
- `src/components/auth/ForgotPasswordSheet.tsx`

**DB-Migration:** Tabelle `recording_moments` mit RLS (user-scoped via `recordings.user_id`)

**Nav:** "Party Host" + "Moments" in Sidebar/More-Menu

**Lovable AI Models:**
- Text: `google/gemini-3-flash-preview` (default)
- TTS: `openai/gpt-4o-mini-tts` mit SSE-Streaming + PCM für Echtzeit-Playback
- STT: `openai/gpt-4o-mini-transcribe`

**Reihenfolge:** Passwort-Wechsel zuerst (klein, schnell), dann AI Party Host, dann AI Party Moments.
