// Save/list/load DJ set plans. Auth-scoped to the signed-in owner.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SlotSchema = z.object({
  startMin: z.number(),
  durationMin: z.number(),
  targetEnergy: z.number(),
  trackId: z.string().nullable(),
  backupTrackId: z.string().nullable(),
  notes: z.string().optional(),
});

const PlanInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  eventType: z.enum(["wedding", "club", "corporate", "festival", "birthday"]),
  durationMin: z.number().int().min(10).max(720),
  peakAtMin: z.number().int().min(0).max(720).nullable(),
  slots: z.array(SlotSchema).max(400),
});

type PlanInputT = z.infer<typeof PlanInput>;

export const saveSetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlanInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      owner_id: userId,
      name: data.name,
      event_type: data.eventType,
      duration_min: data.durationMin,
      peak_at_min: data.peakAtMin,
      slots: data.slots,
    };
    if (data.id) {
      const { data: updated, error } = await (supabase.from("set_plans") as unknown as {
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => { select: () => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } } };
      })
        .update(row).eq("id", data.id).select().single();
      if (error) throw new Error(error.message);
      return { id: updated?.id ?? data.id };
    }
    const { data: inserted, error } = await (supabase.from("set_plans") as unknown as {
      insert: (v: Record<string, unknown>) => { select: () => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } };
    })
      .insert(row).select().single();
    if (error) throw new Error(error.message);
    return { id: inserted?.id ?? "" };
  });

export const listSetPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase.from("set_plans") as unknown as {
      select: (cols: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: PlanRow[] | null; error: { message: string } | null }> } } };
    })
      .select("id, name, event_type, duration_min, peak_at_min, slots, updated_at")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as PlanRow[];
  });

type PlanRow = {
  id: string;
  name: string;
  event_type: PlanInputT["eventType"];
  duration_min: number;
  peak_at_min: number | null;
  slots: PlanInputT["slots"];
  updated_at: string;
};

export const deleteSetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase.from("set_plans") as unknown as {
      delete: () => { eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } };
    })
      .delete().eq("id", data.id).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });