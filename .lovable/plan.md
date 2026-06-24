# Plan: Set-Planner + Smart Crates + Genre-Bridge + Live Energy-Timeline (mit Deej-AI Ideen)

## Was wir von Deej-AI übernehmen
Deej-AI ist Python + Jupyter (GPL-3) — kein Code-Copy. Übernommen werden zwei Konzepte:

1. **Track-Embeddings (Vektor pro Song):** Statt nur BPM/Key/Energie bekommt jeder Track einen N-dim Vektor. Cosine-Distanz = „klangliche Ähnlichkeit". Damit funktionieren **Smart Crates** (Cluster), **Genre-Bridge** (Wegfindung im Vektorraum) und **Set-Planner** (Pfad mit Energie-Constraint) gleichzeitig — alle vier Features nutzen denselben Datenpunkt.
2. **„Join-the-dots":** Pfad von Track A → B über N Zwischenstationen, der schrittweise von einem Vektor zum anderen morpht. Genau das macht der **Genre-Bridge** (von Hip-Hop nach House mit BPM/Key-Constraint dazwischen).

Embeddings werden im bestehenden HF-Space (`infra/hf-space`) berechnet — der hat schon Python + Audio-Stack. Hinzu kommt ein Endpunkt `/embed` mit Mel-Spectrogram → Mean-Pool → 64-dim Vektor (kein Modell-Training nötig, Mean-Pool auf vorhandenen Features reicht für Cosine-Sim als MVP; später austauschbar gegen MusicNN/CLAP).

## 1) Track-Embeddings (Foundation für alles)

**Backend**
- Neue Spalte `tracks.embedding vector(64)` (pgvector — falls Extension nicht aktiv: `text[]` als Float-Array Fallback).
- HF-Space `app.py`: Endpunkt `POST /embed` → nimmt Audio-URL, gibt `{embedding: number[64]}` zurück. Nutzt `librosa.feature.melspectrogram` → log → Mean+Std-Pool → L2-normalize.
- Neue Server-Fn `src/lib/intel/embed.functions.ts` (`requireSupabaseAuth`): ruft HF-Space, schreibt Vektor in `tracks`.
- Hook in bestehende Analyse-Pipeline (`batchAnalyze.ts`): nach BPM/Key/Energie auch Embedding fetchen.

**Frontend**
- Re-Analyse-Button in Library/Cockpit triggert Embedding-Backfill für alte Tracks.

## 2) Set-Planner (Wizard + Tabelle)

**Route:** `src/routes/_authenticated/setplanner.tsx`

**UI-Flow:**
1. Event-Typ wählen (Hochzeit / Club / Firmenfeier / Stadtfest / Geburtstag).
2. Dauer & Peak-Zeit (Slider).
3. „Generieren" → zeigt Zeitstrahl mit Slots (alle ~3.5 min), pro Slot ein Track + 1 Backup.
4. Drag-and-Drop zum Umsortieren, „Track tauschen" zeigt 3 Alternativen aus dem Vektor-Nachbar­schaft.
5. „Speichern" / „In Cockpit-Queue laden".

**Logik (`src/lib/intel/setPlanner.ts`):**
- Energy-Curve-Template pro Event-Typ (z.B. Hochzeit = sanfter Sinus mit Peak nach 2/3, Club = stetiger Aufstieg → Plateau → kurzer Drop).
- Greedy-Search durch die Library: für jeden Slot wähle Track der (a) Energie-Ziel ±0.1 trifft, (b) Key zum Vorgänger Camelot-kompatibel ist, (c) BPM ±10%, (d) Embedding-Distanz zum Vorgänger im Mittelfeld (nicht identisch, nicht weit entfernt).
- Backup pro Slot: zweitbester Kandidat mit Genre-Distanz > Hauptkandidat.

**Tabelle (Migration):**
```sql
CREATE TABLE public.set_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  event_type text not null,
  duration_min int not null,
  peak_at_min int,
  slots jsonb not null,  -- [{startMin, trackId, backupTrackId, targetEnergy}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.set_plans TO authenticated;
GRANT ALL ON public.set_plans TO service_role;
ALTER TABLE public.set_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plans" ON public.set_plans FOR ALL
  USING (auth.uid()=owner_id) WITH CHECK (auth.uid()=owner_id);
```

**Server-Fn:** `src/lib/intel/setPlanner.functions.ts` mit `savePlan`, `listPlans`, `loadPlanToQueue`.

## 3) Smart Crates (auto-getaggt)

**Neue Spalte:** `tracks.smart_crate text` (Warm-up / Floor-Filler / Peak / Cool-down / Reserve) + `tracks.user_tags text[]`.

**Logik (`src/lib/intel/smartCrates.ts`):**
- K-Means (k=5) auf Energie + BPM + Vocal-Dichte → automatische Zuordnung.
- Embedding-Cluster (k=8) → Sub-Crates „klanglich verwandt" via Cosine-Distanz innerhalb der Crate.
- User kann manuell Tags überschreiben (`user_tags`).

**UI:** `MixabilityPlaylist` bekommt Filter-Chips (5 Crates + „Alle"), Tracks zeigen Crate-Badge.

## 4) Genre-Bridge (Join-the-dots)

**Logik (`src/lib/intel/genreBridge.ts`):**
- Bei großer Distanz (Embedding-Cosine > 0.5 ODER BPM-Sprung > 15%) sucht Funktion `findBridge(trackA, trackB, libraryWithEmbeddings)`:
  - Greedy 1–3 Hops: jeweils nächster Nachbar von A in Richtung B (linearer Interpol-Punkt im Vektorraum), der BPM/Key-tauglich ist.
  - Liefert 1–3 Bridge-Tracks.
- UI: in `MixabilityPlaylist` zwischen zwei Tracks ein Badge „⚡ Bridge empfohlen" → Klick zeigt Vorschläge, fügt in Queue ein.

## 5) Live Energy-Timeline

**Komponente:** `src/components/cockpit/EnergyTimeline.tsx`
- SVG-Linie: linke Hälfte = vergangene 8 min Live-Energie (RMS aus `twinDeckBus` Output-Meter, gesampelt 1/s), rechte Hälfte = projizierte Energie der nächsten 3 Queue-Tracks (aus `tracks.energy_curve`).
- Marker-Linie für Set-Plan-Soll (wenn Plan geladen) — Abweichung > 0.15 färbt Linie rot.
- Wenn 3 Tracks in Folge fallen → Toast „Tanzflaute droht — Floor-Filler aus Crate vorschlagen", Button öffnet Crate-Filter.

Eingebaut in `cockpit.tsx` zwischen `TwinDeck` und `CockpitCenter`.

## Umsetzungsreihenfolge

1. Migration: `set_plans` Tabelle, `tracks.embedding`/`smart_crate`/`user_tags` Spalten.
2. HF-Space `/embed` Endpunkt + Server-Fn + Backfill-Trigger.
3. Smart-Crates Auto-Tagging (läuft mit Backfill).
4. Set-Planner Logik + Route + Wizard-UI.
5. Genre-Bridge in `MixabilityPlaylist`.
6. Live Energy-Timeline.

Sag Bescheid wenn ich starten soll — ich beginne mit Schritt 1 (Migration) zur Freigabe.
