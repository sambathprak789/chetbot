import { InlineKeyboard } from "grammy";
import { deleteUser } from "../db/stats";
import { deleteTexts } from "../messages";
import type { BotContext } from "../types";
import { encodeAction } from "../utils/callback";

/** /deletemydata → ask first, because it cannot be undone (Spec 6.3). */
export async function handleDeleteMyData(ctx: BotContext): Promise<void> {
  const lang = ctx.lang;
  await ctx.reply(deleteTexts.confirm[lang], {
    reply_markup: new InlineKeyboard()
      .text(deleteTexts.yes[lang], encodeAction({ type: "delete", confirm: true }))
      .text(deleteTexts.no[lang], encodeAction({ type: "delete", confirm: false })),
  });
}

/** Button answer. The user row, requests and recommendations are removed (cascade). */
export async function handleDeleteChoice(ctx: BotContext, confirm: boolean): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const lang = ctx.lang;
  await ctx.answerCallbackQuery();
  if (!confirm) {
    await ctx.editMessageText(deleteTexts.cancelled[lang]).catch(() => {});
    return;
  }
  await deleteUser(ctx.env.DB, from.id);
  console.log("user data deleted"); // no id in logs
  await ctx.editMessageText(deleteTexts.done[lang]).catch(() => {});
}
