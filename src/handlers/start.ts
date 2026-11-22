import { welcome } from "../messages";
import type { BotContext } from "../types";

export async function handleStart(ctx: BotContext): Promise<void> {
  await ctx.reply(welcome(ctx.from?.first_name ?? ""), { parse_mode: "HTML" });
}
