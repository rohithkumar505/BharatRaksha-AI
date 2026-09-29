import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getRedis } from "@/lib/redis";
import { getAlertChannel } from "@/lib/alert-pubsub";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireAuth("alerts:read");
  if (error) return error;

  const encoder = new TextEncoder();
  const channel = getAlertChannel();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let subscriber: ReturnType<typeof getRedis> | null = null;

      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      const shutdown = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        void subscriber?.unsubscribe(channel).catch(() => undefined);
        void subscriber?.quit().catch(() => undefined);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      send(JSON.stringify({ type: "connected", at: new Date().toISOString() }));

      try {
        subscriber = getRedis().duplicate();
        await subscriber.subscribe(channel);

        subscriber.on("message", (_ch, message) => {
          send(message);
        });

        heartbeat = setInterval(() => {
          send(JSON.stringify({ type: "heartbeat", at: new Date().toISOString() }));
        }, 25000);

        request.signal.addEventListener("abort", shutdown);
      } catch {
        send(JSON.stringify({ type: "error", message: "Redis unavailable — use polling fallback" }));
        shutdown();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
