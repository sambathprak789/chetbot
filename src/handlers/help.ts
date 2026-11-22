import { helpBilingual } from "../messages";
import type { BotContext } from "../types";

/** /help in both languages, Khmer first (same as /start). */
export async function handleHelp(ctx: BotContext): Promise<void> {
  const text = helpBilingual({
    maxVoiceSeconds: Number(ctx.env.MAX_VOICE_SECONDS),
    dailyUserLimit: Number(ctx.env.DAILY_USER_LIMIT),
  });
  await ctx.reply(text, { parse_mode: "HTML" });
}
