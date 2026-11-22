import type { NextFunction } from "grammy";
import { upsertUser } from "../db/users";
import { langFromTelegram } from "../messages";
import type { BotContext } from "../types";

/** Middleware: register the sender (Spec 6.1) and set ctx.lang. */
export async function registerUser(ctx: BotContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  const defaultLang = langFromTelegram(from?.language_code);
  ctx.lang = defaultLang;
  if (from && !from.is_bot && ctx.chat?.type === "private") {
    ctx.lang = await upsertUser(ctx.env.DB, {
      id: from.id,
      firstName: from.first_name,
      defaultLang,
    });
  }
  await next();
}
