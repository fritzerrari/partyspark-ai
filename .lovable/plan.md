## Community Sound-FX Marketplace + Storage Management

### Konzept
User können kurze Sound-FX (Airhorns, Drops, Risers, Sirens, Sweeper, Voice-Tags) für die gesamte PartyPilot-Community veröffentlichen. Andere User entdecken, bewerten und verwenden sie in ihren Parties. Ein Admin-Approval sichert Qualität & Rechte. Speicherplatz wird durch harte Quotas, Auto-Cleanup und Komprimierung im Griff gehalten.

### Funktionsumfang

**Für alle User (Browse & Use)**
- Neue Route `/fx` — Community FX Library mit Tabs: *Trending · Top Rated · Neu · Meine FX*
- Filter nach Kategorie (Drop, Riser, Airhorn, Sweep, Voice, Impact, FX), Tag, Dauer, BPM
- 1-Click Preview (Waveform + Play), 5-Sterne-Bewertung, "Use in Party" Button
- Detailseite mit Bewertungen, Kommentaren (optional Phase 2), Uploader-Profil
- Report-Button (Spam, Copyright, NSFW)

**Für Creator (Upload)**
- Upload-Formular: Titel, Beschreibung, Kategorie, Tags, Datei (max **30 Sek**, max 2 MB)
- Server-seitige Validierung: Dauer, Bitrate, Hash-Dedup
- Status: `pending → approved | rejected` — sichtbar im "Meine FX"-Tab
- Auto-Transcoding auf 128 kbps OGG (kleiner als MP3, lizenzfrei)

**Für Admins (Moderation)**
- Neue Route `/admin/fx-review` (nur Rolle `admin`)
- Queue mit Pending Uploads, Approve/Reject + Reject-Grund
- Übersicht: Reports, Storage-Usage pro User, Top FX

**Ranking (Wilson Score)**
- Sterne 1–5 + Anzahl Ratings → Wilson Lower Bound für faires Trending
- Trending-Score = `wilson * recency_decay(7d half-life)` + Play-Boost
- Materialized View `fx_rankings`, alle 15 Min via pg_cron refreshed

**Storage-Management**
- **Per-User-Quota** (gespeichert in `settings`):
  - Free: 50 MB FX + 200 MB Tracks
  - Pro (Platzhalter): 500 MB FX + 5 GB Tracks
- Upload prüft Quota vor Storage-PUT, klare UI-Anzeige (Progress Bar in Settings)
- **Auto-Cleanup** (täglicher pg_cron Job → `/api/public/hooks/storage-cleanup`):
  - Eigene Tracks ohne Plays seit 90 Tagen → User-Warnung per Flag, Löschung nach 14 Tagen Grace
  - Abgelehnte FX → sofort Storage-Delete, DB-Row 30 Tage zur Nachvollziehbarkeit
  - Verwaiste Storage-Objekte (DB-Row fehlt) → wöchentlich gepurged
- **Komprimierung & Dedup** beim Upload:
  - SHA-256 Hash → existiert Datei bereits, neue DB-Row zeigt auf gleiches Storage-Objekt (Reference Counting)
  - Transcode FX zu 128 kbps OGG (Server-Fn, ffmpeg-wasm im Worker)
- Globales Storage-Dashboard für Admin (gesamt, pro User, Top-Verbraucher)

### Technische Umsetzung

**Neue DB-Schema (Migration)**
- `community_fx` — title, description, category, tags[], duration_s, bpm?, storage_path, file_hash, file_size, uploader_id, status (pending/approved/rejected), reject_reason, play_count, created_at, approved_at
- `community_fx_ratings` — fx_id, user_id, stars (1–5), unique(fx_id, user_id)
- `community_fx_plays` — fx_id, user_id, party_id?, played_at (für Trending + Cleanup-Signale)
- `community_fx_reports` — fx_id, reporter_id, reason, status, created_at
- Materialized View `community_fx_rankings` — fx_id, avg_stars, rating_count, wilson_score, trending_score
- `storage_quotas` (oder Felder in `settings`) — fx_bytes_used, tracks_bytes_used, fx_quota_bytes, tracks_quota_bytes
- `tracks` erweitern: `last_played_at`, `cleanup_warned_at`
- RLS: FX lesbar wenn `status='approved'` (TO anon + authenticated); Insert nur authenticated mit eigenem uploader_id; Update/Delete nur Owner oder Admin; Ratings nur authenticated, ein Stern pro User
- GRANTs auf allen public-Tables, `has_role('admin')` für Moderationsrechte
- Neue Storage Buckets: `community-fx` (public read für approved), private staging-Pfad für pending

**Server Functions (`createServerFn` + `requireSupabaseAuth`)**
- `uploadFx` — Hash-Check, Quota-Check, Transcode, Storage-PUT, DB-Insert (status=pending)
- `rateFx` — Upsert Rating, Trigger Re-Score
- `playFx` — Insert Play-Event (für Trending + last_used)
- `reportFx` — Insert Report
- `adminApproveFx` / `adminRejectFx` — guard via `has_role('admin')`
- `getMyStorageUsage` — Quota-Status für Settings-Page

**Public Routes (Worker)**
- `/api/public/hooks/storage-cleanup` — pg_cron daily, signiert via apikey
- `/api/public/hooks/refresh-rankings` — pg_cron alle 15 Min

**Frontend (mobile-first wie bestehend)**
- `src/routes/_authenticated/fx/index.tsx` — Library mit Tabs, Card-Grid, Bottom-Sheet Filter
- `src/routes/_authenticated/fx/upload.tsx` — Wizard (File → Metadata → Preview → Submit)
- `src/routes/_authenticated/fx/$fxId.tsx` — Detail (Waveform, Rating, Use-in-Party)
- `src/routes/_authenticated/admin/fx-review.tsx` — Admin-Only Queue
- AppShell: neuer Tab "FX" (ersetzt "Sounds" oder als 6. Eintrag im More-Sheet), in Bottom-Nav mobile
- Settings-Page: Storage-Quota-Widget mit Progress-Bars + Cleanup-Button

**Admin-Bootstrapping**
- `fritz.geiling@googlemail.com` bekommt `admin` Rolle via `user_roles` (Migration oder Insert)

### Nicht enthalten (für spätere Phase)
- Kommentar-Threads, Bezahl-FX/Tip-Jar, AI-generierte FX, Pro-Tier-Billing, externer R2/S3 Storage-Provider (Hooks bleiben austauschbar)
