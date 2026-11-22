import { help } from "../messages";
import type { BotContext } from "../types";

export async function handleHelp(ctx: BotContext): Promise<void> {
  const text = help(ctx.lang, {
    maxVoiceSeconds: Number(ctx.env.MAX_VOICE_SECONDS),
    dailyUserLimit: Number(ctx.env.DAILY_USER_LIMIT),
  });
  await ctx.reply(text, { parse_mode: "HTML" });
}
