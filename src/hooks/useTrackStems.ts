import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStemStatus, requestStems, type StemRow } from "@/lib/audio/stems.functions";

export function useTrackStems(trackId: string | null | undefined) {
  const fetchStatus = useServerFn(getStemStatus);
  const kickoff = useServerFn(requestStems);
  const qc = useQueryClient();

  const query = useQuery<StemRow | null>({
    queryKey: ["trackStems", trackId],
    enabled: !!trackId,
    queryFn: async () => {
      if (!trackId) return null;
      return (await fetchStatus({ data: { trackId } })) as StemRow;
    },
    refetchInterval: (q) => {
      const s = (q.state.data as StemRow | null)?.status;
      return s === "processing" || s === "pending" ? 3000 : false;
    },
    staleTime: 30_000,
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!trackId) throw new Error("No track");
      return (await kickoff({ data: { trackId } })) as StemRow;
    },
    onSuccess: (row) => {
      qc.setQueryData(["trackStems", trackId], row);
    },
  });

  return { ...query, generate };
}