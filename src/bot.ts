import { Bot } from "grammy";
import { handleButton } from "./handlers/buttons";
import { handleFeelingText } from "./handlers/feeling";
import { handleHelp } from "./handlers/help";
import { handleStart } from "./handlers/start";
import { registerUser } from "./handlers/user";
import { handleFeelingVoice } from "./handlers/voice";
import { limitTexts } from "./messages";
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

  // Any other private text that is not a command → feeling (Flow B)
  bot.chatType("private").on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();
    await handleFeelingText(ctx);
  });

  // Voice notes → feeling (Flow B, Milestone 4)
  bot.chatType("private").on("message:voice", handleFeelingVoice);

  // 👍 👎 🔄 and the Khmer/English choice (Flow C, Milestone 5)
  bot.on("callback_query:data", handleButton);

  // Anything else in a private chat: photos, stickers, files, unknown /commands (Spec 5.4, Milestone 6)
  bot.chatType("private").on("message", async (ctx) => {
    const isCommand = ctx.message.text?.startsWith("/");
    await ctx.reply((isCommand ? limitTexts.unknownCommand : limitTexts.unsupported)[ctx.lang]);
  });

  bot.catch((err) => {
    // Never log message text (Spec 7.4) — only the error and update id.
    console.error("bot error", { update_id: err.ctx.update.update_id, error: String(err.error) });
  });

  cached = { token: env.BOT_TOKEN, bot };
  return bot;
}
