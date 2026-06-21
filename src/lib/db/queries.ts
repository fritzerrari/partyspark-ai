import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const partiesListOptions = (userId: string) =>
  queryOptions({
    queryKey: ["parties", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const partyOptions = (id: string) =>
  queryOptions({
    queryKey: ["party", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const tracksListOptions = () =>
  queryOptions({
    queryKey: ["tracks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const queueOptions = (partyId: string) =>
  queryOptions({
    queryKey: ["queue", partyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("track_queue")
        .select("*, tracks(*)")
        .eq("party_id", partyId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

export const soundpacksOptions = () =>
  queryOptions({
    queryKey: ["soundpacks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("soundpacks")
        .select("*")
        .order("category", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

export const loopsOptions = () =>
  queryOptions({
    queryKey: ["loops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loops")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const recordingsOptions = () =>
  queryOptions({
    queryKey: ["recordings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recordings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const settingsOptions = (userId: string) =>
  queryOptions({
    queryKey: ["settings", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export type FxTab = "trending" | "top" | "new" | "mine";

export const communityFxOptions = (tab: FxTab, userId?: string) =>
  queryOptions({
    queryKey: ["community_fx", tab, userId ?? null],
    queryFn: async () => {
      let q = supabase.from("community_fx").select("*");
      if (tab === "mine" && userId) q = q.eq("uploader_id", userId);
      else q = q.eq("status", "approved");
      if (tab === "new") q = q.order("created_at", { ascending: false });
      else if (tab === "mine") q = q.order("created_at", { ascending: false });
      else q = q.order("created_at", { ascending: false });
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

export const fxRankingsOptions = () =>
  queryOptions({
    queryKey: ["community_fx_rankings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_fx_rankings")
        .select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

export const fxPendingOptions = () =>
  queryOptions({
    queryKey: ["community_fx", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_fx")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

export const fxDetailOptions = (id: string) =>
  queryOptions({
    queryKey: ["community_fx", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_fx")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const fxMyRatingOptions = (fxId: string, userId: string) =>
  queryOptions({
    queryKey: ["fx_rating", fxId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_fx_ratings")
        .select("*")
        .eq("fx_id", fxId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const storageQuotaOptions = (userId: string) =>
  queryOptions({
    queryKey: ["storage_quota", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_quotas")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const isAdminOptions = (userId: string) =>
  queryOptions({
    queryKey: ["is_admin", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });