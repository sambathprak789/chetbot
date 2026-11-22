import { Bot } from "grammy";
import { handleHelp } from "./handlers/help";
import { handleStart } from "./handlers/start";
import { registerUser } from "./handlers/user";
import type { BotContext } from "./types";

let cached: { token: string; bot: Bot<BotContext> } | undefined;

/** One Bot per isolate, so getMe runs once instead of on every update. */
export function getBot(env: Env): Bot<BotContext> {
  if (cached?.token === env.BOT_TOKEN) return cached.bot;

  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    ctx.env = env;
    await next();
  });
  bot.use(registerUser);

  bot.command("start", handleStart);
  bot.command("help", handleHelp);

  bot.catch((err) => {
    // Never log message text (Spec 7.4) — only the error and update id.
    console.error("bot error", { update_id: err.ctx.update.update_id, error: String(err.error) });
  });

  cached = { token: env.BOT_TOKEN, bot };
  return bot;
}
