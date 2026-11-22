import type { Update } from "grammy/types";
import { getBot } from "./bot";
import { handleSetup } from "./handlers/setup";
import { alertOwner } from "./services/alerts";
import { safeEqual } from "./utils/security";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/webhook") {
      // Reject anything without the right secret header before touching Telegram (Spec 6.3)
      const token = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      if (!env.WEBHOOK_SECRET || !safeEqual(token, env.WEBHOOK_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }
      let update: Update;
      try {
        update = await request.json<Update>();
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      // Answer Telegram at once and keep working in the background, so a slow
      // Gemini call never makes Telegram resend the same update.
      const bot = getBot(env);
      ctx.waitUntil(
        (async () => {
          if (!bot.isInited()) await bot.init();
          await bot.handleUpdate(update);
        })().catch(async (err) => {
          console.error("update failed", { error: String(err) });
          await alertOwner(env, "webhook update", err);
        }),
      );
      return new Response("OK");
    }

    if (request.method === "GET" && pathname === "/setup") {
      return handleSetup(request, env);
    }

    if (request.method === "GET" && pathname === "/") {
      return new Response("ChetBot is running");
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
