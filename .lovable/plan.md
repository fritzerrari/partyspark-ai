## PartyPilot AI — Phase 1 build

A consumer AI-DJ SaaS for normal people. Phase 1 ships the entire UI, real auth, real database, real MP3 upload + playback. AI/audio-DSP features (beatmatch, autotune, harmonies, real-time loops) ship as polished placeholder UIs wired to the same data model — ready to be filled in Phase 2/3.

### Design direction
Single committed direction (the directions tool needs an existing UI to compare against, which we don't have yet — easy to iterate after).

- **Palette**: primary `#00A4D1`, accent `#FECC17` (reserved for the single primary action per surface), dark surface `#0F172A`, app background `#F8FAFC`, success `#22C55E`.
- **Type**: Outfit (display) + Figtree (body) via `@fontsource`.
- **Surfaces**: soft brand gradients on light bg; the Player + Control Center sit on a dark glassy surface for contrast. Glassmorphism used with restraint (no frosted-everything).
- **Controls**: large, rounded, thumb-zone bottom bar on mobile; promotes to a command-deck layout ≥ md.
- **Motion**: pulsing energy meter, shimmering waveform, mood pill that morphs color, press-and-hold "Party Boost".
- Mobile-first, responsive (grid + `min-w-0` + `shrink-0` pattern for header rows).

### Pages & routes
TanStack file-based routing under `src/routes/`.

Public:
- `/` Landing — hero, "Create a party in 2 minutes" promise, feature strip, social proof, pricing teaser, CTA.
- `/pricing` — Free / Host / Pro tiers (UI only).
- `/auth` — email + password sign-in/sign-up.

Authenticated (`/_authenticated/*`, integration-managed gate):
- `/dashboard` — upcoming + past parties, quick "Start a party", recent activity.
- `/parties/new` — 4-step Create Party Wizard (event type → guest age range → music prefs → duration). Generates a party + initial AI-suggested timeline (mock generator).
- `/parties/$partyId` — **Party Control Center** (the heart): NOW PLAYING card (artwork, title, artist, waveform/progress), UP NEXT card, Energy meter (0–100), Mood pill (Warm-up / Build / Peak / Sing-along / Wind-down), horizontal Party Timeline with phases + playhead, transport (Play/Pause/Skip) + Party Boost / Energy Up / Energy Down / Create Moment.
- `/parties/$partyId/guest` — public-feeling Guest Interaction Screen (song requests, reactions, karaoke entry).
- `/library` — Music Library: upload MP3, search, favorite, organize playlists, beautiful artwork placeholders.
- `/loops` — Loop Creator: mic record, layered loop pads, mute/delete, volume.
- `/karaoke` — Guest Karaoke Mode: giant mic button, recordings as cards, AI vocal effects "coming soon".
- `/soundpool` — Sound Pool: category grid (Hip Hop, Country, Rock, Dance, Worship, Pop, Party FX, Drums, Bass, Piano, Vocals), sound pack cards (purchase-ready UI).
- `/ai-lab` — Future AI Features: Coming Soon cards (Autotune, Remix, Mashups, Party Host, Choir, Vocal Producer, Sound Designer, Crowd Reactions, Party Moments).
- `/settings` — profile, audio engine settings (BPM/key/beatmatch/crossfade/mood/energy toggles — UI placeholders), notifications.

### What actually works in Phase 1
- Email + password auth (HIBP enabled).
- Create/edit parties, playlists, tracks, recordings, loops in the DB.
- Upload MP3 → Supabase Storage `tracks` bucket (private, signed URLs).
- Global audio engine (single `<audio>` via Zustand store + React context) powering: play/pause/skip, queue from a playlist, simple linear-volume crossfade between tracks, progress bar, waveform visualizer (Web Audio `AnalyserNode`), favorite, energy/mood as user-adjustable values persisted to the party row.
- Mic recording for karaoke + loops via `MediaRecorder` → stored in `recordings` bucket; playback in-app.
- Guest screen reads party state in realtime (Supabase Realtime subscription to `parties` + `track_queue`).

### What's placeholder UI (Phase 2/3)
- Real BPM/key detection, beatmatching, harmonic mixing, AI autotune/harmonies/choir, AI party host, AI moments.
- Sound pack purchases (Stripe wiring later).
- These have full settings screens, Coming Soon cards, and feature flags in `settings`.

### Database (Supabase via Lovable Cloud)
Tables, all with RLS scoped to `auth.uid()` and `GRANT`s for `authenticated` + `service_role`:

- `profiles` (id → auth.users, display_name, avatar_url, created_at) + signup trigger.
- `parties` (id, host_id, name, event_type, guest_age_range, duration_min, vibe_prefs jsonb, status, current_energy int, current_mood text, current_track_id, started_at, ends_at).
- `playlists` (id, owner_id, party_id nullable, name, cover_url).
- `tracks` (id, owner_id, title, artist, duration_sec, bpm nullable, music_key nullable, energy int, mood text, storage_path, artwork_url).
- `playlist_tracks` (playlist_id, track_id, position) — join.
- `track_queue` (id, party_id, track_id, position, played_at nullable) — live queue powering the Control Center.
- `recordings` (id, owner_id, party_id nullable, kind enum: karaoke|wish|fx, storage_path, duration_sec).
- `loops` (id, owner_id, party_id nullable, name, storage_path, bpm, is_muted, volume).
- `soundpacks` (id, name, category, cover_url, price_cents, is_published) — public read, admin write.
- `user_soundpacks` (user_id, soundpack_id) — ownership.
- `settings` (user_id PK, autodj_enabled, crossfade_sec, energy_management, beat_match, harmonic_mix, notifications jsonb).
- `user_roles` + `app_role` enum + `has_role()` SECURITY DEFINER (admin gate for soundpack management).

Storage buckets: `tracks` (private), `recordings` (private), `artwork` (public), `soundpack-covers` (public).

Seed migration inserts a starter library: 8 demo tracks (metadata only, no audio), 12 soundpacks across the categories, 3 demo playlists, sample party.

### Technical notes
- TanStack Start + Query: loader uses `ensureQueryData` + component uses `useSuspenseQuery`. Public routes call public server fns; authed routes call `requireSupabaseAuth` fns.
- Global audio engine lives in `src/lib/audio/engine.ts` (browser-only, Zustand store, one `HTMLAudioElement` + `AudioContext` + `AnalyserNode`). Mounted once in `_authenticated/route.tsx` via a `<PlayerProvider>`.
- Realtime: Control Center + Guest screen subscribe to `parties:id=eq.$partyId` and `track_queue:party_id=eq.$partyId`.
- Auth attacher already wired by integration; we just consume `requireSupabaseAuth`.
- All colors via semantic tokens in `src/styles.css` `@theme`; no hardcoded `bg-[#...]` in components.
- Server fns live in `src/lib/*.functions.ts` (never under `src/server/`); admin client imported only inside handlers via `await import(...)`.

### Out of scope (explicit)
Real BPM/key detection, real beatmatching, real autotune/harmonies, payments, mobile native apps, SMS invites. All have UI hooks ready.

### Build order
1. Enable Lovable Cloud, run schema migration + seed, configure email auth + HIBP.
2. Design tokens, fonts, layout shell, landing + pricing + auth pages.
3. Dashboard + Create Party Wizard.
4. Audio engine + Music Library (upload, list, play).
5. Party Control Center (player, timeline, energy/mood, transport + AI buttons) + realtime.
6. Guest Interaction Screen + Karaoke.
7. Loop Creator, Sound Pool, AI Lab, Settings.
8. Polish pass: animations, empty states, mobile thumb-zone, SEO `head()` per route.