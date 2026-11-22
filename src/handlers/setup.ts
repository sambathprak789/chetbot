import { Api } from "grammy";
import { commands } from "../messages";
import { safeEqual, WEBHOOK_SECRET_PATTERN } from "../utils/security";

/**
 * GET /setup?key=WEBHOOK_SECRET  (Spec 7.1)
 * Points Telegram at this Worker's /webhook and registers the Menu commands.
 */
export async function handleSetup(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  if (!env.WEBHOOK_SECRET || !safeEqual(key, env.WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!WEBHOOK_SECRET_PATTERN.test(env.WEBHOOK_SECRET)) {
    return Response.json(
      { ok: false, error: "WEBHOOK_SECRET may only contain A-Z, a-z, 0-9, _ and -" },
      { status: 500 },
    );
  }

  const api = new Api(env.BOT_TOKEN);
  const webhookUrl = `${url.origin}/webhook`;

  await api.setWebhook(webhookUrl, {
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await api.setMyCommands(commands.en);
  await api.setMyCommands(commands.km, { language_code: "km" });
  await api.setChatMenuButton({ menu_button: { type: "commands" } });

  const info = await api.getWebhookInfo();
  return Response.json({
    ok: true,
    webhook: info.url,
    pending_updates: info.pending_update_count,
    last_error: info.last_error_message ?? null,
  });
}
