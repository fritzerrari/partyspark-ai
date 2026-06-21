export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      community_fx: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bpm: number | null
          category: Database["public"]["Enums"]["fx_category"]
          created_at: string
          description: string | null
          duration_s: number
          file_hash: string
          file_size: number
          id: string
          mime_type: string
          play_count: number
          reject_reason: string | null
          status: Database["public"]["Enums"]["fx_status"]
          storage_path: string
          tags: string[]
          title: string
          updated_at: string
          uploader_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bpm?: number | null
          category?: Database["public"]["Enums"]["fx_category"]
          created_at?: string
          description?: string | null
          duration_s: number
          file_hash: string
          file_size: number
          id?: string
          mime_type?: string
          play_count?: number
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["fx_status"]
          storage_path: string
          tags?: string[]
          title: string
          updated_at?: string
          uploader_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bpm?: number | null
          category?: Database["public"]["Enums"]["fx_category"]
          created_at?: string
          description?: string | null
          duration_s?: number
          file_hash?: string
          file_size?: number
          id?: string
          mime_type?: string
          play_count?: number
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["fx_status"]
          storage_path?: string
          tags?: string[]
          title?: string
          updated_at?: string
          uploader_id?: string
        }
        Relationships: []
      }
      community_fx_plays: {
        Row: {
          fx_id: string
          id: string
          party_id: string | null
          played_at: string
          user_id: string
        }
        Insert: {
          fx_id: string
          id?: string
          party_id?: string | null
          played_at?: string
          user_id: string
        }
        Update: {
          fx_id?: string
          id?: string
          party_id?: string | null
          played_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_fx_plays_fx_id_fkey"
            columns: ["fx_id"]
            isOneToOne: false
            referencedRelation: "community_fx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_fx_plays_fx_id_fkey"
            columns: ["fx_id"]
            isOneToOne: false
            referencedRelation: "community_fx_rankings"
            referencedColumns: ["fx_id"]
          },
          {
            foreignKeyName: "community_fx_plays_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      community_fx_ratings: {
        Row: {
          created_at: string
          fx_id: string
          id: string
          stars: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fx_id: string
          id?: string
          stars: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fx_id?: string
          id?: string
          stars?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_fx_ratings_fx_id_fkey"
            columns: ["fx_id"]
            isOneToOne: false
            referencedRelation: "community_fx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_fx_ratings_fx_id_fkey"
            columns: ["fx_id"]
            isOneToOne: false
            referencedRelation: "community_fx_rankings"
            referencedColumns: ["fx_id"]
          },
        ]
      }
      community_fx_reports: {
        Row: {
          created_at: string
          details: string | null
          fx_id: string
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          fx_id: string
          id?: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          fx_id?: string
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_fx_reports_fx_id_fkey"
            columns: ["fx_id"]
            isOneToOne: false
            referencedRelation: "community_fx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_fx_reports_fx_id_fkey"
            columns: ["fx_id"]
            isOneToOne: false
            referencedRelation: "community_fx_rankings"
            referencedColumns: ["fx_id"]
          },
        ]
      }
      loops: {
        Row: {
          bpm: number | null
          color: string | null
          created_at: string
          id: string
          is_muted: boolean
          name: string
          owner_id: string
          party_id: string | null
          storage_path: string | null
          volume: number
        }
        Insert: {
          bpm?: number | null
          color?: string | null
          created_at?: string
          id?: string
          is_muted?: boolean
          name: string
          owner_id: string
          party_id?: string | null
          storage_path?: string | null
          volume?: number
        }
        Update: {
          bpm?: number | null
          color?: string | null
          created_at?: string
          id?: string
          is_muted?: boolean
          name?: string
          owner_id?: string
          party_id?: string | null
          storage_path?: string | null
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "loops_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          created_at: string
          current_energy: number
          current_mood: string
          current_track_id: string | null
          duration_min: number
          ends_at: string | null
          event_type: string
          guest_age_range: string
          host_id: string
          id: string
          name: string
          started_at: string | null
          status: Database["public"]["Enums"]["party_status"]
          updated_at: string
          vibe_prefs: Json
        }
        Insert: {
          created_at?: string
          current_energy?: number
          current_mood?: string
          current_track_id?: string | null
          duration_min?: number
          ends_at?: string | null
          event_type: string
          guest_age_range: string
          host_id: string
          id?: string
          name: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["party_status"]
          updated_at?: string
          vibe_prefs?: Json
        }
        Update: {
          created_at?: string
          current_energy?: number
          current_mood?: string
          current_track_id?: string | null
          duration_min?: number
          ends_at?: string | null
          event_type?: string
          guest_age_range?: string
          host_id?: string
          id?: string
          name?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["party_status"]
          updated_at?: string
          vibe_prefs?: Json
        }
        Relationships: []
      }
      party_host_lines: {
        Row: {
          created_at: string
          id: string
          language: string
          text: string
          user_id: string
          vibe: string
          voice: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          text: string
          user_id: string
          vibe?: string
          voice?: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          text?: string
          user_id?: string
          vibe?: string
          voice?: string
        }
        Relationships: []
      }
      playlist_tracks: {
        Row: {
          playlist_id: string
          position: number
          track_id: string
        }
        Insert: {
          playlist_id: string
          position?: number
          track_id: string
        }
        Update: {
          playlist_id?: string
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          party_id: string | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          party_id?: string | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playlists_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recording_moments: {
        Row: {
          caption: string | null
          created_at: string
          end_sec: number
          id: string
          kind: string
          owner_id: string
          recording_id: string
          score: number | null
          start_sec: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          end_sec: number
          id?: string
          kind: string
          owner_id: string
          recording_id: string
          score?: number | null
          start_sec: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          end_sec?: number
          id?: string
          kind?: string
          owner_id?: string
          recording_id?: string
          score?: number | null
          start_sec?: number
        }
        Relationships: [
          {
            foreignKeyName: "recording_moments_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      recordings: {
        Row: {
          cover_url: string | null
          created_at: string
          duration_sec: number | null
          id: string
          kind: Database["public"]["Enums"]["recording_kind"]
          metadata: Json | null
          owner_id: string
          party_id: string | null
          score: number | null
          storage_path: string
          title: string | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["recording_kind"]
          metadata?: Json | null
          owner_id: string
          party_id?: string | null
          score?: number | null
          storage_path: string
          title?: string | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["recording_kind"]
          metadata?: Json | null
          owner_id?: string
          party_id?: string | null
          score?: number | null
          storage_path?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recordings_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          autodj_enabled: boolean
          beat_match: boolean
          crossfade_sec: number
          cue_output_id: string | null
          energy_management: boolean
          harmonic_mix: boolean
          master_output_id: string | null
          mic_device_id: string | null
          mic_ducking: boolean
          mic_enabled: boolean
          mic_gain: number
          notifications: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          autodj_enabled?: boolean
          beat_match?: boolean
          crossfade_sec?: number
          cue_output_id?: string | null
          energy_management?: boolean
          harmonic_mix?: boolean
          master_output_id?: string | null
          mic_device_id?: string | null
          mic_ducking?: boolean
          mic_enabled?: boolean
          mic_gain?: number
          notifications?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          autodj_enabled?: boolean
          beat_match?: boolean
          crossfade_sec?: number
          cue_output_id?: string | null
          energy_management?: boolean
          harmonic_mix?: boolean
          master_output_id?: string | null
          mic_device_id?: string | null
          mic_ducking?: boolean
          mic_enabled?: boolean
          mic_gain?: number
          notifications?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      soundpacks: {
        Row: {
          category: string
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          name: string
          price_cents: number
          track_count: number
        }
        Insert: {
          category: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name: string
          price_cents?: number
          track_count?: number
        }
        Update: {
          category?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name?: string
          price_cents?: number
          track_count?: number
        }
        Relationships: []
      }
      storage_quotas: {
        Row: {
          fx_bytes_used: number
          fx_quota_bytes: number
          recordings_bytes_used: number
          recordings_quota_bytes: number
          tier: string
          tracks_bytes_used: number
          tracks_quota_bytes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          fx_bytes_used?: number
          fx_quota_bytes?: number
          recordings_bytes_used?: number
          recordings_quota_bytes?: number
          tier?: string
          tracks_bytes_used?: number
          tracks_quota_bytes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          fx_bytes_used?: number
          fx_quota_bytes?: number
          recordings_bytes_used?: number
          recordings_quota_bytes?: number
          tier?: string
          tracks_bytes_used?: number
          tracks_quota_bytes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      track_queue: {
        Row: {
          created_at: string
          id: string
          party_id: string
          played_at: string | null
          position: number
          track_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          party_id: string
          played_at?: string | null
          position?: number
          track_id: string
        }
        Update: {
          created_at?: string
          id?: string
          party_id?: string
          played_at?: string | null
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_queue_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_queue_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          analyzed_at: string | null
          artist: string | null
          artwork_url: string | null
          beat_grid: Json | null
          bpm: number | null
          cleanup_warned_at: string | null
          created_at: string
          cues: Json | null
          duration_sec: number | null
          energy: number
          energy_curve: Json | null
          id: string
          is_favorite: boolean
          last_played_at: string | null
          mood: string | null
          music_key: string | null
          owner_id: string
          storage_path: string | null
          title: string
          vocal_map: Json | null
        }
        Insert: {
          analyzed_at?: string | null
          artist?: string | null
          artwork_url?: string | null
          beat_grid?: Json | null
          bpm?: number | null
          cleanup_warned_at?: string | null
          created_at?: string
          cues?: Json | null
          duration_sec?: number | null
          energy?: number
          energy_curve?: Json | null
          id?: string
          is_favorite?: boolean
          last_played_at?: string | null
          mood?: string | null
          music_key?: string | null
          owner_id: string
          storage_path?: string | null
          title: string
          vocal_map?: Json | null
        }
        Update: {
          analyzed_at?: string | null
          artist?: string | null
          artwork_url?: string | null
          beat_grid?: Json | null
          bpm?: number | null
          cleanup_warned_at?: string | null
          created_at?: string
          cues?: Json | null
          duration_sec?: number | null
          energy?: number
          energy_curve?: Json | null
          id?: string
          is_favorite?: boolean
          last_played_at?: string | null
          mood?: string | null
          music_key?: string | null
          owner_id?: string
          storage_path?: string | null
          title?: string
          vocal_map?: Json | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_soundpacks: {
        Row: {
          acquired_at: string
          soundpack_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          soundpack_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          soundpack_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_soundpacks_soundpack_id_fkey"
            columns: ["soundpack_id"]
            isOneToOne: false
            referencedRelation: "soundpacks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      community_fx_rankings: {
        Row: {
          avg_stars: number | null
          fx_id: string | null
          plays_7d: number | null
          rating_count: number | null
          trending_score: number | null
          wilson_score: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_track_played: { Args: { _track_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
      fx_category:
        | "drop"
        | "riser"
        | "airhorn"
        | "sweep"
        | "voice"
        | "impact"
        | "transition"
        | "loop"
        | "other"
      fx_status: "pending" | "approved" | "rejected"
      party_status: "draft" | "live" | "ended"
      recording_kind: "karaoke" | "wish" | "fx"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      fx_category: [
        "drop",
        "riser",
        "airhorn",
        "sweep",
        "voice",
        "impact",
        "transition",
        "loop",
        "other",
      ],
      fx_status: ["pending", "approved", "rejected"],
      party_status: ["draft", "live", "ended"],
      recording_kind: ["karaoke", "wish", "fx"],
    },
  },
} as const
