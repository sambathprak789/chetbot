import { InlineKeyboard } from "grammy";
import { getRequest, listRecommendations, setBatchFeedback } from "../db/requests";
import { buttonTexts, errors, moreSongsResult, type Lang } from "../messages";
import { GeminiError } from "../services/gemini";
import { RefreshError, refreshSongs } from "../services/refresh";
import type { BotContext } from "../types";
import { decodeAction, encodeAction } from "../utils/callback";

/** 👍 👎 🔄 under every result (Spec 3.2: one row). 🔄 is hidden when no refresh is left. */
export function resultKeyboard(
  requestId: number,
  batch: number,
  refreshesLeft: number,
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("👍", encodeAction({ type: "like", requestId, batch }))
    .text("👎", encodeAction({ type: "dislike", requestId, batch }));
  if (refreshesLeft > 0) kb.text("🔄", encodeAction({ type: "more", requestId }));
  return kb;
}

function languageKeyboard(lang: Lang, requestId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(buttonTexts.khmer[lang], encodeAction({ type: "lang", language: "km", requestId }))
    .text(buttonTexts.english[lang], encodeAction({ type: "lang", language: "en", requestId }));
}

const html = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

/** Flow C (Spec 2.3). */
export async function handleButton(ctx: BotContext): Promise<void> {
  const from = ctx.from;
  const msg = ctx.callbackQuery?.message;
  const action = decodeAction(ctx.callbackQuery?.data);
  if (!from || !msg || !action) {
    await ctx.answerCallbackQuery();
    return;
  }

  const request = await getRequest(ctx.env.DB, action.requestId);
  if (!request || request.user_id !== from.id) {
    await ctx.answerCallbackQuery({ text: buttonTexts.expired[ctx.lang] });
    return;
  }
  const lang = request.language;
  const maxRefresh = Number(ctx.env.MAX_REFRESH);

  // 👍 — record, thank, keep only 🔄
  if (action.type === "like") {
    await setBatchFeedback(ctx.env.DB, request.id, action.batch, "like");
    await ctx.answerCallbackQuery({ text: buttonTexts.thanks[lang] });
    const shown = await listRecommendations(ctx.env.DB, request.id);
    const lastBatch = shown.reduce((m, r) => Math.max(m, r.batch), 0);
    const left = maxRefresh - (lastBatch - 1);
    const kb = new InlineKeyboard();
    if (left > 0) kb.text("🔄", encodeAction({ type: "more", requestId: request.id }));
    await ctx.editMessageReplyMarkup({ reply_markup: kb }).catch(() => {});
    return;
  }

  // 👎 — record, remove buttons, ask Khmer or English
  if (action.type === "dislike") {
    await setBatchFeedback(ctx.env.DB, request.id, action.batch, "dislike");
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    await ctx.reply(buttonTexts.askLanguage[lang], {
      reply_markup: languageKeyboard(lang, request.id),
    });
    return;
  }

  // 🔄 or language choice — new batch
  await ctx.answerCallbackQuery();
  let statusChatId: number;
  let statusMessageId: number;
  if (action.type === "lang") {
    // turn the language question into the result
    statusChatId = msg.chat.id;
    statusMessageId = msg.message_id;
    await ctx.editMessageText(buttonTexts.searching[lang]).catch(() => {});
  } else {
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    const status = await ctx.reply(buttonTexts.searching[lang]);
    statusChatId = status.chat.id;
    statusMessageId = status.message_id;
  }
  const edit = (text: string, extra: object = {}) =>
    ctx.api.editMessageText(statusChatId, statusMessageId, text, extra).catch(() => {});

  try {
    const r = await refreshSongs(
      ctx.env,
      from.id,
      request.id,
      action.type === "lang" ? action.language : undefined,
    );
    await edit(moreSongsResult(lang, r.songs), {
      ...html,
      reply_markup: resultKeyboard(request.id, r.batch, r.refreshesLeft),
    });
  } catch (err) {
    if (err instanceof RefreshError) {
      await edit(err.reason === "noSongs" ? buttonTexts.noSongs[lang] : buttonTexts.limit[lang]);
      return;
    }
    console.error("refresh failed", { error: String(err) });
    await edit(err instanceof GeminiError && err.isQuota ? errors.busy[lang] : errors.failed[lang]);
  }
}
