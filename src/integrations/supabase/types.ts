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
      recordings: {
        Row: {
          created_at: string
          duration_sec: number | null
          id: string
          kind: Database["public"]["Enums"]["recording_kind"]
          owner_id: string
          party_id: string | null
          storage_path: string
          title: string | null
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["recording_kind"]
          owner_id: string
          party_id?: string | null
          storage_path: string
          title?: string | null
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["recording_kind"]
          owner_id?: string
          party_id?: string | null
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
          energy_management: boolean
          harmonic_mix: boolean
          notifications: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          autodj_enabled?: boolean
          beat_match?: boolean
          crossfade_sec?: number
          energy_management?: boolean
          harmonic_mix?: boolean
          notifications?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          autodj_enabled?: boolean
          beat_match?: boolean
          crossfade_sec?: number
          energy_management?: boolean
          harmonic_mix?: boolean
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
          artist: string | null
          artwork_url: string | null
          bpm: number | null
          created_at: string
          duration_sec: number | null
          energy: number
          id: string
          is_favorite: boolean
          mood: string | null
          music_key: string | null
          owner_id: string
          storage_path: string | null
          title: string
        }
        Insert: {
          artist?: string | null
          artwork_url?: string | null
          bpm?: number | null
          created_at?: string
          duration_sec?: number | null
          energy?: number
          id?: string
          is_favorite?: boolean
          mood?: string | null
          music_key?: string | null
          owner_id: string
          storage_path?: string | null
          title: string
        }
        Update: {
          artist?: string | null
          artwork_url?: string | null
          bpm?: number | null
          created_at?: string
          duration_sec?: number | null
          energy?: number
          id?: string
          is_favorite?: boolean
          mood?: string | null
          music_key?: string | null
          owner_id?: string
          storage_path?: string | null
          title?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      party_status: ["draft", "live", "ended"],
      recording_kind: ["karaoke", "wish", "fx"],
    },
  },
} as const
