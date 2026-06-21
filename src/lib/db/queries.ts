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