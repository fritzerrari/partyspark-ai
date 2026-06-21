import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/party-host-speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voice } = (await request.json()) as { text?: string; voice?: string };
        if (!text || typeof text !== "string") {
          return new Response("text required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            "Lovable-API-Key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: text.slice(0, 2000),
            voice: voice || "alloy",
            response_format: "mp3",
          }),
        });

        if (!upstream.ok) {
          const body = await upstream.text().catch(() => "");
          return new Response(body || "TTS failed", { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});