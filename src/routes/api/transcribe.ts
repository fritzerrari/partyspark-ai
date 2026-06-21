import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof Blob) || file.size < 512) {
          return new Response("empty audio", { status: 400 });
        }
        const type = (file as Blob).type || "audio/webm";
        const ext = type.includes("mp4") ? "mp4" : type.includes("mpeg") ? "mp3" : type.includes("wav") ? "wav" : "webm";

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", file, `clip.${ext}`);
        upstream.append("stream", "true");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: upstream,
        });
        if (!res.ok || !res.body) {
          return new Response(`Transcribe failed: ${res.status} ${await res.text().catch(() => "")}`, { status: res.status });
        }
        return new Response(res.body, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    },
  },
});