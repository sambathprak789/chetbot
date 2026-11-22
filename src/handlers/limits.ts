import { limitTexts, type Lang } from "../messages";
import { useSlot, type UserSlot } from "../services/limits";
import type { BotContext } from "../types";

/**
 * Daily limit + cooldown for a new feeling (Spec 6.4).
 * Returns the slot (call slot.refund() if we fail on our side), or null after telling the user why not.
 */
export async function takeSlotOrReply(
  ctx: BotContext,
  userId: number,
  lang: Lang,
): Promise<UserSlot | null> {
  const slot = await useSlot(ctx.env, userId);
  const r = slot.result;
  if (r.ok) return slot;
  if (r.reason === "limit")
    await ctx.reply(limitTexts.daily(Number(ctx.env.DAILY_USER_LIMIT))[lang]);
  else await ctx.reply(limitTexts.cooldown(r.waitSeconds)[lang]);
  return null;
}

/** Same check for 🔄 / language buttons: the answer is a small popup (toast). */
export async function takeSlotOrToast(
  ctx: BotContext,
  userId: number,
  lang: Lang,
): Promise<UserSlot | null> {
  const slot = await useSlot(ctx.env, userId);
  const r = slot.result;
  if (r.ok) return slot;
  const text =
    r.reason === "limit"
      ? limitTexts.daily(Number(ctx.env.DAILY_USER_LIMIT))[lang]
      : limitTexts.cooldown(r.waitSeconds)[lang];
  await ctx.answerCallbackQuery({ text, show_alert: r.reason === "limit" });
  return null;
}
