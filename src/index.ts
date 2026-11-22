import { webhookCallback } from "grammy";
import { getBot } from "./bot";
import { handleSetup } from "./handlers/setup";
import { safeEqual } from "./utils/security";

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/webhook") {
      // Reject anything without the right secret header before touching Telegram (Spec 6.3)
      const token = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      if (!env.WEBHOOK_SECRET || !safeEqual(token, env.WEBHOOK_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const handle = webhookCallback(getBot(env), "cloudflare-mod", {
        secretToken: env.WEBHOOK_SECRET,
      });
      return handle(request);
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
